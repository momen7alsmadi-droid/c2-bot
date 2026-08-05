/**
 * =========================================================
 *  handlers/ticketAutoClose.js
 * =========================================================
 * الصيانة التلقائية للتذاكر (تُشغَّل كفاصل زمني عند إقلاع البوت):
 *
 *   1. الإغلاق التلقائي للخمول:
 *        - بعد autoCloseIdleHours ساعة بلا أي رسالة → تنبيه في التكت
 *        - إن استمر الخمول autoCloseGraceHours إضافية → تنفيذ الإجراء:
 *            autoCloseAction = 'lock'  → قفل التذكرة (رسالة إغلاق + فتح/حذف)
 *            autoCloseAction = 'delete' → حذف نهائي بعد عد تنازلي قابل للإلغاء
 *
 *   2. مهلة رد الستاف (SLA):
 *        - إذا استلم ستاف تذكرة ولم يحدث أي نشاط خلال claimSlaMinutes دقيقة
 *          → إلغاء الاستلام تلقائياً + تنبيه (يتيح للآخرين التقاطها)
 *
 * كل إجراء تلقائي من البوت يُسجَّل في:
 *   - سجل أحداث التذكرة (auditLog) → يظهر في أرشيف اللوق
 *   - روم اللوق الخاص بالبنل (رسالة "🤖 إجراء تلقائي من البوت")
 *
 * ملاحظة: التذاكر المقفلة لا تُعالج (حالتها نهائية بانتظار فتح/حذف يدوي).
 * =========================================================
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPanelByName } = require('../database/panelsDB');
const { getTicketSettings } = require('../database/ticketSettingsDB');
const { getAllSessions, updateSession, addAuditLog } = require('./ticketStore');
const { commitTicketStats } = require('../database/ticketStatsStore');
const { reportError } = require('../../src/utils/errorLogger');

let maintenanceTimer = null;

/** الفاصل الزمني بين كل فحص وآخر (ثانية واحدة هنا لتكون فورية بعد الإعدادات) */
const CHECK_INTERVAL_MS = 60000;

/**
 * تشغيل حلقة الصيانة التلقائية (تُستدعى من ملف التشغيل عند الجاهزية)
 * @param {import('discord.js').Client} client
 */
function startTicketMaintenance(client) {
    if (maintenanceTimer) clearInterval(maintenanceTimer);
    maintenanceTimer = setInterval(() => runTicketMaintenance(client).catch(() => {}), CHECK_INTERVAL_MS);
    console.log(`🤖 بدأت الصيانة التلقائية للتذاكر (فحص كل ${CHECK_INTERVAL_MS / 1000} ثانية)`);
}

// =========================================================
// الفحص الدوري
// =========================================================
async function runTicketMaintenance(client) {
    const settings = getTicketSettings();
    const now = Date.now();

    for (const session of getAllSessions()) {
        try {
            const channel = await client.channels.fetch(session.channelId).catch(() => null);
            if (!channel) continue;
            const panel = getPanelByName(session.panelName);
            if (!panel) continue;

            // ---------- التذاكر المقفلة: تنظيف تلقائي (إن فُعّل) ----------
            if (session.lockedAt) {
                if (settings.autoPurgeLockedDays > 0 && now - session.lockedAt >= settings.autoPurgeLockedDays * 86400000) {
                    await autoDelete(client, channel, panel, session, settings, 'purge');
                }
                continue;
            }

            // ---------- مهلة رد الستاف (SLA) ----------
            if (settings.claimSlaMinutes > 0 && session.claimedBy) {
                const lastActivity = Math.max(
                    session.claimedAt || session.openedAt || 0,
                    session.lastActivityAt || session.openedAt || 0
                );
                if (now - lastActivity >= settings.claimSlaMinutes * 60000) {
                    await autoUnclaim(client, channel, panel, session);
                    continue;
                }
            }

            // ---------- الإغلاق التلقائي للخمول ----------
            if (settings.autoCloseEnabled && settings.autoCloseIdleHours > 0) {
                const lastActivity = session.lastActivityAt || session.openedAt || 0;
                const idleMs = now - lastActivity;
                const warnAtMs = settings.autoCloseIdleHours * 3600000;
                const execAtMs = warnAtMs + Math.max(0, settings.autoCloseGraceHours) * 3600000;

                if (idleMs >= execAtMs) {
                    if (settings.autoCloseAction === 'delete') {
                        await autoDelete(client, channel, panel, session, settings);
                    } else {
                        await autoLock(client, channel, panel, session);
                    }
                    continue;
                }

                if (idleMs >= warnAtMs && !session.idleWarningSent) {
                    await sendIdleWarning(channel, panel, session);
                }
            }

            // ---------- حد عمر التذكرة (حتى مع وجود رسائل) ----------
            if (settings.maxTicketAgeHours > 0) {
                const ageMs = now - (session.openedAt || 0);
                if (ageMs >= settings.maxTicketAgeHours * 3600000) {
                    if (settings.autoCloseAction === 'delete') {
                        await autoDelete(client, channel, panel, session, settings, 'age');
                    } else {
                        await autoLock(client, channel, panel, session, 'age');
                    }
                    continue;
                }
            }
        } catch (err) {
            console.error('[ticketMaintenance] خطأ في معالجة جلسة:', err.message);
            reportError('TICKET_MAINTENANCE', session?.channelId || '?', err);
        }
    }
}

// =========================================================
// إجراءات البوت التلقائية
// =========================================================

/**
 * قفل التذكرة تلقائياً (إجراء الخمول = lock)
 * @param {String} reason - سبب الإغلاق: 'idle' (خمول) | 'age' (حد العمر)
 */
async function autoLock(client, channel, panel, session, reason = 'idle') {
    const { applyLockPermissions } = require('./ticketPermissionHelpers');
    const { sendClosedStateMessage } = require('./ticketCloseHandler');
    const { buildTicketControlRows } = require('./ticketControlBuilder');

    const TEXTS = {
        idle: {
            audit: '🤖 تم قفل التذكرة تلقائياً بسبب الخمول (بواسطة البوت)',
            desc: 'لم يحدث أي نشاط في هذه التذكرة منذ مدة، فقام **البوت** بقفلها تلقائياً.\nيمكنك فتحها أو حذفها من الأزرار أدناه.',
            log: 'قام البوت بقفل التذكرة تلقائياً بسبب الخمول.',
        },
        age: {
            audit: '🤖 تم قفل التذكرة تلقائياً لتجاوز حد العمر (بواسطة البوت)',
            desc: 'تجاوزت هذه التذكرة الحد الأقصى لعمرها المفتوح، فقام **البوت** بقفلها تلقائياً.\nيمكنك فتحها أو حذفها من الأزرار أدناه.',
            log: 'قام البوت بقفل التذكرة تلقائياً لتجاوز حد العمر المحدد.',
        },
    };
    const t = TEXTS[reason] || TEXTS.idle;

    await applyLockPermissions(channel, panel, session);
    const updated = updateSession(session.channelId, { lockedAt: Date.now() });
    addAuditLog(session.channelId, t.audit);
    // التزام إحصائيات التذكرة (رسائل + استلام + نقطة إغلاق + سرعة الاستلام)
    commitTicketStats(updated);

    // تحديث رسالة التحكم الرئيسية
    if (updated.controlMessageId) {
        const msg = await channel.messages.fetch(updated.controlMessageId).catch(() => null);
        if (msg) await msg.edit({ components: buildTicketControlRows(updated, true) }).catch(() => {});
    }

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('🔒 تم قفل التذكرة تلقائياً')
                .setDescription(t.desc)
                .setFooter({ text: '🤖 إجراء تلقائي من البوت' })
                .setTimestamp(),
        ],
    }).catch(() => {});

    // رسالة الإغلاق (زر فتح + زر حذف)
    await sendClosedStateMessage(channel);

    await sendBotLog(client, channel, panel, session, '🔒 قفل تلقائي', t.log);
}

/**
 * حذف التذكرة نهائياً تلقائياً (إجراء الخمول = delete أو تنظيف المقفلات):
 * عد تنازلي قابل للإلغاء (مدة من الإعدادات) ثم أرشفة وحذف نهائي
 * @param {String} reason - 'idle' (خمول) | 'age' (حد العمر) | 'purge' (تنظيف مقفلات)
 */
async function autoDelete(client, channel, panel, session, settings, reason = 'idle') {
    const TEXTS = {
        idle: {
            audit: '🤖 بدء الحذف التلقائي للتذكرة (الخمول) — بواسطة البوت',
            desc: 'لم يحدث أي نشاط في هذه التذكرة منذ مدة، فسيقوم **البوت** بحذفها نهائياً.\nاضغط [إلغاء الحذف] إذا أردت إبقاءها.',
            log: 'قام البوت بحذف التذكرة نهائياً بسبب الخمول (بعد عد تنازلي).',
        },
        age: {
            audit: '🤖 بدء الحذف التلقائي للتذكرة (تجاوز حد العمر) — بواسطة البوت',
            desc: 'تجاوزت هذه التذكرة الحد الأقصى لعمرها المفتوح، فسيقوم **البوت** بحذفها نهائياً.\nاضغط [إلغاء الحذف] إذا أردت إبقاءها.',
            log: 'قام البوت بحذف التذكرة نهائياً لتجاوز حد العمر (بعد عد تنازلي).',
        },
        purge: {
            audit: '🤖 بدء الحذف التلقائي للتذكرة المقفلة (تنظيف) — بواسطة البوت',
            desc: 'مضى على قفل هذه التذكرة مدة طويلة، فسيقوم **البوت** بحذفها نهائياً (تنظيف تلقائي).\nاضغط [إلغاء الحذف] إذا أردت إبقاءها.',
            log: 'حذف البوت تذكرة مقفلة منذ مدة طويلة (تنظيف تلقائي).',
        },
    };
    const t = TEXTS[reason] || TEXTS.idle;

    addAuditLog(session.channelId, t.audit);
    updateSession(session.channelId, { deletedBy: 'AUTO' });

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle(reason === 'purge' ? '🗑️ تنظيف تلقائي' : '🗑️ حذف تلقائي')
                .setDescription(t.desc)
                .setFooter({ text: '🤖 إجراء تلقائي من البوت' })
                .setTimestamp(),
        ],
    }).catch(() => {});

    // رسالة العد التنازلي (قابلة للإلغاء عبر زر ticket_delete_cancel)
    const secondsTotal = Math.max(3, Math.min(60, settings.deleteCountdownSeconds || 10));
    let secondsLeft = secondsTotal;

    const countdownMessage = await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('🗑️ جارِ حذف التذكرة تلقائياً...')
                .setDescription(`سيتم حذف هذه التذكرة نهائياً خلال **${secondsLeft}** ثانية.\nاضغط [إلغاء الحذف] للتراجع.`)
                .setTimestamp(),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_delete_cancel')
                    .setLabel('إلغاء الحذف')
                    .setEmoji('✋')
                    .setStyle(ButtonStyle.Secondary)
            ),
        ],
    }).catch(() => null);

    const timer = setInterval(async () => {
        secondsLeft -= 1;
        if (secondsLeft <= 0) {
            clearInterval(timer);
            updateSession(session.channelId, { deleteTimer: null, deleteCountdown: 0 });
            const { finalizeTicketDeletion } = require('./transcriptLogger');
            await finalizeTicketDeletion(channel, panel).catch(err =>
                console.error('[ticketAutoClose] فشل أرشفة/حذف التذكرة التلقائي:', err)
            );
            return;
        }
        if (countdownMessage) {
            await countdownMessage
                .edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xed4245)
                            .setTitle('🗑️ جارِ حذف التذكرة تلقائياً...')
                            .setDescription(`سيتم حذف هذه التذكرة نهائياً خلال **${secondsLeft}** ثانية.\nاضغط [إلغاء الحذف] للتراجع.`)
                            .setTimestamp(),
                    ],
                })
                .catch(() => {
                    clearInterval(timer); // الرسالة حُذفت/تعديلها فشل → نتوقف بأمان
                });
        }
    }, 1000);

    updateSession(session.channelId, { deleteTimer: timer, deleteCountdown: secondsLeft });
    await sendBotLog(client, channel, panel, session, reason === 'purge' ? '🗑️ تنظيف تلقائي' : '🗑️ حذف تلقائي', t.log);
}

/**
 * إلغاء استلام تلقائي عند انتهاء مهلة رد الستاف (SLA)
 */
async function autoUnclaim(client, channel, panel, session) {
    const { revertClaimPermissions } = require('./ticketPermissionHelpers');
    const { buildTicketControlRows } = require('./ticketControlBuilder');

    const previousClaimer = session.claimedBy;
    await revertClaimPermissions(channel, panel, previousClaimer, session.openerId);
    const updated = updateSession(session.channelId, { claimedBy: null, claimedAt: null });
    addAuditLog(session.channelId, '🤖 تم إلغاء استلام التذكرة تلقائياً لعدم الرد (مهلة الستاف)');

    if (updated.controlMessageId) {
        const msg = await channel.messages.fetch(updated.controlMessageId).catch(() => null);
        if (msg) await msg.edit({ components: buildTicketControlRows(updated, !!updated.lockedAt) }).catch(() => {});
    }

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('↩️ إلغاء استلام تلقائي')
                .setDescription(
                    `لم يرد <@${previousClaimer}> خلال المدة المسموحة، فألغى **البوت** استلامه تلقائياً.\nيمكن لأي ستاف استلام التذكرة الآن.`
                )
                .setFooter({ text: '🤖 إجراء تلقائي من البوت' })
                .setTimestamp(),
        ],
    }).catch(() => {});

    await sendBotLog(client, channel, panel, session, '↩️ إلغاء استلام تلقائي', `ألغى البوت استلام <@${previousClaimer}> لعدم الرد خلال مهلة الستاف.`);
}

// =========================================================
// مساعدات
// =========================================================

/** تنبيه الخمول داخل التكت (يُرسل مرة واحدة فقط) */
async function sendIdleWarning(channel, panel, session) {
    const settings = getTicketSettings();
    updateSession(session.channelId, { idleWarningSent: true });

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(0xfee75c)
                .setTitle('⏳ تنبيه: خمول التذكرة')
                .setDescription(
                    `لم يحدث أي نشاط في هذه التذكرة منذ **${settings.autoCloseIdleHours} ساعة**.\n` +
                    `إن استمر الخمول **${settings.autoCloseGraceHours} ساعة** إضافية سيقوم البوت ${
                        settings.autoCloseAction === 'delete' ? 'بحذفها نهائياً 🗑️' : 'بقفلها 🔒'
                    }.\nأرسل رسالة لإبقائها نشطة.`
                )
                .setFooter({ text: '🤖 إجراء تلقائي من البوت' })
                .setTimestamp(),
        ],
    }).catch(() => {});

    await sendBotLog(
        null,
        channel,
        panel,
        session,
        '⏳ تنبيه خمول',
        `نبه البوت إلى خمول التذكرة (${settings.autoCloseIdleHours} ساعة) — سيتم ${settings.autoCloseAction === 'delete' ? 'الحذف' : 'القفل'} بعد ${settings.autoCloseGraceHours} ساعة إضافية.`
    );
}

/** إرسال رسالة إجراء تلقائي لروم اللوق الخاص بالبنل */
async function sendBotLog(client, channel, panel, session, title, description) {
    if (!panel.logChannelId) return;
    try {
        const logChannel = await channel.guild.channels.fetch(panel.logChannelId).catch(() => null);
        if (!logChannel) return;
        await logChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle(title)
                    .setDescription(
                        `${description}\n🎫 التذكرة: ${channel.name} (<#${channel.id}>)\n👤 صاحبها: <@${session.openerId}>` +
                        (session.claimedBy ? `\n👥 مستلمها: <@${session.claimedBy}>` : '')
                    )
                    .setFooter({ text: '🤖 إجراء تلقائي من البوت' })
                    .setTimestamp(),
            ],
        }).catch(() => {});
    } catch (err) {
        console.error('[ticketAutoClose] فشل إرسال لوق الإجراء التلقائي:', err.message);
    }
}

module.exports = { startTicketMaintenance };

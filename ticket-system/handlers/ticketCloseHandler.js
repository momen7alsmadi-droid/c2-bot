/**
 * =========================================================
 *  handlers/ticketCloseHandler.js
 * =========================================================
 * كل ما يخص "مرحلة الإغلاق" بعد قفل التذكرة:
 *   1. إرسال رسالة إغلاق منفصلة (Embed + زر فتح + زر حذف).
 *   2. زر [حذف] لا يحذف فوراً -> يبدأ عداً تنازلياً 10 ثوانٍ
 *      مع زر [إلغاء الحذف]، وعند اكتمال العد يتم استدعاء
 *      transcriptLogger لأرشفة التذكرة ثم حذف القناة فعلياً.
 *   3. زر [فتح] يعيد التذكرة لحالتها الطبيعية (يعيد صلاحيات
 *      الإرسال ويحدّث رسالة التحكم الرئيسية).
 *
 * ⚠️ لماذا عبر setInterval وليس عبر update() متكرر على نفس الـ
 * interaction؟ لأن كل Interaction في ديسكورد يمكن الرد عليه/
 * تعديله مرة واحدة فقط بشكل مباشر (عبر update/reply)، بينما
 * التحديثات اللاحقة كل ثانية تتطلب تعديل كائن الرسالة (Message)
 * نفسه مباشرة عبر message.edit()، وهو ما نخزّن مرجعه محلياً هنا.
 * =========================================================
 */

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const { getPanelByName } = require('../database/panelsDB');
const { reportError } = require('../../src/utils/errorLogger');
const { safeDeferUpdate } = require('../utils/interactionGuard');
const { getSession, updateSession, addAuditLog } = require('./ticketStore');
const { getTicketSettings } = require('../database/ticketSettingsDB');
const { canUseRestrictedControls } = require('./permissionUtils');
const { applyUnlockPermissions } = require('./ticketPermissionHelpers');
const { buildTicketControlRows } = require('./ticketControlBuilder');
const { sendActionMessage } = require('../utils/actionMessages');
const { enrichActionContext } = require('../utils/ticketContext');

/**
 * بناء إيمبد ومكونات "حالة الإغلاق" العادية (قبل بدء عد الحذف)
 */
function buildClosedStateView() {
    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🔒 تم قفل التذكرة')
        .setDescription('يمكنك إعادة فتح التذكرة، أو حذفها نهائياً.')
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_reopen').setLabel('فتح').setEmoji('🔓').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_delete_confirm').setLabel('حذف').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row] };
}

/**
 * بناء إيمبد ومكونات "العد التنازلي للحذف"
 * @param {Number} secondsLeft
 */
function buildDeleteCountdownView(secondsLeft) {
    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🗑️ جارِ حذف التذكرة...')
        .setDescription(`سيتم حذف هذه التذكرة نهائياً خلال **${secondsLeft}** ثانية.\nاضغط [إلغاء الحذف] للتراجع.`)
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_delete_cancel').setLabel('إلغاء الحذف').setEmoji('✋').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

/**
 * إرسال رسالة الإغلاق المنفصلة في آخر التذكرة (تُستدعى من ticketControlHandler عند القفل)
 * @param {import('discord.js').TextChannel} channel
 */
async function sendClosedStateMessage(channel) {
    const view = buildClosedStateView();
    const message = await channel.send(view);
    updateSession(channel.id, { closeMessageId: message.id });
    return message;
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleTicketCloseButton(interaction) {
    const RELEVANT_IDS = ['ticket_reopen', 'ticket_delete_confirm', 'ticket_delete_cancel'];
    if (!RELEVANT_IDS.includes(interaction.customId)) return;

    try {
        const session = getSession(interaction.channel.id);
        if (!session) {
            await interaction.reply({ content: '⚠️ هذا الروم ليس تذكرة فعّالة.', ephemeral: true });
            return;
        }

        const panel = getPanelByName(session.panelName);
        if (!panel) {
            await interaction.reply({ content: '⚠️ لم يتم العثور على إعدادات البنل الخاص بهذه التذكرة.', ephemeral: true });
            return;
        }

        const allowed = canUseRestrictedControls(interaction.member, session, panel);
        if (!allowed) {
            await interaction.reply({
                content: '❌ فقط المستلم الحالي أو الإدارة العليا يمكنهم التحكم بإغلاق/حذف هذه التذكرة.',
                ephemeral: true,
            });
            return;
        }

        // ---------------------------------------------------
        // زر [فتح] -> إعادة التذكرة لحالتها الطبيعية
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_reopen') {
            if (!(await safeDeferUpdate(interaction))) return;

            await applyUnlockPermissions(interaction.channel, panel, session);
            const updated = updateSession(interaction.channel.id, { lockedAt: null });

            // حذف رسالة الإغلاق نفسها بما أنها لم تعد مطلوبة
            await interaction.message.delete().catch(() => {});

            // تحديث رسالة التحكم الرئيسية لإعادة تفعيل زر الاستلام
            if (updated.controlMessageId) {
                const controlMessage = await interaction.channel.messages.fetch(updated.controlMessageId).catch(() => null);
                if (controlMessage) {
                    const rows = buildTicketControlRows(updated, false);
                    await controlMessage.edit({ components: rows }).catch(() => {});
                }
            }

            // رسالة "فتح التذكرة"
            await sendActionMessage(
                interaction.channel,
                panel,
                'reopen',
                await enrichActionContext(interaction, {
                    member: interaction.member,
                    guild: interaction.guild,
                    channelName: interaction.channel.name,
                    channelId: interaction.channel.id,
                })
            );
            return;
        }

        // ---------------------------------------------------
        // زر [حذف] -> بدء العد التنازلي (10 ثوانٍ)
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_delete_confirm') {
            if (!(await safeDeferUpdate(interaction))) return;

            // تسجيل من طلب الحذف (يظهر في لوق الأرشيف) + سجل الأحداث
            updateSession(interaction.channel.id, { deletedBy: interaction.member.id });
            addAuditLog(interaction.channel.id, `<@${interaction.member.id}> قام بحذف التذكرة`);

            // مدة العد التنازلي من الإعدادات العامة (افتراضياً 10 ثوانٍ)
            let secondsLeft = Math.max(3, Math.min(60, getTicketSettings().deleteCountdownSeconds || 10));
            const message = interaction.message; // مرجع الرسالة لتعديلها كل ثانية

            await message.edit(buildDeleteCountdownView(secondsLeft)).catch(() => {});

            const timer = setInterval(async () => {
                secondsLeft -= 1;

                if (secondsLeft <= 0) {
                    clearInterval(timer);

                    // نستدعي منطق الأرشفة والحذف الفعلي (transcript + log + delete channel)
                    // بشكل منفصل حتى لا يتضخم هذا الملف بمنطق لا يخصه
                    const { finalizeTicketDeletion } = require('./transcriptLogger');

                    // رسالة "حذف التذكرة" قبل الحذف الفعلي (تظهر في الأرشيف)
                    await sendActionMessage(
                        interaction.channel,
                        panel,
                        'delete',
                        await enrichActionContext(interaction, {
                            member: interaction.member,
                            guild: interaction.guild,
                            channelName: interaction.channel.name,
                            channelId: interaction.channel.id,
                        })
                    );

                    await finalizeTicketDeletion(interaction.channel, panel).catch(err =>
                        console.error('[ticketCloseHandler] فشل في إتمام أرشفة/حذف التذكرة:', err)
                    );
                    return;
                }

                await message.edit(buildDeleteCountdownView(secondsLeft)).catch(() => {
                    clearInterval(timer); // إذا فشل التعديل (مثلاً الرسالة حُذفت يدوياً)، نوقف العداد بأمان
                });
            }, 1000);

            updateSession(interaction.channel.id, { deleteTimer: timer, deleteCountdown: secondsLeft });
            return;
        }

        // ---------------------------------------------------
        // زر [إلغاء الحذف] -> إيقاف العداد والعودة لحالة الإغلاق العادية
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_delete_cancel') {
            if (!(await safeDeferUpdate(interaction))) return;

            if (session.deleteTimer) clearInterval(session.deleteTimer);
            updateSession(interaction.channel.id, { deleteTimer: null, deleteCountdown: 0, deletedBy: null });

            // إن كانت التذكرة مقفلة → نعود لحالة الإغلاق (فتح/حذف)
            // وإن لم تكن مقفلة (حذف تلقائي من البوت) → نؤكد الإلغاء فقط
            if (session.lockedAt) {
                await interaction.message.edit(buildClosedStateView()).catch(() => {});
            } else {
                await interaction.message
                    .edit({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71)
                                .setTitle('✅ تم إلغاء الحذف التلقائي')
                                .setDescription('بقيت التذكرة مفتوحة — لن يحذفها البوت.')
                                .setTimestamp(),
                        ],
                        components: [],
                    })
                    .catch(() => {});
            }
            return;
        }
    } catch (error) {
        console.error('[ticketCloseHandler] حدث خطأ:', error);
        reportError('TICKET_CLOSE', interaction.customId || '?', error);
        const payload = { content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
}

module.exports = { sendClosedStateMessage, handleTicketCloseButton };

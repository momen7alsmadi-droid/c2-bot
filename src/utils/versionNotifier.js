/**
 * =========================================================
 *  src/utils/versionNotifier.js
 * =========================================================
 * نظام إشعارات التحديث — يُشغَّل عند كل إقلاع للبوت:
 *
 *   1) يقرأ الإصدار الحالي (package.json) ويقارنه مع آخر إصدار
 *      تم الإشعار عنه.
 *   2) إن تغيّر الإصدار:
 *        - يُرسل إلى روم الإشعارات (updateChannelId — مع بديل
 *          روم الأخطاء errorLogChannelId) إيمبد ملخص كامل لكل
 *          ما تم تعديله وإضافته (من سجل التغييرات changelog.js).
 *        - ثم رسالة منفصلة في إيمبد آخر:
 *          "✅ تم تحديث البوت من v(القديم) إلى v(الجديد) بنجاح".
 *
 * تخزين "آخر إصدار مُبلَّغ" (حتى لا يتكرر الإشعار ولا يُفقد):
 *   1) 🎯 علامة ديسكورد: رسالة صغيرة في روم الإشعارات نفسه
 *      (📦 آخر إصدار مُبلَّغ: vX.Y.Z) تُحدَّث مع كل إشعار —
 *      تنجو من مسح القرص المؤقت عند إعادة النشر (Railway)
 *      حتى بدون MongoDB.
 *   2) 🗄️ MongoDB إن كان متصلاً (كتابة موازية).
 *   3) 💾 ملف محلي احتياطي.
 *
 * أول تشغيل (لا توجد علامة): يُرسل ملخص التاريخ الكامل +
 * تأكيد "تم تحديث البوت إلى vX" ثم يُنشئ العلامة — من بعدها
 * يصل كل تحديث قادم بصيغة "من v(القديم) إلى v(الجديد)".
 * =========================================================
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EmbedBuilder } = require('discord.js');
const { getConfig } = require('./storage');
const CHANGELOG = require('./changelog');

const STATE_PATH = path.join(__dirname, '..', '..', 'data', 'last-notified-version.json');
const COLOR_MAIN = 0x5865F2;
const COLOR_SUCCESS = 0x2ECC71;

// علامة الديسكورد: رسالة صغيرة في روم الإشعارات تحمل آخر إصدار مُبلَّغ
const MARKER_PREFIX = '📦 آخر إصدار مُبلَّغ: v';

// ---------- قراءة الإصدارات ----------

function readCurrentVersion() {
    try {
        return require('../../package.json').version;
    } catch {
        return null;
    }
}

/** تحويل إصدار نصي إلى رقم قابل للمقارنة (2.5.80 -> 20580) */
function parseVersion(s) {
    const m = String(s || '').match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return null;
    return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

/** تحديد روم إشعارات التحديث (مخصص أولاً، ثم روم الأخطاء) */
function getNotifyChannelId() {
    try {
        const cfg = getConfig();
        return cfg.updateChannelId || cfg.errorLogChannelId || null;
    } catch {
        return null;
    }
}

// ---------- MongoDB (احتياطي) ----------

let StateModel;
function getStateModel() {
    if (mongoose.connection.readyState !== 1) return null;
    try {
        if (!StateModel) {
            StateModel =
                mongoose.models.BotState ||
                mongoose.model(
                    'BotState',
                    new mongoose.Schema({ _id: String }, { collection: 'botstate', versionKey: false, strict: false })
                );
        }
        return StateModel;
    } catch {
        return null;
    }
}

// ---------- علامة الديسكورد ----------

/** البحث عن رسالة العلامة في الروم (آخر 20 رسالة) */
async function findMarkerMessage(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
        if (!messages) return null;
        for (const msg of messages.values()) {
            const isOwn = !msg.client ? true : msg.author?.id === msg.client?.user?.id;
            if (isOwn && String(msg.content || '').startsWith(MARKER_PREFIX)) {
                return msg;
            }
        }
    } catch {
        /* تجاهل */
    }
    return null;
}

/** قراءة آخر إصدار مُبلَّغ من العلامة */
async function readStoredFromMarker(channel) {
    const marker = await findMarkerMessage(channel);
    if (!marker) return null;
    const m = String(marker.content || '').match(new RegExp(`^${MARKER_PREFIX}([\\d.]+)`));
    return m ? m[1] : null;
}

/** إنشاء/تحديث العلامة (تُحدَّث في مكانها إن وُجدت — لا تكرار للرسائل) */
async function writeStoredToMarker(channel, version) {
    try {
        const marker = await findMarkerMessage(channel);
        if (marker) {
            await marker.edit({ content: `${MARKER_PREFIX}${version}` }).catch(() => {});
        } else {
            await channel.send({ content: `${MARKER_PREFIX}${version}` }).catch(() => {});
        }
    } catch {
        /* تجاهل */
    }
}

// ---------- قراءة/كتابة آخر إصدار (علامة ← Mongo ← ملف) ----------

async function readStoredVersion(channel) {
    // 1) علامة الديسكورد (ينجو من مسح القرص)
    if (channel) {
        const fromMarker = await readStoredFromMarker(channel);
        if (fromMarker) return fromMarker;
    }
    // 2) MongoDB
    try {
        const Model = getStateModel();
        if (Model) {
            const doc = await Model.findById('lastNotifiedVersion').lean();
            if (doc && doc.version) return doc.version;
        }
    } catch {
        /* متابعة */
    }
    // 3) الملف المحلي
    try {
        if (fs.existsSync(STATE_PATH)) {
            const d = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
            if (d && d.version) return d.version;
        }
    } catch {
        /* لا شيء */
    }
    return null;
}

async function writeStoredVersion(channel, version) {
    // 1) علامة الديسكورد
    if (channel) await writeStoredToMarker(channel, version);
    // 2) MongoDB
    try {
        const Model = getStateModel();
        if (Model) {
            await Model.updateOne({ _id: 'lastNotifiedVersion' }, { $set: { version } }, { upsert: true });
        }
    } catch {
        /* تجاهل */
    }
    // 3) الملف المحلي
    try {
        fs.writeFileSync(STATE_PATH, JSON.stringify({ version, at: Date.now() }), 'utf8');
    } catch {
        /* تجاهل */
    }
}

// ---------- بناء الإيمبدات ----------

/** ملخص التغييرات لكل إصدار أحدث من آخر إصدار معروف */
function collectChangelog(oldVersion, currentVersion) {
    const oldNum = parseVersion(oldVersion) || 0;
    const curNum = parseVersion(currentVersion) || Infinity;
    const entries = [];
    for (const [ver, data] of Object.entries(CHANGELOG)) {
        const v = parseVersion(ver);
        if (!v) continue;
        if (v > oldNum && v <= curNum) entries.push({ version: ver, ...data });
    }
    entries.sort((a, b) => parseVersion(a.version) - parseVersion(b.version));
    return entries;
}

/** إيمبد الملخص الكامل (ماذا عُدّل وماذا أُضيف) */
function buildChangelogEmbed(entries, currentVersion, title) {
    const embed = new EmbedBuilder()
        .setColor(COLOR_MAIN)
        .setTitle(title || `📦 تحديث البوت — v${currentVersion}`)
        .setDescription('إليك ملخص **كل ما تم تعديله وإضافته** في هذا التحديث:')
        .setFooter({ text: `الإصدار الحالي: v${currentVersion}` })
        .setTimestamp();

    let addedFields = 0;
    for (const e of entries) {
        if (addedFields >= 25) break; // حد ديسكورد: 25 حقلاً كحد أقصى

        const lines = [];
        if (Array.isArray(e.added) && e.added.length) {
            lines.push('✨ **إضافات:**');
            lines.push(...e.added.map(x => `• ${x}`));
        }
        if (Array.isArray(e.changed) && e.changed.length) {
            lines.push('🔧 **تعديلات:**');
            lines.push(...e.changed.map(x => `• ${x}`));
        }
        if (Array.isArray(e.fixes) && e.fixes.length) {
            lines.push('🐛 **إصلاحات:**');
            lines.push(...e.fixes.map(x => `• ${x}`));
        }
        if (!lines.length) continue;

        embed.addFields({
            name: `⬆️ الإصدار v${e.version}`,
            value: lines.join('\n').slice(0, 1024),
            inline: false,
        });
        addedFields++;
    }

    if (addedFields === 0) {
        embed.addFields({
            name: `⬆️ v${currentVersion}`,
            value: 'تم تطبيق تحديثات وتحسينات عامة.',
            inline: false,
        });
    }
    return embed;
}

/** إيمبد تأكيد نجاح التحديث (رسالة منفصلة) */
function buildUpdateSuccessEmbed(oldVersion, currentVersion) {
    return new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle('✅ تم تحديث البوت بنجاح')
        .setDescription(
            `تم تحديث البوت من **v${oldVersion}** إلى **v${currentVersion}** بنجاح 🎉\n\n` +
            `🕐 <t:${Math.floor(Date.now() / 1000)}:F>`
        )
        .setFooter({ text: `الإصدار: v${currentVersion}` })
        .setTimestamp();
}

// ---------- الدالة الرئيسية ----------

/**
 * فحص الإصدار وإرسال إشعار التحديث (يُستدعى عند جاهزية البوت)
 * @param {import('discord.js').Client} client
 */
async function notifyVersionUpdate(client) {
    try {
        const current = readCurrentVersion();
        if (!current) return;

        // روم الإشعارات (المخصص أو روم الأخطاء)
        const channelId = getNotifyChannelId();
        if (!channelId) {
            console.log('📦 إشعارات التحديث: لم يُحدد روم الإشعارات (updateChannelId) — لن يُرسل شيء');
            return;
        }
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            console.log(`📦 إشعارات التحديث: تعذر الوصول لروم ${channelId}`);
            return;
        }

        const stored = await readStoredVersion(channel);

        // أول تشغيل (لا علامة ولا سجل): أرسل التاريخ الكامل + تأكيد، ثم أنشئ العلامة
        if (!stored) {
            const entries = collectChangelog(null, current);
            if (entries.length) {
                await channel.send({ embeds: [buildChangelogEmbed(entries, current, `📦 تحديث البوت — v${current}`)] });
            }
            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLOR_SUCCESS)
                        .setTitle('✅ تم تحديث البوت بنجاح')
                        .setDescription(
                            `تم تحديث البوت إلى **v${current}** بنجاح 🎉\n\n` +
                            'من الآن سيصلك هنا ملخص كامل لكل تحديث قادم مع تأكيد النجاح (من الإصدار القديم إلى الجديد).\n\n' +
                            `🕐 <t:${Math.floor(Date.now() / 1000)}:F>`
                        )
                        .setFooter({ text: `الإصدار: v${current}` })
                        .setTimestamp(),
                ],
            });
            await writeStoredVersion(channel, current);
            console.log(`📡 تم تفعيل إشعارات التحديث (أساس: v${current}) في <#${channelId}>`);
            return;
        }

        // نفس الإصدار: لا إشعار
        if (stored === current) return;

        // 1) رسالة الملخص الكامل (ماذا عُدّل وماذا أُضيف)
        const entries = collectChangelog(stored, current);
        await channel.send({ embeds: [buildChangelogEmbed(entries, current)] });

        // 2) رسالة منفصلة: تأكيد النجاح (من القديم إلى الجديد)
        await channel.send({ embeds: [buildUpdateSuccessEmbed(stored, current)] });

        // فقط بعد نجاح الإرسال نحفظ الإصدار الجديد
        await writeStoredVersion(channel, current);
        console.log(`📦 تم إرسال إشعار التحديث v${stored} → v${current} إلى <#${channelId}>`);
    } catch (e) {
        console.error('❌ فشل إشعار التحديث:', e.message);
    }
}

module.exports = { notifyVersionUpdate, readStoredVersion };

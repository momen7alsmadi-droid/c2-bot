/**
 * =========================================================
 *  src/utils/versionNotifier.js
 * =========================================================
 * نظام إشعارات التحديث — يُشغَّل عند كل إقلاع للبوت:
 *
 *   1) يقارن الإصدار الحالي (package.json) مع آخر إصدار تم
 *      الإشعار عنه (محفوظ في MongoDB + نسخة محلية).
 *   2) إن تغيّر الإصدار:
 *        - يُرسل إلى روم الأخطاء المحدد (errorLogChannelId)
 *          إيمبد يحتوي ملخص كامل لكل ما تم تعديله وإضافته
 *          (من سجل التغييرات changelog.js).
 *        - ثم رسالة منفصلة في إيمبد آخر:
 *          "✅ تم تحديث البوت من v(القديم) إلى v(الجديد) بنجاح".
 *   3) أول تشغيل فقط: يسجّل الإصدار كأساس ويُرسل رسالة
 *      تأكيد تفعيل النظام (دون ملخص كامل لتجنّب إغراق الروم).
 *
 * ملاحظة: يُفضل ضبط MONGODB_URI — فآخر إصدار يُحفظ في MongoDB
 * ليتجاوز مسح القرص المؤقت عند إعادة النشر (Railway وغيره).
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

// ---------- تخزين آخر إصدار (MongoDB أولاً ثم ملف محلي) ----------

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

async function readStoredVersion() {
    // 1) MongoDB (ينجو من مسح القرص عند إعادة النشر)
    try {
        const Model = getStateModel();
        if (Model) {
            const doc = await Model.findById('lastNotifiedVersion').lean();
            if (doc && doc.version) return doc.version;
        }
    } catch {
        /* متابعة للملف المحلي */
    }
    // 2) الملف المحلي
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

async function writeStoredVersion(version) {
    try {
        fs.writeFileSync(STATE_PATH, JSON.stringify({ version, at: Date.now() }), 'utf8');
    } catch {
        /* تجاهل */
    }
    try {
        const Model = getStateModel();
        if (Model) {
            await Model.updateOne({ _id: 'lastNotifiedVersion' }, { $set: { version } }, { upsert: true });
        }
    } catch {
        /* تجاهل */
    }
}

// ---------- بناء الإيمبدات ----------

/**
 * ملخص التغييرات لكل إصدار أحدث من آخر إصدار معروف
 * @param {String} oldVersion
 * @param {String} currentVersion
 * @returns {Array<{version:String, added?:[], changed?:[], fixes?:[]}>}
 */
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
function buildChangelogEmbed(entries, currentVersion) {
    const embed = new EmbedBuilder()
        .setColor(COLOR_MAIN)
        .setTitle(`📦 تحديث البوت — v${currentVersion}`)
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

    // إن لم يوجد أي تفاصيل (إصدارات بلا سجل) نضيف سطراً عاماً
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

/** إيمبد أول تشغيل (تأكيد تفعيل النظام) */
function buildFirstRunEmbed(currentVersion) {
    return new EmbedBuilder()
        .setColor(COLOR_MAIN)
        .setTitle('📡 تم تفعيل نظام إشعارات التحديث')
        .setDescription(
            `مرحباً! 👋\n\nتم تسجيل **v${currentVersion}** كأساس للنظام.\n` +
            'من الآن، عند كل تحديث للبوت سيصلك هنا ملخص كامل لكل ما تم تعديله وإضافته، ' +
            'مع رسالة تأكيد منفصلة بنجاح التحديث.\n\n' +
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

        const stored = await readStoredVersion();

        // أول تشغيل: سجّل الإصدار وأرسل تأكيد التفعيل فقط
        if (!stored) {
            await writeStoredVersion(current);
            const channelId = (getConfig() || {}).errorLogChannelId;
            if (channelId) {
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (channel) {
                    await channel.send({ embeds: [buildFirstRunEmbed(current)] });
                    console.log(`📡 تم تفعيل إشعارات التحديث (أساس: v${current})`);
                }
            }
            return;
        }

        // نفس الإصدار: لا إشعار
        if (stored === current) return;

        const channelId = (getConfig() || {}).errorLogChannelId;
        if (!channelId) {
            console.log(`📦 تحديث v${stored} → v${current} لكن روم الأخطاء غير محدد — لن يُرسل إشعار`);
            return;
        }
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            console.log(`📦 تعذر الوصول لروم الأخطاء — لن يُرسل إشعار التحديث`);
            return;
        }

        // 1) رسالة الملخص الكامل (ماذا عُدّل وماذا أُضيف)
        const entries = collectChangelog(stored, current);
        await channel.send({ embeds: [buildChangelogEmbed(entries, current)] });

        // 2) رسالة منفصلة: تأكيد النجاح (من القديم إلى الجديد)
        await channel.send({ embeds: [buildUpdateSuccessEmbed(stored, current)] });

        // فقط بعد نجاح الإرسال نحفظ الإصدار الجديد
        await writeStoredVersion(current);
        console.log(`📦 تم إرسال إشعار التحديث v${stored} → v${current} إلى روم الأخطاء`);
    } catch (e) {
        console.error('❌ فشل إشعار التحديث:', e.message);
    }
}

module.exports = { notifyVersionUpdate, readStoredVersion };

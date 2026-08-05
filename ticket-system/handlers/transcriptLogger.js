/**
 * =========================================================
 *  handlers/transcriptLogger.js
 * =========================================================
 * يُستدعى عند اكتمال العد التنازلي لحذف تذكرة (من ticketCloseHandler).
 * مسؤول عن:
 *   1. جلب كل رسائل التذكرة وحساب إحصائيات المرسلين.
 *   2. توليد ملف HTML Transcript (عبر discord-html-transcripts
 *      إن كانت مثبتة، وإلا يُستخدم مولّد HTML بسيط احتياطي حتى
 *      لا ينهار البوت في حال عدم تثبيت المكتبة بعد).
 *   3. إرسال Embed شامل + الملف المرفق لروم اللوق المحدد بالبنل.
 *   4. حذف قناة التذكرة ومسح جلستها من الذاكرة.
 *
 * لتثبيت المكتبة المُستخدمة للترانسكربت الكامل:
 *   npm install discord-html-transcripts
 * =========================================================
 */

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { reportError } = require('../../src/utils/errorLogger');
const { getSession, deleteSession } = require('./ticketStore');
const { getTicketSettings } = require('../database/ticketSettingsDB');

const MAX_MESSAGES_TO_FETCH = 1000; // سقف احترازي لتجنب حلقة جلب لا نهائية في تذاكر ضخمة جداً

/**
 * جلب كل رسائل القناة (Pagination عبر `before`) حتى سقف معيّن
 * @param {import('discord.js').TextChannel} channel
 * @returns {Promise<import('discord.js').Message[]>} من الأقدم إلى الأحدث
 */
async function fetchAllMessages(channel) {
    let allMessages = [];
    let lastId = null;

    while (allMessages.length < MAX_MESSAGES_TO_FETCH) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const batch = await channel.messages.fetch(options);
        if (batch.size === 0) break;

        allMessages = allMessages.concat(Array.from(batch.values()));
        lastId = batch.last().id;

        if (batch.size < 100) break; // وصلنا لبداية القناة
    }

    // ديسكورد يعيدها من الأحدث للأقدم، نعكسها لتصبح بالترتيب الزمني الصحيح
    return allMessages.reverse();
}

/**
 * حساب عدد الرسائل لكل عضو (بشري فقط، بدون رسائل البوت)
 * @param {import('discord.js').Message[]} messages
 * @returns {Map<String, { username: String, count: Number }>}
 */
function computeMessageStats(messages) {
    const stats = new Map();

    for (const msg of messages) {
        if (msg.author.bot) continue; // لا نحسب رسائل البوت (الإيمبدات/رسائل التحكم)

        const existing = stats.get(msg.author.id);
        if (existing) {
            existing.count += 1;
        } else {
            stats.set(msg.author.id, { username: msg.author.tag, count: 1 });
        }
    }

    return stats;
}

/**
 * تحويل خريطة الإحصائيات إلى نص جاهز لعرضه في حقل الإيمبد
 * @param {Map<String, { username: String, count: Number }>} stats
 */
function formatMessageStatsField(stats) {
    if (stats.size === 0) return 'لم يتحدث أحد في هذه التذكرة.';

    const sorted = [...stats.entries()].sort((a, b) => b[1].count - a[1].count);
    const lines = sorted.map(([userId, data]) => `**${data.username}** (<@${userId}>) — ${data.count} رسالة`);

    // نحترم الحد الأقصى لحقل الإيمبد في ديسكورد (1024 حرف)
    let text = lines.join('\n');
    if (text.length > 1024) text = text.slice(0, 1000) + '\n... (والمزيد)';
    return text;
}

/**
 * تحويل مصفوفة سجل الأحداث المؤقت إلى نص جاهز لعرضه في حقل الإيمبد
 * @param {Array<{ text: String, timestamp: Number }>} auditLog
 */
function formatAuditLogField(auditLog) {
    if (!auditLog || auditLog.length === 0) return 'لا يوجد أحداث مسجّلة.';

    const lines = auditLog.map(entry => `<t:${Math.floor(entry.timestamp / 1000)}:T> — ${entry.text}`);

    let text = lines.join('\n');
    if (text.length > 1024) text = text.slice(0, 1000) + '\n... (والمزيد)';
    return text;
}

/**
 * تحويل الملاحظات الداخلية (🧾) إلى نص جاهز لحقل الإيمبد
 * @param {Array<{ text: String, by: String, at: Number }>} staffNotes
 */
function formatStaffNotesField(staffNotes) {
    if (!staffNotes || staffNotes.length === 0) return 'لا توجد ملاحظات داخلية.';
    const lines = staffNotes.map(n => `<t:${Math.floor(n.at / 1000)}:T> — <@${n.by}>: ${n.text}`);
    let text = lines.join('\n');
    if (text.length > 1024) text = text.slice(0, 1000) + '\n... (والمزيد)';
    return text;
}

/**
 * توليد ملف الترانسكربت. يحاول استخدام discord-html-transcripts أولاً،
 * ويستخدم مولّداً بسيطاً احتياطياً إذا لم تكن المكتبة مثبتة.
 * @param {import('discord.js').TextChannel} channel
 * @param {import('discord.js').Message[]} messages
 * @returns {Promise<AttachmentBuilder>}
 */
async function generateTranscriptFile(channel, messages) {
    try {
        // نحاول استخدام المكتبة المتخصصة أولاً (تنتج ترانسكربت احترافي
        // يحاكي شكل ديسكورد فعلياً، بما فيه الإيمبدات والمرفقات)
        // eslint-disable-next-line global-require
        const discordTranscripts = require('discord-html-transcripts');
        const attachment = await discordTranscripts.createTranscript(channel, {
            limit: -1,
            returnType: 'attachment',
            filename: `transcript-${channel.name}.html`,
            saveImages: true,
            poweredBy: false,
        });
        return attachment;
    } catch (err) {
        // ---------------------------------------------------
        // احتياطي: مولّد HTML بسيط جداً في حال عدم تثبيت المكتبة.
        // ليس بجمالية discord-html-transcripts لكنه يحفظ محتوى
        // الرسائل بأمان كنص HTML قابل للفتح بأي متصفح.
        // ---------------------------------------------------
        const escapeHtml = str =>
            String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

        const rows = messages
            .map(msg => {
                const time = new Date(msg.createdTimestamp).toLocaleString('ar-EG');
                const content = escapeHtml(msg.content || '(بدون نص - قد يحتوي على إيمبد/مرفق)');
                return `<div class="msg"><b>${escapeHtml(msg.author.tag)}</b> <span class="time">${time}</span><p>${content}</p></div>`;
            })
            .join('\n');

        const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>Transcript - ${escapeHtml(channel.name)}</title>
<style>
  body { font-family: sans-serif; background: #313338; color: #dbdee1; padding: 20px; }
  .msg { border-bottom: 1px solid #3f4147; padding: 8px 0; }
  .time { color: #949ba4; font-size: 12px; margin-inline-start: 8px; }
</style>
</head>
<body>
  <h2>ترانسكربت التذكرة: ${escapeHtml(channel.name)}</h2>
  ${rows}
</body>
</html>`;

        return new AttachmentBuilder(Buffer.from(html, 'utf-8'), { name: `transcript-${channel.name}.html` });
    }
}

/**
 * الدالة الرئيسية: تُنفَّذ عند اكتمال العد التنازلي للحذف.
 * تُرسل اللوق الشامل ثم تحذف القناة نهائياً.
 * @param {import('discord.js').TextChannel} channel
 * @param {Object} panel
 */
async function finalizeTicketDeletion(channel, panel) {
    const session = getSession(channel.id);
    const guild = channel.guild;
    const deletedAt = Date.now();

    // ---------------------------------------------------
    // التزام إحصائيات التذكرة إن لم تُلتزم عند القفل (مثل الحذف التلقائي
    // بدون قفل) — رسائل المشاركين + استلام + سرعة الاستلام
    // ---------------------------------------------------
    const { commitTicketStats } = require('../database/ticketStatsStore');
    commitTicketStats(session);

    // ---------------------------------------------------
    // نظام التقييم: رسالة خاصة لصاحب التذكرة (أزرار نجوم + ملاحظة)
    // تُرسل قبل حذف القناة لأننا نحتاج اسم الروم والجلسة
    // ---------------------------------------------------
    const { sendRatingDM } = require('./ticketRatingHandler');
    await sendRatingDM(channel, session, panel);

    // ---------------------------------------------------
    // الإعدادات العامة: إذا كان الأرشيف معطّلاً (archiveOnDelete = 0)
    // نتخطى الجلب والترانسكربت واللوق ونحذف القناة فقط
    // ---------------------------------------------------
    if (getTicketSettings().archiveOnDelete === 0) {
        deleteSession(channel.id);
        await channel.delete().catch(err => {
            console.error('[transcriptLogger] فشل حذف القناة:', err);
            reportError('TICKET_CHANNEL_DELETE', channel.id, err);
        });
        return;
    }

    // ---------------------------------------------------
    // 1) جلب الرسائل وحساب الإحصائيات (قبل حذف القناة كما طُلب)
    // ---------------------------------------------------
    const messages = await fetchAllMessages(channel);
    const stats = computeMessageStats(messages);

    // ---------------------------------------------------
    // 2) توليد ملف الترانسكربت
    // ---------------------------------------------------
    const transcriptFile = await generateTranscriptFile(channel, messages);

    // ---------------------------------------------------
    // 3) بناء إيمبد اللوق الشامل
    // ---------------------------------------------------
    let opener = null;
    if (session?.openerId) {
        opener = await guild.members.fetch(session.openerId).catch(() => null);
    }

    const logEmbed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(`📁 أرشيف التذكرة: ${channel.name}`)
        .addFields(
            {
                name: 'صاحب التذكرة',
                value: opener ? `${opener} (\`${opener.user.tag}\` / \`${opener.id}\`)` : `\`${session?.openerId || 'غير معروف'}\``,
            },
            {
                name: 'التوقيتات',
                value:
                    `**الفتح:** ${session?.openedAt ? `<t:${Math.floor(session.openedAt / 1000)}:F>` : 'غير معروف'}\n` +
                    `**القفل:** ${session?.lockedAt ? `<t:${Math.floor(session.lockedAt / 1000)}:F>` : 'لم تُقفل'}\n` +
                    `**الحذف:** <t:${Math.floor(deletedAt / 1000)}:F>`,
            },
            {
                name: 'آخر مستلم',
                value: session?.claimedBy ? `<@${session.claimedBy}>` : 'لم تُستلم',
            },
            {
                name: '🗑️ حذف بواسطة',
                value: session?.deletedBy === 'AUTO' ? '🤖 البوت (حذف تلقائي)' : session?.deletedBy ? `<@${session.deletedBy}>` : 'غير معروف',
            },
            { name: '📋 سجل الأحداث', value: formatAuditLogField(session?.auditLog) },
            { name: '🧾 ملاحظات الستاف الداخلية', value: formatStaffNotesField(session?.staffNotes) },
            { name: '💬 إحصائيات الرسائل', value: formatMessageStatsField(stats) }
        )
        .setFooter({ text: `البنل: ${panel.name}` })
        .setTimestamp();

    // ---------------------------------------------------
    // 4) إرسال اللوق لروم اللوق المحدد في إعدادات البنل
    // ---------------------------------------------------
    if (panel.logChannelId) {
        const logChannel = await guild.channels.fetch(panel.logChannelId).catch(() => null);
        if (logChannel) {
            await logChannel.send({ embeds: [logEmbed], files: [transcriptFile] }).catch(err => {
                console.error('[transcriptLogger] فشل إرسال اللوق:', err);
                reportError('TICKET_LOG_SEND', 'transcript', err);
            });
        } else {
            console.warn(`[transcriptLogger] روم اللوق المحدد للبنل "${panel.name}" لم يعد موجوداً.`);
        }
    } else {
        console.warn(`[transcriptLogger] لم يتم تحديد روم لوق للبنل "${panel.name}"، تم تجاهل الأرشفة.`);
    }

    // ---------------------------------------------------
    // 5) حذف القناة فعلياً ومسح الجلسة من الذاكرة
    // ---------------------------------------------------
    deleteSession(channel.id);
    await channel.delete().catch(err => {
        console.error('[transcriptLogger] فشل حذف القناة:', err);
        reportError('TICKET_CHANNEL_DELETE', channel.id, err);
    });
}

module.exports = { finalizeTicketDeletion };

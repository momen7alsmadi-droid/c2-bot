/**
 * =========================================================
 *  utils/messageVariables.js
 * =========================================================
 * استبدال المتغيرات المدعومة داخل أي نص مخصص (رسالة الترحيب،
 * رسالة البنل العامة، ... إلخ) لتظهر القيم الحقيقية وقت الإرسال.
 *
 * المتغيرات المدعومة:
 *   [user]          -> منشن العضو          <@123456789>
 *   [username]      -> اسم المستخدم          momen
 *   [id]            -> آيدي العضو            123456789
 *   [server]        -> اسم السيرفر           C2 Server
 *   [server_id]     -> آيدي السيرفر          123456789
 *   [ticket_name]   -> اسم روم التذكرة       ticket-momen
 *   [ticket_number] -> رقم التذكرة (العدد الحالي في الكاتيجوري)
 *   [time]          -> الوقت الحالي          <t:1234567890:F>
 *
 * أي متغير بلا سياق (مثلاً [user] في رسالة عامة لا يفتحها عضو
 * معيّن) يبقى كما هو نصاً حرفياً بدل أن يتحول إلى "غير معروف".
 * =========================================================
 */

/**
 * استبدال المتغيرات في نص معيّن حسب السياق المتاح
 * @param {String} template
 * @param {Object} [context]
 * @param {Object} [context.member] - عضو (GuildMember) — يفعّل [user] [username] [id]
 * @param {Object} [context.guild] - سيرفر (Guild) — يفعّل [server] [server_id]
 * @param {String} [context.channelName] - اسم روم التذكرة — يفعّل [ticket_name]
 * @param {Number} [context.ticketNumber] - رقم التذكرة — يفعّل [ticket_number]
 * @returns {String}
 */
function applyMessageVariables(template, { member, guild, channelName, ticketNumber } = {}) {
    let text = String(template || '');

    if (member) {
        text = text
            .replaceAll('[user]', `<@${member.id}>`)
            .replaceAll('[username]', (member.user && member.user.username) || '')
            .replaceAll('[id]', member.id);
    }
    if (guild) {
        text = text
            .replaceAll('[server]', guild.name)
            .replaceAll('[server_id]', guild.id);
    }
    if (channelName) text = text.replaceAll('[ticket_name]', channelName);
    if (ticketNumber !== undefined && ticketNumber !== null) {
        text = text.replaceAll('[ticket_number]', String(ticketNumber));
    }

    // [time] متاح دائماً (لا يحتاج سياق)
    text = text.replaceAll('[time]', `<t:${Math.floor(Date.now() / 1000)}:F>`);

    return text;
}

/**
 * نص عرض المتغيرات المدعومة — يُستخدم في إيمبد المعلومات
 */
const SUPPORTED_VARIABLES =
    '`[user]` منشن العضو • `[username]` الاسم • `[id]` الآيدي • `[server]` اسم السيرفر • `[server_id]` آيدي السيرفر • `[ticket_name]` اسم التكت • `[ticket_number]` رقم التكت • `[time]` الوقت';

module.exports = { applyMessageVariables, SUPPORTED_VARIABLES };

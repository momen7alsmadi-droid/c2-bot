/**
 * =========================================================
 *  utils/ticketChannelName.js
 * =========================================================
 * بناء اسم روم التذكرة من قالب مخصص يدعم المتغيرات:
 *
 *   panel.ticketNameTemplate = 'ticket-[username]' (الافتراضي)
 *                            = '[ticket_number]-[username]'
 *                            = '[server]-دعم-[username]' ...
 *
 * أسماء رومات ديسكورد لها قيود صارمة (أحرف صغيرة، لا رموز
 * خاصة، لا منشنات، 100 حرف كحد أقصى) لذلك بعد استبدال
 * المتغيرات نُنظف الناتج:
 *   - تحويل لكل الأحرف الصغيرة
 *   - استبدال أي رمز غير مسموح (منشنات/روابط/رموز) بشرطة -
 *   - دمج الشرطات المتتالية وإزالة شرطات الأطراف
 *   - قصّ إلى 100 حرف
 *
 * المتغيرات المناسبة للاسم (نص/رقم):
 *   [username] [id] [server] [server_id] [member_count]
 *   [ticket_number] [time] [date] [day] [boosts] [boost_tier]
 *
 * المتغيرات التي تُنتج منشنات ([user] [owner] [bot] [staff]
 * [ping] [highest_role] [channel]) تتحول تلقائياً إلى شرطة -
 * لأن أسماء الرومات لا تدعم المنشنات.
 * =========================================================
 */

const { applyMessageVariables } = require('./messageVariables');

/**
 * تنظيف نص ليصبح اسماً صالحاً لروم ديسكورد
 * @param {String} raw
 * @returns {String}
 */
function sanitizeChannelName(raw) {
    let name = String(raw || '')
        .toLowerCase()
        // كل ما ليس حرفاً لاتينياً/رقماً أو حرفاً عربياً (أو أرقاماً عربية) -> شرطة
        .replace(/[^a-z0-9\u0600-\u06FF\u0660-\u0669]/g, '-')
        .replace(/-+/g, '-') // شرطات متتالية -> شرطة واحدة
        .replace(/^-+|-+$/g, '') // إزالة شرطات الأطراف
        .slice(0, 100);

    // أسماء محجوزة في ديسكورد لا يمكن استخدامها
    if (!name || name === 'all' || name === 'none') return 'ticket';
    return name;
}

/**
 * بناء اسم روم التذكرة من قالب البنل + السياق
 * @param {Object} panel
 * @param {Object} context - نفس سياق applyMessageVariables
 * @returns {String}
 */
function buildTicketChannelName(panel, context = {}) {
    const template = panel.ticketNameTemplate || 'ticket-[username]';
    const applied = applyMessageVariables(template, context);
    return sanitizeChannelName(applied);
}

module.exports = { buildTicketChannelName, sanitizeChannelName };

/**
 * =========================================================
 *  handlers/ticketBoardTrigger.js
 * =========================================================
 * عندما يكتب أحد أعضاء الستاف/الإدارة كلمة "لوحة" داخل روم
 * تكت فعّال، يرسل البوت **لوحة تحكم جديدة** داخل نفس التكت:
 * أزرار (استلام / قفل) + القائمة المنسدلة — ليتمكن الإداري
 * من التحكم بالتكت من جديد (مثلاً إذا فُقدت لوحة التحكم
 * الأصلية: حُذفت يدوياً أو ضاعت بعد إعادة تشغيل البوت).
 *
 * تُهمل الرسالة بصمت إذا:
 *   - الكاتب بوت
 *   - الروم ليس تذكرة فعّالة
 *   - الكاتب ليس ستافاً ولا إدارة عليا
 * =========================================================
 */

const { getSession, updateSession } = require('./ticketStore');
const { getPanelByName } = require('../database/panelsDB');
const { isStaff, isUpperManagement } = require('./permissionUtils');
const { buildTicketControlRows } = require('./ticketControlBuilder');

const TRIGGERS = ['لوحة', 'اللوحة'];

/**
 * معالج رسالة "لوحة" داخل التكت
 * @param {import('discord.js').Message} message
 */
async function handleTicketBoardTrigger(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = (message.content || '').trim();
    if (!TRIGGERS.includes(content)) return;

    // 1) يجب أن يكون الروم تذكرة فعّالة
    const session = getSession(message.channel.id);
    if (!session) return;

    // 2) يجب أن يكون للبنل إعدادات
    const panel = getPanelByName(session.panelName);
    if (!panel) return;

    // 3) فقط الستاف أو الإدارة العليا يستطيع طلب لوحة التحكم
    const member = message.member;
    if (!member) return;
    if (!isStaff(member, panel) && !isUpperManagement(member, panel)) return;

    // 4) إرسال لوحة التحكم الجديدة في نفس التكت
    const controlRows = buildTicketControlRows(session, !!session.lockedAt);
    const board = await message.channel.send({ components: controlRows }).catch(() => null);
    if (board) {
        // نخزّن اللوحة الجديدة كرسالة التحكم الرسمية للتحديثات اللاحقة
        updateSession(message.channel.id, { controlMessageId: board.id });
    }
}

module.exports = { handleTicketBoardTrigger };

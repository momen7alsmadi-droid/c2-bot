/**
 * =========================================================
 *  utils/ticketContext.js
 * =========================================================
 * إثراء سياق "رسائل الأزرار" (والرسائل داخل التكت) ببيانات
 * التذكرة الحالية حتى تعمل المتغيرات الجديدة:
 *
 *   [opener]        -> منشن فاتح التذكرة
 *   [opener_name]   -> اسم فاتح التذكرة
 *   [claimed_by]    -> منشن مستلم التذكرة الحالي (فارغ إن لم تكن مستلمة)
 *   [ticket_created]-> تاريخ فتح التذكرة
 *   [category]      -> اسم الكاتيجوري
 *
 * تُستدعى من معالجات الأزرار (استلام/قفل/حذف/تحويل/إضافة عضو/...)
 * وتمزج البيانات فوق السياق الأساسي (member = من ضغط الزر،
 * guild، channelName، channelId) الذي يوفره كل معالج.
 * =========================================================
 */

const { getSession } = require('../handlers/ticketStore');
const { reportError } = require('../../src/utils/errorLogger');

/**
 * إثراء سياق رسالة إجراء ببيانات التذكرة الحالية
 * @param {import('discord.js').BaseInteraction} interaction
 * @param {Object} [base] - السياق الأساسي (member/guild/channelName/channelId/targetMention)
 * @returns {Promise<Object>}
 */
async function enrichActionContext(interaction, base = {}) {
    const result = { ...base };

    // بيانات الجلسة: الفاتح، المستلم، تاريخ الفتح
    try {
        const session = getSession(interaction.channel?.id);
        if (session) {
            if (session.openerId) {
                result.openerId = session.openerId;
                // نجلب عضو الفاتح لتفعيل [opener] و[opener_name] (إن كان ما زال في السيرفر)
                const opener = await interaction.guild.members
                    .fetch(session.openerId)
                    .catch(() => null);
                if (opener) result.opener = opener;
            }
            if (session.claimedBy) result.claimedBy = session.claimedBy;
            if (session.openedAt) result.ticketCreatedAt = session.openedAt;
        }
    } catch (err) {
        console.error('[ticketContext] فشل جلب بيانات الجلسة:', err.message);
        reportError('TICKET_CONTEXT', 'session-fetch', err);
    }

    // اسم الكاتيجوري (روم التذكرة موجود داخل كاتيجوري)
    try {
        const parent = interaction.channel?.parent;
        if (parent && parent.name) result.categoryName = parent.name;
    } catch {
        // تجاهل — المتغير سيبقى حرفياً
    }

    return result;
}

module.exports = { enrichActionContext };

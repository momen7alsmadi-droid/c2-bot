/**
 * =========================================================
 *  utils/interactionSafe.js
 * =========================================================
 * دوال مساعدة مشتركة لتفاعلات الأزرار/القوائم:
 *   - ackComponent: تأكيد فوري آمن مع محاولة إضافية (أخطاء
 *     شبكة عابرة) وتجنب إعادة التأكيد على تفاعل مؤكد مسبقاً.
 *   - deliverComponent: تسليم آمن — followUp إن كان التفاعل
 *     مؤكداً، وإلا reply مباشر كبديل (يبطل InteractionNotReplied).
 *
 * تُستخدم في لوحة الإدارة (admin-board.js) وواجهة إحصائيات
 * التكتات (ticketStatsBuilder.js) لتجنب انهيار المعالجات أو
 * صمت الأزرار عند فشل تأكيد التفاعل.
 * =========================================================
 */

/**
 * تأكيد زر/قائمة بأمان مع محاولة إضافية بعد 300ms عند فشل الشبكة.
 * @param {import('discord.js').MessageComponentInteraction} interaction
 * @returns {Promise<Boolean>} true إذا أصبح التفاعل مؤكداً (deferred/replied)
 */
async function ackComponent(interaction) {
    if (!interaction) return false;
    if (interaction.replied || interaction.deferred) return true;
    try {
        await interaction.deferUpdate();
        return true;
    } catch {
        // أخطاء شبكة عابرة: محاولة ثانية بعد لحظة قصيرة
        await new Promise(r => setTimeout(r, 300));
        if (interaction.replied || interaction.deferred) return true;
        try {
            await interaction.deferUpdate();
            return true;
        } catch { /* تجاهل */ }
        return !!(interaction.replied || interaction.deferred);
    }
}

/**
 * تسليم آمن لأي حمولة (رسالة مخفية عادة):
 * followUp إذا كان التفاعل مؤكداً، وإلا reply مباشر كبديل.
 * لا يرمي أبداً.
 * @param {import('discord.js').MessageComponentInteraction} interaction
 * @param {Object} payload
 * @returns {Promise<void>}
 */
function deliverComponent(interaction, payload) {
    if (!interaction) return Promise.resolve();
    if (interaction.deferred || interaction.replied) {
        return interaction.followUp(payload).catch(() => {});
    }
    return interaction.reply(payload).catch(() => {});
}

module.exports = { ackComponent, deliverComponent };

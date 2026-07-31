/**
 * =========================================================
 *  utils/interactionGuard.js
 * =========================================================
 * حارس آمن للتفاعلات: يمنع انهيار المعالجات بخطأ
 * InteractionNotReplied عندما يفشل deferUpdate بصمت.
 *
 * المشكلة الأصلية: عندما يفشل interaction.deferUpdate()
 * (غالباً DiscordAPIError 10062 — انتهت صلاحية التفاعل أو
 * استُهلك مسبقاً) مع .catch(() => {}), ثم نستدعي editReply()
 * فترمي InteractionNotReplied وتنهار الدالة بالكامل.
 *
 * الحل: safeDeferUpdate يحاول deferUpdate، وعند الفشل يحاول
 * رداً مخفياً بديلاً (خطة أخيرة)، ويعيد false ليتوقف المعالج
 * بهدوء بدلاً من الانهيار.
 * =========================================================
 */

/**
 * تأجيل تحديث رسالة المكوّن بأمان.
 * @param {import('discord.js').MessageComponentInteraction} interaction
 * @param {String} [fallbackContent] - نص الرد البديل عند الفشل
 * @returns {Promise<Boolean>} true إذا نجح التأجيل واستطعنا متابعة العمل
 */
async function safeDeferUpdate(interaction, fallbackContent) {
    try {
        await interaction.deferUpdate();
        return true;
    } catch {
        // التفاعل قد يكون منتهي الصلاحية أو مستجاباً له مسبقاً:
        // نحاول رداً مخفياً كخطة أخيرة، وإن فشل نكتفي بالصمت
        try {
            await interaction.reply({
                content: fallbackContent || '⚠️ انتهت صلاحية هذا التفاعل، حاول مرة أخرى.',
                ephemeral: true,
            });
        } catch {
            /* تجاهل */
        }
        return false;
    }
}

module.exports = { safeDeferUpdate };

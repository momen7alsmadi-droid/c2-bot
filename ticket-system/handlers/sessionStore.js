/**
 * =========================================================
 *  handlers/sessionStore.js
 * =========================================================
 * بما أن اللوحة تعمل كـ "رسالة واحدة ثابتة" ويتم التنقل بين
 * صفحات كثيرة (عام / رتب / رومات / رسائل) داخل نفس الرسالة،
 * نحتاج طريقة لمعرفة "أي بنل يتم تعديله الآن" و"في أي صفحة"
 * بدون الاعتماد على customId طويلة (Discord يحدد customId
 * بـ 100 حرف كحد أقصى، وأسماء البنلات قد تكون طويلة).
 *
 * الحل: تخزين مؤقت في الذاكرة (In-Memory Map) مفتاحه هو
 * message.id الخاص برسالة اللوحة نفسها. بما أن الرسالة ثابتة
 * ولا تتغير، فهذا المفتاح مستقر طوال فترة التعديل.
 *
 * ⚠️ ملاحظة: هذا تخزين مؤقت (RAM) فقط، إذا أعيد تشغيل البوت
 * تُفقد حالة "الصفحة الحالية" لكن بيانات البنلات نفسها بأمان
 * داخل panels.json لأنها تُحفظ فوراً عند كل تعديل.
 * =========================================================
 */

const sessions = new Map();

/**
 * حفظ/تحديث بيانات الجلسة الخاصة برسالة معينة
 * @param {String} messageId
 * @param {Object} data - مثال: { panelName: 'دعم', page: 'general' }
 */
function setSession(messageId, data) {
    const current = sessions.get(messageId) || {};
    sessions.set(messageId, { ...current, ...data });
}

/**
 * جلب بيانات الجلسة الخاصة برسالة معينة
 * @param {String} messageId
 * @returns {Object} - يعيد كائن فارغ إذا لم توجد جلسة بعد
 */
function getSession(messageId) {
    return sessions.get(messageId) || {};
}

/**
 * مسح الجلسة بالكامل (مثلاً عند الرجوع للوحة الرئيسية)
 * @param {String} messageId
 */
function clearSession(messageId) {
    sessions.delete(messageId);
}

module.exports = { setSession, getSession, clearSession };

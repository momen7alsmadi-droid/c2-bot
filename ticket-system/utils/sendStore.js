/**
 * =========================================================
 *  utils/sendStore.js
 * =========================================================
 * مخزن مؤقت (في الذاكرة) لاختيارات الإداري أثناء خطوة "إرسال تكت"
 * عندما يختار **عدة بنلات** دفعة واحدة:
 *
 *   ticket_select_send (اختيار متعدد) -> token قصير يُحمل في
 *   customId لقائمة الرومات -> عند اختيار الروم نستعيد أسماء
 *   البنلات المخزنة بالـ token وننشرها كباقة واحدة.
 *
 * السبب: customId في ديسكورد محدود بـ 100 حرف، وربط عدة أسماء
 * بنلات عربية فيه يتجاوز الحد، لذلك نخزن الأسماء هنا ونمرر
 * token عشوائياً قصيراً فقط. ينتهي صلاحية الـ token تلقائياً
 * بعد 10 دقائق (احتياط أمان في حال ترك الإداري الخطوة معلّقة).
 * =========================================================
 */

const pendingSends = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 دقائق

/**
 * تخزين أسماء البنلات المختارة مؤقتاً وإرجاع token قصير
 * @param {String[]} panelNames
 * @returns {String} token يستخدم في customId
 */
function storePendingSend(panelNames) {
    const token = Math.random().toString(36).slice(2, 12);
    pendingSends.set(token, panelNames.slice(0, 25));
    setTimeout(() => pendingSends.delete(token), TTL_MS);
    return token;
}

/**
 * استرجاع أسماء البنلات بالـ token ثم حذفها (استخدام لمرة واحدة)
 * @param {String} token
 * @returns {String[]}
 */
function takePendingSend(token) {
    const names = pendingSends.get(token);
    pendingSends.delete(token);
    return Array.isArray(names) ? names : [];
}

module.exports = { storePendingSend, takePendingSend };

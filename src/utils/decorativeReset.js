/**
 * =========================================================
 *  utils/decorativeReset.js
 * =========================================================
 * خيار شكلي فقط "🔄 إعادة تعيين" يُضاف كـ **آخر خيار داخل** كل
 * قائمة منسدلة نصية (StringSelectMenu) في أنحاء البوت — بدون أي
 * وظيفة (اختياره يعيد فقط تأكيداً إخفائياً ولا ينفذ شيئاً).
 *
 * قواعد آمنة:
 *   1) يُضاف فقط لقوائم النصوص (type 3) — ديسكورد يرفض إضافة
 *      خيارات مخصصة لقوائم الرتب/الرومات/الأعضاء/المنشن
 *   2) فقط للقوائم أحادية الاختيار (maxValues <= 1)
 *   3) لا يتجاوز حد 25 خياراً
 *   4) لا يتكرر أبداً
 *   5) مستثنى: قائمة تحكم الستاف في التكت (تملك أصلاً خيار
 *      "♻️ إعادة تعيين القائمة" كآخر خيار يعمل فعلياً)
 * =========================================================
 */

const DECO_VALUE = '__deco_reset__';
const DECO_LABEL = '🔄 إعادة تعيين';
const DECO_EMOJI = '♻️';
const SELECT_TEXT_TYPE = 3;

// قوائم مستثناة (تملك أصلاً خيار إعادة تعيين فعلي كآخر خيار)
const EXCLUDED_CUSTOM_IDS = new Set(['ticket_staff_menu']);

/** استخراج نوع المكوّن بأمان (يدعم الـ Builders والكائنات الخام) */
function componentType(comp) {
    if (!comp) return null;
    if (typeof comp.type === 'number') return comp.type;
    if (comp.data && typeof comp.data.type === 'number') return comp.data.type;
    if (typeof comp.toJSON === 'function') {
        try { return comp.toJSON().type; } catch { return null; }
    }
    return null;
}

/** استخراج custom_id بأمان */
function componentCustomId(comp) {
    if (!comp) return null;
    if (typeof comp.custom_id === 'string') return comp.custom_id;
    if (comp.data && typeof comp.data.custom_id === 'string') return comp.data.custom_id;
    if (typeof comp.toJSON === 'function') {
        try { return comp.toJSON().custom_id; } catch { return null; }
    }
    return null;
}

/**
 * إضافة خيار "🔄 إعادة تعيين" كآخر خيار داخل كل قائمة منسدلة نصية
 * @param {Array} rows - مصفوفة ActionRowBuilder (تُعدَّل وتُعاد كما هي)
 * @returns {Array}
 */
function appendDecorativeOption(rows) {
    if (!Array.isArray(rows)) return rows;

    for (const row of rows) {
        if (!row || !Array.isArray(row.components)) continue;

        for (const comp of row.components) {
            // فقط قوائم النصوص (StringSelectMenu) أحادية الاختيار
            if (componentType(comp) !== SELECT_TEXT_TYPE) continue;
            if (EXCLUDED_CUSTOM_IDS.has(componentCustomId(comp))) continue;

            const data = comp.data || {};
            const maxV = data.max_values;
            if (typeof maxV === 'number' && maxV > 1) continue; // متعدد الاختيار

            // خيارات القائمة: discord.js v14 تخزنها في builder.options
            // (data.options فارغة حتى toJSON) — ندعم الحالتين
            const opts = Array.isArray(comp.options)
                ? comp.options
                : Array.isArray(data.options) ? data.options : [];
            if (opts.length >= 25) continue; // حد ديسكورد
            if (opts.some(o => o && (o.value === DECO_VALUE || (o.data && o.data.value === DECO_VALUE)))) continue; // لا تكرار

            try {
                comp.addOptions({ label: DECO_LABEL, value: DECO_VALUE, emoji: DECO_EMOJI });
            } catch {
                /* مكوّن خام أو غير قابل للتعديل — نتجاهل بأمان */
            }
        }
    }
    return rows;
}

module.exports = { appendDecorativeOption, DECO_VALUE, DECO_LABEL };

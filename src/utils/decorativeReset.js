/**
 * =========================================================
 *  utils/decorativeReset.js
 * =========================================================
 * زر شكلي فقط "🔄 إعادة تعيين" يُضاف في نهاية أي رسالة تحتوي
 * قائمة منسدلة (Select Menu) في كل أنحاء البوت — بدون أي وظيفة
 * (لا يجعل له أي إجراء؛ الضغط عليه يعيد فقط تأكيداً إخفائياً).
 *
 * قواعد الإضافة الآمنة (دون كسر حدود ديسكورد):
 *   1) يُضاف فقط إذا كانت الرسالة تحتوي فعلاً قائمة منسدلة
 *   2) إذا كان الصف الأخير صف أزرار وبه مكان -> يُدمج فيه
 *   3) وإلا يُضاف صف جديد (طالما أن عدد الصفوف < 5)
 * =========================================================
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const DECO_CUSTOM_ID = 'ui_deco_reset';
const DECO_LABEL = '🔄 إعادة تعيين';

// أنواع المكونات: 2=زر, 3=قائمة نصية, 5=قائمة أعضاء, 6=قائمة رتب,
// 7=قائمة منشن, 8=قائمة رومات
const SELECT_TYPES = [3, 5, 6, 7, 8];
const BUTTON_TYPE = 2;

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

/** بناء الزر الشكلي */
function buildDecoButton() {
    return new ButtonBuilder()
        .setCustomId(DECO_CUSTOM_ID)
        .setLabel(DECO_LABEL)
        .setStyle(ButtonStyle.Secondary);
}

/**
 * إضافة الزر الشكلي في نهاية صفوف المكونات إن وُجدت قائمة منسدلة
 * @param {Array} rows - مصفوفة ActionRowBuilder (تُعدَّل وتُعاد كما هي)
 * @returns {Array}
 */
function appendDecorativeReset(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return rows;

    // منع الإضافة المزدوجة (لو أُعيد استخدام نفس الرسالة أكثر من مرة)
    const alreadyHas = rows.some(row =>
        row && Array.isArray(row.components) &&
        row.components.some(c => componentType(c) === BUTTON_TYPE && componentCustomId(c) === DECO_CUSTOM_ID)
    );
    if (alreadyHas) return rows;

    // هل توجد قائمة منسدلة فعلاً؟
    const hasSelect = rows.some(row =>
        row &&
        Array.isArray(row.components) &&
        row.components.some(c => SELECT_TYPES.includes(componentType(c)))
    );
    if (!hasSelect) return rows;

    // 1) إن كان الصف الأخير صف أزرار وفيه مكان -> دمج الزر فيه
    const last = rows[rows.length - 1];
    const comps = last && Array.isArray(last.components) ? last.components : [];
    if (
        comps.length > 0 &&
        comps.every(c => componentType(c) === BUTTON_TYPE) &&
        comps.length < 5
    ) {
        try {
            last.addComponents(buildDecoButton());
            return rows;
        } catch {
            /* نكمل لصف جديد */
        }
    }

    // 2) وإلا صف جديد (ضمن حد 5 صفوف)
    if (rows.length < 5) {
        rows.push(new ActionRowBuilder().addComponents(buildDecoButton()));
    }
    return rows;
}

module.exports = { appendDecorativeReset, buildDecoButton, DECO_CUSTOM_ID, DECO_LABEL };

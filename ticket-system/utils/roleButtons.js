/**
 * =========================================================
 *  utils/roleButtons.js
 * =========================================================
 * دوال مساعدة لإدارة "أزرار الرتب المخصصة" في البنل
 * (panel.customRoleButtons):
 *
 *   كل زر: { id, label, enabled, exclusive, allowedRoles[], options[] }
 *   كل خيار: { id, label, description, roleId }
 *
 * السلوك عند الضغط على الزر داخل التكت:
 *   - رسالة مخفية فيها قائمة منسدلة بخيارات البنل
 *   - اختيار خيار يعطي الرتبة المحددة (roleId) لصاحب التكت
 *   - exclusive = مفعّل  -> صاحب التكت يملك رتبة واحدة فقط من
 *     خيارات هذا الزر (أخذ رتبة جديدة يزيل السابقة) والزر لا
 *     يستخدمه إلا من استلم التكت أو الإدارة العليا
 *   - exclusive = مطفأ   -> يمكن أخذ أكثر من رتبة بحرية
 * =========================================================
 */

const { getPanelByName, updatePanel } = require('../database/panelsDB');

/** جلب زر رتبة من البنل (أو null) */
function getRoleButton(panel, btnId) {
    if (!panel || !Array.isArray(panel.customRoleButtons)) return null;
    return panel.customRoleButtons.find(b => b.id === btnId) || null;
}

/** جلب خيار داخل زر (أو null) */
function getRoleOption(button, optId) {
    if (!button || !Array.isArray(button.options)) return null;
    return button.options.find(o => o.id === optId) || null;
}

/** توليد معرف فريد قصير */
function genId() {
    return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * تحديث بنية الأزرار داخل البنل عبر دالة محوّلة (لا تفقد باقي البيانات)
 * @param {String} panelName
 * @param {(buttons:Array)=>Array} mapper
 * @returns {Boolean}
 */
function updateRoleButtons(panelName, mapper) {
    const panel = getPanelByName(panelName);
    if (!panel) return false;
    const buttons = Array.isArray(panel.customRoleButtons) ? panel.customRoleButtons : [];
    updatePanel(panelName, { customRoleButtons: mapper(buttons) });
    return true;
}

/** إضافة زر رتبة جديد (يعيد الزر أو null) */
function addRoleButton(panelName, label) {
    const btn = {
        id: genId(),
        label: String(label || 'زر رتبة').slice(0, 80),
        enabled: true,
        exclusive: false,
        allowedRoles: [],
        options: [],
    };
    updateRoleButtons(panelName, list => [...list, btn]);
    return btn;
}

/** إضافة خيار لزر (يعيد الخيار أو null) */
function addRoleOption(panelName, btnId, label, description) {
    const opt = { id: genId(), label: String(label || 'خيار').slice(0, 100), description: String(description || '').slice(0, 100), roleId: null };
    let created = false;
    updateRoleButtons(panelName, list =>
        list.map(b => {
            if (b.id !== btnId) return b;
            created = true;
            return { ...b, options: [...(b.options || []), opt] };
        })
    );
    return created ? opt : null;
}

/** حذف زر */
function removeRoleButton(panelName, btnId) {
    updateRoleButtons(panelName, list => list.filter(b => b.id !== btnId));
}

/** حذف خيار */
function removeRoleOption(panelName, btnId, optId) {
    updateRoleButtons(panelName, list =>
        list.map(b => (b.id === btnId ? { ...b, options: (b.options || []).filter(o => o.id !== optId) } : b))
    );
}

/** تبديل تفعيل/إطفاء الزر (مطفأ = مخفي ولا يظهر في التكت) */
function toggleRoleButtonEnabled(panelName, btnId) {
    updateRoleButtons(panelName, list =>
        list.map(b => (b.id === btnId ? { ...b, enabled: !b.enabled } : b))
    );
}

/** تبديل الوضع الحصري (رتبة واحدة فقط لصاحب التكت) */
function toggleRoleButtonExclusive(panelName, btnId) {
    updateRoleButtons(panelName, list =>
        list.map(b => (b.id === btnId ? { ...b, exclusive: !b.exclusive } : b))
    );
}

/** تعيين رتبة لخيار محدد */
function setRoleOptionRole(panelName, btnId, optId, roleId) {
    updateRoleButtons(panelName, list =>
        list.map(b =>
            b.id === btnId
                ? { ...b, options: (b.options || []).map(o => (o.id === optId ? { ...o, roleId: roleId || null } : o)) }
                : b
        )
    );
}

/** تعيين الرتب المسموح لها باستخدام الزر */
function setRoleButtonAllowedRoles(panelName, btnId, roleIds) {
    updateRoleButtons(panelName, list =>
        list.map(b => (b.id === btnId ? { ...b, allowedRoles: (roleIds || []).slice(0, 25) } : b))
    );
}

module.exports = {
    genId,
    getRoleButton,
    getRoleOption,
    addRoleButton,
    addRoleOption,
    removeRoleButton,
    removeRoleOption,
    toggleRoleButtonEnabled,
    toggleRoleButtonExclusive,
    setRoleOptionRole,
    setRoleButtonAllowedRoles,
};

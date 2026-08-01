/**
 * =========================================================
 *  handlers/permissionUtils.js
 * =========================================================
 * دوال مساعدة موحّدة لكل فحوصات الصلاحيات في نظام التذاكر،
 * حتى لا يتكرر نفس المنطق في كل Handler على حدة.
 * =========================================================
 */

const { PermissionFlagsBits } = require('discord.js');

/**
 * هل العضو يملك صلاحية Administrator؟ (= "الإدارة العليا" في كل هذا النظام)
 * @param {import('discord.js').GuildMember} member
 */
function isAdmin(member) {
    return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * هل العضو من "الإدارة العليا"؟
 * القاعدة: أي رتبة تملك Administrator تعتبر إدارة عليا تلقائياً
 * (بدون الحاجة لإضافتها)، أو يملك إحدى رتب الإدارة العليا المختارة
 * في إعدادات البنل (upperManagementRoles).
 * @param {import('discord.js').GuildMember} member
 * @param {Object} panel
 */
function isUpperManagement(member, panel) {
    // 1) أي عضو يملك صلاحية Administrator هو إدارة عليا تلقائياً
    if (isAdmin(member)) return true;

    // 2) رتب الإدارة العليا المختارة يدوياً في إعدادات البنل
    const roleIds = (panel && Array.isArray(panel.upperManagementRoles)) ? panel.upperManagementRoles : [];
    if (roleIds.length === 0) return false;
    return member.roles.cache.some(role => roleIds.includes(role.id));
}

/**
 * هل العضو يملك إحدى رتب "الستاف" الخاصة بالبنل (أو إداري)؟
 * @param {import('discord.js').GuildMember} member
 * @param {Object} panel
 */
function isStaff(member, panel) {
    if (isAdmin(member)) return true;
    return member.roles.cache.some(role => panel.staffRoles.includes(role.id));
}

/**
 * هل يُسمح لهذا العضو بفتح تذكرة من هذا البنل؟
 * القاعدة: يُمنع إن كان يملك رتبة من deniedRoles.
 *          إن كانت allowedRoles غير فارغة، يجب أن يملك واحدة منها.
 * @param {import('discord.js').GuildMember} member
 * @param {Object} panel
 * @returns {{ allowed: Boolean, reason: String|null }}
 */
function canOpenTicket(member, panel) {
    if (isAdmin(member)) return { allowed: true, reason: null };

    const memberRoleIds = member.roles.cache.map(r => r.id);

    const isDenied = panel.deniedRoles?.some(id => memberRoleIds.includes(id));
    if (isDenied) {
        return { allowed: false, reason: '❌ ليس لديك صلاحية فتح تذكرة من هذا البنل (رتبة ممنوعة).' };
    }

    if (panel.allowedRoles?.length > 0) {
        const isAllowed = panel.allowedRoles.some(id => memberRoleIds.includes(id));
        if (!isAllowed) {
            return { allowed: false, reason: '❌ ليس لديك الرتبة المطلوبة لفتح تذكرة من هذا البنل.' };
        }
    }

    return { allowed: true, reason: null };
}

/**
 * هل يحق لهذا العضو استخدام أزرار/قوائم التحكم "المقيّدة" داخل تذكرة؟
 * القاعدة الصارمة من الجزء الثالث: بعد الاستلام، فقط (المستلم الحالي)
 * أو (الإدارة العليا) يمكنهم استخدام باقي الأزرار والقوائم.
 * @param {import('discord.js').GuildMember} member
 * @param {Object} ticketSession
 */
function canUseRestrictedControls(member, ticketSession, panel) {
    // الإدارة العليا (Administrator تلقائياً أو رتبة مختارة) دائماً لها الحق
    if (isUpperManagement(member, panel)) return true;
    if (!ticketSession.claimedBy) return false; // لا يوجد مستلم بعد
    return member.id === ticketSession.claimedBy;
}

/**
 * هل يُسمح لهذا العضو باستخدام "زر رتبة مخصص" في التكت؟
 * القاعدة:
 *   - الإدارة العليا + أي رتبة Administrator تستطيع دائماً (حتى لو
 *     لم تكن ضمن allowedRoles) — كما في كل صلاحيات التكت
 *   - إن كانت allowedRoles غير فارغة يجب امتلاك إحداها
 *   - إن كانت فارغة = الستاف فقط
 * @param {import('discord.js').GuildMember} member
 * @param {Object} panel
 * @param {Object} button - زر الرتبة من panel.customRoleButtons
 * @returns {Boolean}
 */
function canUseRoleButton(member, panel, button) {
    if (!button || button.enabled === false) return false;

    // الإدارة العليا وأي Administrator تستخدم كل شيء في التكت
    if (isUpperManagement(member, panel)) return true;

    const allowed = Array.isArray(button.allowedRoles) ? button.allowedRoles : [];
    if (allowed.length > 0) {
        return member.roles.cache.some(role => allowed.includes(role.id));
    }
    return isStaff(member, panel);
}

/**
 * هل يُسمح بهذا العضو في الوضع الحصري (exclusive)؟
 * في الوضع الحصري لا يستخدم الزر إلا من استلم التكت أو الإدارة العليا
 * @returns {Boolean}
 */
function canUseExclusiveRoleButton(member, session, panel) {
    if (!session) return false;
    if (isUpperManagement(member, panel)) return true;
    return session.claimedBy === member.id;
}

module.exports = {
    isAdmin,
    isUpperManagement,
    isStaff,
    canOpenTicket,
    canUseRestrictedControls,
    canUseRoleButton,
    canUseExclusiveRoleButton,
};

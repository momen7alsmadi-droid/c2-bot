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
function canUseRestrictedControls(member, ticketSession) {
    if (isAdmin(member)) return true;
    if (!ticketSession.claimedBy) return false; // لا يوجد مستلم بعد
    return member.id === ticketSession.claimedBy;
}

module.exports = {
    isAdmin,
    isStaff,
    canOpenTicket,
    canUseRestrictedControls,
};

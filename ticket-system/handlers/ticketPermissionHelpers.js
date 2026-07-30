/**
 * =========================================================
 *  handlers/ticketPermissionHelpers.js
 * =========================================================
 * دوال تُطبّق تعديلات صلاحيات القناة (PermissionOverwrites)
 * الفعلية عند كل تغيير في حالة التذكرة: استلام / إلغاء استلام /
 * قفل / فتح. فُصلت عن ticketControlHandler.js لتسهيل القراءة.
 *
 * ملاحظة: الإدارة العليا (Administrator) تتجاوز صلاحيات الروم
 * تلقائياً في ديسكورد، لذلك لا حاجة لأي Overwrite خاص بها.
 * =========================================================
 */

const { PermissionFlagsBits } = require('discord.js');

/**
 * عند الاستلام: إخفاء القناة عن باقي رتب الستاف، وإبقاؤها ظاهرة
 * فقط للمستلم (عبر Overwrite خاص بعضويته يتجاوز Overwrite الرتبة).
 * @param {import('discord.js').TextChannel} channel
 * @param {Object} panel
 * @param {String} claimerId
 */
async function applyClaimPermissions(channel, panel, claimerId) {
    for (const roleId of panel.staffRoles) {
        await channel.permissionOverwrites.edit(roleId, { ViewChannel: false }).catch(() => {});
    }
    await channel.permissionOverwrites
        .edit(claimerId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true })
        .catch(() => {});
}

/**
 * عند إلغاء الاستلام: إعادة إظهار القناة لكل رتب الستاف من جديد،
 * وحذف الـ Overwrite الخاص بعضوية المستلم السابق (إن لم يكن صاحب التكت).
 * @param {import('discord.js').TextChannel} channel
 * @param {Object} panel
 * @param {String} previousClaimerId
 * @param {String} openerId
 */
async function revertClaimPermissions(channel, panel, previousClaimerId, openerId) {
    for (const roleId of panel.staffRoles) {
        await channel.permissionOverwrites.edit(roleId, { ViewChannel: true }).catch(() => {});
    }
    if (previousClaimerId && previousClaimerId !== openerId) {
        await channel.permissionOverwrites.delete(previousClaimerId).catch(() => {});
    }
}

/**
 * عند القفل: منع الجميع (عدا الإدارة العليا) من إرسال الرسائل.
 * @param {import('discord.js').TextChannel} channel
 * @param {Object} panel
 * @param {Object} session
 */
async function applyLockPermissions(channel, panel, session) {
    await channel.permissionOverwrites.edit(session.openerId, { SendMessages: false }).catch(() => {});
    for (const roleId of panel.staffRoles) {
        await channel.permissionOverwrites.edit(roleId, { SendMessages: false }).catch(() => {});
    }
    if (session.claimedBy) {
        await channel.permissionOverwrites.edit(session.claimedBy, { SendMessages: false }).catch(() => {});
    }
}

/**
 * عند الفتح (إلغاء القفل): إعادة صلاحية الإرسال للجميع حسب حالتهم الحالية.
 * @param {import('discord.js').TextChannel} channel
 * @param {Object} panel
 * @param {Object} session
 */
async function applyUnlockPermissions(channel, panel, session) {
    await channel.permissionOverwrites.edit(session.openerId, { SendMessages: true }).catch(() => {});
    for (const roleId of panel.staffRoles) {
        await channel.permissionOverwrites.edit(roleId, { SendMessages: true }).catch(() => {});
    }
    if (session.claimedBy) {
        await channel.permissionOverwrites.edit(session.claimedBy, { SendMessages: true }).catch(() => {});
    }
}

/**
 * عند التصعيد (Escalate): سحب رؤية القناة من كل رتب الستاف (حتى المستلم)
 * والإبقاء عليها فقط لصاحب التكت والإدارة العليا.
 * @param {import('discord.js').TextChannel} channel
 * @param {Object} panel
 * @param {String|null} claimerId
 */
async function applyEscalatePermissions(channel, panel, claimerId) {
    for (const roleId of panel.staffRoles) {
        await channel.permissionOverwrites.edit(roleId, { ViewChannel: false }).catch(() => {});
    }
    if (claimerId) {
        await channel.permissionOverwrites.delete(claimerId).catch(() => {});
    }
}

module.exports = {
    applyClaimPermissions,
    revertClaimPermissions,
    applyLockPermissions,
    applyUnlockPermissions,
    applyEscalatePermissions,
};

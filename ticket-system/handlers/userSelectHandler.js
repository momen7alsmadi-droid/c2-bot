/**
 * =========================================================
 *  handlers/userSelectHandler.js
 * =========================================================
 * معالج قوائم UserSelectMenu المؤقتة (الردود المخفية) التي
 * تُفتح من قائمة تحكم الستاف: إضافة عضو / إخراج عضو / تحويل الاستلام.
 * =========================================================
 */

const { getPanelByName } = require('../database/panelsDB');
const { reportError } = require('../../src/utils/errorLogger');
const { getSession, updateSession, addAuditLog } = require('./ticketStore');
const { canUseRestrictedControls } = require('./permissionUtils');
const { buildTicketControlRows } = require('./ticketControlBuilder');
const { applyClaimPermissions, revertClaimPermissions } = require('./ticketPermissionHelpers');
const { sendActionMessage } = require('../utils/actionMessages');
const { enrichActionContext } = require('../utils/ticketContext');

const RELEVANT_IDS = ['ticket_add_member_select', 'ticket_remove_member_select', 'ticket_transfer_select'];

// سياق المتغيرات المشترك لرسائل الإجراءات
// سياق المتغيرات: [actor] = من ضغط الزر، [member] = العضو المستهدف
// + [opener] [claimed_by] [ticket_created] [category] من جلسة التذكرة
async function actionContext(interaction, targetId) {
    return enrichActionContext(interaction, {
        member: interaction.member,
        guild: interaction.guild,
        channelName: interaction.channel.name,
        channelId: interaction.channel.id,
        targetMention: targetId ? `<@${targetId}>` : null,
    });
}

/**
 * @param {import('discord.js').UserSelectMenuInteraction} interaction
 */
async function handleUserSelectMenu(interaction) {
    if (!RELEVANT_IDS.includes(interaction.customId)) return;

    try {
        const session = getSession(interaction.channel.id);
        if (!session) {
            await interaction.update({ content: '⚠️ هذا الروم لم يعد تذكرة فعّالة.', components: [] });
            return;
        }

        const panel = getPanelByName(session.panelName);
        if (!panel) {
            await interaction.update({ content: '⚠️ لم يتم العثور على إعدادات البنل.', components: [] });
            return;
        }

        // إعادة تأكيد الصلاحية (نفس شرط قائمة تحكم الستاف)
        if (!canUseRestrictedControls(interaction.member, session)) {
            await interaction.update({ content: '❌ لا تملك صلاحية تنفيذ هذا الإجراء.', components: [] });
            return;
        }

        const selectedUser = interaction.users.first();

        // ---------------------------------------------------
        // إدخال عضو للتكت
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_add_member_select') {
            await interaction.channel.permissionOverwrites
                .edit(selectedUser.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true })
                .catch(() => {});

            const updatedMembers = [...new Set([...session.addedMembers, selectedUser.id])];
            updateSession(interaction.channel.id, { addedMembers: updatedMembers });
            addAuditLog(interaction.channel.id, `<@${interaction.member.id}> قام بإضافة <@${selectedUser.id}> للتذكرة`);

            await interaction.update({ content: `✅ تمت إضافة <@${selectedUser.id}> للتذكرة.`, components: [] });

            // رسالة "إضافة عضو"
            await sendActionMessage(interaction.channel, panel, 'addMember', await actionContext(interaction, selectedUser.id));
            return;
        }

        // ---------------------------------------------------
        // إخراج عضو من التكت
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_remove_member_select') {
            if (!session.addedMembers.includes(selectedUser.id)) {
                await interaction.update({
                    content: 'ℹ️ هذا العضو لم تتم إضافته يدوياً لهذه التذكرة (لا يمكن إخراج صاحب التكت أو الستاف من هنا).',
                    components: [],
                });
                return;
            }

            await interaction.channel.permissionOverwrites.delete(selectedUser.id).catch(() => {});

            const updatedMembers = session.addedMembers.filter(id => id !== selectedUser.id);
            updateSession(interaction.channel.id, { addedMembers: updatedMembers });
            addAuditLog(interaction.channel.id, `<@${interaction.member.id}> قام بإخراج <@${selectedUser.id}> من التذكرة`);

            await interaction.update({ content: `✅ تم إخراج <@${selectedUser.id}> من التذكرة.`, components: [] });

            // رسالة "إخراج عضو"
            await sendActionMessage(interaction.channel, panel, 'removeMember', await actionContext(interaction, selectedUser.id));
            return;
        }

        // ---------------------------------------------------
        // تحويل ملكية الاستلام
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_transfer_select') {
            const previousClaimer = session.claimedBy;

            if (selectedUser.id === previousClaimer) {
                await interaction.update({ content: 'ℹ️ هذا العضو مستلم التذكرة بالفعل.', components: [] });
                return;
            }

            // سحب صلاحية الرؤية من المستلم القديم (كما هو منصوص: "يفقد المستلم
            // القديم صلاحية رؤية التكت")، ثم منحها للمستلم الجديد
            if (previousClaimer) {
                await revertClaimPermissions(interaction.channel, panel, previousClaimer, session.openerId);
            }
            await applyClaimPermissions(interaction.channel, panel, selectedUser.id);

            const updated = updateSession(interaction.channel.id, { claimedBy: selectedUser.id });
            addAuditLog(
                interaction.channel.id,
                `<@${interaction.member.id}> قام بتحويل استلام التذكرة إلى <@${selectedUser.id}>`
            );

            // تحديث أزرار رسالة التحكم الرئيسية لتعكس المستلم الجديد
            if (updated.controlMessageId) {
                const controlMessage = await interaction.channel.messages.fetch(updated.controlMessageId).catch(() => null);
                if (controlMessage) {
                    const rows = buildTicketControlRows(updated, !!updated.lockedAt);
                    await controlMessage.edit({ components: rows }).catch(() => {});
                }
            }

            await interaction.update({ content: `✅ تم تحويل استلام التذكرة إلى <@${selectedUser.id}>.`, components: [] });

            // رسالة "تحويل الاستلام"
            await sendActionMessage(interaction.channel, panel, 'transferClaim', await actionContext(interaction, selectedUser.id));
            return;
        }
    } catch (error) {
        console.error('[userSelectHandler] حدث خطأ:', error);
        reportError('TICKET_USER_SELECT', interaction.customId || '?', error);
        await interaction.update({ content: '❌ حدث خطأ غير متوقع.', components: [] }).catch(() => {});
    }
}

module.exports = { handleUserSelectMenu };

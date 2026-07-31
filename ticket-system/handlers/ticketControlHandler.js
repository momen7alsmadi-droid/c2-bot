/**
 * =========================================================
 *  handlers/ticketControlHandler.js
 * =========================================================
 * معالج الزرين الأساسيين في رسالة التذكرة: ticket_claim و ticket_lock.
 *
 * القواعد المطبّقة:
 *  - الاستلام: أي عضو ستاف (يملك رتبة staffRoles أو Administrator).
 *  - إلغاء الاستلام: فقط المستلم الحالي أو الإدارة العليا.
 *  - القفل/الفتح: إن كانت التذكرة غير مستلمة -> أي ستاف.
 *                  إن كانت مستلمة -> فقط المستلم أو الإدارة العليا.
 *
 * عند القفل يُرسَل Embed جديد (رسالة إغلاق منفصلة) بزري
 * [فتح] و [حذف] — يُبنى في ticketCloseHandler.js.
 * =========================================================
 */

const { getPanelByName } = require('../database/panelsDB');
const { getSession, updateSession, addAuditLog } = require('./ticketStore');
const { isStaff, canUseRestrictedControls } = require('./permissionUtils');
const { buildTicketControlRows } = require('./ticketControlBuilder');
const {
    applyClaimPermissions,
    revertClaimPermissions,
    applyLockPermissions,
    applyUnlockPermissions,
} = require('./ticketPermissionHelpers');
const { sendClosedStateMessage } = require('./ticketCloseHandler');
const { sendActionMessage } = require('../utils/actionMessages');
const { enrichActionContext } = require('../utils/ticketContext');

const RELEVANT_IDS = ['ticket_claim', 'ticket_lock', 'ticket_reload_menu'];

// سياق المتغيرات المشترك لرسائل الإجراءات
// [actor] = من ضغط الزر = interaction.member
// + [opener] [claimed_by] [ticket_created] [category] من جلسة التذكرة
async function actionContext(interaction) {
    return enrichActionContext(interaction, {
        member: interaction.member,
        guild: interaction.guild,
        channelName: interaction.channel.name,
        channelId: interaction.channel.id,
    });
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleTicketControlButton(interaction) {
    if (!RELEVANT_IDS.includes(interaction.customId)) return;

    try {
        const session = getSession(interaction.channel.id);
        if (!session) {
            await interaction.reply({ content: '⚠️ هذا الروم ليس تذكرة فعّالة.', ephemeral: true });
            return;
        }

        // ---------------------------------------------------
        // زر شكلي "🔄 إعادة تعيين القائمة" — لا يغيّر أي شيء،
        // فقط يعيد بناء الأزرار من الحالة الحالية (منظر) + تأكيد
        // (يوضع قبل فحص البنل حتى يعمل دائماً حتى لو حُذف البنل)
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_reload_menu') {
            await interaction.deferUpdate().catch(() => {});

            const current = getSession(interaction.channel.id);
            if (current) {
                const rows = buildTicketControlRows(current, !!current.lockedAt);
                await interaction.editReply({ components: rows }).catch(() => {});
            }

            await interaction
                .followUp({ content: '🔄 تم إعادة تعيين القائمة بنجاح.', ephemeral: true })
                .catch(() => {});
            return;
        }

        const panel = getPanelByName(session.panelName);
        if (!panel) {
            await interaction.reply({ content: '⚠️ لم يتم العثور على إعدادات البنل الخاص بهذه التذكرة.', ephemeral: true });
            return;
        }

        // ---------------------------------------------------
        // زر الاستلام / إلغاء الاستلام
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_claim') {
            if (!session.claimedBy) {
                // لا يوجد مستلم بعد -> يجب أن يكون الضاغط ستاف
                if (!isStaff(interaction.member, panel)) {
                    await interaction.reply({ content: '❌ هذا الزر مخصص لأعضاء الستاف فقط.', ephemeral: true });
                    return;
                }

                await interaction.deferUpdate().catch(() => {});
                await applyClaimPermissions(interaction.channel, panel, interaction.member.id);

                const updated = updateSession(interaction.channel.id, { claimedBy: interaction.member.id });
                addAuditLog(interaction.channel.id, `<@${interaction.member.id}> قام باستلام التذكرة`);

                const rows = buildTicketControlRows(updated, !!updated.lockedAt);
                await interaction.editReply({ components: rows });

                // رسالة "تم الاستلام" (قابلة للتخصيص/الإطفاء)
                await sendActionMessage(interaction.channel, panel, 'claim', await actionContext(interaction));
                return;
            }

            // يوجد مستلم بالفعل -> فقط هو أو الإدارة العليا يمكنهم إلغاء الاستلام
            if (!canUseRestrictedControls(interaction.member, session)) {
                await interaction.reply({
                    content: `❌ هذه التذكرة مستلمة بالفعل من قبل <@${session.claimedBy}>. فقط المستلم أو الإدارة العليا يمكنهم إلغاء الاستلام.`,
                    ephemeral: true,
                });
                return;
            }

            await interaction.deferUpdate().catch(() => {});
            const previousClaimer = session.claimedBy;
            await revertClaimPermissions(interaction.channel, panel, previousClaimer, session.openerId);

            const updated = updateSession(interaction.channel.id, { claimedBy: null });
            addAuditLog(interaction.channel.id, `<@${interaction.member.id}> قام بإلغاء استلام التذكرة`);

            const rows = buildTicketControlRows(updated, !!updated.lockedAt);
            await interaction.editReply({ components: rows });

            // رسالة "إلغاء الاستلام"
            await sendActionMessage(interaction.channel, panel, 'unclaim', await actionContext(interaction));
            return;
        }

        // ---------------------------------------------------
        // زر القفل / الفتح
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_lock') {
            const requesterAllowed = session.claimedBy
                ? canUseRestrictedControls(interaction.member, session)
                : isStaff(interaction.member, panel);

            if (!requesterAllowed) {
                await interaction.reply({
                    content: '❌ ليس لديك صلاحية لتغيير حالة هذه التذكرة.',
                    ephemeral: true,
                });
                return;
            }

            await interaction.deferUpdate().catch(() => {});

            const currentlyLocked = !!session.lockedAt;

            if (!currentlyLocked) {
                // ---- قفل التذكرة ----
                await applyLockPermissions(interaction.channel, panel, session);
                const updated = updateSession(interaction.channel.id, { lockedAt: Date.now() });
                addAuditLog(interaction.channel.id, `<@${interaction.member.id}> قام بقفل التذكرة`);

                const rows = buildTicketControlRows(updated, true);
                await interaction.editReply({ components: rows });

                // رسالة "قفل التذكرة"
                await sendActionMessage(interaction.channel, panel, 'lock', await actionContext(interaction));

                // إرسال رسالة الإغلاق المنفصلة (زر فتح + زر حذف)
                await sendClosedStateMessage(interaction.channel);
            } else {
                // ---- فتح التذكرة مجدداً من نفس الزر (نادراً ما يُستخدم لأن
                //      إعادة الفتح تتم غالباً من رسالة الإغلاق، لكن نتركه متاحاً) ----
                await applyUnlockPermissions(interaction.channel, panel, session);
                const updated = updateSession(interaction.channel.id, { lockedAt: null });
                addAuditLog(interaction.channel.id, `<@${interaction.member.id}> قام بفتح التذكرة مجدداً`);

                const rows = buildTicketControlRows(updated, false);
                await interaction.editReply({ components: rows });

                // رسالة "فتح التذكرة" (المسار النادر من زر القفل نفسه)
                await sendActionMessage(interaction.channel, panel, 'reopen', await actionContext(interaction));
            }
            return;
        }
    } catch (error) {
        console.error('[ticketControlHandler] حدث خطأ:', error);
        const payload = { content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
}

module.exports = { handleTicketControlButton };

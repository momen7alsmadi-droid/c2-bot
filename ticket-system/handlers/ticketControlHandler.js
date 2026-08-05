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
const { reportError } = require('../../src/utils/errorLogger');
const { safeDeferUpdate } = require('../utils/interactionGuard');
const { getSession, updateSession, getAllSessions, addAuditLog } = require('./ticketStore');
const { commitTicketStats } = require('../database/ticketStatsStore');
const { isStaff, isUpperManagement, canUseRestrictedControls, isAdmin } = require('./permissionUtils');
const { getTicketSettings } = require('../database/ticketSettingsDB');
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

const RELEVANT_IDS = ['ticket_claim', 'ticket_lock'];

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
                // الستاف أو الإدارة العليا يمكنهم الاستلام
                if (!isStaff(interaction.member, panel) && !isUpperManagement(interaction.member, panel)) {
                    await interaction.reply({ content: '❌ هذا الزر مخصص لأعضاء الستاف فقط.', ephemeral: true });
                    return;
                }

                // حد الاستلام المتزامن للستاف من "⚙️ إعدادات عامة"
                // (الإدارة Administrator غير مشمولة — 0 = بدون حد)
                if (!isAdmin(interaction.member)) {
                    const settings = getTicketSettings();
                    if (settings.maxClaimsPerStaff > 0) {
                        const myClaims = getAllSessions().filter(s => s.claimedBy === interaction.member.id);
                        if (myClaims.length >= settings.maxClaimsPerStaff) {
                            await interaction.reply({
                                content: `🚫 وصلت للحد الأقصى من التذاكر المستلمة في نفس الوقت (**${settings.maxClaimsPerStaff}**). ألغِ استلام بعض التذاكر أو أنهِها قبل استلام تذكرة جديدة.`,
                                ephemeral: true,
                            });
                            return;
                        }
                    }
                }

                if (!(await safeDeferUpdate(interaction))) return;
                await applyClaimPermissions(interaction.channel, panel, interaction.member.id);

                const updated = updateSession(interaction.channel.id, {
                    claimedBy: interaction.member.id,
                    claimedAt: Date.now(),
                    lastActivityAt: Date.now(),
                });
                addAuditLog(interaction.channel.id, `<@${interaction.member.id}> قام باستلام التذكرة`);

                const rows = buildTicketControlRows(updated, !!updated.lockedAt);
                await interaction.editReply({ components: rows });

                // رسالة "تم الاستلام" (قابلة للتخصيص/الإطفاء)
                await sendActionMessage(interaction.channel, panel, 'claim', await actionContext(interaction));
                return;
            }

            // يوجد مستلم بالفعل -> فقط هو أو الإدارة العليا يمكنهم إلغاء الاستلام
            if (!canUseRestrictedControls(interaction.member, session, panel)) {
                await interaction.reply({
                    content: `❌ هذه التذكرة مستلمة بالفعل من قبل <@${session.claimedBy}>. فقط المستلم أو الإدارة العليا يمكنهم إلغاء الاستلام.`,
                    ephemeral: true,
                });
                return;
            }

            if (!(await safeDeferUpdate(interaction))) return;
            const previousClaimer = session.claimedBy;
            await revertClaimPermissions(interaction.channel, panel, previousClaimer, session.openerId);

            const updated = updateSession(interaction.channel.id, {
                claimedBy: null,
                claimedAt: null,
                lastActivityAt: Date.now(),
            });
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
                ? canUseRestrictedControls(interaction.member, session, panel)
                : isStaff(interaction.member, panel);

            if (!requesterAllowed) {
                await interaction.reply({
                    content: '❌ ليس لديك صلاحية لتغيير حالة هذه التذكرة.',
                    ephemeral: true,
                });
                return;
            }

            if (!(await safeDeferUpdate(interaction))) return;

            const currentlyLocked = !!session.lockedAt;

            if (!currentlyLocked) {
                // ---- قفل التذكرة ----
                await applyLockPermissions(interaction.channel, panel, session);
                const updated = updateSession(interaction.channel.id, { lockedAt: Date.now() });
                addAuditLog(interaction.channel.id, `<@${interaction.member.id}> قام بقفل التذكرة`);
                // التزام إحصائيات التذكرة (رسائل المشاركين + استلام + نقطة إغلاق + سرعة الاستلام)
                commitTicketStats(updated);

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
                const updated = updateSession(interaction.channel.id, { lockedAt: null, statsCommitted: false, messageCounts: {} });
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
        reportError('TICKET_CONTROL', interaction.customId || '?', error);
        const payload = { content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
}

module.exports = { handleTicketControlButton };

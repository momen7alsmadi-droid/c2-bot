/**
 * =========================================================
 *  handlers/ticketStaffMenuHandler.js
 * =========================================================
 * معالج قائمة "تحكم الستاف" (ticket_staff_menu) داخل التذكرة.
 * محصورة سلفاً بالمستلم/الإدارة عبر setDisabled في الـ Builder،
 * لكن نُعيد التحقق هنا أيضاً كحماية إضافية على مستوى الخادم.
 *
 * بعض الخيارات تُنفَّذ مباشرة (الصور/الملفات، التصعيد)، وبعضها
 * يفتح واجهة فرعية (Modal للاسم، UserSelectMenu مخفي للإضافة/
 * الإخراج/التحويل) لأنها تحتاج مدخلاً إضافياً من المستخدم.
 * =========================================================
 */

const { PermissionFlagsBits, ActionRowBuilder, UserSelectMenuBuilder } = require('discord.js');
const { getPanelByName } = require('../database/panelsDB');
const { getSession, updateSession, addAuditLog } = require('./ticketStore');
const { canUseRestrictedControls } = require('./permissionUtils');
const { buildRenameTicketModal } = require('./modalsBuilder');
const { applyEscalatePermissions } = require('./ticketPermissionHelpers');
const { sendActionMessage } = require('../utils/actionMessages');
const { enrichActionContext } = require('../utils/ticketContext');

/**
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
async function handleTicketStaffMenu(interaction) {
    if (interaction.customId !== 'ticket_staff_menu') return;

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

        // حماية إضافية: هذه القائمة تتطلب استلاماً + أن يكون الضاغط المستلم أو الإدارة
        if (!session.claimedBy || !canUseRestrictedControls(interaction.member, session)) {
            await interaction.reply({
                content: '❌ يجب استلام التذكرة أولاً، ولا يمكن استخدام هذه القائمة إلا من قبل المستلم أو الإدارة العليا.',
                ephemeral: true,
            });
            return;
        }

        const choice = interaction.values[0];

        // ---------------------------------------------------
        // 1) تغيير اسم التكت -> Modal (بدون defer قبله)
        // ---------------------------------------------------
        if (choice === 'rename') {
            await interaction.showModal(buildRenameTicketModal(interaction.channel.name));
            return;
        }

        // ---------------------------------------------------
        // 2) تفعيل / 3) إلغاء إرسال الصور والملفات لصاحب التكت
        // ---------------------------------------------------
        if (choice === 'enable_attachments' || choice === 'disable_attachments') {
            await interaction.deferReply({ ephemeral: true });

            const allow = choice === 'enable_attachments';
            await interaction.channel.permissionOverwrites.edit(session.openerId, {
                AttachFiles: allow,
            });

            addAuditLog(
                interaction.channel.id,
                `<@${interaction.member.id}> قام بـ${allow ? 'تفعيل' : 'إلغاء'} صلاحية إرسال الصور/الملفات لصاحب التكت`
            );

            await interaction.editReply({
                content: allow ? '✅ تم تفعيل إرسال الصور/الملفات لصاحب التكت.' : '✅ تم إلغاء إرسال الصور/الملفات لصاحب التكت.',
            });
            return;
        }

        // ---------------------------------------------------
        // 4) إدخال عضو -> رد مخفي يحوي UserSelectMenu
        // ---------------------------------------------------
        if (choice === 'add_member') {
            const select = new UserSelectMenuBuilder()
                .setCustomId('ticket_add_member_select')
                .setPlaceholder('اختر العضو الذي تريد إضافته للتذكرة...');

            await interaction.reply({
                content: 'اختر العضو الذي تريد إضافته:',
                components: [new ActionRowBuilder().addComponents(select)],
                ephemeral: true,
            });
            return;
        }

        // ---------------------------------------------------
        // 5) إخراج عضو -> رد مخفي يحوي UserSelectMenu
        // ---------------------------------------------------
        if (choice === 'remove_member') {
            if (session.addedMembers.length === 0) {
                await interaction.reply({ content: 'ℹ️ لا يوجد أعضاء تمت إضافتهم يدوياً لإخراجهم.', ephemeral: true });
                return;
            }

            const select = new UserSelectMenuBuilder()
                .setCustomId('ticket_remove_member_select')
                .setPlaceholder('اختر العضو الذي تريد إخراجه من التذكرة...');

            await interaction.reply({
                content: 'اختر العضو الذي تريد إخراجه:',
                components: [new ActionRowBuilder().addComponents(select)],
                ephemeral: true,
            });
            return;
        }

        // ---------------------------------------------------
        // 6) تحويل ملكية الاستلام -> رد مخفي يحوي UserSelectMenu
        // ---------------------------------------------------
        if (choice === 'transfer') {
            const select = new UserSelectMenuBuilder()
                .setCustomId('ticket_transfer_select')
                .setPlaceholder('اختر عضو الستاف الذي تريد تحويل التذكرة له...');

            await interaction.reply({
                content: 'اختر عضو الستاف الذي تريد تحويل الاستلام له:',
                components: [new ActionRowBuilder().addComponents(select)],
                ephemeral: true,
            });
            return;
        }

        // ---------------------------------------------------
        // 7) التحويل للإدارة العليا (Escalate)
        // ---------------------------------------------------
        if (choice === 'escalate') {
            await interaction.deferReply({ ephemeral: true });

            await applyEscalatePermissions(interaction.channel, panel, session.claimedBy);
            updateSession(interaction.channel.id, { escalated: true, claimedBy: null });

            // تغيير اسم القناة ليدل على التصعيد (إن لم يكن معصّعداً بالفعل)
            if (!interaction.channel.name.startsWith('escalated-')) {
                await interaction.channel.setName(`escalated-${interaction.channel.name}`.slice(0, 100)).catch(() => {});
            }

            addAuditLog(interaction.channel.id, `<@${interaction.member.id}> قام بتحويل التذكرة للإدارة العليا (تصعيد)`);

            // رسالة "التحويل للإدارة العليا"
            await sendActionMessage(
                interaction.channel,
                panel,
                'escalate',
                await enrichActionContext(interaction, {
                    member: interaction.member,
                    guild: interaction.guild,
                    channelName: interaction.channel.name,
                    channelId: interaction.channel.id,
                })
            );

            await interaction.editReply({ content: '📢 تم تحويل التذكرة للإدارة العليا بنجاح.' });
            return;
        }
    } catch (error) {
        console.error('[ticketStaffMenuHandler] حدث خطأ:', error);
        const payload = { content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
}

module.exports = { handleTicketStaffMenu };

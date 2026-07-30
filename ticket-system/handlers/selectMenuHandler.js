/**
 * =========================================================
 *  handlers/selectMenuHandler.js
 * =========================================================
 * معالج القوائم المنسدلة من نوع StringSelectMenu فقط.
 * (قوائم الرتب RoleSelectMenu وقوائم الرومات ChannelSelectMenu
 *  لها معالجات منفصلة: roleSelectHandler.js و channelSelectHandler.js
 *  لأنها أنواع تفاعل مختلفة في discord.js v14)
 *
 * محدّث في الجزء الثاني:
 *   - ticket_select_edit         -> يفتح الآن "لوحة إعدادات البنل"
 *                                    فعلياً (بدل رسالة "قيد التطوير")
 *   - settings_select_ticket_system -> حفظ نظام فتح التكت (أزرار/قائمة)
 *   - settings_select_linked_panel  -> ربط/إلغاء ربط بنل آخر
 *
 * ما زال دون تغيير:
 *   - ticket_select_log / delete / send -> لا تزال خارج نطاق الجزء الثاني
 *
 * طريقة الاستخدام (في ملف التشغيل الرئيسي، غير مطلوب هنا):
 *   const { handleTicketSelectMenu } = require('./handlers/selectMenuHandler');
 *   client.on('interactionCreate', async (interaction) => {
 *       if (interaction.isStringSelectMenu()) await handleTicketSelectMenu(interaction);
 *   });
 * =========================================================
 */

const { buildPanelSettings } = require('./panelSettingsBuilder');
const { updatePanel } = require('../database/panelsDB');
const { setSession, getSession } = require('./sessionStore');

async function handleTicketSelectMenu(interaction) {
    const { customId } = interaction;

    const isRelevant =
        customId.startsWith('ticket_select_') ||
        customId === 'settings_select_ticket_system' ||
        customId === 'settings_select_linked_panel';

    if (!isRelevant) return;

    try {
        // ---------------------------------------------------
        // 1) اختيار بنل من قائمة "تعديل تكت" (الجزء الأول)
        //    -> الآن يفتح فعلياً لوحة إعدادات البنل (general)
        // ---------------------------------------------------
        if (customId === 'ticket_select_edit') {
            const selected = interaction.values[0];

            if (selected === 'none') {
                await interaction.reply({
                    content: 'ℹ️ لا توجد أي لوحات تذاكر محفوظة بعد. قم بإنشاء واحدة أولاً عبر زر [إضافة تكت].',
                    ephemeral: true,
                });
                return;
            }

            await interaction.deferUpdate().catch(() => {});

            // نخزّن في الجلسة اسم البنل الذي بدأ الإداري تعديله + الصفحة الافتراضية
            setSession(interaction.message.id, { panelName: selected, page: 'general' });

            const result = buildPanelSettings(selected, 'general');
            if (!result) {
                await interaction.followUp({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true }).catch(() => {});
                return;
            }

            await interaction.editReply(result);
            return;
        }

        // ---------------------------------------------------
        // 2) قائمة "إرسال" -> الآن تُفعَّل فعلياً (الجزء الثالث)
        //    نطلب من الإداري اختيار الروم عبر رد مخفي يحوي
        //    ChannelSelectMenu مستقل (بدون المساس بلوحة الإدارة)
        // ---------------------------------------------------
        if (customId === 'ticket_select_send') {
            const selectedValue = interaction.values[0];

            if (selectedValue === 'none') {
                await interaction.reply({
                    content: 'ℹ️ لا توجد أي لوحات تذاكر محفوظة بعد. أنشئ واحدة أولاً.',
                    ephemeral: true,
                });
                return;
            }

            const { ChannelSelectMenuBuilder, ActionRowBuilder, ChannelType } = require('discord.js');
            const targetSelect = new ChannelSelectMenuBuilder()
                .setCustomId(`ticket_send_target_channel:${selectedValue}`)
                .setPlaceholder('اختر الروم الذي سيُنشر فيه البنل...')
                .addChannelTypes(ChannelType.GuildText);

            await interaction.reply({
                content: `اختر الروم الذي تريد نشر بنل **${selectedValue}** فيه:`,
                components: [new ActionRowBuilder().addComponents(targetSelect)],
                ephemeral: true,
            });
            return;
        }

        // ---------------------------------------------------
        // قوائم "سجل" / "حذف" -> لا تزالان خارج نطاق النظام الحالي
        // ---------------------------------------------------
        if (['ticket_select_log', 'ticket_select_delete'].includes(customId)) {
            const selectedValue = interaction.values[0];

            if (selectedValue === 'none') {
                await interaction.reply({
                    content: 'ℹ️ لا توجد أي لوحات تذاكر محفوظة بعد.',
                    ephemeral: true,
                });
                return;
            }

            await interaction.reply({
                content: `🚧 تم اختيار اللوحة **${selectedValue}**، لكن هذه الميزة ليست ضمن نطاق هذا النظام حالياً.`,
                ephemeral: true,
            });
            return;
        }

        // ---------------------------------------------------
        // 3) قائمة "نظام فتح التكت" (أزرار / قائمة منسدلة)
        // ---------------------------------------------------
        if (customId === 'settings_select_ticket_system') {
            await interaction.deferUpdate().catch(() => {});

            const session = getSession(interaction.message.id);
            if (!session.panelName) return;

            const selectedType = interaction.values[0]; // 'buttons' | 'select'
            updatePanel(session.panelName, { ticketSystemType: selectedType });

            const result = buildPanelSettings(session.panelName, 'general');
            await interaction.editReply(result);
            return;
        }

        // ---------------------------------------------------
        // 4) قائمة "ربط البنلات" (Linked Panels)
        // ---------------------------------------------------
        if (customId === 'settings_select_linked_panel') {
            await interaction.deferUpdate().catch(() => {});

            const session = getSession(interaction.message.id);
            if (!session.panelName) return;

            const selected = interaction.values[0];
            const linkedPanel = selected === 'unlink' || selected === 'none' ? null : selected;
            updatePanel(session.panelName, { linkedPanel });

            const result = buildPanelSettings(session.panelName, 'general');
            await interaction.editReply(result);
            return;
        }
    } catch (error) {
        console.error('[selectMenuHandler] حدث خطأ أثناء معالجة القائمة المنسدلة:', error);

        const errorPayload = { content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(errorPayload).catch(() => {});
        } else {
            await interaction.reply(errorPayload).catch(() => {});
        }
    }
}

module.exports = { handleTicketSelectMenu };

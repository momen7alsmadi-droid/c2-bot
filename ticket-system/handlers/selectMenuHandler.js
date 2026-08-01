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

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { buildPanelSettings } = require('./panelSettingsBuilder');
const { buildSubPanel, buildMainDashboard } = require('./dashboardBuilder');
const { reportError } = require('../../src/utils/errorLogger');
const { safeDeferUpdate } = require('../utils/interactionGuard');
const { getPanelByName, updatePanel } = require('../database/panelsDB');
const { setSession, getSession, clearSession } = require('./sessionStore');
const { buildPublicPanelMessage } = require('./publicPanelBuilder');
const { resolveSession } = require('../utils/panelResolver');
const { ACTION_KEYS } = require('../utils/actionMessages');
const { getImageUrl } = require('../utils/imageLibrary');
const {
    buildRoleButtonModal,
    buildRoleButtonOptionModal,
} = require('./modalsBuilder');
const {
    getRoleButton,
    getRoleOption,
    removeRoleButton,
    removeRoleOption,
} = require('../utils/roleButtons');
const { canUseRoleButton, canUseExclusiveRoleButton } = require('./permissionUtils');
const { getSession: getTicketSession, addAuditLog } = require('./ticketStore');

async function handleTicketSelectMenu(interaction) {
    const { customId } = interaction;

    const isRelevant =
        customId.startsWith('ticket_select_') ||
        customId === 'settings_select_ticket_system' ||
        customId === 'settings_select_linked_panel' ||
        customId === 'settings_select_action' ||
        customId === 'settings_select_panel_image' ||
        customId === 'settings_select_ticket_image' ||
        customId === 'settings_select_claim_color' ||
        customId === 'settings_select_role_button' ||
        customId === 'settings_select_role_btn_option' ||
        customId.startsWith('ticket_role_opt:');

    if (!isRelevant) return;

    /**
     * تحديث رسالة إعدادات البنل بأمان:
     * إذا كان result = null (البنل حُذف/أُعيدت تسميته أو JSON/قاعدة غير متزامنة)
     * نعيد فتح لوحة الإدارة الرئيسية بدل رمي خطأ editReply(null) الغامض:
     *   "Cannot read properties of null (reading 'message')"
     */
    async function safeRebuildSettings(result) {
        if (result) {
            await interaction.editReply(result);
            return true;
        }
        clearSession(interaction.message.id);
        const { embeds, components } = buildMainDashboard();
        await interaction.editReply({ embeds, components }).catch(() => {});
        await interaction.followUp({
            content: '⚠️ لم يتم العثور على هذا البنل (ربما تم حذفه أو إعادة تسميته). تمت إعادة فتح لوحة الإدارة الرئيسية — اختر البنل من جديد.',
            ephemeral: true,
        }).catch(() => {});
        return false;
    }

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

            if (!(await safeDeferUpdate(interaction))) return;

            // نخزّن في الجلسة اسم البنل الذي بدأ الإداري تعديله + الصفحة الافتراضية
            setSession(interaction.message.id, { panelName: selected, page: 'general' });

            let result = buildPanelSettings(selected, 'general');

            // البنل قد يكون أُعيدت تسميته أو حُذف بعد فتح القائمة (قائمة قديمة):
            // 1) نحاول بحثاً مرناً (إزالة المسافات الزائدة)
            if (!result && selected.trim() !== selected) {
                result = buildPanelSettings(selected.trim(), 'general');
            }

            if (!result) {
                // 2) إذا ما زال غير موجود: نحدّث القائمة فوراً بأسماء البنلات الحالية
                //    حتى لا يصل الإداري إلى طريق مسدود ويعيد فتح اللوحة يدوياً
                await interaction.editReply(buildSubPanel('edit')).catch(() => {});
                await interaction.followUp({
                    content: '⚠️ لم يتم العثور على البنل المختار (ربما أُعيدت تسميته أو حُذف). هذه القائمة محدّثة — اختر البنل من جديد.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            await safeRebuildSettings(result);
            return;
        }

        // ---------------------------------------------------
        // 2) قائمة "إرسال" -> الآن تُفعَّل فعلياً (الجزء الثالث)
        //    نطلب من الإداري اختيار الروم عبر رد مخفي يحوي
        //    ChannelSelectMenu مستقل (بدون المساس بلوحة الإدارة)
        // ---------------------------------------------------
        if (customId === 'ticket_select_send') {
            const selectedValues = interaction.values;

            if (selectedValues.includes('none')) {
                await interaction.reply({
                    content: 'ℹ️ لا توجد أي لوحات تذاكر محفوظة بعد. أنشئ واحدة أولاً.',
                    ephemeral: true,
                });
                return;
            }

            const { ChannelSelectMenuBuilder, ActionRowBuilder, ChannelType } = require('discord.js');
            const { storePendingSend } = require('../utils/sendStore');

            // اختيار متعدد: نخزن الأسماء مؤقتاً ونمرر token قصير في الـ customId
            // (لأن حد الـ customId 100 حرف ولا يتسع لعدة أسماء بنلات)
            const token = storePendingSend(selectedValues);
            const targetSelect = new ChannelSelectMenuBuilder()
                .setCustomId(`ticket_send_target_channel:${token}`)
                .setPlaceholder('اختر الروم الذي سيُنشر فيه البنل...')
                .addChannelTypes(ChannelType.GuildText);

            await interaction.reply({
                content:
                    selectedValues.length === 1
                        ? `اختر الروم الذي تريد نشر بنل **${selectedValues[0]}** فيه:`
                        : `اختر الروم الذي تريد نشر **${selectedValues.length} بنلات** معاً فيه (باقة واحدة):`,
                components: [new ActionRowBuilder().addComponents(targetSelect)],
                ephemeral: true,
            });
            return;
        }

        // ---------------------------------------------------
        // قائمة "سجل" -> عرض معلومات البنل + معاينة حية
        // (نفس شكل لوحة الإيمبد: إيمبد أخضر + معاينة)
        // ---------------------------------------------------
        if (customId === 'ticket_select_log') {
            const selectedValue = interaction.values[0];

            if (selectedValue === 'none') {
                await interaction.reply({
                    content: 'ℹ️ لا توجد أي لوحات تذاكر محفوظة بعد.',
                    ephemeral: true,
                });
                return;
            }

            const panel = getPanelByName(selectedValue);
            if (!panel) {
                await interaction.reply({
                    content: '⚠️ لم يتم العثور على هذا البنل، ربما تم حذفه.',
                    ephemeral: true,
                });
                return;
            }

            if (!(await safeDeferUpdate(interaction))) return;

            const infoEmbed = new EmbedBuilder()
                .setColor(0x2ECC71)
                .setTitle('ℹ️ معلومات البنل')
                .addFields(
                    { name: '🏷️ الاسم', value: `${panel.emoji || '🎫'} ${panel.name}`, inline: true },
                    { name: '📨 الحالة', value: panel.enabled ? '🟢 مفعّل' : '🔴 معطّل', inline: true },
                    { name: '🔘 نظام الفتح', value: panel.ticketSystemType === 'select' ? 'قائمة منسدلة' : 'أزرار', inline: true },
                    {
                        name: '🔗 البنلات المرتبطة',
                        value: (panel.linkedPanels || []).length
                            ? (panel.linkedPanels || []).join('، ').slice(0, 1000)
                            : 'لا يوجد',
                        inline: true,
                    },
                    {
                        name: '📅 تاريخ الإنشاء',
                        value: panel.createdAt ? `<t:${Math.floor(panel.createdAt / 1000)}:F>` : 'غير معروف',
                        inline: false,
                    },
                    {
                        name: '🎭 رتب الستاف',
                        value: panel.staffRoles?.length
                            ? panel.staffRoles.map(id => `<@&${id}>`).join(', ')
                            : 'لا يوجد',
                        inline: false,
                    },
                    {
                        name: '📁 الكاتيجوري',
                        value: panel.categoryId ? `<#${panel.categoryId}>` : 'لم يُحدد بعد',
                        inline: true,
                    },
                    {
                        name: '📜 روم اللوق',
                        value: panel.logChannelId ? `<#${panel.logChannelId}>` : 'لم يُحدد بعد',
                        inline: true,
                    },
                )
                .setFooter({ text: `البنل: ${panel.name}` })
                .setTimestamp();

            // معاينة حية لما سيراه الأعضاء (نفس فكرة معاينة لوحة الإيمبد)
            // مع الباقة: نعرض كل إيمبدات البنل + المرتبطين به
            let previewEmbeds = [];
            try {
                previewEmbeds = buildPublicPanelMessage(panel).embeds;
            } catch (err) {
                console.error('[selectMenuHandler] فشل بناء المعاينة:', err.message);
            }

            const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_log_back')
                    .setLabel('🔙 لقائمة السجل')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('ticket_back')
                    .setLabel('🔙 رجوع للرئيسية')
                    .setStyle(ButtonStyle.Secondary),
            );

            await interaction.editReply({
                embeds: [infoEmbed, ...previewEmbeds],
                components: [backRow],
            });
            return;
        }

        // ---------------------------------------------------
        // قائمة "حذف" -> تأكيد الحذف بنفس شكل لوحة الإيمبد
        // (إيمبد أحمر + زر نعم/لا)
        // ---------------------------------------------------
        if (customId === 'ticket_select_delete') {
            const selectedValue = interaction.values[0];

            if (selectedValue === 'none') {
                await interaction.reply({
                    content: 'ℹ️ لا توجد أي لوحات تذاكر محفوظة بعد.',
                    ephemeral: true,
                });
                return;
            }

            const panel = getPanelByName(selectedValue);
            if (!panel) {
                await interaction.reply({
                    content: '⚠️ لم يتم العثور على هذا البنل، ربما تم حذفه.',
                    ephemeral: true,
                });
                return;
            }

            if (!(await safeDeferUpdate(interaction))) return;

            const confirmEmbed = new EmbedBuilder()
                .setTitle('🗑️ تأكيد الحذف')
                .setColor(0xFF0000)
                .setDescription(`هل أنت متأكد من حذف التكت **${selectedValue}**؟`)
                .addFields(
                    { name: '📨 الحالة', value: panel.enabled ? '🟢 مفعّل' : '🔴 معطّل', inline: true },
                    {
                        name: '📅 تاريخ الإنشاء',
                        value: panel.createdAt ? `<t:${Math.floor(panel.createdAt / 1000)}:F>` : 'غير معروف',
                        inline: true,
                    },
                )
                .setTimestamp();

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_delete_yes:${selectedValue}`)
                    .setLabel('✅ نعم، احذف')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('ticket_delete_no')
                    .setLabel('❌ لا، تراجع')
                    .setStyle(ButtonStyle.Secondary),
            );

            await interaction.editReply({ embeds: [confirmEmbed], components: [confirmRow] });
            return;
        }

        // ---------------------------------------------------
        // 3) قائمة "نظام فتح التكت" (أزرار / قائمة منسدلة)
        // ---------------------------------------------------
        if (customId === 'settings_select_ticket_system') {
            if (!(await safeDeferUpdate(interaction))) return;

            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.followUp({
                    content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            const selectedType = interaction.values[0]; // 'buttons' | 'select'
            updatePanel(session.panelName, { ticketSystemType: selectedType });

            const result = buildPanelSettings(session.panelName, 'general');
            await safeRebuildSettings(result);
            return;
        }

        // ---------------------------------------------------
        // 4) قائمة "ربط البنلات" (Linked Panels)
        // ---------------------------------------------------
        if (customId === 'settings_select_linked_panel') {
            if (!(await safeDeferUpdate(interaction))) return;

            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.followUp({
                    content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            // اختيار متعدد: values = مصفوفة أسماء البنلات المرتبطة مباشرة
            const linkedPanels = interaction.values.filter(v => v !== 'none');
            updatePanel(session.panelName, { linkedPanels });

            const result = buildPanelSettings(session.panelName, 'general');
            await safeRebuildSettings(result);
            return;
        }

        // ---------------------------------------------------
        // اختيار إجراء من صفحة "رسائل الأزرار"
        // نحفظ الإجراء المحدد في الجلسة ثم نعيد بناء الصفحة
        // ليظهر الإجراء المحدد + أزرار التعديل/التبديل تعمل عليه
        // ---------------------------------------------------
        if (customId === 'settings_select_action') {
            if (!(await safeDeferUpdate(interaction))) return;

            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.followUp({
                    content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            const actionKey = interaction.values[0];
            if (!ACTION_KEYS.includes(actionKey)) return;

            setSession(interaction.message.id, { actionKey });

            const result = buildPanelSettings(session.panelName, 'actions', actionKey);
            await safeRebuildSettings(result);
            return;
        }

        // ---------------------------------------------------
        // تغيير لون زر الاستلام في التكت (من صفحة رسائل الأزرار)
        // ---------------------------------------------------
        if (customId === 'settings_select_claim_color') {
            if (!(await safeDeferUpdate(interaction))) return;

            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.followUp({
                    content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            const color = interaction.values[0];
            if (!['success', 'primary', 'danger', 'secondary'].includes(color)) return;

            updatePanel(session.panelName, { claimButtonColor: color });

            const result = buildPanelSettings(session.panelName, 'actions', session.actionKey);
            await safeRebuildSettings(result);
            return;
        }

        // ---------------------------------------------------
        // 6) اختيار صورة من مكتبة الصور (البنل العام / إيمبد التكت)
        //    القيم: 'none' = إزالة الصورة | اسم صورة من المكتبة
        // ---------------------------------------------------
        if (customId === 'settings_select_panel_image' || customId === 'settings_select_ticket_image') {
            if (!(await safeDeferUpdate(interaction))) return;

            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.followUp({
                    content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            const selected = interaction.values[0];
            const field = customId === 'settings_select_panel_image' ? 'panelMessage' : 'ticketEmbed';

            const panel = getPanelByName(session.panelName);
            if (!panel) {
                await interaction.followUp({
                    content: '⚠️ لم يتم العثور على هذا البنل. أعد فتح اللوحة الرئيسية.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            let image = null;
            if (selected !== 'none') {
                const url = getImageUrl(selected);
                if (!url) {
                    await interaction.followUp({
                        content: `⚠️ لم يتم العثور على صورة باسم **${selected}** في المكتبة.`,
                        ephemeral: true,
                    }).catch(() => {});
                    return;
                }
                image = url;
            }

            const current = panel[field] || {};
            updatePanel(session.panelName, { [field]: { ...current, image } });

            const result = buildPanelSettings(session.panelName, 'images');
            await safeRebuildSettings(result);
            return;
        }

        // ---------------------------------------------------
        // 7) صفحة أزرار الرتب: اختيار الزر (أو إنشاء/حذف)
        //    ملاحظة: الإنشاء يفتح Modal فلا يجوز defer قبله
        // ---------------------------------------------------
        if (customId === 'settings_select_role_button') {
            const val = interaction.values[0];
            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.reply({
                    content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            if (val === '__create__') {
                const panel = getPanelByName(session.panelName);
                if (!panel) {
                    await interaction.reply({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true }).catch(() => {});
                    return;
                }
                await interaction.showModal(buildRoleButtonModal(panel));
                return;
            }

            if (!(await safeDeferUpdate(interaction))) return;

            if (val === '__delete__') {
                if (session.roleBtnId) removeRoleButton(session.panelName, session.roleBtnId);
                setSession(interaction.message.id, { roleBtnId: null, roleOptId: null });
                const result = buildPanelSettings(session.panelName, 'roleButtons');
                await safeRebuildSettings(result);
                return;
            }

            if (val === 'none') return;

            setSession(interaction.message.id, { roleBtnId: val, roleOptId: null });
            const result = buildPanelSettings(session.panelName, 'roleButtons', null, val, null);
            await safeRebuildSettings(result);
            return;
        }

        // ---------------------------------------------------
        // 8) صفحة أزرار الرتب: اختيار الخيار (أو إضافة/حذف)
        // ---------------------------------------------------
        if (customId === 'settings_select_role_btn_option') {
            const val = interaction.values[0];
            const session = resolveSession(interaction);
            if (!session.panelName || !session.roleBtnId) {
                await interaction.reply({
                    content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            if (val === '__add_option__') {
                try {
                    await interaction.showModal(buildRoleButtonOptionModal(session.roleBtnId));
                } catch (e) {
                    // إذا فشل فتح النافذة (تفاعل مستهلك مثلاً) نوجه المستخدم بدلاً من خطأ غامض
                    console.error('[selectMenuHandler] فشل فتح نافذة إضافة الخيار:', e.message);
                    await interaction.reply({
                        content: '⚠️ تعذر فتح نافذة الإضافة. اختر الزر من القائمة مرة أخرى ثم أعد المحاولة.',
                        ephemeral: true,
                    }).catch(() => {});
                }
                return;
            }

            if (!(await safeDeferUpdate(interaction))) return;

            if (val === '__delete_option__') {
                if (session.roleOptId) removeRoleOption(session.panelName, session.roleBtnId, session.roleOptId);
                setSession(interaction.message.id, { roleOptId: null });
                const result = buildPanelSettings(session.panelName, 'roleButtons', null, session.roleBtnId, null);
                await safeRebuildSettings(result);
                return;
            }

            if (val === 'none') return;

            setSession(interaction.message.id, { roleOptId: val });
            const result = buildPanelSettings(session.panelName, 'roleButtons', null, session.roleBtnId, val);
            await safeRebuildSettings(result);
            return;
        }

        // ---------------------------------------------------
        // 9) اختيار رتبة من قائمة "زر الرتبة" داخل التكت:
        //    إعطاء رتبة الخيار لصاحب التكت (الوضع الحصري يزيل
        //    الرتب الأخرى من خيارات نفس الزر أولاً)
        // ---------------------------------------------------
        if (customId.startsWith('ticket_role_opt:')) {
            const btnId = customId.split(':')[1];
            const optId = interaction.values[0];

            if (!(await safeDeferUpdate(interaction))) return;

            const ticketSession = getTicketSession(interaction.channel.id);
            const panel = ticketSession && ticketSession.panelName ? getPanelByName(ticketSession.panelName) : null;
            const button = panel ? getRoleButton(panel, btnId) : null;
            const option = button ? getRoleOption(button, optId) : null;

            if (!ticketSession || !panel || !button || !option) {
                await interaction.followUp({
                    content: '⚠️ لم يتم العثور على هذا الخيار أو أن التذكرة غير نشطة.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            // إعادة فحص الصلاحيات (أمان: لا نعتمد على الرسالة فقط)
            if (!canUseRoleButton(interaction.member, panel, button)) {
                await interaction.followUp({
                    content: '⛔ لا تملك صلاحية استخدام هذا الزر.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }
            if (button.exclusive && !canUseExclusiveRoleButton(interaction.member, ticketSession, panel)) {
                await interaction.followUp({
                    content: '⛔ هذا الزر حصري: يستخدمه فقط من استلم التكت أو الإدارة العليا.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }
            if (!option.roleId) {
                await interaction.followUp({
                    content: '❌ لم تُعيّن رتبة لهذا الخيار بعد (من إعدادات البنل).',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            const role = interaction.guild.roles.cache.get(option.roleId);
            if (!role) {
                await interaction.followUp({
                    content: '❌ الرتبة المرتبطة بهذا الخيار لم تعد موجودة في السيرفر.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            const opener = await interaction.guild.members
                .fetch(ticketSession.openerId)
                .catch(() => null);
            if (!opener) {
                await interaction.followUp({
                    content: '❌ لم يتم العثور على صاحب التكت لمنحه الرتبة.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            // الوضع الحصري: إزالة رتب الخيارات الأخرى من نفس الزر
            if (button.exclusive) {
                for (const o of button.options || []) {
                    if (o.roleId && o.roleId !== option.roleId && opener.roles.cache.has(o.roleId)) {
                        await opener.roles.remove(o.roleId).catch(() => {});
                    }
                }
            }

            await opener.roles.add(option.roleId).catch(async err => {
                console.error('[selectMenuHandler] فشل منح الرتبة:', err.message);
                await interaction.followUp({
                    content: `❌ فشل منح الرتبة: \`${err.message}\``,
                    ephemeral: true,
                }).catch(() => {});
            });

            // إن كانت الرتبة أُعطيت بنجاح (أو كانت موجودة أصلاً) نؤكد
            const granted = opener.roles.cache.has(option.roleId);
            if (granted) {
                addAuditLog(
                    interaction.channel.id,
                    `<@${interaction.user.id}> منح ${opener} رتبة ${role.name}${button.exclusive ? ' (حصري)' : ''}`
                );

                const confirmEmbed = new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setTitle('✅ تم منح الرتبة')
                    .setDescription(
                        `**${opener}** حصل على رتبة **${role.name}**` +
                        (button.exclusive
                            ? '\n🔄 الوضع الحصري: أُزيلت الرتب الأخرى من خيارات هذا الزر.'
                            : '')
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [confirmEmbed], components: [] }).catch(() => {});
            }
            return;
        }
    } catch (error) {
        console.error('[selectMenuHandler] حدث خطأ أثناء معالجة القائمة المنسدلة:', error);
        reportError('TICKET_SELECT', interaction.customId || '?', error);

        // نعرض المكدس (أول سطور) حتى يعرف الإداري مكان الخطأ بالضبط
        const stackPreview = (error.stack || error.message || '').split('\n').slice(0, 4).join('\n');
        const errorPayload = {
            content: `❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.\n\`\`\`${error.message}\n${stackPreview}\`\`\``,
            ephemeral: true,
        };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(errorPayload).catch(() => {});
        } else {
            await interaction.reply(errorPayload).catch(() => {});
        }
    }
}

module.exports = { handleTicketSelectMenu };

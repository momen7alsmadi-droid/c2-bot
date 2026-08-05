/**
 * =========================================================
 *  handlers/buttonHandler.js
 * =========================================================
 * معالج جميع أزرار لوحة تحكم التذاكر.
 *
 * محدّث في الجزء الثاني ليشمل:
 *   - ticket_add               -> فتح Modal إنشاء بنل جديد
 *   - settings_page_*          -> التنقل بين صفحات إعدادات البنل
 *   - settings_page_back       -> الرجوع للوحة الرئيسية (ومسح الجلسة)
 *   - settings_edit_name_desc  -> فتح Modal تعديل الاسم/الوصف/الإيموجي
 *   - settings_edit_welcome    -> فتح Modal تعديل رسالة الترحيب
 *   - settings_toggle_enabled  -> تفعيل/تعطيل البنل مباشرة
 *
 * من الجزء الأول (بدون تغيير في المنطق):
 *   - ticket_edit / ticket_log / ticket_delete / ticket_send
 *   - ticket_back
 *
 * ⚠️ الميكانيكية الأساسية:
 * كل الأزرار تعمل عبر update()/editReply() على نفس الرسالة،
 * ما عدا حالة فتح Modal التي تتطلب استخدام showModal() مباشرة
 * (بدون deferUpdate قبلها، لأن Discord يرفض فتح Modal بعد defer).
 *
 * طريقة الاستخدام (في ملف التشغيل الرئيسي، غير مطلوب هنا):
 *   const { handleTicketButton } = require('./handlers/buttonHandler');
 *   client.on('interactionCreate', async (interaction) => {
 *       if (interaction.isButton()) await handleTicketButton(interaction);
 *   });
 * =========================================================
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const { reportError } = require('../../src/utils/errorLogger');
const { safeDeferUpdate } = require('../utils/interactionGuard');
const { buildMainDashboard, buildSubPanel, buildTicketSettingsPage } = require('./dashboardBuilder');
const { buildPanelSettings } = require('./panelSettingsBuilder');
const {
    buildCreatePanelModal,
    buildEditNameDescModal,
    buildWelcomeMessageModal,
    buildPanelMessageModal,
    buildTicketEmbedModal,
    buildTicketNameModal,
    buildActionMessageModal,
    buildRoleButtonColorModal,
    buildTicketSettingModal,
} = require('./modalsBuilder');
const { getPanelByName, updatePanel, deletePanel } = require('../database/panelsDB');
const { getTicketSettings, updateTicketSettings } = require('../database/ticketSettingsDB');
const { getSession, setSession, clearSession } = require('./sessionStore');
const { resolvePanel, resolveSession } = require('../utils/panelResolver');
const { getActionMessage } = require('../utils/actionMessages');
const { getRoleButton, toggleRoleButtonEnabled, toggleRoleButtonExclusive } = require('../utils/roleButtons');
const { canUseRoleButton, canUseExclusiveRoleButton } = require('./permissionUtils');
const { getSession: getTicketSession } = require('./ticketStore');
const { appendDecorativeOption } = require('../../src/utils/decorativeReset');
const { applyMessageVariables } = require('../utils/messageVariables');
const { enrichActionContext } = require('../utils/ticketContext');

// خريطة تربط كل customId (الجزء الأول) بنوع اللوحة الفرعية المطلوب بناؤها
const SUB_PANEL_MAP = {
    ticket_edit: 'edit',
    ticket_log: 'log',
    ticket_delete: 'delete',
    ticket_send: 'send',
};

// أزرار التنقل بين صفحات إعدادات البنل (الجزء الثاني)
const SETTINGS_PAGE_IDS = [
    'settings_page_general',
    'settings_page_roles',
    'settings_page_roles2',
    'settings_page_channels',
    'settings_page_messages',
    'settings_page_actions',
    'settings_page_images',
    'settings_page_role_buttons',
];

/**
 * الدالة الرئيسية لمعالجة أزرار نظام التذاكر
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleTicketButton(interaction) {
    const relevantIds = [
        'ticket_add',
        'ticket_back',
        'ticket_settings',
        'ticket_settings_max_open',
        'ticket_settings_max_panel',
        'ticket_settings_cooldown',
        'ticket_settings_max_claims',
        'ticket_settings_claim_sla',
        'ticket_settings_auto_close',
        'ticket_settings_auto_close_idle',
        'ticket_settings_auto_close_grace',
        'ticket_settings_auto_close_action',
        'ticket_settings_delete_countdown',
        'ticket_settings_number_start',
        'ticket_settings_archive',
        'ticket_settings_maintenance',
        'ticket_settings_maintenance_msg',
        'settings_page_back',
        'settings_edit_name_desc',
        'settings_edit_welcome',
        'settings_edit_panel_message',
        'settings_edit_ticket_embed',
        'settings_edit_ticket_name',
        'settings_edit_action',
        'settings_toggle_action',
        'settings_toggle_enabled',
        'settings_toggle_role_btn',
        'settings_toggle_role_btn_exclusive',
        'settings_role_btn_custom_color',
        'settings_save',
        'ticket_log_back',
        'ticket_delete_no',
        ...Object.keys(SUB_PANEL_MAP),
        ...SETTINGS_PAGE_IDS,
    ];
    if (!relevantIds.includes(interaction.customId) &&
        !interaction.customId.startsWith('ticket_delete_yes:') &&
        !interaction.customId.startsWith('ticket_role_btn:')) return;

    try {
        // ---------------------------------------------------
        // 1) زر "إضافة تكت" -> فتح Modal إنشاء بنل جديد
        //    (لا defer هنا إطلاقاً، showModal يجب أن يكون أول رد)
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_add') {
            await interaction.showModal(buildCreatePanelModal());
            return;
        }

        // ---------------------------------------------------
        // 1-ب) صفحة "⚙️ إعدادات عامة" (الحدود + الكولداون)
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_settings') {
            await interaction.update(buildTicketSettingsPage());
            return;
        }

        // أزرار الإعدادات العامة: كل زر يفتح نافذة إدخال القيمة
        const SETTINGS_KEY_MAP = {
            ticket_settings_max_open: 'maxOpenPerUser',
            ticket_settings_max_panel: 'maxOpenPerPanelPerUser',
            ticket_settings_cooldown: 'openCooldownMinutes',
            ticket_settings_max_claims: 'maxClaimsPerStaff',
            ticket_settings_claim_sla: 'claimSlaMinutes',
            ticket_settings_auto_close_idle: 'autoCloseIdleHours',
            ticket_settings_auto_close_grace: 'autoCloseGraceHours',
            ticket_settings_delete_countdown: 'deleteCountdownSeconds',
            ticket_settings_number_start: 'ticketNumberStart',
            ticket_settings_maintenance_msg: 'maintenanceMessage',
        };
        if (SETTINGS_KEY_MAP[interaction.customId]) {
            await interaction.showModal(buildTicketSettingModal(SETTINGS_KEY_MAP[interaction.customId]));
            return;
        }

        // أزرار التشغيل/الإيقاف (Toggle) للإعدادات المنطقية
        const TOGGLE_MAP = {
            ticket_settings_auto_close: 'autoCloseEnabled',
            ticket_settings_archive: 'archiveOnDelete',
            ticket_settings_maintenance: 'maintenanceEnabled',
        };
        if (TOGGLE_MAP[interaction.customId]) {
            if (!(await safeDeferUpdate(interaction))) return;
            const settings = getTicketSettings();
            const key = TOGGLE_MAP[interaction.customId];
            updateTicketSettings({ [key]: settings[key] ? 0 : 1 });
            await interaction.editReply(buildTicketSettingsPage());
            return;
        }

        // زر تبديل إجراء الخمول: قفل ↔ حذف نهائي
        if (interaction.customId === 'ticket_settings_auto_close_action') {
            if (!(await safeDeferUpdate(interaction))) return;
            const settings = getTicketSettings();
            updateTicketSettings({
                autoCloseAction: settings.autoCloseAction === 'delete' ? 'lock' : 'delete',
            });
            await interaction.editReply(buildTicketSettingsPage());
            return;
        }

        // ---------------------------------------------------
        // 2) زر "رجوع" (من اللوحات الفرعية في الجزء الأول)
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_back') {
            if (!(await safeDeferUpdate(interaction))) return;
            const { embeds, components } = buildMainDashboard();
            await interaction.editReply({ embeds, components });
            return;
        }

        // ---------------------------------------------------
        // 3) زر "رجوع للوحة الرئيسية" من داخل إعدادات البنل
        //    -> نمسح الجلسة الخاصة بهذه الرسالة أيضاً
        // ---------------------------------------------------
        if (interaction.customId === 'settings_page_back') {
            if (!(await safeDeferUpdate(interaction))) return;
            clearSession(interaction.message.id);
            const { embeds, components } = buildMainDashboard();
            await interaction.editReply({ embeds, components });
            return;
        }

        // ---------------------------------------------------
        // 4) الأزرار الأربعة من الجزء الأول (تعديل/سجل/حذف/إرسال)
        //    نمرر النتيجة كاملة (content + embeds + components)
        // ---------------------------------------------------
        if (SUB_PANEL_MAP[interaction.customId]) {
            if (!(await safeDeferUpdate(interaction))) return;
            const type = SUB_PANEL_MAP[interaction.customId];
            const result = buildSubPanel(type);
            await interaction.editReply(result);
            return;
        }

        // ---------------------------------------------------
        // 4.5) زر رجوع من عرض "سجل التكت" -> لقائمة السجل
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_log_back') {
            if (!(await safeDeferUpdate(interaction))) return;
            const result = buildSubPanel('log');
            await interaction.editReply(result);
            return;
        }

        // ---------------------------------------------------
        // 4.6) زر [❌ لا، تراجع] بعد تأكيد الحذف -> لقائمة الحذف
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_delete_no') {
            if (!(await safeDeferUpdate(interaction))) return;
            const result = buildSubPanel('delete');
            await interaction.editReply(result);
            return;
        }

        // ---------------------------------------------------
        // 4.7) زر [✅ نعم، احذف] -> تنفيذ الحذف (نفس شكل لوحة الإيمبد)
        // ---------------------------------------------------
        if (interaction.customId.startsWith('ticket_delete_yes:')) {
            const name = interaction.customId.split(':')[1];
            if (!(await safeDeferUpdate(interaction))) return;

            const success = deletePanel(name);
            if (success) {
                await interaction.editReply({
                    content: `✅ تم حذف التكت **${name}** بنجاح.`,
                    embeds: [],
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('ticket_back')
                                .setLabel('🔙 رجوع للرئيسية')
                                .setStyle(ButtonStyle.Secondary)
                        ),
                    ],
                });
            } else {
                await interaction.followUp({ content: '❌ فشل حذف التكت.', ephemeral: true }).catch(() => {});
            }
            return;
        }

        // ---------------------------------------------------
        // 5) أزرار التنقل بين صفحات إعدادات البنل
        //    نعتمد على sessionStore لمعرفة أي بنل نحن نعدّله الآن
        // ---------------------------------------------------
        if (SETTINGS_PAGE_IDS.includes(interaction.customId)) {
            if (!(await safeDeferUpdate(interaction))) return;

            const session = resolveSession(interaction);
            if (!session.panelName) {
                // حماية إضافية: إذا فُقدت الجلسة ولم يوجد التذييل
                await interaction.followUp({
                    content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            const page = interaction.customId.replace('settings_page_', ''); // general/roles/channels/messages
            // نصلّح الجلسة بصراحة (الاسم من الجلسة أو من التذييل)
            setSession(interaction.message.id, { panelName: session.panelName, page });

            // في صفحة رسائل الأزرار نمرر الإجراء المحدد لعرض تفاصيله ومعاينته
            const result = buildPanelSettings(session.panelName, page, session.actionKey, session.roleBtnId, session.roleOptId);
            if (!result) {
                // البنل حُذف أو أُعيدت تسميته بعد فتح الصفحة (رسالة قديمة):
                // بدل ترك الإداري في طريق مسدود نعيد فتح لوحة الإدارة الرئيسية
                clearSession(interaction.message.id);
                const { embeds, components } = buildMainDashboard();
                await interaction.editReply({ embeds, components }).catch(() => {});
                await interaction.followUp({
                    content: '⚠️ لم يتم العثور على هذا البنل (ربما تم حذفه أو إعادة تسميته). تمت إعادة فتح لوحة الإدارة الرئيسية — اختر البنل من جديد.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            await interaction.editReply(result);
            return;
        }

        // ---------------------------------------------------
        // 6) زر "تعديل الاسم والوصف" -> فتح Modal (بدون defer)
        // ---------------------------------------------------
        if (interaction.customId === 'settings_edit_name_desc') {
            const panel = resolvePanel(interaction);
            if (!panel) {
                await interaction.reply({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true });
                return;
            }
            await interaction.showModal(buildEditNameDescModal(panel));
            return;
        }

        // ---------------------------------------------------
        // 7) زر "تخصيص رسالة الترحيب" -> فتح Modal (بدون defer)
        // ---------------------------------------------------
        if (interaction.customId === 'settings_edit_welcome') {
            const panel = resolvePanel(interaction);
            if (!panel) {
                await interaction.reply({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true });
                return;
            }
            await interaction.showModal(buildWelcomeMessageModal(panel));
            return;
        }

        // ---------------------------------------------------
        // 7-ب) زر "تخصيص رسالة البنل العامة" -> فتح Modal (بدون defer)
        //      الإيمبد المنشور مع زر/قائمة فتح التكت أصبح قابلاً
        //      للتخصيص: العنوان + الوصف + التذييل + اللون
        // ---------------------------------------------------
        if (interaction.customId === 'settings_edit_panel_message') {
            const panel = resolvePanel(interaction);
            if (!panel) {
                await interaction.reply({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true });
                return;
            }
            await interaction.showModal(buildPanelMessageModal(panel));
            return;
        }

        // ---------------------------------------------------
        // 7-ج) زر "تخصيص إيمبد التكت" -> فتح Modal (بدون defer)
        //      الإيمبد فوق الأزرار داخل التكت: العنوان + الكلام
        //      + الصورة + اللون (كل النصوص تدعم المتغيرات)
        // ---------------------------------------------------
        if (interaction.customId === 'settings_edit_ticket_embed') {
            const panel = resolvePanel(interaction);
            if (!panel) {
                await interaction.reply({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true });
                return;
            }
            await interaction.showModal(buildTicketEmbedModal(panel));
            return;
        }

        // ---------------------------------------------------
        // 7-د) زر "تخصيص اسم التكت" -> فتح Modal (بدون defer)
        //      قالب اسم روم التذكرة يدعم المتغيرات
        // ---------------------------------------------------
        if (interaction.customId === 'settings_edit_ticket_name') {
            const panel = resolvePanel(interaction);
            if (!panel) {
                await interaction.reply({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true });
                return;
            }
            await interaction.showModal(buildTicketNameModal(panel));
            return;
        }

        // ---------------------------------------------------
        // 7-هـ) زر "تعديل رسالة الإجراء" -> فتح Modal
        //      يعمل على الإجراء المحدد في الجلسة (session.actionKey)
        // ---------------------------------------------------
        if (interaction.customId === 'settings_edit_action') {
            const session = resolveSession(interaction);
            if (!session.panelName || !session.actionKey) {
                await interaction.reply({ content: '⚠️ اختر إجراءً من القائمة أولاً.', ephemeral: true });
                return;
            }
            const panel = getPanelByName(session.panelName);
            if (!panel) {
                await interaction.reply({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true });
                return;
            }
            await interaction.showModal(buildActionMessageModal(panel, session.actionKey));
            return;
        }

        // ---------------------------------------------------
        // 7-و) زر "تفعيل / إطفاء" رسالة الإجراء المحدد
        // ---------------------------------------------------
        if (interaction.customId === 'settings_toggle_action') {
            if (!(await safeDeferUpdate(interaction))) return;

            const session = resolveSession(interaction);
            if (!session.panelName || !session.actionKey) {
                await interaction.followUp({ content: '⚠️ اختر إجراءً من القائمة أولاً.', ephemeral: true }).catch(() => {});
                return;
            }
            const panel = getPanelByName(session.panelName);
            if (!panel) {
                await interaction.followUp({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true }).catch(() => {});
                return;
            }

            const current = panel.actionMessages || {};
            const currentMsg = current[session.actionKey] || {};
            const wasEnabled = getActionMessage(panel, session.actionKey).enabled;
            updatePanel(session.panelName, {
                actionMessages: {
                    ...current,
                    [session.actionKey]: { ...currentMsg, enabled: !wasEnabled },
                },
            });

            const result = buildPanelSettings(session.panelName, 'actions', session.actionKey);
            await interaction.editReply(result);
            return;
        }

        // ---------------------------------------------------
        // 7-ز) تبديل تفعيل/إطفاء زر الرتبة المحدد (مطفأ = مخفي)
        // ---------------------------------------------------
        if (interaction.customId === 'settings_toggle_role_btn') {
            if (!(await safeDeferUpdate(interaction))) return;

            const session = resolveSession(interaction);
            if (!session.panelName || !session.roleBtnId) {
                await interaction.followUp({ content: '⚠️ اختر زر رتبة من القائمة أولاً.', ephemeral: true }).catch(() => {});
                return;
            }

            toggleRoleButtonEnabled(session.panelName, session.roleBtnId);
            const result = buildPanelSettings(session.panelName, 'roleButtons', null, session.roleBtnId, session.roleOptId);
            await interaction.editReply(result);
            return;
        }

        // ---------------------------------------------------
        // 7-ح) تبديل الوضع الحصري لزر الرتبة (رتبة واحدة/متعدد)
        // ---------------------------------------------------
        if (interaction.customId === 'settings_toggle_role_btn_exclusive') {
            if (!(await safeDeferUpdate(interaction))) return;

            const session = resolveSession(interaction);
            if (!session.panelName || !session.roleBtnId) {
                await interaction.followUp({ content: '⚠️ اختر زر رتبة من القائمة أولاً.', ephemeral: true }).catch(() => {});
                return;
            }

            toggleRoleButtonExclusive(session.panelName, session.roleBtnId);
            const result = buildPanelSettings(session.panelName, 'roleButtons', null, session.roleBtnId, session.roleOptId);
            await interaction.editReply(result);
            return;
        }

        // ---------------------------------------------------
        // 7-ط-0) زر "🎨 لون مخصص" لزر الرتبة: فتح Modal إدخال Hex
        // ---------------------------------------------------
        if (interaction.customId === 'settings_role_btn_custom_color') {
            const session = resolveSession(interaction);
            if (!session.panelName || !session.roleBtnId) {
                await interaction.reply({ content: '⚠️ اختر زر رتبة من القائمة أولاً.', ephemeral: true });
                return;
            }
            await interaction.showModal(buildRoleButtonColorModal(session.roleBtnId));
            return;
        }

        // ---------------------------------------------------
        // 7-ط) زر رتبة مخصص داخل التكت: رسالة مخفية + قائمة منسدلة
        //      اختيار خيار = إعطاء رتبته لصاحب التكت
        // ---------------------------------------------------
        if (interaction.customId.startsWith('ticket_role_btn:')) {
            const btnId = interaction.customId.split(':')[1];

            const ticketSession = getTicketSession(interaction.channel.id);
            const panel = ticketSession && ticketSession.panelName ? getPanelByName(ticketSession.panelName) : null;
            const button = panel ? getRoleButton(panel, btnId) : null;

            if (!ticketSession || !panel || !button) {
                await interaction.reply({
                    content: '⚠️ لم يتم العثور على هذا الزر أو أن التذكرة غير نشطة.',
                    ephemeral: true,
                });
                return;
            }

            // فحص الصلاحيات: الإدارة العليا دائماً، ثم الرتب المسموحة، ثم الستاف
            if (!canUseRoleButton(interaction.member, panel, button)) {
                await interaction.reply({
                    content: '⛔ لا تملك صلاحية استخدام هذا الزر.',
                    ephemeral: true,
                });
                return;
            }

            // الوضع الحصري: فقط من استلم التكت أو الإدارة العليا
            if (button.exclusive && !canUseExclusiveRoleButton(interaction.member, ticketSession, panel)) {
                await interaction.reply({
                    content: '⛔ هذا الزر حصري: يستخدمه فقط من استلم التكت أو الإدارة العليا.',
                    ephemeral: true,
                });
                return;
            }

            const options = (button.options || []).filter(o => o.roleId);
            if (options.length === 0) {
                await interaction.reply({
                    content: '❌ لا توجد خيارات برتب معيّنة لهذا الزر بعد.',
                    ephemeral: true,
                });
                return;
            }

            // سياق المتغيرات: من ضغط الزر + بيانات التذكرة (الفاتح/المستلم/الكاتيجوري)
            // [user]/[actor] = من ضغط الزر • [member] = صاحب التكت (المستلم للرتبة)
            const context = await enrichActionContext(interaction, {
                member: interaction.member,
                guild: interaction.guild,
                channelName: interaction.channel?.name,
                channelId: interaction.channel?.id,
                targetMention: ticketSession.openerId ? `<@${ticketSession.openerId}>` : undefined,
            });

            const menu = new StringSelectMenuBuilder()
                .setCustomId(`ticket_role_opt:${btnId}`)
                .setPlaceholder('اختر رتبة...')
                .setMaxValues(1)
                .addOptions(
                    options.slice(0, 25).map(o => ({
                        label: String(applyMessageVariables(o.label, context) || 'خيار').slice(0, 100),
                        value: o.id,
                        emoji: '🎖️',
                        description: String(applyMessageVariables(o.description || '', context)).slice(0, 100) || undefined,
                    }))
                );

            const pickerColor = /^#[0-9A-Fa-f]{6}$/.test(button.color || '')
                ? parseInt(button.color.slice(1), 16)
                : 0x2b2d31;

            const embed = new EmbedBuilder()
                .setColor(pickerColor)
                .setTitle(String(applyMessageVariables(button.label, context) || '🎖️ اختر رتبة').slice(0, 256))
                .setDescription('اختر خياراً من القائمة المنسدلة بالأسفل — ستحصل على الرتبة المحددة له.')
                .setFooter({ text: `الوضع: ${button.exclusive ? 'حصري (رتبة واحدة فقط)' : 'متعدد (أكثر من رتبة)'}` })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                components: appendDecorativeOption([new ActionRowBuilder().addComponents(menu)]),
                ephemeral: true,
            });
            return;
        }

        // ---------------------------------------------------
        // 8) زر "تشغيل / إيقاف" -> Toggle مباشر بدون Modal
        // ---------------------------------------------------
        if (interaction.customId === 'settings_toggle_enabled') {
            if (!(await safeDeferUpdate(interaction))) return;

            const session = resolveSession(interaction);
            const panel = session.panelName ? getPanelByName(session.panelName) : null;
            if (!panel) {
                await interaction.followUp({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true }).catch(() => {});
                return;
            }

            updatePanel(panel.name, { enabled: !panel.enabled });

            const result = buildPanelSettings(panel.name, session.page || 'general');
            await interaction.editReply(result);
            return;
        }

        // ---------------------------------------------------
        // 9) زر "💾 حفظ" -> نفس ميكانيكة زر حفظ لوحة الإيمبد
        //    يعرض تأكيد الحفظ مع إمكانية الرجوع أو متابعة التعديل
        // ---------------------------------------------------
        if (interaction.customId === 'settings_save') {
            if (!(await safeDeferUpdate(interaction))) return;

            const panel = resolvePanel(interaction);
            if (!panel) {
                await interaction.followUp({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true }).catch(() => {});
                return;
            }

            // لمس updatedAt فقط (كل التغييرات تُحفظ فوراً كما في لوحة الإيمبد)
            updatePanel(panel.name, {});

            await interaction.editReply({
                content: `✅ تم حفظ إعدادات البنل **${panel.name}** بنجاح.`,
                embeds: [],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('settings_page_general')
                            .setLabel('⚙️ متابعة التعديل')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('settings_page_back')
                            .setLabel('🔙 رجوع للرئيسية')
                            .setStyle(ButtonStyle.Secondary)
                    ),
                ],
            });
            return;
        }
    } catch (error) {
        console.error('[buttonHandler] حدث خطأ أثناء معالجة الزر:', error);
        reportError('TICKET_BUTTON', interaction.customId || '?', error);

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

module.exports = { handleTicketButton };

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

const { buildMainDashboard, buildSubPanel } = require('./dashboardBuilder');
const { buildPanelSettings } = require('./panelSettingsBuilder');
const {
    buildCreatePanelModal,
    buildEditNameDescModal,
    buildWelcomeMessageModal,
} = require('./modalsBuilder');
const { getPanelByName, updatePanel } = require('../database/panelsDB');
const { getSession, setSession, clearSession } = require('./sessionStore');

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
    'settings_page_channels',
    'settings_page_messages',
];

/**
 * الدالة الرئيسية لمعالجة أزرار نظام التذاكر
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleTicketButton(interaction) {
    const relevantIds = [
        'ticket_add',
        'ticket_back',
        'settings_page_back',
        'settings_edit_name_desc',
        'settings_edit_welcome',
        'settings_toggle_enabled',
        ...Object.keys(SUB_PANEL_MAP),
        ...SETTINGS_PAGE_IDS,
    ];
    if (!relevantIds.includes(interaction.customId)) return;

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
        // 2) زر "رجوع" (من اللوحات الفرعية في الجزء الأول)
        // ---------------------------------------------------
        if (interaction.customId === 'ticket_back') {
            await interaction.deferUpdate().catch(() => {});
            const { embeds, components } = buildMainDashboard();
            await interaction.editReply({ embeds, components });
            return;
        }

        // ---------------------------------------------------
        // 3) زر "رجوع للوحة الرئيسية" من داخل إعدادات البنل
        //    -> نمسح الجلسة الخاصة بهذه الرسالة أيضاً
        // ---------------------------------------------------
        if (interaction.customId === 'settings_page_back') {
            await interaction.deferUpdate().catch(() => {});
            clearSession(interaction.message.id);
            const { embeds, components } = buildMainDashboard();
            await interaction.editReply({ embeds, components });
            return;
        }

        // ---------------------------------------------------
        // 4) الأزرار الأربعة من الجزء الأول (تعديل/سجل/حذف/إرسال)
        // ---------------------------------------------------
        if (SUB_PANEL_MAP[interaction.customId]) {
            await interaction.deferUpdate().catch(() => {});
            const type = SUB_PANEL_MAP[interaction.customId];
            const { embeds, components } = buildSubPanel(type);
            await interaction.editReply({ embeds, components });
            return;
        }

        // ---------------------------------------------------
        // 5) أزرار التنقل بين صفحات إعدادات البنل
        //    نعتمد على sessionStore لمعرفة أي بنل نحن نعدّله الآن
        // ---------------------------------------------------
        if (SETTINGS_PAGE_IDS.includes(interaction.customId)) {
            await interaction.deferUpdate().catch(() => {});

            const session = getSession(interaction.message.id);
            if (!session.panelName) {
                // حماية إضافية: إذا فُقدت الجلسة (مثلاً بعد إعادة تشغيل البوت)
                await interaction.followUp({
                    content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            const page = interaction.customId.replace('settings_page_', ''); // general/roles/channels/messages
            setSession(interaction.message.id, { page });

            const result = buildPanelSettings(session.panelName, page);
            if (!result) {
                await interaction.followUp({
                    content: '⚠️ لم يتم العثور على هذا البنل، ربما تم حذفه.',
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
            const session = getSession(interaction.message.id);
            const panel = session.panelName ? getPanelByName(session.panelName) : null;
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
            const session = getSession(interaction.message.id);
            const panel = session.panelName ? getPanelByName(session.panelName) : null;
            if (!panel) {
                await interaction.reply({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true });
                return;
            }
            await interaction.showModal(buildWelcomeMessageModal(panel));
            return;
        }

        // ---------------------------------------------------
        // 8) زر "تشغيل / إيقاف" -> Toggle مباشر بدون Modal
        // ---------------------------------------------------
        if (interaction.customId === 'settings_toggle_enabled') {
            await interaction.deferUpdate().catch(() => {});

            const session = getSession(interaction.message.id);
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
    } catch (error) {
        console.error('[buttonHandler] حدث خطأ أثناء معالجة الزر:', error);

        const errorPayload = {
            content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.',
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

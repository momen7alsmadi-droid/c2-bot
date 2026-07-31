/**
 * =========================================================
 *  handlers/roleSelectHandler.js
 * =========================================================
 * معالج قوائم اختيار الرتب (RoleSelectMenuInteraction) في
 * صفحة "إعدادات الرتب": الستاف / المنشن / المسموحة / الممنوعة.
 *
 * هذا نوع تفاعل مختلف عن StringSelectMenu في discord.js v14
 * (interaction.isRoleSelectMenu())، لذلك له ملف منفصل.
 *
 * طريقة الاستخدام (في ملف التشغيل الرئيسي، غير مطلوب هنا):
 *   const { handleRoleSelectMenu } = require('./handlers/roleSelectHandler');
 *   client.on('interactionCreate', async (interaction) => {
 *       if (interaction.isRoleSelectMenu()) await handleRoleSelectMenu(interaction);
 *   });
 * =========================================================
 */

const { buildPanelSettings } = require('./panelSettingsBuilder');
const { updatePanel } = require('../database/panelsDB');
const { resolveSession } = require('../utils/panelResolver');

// تربط كل customId بالحقل المطابق له في قاعدة البيانات
const FIELD_MAP = {
    settings_select_staff_roles: 'staffRoles',
    settings_select_ping_roles: 'pingRoles',
    settings_select_allowed_roles: 'allowedRoles',
    settings_select_denied_roles: 'deniedRoles',
};

/**
 * @param {import('discord.js').RoleSelectMenuInteraction} interaction
 */
async function handleRoleSelectMenu(interaction) {
    const field = FIELD_MAP[interaction.customId];
    if (!field) return;

    try {
        await interaction.deferUpdate().catch(() => {});

        const session = resolveSession(interaction);
        if (!session.panelName) {
            await interaction.followUp({
                content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                ephemeral: true,
            }).catch(() => {});
            return;
        }

        // interaction.values يحتوي على مصفوفة آيدي الرتب المختارة (يمكن أن تكون فارغة)
        const selectedRoleIds = interaction.values;

        // نحفظ التغيير فوراً في قاعدة البيانات كما طُلب
        updatePanel(session.panelName, { [field]: selectedRoleIds });

        // نحدّث الإيمبد ليعكس القيم الجديدة فوراً
        const result = buildPanelSettings(session.panelName, 'roles');
        if (!result) {
            await interaction.followUp({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true }).catch(() => {});
            return;
        }

        await interaction.editReply(result);
    } catch (error) {
        console.error('[roleSelectHandler] حدث خطأ أثناء معالجة قائمة الرتب:', error);
        await interaction
            .followUp({ content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.', ephemeral: true })
            .catch(() => {});
    }
}

module.exports = { handleRoleSelectMenu };

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
const { reportError } = require('../../src/utils/errorLogger');
const { safeDeferUpdate } = require('../utils/interactionGuard');
const { updatePanel, getPanelByName } = require('../database/panelsDB');
const { resolveSession } = require('../utils/panelResolver');
const { setSession, getSession } = require('./sessionStore');
const { setRoleOptionRole, setRoleButtonAllowedRoles } = require('../utils/roleButtons');

// تربط كل customId بالحقل المطابق له في قاعدة البيانات
const FIELD_MAP = {
    settings_select_staff_roles: 'staffRoles',
    settings_select_ping_roles: 'pingRoles',
    settings_select_allowed_roles: 'allowedRoles',
    settings_select_denied_roles: 'deniedRoles',
    settings_select_upper_mgmt: 'upperManagementRoles',
};

/**
 * @param {import('discord.js').RoleSelectMenuInteraction} interaction
 */
async function handleRoleSelectMenu(interaction) {
    // ---- أزرار الرتب المخصصة: تعيين رتبة الخيار / رتب الاستخدام ----
    if (interaction.customId === 'settings_select_role_btn_role' || interaction.customId === 'settings_select_role_btn_use') {
        try {
            if (!(await safeDeferUpdate(interaction))) return;

            const session = resolveSession(interaction);
            if (!session.panelName || !session.roleBtnId) {
                await interaction.followUp({
                    content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                    ephemeral: true,
                }).catch(() => {});
                return;
            }

            if (interaction.customId === 'settings_select_role_btn_role') {
                if (!session.roleOptId) {
                    await interaction.followUp({
                        content: '⚠️ اختر خياراً من القائمة أولاً ثم عيّن رتبته.',
                        ephemeral: true,
                    }).catch(() => {});
                    return;
                }
                const roleId = interaction.values[0] || null;
                setRoleOptionRole(session.panelName, session.roleBtnId, session.roleOptId, roleId);
            } else {
                setRoleButtonAllowedRoles(session.panelName, session.roleBtnId, interaction.values);
            }

            const result = buildPanelSettings(session.panelName, 'roleButtons', null, session.roleBtnId, session.roleOptId);
            if (!result) {
                await interaction.followUp({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true }).catch(() => {});
                return;
            }

            await interaction.editReply(result);
        } catch (error) {
            console.error('[roleSelectHandler] خطأ في أزرار الرتب:', error);
            reportError('TICKET_ROLE_SELECT', interaction.customId || '?', error);
            await interaction
                .followUp({ content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.', ephemeral: true })
                .catch(() => {});
        }
        return;
    }

    const field = FIELD_MAP[interaction.customId];
    if (!field) return;

    try {
        if (!(await safeDeferUpdate(interaction))) return;

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
        // (نستخدم صفحة الجلسة: roles أو roles2 حتى لا نقفز للمستخدم للصفحة الأولى؛
        //  نتعامل أيضاً مع الاسم القادم من تذييل الإيمبد بعد إعادة التشغيل)
        const targetPage =
            session.page === 'roles2' || session.page === 'الرتب 2/2' ? 'roles2' : 'roles';
        const result = buildPanelSettings(session.panelName, targetPage);
        if (!result) {
            await interaction.followUp({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true }).catch(() => {});
            return;
        }

        await interaction.editReply(result);
    } catch (error) {
        console.error('[roleSelectHandler] حدث خطأ أثناء معالجة قائمة الرتب:', error);
        reportError('TICKET_ROLE_SELECT', interaction.customId || '?', error);
        await interaction
            .followUp({ content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.', ephemeral: true })
            .catch(() => {});
    }
}

module.exports = { handleRoleSelectMenu };

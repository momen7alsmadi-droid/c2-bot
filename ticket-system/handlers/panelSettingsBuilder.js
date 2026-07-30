/**
 * =========================================================
 *  handlers/panelSettingsBuilder.js
 * =========================================================
 * مسؤول عن بناء "لوحة إعدادات البنل" بكل صفحاتها:
 *   general  -> إعدادات عامة
 *   roles    -> إعدادات الرتب
 *   channels -> إعدادات الرومات
 *   messages -> إعدادات الرسائل
 *
 * كل صفحة = Row تنقل ثابت (5 أزرار) + Rows خاصة بالصفحة.
 * الحد الأقصى لعدد الـ ActionRows في أي رسالة هو 5، لذلك تم
 * توزيع الإعدادات بحيث لا تتجاوز أي صفحة هذا الحد أبداً
 * (أقصى استخدام هو في صفحة الرتب: 1 تنقل + 4 قوائم رتب = 5).
 * =========================================================
 */

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
} = require('discord.js');

const { getPanelByName, getAllPanels } = require('../database/panelsDB');

const COLOR = 0x2b2d31;

// أسماء الصفحات وعناوينها لعرضها في الإيمبد وأزرار التنقل
const PAGES = {
    general: { label: 'إعدادات عامة', emoji: '⚙️' },
    roles: { label: 'إعدادات الرتب', emoji: '🎭' },
    channels: { label: 'إعدادات الرومات', emoji: '📁' },
    messages: { label: 'الرسائل', emoji: '💬' },
};

/**
 * بناء صف التنقل الثابت بين الصفحات (يظهر دائماً في Row الأول)
 * الزر الخاص بالصفحة الحالية يظهر بلون مختلف (Primary) لتمييزه
 * @param {String} activePage
 * @returns {ActionRowBuilder}
 */
function buildNavRow(activePage) {
    const row = new ActionRowBuilder();

    for (const [key, meta] of Object.entries(PAGES)) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`settings_page_${key}`)
                .setLabel(meta.label)
                .setEmoji(meta.emoji)
                .setStyle(key === activePage ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );
    }

    row.addComponents(
        new ButtonBuilder()
            .setCustomId('settings_page_back')
            .setLabel('رجوع للوحة الرئيسية')
            .setEmoji('🔙')
            .setStyle(ButtonStyle.Danger)
    );

    return row;
}

/**
 * تحويل مصفوفة آيدي الرتب إلى نص منشنات (أو "لا يوجد")
 */
function rolesToText(roleIds) {
    if (!roleIds || roleIds.length === 0) return 'لا يوجد';
    return roleIds.map(id => `<@&${id}>`).join(', ');
}

/**
 * تحويل آيدي روم/كاتيجوري إلى نص منشن (أو "لم يُحدد بعد")
 */
function channelToText(channelId) {
    return channelId ? `<#${channelId}>` : 'لم يُحدد بعد';
}

/**
 * بناء الإيمبد المشترك لكل صفحات الإعدادات (يعرض ملخص عام دائماً + تفاصيل حسب الصفحة)
 * @param {Object} panel
 * @param {String} page
 * @returns {EmbedBuilder}
 */
function buildSettingsEmbed(panel, page) {
    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(`${panel.emoji || '🎫'} إعدادات البنل: ${panel.name}`)
        .setFooter({ text: `الصفحة الحالية: ${PAGES[page].label}` })
        .setTimestamp();

    // شريط حالة علوي يظهر في كل الصفحات
    embed.addFields({
        name: 'الحالة',
        value: panel.enabled ? '🟢 مفعّل' : '🔴 معطّل',
        inline: true,
    });

    if (page === 'general') {
        embed.setDescription(panel.description || 'لا يوجد وصف');
        embed.addFields(
            {
                name: 'نظام فتح التكت',
                value: panel.ticketSystemType === 'select' ? 'قائمة منسدلة' : 'أزرار',
                inline: true,
            },
            {
                name: 'البنل المرتبط',
                value: panel.linkedPanel ? panel.linkedPanel : 'لا يوجد',
                inline: true,
            }
        );
    }

    if (page === 'roles') {
        embed.addFields(
            { name: 'الستاف (Staff)', value: rolesToText(panel.staffRoles) },
            { name: 'رتب المنشن (Ping)', value: rolesToText(panel.pingRoles) },
            { name: 'الرتب المسموحة', value: rolesToText(panel.allowedRoles) },
            { name: 'الرتب الممنوعة', value: rolesToText(panel.deniedRoles) },
            {
                name: 'ملاحظة',
                value: 'أي رتبة تملك صلاحية Administrator لها كامل الصلاحيات تلقائياً في كل الحالات.',
            }
        );
    }

    if (page === 'channels') {
        embed.addFields(
            { name: 'الكاتيجوري', value: channelToText(panel.categoryId), inline: true },
            { name: 'روم اللوق', value: channelToText(panel.logChannelId), inline: true }
        );
    }

    if (page === 'messages') {
        embed.addFields({
            name: 'رسالة الترحيب الحالية',
            value: panel.welcomeMessage
                ? panel.welcomeMessage.slice(0, 1000)
                : 'لم يتم تخصيص رسالة بعد (سيتم استخدام رسالة افتراضية)',
        });
        embed.addFields({
            name: 'المتغيرات المدعومة',
            value: '`[user]` منشن العضو • `[server]` اسم السيرفر • `[ticket_name]` اسم التكت • `[time]` الوقت',
        });
    }

    return embed;
}

/**
 * بناء صفحة "إعدادات عامة"
 */
function buildGeneralPage(panel) {
    const editButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_edit_name_desc')
            .setLabel('تعديل الاسم والوصف')
            .setEmoji('📝')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('settings_toggle_enabled')
            .setLabel(panel.enabled ? 'إيقاف البنل' : 'تشغيل البنل')
            .setEmoji(panel.enabled ? '⏸️' : '▶️')
            .setStyle(panel.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    );

    const ticketSystemSelect = new StringSelectMenuBuilder()
        .setCustomId('settings_select_ticket_system')
        .setPlaceholder('نظام فتح التكت للأعضاء...')
        .addOptions(
            {
                label: 'أزرار (Buttons)',
                value: 'buttons',
                emoji: '🔘',
                default: panel.ticketSystemType === 'buttons',
            },
            {
                label: 'قائمة منسدلة (Select Menu)',
                value: 'select',
                emoji: '📋',
                default: panel.ticketSystemType === 'select',
            }
        );
    const ticketSystemRow = new ActionRowBuilder().addComponents(ticketSystemSelect);

    // قائمة ربط البنلات: تجلب كل البنلات الأخرى عدا البنل الحالي
    const otherPanels = getAllPanels().filter(p => p.name !== panel.name);
    const linkSelect = new StringSelectMenuBuilder()
        .setCustomId('settings_select_linked_panel')
        .setPlaceholder('ربط بنل آخر بهذا البنل (اختياري)...');

    if (otherPanels.length === 0) {
        linkSelect
            .addOptions({ label: 'لا يوجد أي بنل آخر لربطه', value: 'none' })
            .setDisabled(true);
    } else {
        linkSelect.addOptions([
            { label: '❌ إلغاء الربط', value: 'unlink', default: !panel.linkedPanel },
            ...otherPanels.map(p => ({
                label: p.name,
                value: p.name,
                emoji: p.emoji || '🎫',
                default: panel.linkedPanel === p.name,
            })),
        ]);
    }
    const linkRow = new ActionRowBuilder().addComponents(linkSelect);

    return [editButtonRow, ticketSystemRow, linkRow];
}

/**
 * بناء صفحة "إعدادات الرتب"
 * ملاحظة: RoleSelectMenuBuilder لا يدعم تحديد "قيمة مبدئية" معروضة
 * تلقائياً مثل StringSelect (Discord API لا يوفر default للأدوار)،
 * لذلك يعرض الإيمبد القيم الحالية دائماً كمرجع للإداري.
 */
function buildRolesPage(panel) {
    const staffRow = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId('settings_select_staff_roles')
            .setPlaceholder('اختر رتب الستاف (يمكن اختيار أكثر من رتبة)')
            .setMinValues(0)
            .setMaxValues(25)
    );

    const pingRow = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId('settings_select_ping_roles')
            .setPlaceholder('اختر رتب المنشن عند فتح التكت')
            .setMinValues(0)
            .setMaxValues(10)
    );

    const allowedRow = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId('settings_select_allowed_roles')
            .setPlaceholder('الرتب المسموح لها بفتح التكت (اتركها فارغة = الجميع)')
            .setMinValues(0)
            .setMaxValues(25)
    );

    const deniedRow = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId('settings_select_denied_roles')
            .setPlaceholder('الرتب الممنوعة من فتح التكت')
            .setMinValues(0)
            .setMaxValues(25)
    );

    return [staffRow, pingRow, allowedRow, deniedRow];
}

/**
 * بناء صفحة "إعدادات الرومات"
 */
function buildChannelsPage() {
    const categoryRow = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('settings_select_category')
            .setPlaceholder('اختر الكاتيجوري التي ستُفتح فيها التذاكر')
            .addChannelTypes(ChannelType.GuildCategory)
    );

    const logRow = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('settings_select_log_channel')
            .setPlaceholder('اختر روم اللوق/الترانسكربت')
            .addChannelTypes(ChannelType.GuildText)
    );

    return [categoryRow, logRow];
}

/**
 * بناء صفحة "الرسائل"
 */
function buildMessagesPage() {
    const welcomeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_edit_welcome')
            .setLabel('تخصيص رسالة الترحيب')
            .setEmoji('💬')
            .setStyle(ButtonStyle.Secondary)
    );

    return [welcomeRow];
}

/**
 * الدالة الرئيسية المصدَّرة: تبني لوحة إعدادات البنل كاملة لصفحة معينة
 * @param {String} panelName
 * @param {'general'|'roles'|'channels'|'messages'} page
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] } | null} null إذا لم يوجد البنل
 */
function buildPanelSettings(panelName, page = 'general') {
    const panel = getPanelByName(panelName);
    if (!panel) return null;

    const embed = buildSettingsEmbed(panel, page);
    const navRow = buildNavRow(page);

    let pageRows = [];
    if (page === 'general') pageRows = buildGeneralPage(panel);
    else if (page === 'roles') pageRows = buildRolesPage(panel);
    else if (page === 'channels') pageRows = buildChannelsPage(panel);
    else if (page === 'messages') pageRows = buildMessagesPage(panel);

    return {
        embeds: [embed],
        components: [navRow, ...pageRows],
    };
}

module.exports = {
    buildPanelSettings,
    PAGES,
};

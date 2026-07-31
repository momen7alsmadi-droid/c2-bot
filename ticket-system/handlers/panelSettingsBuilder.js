/**
 * =========================================================
 *  handlers/panelSettingsBuilder.js
 * =========================================================
 * مسؤول عن بناء "لوحة إعدادات البنل" بنظام الواجهات المتعددة:
 *   general  -> الواجهة الرئيسية (تعديل الاسم/الحالة/النظام/الربط + أزرار الدخول للواجهات)
 *   roles    -> واجهة فرعية (قوائم الرتب) + زر رجوع
 *   channels -> واجهة فرعية (قوائم الرومات) + زر رجوع
 *   messages -> واجهة فرعية (رسالة الترحيب) + زر رجوع
 *
 * الميكانيكة مطابقة للوحات الإضافة (الإيمبد/الردود التلقائية):
 *   الضغط على أي زر يبدّل الواجهة التي أمامك بالكامل، وكل
 *   واجهة فرعية تحمل زر رجوع يعيدك للواجهة السابقة — لا يوجد
 *   صف تنقل ثابت بلون للزر النشط.
 * الحد الأقصى لعدد الـ ActionRows في أي رسالة هو 5، لذلك تم
 * توزيع الإعدادات بحيث لا تتجاوز أي واجهة هذا الحد أبداً
 * (أقصى استخدام هو في واجهة الرتب: 4 قوائم رتب + رجوع = 5).
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
const { buildPublicPanelMessage } = require('./publicPanelBuilder');
const { SUPPORTED_VARIABLES } = require('../utils/messageVariables');
const { safeEmoji } = require('../utils/emoji');

const INFO_COLOR = 0x2ECC71; // أخضر مثل إيمبد "معلومات الإيمبد" في لوحة الإيمبد

// أسماء الصفحات وعناوينها لعرضها في الإيمبد وأزرار التنقل
const PAGES = {
    general: { label: 'إعدادات عامة', emoji: '⚙️' },
    roles: { label: 'إعدادات الرتب', emoji: '🎭' },
    channels: { label: 'إعدادات الرومات', emoji: '📁' },
    messages: { label: 'الرسائل', emoji: '💬' },
};

/**
 * بناء صف "رجوع للإعدادات العامة" — الزر الوحيد للخروج من أي
 * واجهة فرعية، يعيدك للواجهة السابقة (نفس ميكانيكة لوحات الإضافة).
 * @returns {ActionRowBuilder}
 */
function buildBackToGeneralRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_page_general')
            .setLabel('🔙 رجوع للإعدادات العامة')
            .setStyle(ButtonStyle.Secondary)
    );
}

/**
 * تحويل مصفوفة آيدي الرتب إلى نص منشنات (أو "لا يوجد")
 * مع قصّ آمن عند تجاوز الحد الأقصى لحقل الإيمبد (1024)
 */
function rolesToText(roleIds) {
    if (!roleIds || roleIds.length === 0) return 'لا يوجد';
    const text = roleIds.map(id => `<@&${id}>`).join(', ');
    return text.length > 1000 ? text.slice(0, 1000) + '…' : text;
}

/**
 * تحويل آيدي روم/كاتيجوري إلى نص منشن (أو "لم يُحدد بعد")
 */
function channelToText(channelId) {
    return channelId ? `<#${channelId}>` : 'لم يُحدد بعد';
}

/**
 * بناء إيمبد معلومات البنل — بنفس نظام الردود التلقائية:
 * يعرض كل إعدادات البنل في نفس الوقت (ديناميكياً) ويتحدّث
 * فوراً عند أي تغيير: رتب، رومات، رسائل، نظام فتح... إلخ.
 *
 * الحقول الصغيرة: inline:true (بجانب بعضها)
 * القوائم الطويلة: inline:false (سطر كامل)
 * الحالة: مؤشرات 🟢/🔴 مثل لوحة الردود التلقائية
 *
 * @param {Object} panel
 * @param {String} page - تُستخدم فقط في الفوتر (الصفحة الحالية)
 * @returns {EmbedBuilder}
 */
function buildSettingsEmbed(panel, page) {
    const embed = new EmbedBuilder()
        .setColor(INFO_COLOR)
        .setTitle('ℹ️ معلومات البنل')
        .setFooter({ text: `الصفحة الحالية: ${PAGES[page].label}` })
        .setTimestamp();

    // ===== الحقول الصغيرة (inline) =====
    embed.addFields(
        { name: '🏷️ الاسم', value: `${panel.emoji || '🎫'} ${panel.name}`, inline: true },
        { name: '📨 الحالة', value: panel.enabled ? '🟢 مفعّل' : '🔴 معطّل', inline: true },
        {
            name: '🔘 نظام فتح التكت',
            value: panel.ticketSystemType === 'select' ? '📋 قائمة منسدلة' : '🔘 أزرار',
            inline: true,
        },
        {
            name: '🔗 البنل المرتبط',
            value: panel.linkedPanel ? panel.linkedPanel : 'لا يوجد',
            inline: true,
        },
    );

    // ===== الوصف (إن وُجد) =====
    if (panel.description) {
        embed.addFields({
            name: '📝 الوصف',
            value: panel.description.slice(0, 1024),
            inline: false,
        });
    }

    // ===== الرتب (قوائم كاملة) =====
    embed.addFields(
        { name: '🎭 الستاف', value: rolesToText(panel.staffRoles), inline: false },
        { name: '🔔 رتب المنشن', value: rolesToText(panel.pingRoles), inline: false },
        { name: '✅ الرتب المسموحة', value: rolesToText(panel.allowedRoles), inline: false },
        { name: '🚫 الرتب الممنوعة', value: rolesToText(panel.deniedRoles), inline: false },
    );

    // ===== الرومات =====
    embed.addFields(
        { name: '📁 الكاتيجوري', value: channelToText(panel.categoryId), inline: true },
        { name: '📜 روم اللوق', value: channelToText(panel.logChannelId), inline: true },
    );

    // ===== الرسائل =====
    embed.addFields(
        {
            name: '💬 رسالة الترحيب',
            value: panel.welcomeMessage
                ? panel.welcomeMessage.slice(0, 1024)
                : 'لم تُخصص بعد (ستُستخدم الافتراضية)',
            inline: false,
        },
        {
            name: '📤 رسالة البنل العامة',
            value:
                panel.panelMessage &&
                (panel.panelMessage.title ||
                    panel.panelMessage.description ||
                    panel.panelMessage.footer ||
                    panel.panelMessage.color)
                    ? '🟢 مخصصة (تظهر المعاينة الحية أسفل)'
                    : '🔴 افتراضية (يمكنك تخصيصها من واجهة الرسائل)',
            inline: false,
        },
        {
            name: '🔤 المتغيرات المدعومة',
            value: SUPPORTED_VARIABLES,
            inline: false,
        },
    );

    return embed;
}

/**
 * بناء الواجهة الرئيسية "إعدادات عامة" — بنفس تصميم لوحة تحكم الإيمبد:
 *  - صف أول: زر تعديل (Secondary) + زر تبديل الحالة بنمط 🟢/🔴 (Success/Danger)
 *  - صفا قوائم منسدلة للخيارات (نظام الفتح + البنل المرتبط)
 *  - صف أزرار الدخول للواجهات الفرعية (الرتب/الرومات/الرسائل)
 *  - صف الحفظ + الرجوع للرئيسية
 */
function buildGeneralPage(panel) {
    const editButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_edit_name_desc')
            .setLabel('📝 تعديل الاسم والوصف')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('settings_toggle_enabled')
            .setLabel(panel.enabled ? '🟢 البنل مفعّل' : '🔴 البنل معطّل')
            .setStyle(panel.enabled ? ButtonStyle.Success : ButtonStyle.Danger)
    );

    // ===== أزرار الدخول للواجهات الفرعية =====
    // الضغط على أي منها يبدّل الواجهة كاملة (نفس ميكانيكة لوحات الإضافة)
    const subNavRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_page_roles')
            .setLabel('🎭 إعدادات الرتب')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('settings_page_channels')
            .setLabel('📁 إعدادات الرومات')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('settings_page_messages')
            .setLabel('💬 الرسائل')
            .setStyle(ButtonStyle.Primary)
    );

    const ticketSystemSelect = new StringSelectMenuBuilder()
        .setCustomId('settings_select_ticket_system')
        .setPlaceholder('🔘 نظام فتح التكت للأعضاء...')
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
        .setPlaceholder('🔗 ربط بنل آخر بهذا البنل (اختياري)...');

    if (otherPanels.length === 0) {
        linkSelect
            .addOptions({ label: 'لا يوجد أي بنل آخر لربطه', value: 'none' })
            .setDisabled(true);
    } else {
        linkSelect.addOptions([
            { label: '❌ إلغاء الربط', value: 'unlink', default: !panel.linkedPanel },
            ...otherPanels.map(p => ({
                label: p.name.slice(0, 100),
                value: p.name,
                emoji: safeEmoji(p.emoji),
                default: panel.linkedPanel === p.name,
            })),
        ]);
    }
    const linkRow = new ActionRowBuilder().addComponents(linkSelect);

    // صف الحفظ + الرجوع للرئيسية — نفس فكرة صف الحفظ في لوحة الإيمبد
    const saveRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_save')
            .setLabel('💾 حفظ')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('settings_page_back')
            .setLabel('🔙 رجوع للرئيسية')
            .setStyle(ButtonStyle.Secondary)
    );

    // ترتيب الواجهة: القائمتان المنسدلتان فوق زرّي الحفظ والرجوع مباشرة
    return [editButtonRow, subNavRow, ticketSystemRow, linkRow, saveRow];
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
 * بناء واجهة "الرسائل" — زر تخصيص رسالة الترحيب داخل التكت
 * + زر تخصيص رسالة البنل العامة (الإيمبد المنشور مع زر/قائمة الفتح)
 */
function buildMessagesPage() {
    const messagesRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_edit_welcome')
            .setLabel('💬 تخصيص رسالة الترحيب')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('settings_edit_panel_message')
            .setLabel('📤 تخصيص رسالة البنل العامة')
            .setStyle(ButtonStyle.Secondary)
    );

    return [messagesRow];
}

/**
 * الدالة الرئيسية المصدَّرة: تبني لوحة إعدادات البنل كاملة لواجهة معينة
 * بنفس شكل لوحة الإيمبد: إيمبد أخضر للمعلومات + معاينة حية + أزرار التحكم.
 *
 * ميكانيكة الواجهات (مثل لوحات الإضافة):
 *  - general  : الواجهة الرئيسية تحوي أزرار الدخول للواجهات الفرعية
 *  - roles/channels/messages : واجهات فرعية بصف رجوع للإعدادات العامة
 *
 * @param {String} panelName
 * @param {'general'|'roles'|'channels'|'messages'} page
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] } | null} null إذا لم يوجد البنل
 */
function buildPanelSettings(panelName, page = 'general') {
    const panel = getPanelByName(panelName);
    if (!panel) return null;

    const infoEmbed = buildSettingsEmbed(panel, page);

    // معاينة حية لما سيراه الأعضاء (نفس فكرة معاينة لوحة الإيمبد)
    const previewEmbed = buildPublicPanelMessage(panel).embeds[0];

    let rows = [];
    if (page === 'general') rows = buildGeneralPage(panel);
    else if (page === 'roles') rows = [...buildRolesPage(panel), buildBackToGeneralRow()];
    else if (page === 'channels') rows = [...buildChannelsPage(), buildBackToGeneralRow()];
    else if (page === 'messages') rows = [...buildMessagesPage(), buildBackToGeneralRow()];

    return {
        embeds: [infoEmbed, previewEmbed],
        components: rows,
    };
}

module.exports = {
    buildPanelSettings,
    PAGES,
};

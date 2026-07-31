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
const { buildPublicPanelMessage } = require('./publicPanelBuilder');

const INFO_COLOR = 0x2ECC71; // أخضر مثل إيمبد "معلومات الإيمبد" في لوحة الإيمبد

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

    // الإيموجي داخل نص الزر (نفس أسلوب لوحة الإيمبد) بدل .setEmoji() منفصل
    for (const [key, meta] of Object.entries(PAGES)) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`settings_page_${key}`)
                .setLabel(`${meta.emoji} ${meta.label}`)
                .setStyle(key === activePage ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );
    }

    row.addComponents(
        new ButtonBuilder()
            .setCustomId('settings_page_back')
            .setLabel('🔙 رجوع للرئيسية')
            .setStyle(ButtonStyle.Secondary)
    );

    return row;
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
            name: '🔤 المتغيرات المدعومة',
            value: '`[user]` منشن العضو • `[server]` اسم السيرفر • `[ticket_name]` اسم التكت • `[time]` الوقت',
            inline: false,
        },
    );

    return embed;
}

/**
 * بناء صفحة "إعدادات عامة" — بنفس تصميم لوحة تحكم الإيمبد:
 *  - زر تعديل (Secondary) + زر تبديل الحالة بنمط 🟢/🔴 (Success/Danger)
 *  - قوائم منسدلة للخيارات
 *  - زر حفظ (Success)
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
                label: p.name,
                value: p.name,
                emoji: p.emoji || '🎫',
                default: panel.linkedPanel === p.name,
            })),
        ]);
    }
    const linkRow = new ActionRowBuilder().addComponents(linkSelect);

    // صف الحفظ — نفس فكرة زر 💾 حفظ في لوحة الإيمبد
    const saveRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_save')
            .setLabel('💾 حفظ')
            .setStyle(ButtonStyle.Success)
    );

    return [editButtonRow, ticketSystemRow, linkRow, saveRow];
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
            .setLabel('💬 تخصيص رسالة الترحيب')
            .setStyle(ButtonStyle.Secondary)
    );

    return [welcomeRow];
}

/**
 * الدالة الرئيسية المصدَّرة: تبني لوحة إعدادات البنل كاملة لصفحة معينة
 * بنفس شكل لوحة الإيمبد: إيمبد أخضر للمعلومات + معاينة حية + أزرار التحكم
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

    const navRow = buildNavRow(page);

    let pageRows = [];
    if (page === 'general') pageRows = buildGeneralPage(panel);
    else if (page === 'roles') pageRows = buildRolesPage(panel);
    else if (page === 'channels') pageRows = buildChannelsPage(panel);
    else if (page === 'messages') pageRows = buildMessagesPage(panel);

    return {
        embeds: [infoEmbed, previewEmbed],
        components: [navRow, ...pageRows],
    };
}

module.exports = {
    buildPanelSettings,
    PAGES,
};

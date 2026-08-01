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
const { reportError } = require('../../src/utils/errorLogger');
const { buildPublicPanelMessage } = require('./publicPanelBuilder');
const { buildTicketEmbed } = require('./ticketEmbedBuilder');
const { SUPPORTED_VARIABLES } = require('../utils/messageVariables');
const { safeEmoji } = require('../utils/emoji');
const { ACTION_KEYS, DEFAULT_ACTION_MESSAGES, getActionMessage, isActionEnabled } = require('../utils/actionMessages');
const { getAllImages } = require('../utils/imageLibrary');

/**
 * تحويل رابط صورة مُحفوظ في البنل إلى اسمها في المكتبة
 * (لعرضها في إيمبد المعلومات بطريقة مقروءة)
 * @param {String|null} url
 * @returns {String}
 */
function imageNameFromUrl(url) {
    if (!url) return 'لا توجد';
    const found = getAllImages().find(i => i.url === url);
    return found ? `\`${found.name.slice(0, 60)}\` (من المكتبة)` : '[رابط مخصص/خارجي]';
}

const INFO_COLOR = 0x2ECC71; // أخضر مثل إيمبد "معلومات الإيمبد" في لوحة الإيمبد

// أسماء الصفحات وعناوينها لعرضها في الإيمبد وأزرار التنقل
const PAGES = {
    general: { label: 'إعدادات عامة', emoji: '⚙️' },
    roles: { label: 'إعدادات الرتب', emoji: '🎭' },
    roles2: { label: 'الرتب 2/2', emoji: '🎭' },
    channels: { label: 'إعدادات الرومات', emoji: '📁' },
    messages: { label: 'الرسائل', emoji: '💬' },
    images: { label: 'مكتبة الصور', emoji: '🖼️' },
    actions: { label: 'رسائل الأزرار', emoji: '🔔' },
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
 * صف زر "الرتب 2/2" — صف مستقل فوق صف الرجوع (كما طُلب)
 * ملاحظة: ديسكورد لا يدعم اللون البرتقالي في الأزرار،
 * والأقرب له هو اللون الأحمر (Danger) — لون برتقالي-أحمر.
 */
function buildRolesNavRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_page_roles2')
            .setLabel('🎭 الرتب 2/2')
            .setStyle(ButtonStyle.Danger)
    );
}

/**
 * صف رجوع صفحة الرتب 1/2: رجوع للإعدادات العامة + رجوع للوحة الرئيسية
 */
function buildRolesBackRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_page_general')
            .setLabel('🔙 رجوع للإعدادات العامة')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('settings_page_back')
            .setLabel('🏠 رجوع للوحة الرئيسية')
            .setStyle(ButtonStyle.Secondary)
    );
}

/**
 * صف رجوع من صفحة الرتب 2/2 إلى صفحة الرتب 1/2
 */
function buildBackToRolesRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_page_roles')
            .setLabel('🔙 رجوع للرتب 1/2')
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
function buildSettingsEmbed(panel, page, actionKey) {
    const embed = new EmbedBuilder()
        .setColor(INFO_COLOR)
        .setTitle('ℹ️ معلومات البنل')
        .setFooter({ text: `بنل: ${panel.name} | الصفحة: ${PAGES[page].label}` })
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
            name: '🔗 البنلات المرتبطة',
            value: (() => {
                const linked = panel.linkedPanels || [];
                if (!linked.length) return 'لا يوجد';
                return linked
                    .map(n => `🔗 ${n}`)
                    .join('\n')
                    .slice(0, 1000);
            })(),
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
        { name: '👑 الإدارة العليا (الرتب 2/2)', value: rolesToText(panel.upperManagementRoles), inline: false },
    );

    // ===== الرومات =====
    embed.addFields(
        { name: '📁 الكاتيجوري', value: channelToText(panel.categoryId), inline: true },
        { name: '📜 روم اللوق', value: channelToText(panel.logChannelId), inline: true },
    );

    // ===== الرسائل =====
    const pm = panel.panelMessage || {};
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
                pm.title || pm.description || pm.footer || pm.color || pm.image
                    ? '🟢 مخصصة (تظهر المعاينة الحية أسفل)'
                    : '🔴 افتراضية (يمكنك تخصيصها من واجهة الرسائل)',
            inline: false,
        },
        {
            name: '🖼️ إيمبد التكت (فوق الأزرار داخل التكت)',
            value: (() => {
                const te = panel.ticketEmbed || {};
                return te.title || te.description || te.image || te.color
                    ? '🟢 مخصصة (تظهر المعاينة في صفحة الرسائل)'
                    : '🔴 افتراضية (اسم البنل + رسالة الترحيب)';
            })(),
            inline: false,
        },
        {
            name: '🏷️ اسم روم التكت',
            value: panel.ticketNameTemplate
                ? `\`${panel.ticketNameTemplate.slice(0, 100)}\``
                : '\`ticket-[username]\` (الافتراضي)',
            inline: false,
        },
        {
            name: '🖼️ صورة البنل العام (من المكتبة)',
            value: imageNameFromUrl((panel.panelMessage || {}).image),
            inline: false,
        },
        {
            name: '🖼️ صورة إيمبد التكت (من المكتبة)',
            value: imageNameFromUrl((panel.ticketEmbed || {}).image),
            inline: false,
        },
        {
            name: '🔔 رسائل الأزرار',
            value: (() => {
                const enabledCount = ACTION_KEYS.filter(k => isActionEnabled(panel, k)).length;
                return `🟢 ${enabledCount} مفعّلة من ${ACTION_KEYS.length} إجراءات (تخصيص كامل في صفحة رسائل الأزرار)`;
            })(),
            inline: false,
        },
        {
            name: '🔤 المتغيرات المدعومة',
            value: SUPPORTED_VARIABLES,
            inline: false,
        },
    );

    // ===== صفحة رسائل الأزرار: تفاصيل الإجراء المحدد =====
    if (page === 'actions' && actionKey) {
        const msg = getActionMessage(panel, actionKey);
        if (msg) {
            const def = DEFAULT_ACTION_MESSAGES[actionKey];
            embed.addFields({
                name: `🔔 الإجراء المحدد: ${def.label}`,
                value: [
                    `**الحالة:** ${msg.enabled ? '🟢 مفعّلة' : '🔴 معطّلة'}`,
                    msg.content ? `**فوق الإيمبد:** ${msg.content.slice(0, 500)}` : '**فوق الإيمبد:** (فارغ)',
                    `**العنوان:** ${msg.title.slice(0, 256)}`,
                    `**داخل الإيمبد:** ${msg.description.slice(0, 500)}`,
                ].join('\n'),
                inline: false,
            });
        }
    }

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
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('settings_page_actions')
            .setLabel('🔔 رسائل الأزرار')
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

    // قائمة ربط البنلات: اختيار متعدد (حتى 25 بنل) من كل البنلات الأخرى عدا الحالي
    // إزالة التحديد = إلغاء الربط (لذلك minValues = 0)
    const otherPanels = getAllPanels().filter(p => p.name !== panel.name);
    const currentLinked = panel.linkedPanels || [];
    const linkSelect = new StringSelectMenuBuilder()
        .setCustomId('settings_select_linked_panel')
        .setPlaceholder(`🔗 اختر البنلات المرتبطة (${currentLinked.length} مرتبط حالياً)...`)
        .setMinValues(0)
        .setMaxValues(Math.min(otherPanels.length, 25));

    if (otherPanels.length === 0) {
        linkSelect
            .addOptions({ label: 'لا يوجد أي بنل آخر لربطه', value: 'none' })
            .setDisabled(true);
    } else {
        linkSelect.addOptions(
            otherPanels.slice(0, 25).map(p => ({
                label: p.name.slice(0, 100),
                value: p.name,
                emoji: safeEmoji(p.emoji),
                default: currentLinked.includes(p.name),
            }))
        );
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

    const deniedRow = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId('settings_select_denied_roles')
            .setPlaceholder('الرتب الممنوعة من فتح التكت')
            .setMinValues(0)
            .setMaxValues(25)
    );

    // ملاحظة: قائمة "الرتب المسموحة" انتقلت للصفحة 2/2 (لإفساح
    // صفين للأزرار: زر الرتب 2/2 + صف الرجوعين) — حد ديسكورد 5 صفوف
    return [staffRow, pingRow, deniedRow];
}

/**
 * بناء صفحة "الرتب 2/2": الرتب المسموحة + رتب الإدارة العليا
 * (صفحة منفصلة لأن ديسكورد يسمح بـ 5 صفوف فقط في الرسالة)
 * الإدارة العليا تلقائياً تضم كل رتبة تملك Administrator —
 * هنا فقط نختار رتباً إضافية بدون Administrator.
 */
function buildRoles2Page(panel) {
    const allowedRow = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId('settings_select_allowed_roles')
            .setPlaceholder('الرتب المسموح لها بفتح التكت (اتركها فارغة = الجميع)')
            .setMinValues(0)
            .setMaxValues(25)
    );

    const upperRow = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId('settings_select_upper_mgmt')
            .setPlaceholder('👑 اختر رتب الإدارة العليا (اختياري — أي رتبة Administrator هي إدارة عليا تلقائياً)')
            .setMinValues(0)
            .setMaxValues(25)
    );

    return [allowedRow, upperRow];
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
 * بناء واجهة "الرسائل" — تخصيص رسالة الترحيب داخل التكت
 * + تخصيص رسالة البنل العامة (الإيمبد المنشور مع زر/قائمة الفتح)
 * + تخصيص إيمبد التكت (فوق الأزرار داخل التكت: كلام + صورة)
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

    const ticketEmbedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_edit_ticket_embed')
            .setLabel('🖼️ تخصيص إيمبد التكت')
            .setStyle(ButtonStyle.Secondary)
    );

    const ticketNameRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_edit_ticket_name')
            .setLabel('🏷️ تخصيص اسم التكت')
            .setStyle(ButtonStyle.Secondary)
    );

    // زر الدخول لمكتبة الصور (يختار الإداري صورة بالاسم) — رفع الصور
    // يتم عبر أمر /رفع-صورة بدون تحديد بنل
    const imageLibRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_page_images')
            .setLabel('🖼️ مكتبة الصور')
            .setStyle(ButtonStyle.Primary)
    );

    return [messagesRow, ticketEmbedRow, ticketNameRow, imageLibRow];
}

/**
 * بناء صفحة "مكتبة الصور": اختيار صورة (بالاسم) للبنل العام
 * ولإيمبد التكت من الصور المرفوعة عبر /رفع-صورة.
 * (القوائم تحوي كل صور المكتبة + خيار "بدون صورة")
 * @param {Object} panel
 */
function buildImagesPage(panel) {
    const { getAllImages } = require('../utils/imageLibrary');
    const images = getAllImages().slice(0, 25);

    const panelImageSelect = new StringSelectMenuBuilder()
        .setCustomId('settings_select_panel_image')
        .setPlaceholder('🖼️ اختر صورة البنل العام (اختياري)...')
        .addOptions({ label: '🚫 بدون صورة', value: 'none', emoji: '🚫' });

    const ticketImageSelect = new StringSelectMenuBuilder()
        .setCustomId('settings_select_ticket_image')
        .setPlaceholder('🖼️ اختر صورة إيمبد التكت (اختياري)...')
        .addOptions({ label: '🚫 بدون صورة', value: 'none', emoji: '🚫' });

    const pmImage = (panel.panelMessage || {}).image || null;
    const teImage = (panel.ticketEmbed || {}).image || null;

    if (images.length === 0) {
        // لا توجد صور في المكتبة: نعطّل القائمتين مع تنبيه واضح
        panelImageSelect.setDisabled(true);
        ticketImageSelect.setDisabled(true);
        panelImageSelect.addOptions({ label: 'لا توجد صور — ارفع أولاً عبر /رفع-صورة', value: 'empty', emoji: '❌' });
        ticketImageSelect.addOptions({ label: 'لا توجد صور — ارفع أولاً عبر /رفع-صورة', value: 'empty', emoji: '❌' });
    } else {
        for (const img of images) {
            panelImageSelect.addOptions({
                label: img.name.slice(0, 100),
                value: img.name,
                emoji: '🖼️',
                default: pmImage === img.url,
            });
            ticketImageSelect.addOptions({
                label: img.name.slice(0, 100),
                value: img.name,
                emoji: '🖼️',
                default: teImage === img.url,
            });
        }
    }

    return [
        new ActionRowBuilder().addComponents(panelImageSelect),
        new ActionRowBuilder().addComponents(ticketImageSelect),
    ];
}

/**
 * بناء صفحة "رسائل الأزرار" — قائمة بكل إجراءات الأزرار مع
 * حالتها (✅/❌)، واختيار أحدها يفعّل زري التعديل والتفعيل/الإطفاء
 * عليه (يُحفظ الإجراء المحدد في الجلسة عبر settings_select_action).
 * @param {Object} panel
 * @param {String|null} actionKey - الإجراء المحدد حالياً (من الجلسة)
 */
function buildActionsPage(panel, actionKey) {
    const select = new StringSelectMenuBuilder()
        .setCustomId('settings_select_action')
        .setPlaceholder('🔔 اختر الإجراء لتخصيص رسالته...')
        .addOptions(
            ACTION_KEYS.map(key => ({
                label: `${isActionEnabled(panel, key) ? '✅' : '❌'} ${DEFAULT_ACTION_MESSAGES[key].label}`,
                value: key,
                default: actionKey === key,
            }))
        );

    const selectRow = new ActionRowBuilder().addComponents(select);

    // زر التبديل ديناميكي اللون حسب حالة الرسالة:
    //   - لم يُختر إجراء بعد  -> رمادي معطّل
    //   - الرسالة تعمل       -> أخضر (Success) "🟢 الرسالة مفعّلة"
    //   - الرسالة مطفأة      -> أحمر (Danger) "🔴 الرسالة معطّلة"
    const isOn = actionKey ? isActionEnabled(panel, actionKey) : null;
    const actionsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_edit_action')
            .setLabel('📝 تعديل الرسالة')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!actionKey),
        new ButtonBuilder()
            .setCustomId('settings_toggle_action')
            .setLabel(
                isOn === null
                    ? '🔄 تفعيل / إطفاء'
                    : isOn
                    ? '🟢 الرسالة مفعّلة'
                    : '🔴 الرسالة معطّلة'
            )
            .setStyle(
                isOn === null
                    ? ButtonStyle.Secondary
                    : isOn
                    ? ButtonStyle.Success
                    : ButtonStyle.Danger
            )
            .setDisabled(!actionKey)
    );

    return [selectRow, actionsRow];
}

/**
 * بناء إيمبد معاينة رسالة إجراء معيّن (كما ستراها في التكت)
 */
function buildActionPreview(panel, actionKey) {
    const msg = getActionMessage(panel, actionKey);
    if (!msg) return null;
    return new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle(msg.title)
        .setDescription(msg.description)
        .setTimestamp();
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
 * @param {'general'|'roles'|'channels'|'messages'|'actions'} page
 * @param {String} [actionKey] - الإجراء المحدد في صفحة رسائل الأزرار
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] } | null} null إذا لم يوجد البنل
 */
function buildPanelSettings(panelName, page = 'general', actionKey) {
    const panel = getPanelByName(panelName);
    if (!panel) return null;

    // تطبيع الصفحة: إذا جاء الاسم من تذييل الإيمبد (بعد إعادة التشغيل)
    // نبحث عن المفتاح المطابق لتسمية الصفحة (مثلاً "الرتب 2/2" -> roles2)
    const pageKey = Object.keys(PAGES).find(k => PAGES[k].label === page) || page;
    page = pageKey;

    const infoEmbed = buildSettingsEmbed(panel, page, actionKey);

    // معاينة حية لما سيراه الأعضاء: البنل + كل البنلات المرتبطة به (الباقة)
    // (إن فشل عرض الباقة — بنل مرتبط محذوف أو إيموجي غير صالح — نكتفي
    //  بإيمبد المعلومات حتى لا يصل الإداري إلى "لم يتم العثور على البنل")
    let bundle = { embeds: [] };
    try {
        bundle = buildPublicPanelMessage(panel);
    } catch (bundleErr) {
        console.error('[panelSettingsBuilder] فشل بناء معاينة الباقة:', bundleErr.message);
        reportError('TICKET_BUNDLE_PREVIEW', panel.name, bundleErr);
    }
    const embeds = [infoEmbed, ...(bundle.embeds || [])];

    // في صفحة الرسائل نضيف معاينة لإيمبد التكت (فوق الأزرار داخل التكت)
    if (page === 'messages') {
        embeds.push(buildTicketEmbed(panel));
    }

    // في صفحة رسائل الأزرار: معاينة رسالة الإجراء المحدد
    if (page === 'actions' && actionKey) {
        const preview = buildActionPreview(panel, actionKey);
        if (preview) embeds.push(preview);
    }

    // حد ديسكورد: 10 إيمبدات كحد أقصى للرسالة الواحدة
    if (embeds.length > 10) embeds.length = 10;

    let rows = [];
    if (page === 'general') rows = buildGeneralPage(panel);
    else if (page === 'roles') rows = [...buildRolesPage(panel), buildRolesNavRow(), buildRolesBackRow()];
    else if (page === 'roles2') rows = [...buildRoles2Page(panel), buildBackToRolesRow()];
    else if (page === 'channels') rows = [...buildChannelsPage(), buildBackToGeneralRow()];
    else if (page === 'messages') rows = [...buildMessagesPage(), buildBackToGeneralRow()];
    else if (page === 'images') rows = [...buildImagesPage(panel), buildBackToGeneralRow()];
    else if (page === 'actions') rows = [...buildActionsPage(panel, actionKey), buildBackToGeneralRow()];

    return {
        embeds,
        components: rows,
    };
}

module.exports = {
    buildPanelSettings,
    PAGES,
};

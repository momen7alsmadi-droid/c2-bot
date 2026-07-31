/**
 * =========================================================
 *  handlers/publicPanelBuilder.js
 * =========================================================
 * بناء الرسالة "العامة" التي تُرسَل في روم معيّن (عبر زر [إرسال]
 * في لوحة الإدارة) والتي يراها الأعضاء العاديون ويستخدمونها
 * لفتح تذكرة جديدة.
 *
 * حسب `panel.ticketSystemType` المحفوظ في قاعدة البيانات
 * (الجزء الثاني)، تُبنى إما زر واحد أو قائمة منسدلة بخيار واحد.
 *
 * customId يحمل اسم البنل مباشرة (وليس عبر الجلسة) لأن هذه
 * الرسالة تبقى في السيرفر بشكل دائم ويستخدمها أعضاء متعددون في
 * أي وقت، فلا يصح ربطها بجلسة مؤقتة مثل لوحة الإدارة.
 * =========================================================
 */

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    resolveColor,
} = require('discord.js');
const { applyMessageVariables } = require('../utils/messageVariables');
const { safeEmoji } = require('../utils/emoji');
const { getPanelByName } = require('../database/panelsDB');

/**
 * لون آمن: يقبل أي صيغة لون صالحة (Hex/اسم/رقم) ويعيد
 * القيمة الرقمية الصالحة، أو اللون الافتراضي عند الخطأ
 * @param {String|Number|null} value
 * @returns {Number}
 */
function safeColor(value) {
    if (!value) return 0x2b2d31;
    try {
        return resolveColor(value);
    } catch {
        return 0x2b2d31;
    }
}

/**
 * بناء الرسالة "العامة" التي تُرسَل في روم معيّن (عبر زر [إرسال]
 * في لوحة الإدارة) والتي يراها الأعضاء العاديون ويستخدمونها
 * لفتح تذكرة جديدة.
 *
 * الرسالة قابلة للتخصيص بالكامل عبر panel.panelMessage:
 *   { title, description, footer, color }
 * أي حقل متروك فارغاً يعود للقيمة الافتراضية، وكل النصوص تدعم
 * المتغيرات مثل [server] [server_id] [time] (تمرر context عند الإرسال).
 *
 * حسب `panel.ticketSystemType` المحفوظ في قاعدة البيانات
 * (الجزء الثاني)، تُبنى إما زر واحد أو قائمة منسدلة بخيار واحد.
 *
 * customId يحمل اسم البنل مباشرة (وليس عبر الجلسة) لأن هذه
 * الرسالة تبقى في السيرفر بشكل دائم ويستخدمها أعضاء متعددون في
 * أي وقت، فلا يصح ربطها بجلسة مؤقتة مثل لوحة الإدارة.
 *
 * @param {Object} panel
 * @param {Object} [context] - سياق المتغيرات { guild, member, channelName, ticketNumber }
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
/**
 * بناء الإيمبد الخاص ببنل واحد داخل رسالة الباقة
 */
function buildPanelEmbed(panel, context) {
    const custom = panel.panelMessage || {};

    const embed = new EmbedBuilder()
        .setColor(safeColor(custom.color))
        .setTitle(
            applyMessageVariables(
                custom.title || `${safeEmoji(panel.emoji)} ${panel.name}`,
                context
            )
        )
        .setDescription(
            applyMessageVariables(
                custom.description ||
                    panel.description ||
                    'اضغط الزر/القائمة أدناه لفتح تذكرة جديدة.',
                context
            )
        )
        .setFooter({
            text: applyMessageVariables(custom.footer || 'نظام التذاكر', context),
        });

    // صورة مخصصة فوق الإيمبد (رابط مباشر أو رابط رسالة ديسكورد يُحل عند الحفظ)
    if (custom.image) {
        embed.setImage(custom.image);
    }

    return embed;
}

/**
 * بناء الرسالة "العامة" التي تُرسَل في روم معيّن (عبر زر [إرسال]
 * في لوحة الإدارة) والتي يراها الأعضاء العاديون ويستخدمونها
 * لفتح تذكرة جديدة.
 *
 * يدعم **باقة بنلات**: إما بنل واحد، أو بنل + كل البنلات المرتبطة به
 * (linkedPanels)، أو مصفوفة بنلات صريحة (عند النشر المتعدد).
 *
 * نظام العرض يتبع أول بنل في الباقة (نظام الفتح الخاص به):
 *   - 'buttons' -> كل بنل يُعرض كزر مستقل (5 أزرار لكل صف، حتى 25)
 *   - 'select'  -> كل البنلات في قائمة منسدلة واحدة (كل بنل خيار)
 *
 * @param {Object|Object[]} panel - بنل واحد أو مصفوفة بنلات
 * @param {Object} [context] - سياق المتغيرات { guild, member, channelName, ticketNumber }
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildPublicPanelMessage(panel, context = {}) {
    // توسيع الباقة: بنل واحد => نفسه + كل المرتبطين به (المصفوفة كما هي)
    const raw = Array.isArray(panel)
        ? panel
        : [panel, ...(panel.linkedPanels || []).map(getPanelByName).filter(Boolean)];
    const panels = raw.filter(Boolean).slice(0, 25); // حد Discord: 25 زر/خيار كحد أقصى
    if (!panels.length) return { embeds: [], components: [] };

    // إيمبد لكل بنل (حد Discord: 10 إيمبدات كحد أقصى)
    const embeds = panels.slice(0, 10).map(p => buildPanelEmbed(p, context));

    // نظام العرض يتبع أول بنل في الباقة
    const mode = panels[0].ticketSystemType === 'select' ? 'select' : 'buttons';
    const components = [];

    if (mode === 'select') {
        // قائمة منسدلة واحدة: كل بنل خيار، وقيمة الخيار = اسم البنل
        const select = new StringSelectMenuBuilder()
            .setCustomId(`ticket_open_select:${panels[0].name}`)
            .setPlaceholder(
                panels.length > 1
                    ? '📋 اختر نوع التذكرة لفتحها...'
                    : 'اختر لفتح تذكرة...'
            )
            .addOptions(
                panels.map(p => ({
                    label: `فتح تذكرة - ${p.name}`.slice(0, 100),
                    value: p.name,
                    emoji: safeEmoji(p.emoji),
                }))
            );
        components.push(new ActionRowBuilder().addComponents(select));
    } else {
        // أزرار: 5 لكل صف، وكل زر يفتح بنله مباشرة
        for (let i = 0; i < panels.length; i += 5) {
            const row = new ActionRowBuilder().addComponents(
                panels.slice(i, i + 5).map(p =>
                    new ButtonBuilder()
                        .setCustomId(`ticket_open:${p.name}`)
                        .setLabel(panels.length === 1 ? 'فتح تذكرة' : p.name.slice(0, 80))
                        .setEmoji(safeEmoji(p.emoji))
                        .setStyle(ButtonStyle.Primary)
                )
            );
            components.push(row);
        }
    }

    return { embeds, components };
}

module.exports = { buildPublicPanelMessage, safeColor };

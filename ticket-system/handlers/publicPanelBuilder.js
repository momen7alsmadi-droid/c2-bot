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
function buildPublicPanelMessage(panel, context = {}) {
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

    let row;
    if (panel.ticketSystemType === 'select') {
        const select = new StringSelectMenuBuilder()
            .setCustomId(`ticket_open_select:${panel.name}`)
            .setPlaceholder('اختر لفتح تذكرة...')
            .addOptions({
                label: `فتح تذكرة - ${panel.name}`,
                value: 'open',
                emoji: safeEmoji(panel.emoji),
            });
        row = new ActionRowBuilder().addComponents(select);
    } else {
        const button = new ButtonBuilder()
            .setCustomId(`ticket_open:${panel.name}`)
            .setLabel(`فتح تذكرة`)
            .setEmoji(safeEmoji(panel.emoji))
            .setStyle(ButtonStyle.Primary);
        row = new ActionRowBuilder().addComponents(button);
    }

    return { embeds: [embed], components: [row] };
}

module.exports = { buildPublicPanelMessage };

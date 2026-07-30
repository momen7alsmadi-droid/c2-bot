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
} = require('discord.js');

/**
 * @param {Object} panel
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildPublicPanelMessage(panel) {
    const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(`${panel.emoji || '🎫'} ${panel.name}`)
        .setDescription(panel.description || 'اضغط الزر/القائمة أدناه لفتح تذكرة جديدة.')
        .setFooter({ text: 'نظام التذاكر' });

    let row;
    if (panel.ticketSystemType === 'select') {
        const select = new StringSelectMenuBuilder()
            .setCustomId(`ticket_open_select:${panel.name}`)
            .setPlaceholder('اختر لفتح تذكرة...')
            .addOptions({
                label: `فتح تذكرة - ${panel.name}`,
                value: 'open',
                emoji: panel.emoji || '🎫',
            });
        row = new ActionRowBuilder().addComponents(select);
    } else {
        const button = new ButtonBuilder()
            .setCustomId(`ticket_open:${panel.name}`)
            .setLabel(`فتح تذكرة`)
            .setEmoji(panel.emoji || '🎫')
            .setStyle(ButtonStyle.Primary);
        row = new ActionRowBuilder().addComponents(button);
    }

    return { embeds: [embed], components: [row] };
}

module.exports = { buildPublicPanelMessage };

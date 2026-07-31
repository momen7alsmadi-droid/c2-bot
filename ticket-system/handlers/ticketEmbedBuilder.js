/**
 * =========================================================
 *  handlers/ticketEmbedBuilder.js
 * =========================================================
 * بناء "الإيمبد فوق الأزرار داخل التكت" — رسالة الترحيب/التحكم
 * التي يراها العضو والستاف عند فتح التذكرة.
 *
 * قابل للتخصيص بالكامل عبر panel.ticketEmbed:
 *   { title, description, image, color }
 * - أي حقل متروك فارغاً يعود للقيمة الافتراضية
 * - description فارغ = رسالة الترحيب المخصصة (panel.welcomeMessage)
 * - كل النصوص تدعم المتغيرات ([user] [server] [time] ... إلخ)
 * - image: رابط مباشر أو رابط رسالة ديسكورد (يُحل عند الحفظ)
 * =========================================================
 */

const { EmbedBuilder } = require('discord.js');
const { applyMessageVariables } = require('../utils/messageVariables');
const { safeEmoji } = require('../utils/emoji');
const { safeColor } = require('./publicPanelBuilder');

const DEFAULT_TICKET_TEXT =
    'مرحباً [user]، شكراً لتواصلك مع [server]. سيقوم أحد أعضاء فريقنا بمساعدتك قريباً.';

/**
 * بناء إيمبد الترحيب/التحكم داخل التكت
 * @param {Object} panel
 * @param {Object} [context] - سياق المتغيرات { member, guild, channelName, channelId, ticketNumber, staffRoles, pingRoles }
 * @returns {EmbedBuilder}
 */
function buildTicketEmbed(panel, context = {}) {
    const custom = panel.ticketEmbed || {};

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
                custom.description || panel.welcomeMessage || DEFAULT_TICKET_TEXT,
                context
            )
        )
        .setTimestamp();

    // صورة مخصصة فوق الأزرار داخل التكت
    if (custom.image) {
        embed.setImage(custom.image);
    }

    return embed;
}

module.exports = { buildTicketEmbed, DEFAULT_TICKET_TEXT };

/**
 * =========================================================
 *  handlers/ticketEmbedBuilder.js
 * =========================================================
 * بناء الإيمبدات والرسائل التي تظهر داخل التذكرة:
 *
 *  1) رسالة الترحيب — تُرسَل كرسالة منفصلة تماماً عن أزرار التحكم:
 *     - قابلة للتخصيص بالكامل عبر panel.welcomeSettings:
 *         { type: 'embed'|'text', content, title, description, color, image }
 *     - type = 'embed' -> رسالة تحتوي إيمبد (عنوان + وصف + لون + صورة)
 *                        مع كلام اختياري خارج الإيمبد (content)
 *     - type = 'text'  -> رسالة نصية عادية (content أو description أو الافتراضي)
 *     - كل النصوص تدعم المتغيرات ([user] [server] [time] ... إلخ)
 *
 *  2) إيمبد التكت فوق أزرار التحكم (panel.ticketEmbed):
 *     - يبقى كما هو: { title, description, color, image }
 *     - أي حقل متروك فارغاً يعود للقيمة الافتراضية
 *     - description فارغ = بدون وصف (رسالة الترحيب أصبحت منفصلة)
 * =========================================================
 */

const { EmbedBuilder } = require('discord.js');
const { applyMessageVariables } = require('../utils/messageVariables');
const { safeEmoji } = require('../utils/emoji');
const { safeColor } = require('./publicPanelBuilder');

const DEFAULT_TICKET_TEXT =
    'مرحباً [user]، شكراً لتواصلك مع [server]. سيقوم أحد أعضاء فريقنا بمساعدتك قريباً.';

/**
 * قراءة إعدادات رسالة الترحيب مع دمج القيم الافتراضية والتوافق
 * مع الحقل القديم panel.welcomeMessage (كان نصاً واحداً).
 * @param {Object} panel
 * @returns {{ type: 'embed'|'text', content: String|null, title: String|null, description: String|null, color: String|null, image: String|null }}
 */
function getWelcomeSettings(panel) {
    const ws = (panel && panel.welcomeSettings) || {};
    return {
        type: ws.type === 'text' ? 'text' : 'embed',
        content: typeof ws.content === 'string' ? ws.content : null,
        title: typeof ws.title === 'string' ? ws.title : null,
        description: typeof ws.description === 'string'
            ? ws.description
            : (typeof panel.welcomeMessage === 'string' ? panel.welcomeMessage : null),
        color: typeof ws.color === 'string' ? ws.color : null,
        image: typeof ws.image === 'string' ? ws.image : null,
    };
}

/**
 * بناء إيمبد رسالة الترحيب (عند اختيار النوع 'embed')
 * @param {Object} panel
 * @param {Object} [context] - سياق المتغيرات
 * @returns {EmbedBuilder}
 */
function buildWelcomeEmbed(panel, context = {}) {
    const ws = getWelcomeSettings(panel);
    const embed = new EmbedBuilder()
        .setColor(safeColor(ws.color))
        .setTitle(
            applyMessageVariables(
                ws.title || `${safeEmoji(panel.emoji)} ${panel.name}`,
                context
            )
        )
        .setDescription(
            applyMessageVariables(ws.description || DEFAULT_TICKET_TEXT, context)
        )
        .setTimestamp();

    if (ws.image) embed.setImage(ws.image);
    return embed;
}

/**
 * النص النهائي لرسالة الترحيب (عند اختيار النوع 'text')
 * @param {Object} panel
 * @param {Object} [context] - سياق المتغيرات
 * @returns {String}
 */
function buildWelcomeText(panel, context = {}) {
    const ws = getWelcomeSettings(panel);
    const source = ws.content || ws.description || DEFAULT_TICKET_TEXT;
    return applyMessageVariables(source, context).slice(0, 2000);
}

/**
 * إرسال رسالة الترحيب داخل التذكرة — رسالة منفصلة تماماً عن
 * أزرار التحكم. نوعها حسب panel.welcomeSettings.type.
 * @param {import('discord.js').TextChannel} channel - روم التذكرة
 * @param {Object} panel
 * @param {Object} [context] - سياق المتغيرات
 */
async function sendWelcomeMessage(channel, panel, context = {}) {
    const ws = getWelcomeSettings(panel);

    if (ws.type === 'text') {
        await channel.send({ content: buildWelcomeText(panel, context) });
        return;
    }

    const content = ws.content ? applyMessageVariables(ws.content, context).slice(0, 2000) : '';
    await channel.send({ content, embeds: [buildWelcomeEmbed(panel, context)] });
}

/**
 * بناء الإيمبد فوق أزرار التحكم داخل التكت
 * (يُرسَل مع رسالة التحكم، وليس مع رسالة الترحيب)
 * @param {Object} panel
 * @param {Object} [context] - سياق المتغيرات
 * @returns {EmbedBuilder}
 */
function buildTicketEmbed(panel, context = {}) {
    const custom = (panel && panel.ticketEmbed) || {};

    const embed = new EmbedBuilder()
        .setColor(safeColor(custom.color))
        .setTitle(
            applyMessageVariables(
                custom.title || `${safeEmoji(panel.emoji)} ${panel.name}`,
                context
            )
        )
        .setTimestamp();

    // الوصف اختياري: فارغ = بدون وصف (رسالة الترحيب أصبحت رسالة منفصلة)
    if (custom.description) {
        embed.setDescription(applyMessageVariables(custom.description, context));
    }

    if (custom.image) embed.setImage(custom.image);

    return embed;
}

module.exports = {
    buildTicketEmbed,
    buildWelcomeEmbed,
    buildWelcomeText,
    sendWelcomeMessage,
    getWelcomeSettings,
    DEFAULT_TICKET_TEXT,
};

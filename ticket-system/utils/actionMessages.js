/**
 * =========================================================
 *  utils/actionMessages.js
 * =========================================================
 * نظام "رسائل الإجراءات" — رسالة إيمبد تُرسل تلقائياً في التكت
 * عند استخدام أي زر من أزرار التحكم (استلام، إلغاء استلام،
 * قفل، فتح، حذف، تحويل، إضافة عضو، إخراج عضو، ... إلخ).
 *
 * كل إجراء له:
 *   - جملة افتراضية جاهزة (لا حاجة لكتابة أي شيء)
 *   - إمكانية التفعيل/الإطفاء (enabled)
 *   - تخصيص الكلام فوق الإيمبد (content) وداخله (description)
 *     والعنوان (title)
 *
 * المتغيرات المدعومة (بالإضافة إلى متغيرات النظام):
 *   [actor]        -> منشن من ضغط الزر (الإداري المنفذ)
 *   [actor_name]   -> اسم من ضغط الزر
 *   [actor_id]     -> آيدي من ضغط الزر
 *   [actor_role]   -> أعلى رتبة لمن ضغط الزر
 *   [member]       -> منشن العضو المستهدف (في إضافة/إخراج/تحويل الاستلام)
 *   [opener]       -> منشن فاتح التذكرة
 *   [claimed_by]   -> منشن مستلم التذكرة الحالي
 *   [ticket_created]-> تاريخ فتح التذكرة
 *   [category]     -> اسم الكاتيجوري
 *
 * التخزين: panel.actionMessages = {
 *   claim: { enabled, content, title, description }, ...
 * }
 * أي حقل متروك null/فارغ يعود للجملة الافتراضية.
 * =========================================================
 */

const { EmbedBuilder } = require('discord.js');
const { reportError } = require('../../src/utils/errorLogger');
const { applyMessageVariables } = require('./messageVariables');

// ===== الجمل الافتراضية لكل إجراء =====
const DEFAULT_ACTION_MESSAGES = {
    claim: {
        label: '🤝 استلام التذكرة',
        enabled: true,
        content: '',
        title: '🤝 تم استلام التذكرة',
        description: 'تم استلام تذكرة [opener] بواسطة [actor]. سيتم الرد عليك قريباً.',
    },
    unclaim: {
        label: '↩️ إلغاء الاستلام',
        enabled: true,
        content: '',
        title: '↩️ تم إلغاء الاستلام',
        description: 'تم إلغاء استلام هذه التذكرة بواسطة [actor].',
    },
    lock: {
        label: '🔒 قفل التذكرة',
        enabled: true,
        content: '',
        title: '🔒 تم قفل التذكرة',
        description: 'تم قفل هذه التذكرة بواسطة [actor].',
    },
    reopen: {
        label: '🔓 فتح التذكرة',
        enabled: true,
        content: '',
        title: '🔓 تم فتح التذكرة',
        description: 'تم إعادة فتح هذه التذكرة بواسطة [actor].',
    },
    delete: {
        label: '🗑️ حذف التذكرة',
        enabled: true,
        content: '',
        title: '🗑️ تم حذف التذكرة',
        description: 'تم حذف هذه التذكرة بواسطة [actor].',
    },
    escalate: {
        label: '📢 تحويل للإدارة العليا',
        enabled: true,
        content: '',
        title: '📢 تم تحويل التذكرة',
        description: 'تم تحويل هذه التذكرة للإدارة العليا بواسطة [actor].',
    },
    addMember: {
        label: '➕ إضافة عضو',
        enabled: true,
        content: '',
        title: '➕ تمت إضافة عضو',
        description: 'تمت إضافة [member] إلى التذكرة بواسطة [actor].',
    },
    removeMember: {
        label: '➖ إخراج عضو',
        enabled: true,
        content: '',
        title: '➖ تم إخراج عضو',
        description: 'تم إخراج [member] من التذكرة بواسطة [actor].',
    },
    transferClaim: {
        label: '🔄 تحويل الاستلام',
        enabled: true,
        content: '',
        title: '🔄 تم تحويل الاستلام',
        description: 'تم تحويل استلام هذه التذكرة إلى [member] بواسطة [actor].',
    },
    rename: {
        label: '✏️ تغيير اسم التذكرة',
        enabled: true,
        content: '',
        title: '✏️ تم تغيير اسم التذكرة',
        description: 'تم تغيير اسم التذكرة من **[old_name]** إلى **[new_name]** بواسطة [actor].',
    },
};

const ACTION_KEYS = Object.keys(DEFAULT_ACTION_MESSAGES);

/**
 * قراءة إعدادات رسالة إجراء معيّن (مع دمج القيم المخصصة فوق الافتراضية)
 * @param {Object} panel
 * @param {String} actionKey
 * @returns {{ label: String, enabled: Boolean, content: String, title: String, description: String } | null}
 */
function getActionMessage(panel, actionKey) {
    const def = DEFAULT_ACTION_MESSAGES[actionKey];
    if (!def) return null;

    const custom = (panel.actionMessages && panel.actionMessages[actionKey]) || {};
    return {
        label: def.label,
        enabled: custom.enabled ?? def.enabled,
        content: custom.content ?? def.content,
        title: custom.title ?? def.title,
        description: custom.description ?? def.description,
    };
}

/**
 * هل إجراء معيّن مفعّل؟
 */
function isActionEnabled(panel, actionKey) {
    const msg = getActionMessage(panel, actionKey);
    return msg ? msg.enabled : false;
}

/**
 * استبدال المتغيرات + [member]
 */
function applyActionVariables(text, context, targetMention) {
    let result = applyMessageVariables(text, context);
    if (targetMention) result = result.replaceAll('[member]', targetMention);
    return result;
}

/**
 * إرسال رسالة إجراء داخل التكت (لا يُرسل شيء إذا كان معطلاً)
 * @param {import('discord.js').TextChannel} channel - روم التذكرة
 * @param {Object} panel
 * @param {String} actionKey
 * @param {Object} [context] - سياق المتغيرات
 * @param {String} [context.targetMention] - منشن العضو المستهدف ([member])
 */
async function sendActionMessage(channel, panel, actionKey, context = {}) {
    const msg = getActionMessage(panel, actionKey);
    if (!msg || !msg.enabled) return;

    const targetMention = context.targetMention || null;

    try {
        const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(applyActionVariables(msg.title, context, targetMention).slice(0, 256))
            .setDescription(applyActionVariables(msg.description, context, targetMention).slice(0, 4000))
            .setTimestamp();

        const content = msg.content
            ? applyActionVariables(msg.content, context, targetMention).slice(0, 2000)
            : '';

        await channel.send({ content, embeds: [embed] });
    } catch (err) {
        console.error(`[actionMessages] فشل إرسال رسالة إجراء ${actionKey}:`, err.message);
        reportError('TICKET_ACTION_MESSAGE', actionKey, err);
    }
}

module.exports = {
    DEFAULT_ACTION_MESSAGES,
    ACTION_KEYS,
    getActionMessage,
    isActionEnabled,
    sendActionMessage,
};

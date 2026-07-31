/**
 * =========================================================
 *  utils/panelResolver.js
 * =========================================================
 * حل مشكلة الجلسات المؤقتة: جلسة الإعدادات محفوظة في الذاكرة
 * (RAM) وتُمسح عند إعادة تشغيل البوت. لذلك أضفنا اسم البنل إلى
 * تذييل إيمبد المعلومات في لوحة الإعدادات، وأي تفاعل لاحق يمكنه
 * استخراج اسم البنل من التذييل حتى لو فُقدت الجلسة.
 *
 * الأولوية:
 *   1) الجلسة (الأسرع، موجودة أثناء العمل العادي)
 *   2) تذييل إيمبد المعلومات (يعمل حتى بعد إعادة التشغيل)
 * =========================================================
 */

const { getPanelByName } = require('../database/panelsDB');
const { getSession } = require('../handlers/sessionStore');

/**
 * استخراج اسم البنل من تذييل إيمبد المعلومات
 * التذييل بصيغة: "بنل: <الاسم> | الصفحة: <الصفحة>"
 * @param {import('discord.js').BaseInteraction} interaction
 * @returns {String|null}
 */
function extractPanelNameFromFooter(interaction) {
    try {
        const footer = interaction.message?.embeds?.[0]?.footer?.text || '';
        const match = footer.match(/بنل:\s*([^|]+)/);
        return match ? match[1].trim() : null;
    } catch {
        return null;
    }
}

/**
 * استخراج الصفحة الحالية من تذييل إيمبد المعلومات
 * @param {import('discord.js').BaseInteraction} interaction
 * @returns {String|null} 'general' | 'roles' | 'channels' | 'messages' | null
 */
function extractPageFromFooter(interaction) {
    try {
        const footer = interaction.message?.embeds?.[0]?.footer?.text || '';
        const match = footer.match(/الصفحة:\s*([^|]+)/);
        return match ? match[1].trim() : null;
    } catch {
        return null;
    }
}

/**
 * استرجاع الجلسة الفعالة (مع احتياط التذييل)
 * @param {import('discord.js').BaseInteraction} interaction
 * @returns {{ panelName: String, page: String, actionKey: String|undefined }}
 */
function resolveSession(interaction) {
    const messageId = interaction.message?.id;

    // 1) الجلسة في الذاكرة
    const session = getSession(messageId);
    if (session && session.panelName) {
        return {
            panelName: session.panelName,
            page: session.page || 'general',
            actionKey: session.actionKey,
        };
    }

    // 2) احتياط: من تذييل الإيمبد (بعد إعادة تشغيل البوت)
    const fromFooter = extractPanelNameFromFooter(interaction);
    if (fromFooter) {
        const page = extractPageFromFooter(interaction);
        return {
            panelName: fromFooter,
            page: page || 'general',
            // قد تكون الجلسة تحوي إجراءً محدداً حتى لو فُقد الاسم (نمرره مع الاحتياط)
            actionKey: session.actionKey,
        };
    }

    return { panelName: null, page: 'general' };
}

/**
 * استرجاع كائن البنل الفعلي (مع احتياط التذييل)
 * @param {import('discord.js').BaseInteraction} interaction
 * @returns {Object|null}
 */
function resolvePanel(interaction) {
    const { panelName } = resolveSession(interaction);
    if (!panelName) return null;
    return getPanelByName(panelName);
}

module.exports = { resolvePanel, resolveSession, extractPanelNameFromFooter, extractPageFromFooter };

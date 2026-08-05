/**
 * =========================================================
 *  handlers/ticketStore.js
 * =========================================================
 * تخزين حالة كل تذكرة "أثناء عملها".
 * المفتاح: channelId الخاص بروم التذكرة.
 *
 * ⚠️ ملاحظة مهمة: سابقاً كانت الجلسات في الذاكرة فقط، وبعد أي
 * إعادة تشغيل للبوت كانت كل رومات التذاكر المفتوحة تفقد جلستها
 * وتصبح "غير فعّالة" (كل الأزرار ترفض العمل). الآن تُحفظ الجلسات
 * تلقائياً في ملف JSON على القرص (مع كتابة مخفّفة Debounced)
 * وتُستعاد عند إقلاع البوت عبر initTicketStore() — فيبقى كل تكت
 * مفتوح يعمل بنفس الحالة بعد إعادة التشغيل.
 *
 * شكل الجلسة الواحدة:
 * {
 *   panelName: String,        -> اسم البنل الذي أُنشئت منه التذكرة
 *   openerId: String,         -> آيدي صاحب التذكرة
 *   claimedBy: String|null,   -> آيدي المستلم الحالي
 *   addedMembers: Array<String>, -> أعضاء تمت إضافتهم يدوياً للتكت
 *   escalated: Boolean,       -> هل تم تصعيد التكت للإدارة العليا
 *   openedAt: Number,
 *   lockedAt: Number|null,
 *   deleteTimer: NodeJS.Timeout|null, -> مرجع العداد التنازلي (لا يُحفظ)
 *   deleteCountdown: Number,
 *   auditLog: Array<{ text: String, timestamp: Number }>,
 * }
 * =========================================================
 */

const fs = require('fs');
const path = require('path');
const { reportError } = require('../../src/utils/errorLogger');

const SESSIONS_PATH = path.join(__dirname, '..', 'data', 'ticket-sessions.json');

const sessions = new Map();
let saveTimer = null;

// المفاتيح المسموح حفظها في ملف الجلسات (نستبعد المؤقّتات والمراجع)
const SERIALIZABLE_KEYS = [
    'channelId',
    'panelName',
    'openerId',
    'claimedBy',
    'claimedAt',
    'lastActivityAt',
    'addedMembers',
    'escalated',
    'openedAt',
    'lockedAt',
    'controlMessageId',
    'closeMessageId',
    'deleteCountdown',
    'deletedBy',
    'idleWarningSent',
    'staffNotes',
    'auditLog',
];

// ---------- الحفظ على القرص (كتابة مخفّفة) ----------

function ensureSessionsFile() {
    const dir = path.dirname(SESSIONS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(SESSIONS_PATH)) {
        fs.writeFileSync(SESSIONS_PATH, JSON.stringify({ sessions: [] }, null, 2), 'utf-8');
    }
}

function writeSessionsNow() {
    try {
        ensureSessionsFile();
        const data = { sessions: [...sessions.values()].map(serializeSession) };
        fs.writeFileSync(SESSIONS_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error('[ticketStore] فشل حفظ الجلسات على القرص:', err.message);
        reportError('TICKET_STORE_SAVE', 'ticket-sessions', err);
    }
}

/**
 * كتابة مخفّفة: دمج عدة تحديثات سريعة في كتابة واحدة بعد 400ms
 */
function persistSessions() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeSessionsNow, 400);
}

function serializeSession(session) {
    const out = {};
    for (const key of SERIALIZABLE_KEYS) {
        if (session[key] !== undefined) out[key] = session[key];
    }
    return out;
}

/**
 * تنظيف جلسة مستعادة من القرص: ضمان المصفوفات + إبطال أي عداد
 * تنازلي قديم (لا يمكن استئنافه بعد إعادة التشغيل)
 */
function sanitizeLoadedSession(raw) {
    return {
        panelName: typeof raw.panelName === 'string' ? raw.panelName : null,
        openerId: typeof raw.openerId === 'string' ? raw.openerId : '',
        claimedBy: typeof raw.claimedBy === 'string' ? raw.claimedBy : null,
        claimedAt: typeof raw.claimedAt === 'number' ? raw.claimedAt : null,
        lastActivityAt: typeof raw.lastActivityAt === 'number' ? raw.lastActivityAt : Date.now(),
        addedMembers: Array.isArray(raw.addedMembers) ? raw.addedMembers : [],
        escalated: !!raw.escalated,
        openedAt: typeof raw.openedAt === 'number' ? raw.openedAt : Date.now(),
        lockedAt: typeof raw.lockedAt === 'number' ? raw.lockedAt : null,
        controlMessageId: typeof raw.controlMessageId === 'string' ? raw.controlMessageId : null,
        closeMessageId: typeof raw.closeMessageId === 'string' ? raw.closeMessageId : null,
        deleteTimer: null,
        deleteCountdown: 0,
        deletedBy: typeof raw.deletedBy === 'string' ? raw.deletedBy : null,
        idleWarningSent: !!raw.idleWarningSent,
        staffNotes: Array.isArray(raw.staffNotes) ? raw.staffNotes : [],
        auditLog: Array.isArray(raw.auditLog) ? raw.auditLog : [],
    };
}

/**
 * استعادة الجلسات المحفوظة عند إقلاع البوت (يُستدعى من ملف التشغيل)
 */
function initTicketStore() {
    try {
        ensureSessionsFile();
        const raw = fs.readFileSync(SESSIONS_PATH, 'utf-8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.sessions)) {
            let restored = 0;
            for (const s of data.sessions) {
                if (s && typeof s.channelId === 'string' && s.panelName) {
                    sessions.set(s.channelId, sanitizeLoadedSession(s));
                    restored++;
                }
            }
            if (restored > 0) {
                console.log(`[ticketStore] ✅ تمت استعادة ${restored} جلسة تذكرة من القرص`);
            }
        }
    } catch (err) {
        console.error('[ticketStore] تعذّر استعادة الجلسات (سيبدأ من جديد):', err.message);
        reportError('TICKET_STORE_LOAD', 'ticket-sessions', err);
    }
}

// ---------- عمليات الجلسات ----------

/**
 * إنشاء جلسة جديدة عند فتح تذكرة
 * @param {String} channelId
 * @param {Object} data
 */
function createSession(channelId, data) {
    sessions.set(channelId, {
        panelName: data.panelName,
        openerId: data.openerId,
        claimedBy: null,
        claimedAt: null,
        lastActivityAt: Date.now(),
        addedMembers: [],
        escalated: false,
        openedAt: Date.now(),
        lockedAt: null,
        controlMessageId: null,
        closeMessageId: null,
        deleteTimer: null,
        deleteCountdown: 0,
        deletedBy: null,
        idleWarningSent: false,
        staffNotes: [],
        auditLog: [],
        ...data,
        channelId, // نحفظ المفتاح داخل الجلسة لاستعادته من القرص
    });
    persistSessions();
}

/**
 * جلب جلسة تذكرة
 * @param {String} channelId
 * @returns {Object|null}
 */
function getSession(channelId) {
    return sessions.get(channelId) || null;
}

/**
 * تحديث (دمج) بيانات جلسة موجودة
 * @param {String} channelId
 * @param {Object} updates
 */
function updateSession(channelId, updates) {
    const current = sessions.get(channelId);
    if (!current) return null;
    const merged = { ...current, ...updates };
    sessions.set(channelId, merged);
    persistSessions();
    return merged;
}

/**
 * جلب كل الجلسات النشطة حالياً (للإحصاءات: حدود الفتح/الاستلام)
 * @returns {Array<Object>}
 */
function getAllSessions() {
    return [...sessions.values()];
}

/**
 * إضافة سطر إلى "سجل الأحداث المؤقت" الخاص بالتذكرة
 * @param {String} channelId
 * @param {String} text - وصف الحدث، مثال: "<@123> قام بالاستلام"
 */
function addAuditLog(channelId, text) {
    const session = sessions.get(channelId);
    if (!session) return;
    session.auditLog.push({ text, timestamp: Date.now() });
    persistSessions();
}

/**
 * حذف الجلسة نهائياً (بعد اكتمال الحذف والأرشفة في اللوق)
 * @param {String} channelId
 */
function deleteSession(channelId) {
    const session = sessions.get(channelId);
    if (session?.deleteTimer) clearInterval(session.deleteTimer);
    sessions.delete(channelId);
    persistSessions();
}

module.exports = {
    createSession,
    getSession,
    updateSession,
    getAllSessions,
    addAuditLog,
    deleteSession,
    initTicketStore,
};

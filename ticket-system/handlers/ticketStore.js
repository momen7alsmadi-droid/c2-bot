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
const mongoose = require('mongoose');
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
    'messageCounts',
    'staffActivity',
    'lastMsgAuthorId',
    'statsCommitted',
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
    scheduleMongoSync(); // نسخ احتياطي إلى MongoDB (بلا انتظار)
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
        channelId: typeof raw.channelId === 'string' ? raw.channelId : null,
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
        messageCounts: raw.messageCounts && typeof raw.messageCounts === 'object' ? raw.messageCounts : {},
        staffActivity: raw.staffActivity && typeof raw.staffActivity === 'object' ? raw.staffActivity : {},
        lastMsgAuthorId: typeof raw.lastMsgAuthorId === 'string' ? raw.lastMsgAuthorId : null,
        statsCommitted: !!raw.statsCommitted,
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
    const session = {
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
        messageCounts: {},
        statsCommitted: false,
        auditLog: [],
        ...data,
        channelId, // نحفظ المفتاح داخل الجلسة لاستعادته من القرص
    };
    sessions.set(channelId, session);
    persistSessions();
    return session;
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

// =========================================================
// MongoDB Backup (نسخ احتياطي — حماية من مسح القرص المؤقت)
// =========================================================
// الجلسات تُحفظ في MongoDB مثل البنلات والإحصائيات: كل تغيير
// يُنسخ خلف الكواليس، وعند التشغيل تُستعاد أي جلسات فُقدت من
// القرص المؤقت (المنصات المجانية تمسح القرص عند كل نشر).

const sessionSchema = new mongoose.Schema({ _id: String }, { collection: 'ticketsessions', versionKey: false, strict: false });

let SessionModel;

function isMongoReady() {
    if (mongoose.connection.readyState !== 1) return false;
    if (SessionModel) return true;
    try {
        SessionModel = mongoose.models.TicketSession || mongoose.model('TicketSession', sessionSchema);
        return true;
    } catch {
        return false;
    }
}

/** تهيئة النموذج (تُستدعى عند التشغيل) */
function initSessionModel() {
    if (isMongoReady()) {
        console.log('📦 ticketSessions → ✅ MongoDB');
        return true;
    }
    console.log('📦 ticketSessions → ⚠️ JSON فقط');
    return false;
}

let mongoSyncTimer = null;

/** مزامنة كل الجلسات من JSON إلى MongoDB (كتابة مخفّفة) */
function scheduleMongoSync() {
    clearTimeout(mongoSyncTimer);
    mongoSyncTimer = setTimeout(() => {
        syncSessionsToMongo().catch(() => {});
    }, 2000);
}

/**
 * مزامنة كل الجلسات إلى MongoDB (Upsert)
 * @returns {Promise<Number>} عدد الجلسات المُزامنة
 */
async function syncSessionsToMongo() {
    if (!isMongoReady()) return 0;
    const all = [...sessions.values()];
    if (all.length === 0) return 0;
    try {
        const ops = all.map(s => ({
            updateOne: {
                filter: { _id: s.channelId },
                update: { $set: { ...serializeSession(s), _id: s.channelId } },
                upsert: true,
            },
        }));
        await SessionModel.bulkWrite(ops, { ordered: false });
        console.log(`✅ sessions: تمت مزامنة ${all.length} جلسة إلى MongoDB`);
        return all.length;
    } catch (e) {
        console.error('❌ sessions sync MongoDB:', e.message);
        reportError('TICKET_STORE_SAVE', 'sessions-mongo-sync', e);
        return 0;
    }
}

/**
 * استعادة الجلسات من MongoDB (حماية من مسح القرص):
 * يُضاف أي جلسة موجودة في MongoDB ولا توجد في الذاكرة.
 * @returns {Promise<Number>} عدد الجلسات المستعادة
 */
async function loadSessionsFromMongo() {
    if (!isMongoReady()) return 0;
    try {
        const docs = await SessionModel.find().lean();
        if (!docs || docs.length === 0) return 0;
        let restored = 0;
        for (const doc of docs) {
            const id = doc._id;
            if (!id || !doc.panelName) continue;
            if (sessions.has(id)) continue; // الموجود في الذاكرة هو الأحدث
            const { _id, deleteTimer, ...rest } = doc;
            sessions.set(id, sanitizeLoadedSession({ ...rest, channelId: id }));
            restored++;
        }
        if (restored > 0) {
            persistSessions();
            console.log(`🔄 sessions: تمت استعادة ${restored} جلسة من MongoDB`);
        }
        return restored;
    } catch (e) {
        console.error('❌ sessions load MongoDB:', e.message);
        reportError('TICKET_STORE_LOAD', 'sessions-mongo-load', e);
        return 0;
    }
}

// =========================================================
// استعادة جلسة تذكرة من رسالة التحكم (حماية إضافية):
// عندما يضغط ستاف زر (قفل/استلام) في تكت بلا جلسة — بسبب
// فقدان ملف الجلسات أو حالة نادرة — نعيد بناء الجلسة من رسالة
// التحكم نفسها بدل عرض "هذه ليست تذكرة فعالة".
// =========================================================

/**
 * محاولة استعادة جلسة من رسالة التحكم في الروم:
 *   - نبحث عن رسالة تحمل أزرار ticket_claim/ticket_lock
 *   - نستخرج اسم البنل من عنوان الإيمبد + آيدي الفاتح من المنشن
 * @param {import('discord.js').TextChannel} channel
 * @returns {Promise<Object|null>} الجلسة المستعادة أو null
 */
async function recoverTicketSession(channel) {
    if (!channel || !channel.guild) return null;
    try {
        // نبحث في آخر 30 رسالة عن رسالة التحكم (تحمل أزرار القفل/الاستلام)
        const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
        if (!messages) return null;

        const controlMsg = [...messages.values()].find(m => {
            const row = m.components?.find(r => r.components?.some(b => ['ticket_claim', 'ticket_lock'].includes(b.customId)));
            return !!row;
        });
        if (!controlMsg) return null;

        // 1) اسم البنل: عنوان الإيمبد = "إيموجي + اسم البنل" (ننزع الإيموجي)
        const title = controlMsg.embeds?.[0]?.title || '';
        const panelName = title.replace(/^[^\p{L}\p{N}]+/u, '').trim(); // إزالة أي إيموجي في البداية
        if (!panelName) return null;
        const { getPanelByName } = require('../database/panelsDB');
        const panel = getPanelByName(panelName);
        if (!panel) return null;

        // 2) آيدي الفاتح: أول منشن مستخدم في محتوى رسالة التحكم
        const content = controlMsg.content || '';
        const mentionMatch = content.match(/<@(\d+)>/);
        const openerId = mentionMatch ? mentionMatch[1] : '';

        const session = createSession(channel.id, {
            panelName: panel.name,
            openerId,
            controlMessageId: controlMsg.id,
        });
        console.log(`♻️ sessions: تمت استعادة جلسة تذكرة ${channel.name} من رسالة التحكم (بنل: ${panel.name})`);
        return session;
    } catch (e) {
        console.error('[ticketStore] فشل استعادة الجلسة من الرسالة:', e.message);
        reportError('TICKET_STORE_LOAD', 'session-from-message', e);
        return null;
    }
}

module.exports = {
    createSession,
    getSession,
    updateSession,
    getAllSessions,
    addAuditLog,
    deleteSession,
    initTicketStore,
    // MongoDB backup + استعادة
    initSessionModel,
    syncSessionsToMongo,
    loadSessionsFromMongo,
    recoverTicketSession,
};

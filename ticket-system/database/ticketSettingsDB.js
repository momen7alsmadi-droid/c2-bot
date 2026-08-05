/**
 * =========================================================
 *  database/ticketSettingsDB.js
 * =========================================================
 * الإعدادات العامة لنظام التذاكر (تظهر عبر زر "⚙️ إعدادات عامة"
 * في لوحة التحكم الرئيسية):
 *
 *   maxOpenPerUser:          كم تذكرة يفتحها العضو في نفس الوقت (0 = لا نهائي)
 *   maxOpenPerPanelPerUser:  كم تذكرة يفتحها العضو من نفس البنل (0 = لا نهائي)
 *   openCooldownMinutes:     كولداون بين فتح تذكرة وأخرى بالدقائق (0 = بدون)
 *   maxClaimsPerStaff:       كم تذكرة يستلمها الستاف في نفس الوقت (0 = لا نهائي)
 *
 * ملاحظات مهمة:
 *   - أي عضو يملك صلاحية Administrator لا يشملها أي حد أو كولداون.
 *   - القيمة 0 تعني "بدون حد / لا نهائي".
 *
 * التخزين: ملف JSON (مصدر متزامن) + مرآة MongoDB (حماية من المسح)
 * =========================================================
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { reportError } = require('../../src/utils/errorLogger');

const DB_PATH = path.join(__dirname, '..', 'data', 'ticket-settings.json');

const DEFAULT_SETTINGS = {
    maxOpenPerUser: 0,
    maxOpenPerPanelPerUser: 0,
    openCooldownMinutes: 0,
    maxClaimsPerStaff: 0,
    // إغلاق تلقائي للخمول
    autoCloseEnabled: 0, // 1 = مفعّل
    autoCloseIdleHours: 24, // ساعات الخمول قبل التنبيه
    autoCloseGraceHours: 2, // ساعات السماح بعد التنبيه قبل التنفيذ
    autoCloseAction: 'lock', // 'lock' = قفل فقط | 'delete' = حذف نهائي
    // الحذف والأرشفة
    deleteCountdownSeconds: 10, // العد التنازلي قبل الحذف (ثوانٍ)
    archiveOnDelete: 1, // إرسال أرشيف HTML للوق عند الحذف
    // الترقيم
    ticketNumberStart: 1, // بداية رقم التذاكر
    // وضع الصيانة
    maintenanceEnabled: 0,
    maintenanceMessage: '', // رسالة تظهر للعضو أثناء الصيانة
    // مهلة رد الستاف (SLA)
    claimSlaMinutes: 0, // دقائق بلا رد → إلغاء استلام تلقائي (0 = معطّل)
    // ساعات العمل
    workHoursEnabled: 0, // تقييد الفتح بأوقات محددة
    workHoursStart: 9, // ساعة البداية (0-23)
    workHoursEnd: 18, // ساعة النهاية (0-23)
    // قائمة الحظر
    blockedUsers: [], // [{ id, reason, at }]
    // حد عمر التذكرة
    maxTicketAgeHours: 0, // تذكرة مفتوحة أكثر من هذا → إجراء الخمول (0 = معطّل)
    // تنظيف المقفلات
    autoPurgeLockedDays: 0, // مقفلة أكثر من هذا → حذف تلقائي (0 = معطّل)
    // نظام التقييم والملاحظات (رومات محددة من الإعدادات العامة)
    ratingChannelId: '', // روم استقبال التقييمات
    notesChannelId: '', // روم استقبال الملاحظات
};

// ---------- MongoDB Schema ----------
const ticketSettingsSchema = new mongoose.Schema(
    {
        _id: String, // 'global'
        maxOpenPerUser: { type: Number, default: 0 },
        maxOpenPerPanelPerUser: { type: Number, default: 0 },
        openCooldownMinutes: { type: Number, default: 0 },
        maxClaimsPerStaff: { type: Number, default: 0 },
        autoCloseEnabled: { type: Number, default: 0 },
        autoCloseIdleHours: { type: Number, default: 24 },
        autoCloseGraceHours: { type: Number, default: 2 },
        autoCloseAction: { type: String, default: 'lock' },
        deleteCountdownSeconds: { type: Number, default: 10 },
        archiveOnDelete: { type: Number, default: 1 },
        ticketNumberStart: { type: Number, default: 1 },
        maintenanceEnabled: { type: Number, default: 0 },
        maintenanceMessage: { type: String, default: '' },
        claimSlaMinutes: { type: Number, default: 0 },
        workHoursEnabled: { type: Number, default: 0 },
        workHoursStart: { type: Number, default: 9 },
        workHoursEnd: { type: Number, default: 18 },
        blockedUsers: { type: mongoose.Schema.Types.Mixed, default: [] },
        maxTicketAgeHours: { type: Number, default: 0 },
        autoPurgeLockedDays: { type: Number, default: 0 },
        ratingChannelId: { type: String, default: '' },
        notesChannelId: { type: String, default: '' },
    },
    { collection: 'ticketsettings', versionKey: false }
);

let SettingsModel;

function isMongoReady() {
    if (mongoose.connection.readyState !== 1) return false;
    if (SettingsModel) return true;
    try {
        SettingsModel =
            mongoose.models.TicketSetting ||
            mongoose.model('TicketSetting', ticketSettingsSchema);
        return true;
    } catch {
        return false;
    }
}

// ---------- JSON (المصدر المتزامن) ----------
function ensureFile() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ settings: { ...DEFAULT_SETTINGS } }, null, 2), 'utf-8');
    }
}

function readDB() {
    try {
        ensureFile();
        const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        return { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
    } catch (err) {
        console.error('[ticketSettings] فشل قراءة الإعدادات:', err.message);
        reportError('TICKET_SETTINGS_READ', 'ticket-settings', err);
        return { ...DEFAULT_SETTINGS };
    }
}

function writeDB(settings) {
    try {
        ensureFile();
        fs.writeFileSync(DB_PATH, JSON.stringify({ settings }, null, 2), 'utf-8');
    } catch (err) {
        console.error('[ticketSettings] فشل حفظ الإعدادات:', err.message);
        reportError('TICKET_SETTINGS_WRITE', 'ticket-settings', err);
    }
}

// ---------- عمليات الإعدادات ----------

/** جلب الإعدادات العامة الحالية (مدمجة مع الافتراضي) */
function getTicketSettings() {
    return readDB();
}

// المفاتيح الرقمية (0..9999) — تُطبَّع عبر Math.max/min
const NUMERIC_KEYS = [
    'maxOpenPerUser',
    'maxOpenPerPanelPerUser',
    'openCooldownMinutes',
    'maxClaimsPerStaff',
    'autoCloseIdleHours',
    'autoCloseGraceHours',
    'deleteCountdownSeconds',
    'ticketNumberStart',
    'claimSlaMinutes',
    'workHoursStart',
    'workHoursEnd',
    'maxTicketAgeHours',
    'autoPurgeLockedDays',
];
// المفاتيح المنطقية (0/1)
const BOOLEAN_KEYS = ['autoCloseEnabled', 'archiveOnDelete', 'maintenanceEnabled'];

/**
 * تحديث الإعدادات العامة (تطبيع تلقائي لكل نوع)
 * @param {Object} partial - مفاتيح من DEFAULT_SETTINGS فقط
 * @returns {Object} الإعدادات بعد التحديث
 */
function updateTicketSettings(partial = {}) {
    const current = readDB();
    const next = { ...current };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (partial[key] === undefined) continue;

        if (NUMERIC_KEYS.includes(key)) {
            const n = Math.floor(Number(partial[key]));
            next[key] = Number.isFinite(n) ? Math.max(0, Math.min(9999, n)) : 0;
        } else if (BOOLEAN_KEYS.includes(key)) {
            next[key] = partial[key] ? 1 : 0;
        } else if (key === 'autoCloseAction') {
            next[key] = ['lock', 'delete'].includes(partial[key]) ? partial[key] : 'lock';
        } else if (key === 'maintenanceMessage') {
            next[key] = String(partial[key] || '').slice(0, 500);
        } else if (key === 'blockedUsers') {
            // قائمة الحظر: [{ id, reason, at }] — نتجاهل المداخل غير الصالحة
            const arr = Array.isArray(partial[key]) ? partial[key] : [];
            next[key] = arr
                .filter(b => b && typeof b.id === 'string' && b.id.trim())
                .map(b => ({
                    id: b.id.trim(),
                    reason: String(b.reason || 'بدون سبب').slice(0, 200),
                    at: typeof b.at === 'number' ? b.at : Date.now(),
                }))
                .slice(0, 100);
        } else if (key === 'ratingChannelId' || key === 'notesChannelId') {
            // رومات نظام التقييم/الملاحظات (آيدي روم أو فارغ = معطّل)
            next[key] = String(partial[key] || '').trim().slice(0, 30);
        }
    }
    writeDB(next);
    writeSettingsToMongo(next); // مرآة (غير متزامنة — لا ننتظرها)
    return next;
}

// ---------- MongoDB helpers ----------
async function writeSettingsToMongo(settings) {
    if (!isMongoReady()) return;
    try {
        await SettingsModel.findByIdAndUpdate(
            'global',
            { $set: { ...settings, _id: 'global' } },
            { upsert: true }
        );
    } catch (e) {
        console.error('❌ ticketSettings MongoDB write:', e.message);
    }
}

/** استعادة الإعدادات من MongoDB إلى JSON (حماية من مسح القرص) */
async function loadSettingsFromMongo() {
    if (!isMongoReady()) return;
    try {
        const doc = await SettingsModel.findById('global').lean();
        if (doc) {
            const { _id, ...rest } = doc;
            writeDB({ ...DEFAULT_SETTINGS, ...rest });
            console.log('🔄 ticketSettings: تمت استعادة الإعدادات العامة من MongoDB');
        }
    } catch (e) {
        console.error('❌ ticketSettings MongoDB load:', e.message);
    }
}

/** تهيئة (تُستدعى عند التشغيل) — يستعيد من Mongo فقط إذا كان الملف افتراضياً */
function initTicketSettings() {
    if (isMongoReady()) {
        console.log('📦 ticketSettings → ✅ MongoDB');
        const current = readDB();
        const isFresh = Object.keys(DEFAULT_SETTINGS).every(
            k => current[k] === DEFAULT_SETTINGS[k]
        );
        if (isFresh) loadSettingsFromMongo();
        return true;
    }
    console.log('📦 ticketSettings → ⚠️ JSON فقط');
    return false;
}

module.exports = { getTicketSettings, updateTicketSettings, initTicketSettings };

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
};

// ---------- MongoDB Schema ----------
const ticketSettingsSchema = new mongoose.Schema(
    {
        _id: String, // 'global'
        maxOpenPerUser: { type: Number, default: 0 },
        maxOpenPerPanelPerUser: { type: Number, default: 0 },
        openCooldownMinutes: { type: Number, default: 0 },
        maxClaimsPerStaff: { type: Number, default: 0 },
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

/**
 * تحديث الإعدادات العامة (تطبيع: 0..9999، أي قيمة خاطئة = 0)
 * @param {Object} partial - مفاتيح من DEFAULT_SETTINGS فقط
 * @returns {Object} الإعدادات بعد التحديث
 */
function updateTicketSettings(partial = {}) {
    const current = readDB();
    const next = { ...current };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (partial[key] !== undefined) {
            const n = Math.floor(Number(partial[key]));
            next[key] = Number.isFinite(n) ? Math.max(0, Math.min(9999, n)) : 0;
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

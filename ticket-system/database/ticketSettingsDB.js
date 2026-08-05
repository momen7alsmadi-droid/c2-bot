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
const { getConfig } = require('../../src/utils/storage');

const { SECOND_MS, MINUTE_MS, HOUR_MS, DAY_MS } = require('../utils/durationParser');

/**
 * الإعدادات الزمنية (المدة) ووحدتها الأصلية للتخزين:
 * يُدخل المستخدم مدة مرنة مثل "1h 30m 5s" (s m h d) وتُخزَّن
 * محوّلة إلى وحدة الإعداد الأصلية (أرقام عشرية مسموحة).
 */
const DURATION_SETTINGS = {
    openCooldownMinutes: MINUTE_MS,
    claimSlaMinutes: MINUTE_MS,
    autoCloseIdleHours: HOUR_MS,
    autoCloseGraceHours: HOUR_MS,
    maxTicketAgeHours: HOUR_MS,
    deleteCountdownSeconds: SECOND_MS,
    autoPurgeLockedDays: DAY_MS,
};

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
    // 🏆 نظام إداري الأسبوع (تهنئة أسبوعية لأعلى إداري نقاط)
    staffWeekEnabled: 0, // 1 = مفعّل
    staffWeekChannelId: '', // روم إرسال التهنئة
    staffWeekDay: 5, // يوم الإرسال (0=الأحد .. 5=الجمعة .. 6=السبت)
    staffWeekTime: '18:00', // وقت الإرسال (توقيت الأردن HH:MM)
    staffWeekMessage: '', // رسالة التهنئة (يدعم المتغيرات — فارغ = الافتراضي)
    staffWeekLastRun: '', // آخر تاريخ نُفذ فيه الإرسال (YYYY-MM-DD بتوقيت الأردن)
};

/** الرسالة الافتراضية لتهنئة إداري الأسبوع (تدعم المتغيرات) */
const DEFAULT_STAFF_WEEK_MESSAGE =
    '🎉 مبروك [user]! 🏆\nأصبحت **إداري الأسبوع** هذا الأسبوع في سيرفر [server]!\n🌟 حصلت على **{points} نقطة** هذا الأسبوع.\n📆 الأسبوع: {week_start} ← {week_end}\n\nواصل تألقك وإبداعك يا بطل! ⚡';

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
        staffWeekEnabled: { type: Number, default: 0 },
        staffWeekChannelId: { type: String, default: '' },
        staffWeekDay: { type: Number, default: 5 },
        staffWeekTime: { type: String, default: '18:00' },
        staffWeekMessage: { type: String, default: '' },
        staffWeekLastRun: { type: String, default: '' },
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
    'staffWeekDay',
];
// المفاتيح المنطقية (0/1)
const BOOLEAN_KEYS = ['autoCloseEnabled', 'archiveOnDelete', 'maintenanceEnabled', 'staffWeekEnabled'];

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
            // قائمة الحظر: [{ id, type: 'user'|'role', reason, at }] — نتجاهل المداخل غير الصالحة
            const arr = Array.isArray(partial[key]) ? partial[key] : [];
            next[key] = arr
                .filter(b => b && typeof b.id === 'string' && b.id.trim())
                .map(b => ({
                    id: b.id.trim(),
                    type: b.type === 'role' ? 'role' : 'user',
                    reason: String(b.reason || 'بدون سبب').slice(0, 200),
                    at: typeof b.at === 'number' ? b.at : Date.now(),
                }))
                .slice(0, 100);
        } else if (key === 'ratingChannelId' || key === 'notesChannelId' || key === 'staffWeekChannelId') {
            // رومات (آيدي روم أو فارغ = معطّل)
            next[key] = String(partial[key] || '').trim().slice(0, 30);
        } else if (key === 'staffWeekTime') {
            // وقت الإرسال بتنسيق HH:MM (أو H:MM) — يُطبَّع إلى HH:MM
            const m = String(partial[key] || '').trim().match(/^(\d{1,2}):(\d{2})$/);
            next[key] = m ? `${String(Number(m[1])).padStart(2, '0')}:${m[2]}` : '18:00';
        } else if (key === 'staffWeekMessage') {
            // رسالة التهنئة المخصصة (فارغ = الافتراضي)
            next[key] = String(partial[key] || '').slice(0, 1500);
        } else if (key === 'staffWeekLastRun') {
            next[key] = String(partial[key] || '').slice(0, 30);
        }
    }
    writeDB(next);
    writeSettingsToMongo(next); // مرآة MongoDB (غير متزامنة — لا ننتظرها)
    backupSettingsToChannel(next); // نسخة ديسكورد (حماية حتى بدون MongoDB)
    return next;
}

// ---------- نسخة ديسكورد الاحتياطية (حماية من مسح القرص حتى بدون MongoDB) ----------
// كل تغيير في الإعدادات يُحفظ أيضاً في رسالة داخل روم الإشعارات
// (بنفس فكرة علامة إصدارات التحديث) — الرسالة محفوظة في ديسكورد
// نفسه فتبقى سليمة بعد كل إعادة نشر على Railway.
const BACKUP_PREFIX = '⚙️ نسخة احتياطية للإعدادات: ';

let clientRef = null;

/** ربط الـ client (يُستدعى من src/index.js عند الجاهزية) */
function setTicketSettingsClient(client) {
    clientRef = client;
}

/** روم النسخة الاحتياطية: روم الإشعارات أولاً ثم روم الأخطاء */
function getBackupChannelId() {
    try {
        const cfg = getConfig();
        return cfg.updateChannelId || cfg.errorLogChannelId || null;
    } catch {
        return null;
    }
}

/** البحث عن رسالة النسخة الاحتياطية في الروم (آخر 20 رسالة) */
async function findBackupMessage(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
        if (!messages) return null;
        for (const msg of messages.values()) {
            const isOwn = !msg.client ? true : msg.author?.id === msg.client?.user?.id;
            if (isOwn && String(msg.content || '').startsWith(BACKUP_PREFIX)) return msg;
        }
    } catch {
        /* تجاهل */
    }
    return null;
}

/** حفظ الإعدادات في رسالة ديسكورد (إنشاء أو تحديث — بلا تكرار) */
async function backupSettingsToChannel(settings) {
    const client = clientRef;
    const channelId = getBackupChannelId();
    if (!client || !channelId) return;
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;
        const content = BACKUP_PREFIX + JSON.stringify(settings).slice(0, 1800);
        const existing = await findBackupMessage(channel);
        if (existing) {
            await existing.edit({ content }).catch(() => {});
        } else {
            await channel.send({ content }).catch(() => {});
        }
    } catch (e) {
        console.error('❌ ticketSettings backup:', e.message);
    }
}

/** استعادة الإعدادات من رسالة ديسكورد الاحتياطية (إن فُقد الملف المحلي) */
async function restoreSettingsFromChannel() {
    const client = clientRef;
    const channelId = getBackupChannelId();
    if (!client || !channelId) return;
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;
        const backup = await findBackupMessage(channel);
        if (!backup) return;
        const json = String(backup.content || '').slice(BACKUP_PREFIX.length);
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === 'object' && parsed.ratingChannelId !== undefined) {
            writeDB({ ...DEFAULT_SETTINGS, ...parsed });
            console.log('⚙️ ticketSettings: تمت استعادة الإعدادات من نسخة ديسكورد الاحتياطية');
        }
    } catch (e) {
        console.error('❌ ticketSettings channel restore:', e.message);
    }
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

/** تهيئة (تُستدعى عند التشغيل) — يستعيد من Mongo أولاً ثم من نسخة ديسكورد */
async function initTicketSettings() {
    let mongoReady = false;
    if (isMongoReady()) {
        mongoReady = true;
        console.log('📦 ticketSettings → ✅ MongoDB');
        await loadSettingsFromMongo();
    } else {
        console.log('📦 ticketSettings → ⚠️ JSON فقط');
    }

    // إن ما زال الملف افتراضياً (لا Mongo أو لا يوجد مستند فيها)
    // نستعيد من نسخة ديسكورد الاحتياطية (تنجو من مسح القرص)
    const current = readDB();
    const isFresh = Object.keys(DEFAULT_SETTINGS).every(k => current[k] === DEFAULT_SETTINGS[k]);
    if (isFresh) await restoreSettingsFromChannel();
    return mongoReady;
}

module.exports = {
    getTicketSettings,
    updateTicketSettings,
    initTicketSettings,
    DURATION_SETTINGS,
    setTicketSettingsClient,
    backupSettingsToChannel,
    restoreSettingsFromChannel,
    DEFAULT_STAFF_WEEK_MESSAGE,
};

/**
 * =========================================================
 *  src/utils/errorLogger.js
 * =========================================================
 * نظام الأخطاء المركزي للبوت (شامل لكل الأخطاء):
 *   1) يكتب الخطأ في ملف السجل المحلي (data/error-log.json)
 *   2) يرسل إيمبد خطأ إلى "روم الأخطاء" المحدد في الإعدادات
 *      (errorLogChannelId) بنفس الشكل الموحد القديم:
 *        🚨 [E-XXX] خطأ: <النوع>  |  🆔 <المعرف> | 🕐 <الوقت>
 *        📝 رسالة الخطأ
 *        📍 مكان الخطأ (Stack)  ← سطر واحد فقط (بدون أسطر متعددة)
 *        🧾 رمز الخطأ + معناه بالعربية (في التذييل)
 *
 * الأكواد: كل نوع خطأ له رمز ثابت (E-101 = أزرار التذاكر، ...) ليسهل
 * التعرف على الخطأ ومكانه، وأي نوع جديد بدون رمز يحصل رمزاً تلقائياً
 * من اسمه (E-9XX) فلا يبقى أي خطأ بلا رمز.
 *
 * يُستدعى من:
 *   - src/index.js (أخطاء عامة + أعلى معالج التفاعلات + أخطاء الرسائل)
 *   - معالجات نظام التذاكر عبر reportError() في كل catch
 *   - كل معالجات البوت الأخرى (بعد الترقية الشاملة)
 *
 * أي خطأ (مهما كان داخلياً) يصل تلقائياً إلى روم الأخطاء.
 * =========================================================
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const ERROR_LOG_PATH = path.join(__dirname, '..', '..', 'data', 'error-log.json');
const MAX_LOG = 50;

// آيدي مطوّر البوت (يُمنشن في رسالة الخطأ)
const DEV_ID = '1387331972094890036';

// =========================================================
// 📚 قاموس أكواد الأخطاء — كل نوع له رمز ثابت + وصف عربي مختصر
// =========================================================
const ERROR_CODES = {
    // ---------- عام (E-0xx) ----------
    UNHANDLED_REJECTION: { code: 'E-001', desc: 'خطأ وعد (Promise) غير معالج' },
    UNCAUGHT_EXCEPTION: { code: 'E-002', desc: 'استثناء غير معالج في البوت' },
    CLIENT_ERROR: { code: 'E-003', desc: 'خطأ اتصال ديسكورد (WebSocket)' },
    SHARD_ERROR: { code: 'E-004', desc: 'خطأ شارد (Shard)' },
    RATE_LIMIT: { code: 'E-005', desc: 'تجاوز حد طلبات ديسكورد (Rate Limit)' },
    MESSAGE_CREATE: { code: 'E-006', desc: 'خطأ أثناء معالجة رسالة' },
    INIT: { code: 'E-007', desc: 'خطأ أثناء بدء تشغيل البوت' },
    DEPLOY: { code: 'E-008', desc: 'خطأ في تسجيل الأوامر (Slash Commands)' },
    UPDATE_NOTIFY_NO_CHANNEL: { code: 'E-009', desc: 'روم إشعارات التحديث غير متاح' },
    PING: { code: 'E-020', desc: 'رسالة البقاء شغالاً (Keepalive)' },
    STATUS: { code: 'E-021', desc: 'تقرير الحالة الدوري' },
    AUTOCOMPLETE: { code: 'E-022', desc: 'الاقتراحات التلقائية (Autocomplete)' },
    REACTION: { code: 'E-023', desc: 'معالجة التفاعلات العامة' },
    GUILD_CREATE: { code: 'E-024', desc: 'دخول/مغادرة سيرفر جديد' },
    UPDATE_NOTIFY: { code: 'E-025', desc: 'إرسال إشعار التحديث' },
    LOG_SEND: { code: 'E-026', desc: 'إرسال سجل (Log)' },

    // ---------- نظام التذاكر (E-1xx) ----------
    TICKET_BUTTON: { code: 'E-101', desc: 'أزرار لوحة تحكم التذاكر' },
    TICKET_MODAL: { code: 'E-102', desc: 'نوافذ إدخال التذاكر (Modals)' },
    TICKET_SELECT: { code: 'E-103', desc: 'قوائم التذاكر المنسدلة' },
    TICKET_ROLE_SELECT: { code: 'E-104', desc: 'قوائم اختيار الرتب' },
    TICKET_CHANNEL_SELECT: { code: 'E-105', desc: 'قوائم اختيار الرومات' },
    TICKET_USER_SELECT: { code: 'E-106', desc: 'قوائم اختيار الأعضاء' },
    TICKET_CREATE: { code: 'E-107', desc: 'فتح تذكرة جديدة' },
    TICKET_CONTROL: { code: 'E-108', desc: 'استلام/إلغاء استلام + قفل/فتح التذكرة' },
    TICKET_CLOSE: { code: 'E-109', desc: 'إغلاق/حذف التذكرة' },
    TICKET_STAFF_MENU: { code: 'E-110', desc: 'قائمة تحكم الستاف' },
    TICKET_MAINTENANCE: { code: 'E-111', desc: 'الصيانة التلقائية للتذاكر' },
    TICKET_RATING_DM: { code: 'E-112', desc: 'إرسال رسالة التقييم الخاصة' },
    TICKET_RATING_BTN: { code: 'E-113', desc: 'زر التقييم بالنجوم' },
    TICKET_RATING_SEND: { code: 'E-114', desc: 'إرسال التقييم لروم الاستقبال' },
    TICKET_RATING_CHANNEL: { code: 'E-115', desc: 'اختيار روم التقييم/الملاحظات' },
    TICKET_NOTE_MODAL: { code: 'E-116', desc: 'فتح نافذة الملاحظة' },
    TICKET_NOTE_SUBMIT: { code: 'E-117', desc: 'إرسال الملاحظة' },
    TICKET_NOTE_SEND: { code: 'E-118', desc: 'إرسال الملاحظة لروم الاستقبال' },
    TICKET_LOG_SEND: { code: 'E-119', desc: 'إرسال أرشيف التذكرة (Transcript)' },
    TICKET_CHANNEL_DELETE: { code: 'E-120', desc: 'حذف قناة التذكرة' },
    TICKET_ACTION_MESSAGE: { code: 'E-121', desc: 'رسائل الإجراءات (استلام/قفل/...) ' },
    TICKET_PUBLISH: { code: 'E-122', desc: 'نشر البنل في روم' },
    TICKET_BUNDLE_PREVIEW: { code: 'E-123', desc: 'معاينة باقة البنلات' },
    TICKET_STORE_SAVE: { code: 'E-124', desc: 'حفظ جلسات التذاكر' },
    TICKET_STORE_LOAD: { code: 'E-125', desc: 'تحميل جلسات التذاكر' },
    TICKET_SETTINGS_READ: { code: 'E-126', desc: 'قراءة إعدادات التذاكر' },
    TICKET_SETTINGS_WRITE: { code: 'E-127', desc: 'حفظ إعدادات التذاكر' },
    TICKET_STATS_SAVE: { code: 'E-128', desc: 'حفظ إحصائيات التذاكر' },
    TICKET_STATS_LOAD: { code: 'E-129', desc: 'تحميل إحصائيات التذاكر' },
    TICKET_COOLDOWN_SAVE: { code: 'E-130', desc: 'حفظ سجل الكولداون' },
    TICKET_COOLDOWN_LOAD: { code: 'E-131', desc: 'تحميل سجل الكولداون' },
    TICKET_COUNTER_SAVE: { code: 'E-132', desc: 'حفظ عداد التذاكر' },
    TICKET_COUNTER_LOAD: { code: 'E-133', desc: 'تحميل عداد التذاكر' },
    TICKET_STATS: { code: 'E-134', desc: 'إحصائيات الستاف (جلب الأعضاء/الرتب)' },
    TICKET_CONTEXT: { code: 'E-135', desc: 'سياق التذكرة (جلب بيانات الجلسة)' },
    PANEL_IMAGE: { code: 'E-136', desc: 'رفع صورة إلى مكتبة البنلات' },

    // ---------- إداري الأسبوع (E-2xx) ----------
    STAFF_WEEK_RUN: { code: 'E-201', desc: 'تشغيل نظام إداري الأسبوع' },
    STAFF_WEEK_SEND: { code: 'E-202', desc: 'إرسال تهنئة إداري الأسبوع' },

    // ---------- معالجات البوت الأخرى (E-3xx) ----------
    HANDLER_LEAVE: { code: 'E-301', desc: 'نظام الاجازات' },
    HANDLER_DALEEL: { code: 'E-302', desc: 'نظام الدلائل' },
    HANDLER_REPORT: { code: 'E-303', desc: 'نظام البلاغات' },
    HANDLER_RESIGN: { code: 'E-304', desc: 'نظام الاستقالات' },
    HANDLER_SETTINGS: { code: 'E-305', desc: 'لوحة الإعدادات العامة' },
    HANDLER_BROADCAST: { code: 'E-306', desc: 'أمر البث (Broadcast)' },
    HANDLER_EMBEDS: { code: 'E-307', desc: 'نظام الإيمبدات' },
    HANDLER_AUTOREPLY: { code: 'E-308', desc: 'نظام الردود التلقائية' },
    HANDLER_REACT: { code: 'E-309', desc: 'نظام التفاعلات (الرموز)' },
    HANDLER_FEATURED: { code: 'E-310', desc: 'نظام المميز (Featured)' },
    HANDLER_STARBOARD: { code: 'E-311', desc: 'نظام لوحة النجوم' },
    HANDLER_ADMIN_PANEL: { code: 'E-312', desc: 'لوحة الإدارة (الرتب)' },
    HANDLER_ADMIN_BOARD: { code: 'E-313', desc: 'لوحة الترقي (Admin Board)' },
    HANDLER_MASTER_PANEL: { code: 'E-314', desc: 'لوحة المطور' },
    HANDLER_BOT_PROFILE: { code: 'E-315', desc: 'تغيير اسم/صورة البوت' },
    HANDLER_HELP: { code: 'E-316', desc: 'أمر المساعدة' },
    HANDLER_COLORS: { code: 'E-317', desc: 'أمر الألوان المتوفرة' },
    STORAGE: { code: 'E-318', desc: 'خطأ في التخزين (JSON/MongoDB)' },
};

/**
 * إرجاع { code, desc } لأي نوع خطأ:
 *   - من القاموس إن وُجد
 *   - وإلا رمز تلقائي ثابت من اسم النوع (E-9XX) حتى لا يبقى أي خطأ بلا رمز
 * @param {String} type
 * @returns {{ code: String, desc: String }}
 */
function getErrorCode(type) {
    const known = ERROR_CODES[type];
    if (known) return known;

    // رمز تلقائي حتمي من اسم النوع (لا يتغير بين التشغيلات)
    let hash = 0;
    const s = String(type || '');
    for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) % 997;
    const num = (hash % 100).toString().padStart(2, '0');
    return { code: `E-9${num}`, desc: 'رمز غير معروف — أضِفه للقاموس' };
}

let clientRef = null;

/**
 * ربط الـ client بعد إنشائه (يُستدعى مرة واحدة من src/index.js)
 * @param {import('discord.js').Client} client
 */
function setErrorClient(client) {
    clientRef = client;
}

/**
 * قراءة آيدي روم الأخطاء من الإعدادات بأمان (لا يرمي أبداً)
 * تُستدعى lazy حتى لا يحدث تعارض في requires الدائرية مع utils/storage
 */
function readErrorChannelId() {
    try {
        // require داخل الدالة لتجنب الدوران (storage يـ require من errorLogger)
        const { getConfig } = require('./storage');
        const cfg = getConfig();
        return cfg && cfg.errorLogChannelId ? cfg.errorLogChannelId : null;
    } catch {
        return null;
    }
}

/**
 * تحويل المكدس (Stack) إلى سطر واحد فقط:
 * كل سطر يُنظّف ويُلصق مع ما قبله بفاصل | — بحيث يبقى كل شيء
 * في سطر واحد عند الضغط على Enter (يسهل نسخه وقراءته).
 * @param {String} stack
 * @returns {String}
 */
function stackToOneLine(stack) {
    return String(stack || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join(' | ')
        .slice(0, 950); // حد حقل الإيمبد 1024 حرفاً
}

/**
 * إرسال إيمبد الخطأ إلى روم الأخطاء المحدد (بنفس الشكل الموحد القديم)
 * @param {import('discord.js').Client} client
 * @param {String} type - نوع الخطأ (مثلاً UNCAUGHT_EXCEPTION / TICKET_BUTTON)
 * @param {String} id - معرف مصدر الخطأ (customId / commandName / 'global')
 * @param {Error} err
 */
async function sendErrorToChannel(client, type, id, err) {
    // تجاهل أخطاء التوقيت العابرة (DiscordAPIError 10062, 40060)
    if (err && (err.code === 10062 || err.code === 40060)) return;

    const errorChannelId = readErrorChannelId();
    if (!errorChannelId) return;

    try {
        const channel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (!channel) return;

        const errMsg = (err.message || 'خطأ غير معروف').slice(0, 1000);
        // المكدس كاملاً في سطر واحد (الموقع الدقيق للخطأ)
        const stackPreview = stackToOneLine(err.stack || errMsg);

        // رمز الخطأ + معناه
        const { code, desc } = getErrorCode(type);

        const embed = new EmbedBuilder()
            .setTitle(`🚨 [${code}] خطأ: ${type}`)
            .setColor(0xe74c3c)
            .setDescription(`🆔 **${id || '?'}** | 🕐 <t:${Math.floor(Date.now() / 1000)}:F>`)
            .addFields(
                { name: '📝 رسالة الخطأ', value: errMsg || 'بدون رسالة', inline: false },
                { name: '📍 مكان الخطأ (Stack)', value: stackPreview || 'بدون مكدس', inline: false }
            )
            .setFooter({ text: `🧾 ${code} — ${desc}` })
            .setTimestamp();

        await channel.send({ content: `<@${DEV_ID}>`, embeds: [embed] });
    } catch (e) {
        console.error('❌ فشل إرسال الخطأ إلى الروم:', e.message);
    }
}

/**
 * تسجيل خطأ: ملف محلي + إرسال لروم الأخطاء (يستخدم الـ client المرتبط)
 */
function logError(type, id, err) {
    // تجاهل أخطاء التوقيت العابرة
    if (err && (err.code === 10062 || err.code === 40060)) return;
    try {
        const { code } = getErrorCode(type);
        const entry = {
            ts: Date.now(),
            type,
            code,
            id,
            msg: err.message || 'خطأ غير معروف',
            stack: (err.stack || '').split('\n').slice(0, 5).join('\n'),
        };
        let log = [];
        try {
            if (fs.existsSync(ERROR_LOG_PATH)) {
                log = JSON.parse(fs.readFileSync(ERROR_LOG_PATH, 'utf8'));
                if (!Array.isArray(log)) log = [];
            }
        } catch {
            log = [];
        }
        log.unshift(entry);
        if (log.length > MAX_LOG) log = log.slice(0, MAX_LOG);
        fs.writeFileSync(ERROR_LOG_PATH, JSON.stringify(log, null, 2), 'utf8');

        const client = clientRef;
        if (client && client.isReady()) {
            sendErrorToChannel(client, type, id, err);
        }
    } catch {
        /* تجاهل أي فشل في التسجيل نفسه */
    }
}

/**
 * غلاف آمن لا يرمي أبداً — للاستدعاء من معالجات التذاكر والداخلية
 * @param {String} type - نوع الخطأ (مثلاً TICKET_BUTTON / TICKET_CREATE)
 * @param {String} id - معرف مصدر الخطأ
 * @param {Error|any} err
 */
function reportError(type, id, err) {
    try {
        const normalized = err instanceof Error ? err : new Error(String(err || 'خطأ غير معروف'));
        logError(type, id, normalized);
    } catch {
        /* تجاهل */
    }
}

module.exports = { setErrorClient, logError, reportError, sendErrorToChannel, getErrorCode, ERROR_CODES };

/**
 * =========================================================
 *  panelsDB.js
 * =========================================================
 * طبقة قاعدة البيانات الخاصة بـ "إعدادات لوحات التذاكر" (Panels).
 *
 * ⚠️ تنبيه مهم:
 * هذا الملف يخزّن فقط "القوالب/الإعدادات" التي تنشئها الإدارة
 * (اسم اللوحة - الوصف - الإيموجي - الرتب المسموحة... إلخ).
 * لا علاقة له إطلاقاً بالتذاكر التي يفتحها الأعضاء أو محتواها
 * (Transcripts) — هذا سيُبنى لاحقاً في الجزء الثالث.
 *
 * تم اختيار JSON بدلاً من MongoDB في هذه المرحلة لأن:
 *  1. البيانات المطلوبة الآن بسيطة (إعدادات/قوالب فقط).
 *  2. لا حاجة لخادم خارجي أو اتصال شبكي إضافي.
 *  3. سهولة القراءة والتعديل والنسخ الاحتياطي.
 * يمكن لاحقاً استبدال هذه الطبقة بـ Mongoose بسهولة لأن
 * كل الدوال هنا معزولة (Abstraction Layer) ولا يتم التعامل
 * مع الملف مباشرة من أي مكان آخر في المشروع.
 * =========================================================
 */

const fs = require('fs');
const path = require('path');

// مسار ملف قاعدة البيانات
const DB_PATH = path.join(__dirname, '..', 'data', 'panels.json');

/**
 * هيكل الـ Schema الخاص بكل لوحة تذاكر (Panel) - محدّث في الجزء الثاني:
 * {
 *   // --- عام (الجزء الأول) ---
 *   name: String                    -> اسم اللوحة (فريد/Unique) - يُستخدم كمعرف
 *   description: String             -> وصف اللوحة يظهر داخل الإيمبد عند فتح تكت
 *   emoji: String                    -> إيموجي مرتبط بالزر/القائمة
 *   createdBy: String                -> آيدي الإداري الذي أنشأ اللوحة
 *   createdAt: Number                -> Timestamp لوقت الإنشاء
 *   updatedAt: Number                -> Timestamp لآخر تعديل
 *
 *   // --- إعدادات عامة (General) ---
 *   enabled: Boolean                 -> هل البنل مفعّل أم لا
 *   ticketSystemType: String         -> 'buttons' | 'select' (طريقة فتح التكت من قبل الأعضاء)
 *   linkedPanel: String | null       -> اسم بنل آخر مرتبط بهذا البنل (نظام ربط كـ ProBot)
 *
 *   // --- الرتب (Roles) ---
 *   staffRoles: Array<String>        -> رتب تستطيع رؤية/استلام التكت
 *   pingRoles: Array<String>         -> رتب تُمنشن فور فتح التكت (حتى 10)
 *   allowedRoles: Array<String>      -> رتب مسموح لها بفتح التكت (فارغة = الجميع مسموح)
 *   deniedRoles: Array<String>       -> رتب ممنوعة من فتح التكت
 *
 *   // --- الرومات (Channels) ---
 *   categoryId: String | null        -> آيدي الكاتيجوري التي تُفتح بها التذاكر
 *   logChannelId: String | null      -> آيدي روم اللوق/الترانسكربت
 *
 *   // --- الرسائل (Messages) ---
 *   welcomeMessage: String | null    -> رسالة الترحيب داخل التكت، تدعم:
 *                                        [user] [server] [ticket_name] [time]
 * }
 */

// القيم الافتراضية لأي بنل جديد - تُستخدم في createPanel لضمان
// أن كل الحقول موجودة دائماً حتى لو لم تُملأ بعد من الإداري
const DEFAULT_PANEL_FIELDS = {
    enabled: true,
    ticketSystemType: 'buttons',
    linkedPanel: null,
    staffRoles: [],
    pingRoles: [],
    allowedRoles: [],
    deniedRoles: [],
    categoryId: null,
    logChannelId: null,
    welcomeMessage: null,
};

// التأكد من وجود الملف عند تشغيل البوت لأول مرة
function ensureDBFile() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ panels: [] }, null, 2), 'utf-8');
    }
}

// قراءة قاعدة البيانات بالكامل
function readDB() {
    ensureDBFile();
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    try {
        return JSON.parse(raw);
    } catch (err) {
        // في حال تلف الملف لأي سبب، نعيد هيكل فارغ آمن بدل تحطيم البوت
        console.error('[panelsDB] خطأ في قراءة ملف قاعدة البيانات، سيتم استخدام هيكل فارغ:', err);
        return { panels: [] };
    }
}

// كتابة قاعدة البيانات بالكامل (Overwrite)
function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * دمج الحقول الافتراضية مع أي بنل - لضمان توافق البنلات القديمة
 * (المُنشأة في الجزء الأول قبل إضافة حقول الجزء الثاني) دون كراش
 * @param {Object} panel
 * @returns {Object}
 */
function withDefaults(panel) {
    return { ...DEFAULT_PANEL_FIELDS, ...panel };
}

/**
 * جلب كل اللوحات المحفوظة
 * @returns {Array<Object>}
 */
function getAllPanels() {
    return readDB().panels.map(withDefaults);
}

/**
 * جلب لوحة واحدة عبر اسمها
 * @param {String} name
 * @returns {Object|null}
 */
function getPanelByName(name) {
    const db = readDB();
    const panel = db.panels.find(p => p.name === name);
    return panel ? withDefaults(panel) : null;
}

/**
 * إنشاء لوحة جديدة
 * @param {Object} panelData
 * @returns {Object} اللوحة بعد الإنشاء
 */
function createPanel(panelData) {
    const db = readDB();

    // منع تكرار الاسم لأنه يُستخدم كمعرف فريد
    const exists = db.panels.some(p => p.name === panelData.name);
    if (exists) {
        throw new Error(`يوجد بالفعل لوحة تذاكر بنفس الاسم: ${panelData.name}`);
    }

    const newPanel = {
        ...DEFAULT_PANEL_FIELDS,
        name: panelData.name,
        description: panelData.description || '',
        emoji: panelData.emoji || '🎫',
        createdBy: panelData.createdBy,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    db.panels.push(newPanel);
    writeDB(db);
    return newPanel;
}

/**
 * تعديل لوحة موجودة
 * @param {String} name
 * @param {Object} updates
 * @returns {Object|null} اللوحة بعد التعديل أو null إذا لم توجد
 */
function updatePanel(name, updates) {
    const db = readDB();
    const index = db.panels.findIndex(p => p.name === name);
    if (index === -1) return null;

    db.panels[index] = {
        ...db.panels[index],
        ...updates,
        updatedAt: Date.now(),
    };

    writeDB(db);
    return db.panels[index];
}

/**
 * إعادة تسمية لوحة (تغيير اسمها الفريد).
 * بما أن الاسم يُستخدم كمعرف أساسي، نتعامل مع هذه الحالة بشكل
 * خاص: نتحقق من عدم تكرار الاسم الجديد، ثم نحدّث أي بنل آخر
 * كان مرتبطاً (linkedPanel) بالاسم القديم ليشير للاسم الجديد.
 * @param {String} oldName
 * @param {String} newName
 * @returns {Object|null} اللوحة بعد إعادة التسمية أو null إذا لم توجد
 */
function renamePanel(oldName, newName) {
    if (oldName === newName) return getPanelByName(oldName);

    const db = readDB();
    const index = db.panels.findIndex(p => p.name === oldName);
    if (index === -1) return null;

    const duplicate = db.panels.some(p => p.name === newName);
    if (duplicate) {
        throw new Error(`يوجد بالفعل لوحة تذاكر بنفس الاسم: ${newName}`);
    }

    db.panels[index].name = newName;
    db.panels[index].updatedAt = Date.now();

    // تحديث أي بنل كان مرتبطاً بالاسم القديم ليشير للاسم الجديد
    db.panels.forEach(p => {
        if (p.linkedPanel === oldName) p.linkedPanel = newName;
    });

    writeDB(db);
    return withDefaults(db.panels[index]);
}

/**
 * حذف لوحة عبر اسمها
 * @param {String} name
 * @returns {Boolean} true إذا تم الحذف
 */
function deletePanel(name) {
    const db = readDB();
    const before = db.panels.length;
    db.panels = db.panels.filter(p => p.name !== name);
    writeDB(db);
    return db.panels.length < before;
}

module.exports = {
    getAllPanels,
    getPanelByName,
    createPanel,
    updatePanel,
    renamePanel,
    deletePanel,
};

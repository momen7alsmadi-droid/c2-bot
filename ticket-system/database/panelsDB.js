/**
 * =========================================================
 *  panelsDB.js
 * =========================================================
 * طبقة قاعدة البيانات الخاصة بـ "إعدادات لوحات التذاكر" (Panels).
 *
 * 🆕 تخزين مزدوج (MongoDB + JSON) — مثل بقية أنظمة البوت:
 *   - JSON هو مصدر القراءة الفوري (متزامن/سريع، بلا await)
 *   - كل كتابة تُنسخ تلقائياً إلى MongoDB (خلف الكواليس)
 *   - عند التشغيل: نستعيد من MongoDB أي بنلات فُقدت من JSON
 *     (حماية من مسح قرص السيرفر المؤقت على المنصات المجانية)
 *
 * ملاحظة: هذا الملف يخزّن فقط "القوالب/الإعدادات" التي تنشئها
 * الإدارة. لا علاقة له بالتذاكر المفتوحة أو محتواها.
 *
 * تم اختيار هذا التصميم لأن كل دوال القراءة تبقى متزامنة
 * (Synchronous) كما كانت، فلا يتغير أي شيء على المتصلين بها.
 * =========================================================
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// مسار ملف قاعدة البيانات (المصدر المتزامن)
const DB_PATH = path.join(__dirname, '..', 'data', 'panels.json');

/**
 * هيكل الـ Schema الخاص بكل لوحة تذاكر (Panel):
 * {
 *   // --- عام ---
 *   name: String                    -> اسم اللوحة (فريد/Unique) - يُستخدم كمعرف
 *   description: String             -> وصف اللوحة
 *   emoji: String                    -> إيموجي مرتبط بالزر/القائمة
 *   createdBy: String                -> آيدي الإداري الذي أنشأ اللوحة
 *   createdAt: Number                -> Timestamp لوقت الإنشاء
 *   updatedAt: Number                -> Timestamp لآخر تعديل
 *
 *   // --- إعدادات عامة (General) ---
 *   enabled: Boolean                 -> هل البنل مفعّل
 *   ticketSystemType: String         -> 'buttons' | 'select'
 *   linkedPanels: Array<String>      -> بنلات أخرى مرتبطة (تُعرض معه كأزرار/قائمة عند النشر)
 *
 *   // --- الرتب (Roles) ---
 *   staffRoles: Array<String>
 *   pingRoles: Array<String>
 *   allowedRoles: Array<String>
 *   deniedRoles: Array<String>
 *
 *   // --- الرومات (Channels) ---
 *   categoryId: String | null
 *   logChannelId: String | null
 *
 *   // --- الرسائل (Messages) ---
 *   welcomeMessage: String | null    -> رسالة الترحيب (تدعم المتغيرات)
 *   panelMessage: Object | null      -> تخصيص رسالة البنل العامة:
 *                                        { title, description, footer, color }
 * }
 */

// القيم الافتراضية لأي بنل جديد
const DEFAULT_PANEL_FIELDS = {
    enabled: true,
    ticketSystemType: 'buttons',
    linkedPanels: [],
    staffRoles: [],
    pingRoles: [],
    allowedRoles: [],
    deniedRoles: [],
    categoryId: null,
    logChannelId: null,
    welcomeMessage: null,
    panelMessage: null,
};

// ---------- MongoDB Schema ----------
const panelSchema = new mongoose.Schema(
    {
        _id: String, // = name
        name: { type: String, required: true },
        description: { type: String, default: '' },
        emoji: { type: String, default: '🎫' },
        createdBy: { type: String, default: '' },
        createdAt: { type: Number, default: Date.now },
        updatedAt: { type: Number, default: Date.now },
        enabled: { type: Boolean, default: true },
        ticketSystemType: { type: String, default: 'buttons' },
        linkedPanels: { type: [String], default: [] },
        staffRoles: { type: [String], default: [] },
        pingRoles: { type: [String], default: [] },
        allowedRoles: { type: [String], default: [] },
        deniedRoles: { type: [String], default: [] },
        categoryId: { type: String, default: null },
        logChannelId: { type: String, default: null },
        welcomeMessage: { type: String, default: null },
        panelMessage: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { collection: 'ticketpanels', versionKey: false }
);

let PanelModel;

// ---------- JSON helpers ----------
function ensureDBFile() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ panels: [] }, null, 2), 'utf-8');
    }
}

function readDB() {
    ensureDBFile();
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    try {
        const data = JSON.parse(raw);

        // حماية 1: هيكل غير متوقع (ملف قديم/تالف)
        if (!data || typeof data !== 'object' || !Array.isArray(data.panels)) {
            // بعض النسخ القديمة خزّنت { panels: { panels: [...] } } — نستعيدها
            if (data && data.panels && Array.isArray(data.panels.panels)) {
                console.warn('[panelsDB] تم اكتشاف هيكل قديم متداخل، جاري التصحيح تلقائياً');
                return { panels: data.panels.panels };
            }
            console.warn('[panelsDB] هيكل ملف قديم/تالف، سيتم استخدام هيكل فارغ آمن');
            return { panels: [] };
        }

        // حماية 2: فلترة البنلات غير الصالحة (بدون اسم نصي صالح أو
        // اسم أطول من حد Discord البالغ 100 حرف) لمنع أي أعطال لاحقة
        const valid = data.panels.filter(
            p =>
                p &&
                typeof p === 'object' &&
                typeof p.name === 'string' &&
                p.name.trim() &&
                p.name.length <= 100
        );
        if (valid.length !== data.panels.length) {
            console.warn(`[panelsDB] تم تجاهل ${data.panels.length - valid.length} بنل غير صالح من الملف`);
        }
        data.panels = valid;

        return data;
    } catch (err) {
        console.error('[panelsDB] خطأ في قراءة ملف قاعدة البيانات، سيتم استخدام هيكل فارغ:', err);
        return { panels: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function withDefaults(panel) {
    const merged = { ...DEFAULT_PANEL_FIELDS, ...panel };

    // ---- ترحيل: الحقل القديم linkedPanel (نص واحد) -> المصفوفة linkedPanels ----
    if (!Array.isArray(merged.linkedPanels)) {
        if (typeof panel.linkedPanel === 'string' && panel.linkedPanel.trim()) {
            merged.linkedPanels = [panel.linkedPanel.trim()];
        } else {
            merged.linkedPanels = [];
        }
    }
    delete merged.linkedPanel;

    // ---- تنظيف المصفوفة: نصوص صالحة فقط، بلا مكررات، بلا اسم البنل نفسه، حد 25 ----
    merged.linkedPanels = [
        ...new Set(
            merged.linkedPanels.filter(
                n =>
                    typeof n === 'string' &&
                    n.trim() &&
                    n !== merged.name
            )
        ),
    ].slice(0, 25);

    return merged;
}

// ---------- MongoDB helpers (غير متزامنة - تُستدعى بلا انتظار) ----------
function isMongoReady() {
    if (mongoose.connection.readyState !== 1) return false;
    if (PanelModel) return true;
    try {
        PanelModel = mongoose.models.TicketPanel || mongoose.model('TicketPanel', panelSchema);
        return true;
    } catch {
        return false;
    }
}

/** تهيئة النموذج (تُستدعى عند التشغيل) */
function initPanelsModel() {
    if (isMongoReady()) {
        console.log('📦 ticketPanels → ✅ MongoDB');
        return true;
    }
    console.log('📦 ticketPanels → ⚠️ JSON فقط');
    return false;
}

/** كتابة بنل واحد إلى MongoDB (Upsert) */
async function writePanelToMongo(panel) {
    if (!isMongoReady()) return;
    try {
        const { _id, ...safeData } = panel || {};
        await PanelModel.findByIdAndUpdate(
            panel.name,
            { $set: { ...safeData, _id: panel.name } },
            { upsert: true }
        );
    } catch (e) {
        console.error(`❌ panels MongoDB write (${panel?.name}):`, e.message);
    }
}

/** حذف بنل من MongoDB */
async function deletePanelFromMongo(name) {
    if (!isMongoReady()) return;
    try {
        await PanelModel.findByIdAndDelete(name);
    } catch (e) {
        console.error(`❌ panels MongoDB delete (${name}):`, e.message);
    }
}

/**
 * استعادة البنلات من MongoDB إلى JSON (حماية من مسح القرص):
 * يُضاف أي بنل موجود في MongoDB ولا يوجد في JSON (المصدر المتزامن).
 * @returns {Number} عدد البنلات المستعادة
 */
async function loadPanelsFromMongo() {
    if (!isMongoReady()) return 0;
    try {
        const mongoPanels = await PanelModel.find().lean();
        if (!mongoPanels || mongoPanels.length === 0) return 0;

        const db = readDB();
        const jsonNames = new Set(db.panels.map(p => p.name));
        const restored = [];

        for (const doc of mongoPanels) {
            if (jsonNames.has(doc.name)) continue;
            const { _id, ...rest } = doc;
            db.panels.push(withDefaults(rest));
            jsonNames.add(doc.name);
            restored.push(doc.name);
        }

        if (restored.length > 0) {
            writeDB(db);
            console.log(`🔄 panels: تمت استعادة ${restored.length} بنل من MongoDB → ${restored.join(', ')}`);
        }
        return restored.length;
    } catch (e) {
        console.error('❌ panels load MongoDB:', e.message);
        return 0;
    }
}

/** مزامنة كل البنلات من JSON إلى MongoDB (تُستدعى عند التشغيل) */
async function syncPanelsToMongo() {
    if (!isMongoReady()) return;
    try {
        const panels = getAllPanels();
        if (panels.length === 0) return;
        for (const p of panels) {
            await writePanelToMongo(p);
        }
        console.log(`✅ panels: تمت مزامنة ${panels.length} بنل إلى MongoDB`);
    } catch (e) {
        console.error('❌ panels sync MongoDB:', e.message);
    }
}

// ========== API العامة (متزامنة - كما كانت) ==========

function getAllPanels() {
    return readDB().panels.map(withDefaults);
}

function getPanelByName(name) {
    const db = readDB();
    const panel = db.panels.find(p => p.name === name);
    return panel ? withDefaults(panel) : null;
}

function createPanel(panelData) {
    const db = readDB();

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

    // نسخ احتياطي إلى MongoDB (بلا انتظار)
    writePanelToMongo(newPanel);

    return newPanel;
}

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

    // نسخ احتياطي إلى MongoDB
    writePanelToMongo(withDefaults(db.panels[index]));

    return db.panels[index];
}

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

    db.panels.forEach(p => {
        // تحديث الروابط: أي بنل كان مرتبطاً بالاسم القديم ينتقل للجديد
        if (Array.isArray(p.linkedPanels) && p.linkedPanels.includes(oldName)) {
            p.linkedPanels[p.linkedPanels.indexOf(oldName)] = newName;
        }
        delete p.linkedPanel; // إزالة أي حقل قديم متبقي
    });

    writeDB(db);

    // في MongoDB: حذف الوثيقة القديمة + كتابة الجديدة
    deletePanelFromMongo(oldName);
    writePanelToMongo(withDefaults(db.panels[index]));

    return withDefaults(db.panels[index]);
}

function deletePanel(name) {
    const db = readDB();
    const before = db.panels.length;
    db.panels = db.panels.filter(p => p.name !== name);
    writeDB(db);

    deletePanelFromMongo(name);

    return db.panels.length < before;
}

module.exports = {
    getAllPanels,
    getPanelByName,
    createPanel,
    updatePanel,
    renamePanel,
    deletePanel,
    withDefaults,
    // أدوات التخزين المزدوج (تُستدعى من ملف التشغيل الرئيسي)
    initPanelsModel,
    syncPanelsToMongo,
    loadPanelsFromMongo,
};

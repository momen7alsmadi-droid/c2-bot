/**
 * starboardStorage.js - تخزين نظام لوحة النجوم (MongoDB + JSON مع Fallback آمن)
 * يدعم لوحات متعددة مثل نظام الإيمبدات
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PANELS_PATH = path.join(DATA_DIR, 'starboard-panels.json');

// ---------- القيم الافتراضية للوحة جديدة ----------
function defaultPanel(name) {
  return {
    name,
    sourceChannelId: null,
    destChannelId: null,
    emoji: '⭐',
    threshold: 5,
    embedColor: '#F1C40F',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// ---------- MongoDB Schema ----------
const panelSchema = new mongoose.Schema({
  _id: String, // اسم اللوحة (مفتاح فريد)
  name: { type: String, required: true },
  sourceChannelId: { type: String, default: null },
  destChannelId: { type: String, default: null },
  emoji: { type: String, default: '⭐' },
  threshold: { type: Number, default: 5 },
  embedColor: { type: String, default: '#F1C40F' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'starboard_panels', versionKey: false });

let PanelModel;

// ---------- JSON helpers ----------
function readJSON() {
  try {
    if (!fs.existsSync(PANELS_PATH)) return [];
    const raw = fs.readFileSync(PANELS_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('❌ starboardStorage readJSON:', e.message);
    return [];
  }
}

function writeJSON(data) {
  try {
    fs.writeFileSync(PANELS_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ starboardStorage writeJSON:', e.message);
  }
}

// ---------- التحقق من MongoDB ----------
function isMongoReady() {
  if (mongoose.connection.readyState !== 1) return false;
  if (PanelModel) return true;
  try {
    PanelModel = mongoose.models.StarboardPanel || mongoose.model('StarboardPanel', panelSchema);
    return true;
  } catch { return false; }
}

function initStarboardModels() {
  if (isMongoReady()) { console.log('📦 starboard → ✅ MongoDB'); return true; }
  console.log('📦 starboard → ⚠️ JSON فقط'); return false;
}

// ========== API العامة ==========

/** تجلب كل اللوحات من JSON */
function getAllPanels() {
  return readJSON();
}

/** تجلب لوحة واحدة بالاسم */
function getPanel(name) {
  const panels = readJSON();
  return panels.find(p => p.name === name) || null;
}

/** تحفظ لوحة (إضافة أو تحديث) */
function savePanel(name, data) {
  const panels = readJSON();
  const idx = panels.findIndex(p => p.name === name);
  const panel = { ...defaultPanel(name), ...data, name, updatedAt: Date.now() };

  if (idx >= 0) {
    panels[idx] = panel;
  } else {
    panel.createdAt = Date.now();
    panels.push(panel);
  }

  writeJSON(panels);

  // حفظ في MongoDB (غير متزامن)
  if (isMongoReady()) {
    PanelModel.findByIdAndUpdate(name, panel, { upsert: true })
      .then(() => {})
      .catch(e => console.error('❌ starboard MongoDB save error:', e.message));
  }
  return panel;
}

/** تحذف لوحة */
function deletePanel(name) {
  let panels = readJSON();
  panels = panels.filter(p => p.name !== name);
  writeJSON(panels);

  if (isMongoReady()) {
    PanelModel.findByIdAndDelete(name)
      .then(() => {})
      .catch(e => console.error('❌ starboard MongoDB delete error:', e.message));
  }
}

/** تحميل اللوحات من MongoDB إلى JSON عند بدء التشغيل */
async function ensureStarboardLoaded() {
  if (!isMongoReady()) {
    console.log('⚠️ ensureStarboardLoaded: MongoDB غير جاهز');
    return;
  }

  try {
    const docs = await PanelModel.find().lean();
    if (docs && docs.length > 0) {
      writeJSON(docs);
      console.log(`📦 starboard → تم تحميل ${docs.length} لوحة من MongoDB`);
      return;
    }
  } catch (e) {
    console.error('❌ ensureStarboardLoaded MongoDB read error:', e.message);
  }

  // إذا JSON موجود، ادفعه إلى MongoDB
  const jsonData = readJSON();
  if (jsonData.length > 0 && isMongoReady()) {
    try {
      for (const panel of jsonData) {
        await PanelModel.findByIdAndUpdate(panel.name, panel, { upsert: true });
      }
      console.log(`📦 starboard → تم دفع ${jsonData.length} لوحة إلى MongoDB`);
    } catch (e) {
      console.error('❌ ensureStarboardLoaded MongoDB write error:', e.message);
    }
  }
}

module.exports = {
  initStarboardModels,
  getAllPanels,
  getPanel,
  savePanel,
  deletePanel,
  ensureStarboardLoaded,
  isMongoReady
};

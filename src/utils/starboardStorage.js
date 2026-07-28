/**
 * starboardStorage.js - تخزين نظام لوحة النجوم (MongoDB + JSON مع Fallback آمن)
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const CONFIG_PATH = path.join(DATA_DIR, 'starboard-config.json');

// ---------- القيم الافتراضية ----------
const DEFAULT_CONFIG = {
  sourceChannelId: null,
  destChannelId: null,
  emoji: '⭐',
  threshold: 5,
  embedColor: '#F1C40F'
};

// ---------- MongoDB Schema ----------
const configSchema = new mongoose.Schema({
  _id: String,
  data: mongoose.Schema.Types.Mixed
}, { collection: 'starboard_config', versionKey: false });

let ConfigModel;

function isMongoReady() {
  if (mongoose.connection.readyState !== 1) return false;
  if (!ConfigModel) {
    try {
      ConfigModel = mongoose.models.StarboardConfig || mongoose.model('StarboardConfig', configSchema);
    } catch { return false; }
  }
  return true;
}

function initStarboardModels() {
  if (isMongoReady()) { console.log('📦 starboard → ✅ MongoDB'); return true; }
  console.log('📦 starboard → ⚠️ JSON فقط'); return false;
}

// ========== JSON helpers ==========
function readJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('❌ starboardStorage readJSON:', filePath, e.message);
    return fallback;
  }
}

function writeJSON(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ starboardStorage writeJSON:', filePath, e.message);
  }
}

// ========== الإعدادات ==========

function getStarboardConfig() {
  const jsonData = readJSON(CONFIG_PATH, null);
  if (jsonData && typeof jsonData === 'object' && jsonData.sourceChannelId !== undefined) {
    return jsonData;
  }
  console.warn('⚠️ starboard-config.json غير موجود/تالف، نرجع القيم الافتراضية');
  return { ...DEFAULT_CONFIG };
}

function saveStarboardConfig(cfg) {
  writeJSON(CONFIG_PATH, cfg);
  if (isMongoReady()) {
    ConfigModel.findByIdAndUpdate('main', { data: cfg }, { upsert: true })
      .then(() => {})
      .catch(e => console.error('❌ starboardConfig MongoDB save error:', e.message));
  }
}

async function ensureStarboardLoaded() {
  if (!isMongoReady()) {
    console.log('⚠️ ensureStarboardLoaded: MongoDB غير جاهز');
    return;
  }
  try {
    const mDoc = await ConfigModel.findById('main').lean();
    if (mDoc && mDoc.data && typeof mDoc.data === 'object') {
      writeJSON(CONFIG_PATH, mDoc.data);
      console.log('📦 starboardConfig → تم التحميل من MongoDB');
      return;
    }
  } catch (e) {
    console.error('❌ ensureStarboardLoaded MongoDB read error:', e.message);
  }
  const jsonData = readJSON(CONFIG_PATH, null);
  if (jsonData && typeof jsonData === 'object' && jsonData.sourceChannelId !== undefined) {
    try {
      await ConfigModel.findByIdAndUpdate('main', { data: jsonData }, { upsert: true });
      console.log('📦 starboardConfig → تم الدفع إلى MongoDB من JSON');
    } catch (e) {
      console.error('❌ ensureStarboardLoaded MongoDB write error:', e.message);
    }
  }
}

module.exports = {
  initStarboardModels,
  getStarboardConfig, saveStarboardConfig, ensureStarboardLoaded,
  isMongoReady
};

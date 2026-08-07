/**
 * adminStorage.js - تخزين إعدادات نظام الإدارة (MongoDB + JSON)
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { reportError } = require('./errorLogger');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ADMIN_CONFIG_PATH = path.join(DATA_DIR, 'admin-config.json');

const DEFAULT_CONFIG = {
  sharedAdminRoleId: null,
  hierarchyRangeStartId: null,
  hierarchyRangeEndId: null,
  excludedRoles: [],
  highAdminRoles: [],
  highAdminRangeStartId: null,
  highAdminRangeEndId: null,
  promotionChannelId: null,
  demotionChannelId: null
};

// ---------- MongoDB Schema ----------
const adminConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' },
  data: mongoose.Schema.Types.Mixed
}, { collection: 'admin_config', versionKey: false });

let AdminConfigModel;

function isMongoReady() {
  if (mongoose.connection.readyState !== 1) return false;
  if (AdminConfigModel) return true;
  try {
    AdminConfigModel = mongoose.models.AdminConfig || mongoose.model('AdminConfig', adminConfigSchema);
    return true;
  } catch { return false; }
}

function initAdminModel() {
  if (isMongoReady()) {
    console.log('📦 admin → ✅ MongoDB');
    return true;
  }
  console.log('📦 admin → ⚠️ JSON فقط');
  return false;
}

// ---------- JSON helpers ----------
function readJSON() {
  try {
    if (!fs.existsSync(ADMIN_CONFIG_PATH)) return { ...DEFAULT_CONFIG };
    const raw = fs.readFileSync(ADMIN_CONFIG_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : { ...DEFAULT_CONFIG };
  } catch (e) {
    console.error('❌ adminStorage readJSON:', e.message);
    reportError('STORAGE', 'admin-read-json', e);
    return { ...DEFAULT_CONFIG };
  }
}

function writeJSON(data) {
  try {
    fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ adminStorage writeJSON:', e.message);
    reportError('STORAGE', 'admin-write-json', e);
  }
}

function applyDefaults(cfg) {
  return {
    sharedAdminRoleId: cfg.sharedAdminRoleId || null,
    hierarchyRangeStartId: cfg.hierarchyRangeStartId || null,
    hierarchyRangeEndId: cfg.hierarchyRangeEndId || null,
    excludedRoles: Array.isArray(cfg.excludedRoles) ? cfg.excludedRoles : [],
    highAdminRoles: Array.isArray(cfg.highAdminRoles) ? cfg.highAdminRoles : [],
    highAdminRangeStartId: cfg.highAdminRangeStartId || null,
    highAdminRangeEndId: cfg.highAdminRangeEndId || null,
    promotionChannelId: cfg.promotionChannelId || null,
    demotionChannelId: cfg.demotionChannelId || null
  };
}

// ========== API ==========

function getAdminConfig() {
  return applyDefaults(readJSON());
}

function saveAdminConfig(cfg) {
  const clean = applyDefaults(cfg);
  writeJSON(clean);

  // MongoDB (غير متزامن)
  if (isMongoReady()) {
    AdminConfigModel.findByIdAndUpdate('main', { data: clean }, { upsert: true })
      .then(() => {})
      .catch(e => { console.error('❌ adminStorage MongoDB save error:', e.message); reportError('STORAGE', 'admin-mongo-save', e); });
  }
}

async function syncAdminConfigFromMongo() {
  if (!isMongoReady()) return;
  try {
    const doc = await AdminConfigModel.findById('main').lean();
    if (doc && doc.data) {
      writeJSON(doc.data);
      console.log('📦 admin → تم التحميل من MongoDB');
      return;
    }
  } catch (e) {
    console.error('❌ adminStorage sync from MongoDB:', e.message);
    reportError('STORAGE', 'admin-mongo-sync', e);
  }
  // Push local to MongoDB
  const local = readJSON();
  try {
    await AdminConfigModel.findByIdAndUpdate('main', { data: local }, { upsert: true });
    console.log('📦 admin → تم الدفع إلى MongoDB');
  } catch (e) {
    console.error('❌ adminStorage push to MongoDB:', e.message);
    reportError('STORAGE', 'admin-mongo-push', e);
  }
}

module.exports = {
  initAdminModel,
  getAdminConfig,
  saveAdminConfig,
  syncAdminConfigFromMongo
};

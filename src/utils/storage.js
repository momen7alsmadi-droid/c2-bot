const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const LEAVES_PATH = path.join(DATA_DIR, 'leaves.json');
const REPORTS_PATH = path.join(DATA_DIR, 'reports.json');

const DEFAULT_CONFIG = {
  leave: {
    allowedRoleId: null,
    requestChannelId: null,
    rolesToRemove: [],
    exemptedRoles: [],
    leaveRoleId: null,
    logChannelId: null
  },
  daleel: {
    allowedRoleId: null,
    channelId: null,
    logChannelId: null
  },
  report: {
    allowedRoleId: null,
    adminRoleId: null,
    channelId: null,
    warning1RoleId: null,
    warning2RoleId: null,
    warning3RoleId: null,
    upperManagementRoleId: null,
    upperManagementChannelId: null,
    logChannelId: null,
    cooldownEnabled: true,
    cooldownDuration: 60
  },
  resign: {
    allowedRoleId: null,
    logChannelId: null,
    rolesToRemove: [],
    exemptedRoles: [],
    resignRoleId: null,
    upperManagementRoleId: null
  },
  disabledGuilds: [],
  statusChannelId: null,
  dbStatusChannelId: null,
  errorLogChannelId: null
};

// ---------- MongoDB Models ----------

const configSchema = new mongoose.Schema({
  _id: String,
  data: mongoose.Schema.Types.Mixed
}, { collection: 'config', versionKey: false });

const leavesSchema = new mongoose.Schema({
  _id: String, // userId
  data: mongoose.Schema.Types.Mixed
}, { collection: 'leaves', versionKey: false });

const reportsSchema = new mongoose.Schema({
  _id: String, // reportId
  data: mongoose.Schema.Types.Mixed
}, { collection: 'reports', versionKey: false });

let ConfigModel, LeavesModel, ReportsModel;

function isMongoReady() {
  if (mongoose.connection.readyState !== 1) return false;
  if (!ConfigModel || !LeavesModel || !ReportsModel) {
    try {
      ConfigModel = mongoose.models.Config || mongoose.model('Config', configSchema);
      LeavesModel = mongoose.models.Leaves || mongoose.model('Leaves', leavesSchema);
      ReportsModel = mongoose.models.Reports || mongoose.model('Reports', reportsSchema);
    } catch { return false; }
  }
  return true;
}

function initModels() {
  if (isMongoReady()) { console.log('📦 settings → ✅ MongoDB'); return true; }
  console.log('📦 settings → ⚠️ JSON فقط'); return false;
}

// ---------- JSON helpers ----------

function readJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error(`فشل في قراءة الملف ${filePath}:`, e);
    return fallback;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ---------- Config ----------

async function mongoGetConfig() {
  if (!isMongoReady()) return null;
  try {
    const doc = await ConfigModel.findById('main').lean();
    return doc ? doc.data : null;
  } catch { return null; }
}

async function mongoSaveConfig(cfg) {
  if (!isMongoReady()) return;
  try {
    await ConfigModel.findByIdAndUpdate('main', { data: cfg }, { upsert: true });
  } catch (e) { console.error('Mongo saveConfig error:', e); }
}

function getConfig() {
  // Try MongoDB first
  if (isMongoReady()) {
    // We'll handle async via a promise cache, but for sync we return cached or fallback
    // For simplicity, we'll use a sync fallback and expose async versions
  }
  const cfg = readJSON(CONFIG_PATH, DEFAULT_CONFIG);
  return {
    leave: { ...DEFAULT_CONFIG.leave, ...(cfg.leave || {}) },
    daleel: { ...DEFAULT_CONFIG.daleel, ...(cfg.daleel || {}) },
    report: { ...DEFAULT_CONFIG.report, ...(cfg.report || {}) },
    resign: { ...DEFAULT_CONFIG.resign, ...(cfg.resign || {}) },
    disabledGuilds: Array.isArray(cfg.disabledGuilds) ? cfg.disabledGuilds : [],
    statusChannelId: cfg.statusChannelId || null,
    dbStatusChannelId: cfg.dbStatusChannelId || null,
    errorLogChannelId: cfg.errorLogChannelId || null
  };
}

function saveConfig(cfg) {
  writeJSON(CONFIG_PATH, cfg);
  if (isMongoReady()) mongoSaveConfig(cfg);
}

// Async versions for MongoDB
async function ensureConfigLoaded() {
  initModels();
  if (isMongoReady()) {
    const mCfg = await mongoGetConfig();
    if (mCfg) {
      writeJSON(CONFIG_PATH, mCfg);
    } else {
      // Push local config to MongoDB
      const local = readJSON(CONFIG_PATH, DEFAULT_CONFIG);
      await mongoSaveConfig(local);
    }
  }
}

// ---------- Leaves ----------

async function mongoGetLeaves() {
  if (!isMongoReady()) return null;
  try {
    const docs = await LeavesModel.find().lean();
    const result = {};
    for (const doc of docs) {
      result[doc._id] = doc.data;
    }
    return result;
  } catch { return null; }
}

async function mongoSaveLeaves(leaves) {
  if (!isMongoReady()) return;
  try {
    // Bulk upsert
    const ops = Object.entries(leaves).map(([userId, data]) => ({
      updateOne: {
        filter: { _id: userId },
        update: { data },
        upsert: true
      }
    }));
    if (ops.length) await LeavesModel.bulkWrite(ops);
    // Remove deleted entries (those not in leaves object)
    const existingIds = Object.keys(leaves);
    await LeavesModel.deleteMany({ _id: { $nin: existingIds } });
  } catch (e) { console.error('Mongo saveLeaves error:', e); }
}

function getLeaves() {
  return readJSON(LEAVES_PATH, {});
}

function saveLeaves(leaves) {
  writeJSON(LEAVES_PATH, leaves);
  if (isMongoReady()) mongoSaveLeaves(leaves);
}

// ---------- Reports ----------

async function mongoGetReports() {
  if (!isMongoReady()) return null;
  try {
    const docs = await ReportsModel.find().lean();
    const result = {};
    for (const doc of docs) {
      result[doc._id] = doc.data;
    }
    return result;
  } catch { return null; }
}

async function mongoSaveReports(reports) {
  if (!isMongoReady()) return;
  try {
    const ops = Object.entries(reports).map(([id, data]) => ({
      updateOne: {
        filter: { _id: id },
        update: { data },
        upsert: true
      }
    }));
    if (ops.length) await ReportsModel.bulkWrite(ops);
    const existingIds = Object.keys(reports);
    await ReportsModel.deleteMany({ _id: { $nin: existingIds } });
  } catch (e) { console.error('Mongo saveReports error:', e); }
}

function getReports() {
  return readJSON(REPORTS_PATH, {});
}

async function ensureReportsLoaded() {
  if (!isMongoReady()) return;
  const json = readJSON(REPORTS_PATH, {});
  // إذا JSON فاضي أو ما فيه بلاغات، نجيب من MongoDB
  if (Object.keys(json).length === 0) {
    const mongoData = await mongoGetReports();
    if (mongoData && Object.keys(mongoData).length > 0) {
      writeJSON(REPORTS_PATH, mongoData);
      console.log(`📦 تم تحميل ${Object.keys(mongoData).length} بلاغ من MongoDB`);
    }
  }
}

function saveReports(reports) {
  writeJSON(REPORTS_PATH, reports);
  if (isMongoReady()) mongoSaveReports(reports);
}

module.exports = {
  getConfig, saveConfig,
  getLeaves, saveLeaves,
  getReports, saveReports,
  ensureConfigLoaded,
  ensureReportsLoaded,
  initModels,
  isMongoReady
};

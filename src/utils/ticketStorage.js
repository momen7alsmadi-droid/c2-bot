/**
 * ticketStorage.js - تخزين قوالب وإعدادات التذاكر (MongoDB + JSON)
 * هذا الملف خاص بإعدادات التذاكر التي تصممها الإدارة فقط.
 * لا يتم حفظ أي تذكرة يفتحها الأعضاء هنا.
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const TICKETS_PATH = path.join(DATA_DIR, 'tickets.json');

// ---------- القيم الافتراضية للقالب ----------
function defaultTicketConfig(name) {
  return {
    name,
    title: '',
    description: '',
    color: '#5865F2',
    channelId: null,
    categoryId: null,
    supportRoleId: null,
    staffRoleId: null,
    welcomeMessage: 'مرحباً بك في التذكرة، سيتم الرد عليك قريباً.',
    closeMessage: 'تم إغلاق التذكرة.',
    transcriptEnabled: true,
    maxTicketsPerUser: 5,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// ---------- MongoDB Schema ----------
const ticketConfigSchema = new mongoose.Schema({
  _id: String,
  name: { type: String, required: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  color: { type: String, default: '#5865F2' },
  channelId: { type: String, default: null },
  categoryId: { type: String, default: null },
  supportRoleId: { type: String, default: null },
  staffRoleId: { type: String, default: null },
  welcomeMessage: { type: String, default: 'مرحباً بك في التذكرة، سيتم الرد عليك قريباً.' },
  closeMessage: { type: String, default: 'تم إغلاق التذكرة.' },
  transcriptEnabled: { type: Boolean, default: true },
  maxTicketsPerUser: { type: Number, default: 5 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'ticket_configs', versionKey: false });

let TicketConfigModel;

// ---------- JSON helpers ----------
function readJSON() {
  try {
    if (!fs.existsSync(TICKETS_PATH)) return {};
    const raw = fs.readFileSync(TICKETS_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('❌ ticketStorage readJSON:', e.message);
    return {};
  }
}

function writeJSON(data) {
  try {
    fs.writeFileSync(TICKETS_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ ticketStorage writeJSON:', e.message);
  }
}

function objToJson(obj) { writeJSON(obj); }

// ---------- التحقق الديناميكي من MongoDB ----------
function isMongoReady() {
  if (mongoose.connection.readyState !== 1) return false;
  if (TicketConfigModel) return true;
  try {
    TicketConfigModel = mongoose.models.TicketConfig || mongoose.model('TicketConfig', ticketConfigSchema);
    return true;
  } catch { return false; }
}

// ---------- التهيئة ----------
function initTicketModel() {
  if (isMongoReady()) {
    console.log('📦 tickets → ✅ MongoDB');
    return true;
  }
  console.log('📦 tickets → ⚠️ JSON فقط');
  return false;
}

async function syncJsonToMongo() {
  if (!isMongoReady()) return;
  const json = readJSON();
  const names = Object.keys(json);
  if (names.length === 0) { console.log('🔄 tickets: JSON فاضي'); return; }
  console.log(`🔄 مزامنة ${names.length} قالب تكت من JSON إلى MongoDB...`);
  let synced = 0;
  for (const name of names) {
    try {
      await TicketConfigModel.findByIdAndUpdate(name, { $set: json[name] }, { upsert: true });
      synced++;
    } catch (e) {
      console.error(`❌ فشل مزامنة ${name}:`, e.message);
    }
  }
  console.log(`✅ تمت مزامنة ${synced}/${names.length} قالب تكت`);
}

// ========== دوال مساعدة ==========

async function writeToMongo(name, data) {
  if (!isMongoReady()) return null;
  try {
    const { _id, ...safeData } = data || {};
    safeData.updatedAt = new Date();
    return await TicketConfigModel.findByIdAndUpdate(
      name,
      { $set: safeData },
      { upsert: true, new: true }
    ).lean();
  } catch (e) {
    console.error(`❌ ticketStorage MongoDB error:`, e.message);
    return null;
  }
}

async function deleteFromMongo(name) {
  if (!isMongoReady()) return false;
  try { await TicketConfigModel.findByIdAndDelete(name); return true; } catch { return false; }
}

// ========== API العامة ==========

async function getAllTicketConfigs() {
  const jsonData = readJSON();
  const jsonList = Object.values(jsonData);

  if (isMongoReady()) {
    try {
      const mongoData = await TicketConfigModel.find().lean();
      if (mongoData && mongoData.length > 0) {
        for (const item of mongoData) {
          const key = item.name;
          if (key) {
            jsonData[key] = { ...(jsonData[key] || {}), ...item, _id: key };
          }
        }
        objToJson(jsonData);
        return Object.values(jsonData);
      }
    } catch (e) {
      console.error('❌ ticketStorage getAll MongoDB:', e.message);
    }
  }

  return jsonList;
}

async function getTicketConfig(name) {
  if (isMongoReady()) {
    try {
      const data = await TicketConfigModel.findById(name).lean();
      if (data) return data;
    } catch {}
  }
  return readJSON()[name] || null;
}

async function createTicketConfig(data) {
  const now = new Date();
  const doc = {
    _id: data.name,
    name: data.name,
    title: data.title || '',
    description: data.description || '',
    color: data.color || '#5865F2',
    channelId: data.channelId || null,
    categoryId: data.categoryId || null,
    supportRoleId: data.supportRoleId || null,
    staffRoleId: data.staffRoleId || null,
    welcomeMessage: data.welcomeMessage || 'مرحباً بك في التذكرة، سيتم الرد عليك قريباً.',
    closeMessage: data.closeMessage || 'تم إغلاق التذكرة.',
    transcriptEnabled: data.transcriptEnabled !== false,
    maxTicketsPerUser: data.maxTicketsPerUser || 5,
    createdAt: now,
    updatedAt: now
  };

  let mongoResult = null;
  if (isMongoReady()) {
    mongoResult = await writeToMongo(data.name, doc);
    if (mongoResult) console.log(`✅ ticketConfig: "${data.name}" → MongoDB`);
    else console.log(`⚠️ ticketConfig: "${data.name}" → فشل MongoDB`);
  }

  const json = readJSON();
  if (json[data.name]) {
    console.log(`⚠️ ticketConfig: "${data.name}" موجود مسبقاً في JSON`);
    return null;
  }
  json[data.name] = { ...doc, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  objToJson(json);
  console.log(`✅ ticketConfig: "${data.name}" → JSON`);

  return mongoResult || json[data.name];
}

async function updateTicketConfig(name, updates) {
  updates.updatedAt = new Date();
  let mongoResult = null;
  if (isMongoReady()) mongoResult = await writeToMongo(name, updates);
  const json = readJSON();
  if (json[name]) {
    json[name] = { ...json[name], ...updates, updatedAt: updates.updatedAt.toISOString() };
    objToJson(json);
  }
  return mongoResult || json[name] || null;
}

async function deleteTicketConfig(name) {
  if (isMongoReady()) await deleteFromMongo(name);
  const json = readJSON();
  if (json[name]) { delete json[name]; objToJson(json); }
  return true;
}

async function getTicketConfigsList() {
  const all = await getAllTicketConfigs();
  if (!Array.isArray(all)) return [];
  return all
    .filter(r => r && typeof r === 'object')
    .map(r => ({
      name: (r.name || r._id || 'بدون اسم').toString(),
      title: ((r.title || '') + '').slice(0, 100),
      color: (r.color || '#5865F2') + ''
    }));
}

module.exports = {
  initTicketModel,
  syncJsonToMongo,
  getAllTicketConfigs,
  getTicketConfig,
  getTicketConfigsList,
  createTicketConfig,
  updateTicketConfig,
  deleteTicketConfig
};

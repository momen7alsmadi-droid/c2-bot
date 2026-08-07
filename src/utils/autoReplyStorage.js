/**
 * autoReplyStorage.js - تخزين ثنائي ديناميكي (MongoDB + JSON)
 * يتحقق من حالة MongoDB في كل عملية، لا يعتمد على flag ثابت
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const AUTOREPLY_PATH = path.join(DATA_DIR, 'autoreply.json');

// ---------- MongoDB Schema ----------
const autoReplySchema = new mongoose.Schema({
  _id: String,
  name: { type: String, required: true },
  guildId: { type: String, default: '' },
  trigger: { type: String, required: true },
  triggerType: { type: String, default: 'contains' },
  responses: { type: [String], default: [] },
  randomReply: { type: Boolean, default: false },
  sendStyle: { type: String, default: 'reply_mention' },
  autoDelete: { type: Boolean, default: false },
  autoDeleteTime: { type: Number, default: 0 },
  deleteUserMsg: { type: Boolean, default: false },
  replyDelay: { type: Boolean, default: false },
  replyDelayTime: { type: Number, default: 0 },
  roleWhitelist: { type: [String], default: [] },
  roleBlacklist: { type: [String], default: [] },
  channelWhitelist: { type: [String], default: [] },
  channelBlacklist: { type: [String], default: [] },
  channelId: { type: String, default: null },
  ignoreBots: { type: Boolean, default: true },
  caseSensitive: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true },
  useCount: { type: Number, default: 0 },
  replyAsEmbed: { type: Boolean, default: false },
  embedColor: { type: String, default: '#5865F2' },
  randomColor: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'autoreplies', versionKey: false });

let AutoReplyModel;

// ---------- JSON helpers ----------
function readJSON() {
  try {
    if (!fs.existsSync(AUTOREPLY_PATH)) return {};
    const raw = fs.readFileSync(AUTOREPLY_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('❌ autoReply readJSON:', e.message);
    return {};
  }
}

function writeJSON(data) {
  try {
    fs.writeFileSync(AUTOREPLY_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ autoReply writeJSON:', e.message);
  }
}

function objToJson(obj) { writeJSON(obj); }

// ---------- التحقق الديناميكي من MongoDB ----------
function isMongoReady() {
  if (mongoose.connection.readyState !== 1) return false;
  if (AutoReplyModel) return true;
  // حاول تهيئة النموذج إن لم يكن موجوداً
  try {
    AutoReplyModel = mongoose.models.AutoReply || mongoose.model('AutoReply', autoReplySchema);
    return true;
  } catch { return false; }
}

// ---------- التهيئة ----------
function initAutoReplyModel() {
  if (isMongoReady()) {
    console.log('📦 autoReply → ✅ MongoDB');
    return true;
  }
  console.log('📦 autoReply → ⚠️ JSON فقط');
  return false;
}

async function syncJsonToMongo() {
  if (!isMongoReady()) return;
  const json = readJSON();
  const names = Object.keys(json);
  if (names.length === 0) { console.log('🔄 autoReply: JSON فاضي'); return; }
  console.log(`🔄 مزامنة ${names.length} رد من JSON إلى MongoDB...`);
  let synced = 0;
  for (const name of names) {
    try {
      await AutoReplyModel.findByIdAndUpdate(name, { $set: json[name] }, { upsert: true });
      synced++;
    } catch (e) { console.error(`❌ فشل مزامنة ${name}:`, e.message); }
  }
  console.log(`✅ تمت مزامنة ${synced}/${names.length} رد`);
}

/**
 * استعادة الردود من MongoDB إلى ملف JSON عند الإقلاع
 * (حماية من مسح القرص المؤقت — مثل loadPanels للبنلات)
 * لا تستبدل أي رد موجود محلياً، تُضيف الناقص فقط.
 * @returns {Promise<Number>} عدد الردود المستعادة
 */
async function loadRepliesFromMongo() {
  if (!isMongoReady()) return 0;
  try {
    const mongoData = await AutoReplyModel.find().lean();
    if (!mongoData || mongoData.length === 0) return 0;
    const json = readJSON();
    let restored = 0;
    for (const item of mongoData) {
      const key = item && item.name;
      if (!key || typeof key !== 'string') continue; // سجل تالف بلا اسم
      if (json[key]) continue; // لا نستبدل المحلي
      json[key] = { ...item, _id: key };
      restored++;
    }
    if (restored > 0) {
      objToJson(json);
      console.log(`🔄 autoReply: تمت استعادة ${restored} رد من MongoDB → ${Object.keys(json).slice(0, 5).join(', ')}${Object.keys(json).length > 5 ? '...' : ''}`);
    }
    return restored;
  } catch (e) {
    console.error('❌ autoReply loadFromMongo:', e.message);
    return 0;
  }
}

// ========== دوال مساعدة ==========

async function writeToMongo(name, data) {
  if (!isMongoReady()) return null;
  try {
    // نزيل _id لأن MongoDB لا يسمح بتعديله عبر $set
    const { _id, ...safeData } = data || {};
    safeData.updatedAt = new Date();
    return await AutoReplyModel.findByIdAndUpdate(
      name,
      { $set: safeData },
      { upsert: true, new: true }
    ).lean();
  } catch (e) {
    console.error(`❌ autoReply MongoDB error:`, e.message);
    return null;
  }
}

async function deleteFromMongo(name) {
  if (!isMongoReady()) return false;
  try { await AutoReplyModel.findByIdAndDelete(name); return true; } catch { return false; }
}

// ========== API العامة ==========

async function getAllReplies() {
  // نجلب من JSON أولاً (المصدر الأساسي)
  const jsonData = readJSON();
  const jsonReplies = Object.values(jsonData);

  // ندمج مع MongoDB (إذا كان متصلاً)
  if (isMongoReady()) {
    try {
      const mongoData = await AutoReplyModel.find().lean();
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
    } catch (e) { console.error('❌ autoReply getAll MongoDB:', e.message); }
  }

  return jsonReplies;
}

async function getReply(name) {
  if (isMongoReady()) {
    try {
      const data = await AutoReplyModel.findById(name).lean();
      if (data) return data;
    } catch {}
  }
  return readJSON()[name] || null;
}

async function createReply(data) {
  const now = new Date();
  const doc = {
    _id: data.name, name: data.name,
    guildId: data.guildId || '',
    trigger: data.trigger, triggerType: data.triggerType || 'contains',
    responses: data.responses || [],
    randomReply: data.randomReply || false,
    sendStyle: data.sendStyle || 'reply_mention',
    autoDelete: data.autoDelete || false, autoDeleteTime: data.autoDeleteTime || 0,
    deleteUserMsg: data.deleteUserMsg || false,
    replyDelay: data.replyDelay || false, replyDelayTime: data.replyDelayTime || 0,
    roleWhitelist: data.roleWhitelist || [], roleBlacklist: data.roleBlacklist || [],
    channelWhitelist: data.channelWhitelist || [], channelBlacklist: data.channelBlacklist || [],
    channelId: data.channelId || null,
    ignoreBots: data.ignoreBots !== false, caseSensitive: data.caseSensitive || false,
    enabled: data.enabled !== false, useCount: 0,
    replyAsEmbed: data.replyAsEmbed || false,
    embedColor: data.embedColor || '#5865F2',
    randomColor: data.randomColor || false,
    createdAt: now, updatedAt: now
  };

  // 1. MongoDB
  let mongoResult = null;
  if (isMongoReady()) {
    mongoResult = await writeToMongo(data.name, doc);
    if (mongoResult) console.log(`✅ autoReply: "${data.name}" → MongoDB`);
    else console.log(`⚠️ autoReply: "${data.name}" → فشل MongoDB`);
  }

  // 2. JSON (دائماً)
  const json = readJSON();
  if (json[data.name]) {
    console.log(`⚠️ autoReply: "${data.name}" موجود مسبقاً في JSON`);
    return null;
  }
  json[data.name] = { ...doc, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  objToJson(json);
  console.log(`✅ autoReply: "${data.name}" → JSON`);

  return mongoResult || json[data.name];
}

async function updateReply(name, updates) {
  updates.updatedAt = new Date();

  // 1. MongoDB
  let mongoResult = null;
  if (isMongoReady()) mongoResult = await writeToMongo(name, updates);

  // 2. JSON
  const json = readJSON();
  if (json[name]) {
    json[name] = { ...json[name], ...updates, updatedAt: updates.updatedAt.toISOString() };
    objToJson(json);
  }
  return mongoResult || json[name] || null;
}

async function deleteReply(name) {
  if (isMongoReady()) await deleteFromMongo(name);
  const json = readJSON();
  if (json[name]) { delete json[name]; objToJson(json); }
  return true;
}

async function incrementUseCount(name) {
  const now = new Date();
  if (isMongoReady()) {
    try { await AutoReplyModel.findByIdAndUpdate(name, { $inc: { useCount: 1 }, $set: { updatedAt: now } }); } catch {}
  }
  const json = readJSON();
  if (json[name]) {
    json[name].useCount = (json[name].useCount || 0) + 1;
    json[name].updatedAt = now.toISOString();
    objToJson(json);
  }
}

async function getEnabledReplies() {
  const all = await getAllReplies();
  return all.filter(r => r.enabled !== false);
}

async function getRepliesList(guildId) {
  const all = await getAllReplies();
  const filtered = guildId ? all.filter(r => !r.guildId || r.guildId === guildId) : all;
  return filtered.map(r => ({
    name: r.name, trigger: r.trigger, triggerType: r.triggerType,
    responsesCount: (r.responses || []).length,
    sendStyle: r.sendStyle || 'reply_mention',
    enabled: r.enabled !== false, useCount: r.useCount || 0
  }));
}

module.exports = {
  initAutoReplyModel, syncJsonToMongo, loadRepliesFromMongo,
  getAllReplies, getReply, getRepliesList, getEnabledReplies,
  createReply, updateReply, deleteReply, incrementUseCount
};

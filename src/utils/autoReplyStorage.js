/**
 * autoReplyStorage.js - تخزين الردود التلقائية في MongoDB + JSON احتياطي
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
  trigger: { type: String, required: true },
  // contains = بحث ضمني (ON), exact = مطابقة تامة (OFF)
  triggerType: { type: String, default: 'contains' },
  // نصوص الرد المتعددة
  responses: { type: [String], default: [] },
  randomReply: { type: Boolean, default: false },
  // طريقة الإرسال
  sendStyle: { type: String, default: 'reply_mention' }, // reply_mention, reply_no_mention, normal
  // حذف رد البوت تلقائياً
  autoDelete: { type: Boolean, default: false },
  autoDeleteTime: { type: Number, default: 0 }, // milliseconds
  // حذف رسالة العضو
  deleteUserMsg: { type: Boolean, default: false },
  // تأخير الإرسال
  replyDelay: { type: Boolean, default: false },
  replyDelayTime: { type: Number, default: 0 }, // milliseconds
  // القوائم البيضاء والسوداء
  roleWhitelist: { type: [String], default: [] },
  roleBlacklist: { type: [String], default: [] },
  channelWhitelist: { type: [String], default: [] },
  channelBlacklist: { type: [String], default: [] },
  // الحقول القديمة للتوافق
  channelId: { type: String, default: null },
  ignoreBots: { type: Boolean, default: true },
  caseSensitive: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true },
  useCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'autoreplies', versionKey: false });

let AutoReplyModel;
let mongoReady = false;
let storageType = 'غير متصل';

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
  fs.writeFileSync(AUTOREPLY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ---------- التهيئة ----------

function initAutoReplyModel() {
  if (mongoose.connection.readyState === 1) {
    AutoReplyModel = mongoose.models.AutoReply || mongoose.model('AutoReply', autoReplySchema);
    mongoReady = true;
    storageType = '✅ MongoDB';
    console.log('📦 autoReplyStorage →', storageType);
    return true;
  }
  mongoReady = false;
  storageType = '⚠️ JSON (محلي)';
  console.log('📦 autoReplyStorage →', storageType);
  return false;
}

/** مزامنة JSON → MongoDB */
async function syncJsonToMongo() {
  if (!mongoReady) return;
  const json = readJSON();
  const names = Object.keys(json);
  if (names.length === 0) return;
  console.log(`🔄 مزامنة ${names.length} رد تلقائي من JSON إلى MongoDB...`);
  let synced = 0;
  for (const name of names) {
    try {
      await AutoReplyModel.findByIdAndUpdate(name, { $set: json[name] }, { upsert: true });
      synced++;
    } catch (e) {
      console.error(`❌ فشل مزامنة ${name}:`, e.message);
    }
  }
  console.log(`✅ تمت مزامنة ${synced}/${names.length} رد تلقائي`);
}

// ---------- MongoDB دوال ----------

async function mongoGetAll() {
  try { return await AutoReplyModel.find().lean(); } catch { return null; }
}

async function mongoGetById(name) {
  try { return await AutoReplyModel.findById(name).lean(); } catch { return null; }
}

async function mongoCreate(data) {
  try {
    const doc = new AutoReplyModel({
      _id: data.name, name: data.name,
      trigger: data.trigger, triggerType: data.triggerType || 'contains',
      responses: data.responses || [],
      randomReply: data.randomReply || false,
      sendStyle: data.sendStyle || 'reply_mention',
      autoDelete: data.autoDelete || false,
      autoDeleteTime: data.autoDeleteTime || 0,
      deleteUserMsg: data.deleteUserMsg || false,
      replyDelay: data.replyDelay || false,
      replyDelayTime: data.replyDelayTime || 0,
      roleWhitelist: data.roleWhitelist || [],
      roleBlacklist: data.roleBlacklist || [],
      channelWhitelist: data.channelWhitelist || [],
      channelBlacklist: data.channelBlacklist || [],
      channelId: data.channelId || null,
      ignoreBots: data.ignoreBots !== false,
      caseSensitive: data.caseSensitive || false,
      enabled: data.enabled !== false,
      useCount: 0,
      createdAt: new Date(), updatedAt: new Date()
    });
    await doc.save();
    return doc.toObject();
  } catch { return null; }
}

async function mongoUpdate(name, updates) {
  try {
    updates.updatedAt = new Date();
    return await AutoReplyModel.findByIdAndUpdate(name, { $set: updates }, { new: true }).lean();
  } catch { return null; }
}

async function mongoDelete(name) {
  try { await AutoReplyModel.findByIdAndDelete(name); return true; } catch { return false; }
}

async function mongoIncrementCount(name) {
  try {
    await AutoReplyModel.findByIdAndUpdate(name, { $inc: { useCount: 1 }, $set: { updatedAt: new Date() } });
  } catch {}
}

// ---------- API العامة ----------

async function getAllReplies() {
  if (mongoReady) {
    const data = await mongoGetAll();
    if (data) return data;
  }
  const json = readJSON();
  return Object.values(json);
}

async function getReply(name) {
  if (mongoReady) {
    const data = await mongoGetById(name);
    if (data) return data;
  }
  const json = readJSON();
  return json[name] || null;
}

async function createReply(data) {
  if (mongoReady) {
    const created = await mongoCreate(data);
    if (created) {
      console.log(`✅ autoReply: تم حفظ "${data.name}" في MongoDB`);
      return created;
    }
  }
  const json = readJSON();
  if (json[data.name]) return null;
  json[data.name] = {
    _id: data.name, name: data.name,
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
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  writeJSON(json);
  console.log(`⚠️ autoReply: تم حفظ "${data.name}" في JSON (مؤقت)`);
  return json[data.name];
}

async function updateReply(name, updates) {
  updates.updatedAt = new Date().toISOString();
  if (mongoReady) {
    const updated = await mongoUpdate(name, updates);
    if (updated) return updated;
  }
  const json = readJSON();
  if (!json[name]) return null;
  json[name] = { ...json[name], ...updates };
  writeJSON(json);
  return json[name];
}

async function deleteReply(name) {
  if (mongoReady) {
    const deleted = await mongoDelete(name);
    if (deleted) return true;
  }
  const json = readJSON();
  if (!json[name]) return false;
  delete json[name];
  writeJSON(json);
  return true;
}

async function incrementUseCount(name) {
  if (mongoReady) {
    await mongoIncrementCount(name);
    return;
  }
  const json = readJSON();
  if (json[name]) {
    json[name].useCount = (json[name].useCount || 0) + 1;
    json[name].updatedAt = new Date().toISOString();
    writeJSON(json);
  }
}

/** جلب جميع الردود المفعلة (للرسائل) */
async function getEnabledReplies() {
  const all = await getAllReplies();
  return all.filter(r => r.enabled !== false);
}

/** قائمة مختصرة */
async function getRepliesList() {
  const all = await getAllReplies();
  return all.map(r => ({
    name: r.name,
    trigger: r.trigger,
    triggerType: r.triggerType,
    responsesCount: (r.responses || []).length,
    sendStyle: r.sendStyle || 'reply_mention',
    enabled: r.enabled !== false,
    useCount: r.useCount || 0
  }));
}

module.exports = {
  initAutoReplyModel, syncJsonToMongo,
  getAllReplies, getReply, getRepliesList, getEnabledReplies,
  createReply, updateReply, deleteReply, incrementUseCount
};

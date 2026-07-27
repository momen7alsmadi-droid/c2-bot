/**
 * autoReplyStorage.js - تخزين ثنائي (MongoDB + JSON) لضمان عدم فقدان البيانات
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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'autoreplies', versionKey: false });

let AutoReplyModel;
let mongoReady = false;

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

/** تحميل كل البيانات من JSON إلى object */
function jsonToObj() {
  return readJSON();
}

/** حفظ object كامل إلى JSON */
function objToJson(obj) {
  writeJSON(obj);
}

// ---------- التهيئة ----------
function initAutoReplyModel() {
  if (mongoose.connection.readyState === 1) {
    AutoReplyModel = mongoose.models.AutoReply || mongoose.model('AutoReply', autoReplySchema);
    mongoReady = true;
    console.log('📦 autoReply → ✅ MongoDB');
    return true;
  }
  mongoReady = false;
  console.log('📦 autoReply → ⚠️ JSON فقط');
  return false;
}

async function syncJsonToMongo() {
  if (!mongoReady) return;
  const json = readJSON();
  const names = Object.keys(json);
  if (names.length === 0) {
    console.log('🔄 autoReply: JSON فاضي، لا يوجد شيء للمزامنة');
    return;
  }
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
  console.log(`✅ تمت مزامنة ${synced}/${names.length} رد`);
}

// ========== دوال الكتابة الثنائية (MongoDB + JSON) ==========

/** كتابة سجل في MongoDB (مع تحديث JSON) */
async function writeToMongo(name, data) {
  if (!mongoReady) return null;
  try {
    const result = await AutoReplyModel.findByIdAndUpdate(
      name,
      { $set: { ...data, updatedAt: new Date() } },
      { upsert: true, new: true }
    ).lean();
    return result;
  } catch (e) {
    console.error(`❌ autoReply MongoDB write error:`, e.message);
    return null;
  }
}

/** حذف من MongoDB */
async function deleteFromMongo(name) {
  if (!mongoReady) return false;
  try {
    await AutoReplyModel.findByIdAndDelete(name);
    return true;
  } catch { return false; }
}

// ========== API العامة مع Dual-Write ==========

async function getAllReplies() {
  // حاول من MongoDB أولاً
  if (mongoReady) {
    try {
      const data = await AutoReplyModel.find().lean();
      if (data && data.length > 0) {
        // حدّث JSON كنسخة احتياطية
        const jsonObj = {};
        for (const item of data) {
          jsonObj[item.name] = { ...item, _id: item.name };
        }
        objToJson(jsonObj);
        return data;
      }
    } catch {}
  }
  // ارجع للـ JSON
  const json = readJSON();
  return Object.values(json);
}

async function getReply(name) {
  // حاول من MongoDB
  if (mongoReady) {
    try {
      const data = await AutoReplyModel.findById(name).lean();
      if (data) return data;
    } catch {}
  }
  // ارجع للـ JSON
  const json = readJSON();
  return json[name] || null;
}

async function createReply(data) {
  const now = new Date();
  const doc = {
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
    createdAt: now, updatedAt: now
  };

  // 1. احفظ في MongoDB
  let mongoResult = null;
  if (mongoReady) {
    mongoResult = await writeToMongo(data.name, doc);
    if (mongoResult) {
      console.log(`✅ autoReply: "${data.name}" → MongoDB`);
    } else {
      console.log(`⚠️ autoReply: "${data.name}" → فشل MongoDB`);
    }
  }

  // 2. احفظ في JSON (دائماً)
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

  // 1. حدّث في MongoDB
  let mongoResult = null;
  if (mongoReady) {
    mongoResult = await writeToMongo(name, updates);
  }

  // 2. حدّث في JSON (دائماً)
  const json = readJSON();
  if (json[name]) {
    json[name] = { ...json[name], ...updates, updatedAt: updates.updatedAt.toISOString() };
    objToJson(json);
  }

  return mongoResult || json[name] || null;
}

async function deleteReply(name) {
  // 1. احذف من MongoDB
  let mongoOk = false;
  if (mongoReady) {
    mongoOk = await deleteFromMongo(name);
  }

  // 2. احذف من JSON (دائماً)
  const json = readJSON();
  if (json[name]) {
    delete json[name];
    objToJson(json);
  }

  return mongoOk || true;
}

async function incrementUseCount(name) {
  // MongoDB
  if (mongoReady) {
    try {
      await AutoReplyModel.findByIdAndUpdate(name, { $inc: { useCount: 1 }, $set: { updatedAt: new Date() } });
    } catch {}
  }
  // JSON
  const json = readJSON();
  if (json[name]) {
    json[name].useCount = (json[name].useCount || 0) + 1;
    json[name].updatedAt = new Date().toISOString();
    objToJson(json);
  }
}

async function getEnabledReplies() {
  const all = await getAllReplies();
  return all.filter(r => r.enabled !== false);
}

async function getRepliesList() {
  const all = await getAllReplies();
  return all.map(r => ({
    name: r.name, trigger: r.trigger, triggerType: r.triggerType,
    responsesCount: (r.responses || []).length,
    sendStyle: r.sendStyle || 'reply_mention',
    enabled: r.enabled !== false, useCount: r.useCount || 0
  }));
}

module.exports = {
  initAutoReplyModel, syncJsonToMongo,
  getAllReplies, getReply, getRepliesList, getEnabledReplies,
  createReply, updateReply, deleteReply, incrementUseCount
};

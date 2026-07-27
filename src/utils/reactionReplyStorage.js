/**
 * reactionReplyStorage.js - تخزين الردود بالتفاعلات (رياكشن) في MongoDB + JSON احتياطي
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const REACT_PATH = path.join(DATA_DIR, 'reactions.json');

// ---------- MongoDB Schema ----------
const reactSchema = new mongoose.Schema({
  _id: String,
  name: { type: String, required: true },
  trigger: { type: String, required: true },
  triggerType: { type: String, default: 'contains' },
  emoji: { type: String, required: true },
  channelId: { type: String, default: null },
  roleWhitelist: { type: [String], default: [] },
  roleBlacklist: { type: [String], default: [] },
  channelWhitelist: { type: [String], default: [] },
  channelBlacklist: { type: [String], default: [] },
  ignoreBots: { type: Boolean, default: true },
  caseSensitive: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true },
  useCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'reactions', versionKey: false });

let ReactModel;
let mongoReady = false;
let storageType = 'غير متصل';

// ---------- JSON helpers ----------

function readJSON() {
  try {
    if (!fs.existsSync(REACT_PATH)) return {};
    const raw = fs.readFileSync(REACT_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('❌ reactionReply readJSON:', e.message);
    return {};
  }
}

function writeJSON(data) {
  fs.writeFileSync(REACT_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ---------- التهيئة ----------

function initReactModel() {
  if (mongoose.connection.readyState === 1) {
    ReactModel = mongoose.models.ReactReply || mongoose.model('ReactReply', reactSchema);
    mongoReady = true;
    storageType = '✅ MongoDB';
    console.log('📦 reactionReplyStorage →', storageType);
    return true;
  }
  mongoReady = false;
  storageType = '⚠️ JSON (محلي)';
  console.log('📦 reactionReplyStorage →', storageType);
  return false;
}

async function syncJsonToMongo() {
  if (!mongoReady) return;
  const json = readJSON();
  const names = Object.keys(json);
  if (names.length === 0) return;
  console.log(`🔄 مزامنة ${names.length} رد تفاعل من JSON إلى MongoDB...`);
  let synced = 0;
  for (const name of names) {
    try {
      await ReactModel.findByIdAndUpdate(name, { $set: json[name] }, { upsert: true });
      synced++;
    } catch (e) {
      console.error(`❌ فشل مزامنة ${name}:`, e.message);
    }
  }
  console.log(`✅ تمت مزامنة ${synced}/${names.length} رد تفاعل`);
}

// ---------- MongoDB دوال ----------

async function mongoGetAll() {
  try { return await ReactModel.find().lean(); } catch { return null; }
}

async function mongoGetById(name) {
  try { return await ReactModel.findById(name).lean(); } catch { return null; }
}

async function mongoCreate(data) {
  try {
    const doc = new ReactModel({
      _id: data.name, name: data.name,
      trigger: data.trigger, triggerType: data.triggerType || 'contains',
      emoji: data.emoji,
      channelId: data.channelId || null,
      roleWhitelist: data.roleWhitelist || [],
      roleBlacklist: data.roleBlacklist || [],
      channelWhitelist: data.channelWhitelist || [],
      channelBlacklist: data.channelBlacklist || [],
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
    return await ReactModel.findByIdAndUpdate(name, { $set: updates }, { new: true }).lean();
  } catch { return null; }
}

async function mongoDelete(name) {
  try { await ReactModel.findByIdAndDelete(name); return true; } catch { return false; }
}

async function mongoIncrementCount(name) {
  try { await ReactModel.findByIdAndUpdate(name, { $inc: { useCount: 1 }, $set: { updatedAt: new Date() } }); } catch {}
}

// ---------- API العامة ----------

async function getAllReacts() {
  if (mongoReady) {
    const data = await mongoGetAll();
    if (data) return data;
  }
  return Object.values(readJSON());
}

async function getReact(name) {
  if (mongoReady) {
    const data = await mongoGetById(name);
    if (data) return data;
  }
  const json = readJSON();
  return json[name] || null;
}

async function createReact(data) {
  if (mongoReady) {
    const created = await mongoCreate(data);
    if (created) { console.log(`✅ reaction: تم حفظ "${data.name}" في MongoDB`); return created; }
  }
  const json = readJSON();
  if (json[data.name]) return null;
  json[data.name] = {
    _id: data.name, name: data.name,
    trigger: data.trigger, triggerType: data.triggerType || 'contains',
    emoji: data.emoji, channelId: data.channelId || null,
    roleWhitelist: data.roleWhitelist || [], roleBlacklist: data.roleBlacklist || [],
    channelWhitelist: data.channelWhitelist || [], channelBlacklist: data.channelBlacklist || [],
    ignoreBots: data.ignoreBots !== false, caseSensitive: data.caseSensitive || false,
    enabled: data.enabled !== false, useCount: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  writeJSON(json);
  return json[data.name];
}

async function updateReact(name, updates) {
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

async function deleteReact(name) {
  if (mongoReady) { const d = await mongoDelete(name); if (d) return true; }
  const json = readJSON();
  if (!json[name]) return false;
  delete json[name];
  writeJSON(json);
  return true;
}

async function incrementReactCount(name) {
  if (mongoReady) { await mongoIncrementCount(name); return; }
  const json = readJSON();
  if (json[name]) {
    json[name].useCount = (json[name].useCount || 0) + 1;
    json[name].updatedAt = new Date().toISOString();
    writeJSON(json);
  }
}

async function getEnabledReacts() {
  const all = await getAllReacts();
  return all.filter(r => r.enabled !== false);
}

async function getReactsList() {
  const all = await getAllReacts();
  return all.map(r => ({
    name: r.name, trigger: r.trigger,
    triggerType: r.triggerType, emoji: r.emoji,
    enabled: r.enabled !== false, useCount: r.useCount || 0
  }));
}

module.exports = {
  initReactModel, syncJsonToMongo,
  getAllReacts, getReact, getReactsList, getEnabledReacts,
  createReact, updateReact, deleteReact, incrementReactCount
};

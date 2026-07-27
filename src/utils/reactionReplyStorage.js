/**
 * reactionReplyStorage.js - تخزين ثنائي ديناميكي (MongoDB + JSON)
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
  emoji: { type: String, default: '' },
  emojis: { type: [String], default: [] },
  randomReact: { type: Boolean, default: false },
  multipleReact: { type: Boolean, default: false },
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

// ---------- JSON helpers ----------
function readJSON() {
  try {
    if (!fs.existsSync(REACT_PATH)) return {};
    const raw = fs.readFileSync(REACT_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) { console.error('❌ reaction readJSON:', e.message); return {}; }
}

function writeJSON(data) {
  try { fs.writeFileSync(REACT_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch (e) { console.error('❌ reaction writeJSON:', e.message); }
}

function objToJson(obj) { writeJSON(obj); }

// ---------- التحقق الديناميكي ----------
function isMongoReady() {
  if (mongoose.connection.readyState !== 1) return false;
  if (ReactModel) return true;
  try { ReactModel = mongoose.models.ReactReply || mongoose.model('ReactReply', reactSchema); return true; } catch { return false; }
}

function initReactModel() {
  if (isMongoReady()) { console.log('📦 reactions → ✅ MongoDB'); return true; }
  console.log('📦 reactions → ⚠️ JSON فقط'); return false;
}

async function syncJsonToMongo() {
  if (!isMongoReady()) return;
  const json = readJSON();
  const names = Object.keys(json);
  if (names.length === 0) { console.log('🔄 reactions: JSON فاضي'); return; }
  console.log(`🔄 مزامنة ${names.length} تفاعل من JSON إلى MongoDB...`);
  let synced = 0;
  for (const name of names) {
    try { await ReactModel.findByIdAndUpdate(name, { $set: json[name] }, { upsert: true }); synced++; } catch (e) { console.error(`❌ فشل مزامنة ${name}:`, e.message); }
  }
  console.log(`✅ تمت مزامنة ${synced}/${names.length} تفاعل`);
}

// ========== مساعدة ==========

async function writeToMongo(name, data) {
  if (!isMongoReady()) return null;
  try { return await ReactModel.findByIdAndUpdate(name, { $set: { ...data, updatedAt: new Date() } }, { upsert: true, new: true }).lean(); } catch (e) { console.error(`❌ reaction MongoDB error:`, e.message); return null; }
}

async function deleteFromMongo(name) {
  if (!isMongoReady()) return false;
  try { await ReactModel.findByIdAndDelete(name); return true; } catch { return false; }
}

// ========== API ==========

async function getAllReacts() {
  if (isMongoReady()) {
    try {
      const data = await ReactModel.find().lean();
      if (data && data.length > 0) {
        const jsonObj = {};
        for (const item of data) jsonObj[item.name] = { ...item, _id: item.name };
        objToJson(jsonObj);
        return data;
      }
    } catch (e) { console.error('❌ reaction getAll MongoDB:', e.message); }
  }
  return Object.values(readJSON());
}

async function getReact(name) {
  if (isMongoReady()) {
    try { const data = await ReactModel.findById(name).lean(); if (data) return data; } catch {}
  }
  return readJSON()[name] || null;
}

async function createReact(data) {
  const emojis = data.emojis && data.emojis.length > 0 ? data.emojis : (data.emoji ? [data.emoji] : []);
  const now = new Date();
  const doc = {
    _id: data.name, name: data.name,
    trigger: data.trigger, triggerType: data.triggerType || 'contains',
    emoji: emojis[0] || '', emojis: emojis,
    randomReact: data.randomReact || false, multipleReact: data.multipleReact || false,
    channelId: data.channelId || null,
    roleWhitelist: data.roleWhitelist || [], roleBlacklist: data.roleBlacklist || [],
    channelWhitelist: data.channelWhitelist || [], channelBlacklist: data.channelBlacklist || [],
    ignoreBots: data.ignoreBots !== false, caseSensitive: data.caseSensitive || false,
    enabled: data.enabled !== false, useCount: 0,
    createdAt: now, updatedAt: now
  };

  let mongoResult = null;
  if (isMongoReady()) {
    mongoResult = await writeToMongo(data.name, doc);
    if (mongoResult) console.log(`✅ reaction: "${data.name}" → MongoDB`);
    else console.log(`⚠️ reaction: "${data.name}" → فشل MongoDB`);
  }

  const json = readJSON();
  if (json[data.name]) return null;
  json[data.name] = { ...doc, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  objToJson(json);
  console.log(`✅ reaction: "${data.name}" → JSON`);

  return mongoResult || json[data.name];
}

async function updateReact(name, updates) {
  updates.updatedAt = new Date();
  let mongoResult = null;
  if (isMongoReady()) mongoResult = await writeToMongo(name, updates);
  const json = readJSON();
  if (json[name]) { json[name] = { ...json[name], ...updates, updatedAt: updates.updatedAt.toISOString() }; objToJson(json); }
  return mongoResult || json[name] || null;
}

async function deleteReact(name) {
  if (isMongoReady()) await deleteFromMongo(name);
  const json = readJSON();
  if (json[name]) { delete json[name]; objToJson(json); }
  return true;
}

async function incrementReactCount(name) {
  const now = new Date();
  if (isMongoReady()) { try { await ReactModel.findByIdAndUpdate(name, { $inc: { useCount: 1 }, $set: { updatedAt: now } }); } catch {} }
  const json = readJSON();
  if (json[name]) { json[name].useCount = (json[name].useCount || 0) + 1; json[name].updatedAt = now.toISOString(); objToJson(json); }
}

async function getEnabledReacts() {
  const all = await getAllReacts();
  return all.filter(r => r.enabled !== false);
}

async function getReactsList() {
  const all = await getAllReacts();
  return all.map(r => ({
    name: r.name, trigger: r.trigger, triggerType: r.triggerType,
    emoji: r.emoji || ((r.emojis||[])[0] || ''),
    emojisCount: (r.emojis||[]).length,
    randomReact: r.randomReact || false, multipleReact: r.multipleReact || false,
    enabled: r.enabled !== false, useCount: r.useCount || 0
  }));
}

module.exports = {
  initReactModel, syncJsonToMongo,
  getAllReacts, getReact, getReactsList, getEnabledReacts,
  createReact, updateReact, deleteReact, incrementReactCount
};

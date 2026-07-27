/**
 * embedStorage.js - تخزين ثنائي ديناميكي (MongoDB + JSON)
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const EMBEDS_PATH = path.join(DATA_DIR, 'embeds.json');

// ---------- MongoDB Schema ----------
const embedSchema = new mongoose.Schema({
  _id: String,
  name: { type: String, required: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  color: { type: String, default: '#5865F2' },
  footer: { type: String, default: '' },
  image: { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  author: { type: String, default: '' },
  fields: { type: [String], default: ['', '', '', '', '', '', '', '', '', ''] },
  timestamp: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'embeds', versionKey: false });

let EmbedModel;

// ---------- JSON helpers ----------
function readJSON() {
  try {
    if (!fs.existsSync(EMBEDS_PATH)) return {};
    const raw = fs.readFileSync(EMBEDS_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) { console.error('❌ embedStorage readJSON:', e.message); return {}; }
}

function writeJSON(data) {
  try { fs.writeFileSync(EMBEDS_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch (e) { console.error('❌ embedStorage writeJSON:', e.message); }
}

function objToJson(obj) { writeJSON(obj); }

// ---------- التحقق الديناميكي ----------
function isMongoReady() {
  if (mongoose.connection.readyState !== 1) return false;
  if (EmbedModel) return true;
  try { EmbedModel = mongoose.models.Embed || mongoose.model('Embed', embedSchema); return true; } catch { return false; }
}

function initEmbedModel() {
  if (isMongoReady()) { console.log('📦 embeds → ✅ MongoDB'); return true; }
  console.log('📦 embeds → ⚠️ JSON فقط'); return false;
}

async function syncJsonToMongo() {
  if (!isMongoReady()) return;
  const json = readJSON();
  const names = Object.keys(json);
  if (names.length === 0) { console.log('🔄 embeds: JSON فاضي'); return; }
  console.log(`🔄 مزامنة ${names.length} إيمبد من JSON إلى MongoDB...`);
  let synced = 0;
  for (const name of names) {
    try { await EmbedModel.findByIdAndUpdate(name, { $set: json[name] }, { upsert: true }); synced++; } catch (e) { console.error(`❌ فشل مزامنة ${name}:`, e.message); }
  }
  console.log(`✅ تمت مزامنة ${synced}/${names.length} إيمبد`);
}

// ========== مساعدة ==========

async function writeToMongo(name, data) {
  if (!isMongoReady()) return null;
  try { return await EmbedModel.findByIdAndUpdate(name, { $set: { ...data, updatedAt: new Date() } }, { upsert: true, new: true }).lean(); } catch (e) { console.error(`❌ embed MongoDB error:`, e.message); return null; }
}

async function deleteFromMongo(name) {
  if (!isMongoReady()) return false;
  try { await EmbedModel.findByIdAndDelete(name); return true; } catch { return false; }
}

// ========== API ==========

async function getAllEmbeds() {
  if (isMongoReady()) {
    try {
      const data = await EmbedModel.find().lean();
      if (data && data.length > 0) {
        const jsonObj = {};
        for (const item of data) jsonObj[item.name || item._id] = { ...item, _id: item.name || item._id };
        objToJson(jsonObj);
        return data;
      }
    } catch (e) { console.error('❌ embed getAll MongoDB:', e.message); }
  }
  return Object.values(readJSON());
}

async function getEmbed(name) {
  if (isMongoReady()) {
    try { const data = await EmbedModel.findById(name).lean(); if (data) return data; } catch {}
  }
  return readJSON()[name] || null;
}

async function createEmbed(name, data) {
  const now = new Date();
  const doc = {
    _id: name, name,
    title: data.title || '', description: data.description || '',
    color: data.color || '#5865F2', footer: data.footer || '',
    image: data.image || '', thumbnail: data.thumbnail || '',
    author: data.author || '',
    fields: data.fields || ['','','','','','','','','',''],
    timestamp: data.timestamp || false,
    createdAt: now, updatedAt: now
  };

  let mongoResult = null;
  if (isMongoReady()) {
    mongoResult = await writeToMongo(name, doc);
    if (mongoResult) console.log(`✅ embed: "${name}" → MongoDB`);
    else console.log(`⚠️ embed: "${name}" → فشل MongoDB`);
  }

  const json = readJSON();
  if (json[name]) { console.log(`⚠️ embed: "${name}" موجود مسبقاً`); return null; }
  json[name] = { ...doc, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  objToJson(json);
  console.log(`✅ embed: "${name}" → JSON`);

  return mongoResult || json[name];
}

async function updateEmbed(name, updates) {
  updates.updatedAt = new Date();
  let mongoResult = null;
  if (isMongoReady()) mongoResult = await writeToMongo(name, updates);
  const json = readJSON();
  if (json[name]) { json[name] = { ...json[name], ...updates, updatedAt: updates.updatedAt.toISOString() }; objToJson(json); }
  return mongoResult || json[name] || null;
}

async function deleteEmbed(name) {
  if (isMongoReady()) await deleteFromMongo(name);
  const json = readJSON();
  if (json[name]) { delete json[name]; objToJson(json); }
  return true;
}

async function getEmbedsList() {
  const all = await getAllEmbeds();
  return all.map(r => ({ name: r.name || r._id, title: (r.title || '').slice(0, 50), color: r.color || '#5865F2' }));
}

module.exports = {
  initEmbedModel, syncJsonToMongo,
  getAllEmbeds, getEmbed, getEmbedsList,
  createEmbed, updateEmbed, deleteEmbed
};

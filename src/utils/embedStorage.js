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
  try {
    // نزيل _id من البيانات لأن MongoDB لا يسمح بتعديل _id عبر $set
    const { _id, ...safeData } = data || {};
    safeData.updatedAt = new Date();
    return await EmbedModel.findByIdAndUpdate(name, { $set: safeData }, { upsert: true, new: true }).lean();
  } catch (e) { console.error(`❌ embed MongoDB error:`, e.message); return null; }
}

async function deleteFromMongo(name) {
  if (!isMongoReady()) return false;
  try { await EmbedModel.findByIdAndDelete(name); return true; } catch { return false; }
}

// ========== API ==========

async function getAllEmbeds() {
  // نجلب من JSON أولاً (المصدر الأساسي)
  const jsonData = readJSON();
  const jsonEmbeds = Object.values(jsonData);

  // ندمج مع MongoDB (إذا كان متصلاً)
  if (isMongoReady()) {
    try {
      const mongoData = await EmbedModel.find().lean();
      if (mongoData && mongoData.length > 0) {
        // ندمج: كل إيمبد في MongoDB يضاف أو يحدّث في jsonData
        for (const item of mongoData) {
          const key = item.name || item._id;
          if (key) {
            jsonData[key] = { ...(jsonData[key] || {}), ...item, _id: key };
          }
        }
        // نحدّث ملف JSON بالبيانات المدمجة
        objToJson(jsonData);
        return Object.values(jsonData);
      }
    } catch (e) { console.error('❌ embed getAll MongoDB:', e.message); }
  }

  return jsonEmbeds;
}

async function getEmbed(name) {
  if (!name) return null;
  if (isMongoReady()) {
    try {
      const data = await EmbedModel.findById(name).lean();
      if (data) {
        // التأكد من أن البيانات تحتوي على الخصائص الأساسية
        if (!data.title) data.title = '';
        if (!data.color) data.color = '#5865F2';
        if (!Array.isArray(data.fields)) data.fields = [];
        if (!data.footer) data.footer = {};
        if (typeof data.footer === 'string') data.footer = { text: data.footer };
        return data;
      }
    } catch {}
  }
  const raw = readJSON()[name] || null;
  if (raw) {
    if (!raw.title) raw.title = '';
    if (!raw.color) raw.color = '#5865F2';
    if (!Array.isArray(raw.fields)) raw.fields = [];
    if (!raw.footer) raw.footer = {};
    if (typeof raw.footer === 'string') raw.footer = { text: raw.footer };
  }
  return raw;
}

async function createEmbed(name, data) {
  if (!name || typeof name !== 'string') {
    console.error('❌ createEmbed: name مطلوب وهو سلسلة نصية', { name, data });
    return null;
  }
  const safeData = data || {};
  const now = new Date();
  const doc = {
    _id: name, name,
    title: (safeData.title || '') + '',
    description: (safeData.description || '') + '',
    color: (safeData.color || '#5865F2') + '',
    footer: safeData.footer || '',
    image: safeData.image || '',
    thumbnail: safeData.thumbnail || '',
    author: safeData.author || '',
    fields: Array.isArray(safeData.fields) ? safeData.fields : ['','','','','','','','','',''],
    timestamp: safeData.timestamp || false,
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
  if (!Array.isArray(all)) return [];
  return all
    .filter(r => r && typeof r === 'object')
    .map(r => ({
      name: (r.name || r._id || 'بدون اسم').toString(),
      title: ((r.title || '') + '').slice(0, 50),
      color: (r.color || '#5865F2') + ''
    }));
}

module.exports = {
  initEmbedModel, syncJsonToMongo,
  getAllEmbeds, getEmbed, getEmbedsList,
  createEmbed, updateEmbed, deleteEmbed
};

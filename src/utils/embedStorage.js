/**
 * embedStorage.js - تخزين قوالب الإيمبدات
 * يدعم MongoDB بشكل أساسي + JSON كنسخة احتياطية
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
  fields: [{ name: String, value: String, inline: { type: Boolean, default: false } }],
  footer: {
    text: { type: String, default: '' },
    iconURL: { type: String, default: '' }
  },
  thumbnail: { type: String, default: '' },
  image: { type: String, default: '' },
  author: {
    name: { type: String, default: '' },
    iconURL: { type: String, default: '' }
  },
  timestamp: { type: Boolean, default: true },
  showSender: { type: Boolean, default: false },
  sendCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'embeds', versionKey: false });

let EmbedModel;
let useMongo = false;

// ---------- JSON helpers ----------

function readJSON() {
  try {
    if (!fs.existsSync(EMBEDS_PATH)) return {};
    const raw = fs.readFileSync(EMBEDS_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('❌ embedStorage readJSON error:', e.message);
    return {};
  }
}

function writeJSON(data) {
  fs.writeFileSync(EMBEDS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ---------- التهيئة ----------

function initEmbedModel() {
  if (mongoose.connection.readyState === 1) {
    EmbedModel = mongoose.models.Embed || mongoose.model('Embed', embedSchema);
    useMongo = true;
    return true;
  }
  useMongo = false;
  return false;
}

// ---------- دوال المساعدة (MongoDB → JSON) ----------

async function mongoGetAll() {
  try {
    return await EmbedModel.find().lean();
  } catch { return null; }
}

async function mongoGetById(name) {
  try {
    return await EmbedModel.findById(name).lean();
  } catch { return null; }
}

async function mongoCreate(data) {
  try {
    const doc = new EmbedModel({
      _id: data.name,
      name: data.name,
      title: data.title || '',
      description: data.description || '',
      color: data.color || '#5865F2',
      fields: data.fields || [],
      footer: data.footer || { text: '', iconURL: '' },
      thumbnail: data.thumbnail || '',
      image: data.image || '',
      author: data.author || { name: '', iconURL: '' },
      timestamp: data.timestamp !== undefined ? data.timestamp : true,
      showSender: data.showSender || false,
      sendCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await doc.save();
    return doc.toObject();
  } catch { return null; }
}

async function mongoUpdate(name, updates) {
  try {
    updates.updatedAt = new Date();
    return await EmbedModel.findByIdAndUpdate(name, { $set: updates }, { new: true }).lean();
  } catch { return null; }
}

async function mongoDelete(name) {
  try {
    await EmbedModel.findByIdAndDelete(name);
    return true;
  } catch { return false; }
}

async function mongoIncrementCount(name) {
  try {
    await EmbedModel.findByIdAndUpdate(name, { $inc: { sendCount: 1 }, $set: { updatedAt: new Date() } });
  } catch {}
}

// ---------- API العامة ----------

/** جلب جميع الإيمبدات */
async function getAllEmbeds() {
  if (useMongo) {
    const data = await mongoGetAll();
    if (data) return data;
  }
  // JSON fallback
  const json = readJSON();
  return Object.values(json);
}

/** جلب إيمبد واحد */
async function getEmbed(name) {
  if (useMongo) {
    const data = await mongoGetById(name);
    if (data) return data;
  }
  // JSON fallback
  const json = readJSON();
  return json[name] || null;
}

/** إنشاء إيمبد جديد */
async function createEmbed(data) {
  if (useMongo) {
    const created = await mongoCreate(data);
    if (created) return created;
    // إذا فشل MongoDB → جرب JSON
  }
  // JSON fallback
  const json = readJSON();
  if (json[data.name]) return null; // مكرر
  const newEmbed = {
    _id: data.name,
    name: data.name,
    title: data.title || '',
    description: data.description || '',
    color: data.color || '#5865F2',
    fields: data.fields || [],
    footer: data.footer || { text: '', iconURL: '' },
    thumbnail: data.thumbnail || '',
    image: data.image || '',
    author: data.author || { name: '', iconURL: '' },
    timestamp: data.timestamp !== undefined ? data.timestamp : true,
    showSender: data.showSender || false,
    sendCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  json[data.name] = newEmbed;
  writeJSON(json);
  return newEmbed;
}

/** تحديث إيمبد */
async function updateEmbed(name, updates) {
  updates.updatedAt = new Date().toISOString();
  if (useMongo) {
    const updated = await mongoUpdate(name, updates);
    if (updated) return updated;
  }
  // JSON fallback
  const json = readJSON();
  if (!json[name]) return null;
  json[name] = { ...json[name], ...updates };
  writeJSON(json);
  return json[name];
}

/** حذف إيمبد */
async function deleteEmbed(name) {
  if (useMongo) {
    const deleted = await mongoDelete(name);
    if (deleted) return true;
  }
  // JSON fallback
  const json = readJSON();
  if (!json[name]) return false;
  delete json[name];
  writeJSON(json);
  return true;
}

/** زيادة عداد الإرسال */
async function incrementSendCount(name) {
  if (useMongo) {
    await mongoIncrementCount(name);
    return;
  }
  // JSON fallback
  const json = readJSON();
  if (json[name]) {
    json[name].sendCount = (json[name].sendCount || 0) + 1;
    json[name].updatedAt = new Date().toISOString();
    writeJSON(json);
  }
}

/** جلب قائمة مختصرة للقوائم المنسدلة */
async function getEmbedsList() {
  const embeds = await getAllEmbeds();
  return embeds.map(e => ({
    name: e.name,
    title: e.title || '(بدون عنوان)',
    color: e.color,
    sendCount: e.sendCount || 0
  }));
}

module.exports = {
  initEmbedModel,
  getAllEmbeds,
  getEmbed,
  createEmbed,
  updateEmbed,
  deleteEmbed,
  incrementSendCount,
  getEmbedsList,
  useMongo: () => useMongo
};

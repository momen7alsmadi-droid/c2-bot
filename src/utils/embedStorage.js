/**
 * embedStorage.js - تخزين قوالب الإيمبدات في MongoDB فقط
 */
const mongoose = require('mongoose');

// ---------- MongoDB Schema ----------
const embedSchema = new mongoose.Schema({
  _id: String, // الاسم الداخلي (unique key)
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

/** تهيئة الموديل (يُستدعى بعد الاتصال بقاعدة البيانات) */
function initEmbedModel() {
  if (mongoose.connection.readyState === 1) {
    EmbedModel = mongoose.models.Embed || mongoose.model('Embed', embedSchema);
    return true;
  }
  return false;
}

/** جلب جميع الإيمبدات */
async function getAllEmbeds() {
  if (!EmbedModel) return [];
  try {
    return await EmbedModel.find().lean();
  } catch (e) {
    console.error('❌ getAllEmbeds error:', e.message);
    return [];
  }
}

/** جلب إيمبد واحد بالاسم الداخلي */
async function getEmbed(name) {
  if (!EmbedModel) return null;
  try {
    return await EmbedModel.findById(name).lean();
  } catch (e) {
    console.error('❌ getEmbed error:', e.message);
    return null;
  }
}

/** إنشاء إيمبد جديد */
async function createEmbed(data) {
  if (!EmbedModel) return null;
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
  } catch (e) {
    console.error('❌ createEmbed error:', e.message);
    return null;
  }
}

/** تحديث إيمبد (تدمج الحقول الجديدة مع القديمة) */
async function updateEmbed(name, updates) {
  if (!EmbedModel) return null;
  try {
    updates.updatedAt = new Date();
    const doc = await EmbedModel.findByIdAndUpdate(
      name,
      { $set: updates },
      { new: true, upsert: false }
    ).lean();
    return doc;
  } catch (e) {
    console.error('❌ updateEmbed error:', e.message);
    return null;
  }
}

/** زيادة عداد الإرسال */
async function incrementSendCount(name) {
  if (!EmbedModel) return;
  try {
    await EmbedModel.findByIdAndUpdate(name, { $inc: { sendCount: 1 }, $set: { updatedAt: new Date() } });
  } catch (e) {
    console.error('❌ incrementSendCount error:', e.message);
  }
}

/** حذف إيمبد */
async function deleteEmbed(name) {
  if (!EmbedModel) return false;
  try {
    await EmbedModel.findByIdAndDelete(name);
    return true;
  } catch (e) {
    console.error('❌ deleteEmbed error:', e.message);
    return false;
  }
}

/** جلب قائمة مختصرة (للقوائم المنسدلة) */
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
  getEmbedsList
};

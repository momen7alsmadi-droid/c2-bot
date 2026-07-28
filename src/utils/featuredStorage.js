/**
 * featuredStorage.js - تخزين نظام الاقتراحات المميزة (MongoDB + JSON مع Fallback آمن)
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FEATURED_CONFIG_PATH = path.join(DATA_DIR, 'featured-config.json');
const FEATURED_POSTS_PATH = path.join(DATA_DIR, 'featured-posts.json');

// ---------- القيم الافتراضية ----------
const DEFAULT_FEATURED_CONFIG = {
  sourceChannelId: null,
  destChannelId: null,
  emoji: '⭐',
  threshold: 5
};

// ---------- MongoDB Schema ----------
const featuredConfigSchema = new mongoose.Schema({
  _id: String,
  data: mongoose.Schema.Types.Mixed
}, { collection: 'featured_config', versionKey: false });

const featuredPostSchema = new mongoose.Schema({
  _id: String,
  data: mongoose.Schema.Types.Mixed
}, { collection: 'featured_posts', versionKey: false });

let FeaturedConfigModel, FeaturedPostModel;

function isMongoReady() {
  if (mongoose.connection.readyState !== 1) return false;
  if (!FeaturedConfigModel || !FeaturedPostModel) {
    try {
      FeaturedConfigModel = mongoose.models.FeaturedConfig || mongoose.model('FeaturedConfig', featuredConfigSchema);
      FeaturedPostModel = mongoose.models.FeaturedPost || mongoose.model('FeaturedPost', featuredPostSchema);
    } catch { return false; }
  }
  return true;
}

function initFeaturedModels() {
  if (isMongoReady()) { console.log('📦 featured → ✅ MongoDB'); return true; }
  console.log('📦 featured → ⚠️ JSON فقط'); return false;
}

// ========== JSON helpers ==========
function readJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('❌ featuredStorage readJSON فشل:', filePath, e.message);
    return fallback;
  }
}

function writeJSON(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ featuredStorage writeJSON فشل:', filePath, e.message);
  }
}

// ========== الإعدادات ==========

/**
 * تجلب الإعدادات من JSON.
 * إذا الملف غير موجود أو تالف، تحاول من MongoDB.
 * إذا MongoDB فاضي، ترجع القيم الافتراضية.
 */
function getFeaturedConfig() {
  // 1. حاول من JSON
  const jsonData = readJSON(FEATURED_CONFIG_PATH, null);
  if (jsonData && typeof jsonData === 'object' && jsonData.sourceChannelId !== undefined) {
    return jsonData;
  }

  // 2. JSON غير موجود/تالف → حاول من MongoDB بشكل متزامن (إذا جاهز)
  // (لأن هذه الدالة تُستدعى من messageCreate وهو غير متزامن،
  //  لكن getFeaturedConfig مزامنة. سنحاول MongoDB عبر sync)
  // نرجع افتراضي ونترك ensureFeaturedConfigLoaded يعالج الباقي
  console.warn('⚠️ featured-config.json غير موجود/تالف، نرجع القيم الافتراضية');
  return { ...DEFAULT_FEATURED_CONFIG };
}

function saveFeaturedConfig(cfg) {
  // حفظ في JSON أولاً
  writeJSON(FEATURED_CONFIG_PATH, cfg);
  // حفظ في MongoDB (غير متزامن)
  if (isMongoReady()) {
    FeaturedConfigModel.findByIdAndUpdate('main', { data: cfg }, { upsert: true })
      .then(() => console.log('📦 featuredConfig → MongoDB ✅'))
      .catch(e => console.error('❌ featuredConfig MongoDB save error:', e.message));
  } else {
    console.warn('⚠️ featuredConfig → MongoDB غير متصل (حفظ في JSON فقط)');
  }
}

/**
 * تحميل الإعدادات من MongoDB إلى JSON (في بداية التشغيل).
 */
async function ensureFeaturedConfigLoaded() {
  if (!isMongoReady()) {
    console.log('⚠️ ensureFeaturedConfigLoaded: MongoDB غير جاهز');
    return;
  }

  // حاول تحميل من MongoDB
  try {
    const mDoc = await FeaturedConfigModel.findById('main').lean();
    if (mDoc && mDoc.data && typeof mDoc.data === 'object') {
      writeJSON(FEATURED_CONFIG_PATH, mDoc.data);
      console.log('📦 featuredConfig → تم التحميل من MongoDB:', JSON.stringify(mDoc.data));
      return;
    }
  } catch (e) {
    console.error('❌ ensureFeaturedConfigLoaded MongoDB read error:', e.message);
  }

  // إذا JSON موجود سليم، ادفعه إلى MongoDB
  const jsonData = readJSON(FEATURED_CONFIG_PATH, null);
  if (jsonData && typeof jsonData === 'object' && jsonData.sourceChannelId !== undefined) {
    try {
      await FeaturedConfigModel.findByIdAndUpdate('main', { data: jsonData }, { upsert: true });
      console.log('📦 featuredConfig → تم الدفع إلى MongoDB من JSON');
    } catch (e) {
      console.error('❌ ensureFeaturedConfigLoaded MongoDB write error:', e.message);
    }
  }
}

// ========== المنشورات المتعقبة ==========

function getFeaturedPosts() {
  const data = readJSON(FEATURED_POSTS_PATH, null);
  return data && typeof data === 'object' ? data : {};
}

function saveFeaturedPosts(posts) {
  writeJSON(FEATURED_POSTS_PATH, posts);
  if (isMongoReady()) {
    const ops = Object.entries(posts).map(([msgId, data]) => ({
      updateOne: { filter: { _id: msgId }, update: { data }, upsert: true }
    }));
    if (ops.length) {
      FeaturedPostModel.bulkWrite(ops).catch(e => console.error('❌ featuredPosts bulkWrite:', e.message));
    }
    FeaturedPostModel.deleteMany({ _id: { $nin: Object.keys(posts) } })
      .catch(e => console.error('❌ featuredPosts deleteMany:', e.message));
  }
}

async function loadFeaturedPostsFromMongo() {
  if (!isMongoReady()) return;
  try {
    const docs = await FeaturedPostModel.find().lean();
    if (docs && docs.length > 0) {
      const result = {};
      for (const doc of docs) result[doc._id] = doc.data;
      writeJSON(FEATURED_POSTS_PATH, result);
      console.log(`📦 featuredPosts → تم تحميل ${docs.length} منشور من MongoDB`);
    }
  } catch (e) {
    console.error('❌ loadFeaturedPostsFromMongo error:', e.message);
  }
}

function getFeaturedPost(messageId) {
  const posts = getFeaturedPosts();
  return posts[messageId] || null;
}

function markAsFeatured(messageId, authorId, content, jumpUrl) {
  const posts = getFeaturedPosts();
  posts[messageId] = {
    messageId,
    authorId,
    content,
    jumpUrl,
    featured: true,
    featuredAt: Date.now(),
    likes: []
  };
  saveFeaturedPosts(posts);
}

function addLike(messageId, userId) {
  const posts = getFeaturedPosts();
  if (posts[messageId]) {
    if (!posts[messageId].likes) posts[messageId].likes = [];
    if (!posts[messageId].likes.includes(userId)) {
      posts[messageId].likes.push(userId);
      saveFeaturedPosts(posts);
    }
  }
}

module.exports = {
  initFeaturedModels,
  getFeaturedConfig, saveFeaturedConfig, ensureFeaturedConfigLoaded,
  getFeaturedPosts, saveFeaturedPosts, loadFeaturedPostsFromMongo,
  getFeaturedPost, markAsFeatured, addLike,
  isMongoReady
};

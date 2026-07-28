/**
 * featuredStorage.js - تخزين نظام المنشورات المميزة (MongoDB + JSON)
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FEATURED_CONFIG_PATH = path.join(DATA_DIR, 'featured-config.json');
const FEATURED_POSTS_PATH = path.join(DATA_DIR, 'featured-posts.json');

// ---------- MongoDB Schema ----------
const featuredConfigSchema = new mongoose.Schema({
  _id: String,
  data: mongoose.Schema.Types.Mixed
}, { collection: 'featured_config', versionKey: false });

const featuredPostSchema = new mongoose.Schema({
  _id: String, // messageId
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

// ---------- JSON helpers ----------
function readJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function writeJSON(filePath, data) {
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8'); } catch {}
}

// ========== الإعدادات ==========

function getFeaturedConfig() {
  return readJSON(FEATURED_CONFIG_PATH, {
    sourceChannelId: null,
    destChannelId: null,
    emoji: '⭐',
    threshold: 5
  });
}

function saveFeaturedConfig(cfg) {
  writeJSON(FEATURED_CONFIG_PATH, cfg);
  if (isMongoReady()) {
    FeaturedConfigModel.findByIdAndUpdate('main', { data: cfg }, { upsert: true }).catch(() => {});
  }
}

async function ensureFeaturedConfigLoaded() {
  if (!isMongoReady()) return;
  const json = readJSON(FEATURED_CONFIG_PATH, null);
  if (!json) {
    const mDoc = await FeaturedConfigModel.findById('main').lean().catch(() => null);
    if (mDoc && mDoc.data) {
      writeJSON(FEATURED_CONFIG_PATH, mDoc.data);
    }
  }
}

// ========== المنشورات المتعقبة ==========

function getFeaturedPosts() {
  return readJSON(FEATURED_POSTS_PATH, {});
}

function saveFeaturedPosts(posts) {
  writeJSON(FEATURED_POSTS_PATH, posts);
  if (isMongoReady()) {
    const ops = Object.entries(posts).map(([msgId, data]) => ({
      updateOne: { filter: { _id: msgId }, update: { data }, upsert: true }
    }));
    if (ops.length) FeaturedPostModel.bulkWrite(ops).catch(() => {});
    FeaturedPostModel.deleteMany({ _id: { $nin: Object.keys(posts) } }).catch(() => {});
  }
}

async function loadFeaturedPostsFromMongo() {
  if (!isMongoReady()) return;
  const json = readJSON(FEATURED_POSTS_PATH, {});
  if (Object.keys(json).length === 0) {
    try {
      const docs = await FeaturedPostModel.find().lean();
      if (docs && docs.length > 0) {
        const result = {};
        for (const doc of docs) result[doc._id] = doc.data;
        writeJSON(FEATURED_POSTS_PATH, result);
      }
    } catch {}
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

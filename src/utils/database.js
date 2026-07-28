const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

let dbConnected = false;

async function connectDatabase() {
  // 1. من متغيرات البيئة (منصة الاستضافة)
  let uri = (process.env.MONGODB_URI || '').trim();

  // 2. من ملف .env (محلي)
  if (!uri) {
    try {
      const envPath = path.join(__dirname, '..', '..', '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/MONGODB_URI=(.+)/);
        if (match) uri = match[1].trim();
      }
    } catch { /* ignore */ }
  }

  // 3. من ملف .mongodb_uri
  if (!uri) {
    try {
      const uriPath = path.join(__dirname, '..', '..', '.mongodb_uri');
      if (fs.existsSync(uriPath)) {
        uri = fs.readFileSync(uriPath, 'utf8').trim();
      }
    } catch { /* ignore */ }
  }

  if (!uri) {
    console.log('⚠️ MONGODB_URI غير موجود.');
    console.log('📦 التخزين عبر JSON فقط (قد تفقد البيانات عند إعادة التشغيل).');
    console.log('🔧 الحل:');
    console.log('   - Railway: Dashboard → Variables → أضف MONGODB_URI = رابط الاتصال');
    console.log('   - محلياً: أنشئ ملف .mongodb_uri في مجلد المشروع يحتوي على الرابط');
    return false;
  }

  try {
    console.log('🔄 جاري الاتصال بقاعدة بيانات MongoDB...');
    await mongoose.connect(uri);
    console.log('✅ متصل بقاعدة بيانات MongoDB');
    dbConnected = true;

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB Error:', err);
      dbConnected = false;
    });
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ تم قطع اتصال MongoDB');
      dbConnected = false;
    });
    mongoose.connection.on('reconnected', () => {
      console.log('✅ تمت إعادة الاتصال بقاعدة البيانات');
      dbConnected = true;
    });

    return true;
  } catch (err) {
    console.error('❌ MongoDB Error:', err);
    console.log('📦 التخزين عبر JSON فقط (بياناتك قد تختفي عند إعادة التشغيل).');
    return false;
  }
}

function isDbConnected() {
  return dbConnected && mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, isDbConnected };

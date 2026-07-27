const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

async function connectDatabase() {
  // 1. من متغيرات البيئة (منصة الاستضافة)
  let uri = process.env.MONGODB_URI;

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

  // 3. من ملف .mongodb_uri (آمن - خارج الكود)
  if (!uri) {
    try {
      const uriPath = path.join(__dirname, '..', '..', '.mongodb_uri');
      if (fs.existsSync(uriPath)) {
        uri = fs.readFileSync(uriPath, 'utf8').trim();
      }
    } catch { /* ignore */ }
  }

  if (!uri) {
    console.log('⚠️ MONGODB_URI غير موجود. تأكد من ضبطه في:');
    console.log('   - منصة الاستضافة (Environment Variables)');
    console.log('   - أو ملف .mongodb_uri في مجلد المشروع');
    console.log('📦 سيتم استخدام التخزين المحلي (JSON) كنسخة احتياطية.');
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ متصل بقاعدة بيانات MongoDB');

    // الاستماع لأحداث الاتصال
    mongoose.connection.on('error', (err) => {
      console.error('❌ خطأ في اتصال MongoDB:', err.message);
    });
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ تم قطع اتصال MongoDB');
    });

    return true;
  } catch (err) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
    console.log('📦 سيتم استخدام التخزين المحلي (JSON) كنسخة احتياطية.');
    return false;
  }
}

module.exports = { connectDatabase };

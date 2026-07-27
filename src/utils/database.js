const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

let connectionAttempts = 0;
const MAX_RETRIES = 3;

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
    console.log('⚠️ MONGODB_URI غير موجود. تأكد من ضبطه في:');
    console.log('   - Railway Dashboard → Variables → MONGODB_URI');
    console.log('   - أو ملف .env / .mongodb_uri محلياً');
    console.log('📦 سيتم استخدام التخزين المحلي (JSON) كنسخة احتياطية.');
    return false;
  }

  // محاولة الاتصال مع إعادة المحاولة
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🔄 محاولة الاتصال بقاعدة البيانات (${attempt}/${MAX_RETRIES})...`);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 15000,
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
      console.error(`❌ محاولة ${attempt}/${MAX_RETRIES} فشلت:`, err.message);
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 2000;
        console.log(`⏳ انتظار ${delay/1000} ثواني قبل إعادة المحاولة...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  console.error('❌ فشل الاتصال بقاعدة البيانات بعد 3 محاولات.');
  console.log('📦 سيتم استخدام التخزين المحلي (JSON) كنسخة احتياطية.');
  return false;
}

module.exports = { connectDatabase };

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

let dbConnected = false;
const MAX_RETRIES = 5;

/** عرض أول 20 حرفاً من URI (للتشخيص دون كشف كلمة المرور) */
function previewUri(uri) {
  if (!uri) return '(فارغ)';
  return uri.substring(0, 25) + '...' + uri.substring(uri.indexOf('@'));
}

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

  console.log(`🔍 URI: ${previewUri(uri)}`);

  // محاولة الاتصال مع إعادة المحاولة
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🔄 محاولة الاتصال (${attempt}/${MAX_RETRIES})...`);
      await mongoose.connect(uri, {
        keepAlive: true,
        keepAliveInitialDelay: 300000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 60000,
        connectTimeoutMS: 20000,
        heartbeatFrequencyMS: 10000,
      });
      console.log('✅ متصل بقاعدة بيانات MongoDB');
      dbConnected = true;

      // الاستماع لأحداث الاتصال
      mongoose.connection.on('error', (err) => {
        console.error('❌ خطأ في اتصال MongoDB:', err.message);
        console.error('Stack:', err.stack);
        dbConnected = false;
      });
      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ تم قطع اتصال MongoDB');
        dbConnected = false;
        // محاولة إعادة الاتصال تلقائياً
        setTimeout(() => tryReconnect(uri), 30000);
      });
      mongoose.connection.on('reconnected', () => {
        console.log('✅ تمت إعادة الاتصال بقاعدة البيانات');
        dbConnected = true;
      });
      mongoose.connection.on('connected', () => {
        dbConnected = true;
      });

      return true;
    } catch (err) {
      console.error(`❌ محاولة ${attempt}/${MAX_RETRIES} فشلت:`, err.message);
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 3000;
        console.log(`⏳ انتظار ${delay/1000} ثواني...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  console.error('❌ فشل الاتصال بقاعدة البيانات بعد 5 محاولات.');
  console.log('📦 التخزين عبر JSON فقط (بياناتك قد تختفي عند إعادة التشغيل).');
  console.log('🔧 راجع الرابط وتأكد من:');
  console.log('   1. صحة الرابط في Railway Dashboard');
  console.log('   2. إضافة IP 0.0.0.0/0 في MongoDB Atlas Network Access');
  return false;
}

/** محاولة إعادة الاتصال بعد انقطاع */
async function tryReconnect(uri) {
  if (mongoose.connection.readyState === 1) {
    dbConnected = true;
    return;
  }
  console.log('🔄 محاولة إعادة الاتصال بقاعدة البيانات...');
  try {
    await mongoose.connect(uri, {
      keepAlive: true,
      keepAliveInitialDelay: 300000,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 15000,
    });
    console.log('✅ تمت إعادة الاتصال');
    dbConnected = true;
    // إعادة تحميل اللوحات من MongoDB بعد استعادة الاتصال
    try {
      const { ensureStarboardLoaded } = require('./starboardStorage');
      ensureStarboardLoaded();
    } catch {}
  } catch (err) {
    console.error('❌ فشل إعادة الاتصال:', err.message);
    console.error(err.stack);
    setTimeout(() => tryReconnect(uri), 60000); // حاول كل دقيقة
  }
}

/** هل قاعدة البيانات متصلة حالياً؟ */
function isDbConnected() {
  return dbConnected && mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, isDbConnected };

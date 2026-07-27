const mongoose = require('mongoose');

// رابط قاعدة البيانات الثابت (احتياطي في حال لم يُضبط متغير البيئة)
const FALLBACK_URI = 'mongodb+srv://momen7alsmadi_db_user:l7zDaH7CkksljM1l@c2.kpnmvro.mongodb.net/c2?retryWrites=true&w=majority';

async function connectDatabase() {
  let uri = process.env.MONGODB_URI || FALLBACK_URI;
  
  if (!uri) {
    console.log('⚠️ MONGODB_URI غير موجود، سيتم استخدام التخزين المحلي (JSON).');
    return false;
  }
  
  try {
    await mongoose.connect(uri);
    console.log('✅ متصل بقاعدة بيانات MongoDB');
    return true;
  } catch (err) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
    return false;
  }
}

module.exports = { connectDatabase };

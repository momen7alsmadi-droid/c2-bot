const mongoose = require('mongoose');

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('⚠️ MONGODB_URI غير موجود، سيتم استخدام التخزين المحلي (JSON).');
    return false;
  }
  try {
    await mongoose.connect(uri);
    console.log('✅ تم الاتصال بقاعدة البيانات MongoDB');
    return true;
  } catch (err) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
    return false;
  }
}

module.exports = { connectDatabase };

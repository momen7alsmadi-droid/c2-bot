const mongoose = require('mongoose');

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.log('⚠️ MONGODB_URI غير مضبوط في متغيرات البيئة. يتم استخدام التخزين المحلي (JSON).');
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

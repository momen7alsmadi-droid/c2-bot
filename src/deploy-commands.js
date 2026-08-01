require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');

// ========== تحميل الأوامر من ملفاتها الأصلية ==========
const commands = [];

// 1) الأوامر القديمة (مضمنة مباشرة)
commands.push(
  new SlashCommandBuilder()
    .setName('اجازة')
    .setDescription('تقديم طلب اجازة')
    .addUserOption(o => o.setName('المسؤول').setDescription('منشن المسؤول عنك').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('دليل')
    .setDescription('تقديم استمارة دليل عقوبة')
    .addUserOption(o => o.setName('العضو').setDescription('يوزر العضو المعاقب').setRequired(true))
    .addStringOption(o => o.setName('العقوبة').setDescription('نوع العقوبة').setRequired(true)
      .addChoices(
        { name: '🔨 باند (Ban)', value: 'باند' },
        { name: '👢 كيك (Kick)', value: 'كيك' },
        { name: '⚠️ تحذير (Warn)', value: 'تحذير' },
        { name: '⏰ تايم (Timeout)', value: 'تايم' },
        { name: '⛓️ سجن (Jail)', value: 'سجن' },
      ))
    .addStringOption(o => o.setName('السبب').setDescription('سبب العقوبة').setRequired(true))
    .addStringOption(o => o.setName('المكان').setDescription('مكان العقوبة').setRequired(true))
    .addAttachmentOption(o => o.setName('الصورة').setDescription('صورة الدليل').setRequired(true))
    .addStringOption(o => o.setName('المدة').setDescription('مدة العقوبة (للتايم والسجن)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('بلاغ')
    .setDescription('تقديم بلاغ سري على إداري')
    .addUserOption(o => o.setName('الاداري').setDescription('الإداري المبلغ عنه').setRequired(true))
    .addStringOption(o => o.setName('السبب').setDescription('سبب البلاغ').setRequired(true))
    .addStringOption(o => o.setName('متى').setDescription('متى حدثت الواقعة؟').setRequired(true))
    .addChannelOption(o => o.setName('المكان').setDescription('أين حدثت؟').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addAttachmentOption(o => o.setName('دليل_1').setDescription('صورة الدليل الأولى (إلزامي)').setRequired(true))
    .addStringOption(o => o.setName('شهود').setDescription('منشن الشهود بـ @ مثال: @witness1 @witness2').setRequired(false))
    .addStringOption(o => o.setName('ملاحظات').setDescription('ملاحظات إضافية (اختياري)').setRequired(false))
    .addAttachmentOption(o => o.setName('دليل_2').setDescription('صورة دليل (اختياري)').setRequired(false))
    .addAttachmentOption(o => o.setName('دليل_3').setDescription('صورة دليل (اختياري)').setRequired(false))
    .addAttachmentOption(o => o.setName('دليل_4').setDescription('صورة دليل (اختياري)').setRequired(false))
    .addAttachmentOption(o => o.setName('دليل_5').setDescription('صورة دليل (اختياري)').setRequired(false))
    .addAttachmentOption(o => o.setName('دليل_6').setDescription('صورة دليل (اختياري)').setRequired(false))
    .addAttachmentOption(o => o.setName('دليل_7').setDescription('صورة دليل (اختياري)').setRequired(false))
    .addAttachmentOption(o => o.setName('دليل_8').setDescription('صورة دليل (اختياري)').setRequired(false))
    .addAttachmentOption(o => o.setName('دليل_9').setDescription('صورة دليل (اختياري)').setRequired(false))
    .addAttachmentOption(o => o.setName('دليل_10').setDescription('صورة دليل (اختياري)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('استقالة')
    .setDescription('تقديم استقالة من الإدارة')
    .addUserOption(o => o.setName('المسؤول').setDescription('المسؤول عنك').setRequired(true))
    .addStringOption(o => o.setName('السبب').setDescription('سبب الاستقالة').setRequired(true))
    .addBooleanOption(o => o.setName('منشن_الإدارة_العليا').setDescription('منشن الإدارة العليا للتنبيه (اختياري)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('مساعدة')
    .setDescription('شرح البوت والأوامر')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('اعدادات')
    .setDescription('إعدادات الأنظمة (إجازة، دلائل، بلاغات، استقالة)')
    .setDefaultMemberPermissions(8)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('لوحة_المطور')
    .setDescription('🛠️ لوحة تحكم المطور')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('📩 إرسال رسالة خاصة للأعضاء عبر DM (أدمن فقط)')
    .setDefaultMemberPermissions(8)
    .addStringOption(o => o.setName('message').setDescription('نص الرسالة').setRequired(true))
    .addStringOption(o => o.setName('format').setDescription('نوع الرسالة').setRequired(true)
      .addChoices({ name: '🖼️ ايمبد (Embed)', value: 'embed' }, { name: '📝 نص عادي (Plain)', value: 'plain' }))
    .addStringOption(o => o.setName('show_sender').setDescription('إظهار اسم المرسل').setRequired(true)
      .addChoices({ name: '✅ نعم', value: 'yes' }, { name: '❌ لا', value: 'no' }))
    .addRoleOption(o => o.setName('role').setDescription('الرتبة المستهدفة (اختياري)').setRequired(false))
    .addStringOption(o => o.setName('color').setDescription('لون الإيمبد (اختياري)').setRequired(false).setAutocomplete(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('الألوان_المتوفرة')
    .setDescription('🎨 عرض جميع ألوان الإيمبد المتوفرة مع رموزها')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('ايمبد')
    .setDescription('📦 نظام قوالب الإيمبدات المتكامل')
    .setDefaultMemberPermissions(8)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('الردود_التلقائية')
    .setDescription('🤖 نظام الردود التلقائية على الرسائل')
    .setDefaultMemberPermissions(8)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('لوحة_النجوم')
    .setDescription('⭐ نظام لوحة النجوم المتعدد - إدارة اللوحات والإعدادات')
    .setDefaultMemberPermissions(8)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('اعدادات_لوحة_الإدارة')
    .setDescription('🛡️ لوحة إعدادات نظام الإدارة - الرتب والترقيات والتنزيلات')
    .setDefaultMemberPermissions(8)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('لوحة_الإدارة')
    .setDescription('🛡️ لوحة الإدارة - الترقية والتنزيل وتوب الإدارة')
    .toJSON(),
  // أمر تغيير اسم البوت (للمطور فقط)
  new SlashCommandBuilder()
    .setName('تغيير-اسم-البوت')
    .setDescription('🔤 تغيير اسم البوت (للمطور فقط)')
    .addStringOption(o => o.setName('الاسم').setDescription('الاسم الجديد للبوت').setRequired(true).setMaxLength(32))
    .toJSON(),
  // أمر تغيير صورة البوت (للمطور فقط)
  new SlashCommandBuilder()
    .setName('تغيير-صورة-البوت')
    .setDescription('🖼️ تغيير صورة البوت (للمطور فقط)')
    .addAttachmentOption(o => o.setName('الصورة').setDescription('الصورة الجديدة للبوت').setRequired(true))
    .toJSON()
);

// 2) تحميل الأمر الجديد من ملفه الأصلي (نتحقق من سلامة الـ exports)
try {
  const ticketSetup = require('../ticket-system/commands/ticket-setup');
  if (ticketSetup && ticketSetup.data && typeof ticketSetup.execute === 'function') {
    commands.push(ticketSetup.data.toJSON());
    console.log(`✅ تم تحميل الأمر: ${ticketSetup.data.name}`);
  } else {
    console.error('❌ ticket-setup.js: exports غير صحيحة (data أو execute مفقودة)');
  }
} catch (err) {
  console.error('❌ ticket-setup.js فشل التحميل:', err.message);
}

// 3) أمر رفع الصور لنظام التذاكر
try {
  const panelImage = require('../ticket-system/commands/panel-image');
  if (panelImage && panelImage.data && typeof panelImage.execute === 'function') {
    commands.push(panelImage.data.toJSON());
    console.log(`✅ تم تحميل الأمر: ${panelImage.data.name}`);
  } else {
    console.error('❌ panel-image.js: exports غير صحيحة (data أو execute مفقودة)');
  }
} catch (err) {
  console.error('❌ panel-image.js فشل التحميل:', err.message);
}

// طباعة أسماء جميع الأوامر المحملة
console.log(`\n📋 الأوامر المحملة (${commands.length}):`);
commands.forEach(cmd => console.log(`   - ${cmd.name}`));
console.log('');

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

async function deployCommands(clientId) {
  const id = clientId || process.env.CLIENT_ID;
  if (!id) {
    console.error('❌ deployCommands: CLIENT_ID غير موجود!');
    return;
  }

  const guildId = process.env.GUILD_ID;

  // ====== 1) تسجيل الأوامر كـ Global (تظهر في كل السيرفرات) ======
  // الأوامر العامة تُظهر في أي سيرفر يدخل البوت إليه (خلال دقائق حتى ساعة)
  try {
    console.log(`⏳ جاري تسجيل Global Commands (${commands.length} أمر)...`);
    await rest.put(Routes.applicationCommands(id), { body: commands });
    console.log('✅ تم تسجيل الأوامر كـ Global — ستظهر في كل السيرفرات.');
  } catch (err) {
    console.error('❌ فشل تسجيل Global Commands:', err.message);
    if (err.stack) console.error(err.stack);
  }

  // ====== 2) تسجيل Guild Commands لسيرفر التطوير (تحديث فوري) ======
  // نفس أسماء الأوامر في السيرفر تُغطي النسخة العالمية (لا ازدواج)،
  // والتحديث فيها يظهر فوراً بدل انتظار انتشار النسخة العالمية.
  if (guildId) {
    try {
      console.log(`⏳ جاري تسجيل Guild Commands (Guild: ${guildId})...`);
      await rest.put(Routes.applicationGuildCommands(id, guildId), { body: commands });
      console.log(`✅ تم تسجيل ${commands.length} أمر في سيرفر التطوير ${guildId}.`);
    } catch (err) {
      console.error('❌ فشل تسجيل Guild Commands:', err.message);
      if (err.stack) console.error(err.stack);
    }
  }

  console.log('📋 تمت مزامنة جميع الأوامر مع Discord API.');
}

// إذا شُغّل كسكريبت مستقل
if (require.main === module) {
  deployCommands();
}

module.exports = { deployCommands };

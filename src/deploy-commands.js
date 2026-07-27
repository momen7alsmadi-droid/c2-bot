require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');

const commands = [
  // ------------------- /اجازة -------------------
  new SlashCommandBuilder()
    .setName('اجازة')
    .setDescription('تقديم طلب اجازة')
    .addUserOption(o => o.setName('المسؤول').setDescription('منشن المسؤول عنك').setRequired(true))
    .toJSON(),

  // ------------------- /دليل -------------------
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

  // ------------------- /بلاغ -------------------
  new SlashCommandBuilder()
    .setName('بلاغ')
    .setDescription('تقديم بلاغ سري على إداري')
    .addUserOption(o => o.setName('الاداري').setDescription('الإداري المبلغ عنه').setRequired(true))
    .addStringOption(o => o.setName('السبب').setDescription('سبب البلاغ').setRequired(true))
    .addStringOption(o => o.setName('متى').setDescription('متى حدثت الواقعة؟').setRequired(true))
    .addChannelOption(o => o.setName('المكان').setDescription('أين حدثت؟').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('شهود').setDescription('منشن الشهود (ضع منشنات مفصولة بمسافة)').setRequired(false))
    .addAttachmentOption(o => o.setName('دليل_1').setDescription('صورة دليل (اختياري)').setRequired(false))
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

  // ------------------- /استقالة -------------------
  new SlashCommandBuilder()
    .setName('استقالة')
    .setDescription('تقديم استقالة من الإدارة')
    .addUserOption(o => o.setName('المسؤول').setDescription('المسؤول عنك').setRequired(true))
    .addStringOption(o => o.setName('السبب').setDescription('سبب الاستقالة').setRequired(true))
    .toJSON(),

  // ------------------- /مساعدة -------------------
  new SlashCommandBuilder()
    .setName('مساعدة')
    .setDescription('شرح البوت والأوامر')
    .toJSON(),



  // ------------------- /اعدادات -------------------
  new SlashCommandBuilder()
    .setName('اعدادات')
    .setDescription('إعدادات الأنظمة (إجازة، دلائل، بلاغات، استقالة)')
    .setDefaultMemberPermissions(8) // Administrator
    .toJSON(),

  // ------------------- /لوحة_المطور -------------------
  new SlashCommandBuilder()
    .setName('لوحة_المطور')
    .setDescription('🛠️ لوحة تحكم المطور')
    .toJSON(),

  // ------------------- /broadcast -------------------
  new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('📩 إرسال رسالة خاصة للأعضاء عبر DM (أدمن فقط)')
    .setDefaultMemberPermissions(8) // Administrator
    .addStringOption(o => o.setName('message').setDescription('نص الرسالة').setRequired(true))
    .addStringOption(o => o.setName('format').setDescription('نوع الرسالة').setRequired(true)
      .addChoices(
        { name: '🖼️ ايمبد (Embed)', value: 'embed' },
        { name: '📝 نص عادي (Plain)', value: 'plain' },
      ))
    .addStringOption(o => o.setName('show_sender').setDescription('إظهار اسم المرسل').setRequired(true)
      .addChoices(
        { name: '✅ نعم', value: 'yes' },
        { name: '❌ لا', value: 'no' },
      ))
    .addRoleOption(o => o.setName('role').setDescription('الرتبة المستهدفة (اختياري) - إذا تركت فارغة ترسل للكل').setRequired(false))
    .addStringOption(o => o.setName('color').setDescription('لون الإيمبد (اختياري) - اكتب للبحث أو اتركه فارغاً للون عشوائي').setRequired(false).setAutocomplete(true))
    .toJSON(),

  // ------------------- /الألوان_المتوفرة -------------------
  new SlashCommandBuilder()
    .setName('الألوان_المتوفرة')
    .setDescription('🎨 عرض جميع ألوان الإيمبد المتوفرة مع رموزها')
    .toJSON(),

  // ------------------- /ايمبد -------------------
  new SlashCommandBuilder()
    .setName('ايمبد')
    .setDescription('📦 نظام قوالب الإيمبدات المتكامل')
    .setDefaultMemberPermissions(8) // Administrator
    .toJSON(),

  // ------------------- /الردود_التلقائية -------------------
  new SlashCommandBuilder()
    .setName('الردود_التلقائية')
    .setDescription('🤖 نظام الردود التلقائية على الرسائل')
    .setDefaultMemberPermissions(8) // Administrator
    .toJSON(),

];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log('⏳ جاري تسجيل الأوامر...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ تم تسجيل الأوامر بنجاح.');
  } catch (err) {
    console.error('❌ فشل تسجيل الأوامر:', err);
  }
})();

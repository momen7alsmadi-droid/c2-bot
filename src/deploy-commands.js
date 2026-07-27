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
    .addStringOption(o => o.setName('color').setDescription('لون الإيمبد (اختياري) - إذا تركت فارغة يختار لون عشوائي').setRequired(false)
      .addChoices(
        { name: '🔴 أحمر (Red)', value: '#FF0000' },
        { name: '🟠 برتقالي (Orange)', value: '#FFA500' },
        { name: '🟡 أصفر (Yellow)', value: '#FFFF00' },
        { name: '🟢 أخضر (Green)', value: '#00FF00' },
        { name: '🔵 أزرق (Blue)', value: '#0000FF' },
        { name: '🟣 بنفسجي (Purple)', value: '#800080' },
        { name: '💗 وردي (Pink)', value: '#FF69B4' },
        { name: '⚫ أسود (Black)', value: '#000000' },
        { name: '⚪ أبيض (White)', value: '#FFFFFF' },
        { name: '🔘 رمادي (Gray)', value: '#808080' },
        { name: '🟤 نيلي (Indigo)', value: '#4B0082' },
        { name: '⭐ ذهبي (Gold)', value: '#FFD700' },
        { name: '🥈 فضي (Silver)', value: '#C0C0C0' },
        { name: '💙 كحلي (Navy)', value: '#000080' },
        { name: '🫒 زيتي (Olive)', value: '#808000' },
        { name: '🩵 تركواز (Teal)', value: '#008080' },
        { name: '🩸 مارون (Maroon)', value: '#800000' },
        { name: '🩵 سماوي (Cyan)', value: '#00FFFF' },
        { name: '💚 ليموني (Lime)', value: '#32CD32' },
        { name: '🩷 وردي غامق (HotPink)', value: '#FF1493' },
        { name: '🔮 بنفسجي فاتح (Violet)', value: '#EE82EE' },
        { name: '🟥 أحمر داكن (DarkRed)', value: '#8B0000' },
        { name: '🟦 أزرق داكن (DarkBlue)', value: '#00008B' },
        { name: '🟩 أخضر داكن (DarkGreen)', value: '#006400' },
        { name: '🟧 برتقالي داكن (DarkOrange)', value: '#FF8C00' },
      ))
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

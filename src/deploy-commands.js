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
    .addStringOption(o => o.setName('دلائل').setDescription('روابط الصور (رابط في كل سطر)').setRequired(false))
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

const { EmbedBuilder } = require('discord.js');
const { getConfig, saveConfig } = require('../utils/storage');
const { hasRole, sendLog } = require('../utils/helpers');

// ------------------- /دليل -------------------

async function handleDaleelCommand(interaction, cfg) {
  if (!hasRole(interaction.member, cfg.daleel.allowedRoleId)) {
    return interaction.reply({ content: '❌ ما عندك صلاحية استخدام هذا الأمر.', ephemeral: true });
  }
  if (!cfg.daleel.channelId) {
    return interaction.reply({ content: '⚠️ لم يتم إعداد روم الدلائل بعد، تواصل مع الإدارة.', ephemeral: true });
  }

  const targetUser = interaction.options.getUser('العضو');
  const penalty = interaction.options.getString('العقوبة');
  const reason = interaction.options.getString('السبب');
  const duration = interaction.options.getString('المدة');
  const place = interaction.options.getString('المكان');
  const attachment = interaction.options.getAttachment('الصورة');

  // تحقق من المدة إذا كانت العقوبة تايم أو سجن
  if ((penalty === 'تايم' || penalty === 'سجن') && !duration) {
    return interaction.reply({ content: `⚠️ يجب تحديد **المدة** لعقوبة ${penalty}.`, ephemeral: true });
  }

  const penaltyText = duration ? `${penalty} (${duration})` : penalty;

  const embed = new EmbedBuilder()
    .setTitle('📋 استمارة دليل عقوبة')
    .setColor(0xE67E22)
    .addFields(
      { name: 'يوزر العضو', value: `${targetUser}` },
      { name: 'العقوبة', value: penaltyText },
      { name: 'سبب العقوبة', value: reason },
      { name: 'مكان العقوبة', value: place },
    )
    .setImage(attachment.url)
    .setFooter({ text: `مقدَّم من طرف ${interaction.user.tag}` })
    .setTimestamp();

  const channel = await interaction.guild.channels.fetch(cfg.daleel.channelId).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: '⚠️ لم أستطع الوصول إلى روم الدلائل، تأكد من الإعدادات.', ephemeral: true });
  }

  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });
  await interaction.reply({ content: '✅ تم إرسال الاستمارة بنجاح.', ephemeral: true });

  const logEmbed = new EmbedBuilder()
    .setTitle('📋 دليل عقوبة جديد')
    .setColor(0xE67E22)
    .addFields(
      { name: 'العضو المعاقب', value: `${targetUser} (${targetUser.tag} | ${targetUser.id})` },
      { name: 'العقوبة', value: penaltyText },
      { name: 'السبب', value: reason },
      { name: 'المدة', value: duration || 'بدون' },
      { name: 'المكان', value: place },
      { name: 'مقدّم الدليل', value: `${interaction.user} (${interaction.user.tag} | ${interaction.user.id})` },
    )
    .setImage(attachment.url)
    .setTimestamp();
  await sendLog(interaction.guild, cfg.daleel.logChannelId, { embeds: [logEmbed] });
}

// ------------------- إعدادات الدلائل -------------------

async function handleDaleelSettings(interaction, cfg) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'رتبة_الاستخدام') {
    const role = interaction.options.getRole('الرتبة');
    cfg.daleel.allowedRoleId = role.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد رتبة استخدام /دليل: ${role}`, ephemeral: true });
  }

  if (sub === 'روم_الارسال') {
    const channel = interaction.options.getChannel('الروم');
    cfg.daleel.channelId = channel.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد روم استقبال الدلائل: ${channel}`, ephemeral: true });
  }

  if (sub === 'روم_اللوق') {
    const channel = interaction.options.getChannel('الروم');
    cfg.daleel.logChannelId = channel.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد روم لوق نظام الدلائل: ${channel}`, ephemeral: true });
  }

  if (sub === 'عرض_الاعدادات') {
    const embed = new EmbedBuilder()
      .setTitle('⚙️ إعدادات نظام الدلائل')
      .setColor(0x2ECC71)
      .addFields(
        { name: 'رتبة الاستخدام', value: cfg.daleel.allowedRoleId ? `<@&${cfg.daleel.allowedRoleId}>` : 'غير محددة' },
        { name: 'روم الإرسال', value: cfg.daleel.channelId ? `<#${cfg.daleel.channelId}>` : 'غير محدد' },
        { name: 'روم اللوق', value: cfg.daleel.logChannelId ? `<#${cfg.daleel.logChannelId}>` : 'غير محدد' },
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { handleDaleelCommand, handleDaleelSettings };

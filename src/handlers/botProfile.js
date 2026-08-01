const { EmbedBuilder } = require('discord.js');
const { version } = require('../../package.json');

// حساب المطور الوحيد المسموح له بتغيير اسم/صورة البوت
const DEV_BOT_ID = '1387331972094890036';

function deny(interaction) {
  return interaction.reply({
    content: '⛔ ليس لديك صلاحية لتغيير بيانات البوت.',
    ephemeral: true,
  }).catch(() => {});
}

/** /تغيير-اسم-البوت — تغيير اسم البوت */
async function handleBotName(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return deny(interaction);

  const name = (interaction.options.getString('الاسم') || '').trim();
  if (!name) {
    return interaction.reply({ content: '⚠️ يجب إدخال الاسم الجديد.', ephemeral: true });
  }
  if (name.length > 32) {
    return interaction.reply({ content: '⚠️ اسم البوت يجب ألا يتجاوز 32 حرفاً.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    await interaction.client.user.setUsername(name);
    const embed = new EmbedBuilder()
      .setTitle('✅ تم تغيير اسم البوت')
      .setColor(0x2ECC71)
      .setDescription(`الاسم الجديد: **${name}**`)
      .setFooter({ text: `الإصدار: ${version} | @${interaction.user.tag}` })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[bot-name]', err.message);
    return interaction.editReply({
      content: `❌ فشل تغيير الاسم: ${err.message || 'خطأ غير معروف'} (ديسكورد يسمح بتغييرين في الساعة فقط)`,
    }).catch(() => {});
  }
}

/** /تغيير-صورة-البوت — تغيير صورة البوت */
async function handleBotAvatar(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return deny(interaction);

  const attachment = interaction.options.getAttachment('الصورة');
  if (!attachment) {
    return interaction.reply({ content: '⚠️ يجب إرفاق صورة جديدة.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    await interaction.client.user.setAvatar(attachment.url);
    const embed = new EmbedBuilder()
      .setTitle('✅ تم تغيير صورة البوت')
      .setColor(0x2ECC71)
      .setDescription('تم تحديث صورة البوت بنجاح.')
      .setThumbnail(attachment.url)
      .setFooter({ text: `الإصدار: ${version} | @${interaction.user.tag}` })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[bot-avatar]', err.message);
    return interaction.editReply({
      content: `❌ فشل تغيير الصورة: ${err.message || 'خطأ غير معروف'} (ديسكورد يسمح بتغييرين في الساعة فقط)`,
    }).catch(() => {});
  }
}

module.exports = { handleBotName, handleBotAvatar, DEV_BOT_ID };

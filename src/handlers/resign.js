const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const { getConfig, saveConfig } = require('../utils/storage');
const { hasRole, sendLog } = require('../utils/helpers');

// ------------------- /استقالة -------------------

async function handleResign(interaction) {
  const cfg = getConfig();
  
  if (!hasRole(interaction.member, cfg.resign.allowedRoleId)) {
    return interaction.reply({ content: '❌ ما عندك صلاحية استخدام هذا الأمر.', ephemeral: true });
  }
  if (!cfg.resign.logChannelId) {
    return interaction.reply({ content: '⚠️ لم يتم إعداد روم الاستقبال بعد، تواصل مع المطور.', ephemeral: true });
  }

  const manager = interaction.options.getUser('المسؤول');
  const reason = interaction.options.getString('السبب');

  const embed = new EmbedBuilder()
    .setTitle('⎭ طـلـب اسـتـقـالـة ⎧')
    .setColor(0xE67E22)
    .addFields(
      { name: '— مـقـدم الـطـلـب', value: `${interaction.user}` },
      { name: '— مـسـؤولـه', value: `${manager}` },
      { name: '— سـبـب الاسـتـقـالـة', value: reason },
      { name: '— الحالة', value: '⏳ بانتظار القبول' },
    )
    .setFooter({ text: `${interaction.user.tag} | ${interaction.user.id}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`resign_accept_${interaction.user.id}`).setLabel('قبول').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`resign_reject_${interaction.user.id}`).setLabel('رفض').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );

  const channel = await interaction.guild.channels.fetch(cfg.resign.logChannelId).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: '⚠️ لم أستطع الوصول إلى روم الاستقبال.', ephemeral: true });
  }

  await channel.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ تم إرسال طلب الاستقالة، بانتظار الموافقة.', ephemeral: true });
}

// ------------------- أزرار القبول/الرفض -------------------

async function handleResignButton(interaction, action, userId) {
  const guild = interaction.guild;
  const cfg = getConfig();
  const member = await guild.members.fetch(userId).catch(() => null);
  const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]);

  // تعطيل الأزرار بعد الاستخدام
  const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
  disabledRow.components.forEach(c => c.setDisabled(true));

  if (action === 'reject') {
    const { setFieldValue } = require('../utils/helpers');
    setFieldValue(newEmbed, '— الحالة', `❌ مرفوضة بواسطة ${interaction.user.tag}`);
    await interaction.update({ embeds: [newEmbed], components: [disabledRow] });
    if (member) member.send('❌ تم رفض طلب استقالتك.').catch(() => {});
    return;
  }

  // قبول الاستقالة
  if (!member) {
    return interaction.reply({ content: '⚠️ العضو غير موجود في السيرفر.', ephemeral: true });
  }

  // إزالة الرتب المحددة
  const removedRoles = cfg.resign.rolesToRemove.filter(roleId => member.roles.cache.has(roleId));
  if (removedRoles.length) {
    await member.roles.remove(removedRoles).catch(() => {});
  }

  // إعطاء رتبة ما بعد الاستقالة
  if (cfg.resign.resignRoleId) {
    await member.roles.add(cfg.resign.resignRoleId).catch(() => {});
  }

  const { setFieldValue } = require('../utils/helpers');
  setFieldValue(newEmbed, '— الحالة', `✅ مقبولة بواسطة ${interaction.user.tag}`);
  await interaction.update({ embeds: [newEmbed], components: [disabledRow] });
  member.send('✅ تم قبول استقالتك من الإدارة.').catch(() => {});

  const logEmbed = new EmbedBuilder()
    .setTitle('✅ تم قبول استقالة')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'العضو', value: `${member} (${member.user.tag})` },
      { name: 'الرتب المُزالة', value: removedRoles.length ? removedRoles.map(id => `<@&${id}>`).join(', ') : 'لا يوجد' },
      { name: 'قُبل بواسطة', value: `${interaction.user.tag}` },
    )
    .setTimestamp();
  await sendLog(guild, cfg.resign.logChannelId, { embeds: [logEmbed] });
}

// ------------------- /اعدادات_المطور -------------------

async function handleDevSettings(interaction) {
  const sub = interaction.options.getSubcommand();
  const cfg = getConfig();

  if (sub === 'رتبة_الاستخدام') {
    const role = interaction.options.getRole('الرتبة');
    cfg.resign.allowedRoleId = role.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد رتبة استخدام /استقالة: ${role}`, ephemeral: true });
  }

  if (sub === 'روم_اللوق') {
    const channel = interaction.options.getChannel('الروم');
    cfg.resign.logChannelId = channel.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد روم الاستقالات: ${channel}`, ephemeral: true });
  }

  if (sub === 'اضافة_رتبة_للإزالة') {
    const role = interaction.options.getRole('الرتبة');
    if (!cfg.resign.rolesToRemove.includes(role.id)) {
      cfg.resign.rolesToRemove.push(role.id);
      saveConfig(cfg);
    }
    return interaction.reply({ content: `✅ تمت إضافة ${role} إلى قائمة الإزالة.`, ephemeral: true });
  }

  if (sub === 'ازالة_رتبة_من_القائمة') {
    const role = interaction.options.getRole('الرتبة');
    cfg.resign.rolesToRemove = cfg.resign.rolesToRemove.filter(id => id !== role.id);
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تمت إزالة ${role} من القائمة.`, ephemeral: true });
  }

  if (sub === 'رتبة_الاستقالة') {
    const role = interaction.options.getRole('الرتبة');
    cfg.resign.resignRoleId = role.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد رتبة ما بعد الاستقالة: ${role}`, ephemeral: true });
  }

  if (sub === 'تعطيل_سيرفر') {
    const id = interaction.options.getString('ايدي');
    if (!cfg.disabledGuilds.includes(id)) {
      cfg.disabledGuilds.push(id);
      saveConfig(cfg);
    }
    const guildName = interaction.client.guilds.cache.get(id)?.name || 'غير معروف';
    return interaction.reply({ content: `🔴 تم تعطيل البوت في: **${guildName}** (\`${id}\`)`, ephemeral: true });
  }

  if (sub === 'تفعيل_سيرفر') {
    const id = interaction.options.getString('ايدي');
    cfg.disabledGuilds = cfg.disabledGuilds.filter(gid => gid !== id);
    saveConfig(cfg);
    const guildName = interaction.client.guilds.cache.get(id)?.name || 'غير معروف';
    return interaction.reply({ content: `🟢 تم تفعيل البوت في: **${guildName}** (\`${id}\`)`, ephemeral: true });
  }

  if (sub === 'عرض_الاعدادات') {
    const r = cfg.resign;
    const disabledList = cfg.disabledGuilds.map(id => {
      const g = interaction.client.guilds.cache.get(id);
      return g ? `${g.name} (\`${id}\`)` : `\`${id}\``;
    }).join('\n') || 'لا يوجد';

    const embed = new EmbedBuilder()
      .setTitle('⚙️ إعدادات المطور')
      .setColor(0x2ECC71)
      .addFields(
        { name: '📄 رتبة الاستقالة', value: r.allowedRoleId ? `<@&${r.allowedRoleId}>` : 'غير محددة' },
        { name: '📄 روم الاستقالات', value: r.logChannelId ? `<#${r.logChannelId}>` : 'غير محدد' },
        { name: '📄 رتبة ما بعد الاستقالة', value: r.resignRoleId ? `<@&${r.resignRoleId}>` : 'غير محددة' },
        { name: '📄 الرتب المُزالة', value: r.rolesToRemove.length ? r.rolesToRemove.map(id => `<@&${id}>`).join(', ') : 'لا يوجد' },
        { name: '🔴 السيرفرات المعطلة', value: disabledList },
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { handleResign, handleResignButton, handleDevSettings };

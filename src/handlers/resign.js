const { version } = require('../utils/version');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const { getConfig, saveConfig } = require('../utils/storage');
const { getAdminConfig } = require('../utils/adminStorage');
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
  const pingHighAdmin = interaction.options.getBoolean('منشن_الإدارة_العليا') || false;

  // بناء منشن الإدارة العليا إذا طلب
  let highAdminMention = '';
  if (pingHighAdmin) {
    const adminCfg = getAdminConfig();
    const guild = interaction.guild;
    const highRoleIds = [];
    if (adminCfg.highAdminRoles && Array.isArray(adminCfg.highAdminRoles)) {
      highRoleIds.push(...adminCfg.highAdminRoles);
    }
    if (adminCfg.highAdminRangeStartId && adminCfg.highAdminRangeEndId) {
      const roleA = guild.roles.cache.get(adminCfg.highAdminRangeStartId);
      const roleB = guild.roles.cache.get(adminCfg.highAdminRangeEndId);
      if (roleA && roleB) {
        const minPos = Math.min(roleA.position, roleB.position);
        const maxPos = Math.max(roleA.position, roleB.position);
        const rolesInRange = guild.roles.cache.filter(
          r => r.position >= minPos && r.position <= maxPos && r.id !== guild.id
        );
        for (const r of rolesInRange.values()) {
          if (!highRoleIds.includes(r.id)) highRoleIds.push(r.id);
        }
      }
    }
    if (highRoleIds.length > 0) {
      highAdminMention = highRoleIds.map(id => `<@&${id}>`).join(' ');
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('⎭ طـلـب اسـتـقـالـة ⎧')
    .setColor(0xE67E22)
    .addFields(
      { name: '— مـقـدم الـطـلـب', value: `${interaction.user}` },
      { name: '— مـسـؤولـه', value: `${manager}` },
      { name: '— سـبـب الاسـتـقـالـة', value: reason },
      { name: '— الحالة', value: '⏳ بانتظار القبول' },
    )
    .setFooter({ text: `الإصدار: ${version} | ${interaction.user.tag}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`resign_accept_${interaction.user.id}`).setLabel('قبول').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`resign_reject_${interaction.user.id}`).setLabel('رفض').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );

  const channel = await interaction.guild.channels.fetch(cfg.resign.logChannelId).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: '⚠️ لم أستطع الوصول إلى روم الاستقبال.', ephemeral: true });
  }

  const contentParts = [interaction.user.toString()];
  if (highAdminMention) contentParts.push(highAdminMention);
  const content = contentParts.join('\n');

  await channel.send({ content, embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ تم إرسال طلب الاستقالة، بانتظار الموافقة.', ephemeral: true });

  // سجل التدقيق
  const auditChannel = cfg.resign.auditLogChannelId ? await interaction.guild.channels.fetch(cfg.resign.auditLogChannelId).catch(() => null) : null;
  if (auditChannel) {
    const auditEmbed = new EmbedBuilder()
      .setTitle('📋 سجل استقالة — طلب جديد')
      .setColor(0xE67E22)
      .addFields(
        { name: 'العضو', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
        { name: 'المسؤول', value: `${manager}`, inline: true },
        { name: 'السبب', value: reason },
        { name: 'الحالة', value: '⏳ بانتظار القبول' },
        { name: 'وقت التقديم', value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
      )
      .setTimestamp();
    await auditChannel.send({ embeds: [auditEmbed] }).catch(() => {});
  }
}

// ------------------- أزرار القبول/الرفض -------------------

/** عرض ملخص الرتب بدون تجاوز حد 1024 حرف */
function roleSummary(arr, guild) {
  if (!Array.isArray(arr) || arr.length === 0) return 'لا يوجد';
  if (arr.length <= 2) return arr.map(id => `<@&${id}>`).join(', ');
  const roles = arr.map(id => guild?.roles?.cache?.get(id)).filter(Boolean);
  if (roles.length < 2) return arr.slice(0, 2).map(id => `<@&${id}>`).join(', ') + ` +${arr.length - 2}`;
  roles.sort((a, b) => a.position - b.position);
  return `من ${roles[0]} إلى ${roles[roles.length - 1]} | الإجمالي: **${arr.length}** رتبة`;
}

async function handleResignButton(interaction, action, userId) {
  await interaction.deferUpdate().catch(() => {});
  const guild = interaction.guild;
  const cfg = getConfig();

  // التحقق من صلاحية الإدارة العليا
  const memberClicker = interaction.member;
  const hasAdmin = memberClicker.permissions.has('Administrator');
  const hasUpperRole = cfg.resign.upperManagementRoleId && memberClicker.roles.cache.has(cfg.resign.upperManagementRoleId);
  if (!hasAdmin && !hasUpperRole) {
    await interaction.followUp({ content: '❌ ليس لديك صلاحية لقبول أو رفض الاستقالات. يحتاج إلى رتبة الإدارة العليا أو صلاحية Administrator.', ephemeral: true });
    return;
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]);

  // تعطيل الأزرار بعد الاستخدام
  const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
  disabledRow.components.forEach(c => c.setDisabled(true));

  if (action === 'reject') {
    const { setFieldValue } = require('../utils/helpers');
    setFieldValue(newEmbed, '— الحالة', `❌ مرفوضة بواسطة ${interaction.user.tag}`);
    await interaction.editReply({ embeds: [newEmbed], components: [disabledRow] });
    if (member) member.send('❌ تم رفض طلب استقالتك.').catch(() => {});

    // سجل التدقيق
    const auditChannel = cfg.resign.auditLogChannelId ? await guild.channels.fetch(cfg.resign.auditLogChannelId).catch(() => null) : null;
    if (auditChannel) {
      const auditEmbed = new EmbedBuilder()
        .setTitle('📋 سجل استقالة — مرفوضة')
        .setColor(0xE74C3C)
        .addFields(
          { name: 'العضو', value: `${userId} (<@${userId}>)`, inline: true },
          { name: 'مقدم الطلب', value: interaction.message.embeds[0]?.fields?.[0]?.value || 'غير معروف', inline: true },
          { name: 'السبب', value: interaction.message.embeds[0]?.fields?.[2]?.value || 'غير معروف' },
          { name: 'رفض بواسطة', value: `${interaction.user.tag}`, inline: true },
          { name: 'وقت الرفض', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        )
        .setTimestamp();
      await auditChannel.send({ embeds: [auditEmbed] }).catch(() => {});
    }
    return;
  }

  // قبول الاستقالة
  if (!member) {
    return interaction.editReply({ content: '⚠️ العضو غير موجود في السيرفر.', components: [] });
  }

  // إزالة الرتب المحددة
  // استثناء الرتب المستثناة من السحب
  const exempted = cfg.resign.exemptedRoles || [];
  const removedRoles = cfg.resign.rolesToRemove.filter(roleId =>
    member.roles.cache.has(roleId) && !exempted.includes(roleId)
  );
  if (removedRoles.length) {
    await member.roles.remove(removedRoles).catch(() => {});
  }

  // إعطاء رتبة ما بعد الاستقالة
  if (cfg.resign.resignRoleId) {
    await member.roles.add(cfg.resign.resignRoleId).catch(() => {});
  }

  const { setFieldValue } = require('../utils/helpers');
  setFieldValue(newEmbed, '— الحالة', `✅ مقبولة بواسطة ${interaction.user.tag}`);
  await interaction.editReply({ embeds: [newEmbed], components: [disabledRow] });
  member.send('✅ تم قبول استقالتك من الإدارة.').catch(() => {});

  const logEmbed = new EmbedBuilder()
    .setTitle('✅ تم قبول استقالة')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'العضو', value: `${member} (${member.user.tag})` },
      { name: 'الرتب المُزالة', value: roleSummary(removedRoles, guild) },
      { name: 'قُبل بواسطة', value: `${interaction.user.tag}` },
    )
    .setTimestamp();
  await sendLog(guild, cfg.resign.logChannelId, { embeds: [logEmbed] });

  // سجل التدقيق
  const auditChannel = cfg.resign.auditLogChannelId ? await guild.channels.fetch(cfg.resign.auditLogChannelId).catch(() => null) : null;
  if (auditChannel) {
    const auditEmbed = new EmbedBuilder()
      .setTitle('📋 سجل استقالة — مقبولة')
      .setColor(0x2ECC71)
      .addFields(
        { name: 'العضو', value: `${member} (${member.user.tag})`, inline: true },
        { name: 'الرتب المُزالة', value: roleSummary(removedRoles, guild), inline: true },
        { name: 'السبب', value: interaction.message.embeds[0]?.fields?.[2]?.value || 'غير معروف' },
        { name: 'قبل بواسطة', value: `${interaction.user.tag}`, inline: true },
        { name: 'وقت القبول', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      )
      .setTimestamp();
    await auditChannel.send({ embeds: [auditEmbed] }).catch(() => {});
  }
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
        { name: '📄 الرتب المُزالة', value: roleSummary(r.rolesToRemove, interaction.guild) },
        { name: '🔴 السيرفرات المعطلة', value: disabledList },
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { handleResign, handleResignButton, handleDevSettings };

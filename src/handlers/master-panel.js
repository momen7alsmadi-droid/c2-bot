const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const { getLeaves, saveLeaves, getConfig, saveConfig } = require('../utils/storage');

const DEV_BOT_ID = '1387331972094890036';

// ------------------- /لوحة_المطور -------------------

async function handleMasterPanel(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) {
    return interaction.reply({ content: '❌ هذه اللوحة خاصة بمطور البوت فقط.', ephemeral: true });
  }

  const cfg = getConfig();
  const totalGuilds = interaction.client.guilds.cache.size;
  const leaves = getLeaves();
  const now = Date.now();
  const activeLeaves = Object.entries(leaves).filter(([_, l]) => l.endsAt > now).length;
  const disabledCount = cfg.disabledGuilds.length;

  const guildsList = interaction.client.guilds.cache
    .map(g => {
      const status = cfg.disabledGuilds.includes(g.id) ? '🔴' : '🟢';
      return `${status} ${g.name} - \`${g.id}\``;
    })
    .join('\n') || 'لا يوجد';

  const embed = new EmbedBuilder()
    .setTitle('🛠️ لوحة المطور')
    .setColor(0x9B59B6)
    .addFields(
      { name: '📊 إحصائيات', value: `سيرفرات: ${totalGuilds}\nمعطل: ${disabledCount}\nإجازات نشطة: ${activeLeaves}` },
      { name: '🌍 السيرفرات', value: guildsList.slice(0, 1020) },
    )
    .setFooter({ text: `@${interaction.user.tag}` })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_refresh').setLabel('🔄 تحديث الإجازات').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dev_resign_settings').setLabel('📄 إعدادات الاستقالة').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_disable').setLabel('🔴 تعطيل سيرفر').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dev_enable').setLabel('🟢 تفعيل سيرفر').setStyle(ButtonStyle.Success),
  );

  return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
}

// ------------------- التحديث -------------------

async function handleDevRefresh(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  await interaction.deferReply({ ephemeral: true });
  const result = await checkAllExpiredLeaves(interaction.client);
  const embed = new EmbedBuilder()
    .setTitle('🔄 تحديث الإجازات')
    .setColor(result.updated > 0 ? 0x2ECC71 : 0x95A5A6)
    .addFields({ name: '📊 النتيجة', value: `فحص: ${result.checked}\nتم إنهاء: ${result.updated}\nأخطاء: ${result.errors}` })
    .setTimestamp();
  return interaction.editReply({ embeds: [embed] });
}

async function checkAllExpiredLeaves(client) {
  const leaves = getLeaves();
  const now = Date.now();
  let checked = 0, updated = 0, errors = 0;
  for (const [userId, leave] of Object.entries(leaves)) {
    checked++;
    if (leave.endsAt > now) continue;
    updated++;
    try {
      const guild = await client.guilds.fetch(leave.guildId);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        if (leave.leaveRoleId && member.roles.cache.has(leave.leaveRoleId)) await member.roles.remove(leave.leaveRoleId).catch(() => {});
        for (const roleId of leave.removedRoles) {
          if (!member.roles.cache.has(roleId)) await member.roles.add(roleId).catch(() => {});
        }
        member.send('✅ انتهت اجازتك وتم إرجاع رتبك.').catch(() => {});
      }
    } catch (e) { errors++; }
    delete leaves[userId];
  }
  if (updated > 0) saveLeaves(leaves);
  return { checked, updated, errors };
}

// ------------------- تعطيل/تفعيل سيرفر -------------------

async function handleDevDisable(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  const cfg = getConfig();
  const guilds = interaction.client.guilds.cache;
  if (guilds.size === 0) return interaction.reply({ content: '❌ لا يوجد سيرفرات.', ephemeral: true });

  const row = new ActionRowBuilder().addComponents(
    ...guilds.map(g =>
      new ButtonBuilder()
        .setCustomId(`dev_disable_${g.id}`)
        .setLabel(g.name.slice(0, 20))
        .setStyle(ButtonStyle.Danger)
    ).slice(0, 5)
  );
  await interaction.reply({ content: '🔴 اختر السيرفر لتعطيله:', components: [row], ephemeral: true });
}

async function handleDevEnable(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  const cfg = getConfig();
  if (cfg.disabledGuilds.length === 0) return interaction.reply({ content: '✅ لا يوجد سيرفرات معطلة.', ephemeral: true });

  const guilds = interaction.client.guilds.cache;
  const row = new ActionRowBuilder().addComponents(
    ...cfg.disabledGuilds.map(id => {
      const g = guilds.get(id);
      return new ButtonBuilder()
        .setCustomId(`dev_enable_${id}`)
        .setLabel(g ? g.name.slice(0, 20) : id.slice(0, 15))
        .setStyle(ButtonStyle.Success);
    }).slice(0, 5)
  );
  await interaction.reply({ content: '🟢 اختر السيرفر لتفعيله:', components: [row], ephemeral: true });
}

async function handleDevToggle(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  const [_, action, guildId] = interaction.customId.split('_');
  const cfg = getConfig();

  if (action === 'disable') {
    if (!cfg.disabledGuilds.includes(guildId)) cfg.disabledGuilds.push(guildId);
    saveConfig(cfg);
    await interaction.update({ content: `🔴 تم تعطيل البوت في \`${guildId}\``, components: [] });
  } else if (action === 'enable') {
    cfg.disabledGuilds = cfg.disabledGuilds.filter(id => id !== guildId);
    saveConfig(cfg);
    await interaction.update({ content: `🟢 تم تفعيل البوت في \`${guildId}\``, components: [] });
  }
}

module.exports = { handleMasterPanel, handleDevRefresh, handleDevDisable, handleDevEnable, handleDevToggle, DEV_BOT_ID };

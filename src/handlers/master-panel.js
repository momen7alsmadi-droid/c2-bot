const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { version } = require('../../package.json');
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
    .setFooter({ text: `الإصدار: ${version} | @${interaction.user.tag}` })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_refresh').setLabel('🔄 تحديث الإجازات').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_disable').setLabel('🔴 تعطيل سيرفر').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dev_enable').setLabel('🟢 تفعيل سيرفر').setStyle(ButtonStyle.Success),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_disable_all').setLabel('🔴🔴 إطفاء الكل').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dev_enable_all').setLabel('🟢🟢 تشغيل الكل').setStyle(ButtonStyle.Success),
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_check_db').setLabel('🗄️ فحص MongoDB').setStyle(ButtonStyle.Secondary),
  );

  return interaction.reply({ embeds: [embed], components: [row1, row2, row3, row4], ephemeral: true });
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

  if (guildId === 'all') {
    if (action === 'disable') {
      const allIds = [...interaction.client.guilds.cache.keys()];
      for (const id of allIds) {
        if (!cfg.disabledGuilds.includes(id)) cfg.disabledGuilds.push(id);
      }
      saveConfig(cfg);
      await interaction.reply({ content: `🔴 تم إطفاء البوت في **جميع السيرفرات** (${allIds.length})`, ephemeral: true });
    } else if (action === 'enable') {
      cfg.disabledGuilds = [];
      saveConfig(cfg);
      await interaction.reply({ content: `🟢 تم تشغيل البوت في **جميع السيرفرات**`, ephemeral: true });
    }
    return;
  }

  if (action === 'disable') {
    if (!cfg.disabledGuilds.includes(guildId)) cfg.disabledGuilds.push(guildId);
    saveConfig(cfg);
    await interaction.reply({ content: `🔴 تم تعطيل البوت في \`${guildId}\``, ephemeral: true });
  } else if (action === 'enable') {
    cfg.disabledGuilds = cfg.disabledGuilds.filter(id => id !== guildId);
    saveConfig(cfg);
    await interaction.reply({ content: `🟢 تم تفعيل البوت في \`${guildId}\``, ephemeral: true });
  }
}

// ------------------- تحديث اللوحة -------------------

async function handleDevRefreshPanel(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;

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
    .setFooter({ text: `الإصدار: ${version} | @${interaction.user.tag}` })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_refresh_panel').setLabel('🔄 تحديث اللوحة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dev_refresh').setLabel('🔄 تحديث الإجازات').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_disable').setLabel('🔴 تعطيل سيرفر').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dev_enable').setLabel('🟢 تفعيل سيرفر').setStyle(ButtonStyle.Success),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_disable_all').setLabel('🔴🔴 إطفاء الكل').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dev_enable_all').setLabel('🟢🟢 تشغيل الكل').setStyle(ButtonStyle.Success),
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_check_db').setLabel('🗄️ فحص MongoDB').setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ embeds: [embed], components: [row1, row2, row3, row4] });
}

// ------------------- فحص MongoDB -------------------

async function handleDevCheckDb(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  await interaction.deferReply({ ephemeral: true });

  const mongoose = require('mongoose');
  const os = require('os');

  // قراءة آخر الأخطاء المسجلة
  const errorLogPath = path.join(__dirname, '..', '..', 'data', 'error-log.json');
  let recentErrors = '';
  try {
    if (fs.existsSync(errorLogPath)) {
      const log = JSON.parse(fs.readFileSync(errorLogPath, 'utf8'));
      if (Array.isArray(log) && log.length > 0) {
        const latest = log.slice(0, 5);
        recentErrors = '\n\n**🆘 آخر الأخطاء:**\n';
        recentErrors += latest.map(e => {
          const date = new Date(e.ts).toLocaleString('ar-EG');
          return `\`${date}\` [${e.type}] ${e.id}\n└ ${e.msg}`;
        }).join('\n');
      }
    }
  } catch { /* ignore */ }

  let status = '';
  const readyState = mongoose.connection.readyState;
  const stateNames = { 0: '❌ disconnected', 1: '✅ connected', 2: '⏳ connecting', 3: '⚠️ disconnecting' };
  status += `**الحالة:** ${stateNames[readyState] || '❓ غير معروف'}\n\n`;

  if (readyState === 1) {
    // اختبار كتابة/قراءة
    try {
      const testCollection = mongoose.connection.db.collection('_diag_test');
      const testDoc = { test: true, timestamp: new Date(), host: os.hostname(), pid: process.pid };
      await testCollection.insertOne(testDoc);
      const readBack = await testCollection.findOne({ _id: testDoc._id });
      await testCollection.deleteOne({ _id: testDoc._id });
      status += '✅ **اختبار الكتابة/القراءة:** ناجح ✅\n';
      status += `📊 **عدد قواعد البيانات:** ${(await mongoose.connection.db.admin().listDatabases()).databases.length}\n`;
      status += `🗄️ **قاعدة البيانات الحالية:** ${mongoose.connection.db.databaseName}\n`;
    } catch (e) {
      status += `❌ **اختبار الكتابة فشل:** \`${e.message}\`\n`;
    }
  } else {
    status += '⚠️ **غير متصل.** لا يمكن إجراء اختبارات.\n';
    status += '🔧 **حلول:**\n';
    status += '1. تأكد من متغير MONGODB_URI في Railway Dashboard\n';
    status += '2. أضف 0.0.0.0/0 في MongoDB Atlas → Network Access\n';
    status += '3. أعد تشغيل البوت من Railway\n';
  }

  status += `${recentErrors}`;
  status += `\n🖥️ **المضيف:** ${os.hostname()} | **PID:** ${process.pid}`;
  status += `\n⏰ **آخر فحص:** <t:${Math.floor(Date.now() / 1000)}:R>`;

  const embed = new EmbedBuilder()
    .setTitle('🗄️ تشخيص قاعدة البيانات')
    .setColor(readyState === 1 ? 0x2ECC71 : 0xE74C3C)
    .setDescription(status)
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

module.exports = { handleMasterPanel, handleDevRefresh, handleDevRefreshPanel, handleDevDisable, handleDevEnable, handleDevToggle, handleDevCheckDb, DEV_BOT_ID };

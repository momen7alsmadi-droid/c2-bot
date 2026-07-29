const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ChannelSelectMenuBuilder, ChannelType
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { version } = require('../../package.json');
const { getLeaves, saveLeaves, getConfig, saveConfig } = require('../utils/storage');

const DEV_BOT_ID = '1387331972094890036';

// ========== دالة مساعدة لبناء إيمبد الإحصائيات ==========

function buildStatsEmbed(interaction, cfg) {
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

  return new EmbedBuilder()
    .setTitle('🛠️ لوحة المطور')
    .setColor(0x9B59B6)
    .addFields(
      { name: '📊 إحصائيات', value: `سيرفرات: ${totalGuilds}\nمعطل: ${disabledCount}\nإجازات نشطة: ${activeLeaves}` },
      { name: '🌍 السيرفرات', value: guildsList.slice(0, 1020) },
    )
    .setFooter({ text: `الإصدار: ${version} | @${interaction.user.tag}` })
    .setTimestamp();
}

// =================== الواجهة الرئيسية (Page Main) ===================

async function handleMasterPanel(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) {
    return interaction.reply({ content: '❌ هذه اللوحة خاصة بمطور البوت فقط.', ephemeral: true });
  }

  // إذا كان ضغطة زر → نؤجل التحديث فوراً قبل أي جلب
  if (!interaction.isCommand()) {
    await interaction.deferUpdate().catch(() => {});
  }

  const cfg = getConfig();
  const embed = buildStatsEmbed(interaction, cfg);

  // صف أول: 4 أزرار رئيسية (التحكم، الرومات، الحالة، التحديث) + صف ثاني: زر فحص القاعدة فقط
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_main_control').setLabel('🎮 التحكم بالتشغيل').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_main_rooms').setLabel('📡 إعدادات الرومات').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_main_status').setLabel('📊 حالة النظام').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_main_refresh').setLabel('🔄 تحديث اللوحة').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_check_db').setLabel('🗄️ فحص القاعدة').setStyle(ButtonStyle.Secondary),
    ),
  ];

  if (interaction.isCommand()) {
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }
  return interaction.editReply({ embeds: [embed], components });
}

// =================== 🔄 تحديث اللوحة الرئيسية ===================

async function handleDevRefreshPanel(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  await interaction.deferUpdate().catch(() => {});

  const cfg = getConfig();
  const embed = buildStatsEmbed(interaction, cfg);
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_main_control').setLabel('🎮 التحكم بالتشغيل').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_main_rooms').setLabel('📡 إعدادات الرومات').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_main_status').setLabel('📊 حالة النظام').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_main_refresh').setLabel('🔄 تحديث اللوحة').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_check_db').setLabel('🗄️ فحص القاعدة').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return interaction.editReply({ embeds: [embed], components });
}

// =================== 🎮 التحكم بالتشغيل ===================

async function showControlPage(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  const cfg = getConfig();
  const disabledCount = cfg.disabledGuilds.length;
  const totalGuilds = interaction.client.guilds.cache.size;

  const embed = new EmbedBuilder()
    .setTitle('🎮 التحكم بالتشغيل')
    .setColor(0xE67E22)
    .setDescription('تحكم في تشغيل وتعطيل البوت على السيرفرات')
    .addFields(
      { name: '📊 الإحصائيات', value: `إجمالي السيرفرات: ${totalGuilds}\nالسيرفرات المعطلة: ${disabledCount}` },
    )
    .setFooter({ text: `الإصدار: ${version} | @${interaction.user.tag}` })
    .setTimestamp();

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_enable').setLabel('🟢 تفعيل سيرفر').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_disable').setLabel('🔴 تعطيل سيرفر').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dev_enable_all').setLabel('🟢🟢 تشغيل الكل').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dev_disable_all').setLabel('🔴🔴 إطفاء الكل').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_refresh').setLabel('🔄 تحديث الإجازات').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev_back_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return interaction.update({ embeds: [embed], components });
}

// =================== 📡 إعدادات الرومات ===================

async function showRoomsPage(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  await interaction.deferUpdate().catch(() => {});
  const cfg = getConfig();

  const embed = new EmbedBuilder()
    .setTitle('📡 إعدادات الرومات')
    .setColor(0x3498DB)
    .setDescription('اختر الرومات المخصصة لكل خدمة')
    .addFields(
      { name: '📡 روم حالة البوت', value: cfg.statusChannelId ? `<#${cfg.statusChannelId}>` : '❌ غير محدد', inline: false },
      { name: '🗄️ روم حالة قاعدة البيانات', value: cfg.dbStatusChannelId ? `<#${cfg.dbStatusChannelId}>` : '❌ غير محدد', inline: false },
      { name: '🚨 روم الأخطاء التلقائي', value: cfg.errorLogChannelId ? `<#${cfg.errorLogChannelId}>` : '❌ غير محدد', inline: false },
    )
    .setFooter({ text: `الإصدار: ${version} | @${interaction.user.tag}` })
    .setTimestamp();

  const components = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('dev_ch_status')
        .setPlaceholder('📡 اختر روم حالة البوت')
        .setChannelTypes(ChannelType.GuildText)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('dev_ch_db')
        .setPlaceholder('🗄️ اختر روم حالة قاعدة البيانات')
        .setChannelTypes(ChannelType.GuildText)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('dev_ch_error')
        .setPlaceholder('🚨 اختر روم الأخطاء التلقائي')
        .setChannelTypes(ChannelType.GuildText)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_back_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return interaction.editReply({ embeds: [embed], components });
}

// =================== 📊 حالة النظام ===================

async function showStatusPage(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  await interaction.deferUpdate().catch(() => {});

  const os = require('os');

  // --- حالة البوت ---
  const ping = interaction.client.ws.ping;
  const uptimeSeconds = Math.floor(process.uptime());
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const totalGuilds = interaction.client.guilds.cache.size;
  const totalMembers = interaction.client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);

  // --- حالة القاعدة ---
  const readyState = mongoose.connection.readyState;
  const stateNames = { 0: '❌ غير متصلة', 1: '✅ متصلة', 2: '⏳ جاري الاتصال', 3: '⚠️ يتم قطع الاتصال' };

  // --- مدة اتصال القاعدة ---
  let dbUptime = 'غير متصلة';
  if (readyState === 1 && mongoose.connection.db) {
    try {
      const serverStatus = await mongoose.connection.db.admin().serverStatus().catch(() => null);
      if (serverStatus && serverStatus.uptimeMillis) {
        const dbUpSec = Math.floor(serverStatus.uptimeMillis / 1000);
        const dbD = Math.floor(dbUpSec / 86400);
        const dbH = Math.floor((dbUpSec % 86400) / 3600);
        const dbM = Math.floor((dbUpSec % 3600) / 60);
        dbUptime = `${dbD}ي ${dbH}س ${dbM}د`;
      } else {
        dbUptime = 'متصلة (مدة غير متوفرة)';
      }
    } catch { dbUptime = 'متصلة (مدة غير متوفرة)'; }
  }

  // --- آخر الأخطاء المسجلة بوقتها ---
  const errorLogPath = path.join(__dirname, '..', '..', 'data', 'error-log.json');
  let recentErrors = 'لا توجد أخطاء مسجلة';
  try {
    if (fs.existsSync(errorLogPath)) {
      const log = JSON.parse(fs.readFileSync(errorLogPath, 'utf8'));
      if (Array.isArray(log) && log.length > 0) {
        recentErrors = log.slice(0, 5).map(e => {
          const date = new Date(e.ts).toLocaleString('ar-EG');
          return `\`${date}\` **${e.type}** — ${e.msg.slice(0, 100)}`;
        }).join('\n');
      }
    }
  } catch { /* ignore */ }

  const embed = new EmbedBuilder()
    .setTitle('📊 حالة النظام')
    .setColor(0x2ECC71)
    .addFields(
      { name: '🤖 البوت', value: `Ping: **${ping}ms**\nUptime: **${days}ي ${hours}س ${minutes}د**\nسيرفرات: **${totalGuilds}**\nأعضاء: **${totalMembers}**`, inline: true },
      { name: '🗄️ قاعدة البيانات', value: `الحالة: **${stateNames[readyState] || '❓'}**\nمدة الاتصال: **${dbUptime}**`, inline: true },
      { name: '🖥️ النظام', value: `المضيف: \`${os.hostname()}\`\nPID: **${process.pid}**\nالإصدار: **${version}**`, inline: false },
      { name: '🚨 آخر الأخطاء', value: recentErrors, inline: false },
    )
    .setFooter({ text: `آخر تحديث` })
    .setTimestamp();

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dev_back_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return interaction.editReply({ embeds: [embed], components });
}

// =================== تحديث الإجازات ===================

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

// =================== تعطيل/تفعيل سيرفر معين ===================

async function handleDevDisable(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  const guilds = interaction.client.guilds.cache;
  if (guilds.size === 0) return showControlPage(interaction);

  const embed = new EmbedBuilder()
    .setTitle('🔴 تعطيل سيرفر')
    .setColor(0xE74C3C)
    .setDescription('اختر السيرفر الذي تريد تعطيل البوت فيه:')
    .setTimestamp();

  const guildArr = [...guilds.values()];
  const rows = [];
  for (let i = 0; i < guildArr.length && rows.length < 4; i += 5) {
    const chunk = guildArr.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(
      ...chunk.map(g =>
        new ButtonBuilder()
          .setCustomId(`dev_disable_${g.id}`)
          .setLabel(g.name.slice(0, 20))
          .setStyle(ButtonStyle.Danger)
      )
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_back_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary),
  ));

  return interaction.update({ embeds: [embed], components: rows.slice(0, 5) });
}

async function handleDevEnable(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  const cfg = getConfig();
  if (cfg.disabledGuilds.length === 0) return showControlPage(interaction);

  const guilds = interaction.client.guilds.cache;
  const embed = new EmbedBuilder()
    .setTitle('🟢 تفعيل سيرفر')
    .setColor(0x2ECC71)
    .setDescription('اختر السيرفر الذي تريد تفعيل البوت فيه:')
    .setTimestamp();

  const rows = [];
  for (let i = 0; i < cfg.disabledGuilds.length && rows.length < 4; i += 5) {
    const chunk = cfg.disabledGuilds.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(
      ...chunk.map(id => {
        const g = guilds.get(id);
        return new ButtonBuilder()
          .setCustomId(`dev_enable_${id}`)
          .setLabel(g ? g.name.slice(0, 20) : id.slice(0, 15))
          .setStyle(ButtonStyle.Success);
      })
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev_back_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary),
  ));

  return interaction.update({ embeds: [embed], components: rows.slice(0, 5) });
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
    } else if (action === 'enable') {
      cfg.disabledGuilds = [];
      saveConfig(cfg);
    }
    return showControlPage(interaction);
  }

  if (action === 'disable') {
    if (!cfg.disabledGuilds.includes(guildId)) cfg.disabledGuilds.push(guildId);
    saveConfig(cfg);
  } else if (action === 'enable') {
    cfg.disabledGuilds = cfg.disabledGuilds.filter(id => id !== guildId);
    saveConfig(cfg);
  }
  return showControlPage(interaction);
}

// =================== فحص MongoDB ===================

async function handleDevCheckDb(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;
  await interaction.deferReply({ ephemeral: true });

  const os = require('os');
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
    status += '1. تأكد من متغير MONGODB_URI في الإعدادات\n';
    status += '2. أضف 0.0.0.0/0 في MongoDB Atlas → Network Access\n';
    status += '3. أعد تشغيل البوت\n';
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

// =================== اختيار الرومات (قنوات) ===================

async function handleDevChannelSelect(interaction) {
  if (interaction.user.id !== DEV_BOT_ID) return;

  const id = interaction.customId;
  const channelId = interaction.values[0];
  const cfg = getConfig();

  if (id === 'dev_ch_status') cfg.statusChannelId = channelId;
  else if (id === 'dev_ch_db') cfg.dbStatusChannelId = channelId;
  else if (id === 'dev_ch_error') cfg.errorLogChannelId = channelId;
  else return;
  saveConfig(cfg);

  return showRoomsPage(interaction);
}

module.exports = {
  handleMasterPanel, handleDevRefresh, handleDevRefreshPanel,
  handleDevDisable, handleDevEnable, handleDevToggle,
  handleDevCheckDb, handleDevChannelSelect,
  showControlPage, showRoomsPage, showStatusPage,
  DEV_BOT_ID
};

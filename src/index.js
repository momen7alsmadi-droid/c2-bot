require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const express = require('express');
const { connectDatabase } = require('./utils/database');
const { getConfig, ensureConfigLoaded, initModels } = require('./utils/storage');

const {
  handleLeaveCommand, handleLeaveModalSubmit, handleLeaveButton,
  handleLeaveSettings, checkExpiredLeaves, CHECK_INTERVAL_MS
} = require('./handlers/leave');
const { handleDaleelCommand, handleDaleelSettings } = require('./handlers/daleel');
const { handleReportCommand, handleReportButton, handleReportSettings } = require('./handlers/report');
const { handleResign, handleResignButton, handleDevSettings } = require('./handlers/resign');
const { handleMasterPanel, handleDevRefresh, handleDevDisable, handleDevEnable, handleDevToggle } = require('./handlers/master-panel');
const { handleHelp } = require('./handlers/help');
const { handleBroadcast } = require('./handlers/broadcast');
const { handleSettings, showSettingsPage, handleSettingsSelect } = require('./handlers/settings');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember]
});

// ---------- Express healthcheck server (لـ Render) ----------
const app = express();
app.get('/', (req, res) => res.send('Bot is alive! 🤖'));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 Healthcheck server running on port ${PORT}`);
});

// ---------- وظيفة إرسال رسالة كل 14 دقيقة ----------
const PING_INTERVAL_MS = 30 * 60 * 1000; // 30 دقيقة

async function sendPingMessage() {
  const channelId = process.env.PING_CHANNEL_ID;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.warn('⚠️ PING_CHANNEL_ID غير صحيح أو الروم غير موجود.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ البوت شغال')
      .setColor(0x2ECC71)
      .setDescription(`آخر نشاط: <t:${Math.floor(Date.now() / 1000)}:R>`)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log('✅ تم إرسال رسالة البقاء شغالاً إلى الروم المحدد');
  } catch (err) {
    console.error('❌ فشل إرسال رسالة البقاء شغالاً:', err.message);
  }
}

// ---------- الاتصال بقاعدة البيانات ----------
async function initialize() {
  const dbConnected = await connectDatabase();
  initModels();
  if (dbConnected) {
    await ensureConfigLoaded();
    console.log('📦 تم تحميل الإعدادات من MongoDB');
  }

  // بدء إرسال رسالة كل 14 دقيقة بعد ما البوت يشتغل
  client.once('ready', () => {
    console.log(`✅ البوت شغّال باسم ${client.user.tag}`);
    
    // إرسال أول رسالة فور التشغيل
    setTimeout(() => sendPingMessage(), 5000);
    // ثم كل 14 دقيقة
    setInterval(sendPingMessage, PING_INTERVAL_MS);

    // فحص الاجازات المنتهية
    checkExpiredLeaves(client);
    setInterval(() => checkExpiredLeaves(client), CHECK_INTERVAL_MS);
  });
}

initialize();

// ------------------- التفاعلات -------------------

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.guild && interaction.user.id !== '1387331972094890036') {
      const cfg = getConfig();
      if (cfg.disabledGuilds.includes(interaction.guild.id)) return;
    }

    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu()) {
      await handleSettingsSelect(interaction);
    }
  } catch (err) {
    console.error('❌ ERROR [' + interaction.customId + ']:', err.message, err.stack);
    try {
      if (interaction.isRepliable()) {
        if (interaction.deferred) {
          await interaction.editReply({ content: '⚠️ خطأ غير متوقع.', embeds: [], components: [] }).catch(() => {});
        } else if (!interaction.replied) {
          await interaction.reply({ content: '⚠️ خطأ غير متوقع.', ephemeral: true }).catch(() => {});
        }
      }
    } catch(e) { console.error('Reply error:', e.message); }
  }
});

async function handleSlashCommand(interaction) {
  const { commandName } = interaction;
  const cfg = getConfig();

  switch (commandName) {
    case 'اجازة': return handleLeaveCommand(interaction, cfg);
    case 'دليل': return handleDaleelCommand(interaction, cfg);
    case 'بلاغ': return handleReportCommand(interaction, cfg);
    case 'استقالة': return handleResign(interaction);
    case 'مساعدة': return handleHelp(interaction);
    case 'اعدادات': return handleSettings(interaction);
    case 'لوحة_المطور': return handleMasterPanel(interaction);
    case 'broadcast': return handleBroadcast(interaction);
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId === 'modal_leave') return handleLeaveModalSubmit(interaction);
}

async function handleButton(interaction) {
  const id = interaction.customId;
  const parts = id.split('_');
  const prefix = parts[0];

  if (prefix === 'leave') {
    const action = parts[1];
    const userId = parts[2];
    const daysStr = parts[3];
    return handleLeaveButton(interaction, action, userId, daysStr);
  }

  if (prefix === 'blagh') {
    const action = parts[1];
    const reportId = parts[2];
    return handleReportButton(interaction, action, reportId);
  }

  if (prefix === 'resign') {
    const action = parts[1];
    const userId = parts[2];
    return handleResignButton(interaction, action, userId);
  }

  if (id === 'settings_back') {
    return handleSettings(interaction);
  }
  if (id === 'set_leave') return showSettingsPage(interaction, 'leave', 1);
  if (id === 'set_leave_1') return showSettingsPage(interaction, 'leave', 1);
  if (id === 'set_leave_2') return showSettingsPage(interaction, 'leave', 2);
  if (id === 'set_daleel') return showSettingsPage(interaction, 'daleel', 1);
  if (id === 'set_report') return showSettingsPage(interaction, 'report', 1);
  if (id === 'set_report_1') return showSettingsPage(interaction, 'report', 1);
  if (id === 'set_report_2') return showSettingsPage(interaction, 'report', 2);
  if (id === 'set_report_3') return showSettingsPage(interaction, 'report', 3);
  if (id === 'set_resign') return showSettingsPage(interaction, 'resign', 1);
  if (id === 'set_resign_1') return showSettingsPage(interaction, 'resign', 1);
  if (id === 'set_resign_2') return showSettingsPage(interaction, 'resign', 2);
  if (id.startsWith('sl_report_cd_')) {
    return handleSettingsSelect(interaction);
  }

  if (prefix === 'dev') {
    const action = parts[1];
    if (action === 'refresh') return handleDevRefresh(interaction);
    if (action === 'disable' && parts.length === 2) return handleDevDisable(interaction);
    if (action === 'enable' && parts.length === 2) return handleDevEnable(interaction);
    if (action === 'disable' || action === 'enable') return handleDevToggle(interaction);
  }
}

client.login(process.env.BOT_TOKEN);

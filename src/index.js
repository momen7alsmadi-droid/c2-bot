require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const express = require('express');
const { connectDatabase } = require('./utils/database');
const { getConfig, saveConfig, ensureConfigLoaded, ensureReportsLoaded, initModels } = require('./utils/storage');

const {
  handleLeaveCommand, handleLeaveModalSubmit, handleLeaveButton,
  handleLeaveSettings, checkExpiredLeaves, CHECK_INTERVAL_MS
} = require('./handlers/leave');
const { handleDaleelCommand, handleDaleelSettings } = require('./handlers/daleel');
const { handleReportCommand, handleReportButton, handleReportSettings } = require('./handlers/report');
const { handleResign, handleResignButton, handleDevSettings } = require('./handlers/resign');
const { handleMasterPanel, handleDevRefresh, handleDevRefreshPanel, handleDevDisable, handleDevEnable, handleDevToggle, handleDevCheckDb } = require('./handlers/master-panel');
const { handleHelp } = require('./handlers/help');
const { handleBroadcast } = require('./handlers/broadcast');
const { handleColorsCommand } = require('./handlers/colors');
const { handleSettings, showSettingsPage, handleSettingsSelect, handleDbCheck } = require('./handlers/settings');
const { handleColorAutocomplete } = require('./handlers/broadcast');
const { handleEmbedsInteraction, handleEmbedsModal, handleEmbedsMain } = require('./handlers/embeds');
const { initEmbedModel } = require('./utils/embedStorage');
const { handleAutoReplyInteraction, handleAutoReplyModal, handleAutoReplyMain, handleMessage } = require('./handlers/autoReply');
const { handleReactInteraction, handleReactModal, handleReactMain, handleReactMessage } = require('./handlers/reactReply');
const { showFeaturedSettings, handleFeaturedInteraction, handleFeaturedModal, handleFeaturedMessage, handleFeaturedReaction } = require('./handlers/featured');
const { initFeaturedModels, ensureFeaturedConfigLoaded, loadFeaturedPostsFromMongo } = require('./utils/featuredStorage');
const { initAutoReplyModel, syncJsonToMongo: syncAr } = require('./utils/autoReplyStorage');
const { initReactModel, syncJsonToMongo: syncRr } = require('./utils/reactionReplyStorage');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Reaction, Partials.Channel]
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
  const embedReady = initEmbedModel();
  const arReady = initAutoReplyModel();
  const rrReady = initReactModel();
  const featReady = initFeaturedModels();

  // تأكيد حالة التخزين
  console.log('\n═══════════════════════════════════════');
  console.log('📊 حالة التخزين:');
  console.log(`   ${dbConnected ? '✅' : '❌'} MongoDB`);
  console.log(`   ${embedReady ? '✅' : '⚠️'} Embed Storage`);
  console.log(`   ${arReady ? '✅' : '⚠️'} AutoReply Storage`);
  console.log(`   ${rrReady ? '✅' : '⚠️'} Reaction Storage`);
  console.log('═══════════════════════════════════════\n');

  if (dbConnected) {
    await ensureConfigLoaded();
    console.log('📦 تم تحميل الإعدادات من MongoDB');
    await ensureReportsLoaded();
    console.log('📦 تم تحميل البلاغات من MongoDB');
    if (embedReady) {
      const { syncJsonToMongo } = require('./utils/embedStorage');
      await syncJsonToMongo();
    }
    if (arReady) { await syncAr(); }
    if (rrReady) { await syncRr(); }
    await ensureFeaturedConfigLoaded();
    await loadFeaturedPostsFromMongo();
  } else {
    console.log('⚠️ MongoDB غير متصل. التخزين عبر JSON فقط.');
    console.log('⚠️ سيتم إعادة محاولة الاتصال كل 30 ثانية...');
    // محاولة إعادة الاتصال بشكل دوري
    const retryInterval = setInterval(async () => {
      if (mongoose.connection.readyState === 1) {
        clearInterval(retryInterval);
        console.log('✅ تم استعادة الاتصال بقاعدة البيانات!');
        // إعادة تهيئة النماذج
        initModels();
        initEmbedModel();
        initAutoReplyModel();
        initReactModel();
        await ensureConfigLoaded();
        const { syncJsonToMongo: syncEmbeds } = require('./utils/embedStorage');
        await syncEmbeds();
        await syncAr();
        await syncRr();
      } else {
        try {
          const { connectDatabase } = require('./utils/database');
          await connectDatabase();
        } catch(e) { /* ignore */ }
      }
    }, 30000);
  }

  // تعطيل البوت تلقائياً عند دخوله سيرفر جديد
  client.on('guildCreate', async (guild) => {
    const cfg = getConfig();
    if (!cfg.disabledGuilds.includes(guild.id)) {
      cfg.disabledGuilds.push(guild.id);
      saveConfig(cfg);
      console.log(`🔴 تم تعطيل البوت تلقائياً في السيرفر الجديد: ${guild.name} (${guild.id})`);
    }
    // إرسال إشعار للمطور
    try {
      const dev = await client.users.fetch('1387331972094890036');
      if (dev) {
        await dev.send(`🔴 تمت إضافة البوت إلى سيرفر جديد وتم تعطيله تلقائياً.
\`\`\`
الاسم: ${guild.name}
ID: ${guild.id}
الأعضاء: ${guild.memberCount}
\`\`\`
استخدم \`/لوحة_المطور\` لتفعيله.`);
      }
    } catch (e) {
      console.error('❌ فشل إرسال إشعار للمطور:', e.message);
    }
  });

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

    // تسجيل مستقبل الرسائل للردود التلقائية والتفاعلات
    console.log('👂 تم تفعيل مراقبة الرسائل للردود التلقائية والتفاعلات');
  });

  // معالج الرسائل (messageCreate) - مع فترة سماح عند بدء التشغيل
  let startupGrace = true;
  setTimeout(() => { startupGrace = false; console.log('👂 فترة سماح بدء التشغيل انتهت — جاهز لاستقبال الرسائل'); }, 6000);

  client.on('messageCreate', async (message) => {
    if (startupGrace) {
      console.log('⏳ فترة السماح... تجاهل رسالة', message.id);
      return;
    }
    try {
      console.log('📨 رسالة جديدة:', message.id, 'channel:', message.channel?.id, 'author:', message.author?.tag);
      await handleMessage(message);
      await handleReactMessage(message);
      await handleFeaturedMessage(message);
    } catch (e) {
      console.error('❌ messageCreate error:', e.message);
    }
  });
}

initialize();

// ========== نظام تسجيل الأخطاء (Error Log) ==========
const ERROR_LOG_PATH = path.join(__dirname, '..', 'data', 'error-log.json');
const MAX_LOG = 50;

function logError(type, id, err) {
  try {
    const entry = { ts: Date.now(), type, id, msg: err.message, stack: (err.stack || '').split('\n').slice(0, 5).join('\n') };
    let log = [];
    try {
      if (fs.existsSync(ERROR_LOG_PATH)) {
        log = JSON.parse(fs.readFileSync(ERROR_LOG_PATH, 'utf8'));
        if (!Array.isArray(log)) log = [];
      }
    } catch { log = []; }
    log.unshift(entry);
    if (log.length > MAX_LOG) log = log.slice(0, MAX_LOG);
    fs.writeFileSync(ERROR_LOG_PATH, JSON.stringify(log, null, 2), 'utf8');
  } catch { /* ignore */ }
}

// ------------------- التفاعلات -------------------

/** دالة آمنة لجلب الإعدادات - لا ترمي أخطاء أبداً */
function safeGetConfig() {
  try {
    return getConfig();
  } catch (e) {
    console.error('❌ safeGetConfig فشل:', e.message);
    // إرجاع إعدادات افتراضية آمنة
    return {
      leave: { allowedRoleId: null, requestChannelId: null, rolesToRemove: [], exemptedRoles: [], leaveRoleId: null, logChannelId: null },
      daleel: { allowedRoleId: null, channelId: null, logChannelId: null },
      report: { allowedRoleId: null, adminRoleId: null, channelId: null, warning1RoleId: null, warning2RoleId: null, warning3RoleId: null, upperManagementRoleId: null, upperManagementChannelId: null, logChannelId: null, cooldownEnabled: true, cooldownDuration: 60 },
      resign: { allowedRoleId: null, logChannelId: null, rolesToRemove: [], exemptedRoles: [], resignRoleId: null, upperManagementRoleId: null },
      disabledGuilds: []
    };
  }
}

client.on('interactionCreate', async (interaction) => {
  try {
    // فحص التعطيل بأمان
    if (interaction.guild && interaction.user.id !== '1387331972094890036') {
      try {
        const cfg = safeGetConfig();
        const disabled = Array.isArray(cfg.disabledGuilds) ? cfg.disabledGuilds : [];
        if (disabled.includes(interaction.guild.id)) return;
      } catch (e) {
        console.error('⚠️ فشل فحص التعطيل:', e.message);
      }
    }

    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isAutocomplete()) {
      try {
        if (interaction.commandName === 'broadcast' && interaction.options.getFocused(true).name === 'color') {
          await handleColorAutocomplete(interaction);
        }
      } catch (acErr) {
        console.error('❌ Autocomplete error:', acErr.message);
      }
    } else if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu()) {
      console.log('🔽 Select Menu:', interaction.customId, 'values:', interaction.values);
      if (interaction.customId.startsWith('emb_')) {
        await handleEmbedsInteraction(interaction);
      } else if (interaction.customId.startsWith('ar_') || interaction.customId.startsWith('rr_')) {
        await handleAutoReplyInteraction(interaction);
      } else if (interaction.customId.startsWith('feat_')) {
        await handleFeaturedInteraction(interaction);
      } else {
        await handleSettingsSelect(interaction);
      }
    }
  } catch (err) {
    const type = interaction.isChatInputCommand() ? 'CMD' : interaction.isModalSubmit() ? 'MODAL' : interaction.isButton() ? 'BTN' : interaction.isAutocomplete() ? 'AC' : 'SELECT';
    const id = interaction.customId || interaction.commandName || '?';
    const replyState = interaction.replied ? 'REPLIED' : interaction.deferred ? 'DEFERRED' : 'FRESH';
    // ===== طباعة الخطأ كاملاً في الـ Console =====
    console.error(`\n========== ❌ ERROR [${type}] [${id}] (${replyState}) ==========`);
    console.error('Message:', err.message);
    console.error('Full Stack:');
    console.error(err.stack || '(no stack trace)');
    console.error('========================================================\n');
    logError(type, id, err);
    try {
      if (interaction.isRepliable()) {
        if (interaction.deferred) {
          await interaction.editReply({ content: '⚠️ خطأ غير متوقع.', embeds: [], components: [] }).catch(() => {});
        } else if (!interaction.replied) {
          await interaction.reply({ content: '⚠️ خطأ غير متوقع.', ephemeral: true }).catch(() => {});
        }
      }
    } catch(e) { console.error('❌ Reply error:', e.message); }
  }
});

/** معالج آمن للأوامر */
async function handleSlashCommand(interaction) {
  const { commandName } = interaction;
  let cfg;
  try {
    cfg = safeGetConfig();
  } catch (e) {
    console.error('❌ handleSlashCommand getConfig:', e.message);
    cfg = null;
  }

  switch (commandName) {
    case 'اجازة': return handleLeaveCommand(interaction, cfg);
    case 'دليل': return handleDaleelCommand(interaction, cfg);
    case 'بلاغ': return handleReportCommand(interaction, cfg);
    case 'استقالة': return handleResign(interaction);
    case 'مساعدة': return handleHelp(interaction);
    case 'اعدادات': return handleSettings(interaction);
    case 'لوحة_المطور': return handleMasterPanel(interaction);
    case 'broadcast': return handleBroadcast(interaction);
    case 'الألوان_المتوفرة': return handleColorsCommand(interaction);
    case 'ايمبد': return handleEmbedsMain(interaction);
    case 'الردود_التلقائية': return handleAutoReplyMain(interaction);
    case 'اعدادات_الاقتراحات': return showFeaturedSettings(interaction);
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId === 'modal_leave') return handleLeaveModalSubmit(interaction);
  if (interaction.customId.startsWith('modal_emb_')) return handleEmbedsModal(interaction);
  if (interaction.customId.startsWith('modal_ar_')) return handleAutoReplyModal(interaction);
  if (interaction.customId.startsWith('modal_rr_')) return handleReactModal(interaction);
  if (interaction.customId.startsWith('modal_feat_')) return handleFeaturedModal(interaction);
  if (interaction.customId.startsWith('modal_blagh_')) {
    const { handleBlaghModal } = require('./handlers/report');
    return handleBlaghModal(interaction);
  }
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

  if (id.startsWith('blagh_')) {
    const action = parts[1];
    const reportId = parts.slice(2).join('_');
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
  if (id === 'set_checkdb') return handleDbCheck(interaction);
  if (id.startsWith('sl_report_cd_')) {
    return handleSettingsSelect(interaction);
  }

  // أزرار نظام الإيمبدات
  if (prefix === 'emb') {
    return handleEmbedsInteraction(interaction);
  }

  // أزرار نظام الردود التلقائية
  if (prefix === 'ar') {
    // زر إضافة تفاعل يذهب مباشرة إلى reactReply
    if (id === 'ar_react_create') {
      const { handleRrCreate } = require('./handlers/reactReply');
      return handleRrCreate(interaction);
    }
    return handleAutoReplyInteraction(interaction);
  }

  // أزرار نظام التفاعلات
  if (prefix === 'rr') {
    return handleReactInteraction(interaction);
  }

  // أزرار نظام المنشورات المميزة
  if (prefix === 'feat') {
    return handleFeaturedInteraction(interaction);
  }

  if (prefix === 'dev') {
    const action = parts[1];
    if (id === 'dev_check_db') return handleDevCheckDb(interaction);
    if (id === 'dev_refresh_panel') return handleDevRefreshPanel(interaction);
    if (action === 'refresh') return handleDevRefresh(interaction);
    if (action === 'disable' && parts.length === 2) return handleDevDisable(interaction);
    if (action === 'enable' && parts.length === 2) return handleDevEnable(interaction);
    if (action === 'disable' || action === 'enable') return handleDevToggle(interaction);
  }

  // إذا ما تعرفنا على الزر → رد بخطأ واضح
  if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
    await interaction.reply({ content: `⚠️ زر غير معروف: \`${id}\``, ephemeral: true }).catch(() => {});
  }
}

// ========== معالج التفاعلات (Reactions) ==========
client.on('messageReactionAdd', async (reaction, user) => {
  try {
    // إذا كان التفاعل جزئياً (غير مخبأ)، نجلبه كاملاً
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    // تأكد من جلب الرسالة كاملة لضمان الحصول على ID الـ Thread الصحيح
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); } catch { return; }
    }
    await handleFeaturedReaction(reaction, user);
  } catch (e) {
    console.error('❌ reaction error:', e.message);
  }
});

client.login(process.env.BOT_TOKEN);

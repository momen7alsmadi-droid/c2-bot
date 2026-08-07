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
const { setErrorClient, logError, reportError } = require('./utils/errorLogger');
const { handleDaleelCommand, handleDaleelSettings } = require('./handlers/daleel');
const { handleReportCommand, handleReportButton, handleReportSettings } = require('./handlers/report');
const { handleResign, handleResignButton, handleDevSettings } = require('./handlers/resign');
const { handleMasterPanel, handleDevRefresh, handleDevRefreshPanel, handleDevDisable, handleDevEnable, handleDevToggle, handleDevCheckDb, handleDevChannelSelect, showControlPage, showRoomsPage, showStatusPage, handleDevSetupStore, confirmDevSetupStore } = require('./handlers/master-panel');
const { handleHelp } = require('./handlers/help');
const { handleBroadcast } = require('./handlers/broadcast');
const { handleColorsCommand } = require('./handlers/colors');
const { handleSettings, showSettingsPage, handleSettingsSelect, handleDbCheck } = require('./handlers/settings');
const { handleColorAutocomplete } = require('./handlers/broadcast');
const { handleEmbedsInteraction, handleEmbedsModal, handleEmbedsMain } = require('./handlers/embeds');
const { initEmbedModel } = require('./utils/embedStorage');
const { handleAutoReplyInteraction, handleAutoReplyModal, handleAutoReplyMain, handleMessage } = require('./handlers/autoReply');
const { handleReactInteraction, handleReactModal, handleReactMain, handleReactMessage } = require('./handlers/reactReply');
const { handleStarboardMain, handleStarboardInteraction, handleStarboardModal, handleStarboardMessage, handleStarboardReaction } = require('./handlers/starboard');
const { deployCommands } = require('./deploy-commands');
const { handleAdminPanelMain, handleAdminInteraction } = require('./handlers/admin-panel');
const { handleBoardMain, handleBoardInteraction } = require('./handlers/admin-board');
const { handleBotName, handleBotAvatar } = require('./handlers/botProfile');
const { initAdminModel, syncAdminConfigFromMongo } = require('./utils/adminStorage');

// ====== نظام التذاكر ======
const ticketSetupCmd = require('../ticket-system/commands/ticket-setup');
const panelImageCmd = require('../ticket-system/commands/panel-image');
const { handleTicketButton } = require('../ticket-system/handlers/buttonHandler');
const { handleTicketSelectMenu } = require('../ticket-system/handlers/selectMenuHandler');
const { handleTicketCreate } = require('../ticket-system/handlers/ticketCreateHandler');
const { handleTicketControlButton } = require('../ticket-system/handlers/ticketControlHandler');
const { handleTicketStaffMenu } = require('../ticket-system/handlers/ticketStaffMenuHandler');
const { initTicketStore, getSession: getTicketSession, updateSession: updateTicketSession, initSessionModel, syncSessionsToMongo, loadSessionsFromMongo } = require('../ticket-system/handlers/ticketStore');
const { initTicketSettings, loadSettingsFromMongo, setTicketSettingsClient, restoreSettingsFromChannel } = require('../ticket-system/database/ticketSettingsDB');
const { initCooldownStore } = require('../ticket-system/database/ticketCooldownStore');
const { initCounterStore } = require('../ticket-system/database/ticketCounterStore');
const { initStatsStore, loadStatsFromMongo, syncStatsToMongo } = require('../ticket-system/database/ticketStatsStore');
const { startTicketMaintenance } = require('../ticket-system/handlers/ticketAutoClose');
const { handleUserSelectMenu } = require('../ticket-system/handlers/userSelectHandler');
const { handleStatsUserSelect } = require('../ticket-system/handlers/ticketStatsBuilder');
const { handleRatingButton, handleNoteButton, handleNoteModal } = require('../ticket-system/handlers/ticketRatingHandler');
const { handleTicketCloseButton } = require('../ticket-system/handlers/ticketCloseHandler');
const { handleRoleSelectMenu } = require('../ticket-system/handlers/roleSelectHandler');
const { handleChannelSelectMenu } = require('../ticket-system/handlers/channelSelectHandler');
const { handleTicketModal } = require('../ticket-system/handlers/modalHandler');
const { handleTicketBoardTrigger } = require('../ticket-system/handlers/ticketBoardTrigger');
const { rebuildImageLibrary } = require('../ticket-system/utils/imageLibrary');

const { initStarboardModels, ensureStarboardLoaded } = require('./utils/starboardStorage');
const { initAutoReplyModel, syncJsonToMongo: syncAr, loadRepliesFromMongo } = require('./utils/autoReplyStorage');
const { initReactModel, syncJsonToMongo: syncRr, loadReactsFromMongo } = require('./utils/reactionReplyStorage');
const {
    initPanelsModel,
    syncPanelsToMongo: syncPanels,
    loadPanelsFromMongo: loadPanels,
} = require('../ticket-system/database/panelsDB');
const { initStatsModel } = require('../ticket-system/database/ticketStatsStore');

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
    reportError('PING', 'keepalive', err);
  }
}

// ========== نظام مراقبة الحالة ==========

/**
 * إرسال إيمبد حالة البوت إلى الروم المحدد في الإعدادات
 */
async function sendBotStatus(client) {
  const cfg = safeGetConfig();
  if (!cfg.statusChannelId) return;

  try {
    const channel = await client.channels.fetch(cfg.statusChannelId).catch(() => null);
    if (!channel) {
      console.warn('⚠️ روم حالة البوت غير موجود.');
      return;
    }

    const ping = client.ws.ping;
    const uptimeSeconds = Math.floor(process.uptime());
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const totalGuilds = client.guilds.cache.size;
    const totalMembers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);

    const mongoose = require('mongoose');
    const dbState = mongoose.connection.readyState === 1 ? '✅ متصلة' : '❌ غير متصلة';

    const embed = new EmbedBuilder()
      .setTitle('📡 حالة البوت')
      .setColor(ping < 200 ? 0x2ECC71 : ping < 500 ? 0xF1C40F : 0xE74C3C)
      .setDescription('تقرير دوري عن حالة البوت وأدائه')
      .addFields(
        { name: '🔄 حالة التشغيل', value: '✅ شغال', inline: true },
        { name: '📶 سرعة الاستجابة (Ping)', value: `${ping}ms`, inline: true },
        { name: '🖥️ وقت التشغيل', value: `${days}ي ${hours}س ${minutes}د`, inline: true },
        { name: '🌍 عدد السيرفرات', value: `${totalGuilds}`, inline: true },
        { name: '👥 إجمالي الأعضاء', value: `${totalMembers}`, inline: true },
        { name: '🗄️ حالة القاعدة', value: dbState, inline: true },
      )
      .setFooter({ text: `آخر تحديث` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log('✅ تم إرسال تقرير حالة البوت');
  } catch (err) {
    console.error('❌ فشل إرسال تقرير حالة البوت:', err.message);
    reportError('STATUS', 'bot-status', err);
  }
}

/**
 * إرسال إيمبد حالة قاعدة البيانات إلى الروم المحدد
 */
async function sendDbStatus(client) {
  const cfg = safeGetConfig();
  if (!cfg.dbStatusChannelId) return;

  try {
    const channel = await client.channels.fetch(cfg.dbStatusChannelId).catch(() => null);
    if (!channel) {
      console.warn('⚠️ روم حالة قاعدة البيانات غير موجود.');
      return;
    }

    const mongoose = require('mongoose');
    const os = require('os');
    const readyState = mongoose.connection.readyState;
    const stateNames = {
      0: '❌ غير متصلة (Disconnected)',
      1: '✅ متصلة (Connected)',
      2: '⏳ جاري الاتصال (Connecting)',
      3: '⚠️ يتم قطع الاتصال (Disconnecting)',
    };

    let details = '';
    if (readyState === 1) {
      try {
        const db = mongoose.connection.db;
        const admin = db.admin();
        const info = await admin.serverStatus().catch(() => ({}));
        const dbList = await admin.listDatabases().catch(() => ({}));
        const ops = info.opcounters || {};
        details = [
          `• **القاعدة:** \`${db.databaseName}\``,
          `• **المضيف:** \`${mongoose.connection.host}\``,
          `• **العمليات:** ${(ops.command || 0) + (ops.query || 0) + (ops.insert || 0) + (ops.update || 0) + (ops.delete || 0)}`,
          `• **عدد قواعد البيانات:** ${(dbList.databases || []).length}`,
          `• **المضيف المحلي:** \`${os.hostname()}\``,
        ].join('\n');
      } catch (e) {
        details = '⚠️ تعذر جلب التفاصيل الكاملة';
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🗄️ حالة قاعدة البيانات')
      .setColor(readyState === 1 ? 0x2ECC71 : 0xE74C3C)
      .setDescription(`**الحالة:** ${stateNames[readyState] || '❓ غير معروف'}\n\n${details}`)
      .setFooter({ text: `آخر فحص` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log('✅ تم إرسال تقرير حالة قاعدة البيانات');
  } catch (err) {
    console.error('❌ فشل إرسال تقرير حالة القاعدة:', err.message);
    reportError('STATUS', 'db-status', err);
  }
}

/**
 * إرسال خطأ إلى روم الأخطاء التلقائي
 */
// أصبحت في src/utils/errorLogger.js (sendErrorToChannel)

// ---------- الاتصال بقاعدة البيانات ----------
async function initializeInner() {
  const dbConnected = await connectDatabase();
  initModels();
  const embedReady = initEmbedModel();
  const arReady = initAutoReplyModel();
  const rrReady = initReactModel();
  const sbReady = initStarboardModels();
  const admReady = initAdminModel();
  const panelsReady = initPanelsModel();
  const statsReady = initStatsModel();
  const sessReady = initSessionModel();
  // استعادة جلسات التذاكر المفتوحة (حتى لا تفقد التذاكر حالتها بعد إعادة التشغيل)
  initTicketStore();
  // الإعدادات العامة للحدود/الكولداون + سجل آخر وقت فتح لكل عضو
  initTicketSettings();
  initCooldownStore();
  initCounterStore();
  initStatsStore();

  // تأكيد حالة التخزين
  console.log('\n═══════════════════════════════════════');
  console.log('📊 حالة التخزين:');
  console.log(`   ${dbConnected ? '✅' : '❌'} MongoDB`);
  console.log(`   ${embedReady ? '✅' : '⚠️'} Embed Storage`);
  console.log(`   ${arReady ? '✅' : '⚠️'} AutoReply Storage`);
  console.log(`   ${rrReady ? '✅' : '⚠️'} Reaction Storage`);
  console.log(`   ${sbReady ? '✅' : '⚠️'} Starboard Storage`);
  console.log(`   ${admReady ? '✅' : '⚠️'} Admin Storage`);
  console.log(`   ${panelsReady ? '✅' : '⚠️'} Ticket Panels Storage`);
  console.log(`   ${statsReady ? '✅' : '⚠️'} Ticket Stats Storage`);
  console.log(`   ${sessReady ? '✅' : '⚠️'} Ticket Sessions Storage`);
  console.log('═══════════════════════════════════════\n');

  if (dbConnected) {
    // استعادة البنلات من MongoDB أولاً (حماية من مسح القرص)،
    // ثم مزامنة أي بنلات جديدة من JSON إلى MongoDB
    await loadPanels();
    await syncPanels();
    // إحصائيات التكتات: استعادة أي إحصائيات فُقدت من القرص المؤقت
    await loadStatsFromMongo();
    await syncStatsToMongo();
    // جلسات التكتات: استعادة أي جلسات فُقدت (حتى لا يظهر "ليست تذكرة فعالة")
    await loadSessionsFromMongo();
    await syncSessionsToMongo();
    await ensureConfigLoaded();
    console.log('📦 تم تحميل الإعدادات من MongoDB');
    await ensureReportsLoaded();
    console.log('📦 تم تحميل البلاغات من MongoDB');
    if (embedReady) {
      const { syncJsonToMongo } = require('./utils/embedStorage');
      await syncJsonToMongo();
    }
    // استعادة الردود/التفاعلات من MongoDB → JSON (حماية من مسح القرص المؤقت)
    // حتى لو انقطع الاتصال لاحقاً تبقى البيانات متوفرة في الملف المحلي
    await loadRepliesFromMongo();
    await loadReactsFromMongo();
    if (arReady) { await syncAr(); }
    if (rrReady) { await syncRr(); }
    if (admReady) { await syncAdminConfigFromMongo(); }
    await ensureStarboardLoaded();
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
        initPanelsModel();
        initStatsModel();
        await ensureConfigLoaded();
        const { syncJsonToMongo: syncEmbeds } = require('./utils/embedStorage');
        await syncEmbeds();
        await loadRepliesFromMongo();
        await loadReactsFromMongo();
        await syncAr();
        await syncRr();
        await loadPanels();
        await syncPanels();
        await loadStatsFromMongo();
        await syncStatsToMongo();
        await loadSessionsFromMongo();
        await syncSessionsToMongo();
        // إعدادات التذاكر: استعادة من MongoDB إن تأخر الاتصال (كانت تُفقد)
        await loadSettingsFromMongo();
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
      reportError('GUILD_CREATE', guild.id, e);
    }
  });

  // بدء إرسال رسالة كل 14 دقيقة بعد ما البوت يشتغل
  client.once('ready', async () => {
    console.log(`✅ البوت شغّال باسم ${client.user.tag}`);

    // تسجيل الأوامر (Guild-only في كل سيرفرات البوت غير المعطّلة)
    const deployed = await deployCommands(client);
    if (deployed) {
      console.log('📋 تمت مزامنة جميع الأوامر مع Discord API');
    } else {
      console.error('⚠️ لم تُسجَّل الأوامر (تحقق من CLIENT_ID/GUILD_ID في متغيرات البيئة و أن البوت في سيرفر واحد على الأقل)');
    }

    // إعادة بناء مكتبة الصور من روم بنك الصور (استرجاع بعد مسح القرص)
    setTimeout(async () => {
      const added = await rebuildImageLibrary(client);
      if (added > 0) console.log(`🖼️ أُعيد بناء مكتبة الصور: +${added} صورة`);
    }, 3000);

    // تشغيل الصيانة التلقائية للتذاكر (إغلاق الخمول + مهلة الستاف + الحذف التلقائي)
    startTicketMaintenance(client);

    // إشعارات التحديث: عند كل إصدار جديد يُرسل الملخص الكامل + تأكيد النجاح
    // إلى روم الأخطاء المحدد (بعد 5 ثوانٍ حتى تكتمل مزامنة القنوات)
    setTimeout(async () => {
      try {
        const { notifyVersionUpdate } = require('./utils/versionNotifier');
        await notifyVersionUpdate(client);
      } catch (e) {
        console.error('❌ فشل تشغيل إشعار التحديث:', e.message);
        reportError('UPDATE_NOTIFY', 'version-notify', e);
      }
    }, 5000);

    // إعدادات التذاكر: ربط الـ client + استعادة من نسخة ديسكورد الاحتياطية
    // (حماية من مسح القرص حتى بدون MongoDB — مثل علامة إصدارات التحديث)
    setTicketSettingsClient(client);
    setTimeout(() => {
      restoreSettingsFromChannel().catch(() => {});
    }, 3000);

    // تسجيل الأوامر فوراً عند دخول سيرفر جديد (بدون انتظار إعادة تشغيل)
    client.on('guildCreate', async (guild) => {
      try {
        await deployCommands(client);
        console.log(`✅ تم تسجيل الأوامر للسيرفر الجديد ${guild.id}`);
      } catch (e) {
        console.error('❌ فشل تسجيل الأوامر عند دخول سيرفر جديد:', e.message);
        reportError('DEPLOY', `guild-create:${guild.id}`, e);
      }
    });
    
    // إرسال أول رسالة بقاء (كل 30 دقيقة)
    setTimeout(() => sendPingMessage(), 5000);
    setInterval(sendPingMessage, PING_INTERVAL_MS);

    // ========== نظام مراقبة الحالة ==========
    const STATUS_INTERVAL_MS = 30 * 60 * 1000;

    // حساب التأخير لأول تشغيلة حسب الوقت الحالي
    function msUntilNext(minuteOffset) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      // الأهداف: 00:offset, 30:offset, 60:offset...
      const cycleBase = Math.floor(currentMinutes / 30) * 30;
      let target = cycleBase + minuteOffset;
      if (target <= currentMinutes) target += 30;
      const diffSec = (target - currentMinutes) * 60 - now.getSeconds();
      return Math.max(diffSec * 1000 - now.getMilliseconds(), 1000);
    }

    // تقرير البوت: بعد 10 ثواني ثم كل 30 دقيقة (بعد الإرسال الأول)
    setTimeout(() => {
      sendBotStatus(client);
      setInterval(() => sendBotStatus(client), STATUS_INTERVAL_MS);
    }, 10000);

    // تقرير قاعدة البيانات: أول مرة عند الدقيقة 15 أو 45 ثم كل 30 دقيقة
    const dbFirstDelay = msUntilNext(15);
    setTimeout(() => {
      sendDbStatus(client);
      setInterval(() => sendDbStatus(client), STATUS_INTERVAL_MS);
    }, dbFirstDelay);

    console.log(`⏰ جدولة تقارير الحالة:
   📡 البوت: بعد 10 ثواني + كل ${STATUS_INTERVAL_MS / 60000} دقيقة
   🗄️ القاعدة: بعد ${Math.round(dbFirstDelay / 1000)} ثانية + كل ${STATUS_INTERVAL_MS / 60000} دقيقة`);

    // فحص الاجازات المنتهية
    checkExpiredLeaves(client);
    setInterval(() => checkExpiredLeaves(client), CHECK_INTERVAL_MS);

    // تسجيل مستقبل الرسائل للردود التلقائية والتفاعلات
    console.log('👂 تم تفعيل مراقبة الرسائل للردود التلقائية والتفاعلات');
  });

  // معالج الرسائل (messageCreate) - مع فترة سماح عند بدء التشغيل
  let startupGrace = true;
  // تحذير لمرة واحدة فقط عند اكتشاف أن محتوى الرسائل يصل فارغاً
  // (يدل على أن MESSAGE CONTENT INTENT غير مفعّل في Developer Portal)
  let warnedAboutContentIntent = false;
  setTimeout(() => { startupGrace = false; console.log('👂 فترة سماح بدء التشغيل انتهت — جاهز لاستقبال الرسائل'); }, 6000);

  client.on('messageCreate', async (message) => {
    if (startupGrace) {
      console.log('⏳ فترة السماح... تجاهل رسالة', message.id);
      return;
    }
    // ⚠️ تشخيص مهم: إذا وصلت رسائل من أعضاء بمحتوى فارغ، فهذا يعني أن
    // MESSAGE CONTENT INTENT غير مفعّل في Developer Portal
    // ← الردود التلقائية والتفاعلات لن تعمل أبداً مهما كانت البيانات موجودة
    if (!message.author.bot && !message.system && !message.content) {
      if (!warnedAboutContentIntent) {
        warnedAboutContentIntent = true;
        console.warn('⚠️⚠️ message.content فارغ لأول رسالة عضو!');
        console.warn('   السبب الأكثر شيوعاً: MESSAGE CONTENT INTENT غير مفعّل في Discord Developer Portal.');
        console.warn('   الحل: Developer Portal → تطبيقك → Bot → Privileged Gateway Intents → فعّل MESSAGE CONTENT INTENT ثم أعد تشغيل البوت.');
        console.warn('   حتى ذلك الحين: الردود التلقائية والتفاعلات لن تعمل في أي سيرفر.');
      }
    }
    try {
      // تحديث نشاط التذكرة + عدّ رسائل المشاركين في الذاكرة فقط
      // (لا تُكتب الإحصائيات على القرص إلا عند قفل التذكرة لتقليل الضغط)
      if (!message.author.bot) {
        const ticketSess = getTicketSession(message.channel?.id);
        if (ticketSess) {
          const counts = ticketSess.messageCounts || {};
          counts[message.author.id] = (counts[message.author.id] || 0) + 1;

          // النشاط التفصيلي لكل مشارك (منشنات/مرفقات/ردود على أعضاء)
          const act = ticketSess.staffActivity || {};
          const mine = (act[message.author.id] = act[message.author.id] || {
            mentions: 0, attachments: 0, repliedTo: 0,
          });
          mine.mentions += (message.mentions.users?.size || 0) + (message.mentions.roles?.size || 0);
          mine.attachments += message.attachments?.size || 0;
          if (message.reference && message.reference.messageId) mine.repliedTo += 1;

          const isStaff = ticketSess.openerId && message.author.id !== ticketSess.openerId;
          const prevAuthor = ticketSess.lastMsgAuthorId;

          // رد مباشر بعد رسالة صاحب التذكرة = رد على رسالة عضو
          if (isStaff && prevAuthor === ticketSess.openerId) mine.repliedTo += 1;

          ticketSess.lastMsgAuthorId = message.author.id;
          updateTicketSession(message.channel.id, {
            lastActivityAt: Date.now(),
            messageCounts: counts,
            staffActivity: act,
            lastMsgAuthorId: ticketSess.lastMsgAuthorId,
          });
        }
      }

      // 📅 تسجيل دخول يومي: أول رسالة من الشخص في اليوم الجديد = +3 نقاط
      // (في أي شات يراه البوت — مثل نظام تسجيل الدخول، مرة واحدة في اليوم)
      if (!message.author.bot && !message.system) {
        const { recordDailyLogin } = require('../ticket-system/database/ticketStatsStore');
        const login = recordDailyLogin(message.author.id);
        if (login.isNew) {
          const { version } = require('../package.json');
          const todayAr = new Date().toLocaleDateString('ar-EG', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          });
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('✅ تم تسجيل دخولك اليوم')
            .setDescription(
              `📅 التاريخ: **${todayAr}**\n` +
              `🎁 حصلت على **+${login.points} نقاط** إضافية (نقاط نشاط يومي)\n` +
              `📅 عدد أيام تسجيل دخولك الإجمالية: **${login.days}**`
            )
            .setFooter({ text: `الإصدار: ${version}` })
            .setTimestamp();
          message.author.send({ embeds: [embed] }).catch(() => {}); // تجاهل إغلاق الخاص
        }
      }

      console.log('📨 رسالة جديدة:', message.id, 'channel:', message.channel?.id, 'author:', message.author?.tag);
      await handleMessage(message);
      await handleTicketBoardTrigger(message);
      await handleReactMessage(message);
      await handleStarboardMessage(message);
    } catch (e) {
      console.error('❌ messageCreate error:', e.message);
      reportError('MESSAGE_CREATE', message.id, e);
    }
  });
}

// غلاف آمن لبدء التشغيل: أي خطأ أثناء الإقلاع يصل لروم الأخطاء
async function initialize() {
  try {
    await initializeInner();
  } catch (e) {
    console.error('❌ فشل بدء التشغيل:', e);
    reportError('INIT', 'startup', e);
  }
}

initialize();

// ========== تغطية شاملة لأخطاء ديسكورد (كلها تصل لروم الأخطاء) ==========
// أخطاء الاتصال / الـ WebSocket / الشاردز / تجاوز الحدود
client.on('error', (err) => reportError('CLIENT_ERROR', 'discord-client', err));
client.on('shardError', (err) => reportError('SHARD_ERROR', 'discord-shard', err));
client.on('rateLimit', (info) => {
  reportError('RATE_LIMIT', info.route || 'discord-api', new Error(
    `تجاوز حد طلبات ديسكورد — ${info.method || ''} ${info.route || ''} (الحد: ${info.limit || '?'}، سيتكرر بعد ${Math.ceil((info.timeout || 0) / 1000)} ثانية)`
  ));
});
// تحذيرات ديسكورد تظهر في اللوق فقط (ليست أخطاء)
client.on('warn', (info) => console.warn('⚠️ [discord warn]', info));

// ========== معالج الأخطاء العام (Unhandled Rejections / Exceptions) ==========
process.on('unhandledRejection', (reason, promise) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('🚨 Unhandled Rejection:', err.message);
  console.error(err.stack);
  logError('UNHANDLED_REJECTION', 'global', err);
});

process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err.message);
  console.error(err.stack);
  logError('UNCAUGHT_EXCEPTION', 'global', err);
  // لا ننهي العملية - البوت يكمل عادي
});

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
      disabledGuilds: [],
      statusChannelId: null,
      dbStatusChannelId: null,
      errorLogChannelId: null
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
        } else if (interaction.commandName === 'رفع-صورة') {
          const { handlePanelImageAutocomplete } = require('../ticket-system/handlers/panelImageAutocomplete');
          await handlePanelImageAutocomplete(interaction);
        }
      } catch (acErr) {
        console.error('❌ Autocomplete error:', acErr.message);
        reportError('AUTOCOMPLETE', interaction.commandName || interaction.customId || '?', acErr);
      }
    } else if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu() || interaction.isUserSelectMenu()) {
      console.log('🔽 Select Menu:', interaction.customId, 'values:', interaction.values);
      // الخيار الشكلي "🔄 إعادة تعيين" (آخر خيار في كل قائمة): لا ينفذ شيئاً
      if (interaction.values.length === 1 && interaction.values[0] === '__deco_reset__') {
        return interaction.reply({ content: '🔄', ephemeral: true }).catch(() => {});
      }
      if (interaction.customId.startsWith('emb_')) {
        await handleEmbedsInteraction(interaction);
      } else if (interaction.customId.startsWith('ar_') || interaction.customId.startsWith('rr_')) {
        await handleAutoReplyInteraction(interaction);
      } else if (interaction.customId.startsWith('sb_')) {
        await handleStarboardInteraction(interaction);
      } else if (interaction.customId.startsWith('adm_board_')) {
        await handleBoardInteraction(interaction);
      } else if (interaction.customId.startsWith('adm_')) {
        await handleAdminInteraction(interaction);
      } else if (interaction.customId.startsWith('dev_ch_')) {
        await handleDevChannelSelect(interaction);
      } else if (interaction.customId.startsWith('ticket_open_select:')) {
        await handleTicketCreate(interaction);
      } else if (interaction.customId === 'ticket_staff_menu') {
        await handleTicketStaffMenu(interaction);
      } else if (interaction.customId.startsWith('ticket_select_') || 
                 interaction.customId === 'settings_select_ticket_system' ||
                 interaction.customId === 'settings_select_welcome_type' ||
                 interaction.customId === 'settings_select_linked_panel' ||
                 interaction.customId === 'settings_select_action' ||
                 interaction.customId === 'settings_select_panel_image' ||
                 interaction.customId === 'settings_select_ticket_image' ||
                 interaction.customId === 'settings_select_claim_color' ||
                 interaction.customId === 'settings_select_role_button' ||
                 interaction.customId === 'settings_select_role_btn_option' ||
                 interaction.customId === 'settings_select_role_btn_color' ||
                 interaction.customId === 'ticket_settings_blacklist_remove' ||
                 interaction.customId.startsWith('ticket_role_opt:')) {
        await handleTicketSelectMenu(interaction);
      } else if (interaction.isRoleSelectMenu()) {
        await handleRoleSelectMenu(interaction);
      } else if (interaction.isChannelSelectMenu()) {
        await handleChannelSelectMenu(interaction);
      } else if (interaction.isUserSelectMenu()) {
        if (interaction.customId === 'ticket_stats_user_select') {
          await handleStatsUserSelect(interaction);
        } else {
          await handleUserSelectMenu(interaction);
        }
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
    case 'لوحة_النجوم': return handleStarboardMain(interaction);
    case 'اعدادات_لوحة_الإدارة': return handleAdminPanelMain(interaction);
    case 'لوحة_الإدارة': return handleBoardMain(interaction);
    case 'تغيير-اسم-البوت': return handleBotName(interaction);
    case 'تغيير-صورة-البوت': return handleBotAvatar(interaction);
    case 'ticket-setup': return ticketSetupCmd.execute(interaction);
    case 'رفع-صورة': return panelImageCmd.execute(interaction);
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId === 'modal_leave') return handleLeaveModalSubmit(interaction);
  if (interaction.customId.startsWith('modal_emb_')) return handleEmbedsModal(interaction);
  if (interaction.customId.startsWith('modal_ar_')) return handleAutoReplyModal(interaction);
  if (interaction.customId.startsWith('modal_rr_')) return handleReactModal(interaction);
  if (interaction.customId.startsWith('modal_sb_')) return handleStarboardModal(interaction);
  if (interaction.customId.startsWith('modal_blagh_')) {
    const { handleBlaghModal } = require('./handlers/report');
    return handleBlaghModal(interaction);
  }
  // نظام التذاكر
  if (interaction.customId.startsWith('modal_ticket_note:')) {
    return handleNoteModal(interaction);
  }
  if (interaction.customId === 'sw_time_modal' || interaction.customId === 'sw_msg_modal') {
    return handleStaffWeekModal(interaction);
  }
  return handleTicketModal(interaction);
}

async function handleButton(interaction) {
  const id = interaction.customId;

  // الزر الشكلي "🔄 إعادة تعيين" (بلا وظيفة — مجرد تأكيد إخفائي)
  if (id === 'ui_deco_reset') {
    return interaction.reply({ content: '🔄', ephemeral: true }).catch(() => {});
  }

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
    await interaction.deferUpdate().catch(()=>{});
    return handleSettings(interaction);
  }
  if (id === 'set_leave') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'leave', 1); }
  if (id === 'set_leave_1') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'leave', 1); }
  if (id === 'set_leave_2') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'leave', 2); }
  if (id === 'set_daleel') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'daleel', 1); }
  if (id === 'set_report') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'report', 1); }
  if (id === 'set_report_1') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'report', 1); }
  if (id === 'set_report_2') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'report', 2); }
  if (id === 'set_report_3') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'report', 3); }
  if (id === 'set_resign') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'resign', 1); }
  if (id === 'set_resign_1') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'resign', 1); }
  if (id === 'set_resign_2') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'resign', 2); }
  if (id === 'set_resign_3') { await interaction.deferUpdate().catch(()=>{}); return showSettingsPage(interaction, 'resign', 3); }
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

  // أزرار نظام لوحة النجوم
  if (prefix === 'sb') {
    return handleStarboardInteraction(interaction);
  }

  // أزرار لوحة الإدارة (الترقية/التنزيل/التوب/السلم)
  if (prefix === 'adm' && (parts[1] === 'board' || parts[1] === 'top')) {
    return handleBoardInteraction(interaction);
  }

  // أزرار نظام الإدارة (الإعدادات)
  if (prefix === 'adm') {
    return handleAdminInteraction(interaction);
  }

  if (prefix === 'dev') {
    const action = parts[1];
    // أزرار التنقل
    if (id === 'dev_main_refresh') return handleDevRefreshPanel(interaction);
    if (id === 'dev_main_control') return showControlPage(interaction);
    if (id === 'dev_main_rooms') return showRoomsPage(interaction);
    if (id === 'dev_main_status') return showStatusPage(interaction);
    if (id === 'dev_back_main') return handleMasterPanel(interaction);
    // أزرار التحكم
    if (id === 'dev_check_db') return handleDevCheckDb(interaction);
    if (id === 'dev_setup_store') return handleDevSetupStore(interaction);
    if (id === 'dev_store_confirm') return confirmDevSetupStore(interaction);
    if (id === 'dev_store_cancel') {
      return interaction.reply({ content: '❌ تم إلغاء إعداد المتجر. لم يُحذف أي شيء.', ephemeral: true });
    }
    if (action === 'refresh') return handleDevRefresh(interaction);
    if (action === 'disable' && parts.length === 2) return handleDevDisable(interaction);
    if (action === 'enable' && parts.length === 2) return handleDevEnable(interaction);
    if (action === 'disable' || action === 'enable') return handleDevToggle(interaction);
  }

  // ====== أزرار نظام التذاكر ======
  if (id.startsWith('ticket_open:')) return handleTicketCreate(interaction);
  if (['ticket_claim', 'ticket_lock'].includes(id)) return handleTicketControlButton(interaction);
  if (['ticket_reopen', 'ticket_delete_confirm', 'ticket_delete_cancel'].includes(id)) return handleTicketCloseButton(interaction);
  // أزرار نظام التقييم (تُضغط في الخاص من رسالة التقييم بعد حذف التذكرة)
  if (id.startsWith('ticket_rating:')) return handleRatingButton(interaction);
  if (id.startsWith('ticket_note:')) return handleNoteButton(interaction);
  // أزرار إحصائيات التكتات (📊 احصائياتي / 🏆 توب نقاط / التنقل / اختيار شخص) — من لوحة الإدارة
  if (id.startsWith('ticket_stats_')) return handleBoardInteraction(interaction);
  // أزرار لوحة الإدارة + التحكم داخل التذكرة (تسلك بسلاسة)
  if (id.startsWith('ticket_') || id.startsWith('settings_')) return handleTicketButton(interaction);

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
    await handleStarboardReaction(reaction, user);
  } catch (e) {
    console.error('❌ reaction error:', e.message);
    reportError('REACTION', 'reaction-handler', e);
  }
});

client.login(process.env.BOT_TOKEN);

// ربط الـ client بنظام الأخطاء (لإرسال الأخطاء لروم الأخطاء)
setErrorClient(client);

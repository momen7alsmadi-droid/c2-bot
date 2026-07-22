require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { getConfig } = require('./utils/storage');

const {
  handleLeaveCommand, handleLeaveModalSubmit, handleLeaveButton,
  handleLeaveSettings, checkExpiredLeaves, CHECK_INTERVAL_MS
} = require('./handlers/leave');
const { handleDaleelCommand, handleDaleelSettings } = require('./handlers/daleel');
const { handleReportCommand, handleReportButton, handleReportSettings } = require('./handlers/report');
const { handleResign, handleResignButton, handleDevSettings } = require('./handlers/resign');
const { handleMasterPanel, handleDevRefresh, handleDevDisable, handleDevEnable, handleDevToggle } = require('./handlers/master-panel');
const { handleHelp } = require('./handlers/help');
const { handleSettings, renderSettingsPage, handleSettingsSelect, handleSettingsButtonAction } = require('./handlers/settings');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember]
});

client.once('ready', () => {
  console.log(`✅ البوت شغّال باسم ${client.user.tag}`);
  checkExpiredLeaves(client);
  setInterval(() => checkExpiredLeaves(client), CHECK_INTERVAL_MS);
});

// ------------------- التفاعلات -------------------

client.on('interactionCreate', async (interaction) => {
  try {
    // فحص السيرفرات المعطلة (نسمح للمطور فقط)
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
    console.error(err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      interaction.reply({ content: '⚠️ خطأ غير متوقع.', ephemeral: true }).catch(() => {});
    }
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
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId === 'modal_leave') return handleLeaveModalSubmit(interaction);
}

async function handleButton(interaction) {
  const parts = interaction.customId.split('_');
  const prefix = parts[0];

  // أزرار الإجازة
  if (prefix === 'leave') {
    const action = parts[1];
    const userId = parts[2];
    const daysStr = parts[3];
    return handleLeaveButton(interaction, action, userId, daysStr);
  }

  // أزرار البلاغ
  if (prefix === 'blagh') {
    const action = parts[1];
    const reportId = parts[2];
    return handleReportButton(interaction, action, reportId);
  }

  // أزرار الاستقالة
  if (prefix === 'resign') {
    const action = parts[1];
    const userId = parts[2];
    return handleResignButton(interaction, action, userId);
  }

  // أزرار الإعدادات
  if (id.startsWith('sl_report_cooldown_') || id.startsWith('settings_save_') || id.startsWith('settings_refresh_') || id === 'settings_back' || (id.startsWith('set_') && id.includes('_page_'))) {
    return handleSettingsButtonAction(interaction);
  }
  if (prefix === 'settings' || prefix === 'set') {
    return renderSettingsPage(interaction);
  }

  // أزرار المطور
  if (prefix === 'dev') {
    const action = parts[1];
    if (action === 'refresh') return handleDevRefresh(interaction);
    if (action === 'disable' && parts.length === 2) return handleDevDisable(interaction);
    if (action === 'enable' && parts.length === 2) return handleDevEnable(interaction);
    if (action === 'disable' || action === 'enable') return handleDevToggle(interaction);
  }
}

client.login(process.env.BOT_TOKEN);

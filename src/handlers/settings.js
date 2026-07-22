const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder
} = require('discord.js');
const { getConfig, saveConfig } = require('../utils/storage');

// كل الأخطاء تسجل بكود مميز
const E = (code, msg) => `[${code}] ${msg}`;
const ERR = {
  REPLY: 'SET-001',
  DEFER_REPLY: 'SET-002',
  EDIT_REPLY: 'SET-003',
  LOAD_CONFIG: 'SET-004',
  MAIN_PAGE: 'SET-005',
  LEAVE_PAGE: 'SET-006',
  DALEEL_PAGE: 'SET-007',
  REPORT_P1: 'SET-008',
  REPORT_P2: 'SET-009',
  RESIGN_PAGE: 'SET-010',
  SELECT_SAVE: 'SET-011',
  COOLDOWN_SAVE: 'SET-012',
};

// دوال مساعدة
const rl = (id) => id ? `<@&${id}>` : '❌ غير محدد';
const ch = (id) => id ? `<#${id}>` : '❌ غير محدد';
const lst = (arr) => Array.isArray(arr) && arr.length ? arr.map(i => `<@&${i}>`).join(', ') : 'لا يوجد';

async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred) return await interaction.editReply(payload);
    if (interaction.replied) return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch (e) {
    console.error(E(ERR.REPLY, 'safeReply failed'), e.message);
  }
}

async function safeDefer(interaction) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
  } catch (e) {
    console.error(E(ERR.DEFER_REPLY, 'defer failed'), e.message);
  }
}

async function safeEdit(interaction, payload) {
  try {
    if (interaction.deferred) return await interaction.editReply(payload);
    if (interaction.replied) return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch (e) {
    console.error(E(ERR.EDIT_REPLY, 'edit failed'), e.message);
  }
}

// ------------------- عرض الصفحة الرئيسية -------------------
async function handleSettings(interaction) {
  await safeDefer(interaction);
  try {
    const embed = new EmbedBuilder()
      .setTitle('⚙️ لوحة الإعدادات')
      .setColor(0x2ECC71)
      .setDescription('اختر النظام الذي تريد تعديل إعداداته:')
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('set_leave').setLabel('📋 إجازة').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('set_daleel').setLabel('📌 دلائل').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('set_report').setLabel('🛡️ بلاغات').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('set_resign').setLabel('📄 استقالة').setStyle(ButtonStyle.Primary),
    );
    return safeEdit(interaction, { embeds: [embed], components: [row] });
  } catch (e) {
    console.error(E(ERR.MAIN_PAGE, 'handleSettings'), e);
    return safeEdit(interaction, { content: `⚠️ ${E(ERR.MAIN_PAGE, 'فشل فتح الإعدادات')}` });
  }
}

// ------------------- عرض صفحة نظام -------------------
async function showSettingsPage(interaction, type, page) {
  await safeDefer(interaction);
  try {
    const cfg = getConfig();
    if (!cfg) return safeEdit(interaction, { content: `⚠️ ${E(ERR.LOAD_CONFIG, 'فشل تحميل الإعدادات')}` });

    const embed = new EmbedBuilder()
      .setTitle(`⚙️ ${type === 'leave' ? '📋 الإجازات' : type === 'daleel' ? '📌 الدلائل' : type === 'report' ? '🛡️ البلاغات' : '📄 الاستقالات'}`)
      .setColor(0x3498DB)
      .setTimestamp();

    const btnBack = new ButtonBuilder().setCustomId('settings_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary);

    // ========== الإجازة ==========
    if (type === 'leave') {
      const l = cfg.leave;
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: rl(l.allowedRoleId) },
        { name: '📨 روم الطلبات', value: ch(l.requestChannelId) },
        { name: '🎖️ رتبة الإجازة', value: rl(l.leaveRoleId) },
        { name: '🗑️ الرتب المُزالة', value: lst(l.rolesToRemove) },
        { name: '📝 روم اللوق', value: ch(l.logChannelId) },
      );
      return safeEdit(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_leave_requestChannel').setPlaceholder('📨 روم الطلبات').setMaxValues(1), new ChannelSelectMenuBuilder().setCustomId('sl_leave_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_leaveRole').setPlaceholder('🎖️ رتبة الإجازة').setMaxValues(1), new RoleSelectMenuBuilder().setCustomId('sl_leave_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25)),
          new ActionRowBuilder().addComponents(btnBack),
        ]
      });
    }

    // ========== الدلائل ==========
    if (type === 'daleel') {
      const d = cfg.daleel;
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: rl(d.allowedRoleId) },
        { name: '📨 روم الإرسال', value: ch(d.channelId) },
        { name: '📝 روم اللوق', value: ch(d.logChannelId) },
      );
      return safeEdit(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_daleel_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_channel').setPlaceholder('📨 روم الإرسال').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
          new ActionRowBuilder().addComponents(btnBack),
        ]
      });
    }

    // ========== البلاغات ==========
    if (type === 'report') {
      const r = cfg.report;
      const cdStatus = r.cooldownEnabled !== false ? '🟢 شغال' : '🔴 متوقف';
      const cdDur = r.cooldownDuration || 60;

      if (page === 1) {
        embed.setDescription('🔄 اختر الرتب');
        embed.addFields(
          { name: '🎯 رتبة الاستخدام', value: rl(r.allowedRoleId) },
          { name: '🎖️ رتبة الإدارة', value: rl(r.adminRoleId) },
          { name: '⚠️ تحذير أول', value: rl(r.warning1RoleId) },
          { name: '⚠️⚠️ تحذير ثاني', value: rl(r.warning2RoleId) },
          { name: '🚫 تحذير ثالث', value: rl(r.warning3RoleId) },
          { name: '👑 إدارة عليا', value: rl(r.upperManagementRoleId) },
        );
        return safeEdit(interaction, {
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1), new RoleSelectMenuBuilder().setCustomId('sl_report_adminRole').setPlaceholder('🎖️ رتبة الإدارة').setMaxValues(1)),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_warning1').setPlaceholder('⚠️ تحذير أول').setMaxValues(1), new RoleSelectMenuBuilder().setCustomId('sl_report_warning2').setPlaceholder('⚠️⚠️ تحذير ثاني').setMaxValues(1)),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_warning3').setPlaceholder('🚫 فصل').setMaxValues(1), new RoleSelectMenuBuilder().setCustomId('sl_report_upperMgmt').setPlaceholder('👑 إدارة عليا').setMaxValues(1)),
            new ActionRowBuilder().addComponents(btnBack, new ButtonBuilder().setCustomId('set_report_next').setLabel('📨 القنوات والكولداون ▶️').setStyle(ButtonStyle.Primary)),
          ]
        });
      } else {
        embed.setDescription('🔄 اختر القنوات والكولداون');
        embed.addFields(
          { name: '📨 روم الاستقبال', value: ch(r.channelId) },
          { name: '📝 روم اللوق', value: ch(r.logChannelId) },
          { name: '📢 روم الإشعارات', value: ch(r.upperManagementChannelId) },
          { name: '⏱️ الكولداون', value: `${cdStatus} - المدة: ${cdDur} دقيقة` },
        );
        return safeEdit(interaction, {
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_report_channel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1), new ChannelSelectMenuBuilder().setCustomId('sl_report_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1), new ChannelSelectMenuBuilder().setCustomId('sl_report_upperMgmtChannel').setPlaceholder('📢 روم الإشعارات').setMaxValues(1)),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sl_report_cd_toggle').setLabel(r.cooldownEnabled !== false ? '⏱️ إطفاء الكولداون' : '⏱️ تشغيل الكولداون').setStyle(r.cooldownEnabled !== false ? ButtonStyle.Danger : ButtonStyle.Success), new ButtonBuilder().setCustomId('sl_report_cd_15').setLabel('15د').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('sl_report_cd_30').setLabel('30د').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('sl_report_cd_60').setLabel('60د').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('sl_report_cd_120').setLabel('120د').setStyle(ButtonStyle.Secondary)),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('set_report_prev').setLabel('◀️ الرتب').setStyle(ButtonStyle.Primary), btnBack),
          ]
        });
      }
    }

    // ========== الاستقالة ==========
    if (type === 'resign') {
      const r = cfg.resign;
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: rl(r.allowedRoleId) },
        { name: '📨 روم الاستقبال', value: ch(r.logChannelId) },
        { name: '🗑️ الرتب المُزالة', value: lst(r.rolesToRemove) },
        { name: '🎖️ رتبة ما بعد الاستقالة', value: rl(r.resignRoleId) },
      );
      return safeEdit(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1), new RoleSelectMenuBuilder().setCustomId('sl_resign_resignRole').setPlaceholder('🎖️ رتبة ما بعد الاستقالة').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_resign_logChannel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25)),
          new ActionRowBuilder().addComponents(btnBack),
        ]
      });
    }

    // إذا وصلنا هنا معنى الزر غير معروف
    return safeEdit(interaction, { content: `⚠️ ${E('SET-UNK', 'زر غير معروف')}` });
  } catch (e) {
    console.error('SETTINGS_GLOBAL', e);
    return safeEdit(interaction, { content: '⚠️ [ERR-999] خطأ عام' });
  }
}

// ------------------- اختيار القوائم -------------------
async function handleSettingsSelect(interaction) {
  await safeDefer(interaction);
  try {
    const id = interaction.customId;
    const cfg = getConfig();

    // أزرار الكولداون
    if (id === 'sl_report_cd_toggle') {
      cfg.report.cooldownEnabled = cfg.report.cooldownEnabled === false ? true : false;
      saveConfig(cfg);
      return safeEdit(interaction, { content: `✅ تم ${cfg.report.cooldownEnabled ? 'تشغيل' : 'إطفاء'} الكولداون.` });
    }
    const cdMatch = id.match(/^sl_report_cd_(\d+)$/);
    if (cdMatch) {
      cfg.report.cooldownDuration = parseInt(cdMatch[1]);
      saveConfig(cfg);
      return safeEdit(interaction, { content: `✅ تم تعيين مدة الكولداون إلى ${cdMatch[1]} دقيقة.` });
    }

    // اختيار رتبة/روم
    const parts = id.split('_');
    if (parts[0] !== 'sl') return;
    const system = parts[1];
    const field = parts.slice(2).join('_');
    const values = interaction.values;
    if (!cfg[system]) return safeEdit(interaction, { content: `⚠️ النظام ${system} غير موجود` });

    const roleFields = ['allowedRole', 'adminRole', 'leaveRole', 'resignRole', 'warning1', 'warning2', 'warning3', 'upperMgmt'];
    const listFields = ['rolesToRemove'];

    let mapKey = field;
    if (roleFields.includes(field)) mapKey = field + 'Id';
    else if (field === 'channel') mapKey = 'channelId';
    else if (field === 'requestChannel') mapKey = 'requestChannelId';
    else if (field === 'logChannel') mapKey = 'logChannelId';
    else if (field === 'upperMgmtChannel') mapKey = 'upperManagementChannelId';

    if (listFields.includes(field)) {
      cfg[system].rolesToRemove = values || [];
    } else {
      cfg[system][mapKey] = values[0] || null;
    }

    saveConfig(cfg);

    const fieldNames = {
      allowedRole: 'رتبة الاستخدام', adminRole: 'رتبة الإدارة',
      leaveRole: 'رتبة الإجازة', resignRole: 'رتبة ما بعد الاستقالة',
      channel: 'روم الاستقبال', requestChannel: 'روم الطلبات',
      logChannel: 'روم اللوق', upperMgmtChannel: 'روم الإشعارات',
      warning1: 'تحذير أول', warning2: 'تحذير ثاني', warning3: 'تحذير ثالث',
      upperMgmt: 'الإدارة العليا', rolesToRemove: 'الرتب المُزالة'
    };

    const label = fieldNames[field] || field;
    const valueStr = values.length ? values.map(v => `<@&${v}>`).join(', ') : 'بدون';
    return safeEdit(interaction, { content: `✅ تم تحديث **${label}** → ${valueStr}` });
  } catch (e) {
    console.error(E(ERR.SELECT_SAVE), e);
    return safeEdit(interaction, { content: `⚠️ ${E(ERR.SELECT_SAVE, 'خطأ في حفظ الإعداد')}` });
  }
}

module.exports = { handleSettings, showSettingsPage, handleSettingsSelect };

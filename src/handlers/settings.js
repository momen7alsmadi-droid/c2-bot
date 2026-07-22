const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder
} = require('discord.js');
const { getConfig, saveConfig } = require('../utils/storage');
const { version } = require('../utils/version');

// دوال مساعدة
const rl = (id) => id ? `<@&${id}>` : '❌ غير محدد';
const ch = (id) => id ? `<#${id}>` : '❌ غير محدد';
const lst = (arr) => Array.isArray(arr) && arr.length ? arr.map(i => `<@&${i}>`).join(', ') : 'لا يوجد';

async function safeSend(interaction, payload) {
  try {
    if (interaction.deferred) return await interaction.editReply(payload);
    if (interaction.replied) return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch (e) {
    console.error('❌ safeSend:', e.message);
  }
}

// الصفحة الرئيسية
async function handleSettings(interaction) {
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
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } catch (e) {
    console.error('ERR-HOME:', e.message);
    return interaction.reply({ content: '⚠️ ERR-HOME', ephemeral: true }).catch(()=>{});
  }
}

// عرض صفحة إعدادات
async function showSettingsPage(interaction, type, page) {
  // تأجيل
  try {
    if (!interaction.deferred && !interaction.replied)
      await interaction.deferReply({ ephemeral: true });
  } catch (e) {
    console.error('ERR-DEFER:', e.message);
    return interaction.reply({ content: '⚠️ ERR-DEFER', ephemeral: true }).catch(()=>{});
  }

  try {
    const cfg = getConfig();
    const embed = new EmbedBuilder()
      .setTitle(`⚙️ ${type === 'leave' ? '📋 الإجازات' : type === 'daleel' ? '📌 الدلائل' : type === 'report' ? '🛡️ البلاغات' : '📄 الاستقالات'}`)
      .setColor(0x3498DB)
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    const btnBack = new ButtonBuilder().setCustomId('settings_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary);

    // ========== الإجازة - صفحة 1 ==========
    if (type === 'leave' && page === 1) {
      const l = cfg.leave;
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: rl(l.allowedRoleId) },
        { name: '📨 روم الطلبات', value: ch(l.requestChannelId) },
        { name: '📝 روم اللوق', value: ch(l.logChannelId) },
      );
      return safeSend(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_leave_requestChannel').setPlaceholder('📨 روم الطلبات').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_leave_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
          new ActionRowBuilder().addComponents(btnBack, new ButtonBuilder().setCustomId('set_leave_2').setLabel('▶️ الرتب').setStyle(ButtonStyle.Primary)),
        ]
      });
    }

    // ========== الإجازة - صفحة 2 ==========
    if (type === 'leave' && page === 2) {
      const l = cfg.leave;
      embed.addFields(
        { name: '🎖️ رتبة الإجازة', value: rl(l.leaveRoleId) },
        { name: '🗑️ الرتب المُزالة', value: lst(l.rolesToRemove) },
      );
      return safeSend(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_leaveRole').setPlaceholder('🎖️ رتبة الإجازة').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25)),
          new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('set_leave_1').setLabel('◀️ الأساسيات').setStyle(ButtonStyle.Primary), btnBack),
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
      return safeSend(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_daleel_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_channel').setPlaceholder('📨 روم الإرسال').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
          new ActionRowBuilder().addComponents(btnBack),
        ]
      });
    }

    // ========== البلاغات - صفحة 1 (الرتب 1) ==========
    if (type === 'report' && page === 1) {
      const r = cfg.report;
      embed.setDescription('🔄 اختر الرتب (1/2)');
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: rl(r.allowedRoleId) },
        { name: '🎖️ رتبة الإدارة', value: rl(r.adminRoleId) },
        { name: '⚠️ تحذير أول', value: rl(r.warning1RoleId) },
      );
      return safeSend(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_adminRole').setPlaceholder('🎖️ رتبة الإدارة').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_warning1').setPlaceholder('⚠️ تحذير أول').setMaxValues(1)),
          new ActionRowBuilder().addComponents(btnBack, new ButtonBuilder().setCustomId('set_report_2').setLabel('▶️ رتب 2/2').setStyle(ButtonStyle.Primary)),
        ]
      });
    }

    // ========== البلاغات - صفحة 2 (الرتب 2) ==========
    if (type === 'report' && page === 2) {
      const r = cfg.report;
      embed.setDescription('🔄 اختر الرتب (2/2)');
      embed.addFields(
        { name: '⚠️⚠️ تحذير ثاني', value: rl(r.warning2RoleId) },
        { name: '🚫 تحذير ثالث', value: rl(r.warning3RoleId) },
        { name: '👑 إدارة عليا', value: rl(r.upperManagementRoleId) },
      );
      return safeSend(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_warning2').setPlaceholder('⚠️⚠️ تحذير ثاني').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_warning3').setPlaceholder('🚫 فصل').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_upperMgmt').setPlaceholder('👑 إدارة عليا').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('set_report_1').setLabel('◀️ رتب 1/2').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('set_report_3').setLabel('▶️ قنوات').setStyle(ButtonStyle.Primary)),
        ]
      });
    }

    // ========== البلاغات - صفحة 3 (القنوات والكولداون) ==========
    if (type === 'report' && page === 3) {
      const r = cfg.report;
      const cdStatus = r.cooldownEnabled !== false ? '🟢 شغال' : '🔴 متوقف';
      const cdDur = r.cooldownDuration || 60;
      embed.setDescription('🔄 اختر القنوات والكولداون');
      embed.addFields(
        { name: '📨 روم الاستقبال', value: ch(r.channelId) },
        { name: '📝 روم اللوق', value: ch(r.logChannelId) },
        { name: '📢 روم الإشعارات', value: ch(r.upperManagementChannelId) },
        { name: '⏱️ الكولداون', value: `${cdStatus} - المدة: ${cdDur} دقيقة` },
      );
      return safeSend(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_report_channel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_report_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_report_upperMgmtChannel').setPlaceholder('📢 روم الإشعارات').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sl_report_cd_toggle').setLabel(r.cooldownEnabled !== false ? '⏱️ إطفاء الكولداون' : '⏱️ تشغيل الكولداون').setStyle(r.cooldownEnabled !== false ? ButtonStyle.Danger : ButtonStyle.Success), new ButtonBuilder().setCustomId('sl_report_cd_15').setLabel('15د').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('sl_report_cd_30').setLabel('30د').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('sl_report_cd_60').setLabel('60د').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('sl_report_cd_120').setLabel('120د').setStyle(ButtonStyle.Secondary)),
          new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('set_report_2').setLabel('◀️ رتب 2/2').setStyle(ButtonStyle.Primary), btnBack),
        ]
      });
    }

    // ========== الاستقالة (صفحة واحدة) ==========
    if (type === 'resign') {
      const r = cfg.resign;
      embed.setDescription('👑 أي شخص عنده صلاحية Administrator يعتبر من الإدارة العليا تلقائياً');
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: rl(r.allowedRoleId) },
        { name: '🎖️ رتبة ما بعد الاستقالة', value: rl(r.resignRoleId) },
        { name: '👑 رتبة الإدارة العليا', value: rl(r.upperManagementRoleId) },
        { name: '📨 روم الاستقبال', value: ch(r.logChannelId) },
        { name: '🗑️ الرتب المُزالة', value: lst(r.rolesToRemove) },
      );
      return safeSend(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_resignRole').setPlaceholder('🎖️ رتبة ما بعد الاستقالة').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_upperMgmt').setPlaceholder('👑 رتبة الإدارة العليا').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_resign_logChannel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25)),
        ]
      });
    }

    return safeSend(interaction, { content: '⚠️ ERR-UNK' });
  } catch (e) {
    console.error('ERR-GLOBAL:', e.message);
    return safeSend(interaction, { content: '⚠️ ERR-GLOBAL' });
  }
}

// اختيار القوائم
async function handleSettingsSelect(interaction) {
  try {
    const id = interaction.customId;
    const cfg = getConfig();

    // كولداون
    if (id === 'sl_report_cd_toggle') {
      cfg.report.cooldownEnabled = cfg.report.cooldownEnabled === false ? true : false;
      saveConfig(cfg);
      return interaction.reply({ content: `✅ تم ${cfg.report.cooldownEnabled ? 'تشغيل' : 'إطفاء'} الكولداون.`, ephemeral: true }).catch(e=>console.error('ERR-SEL1:',e.message));
    }
    const cdMatch = id.match(/^sl_report_cd_(\d+)$/);
    if (cdMatch) {
      cfg.report.cooldownDuration = parseInt(cdMatch[1]);
      saveConfig(cfg);
      return interaction.reply({ content: `✅ تم تعيين مدة الكولداون إلى ${cdMatch[1]} دقيقة.`, ephemeral: true }).catch(e=>console.error('ERR-SEL2:',e.message));
    }

    // اختيار رتبة/روم
    const parts = id.split('_');
    if (parts[0] !== 'sl') return;
    const system = parts[1];
    const field = parts.slice(2).join('_');
    const values = interaction.values;
    if (!cfg[system]) return interaction.reply({ content: `⚠️ النظام ${system} غير موجود`, ephemeral: true }).catch(()=>{});

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
    return interaction.reply({ content: `✅ تم تحديث **${label}** → ${valueStr}`, ephemeral: true }).catch(e=>console.error('ERR-SEL3:',e.message));
  } catch (e) {
    console.error('ERR-SEL:', e.message, e.stack);
    try { await interaction.reply({ content: `⚠️ ERR-SEL`, ephemeral: true }); } catch(e2) { console.error('ERR-SEL4:', e2.message); }
  }
}

module.exports = { handleSettings, showSettingsPage, handleSettingsSelect };

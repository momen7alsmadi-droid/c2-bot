const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder
} = require('discord.js');
const { getConfig, saveConfig } = require('../utils/storage');

// ------------------- /اعدادات -------------------

async function handleSettings(interaction) {
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
}

// ------------------- عرض صفحة الإعدادات -------------------

async function showSettingsPage(interaction, type, page) {
  const cfg = getConfig();
  const titles = { leave: '📋 الإجازات', daleel: '📌 الدلائل', report: '🛡️ البلاغات', resign: '📄 الاستقالات' };

  const embed = new EmbedBuilder()
    .setTitle(`⚙️ إعدادات ${titles[type]}`)
    .setColor(0x3498DB)
    .setDescription('اختر من القوائم أدناه لتعديل الإعدادات')
    .setTimestamp();

  const btnBack = new ButtonBuilder().setCustomId(`set_${type}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary);

  const val = (s) => {
    if (s === null || s === undefined) return '❌ غير محدد';
    if (Array.isArray(s)) return s.length ? s.map(id => `<@&${id}>`).join(', ') : 'لا يوجد';
    return s;
  };

  const mention = (s, type) => {
    if (!s) return '❌ غير محدد';
    if (type === 'role') return `<@&${s}>`;
    if (type === 'channel') return `<#${s}>`;
    return s;
  };

  if (type === 'main') {
    const embed2 = new EmbedBuilder()
      .setTitle('⚙️ لوحة الإعدادات')
      .setColor(0x2ECC71)
      .setDescription('اختر النظام الذي تريد تعديل إعداداته:')
      .setTimestamp();
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('set_leave').setLabel('📋 إجازة').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('set_daleel').setLabel('📌 دلائل').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('set_report').setLabel('🛡️ بلاغات').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('set_resign').setLabel('📄 استقالة').setStyle(ButtonStyle.Primary),
    );
    return interaction.update({ embeds: [embed2], components: [row2], ephemeral: true });
  }

  if (type === 'leave') {
    const l = cfg.leave;
    embed.addFields(
      { name: '🎯 رتبة الاستخدام', value: mention(l.allowedRoleId, 'role') },
      { name: '📨 روم الطلبات', value: mention(l.requestChannelId, 'channel') },
      { name: '🎖️ رتبة الإجازة', value: mention(l.leaveRoleId, 'role') },
      { name: '🗑️ الرتب المُزالة', value: val(l.rolesToRemove) },
      { name: '📝 روم اللوق', value: mention(l.logChannelId, 'channel') },
    );
    return interaction.update({
      embeds: [embed], ephemeral: true,
      components: [
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_leave_requestChannel').setPlaceholder('📨 روم الطلبات').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_leave_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_leaveRole').setPlaceholder('🎖️ رتبة الإجازة').setMaxValues(1)),
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder().setCustomId('sl_leave_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25),
          btnBack,
        ),
      ]
    });
  }

  if (type === 'daleel') {
    const d = cfg.daleel;
    embed.addFields(
      { name: '🎯 رتبة الاستخدام', value: mention(d.allowedRoleId, 'role') },
      { name: '📨 روم الإرسال', value: mention(d.channelId, 'channel') },
      { name: '📝 روم اللوق', value: mention(d.logChannelId, 'channel') },
    );
    return interaction.update({
      embeds: [embed], ephemeral: true,
      components: [
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_daleel_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_channel').setPlaceholder('📨 روم الإرسال').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
        new ActionRowBuilder().addComponents(btnBack),
      ]
    });
  }

  if (type === 'report') {
    const r = cfg.report;
    const cdStatus = r.cooldownEnabled !== false ? '🟢 شغال' : '🔴 متوقف';
    const cdDur = r.cooldownDuration || 60;

    if (page === 1) {
      embed.setDescription('🔄 اختر الرتب');
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: mention(r.allowedRoleId, 'role') },
        { name: '🎖️ رتبة الإدارة', value: mention(r.adminRoleId, 'role') },
        { name: '⚠️ تحذير أول', value: mention(r.warning1RoleId, 'role') },
        { name: '⚠️⚠️ تحذير ثاني', value: mention(r.warning2RoleId, 'role') },
        { name: '🚫 تحذير ثالث', value: mention(r.warning3RoleId, 'role') },
        { name: '👑 إدارة عليا', value: mention(r.upperManagementRoleId, 'role') },
      );
      return interaction.update({
        embeds: [embed], ephemeral: true,
        components: [
          new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder().setCustomId('sl_report_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1),
            new RoleSelectMenuBuilder().setCustomId('sl_report_adminRole').setPlaceholder('🎖️ رتبة الإدارة').setMaxValues(1),
          ),
          new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder().setCustomId('sl_report_warning1').setPlaceholder('⚠️ تحذير أول').setMaxValues(1),
            new RoleSelectMenuBuilder().setCustomId('sl_report_warning2').setPlaceholder('⚠️⚠️ تحذير ثاني').setMaxValues(1),
          ),
          new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder().setCustomId('sl_report_warning3').setPlaceholder('🚫 فصل').setMaxValues(1),
            new RoleSelectMenuBuilder().setCustomId('sl_report_upperMgmt').setPlaceholder('👑 إدارة عليا').setMaxValues(1),
          ),
          new ActionRowBuilder().addComponents(
            btnBack,
            new ButtonBuilder().setCustomId('set_report_next').setLabel('📨 القنوات والكولداون ▶️').setStyle(ButtonStyle.Primary),
          ),
        ]
      });
    } else {
      embed.setDescription('🔄 اختر القنوات والكولداون');
      embed.addFields(
        { name: '📨 روم الاستقبال', value: mention(r.channelId, 'channel') },
        { name: '📝 روم اللوق', value: mention(r.logChannelId, 'channel') },
        { name: '📢 روم الإشعارات', value: mention(r.upperManagementChannelId, 'channel') },
        { name: '⏱️ الكولداون', value: `${cdStatus} - المدة: ${cdDur} دقيقة` },
      );
      return interaction.update({
        embeds: [embed], ephemeral: true,
        components: [
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder().setCustomId('sl_report_channel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1),
            new ChannelSelectMenuBuilder().setCustomId('sl_report_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1),
            new ChannelSelectMenuBuilder().setCustomId('sl_report_upperMgmtChannel').setPlaceholder('📢 روم الإشعارات').setMaxValues(1),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sl_report_cd_toggle').setLabel(r.cooldownEnabled !== false ? '⏱️ إطفاء الكولداون' : '⏱️ تشغيل الكولداون').setStyle(r.cooldownEnabled !== false ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder().setCustomId('sl_report_cd_15').setLabel('15د').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sl_report_cd_30').setLabel('30د').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sl_report_cd_60').setLabel('60د').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('sl_report_cd_120').setLabel('120د').setStyle(ButtonStyle.Secondary),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('set_report_prev').setLabel('◀️ الرتب').setStyle(ButtonStyle.Primary),
            btnBack,
          ),
        ]
      });
    }
  }

  if (type === 'resign') {
    const r = cfg.resign;
    embed.addFields(
      { name: '🎯 رتبة الاستخدام', value: mention(r.allowedRoleId, 'role') },
      { name: '📨 روم الاستقبال', value: mention(r.logChannelId, 'channel') },
      { name: '🗑️ الرتب المُزالة', value: val(r.rolesToRemove) },
      { name: '🎖️ رتبة ما بعد الاستقالة', value: mention(r.resignRoleId, 'role') },
    );
    return interaction.update({
      embeds: [embed], ephemeral: true,
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder().setCustomId('sl_resign_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1),
          new RoleSelectMenuBuilder().setCustomId('sl_resign_resignRole').setPlaceholder('🎖️ رتبة ما بعد الاستقالة').setMaxValues(1),
        ),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_resign_logChannel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25)),
        new ActionRowBuilder().addComponents(btnBack),
      ]
    });
  }
}

// ------------------- اختيار القوائم (حفظ فوري) -------------------

async function handleSettingsSelect(interaction) {
  const id = interaction.customId;
  const cfg = getConfig();

  // أزرار الكولداون
  if (id === 'sl_report_cd_toggle') {
    cfg.report.cooldownEnabled = cfg.report.cooldownEnabled === false ? true : false;
    saveConfig(cfg);
    return interaction.update({ content: `✅ تم ${cfg.report.cooldownEnabled ? 'تشغيل' : 'إطفاء'} الكولداون.`, ephemeral: true });
  }
  const cdMatch = id.match(/^sl_report_cd_(\d+)$/);
  if (cdMatch) {
    cfg.report.cooldownDuration = parseInt(cdMatch[1]);
    saveConfig(cfg);
    return interaction.update({ content: `✅ تم تعيين مدة الكولداون إلى ${cdMatch[1]} دقيقة.`, ephemeral: true });
  }

  // تحديد القيمة من القائمة
  const parts = id.split('_');
  if (parts[0] !== 'sl') return;
  const system = parts[1];
  const field = parts.slice(2).join('_');
  const values = interaction.values;

  // ربط أسماء الحقول
  const roleFields = ['allowedRole', 'adminRole', 'leaveRole', 'resignRole', 'warning1', 'warning2', 'warning3', 'upperMgmt'];
  const channelFields = ['channel', 'requestChannel', 'logChannel', 'upperMgmtChannel'];
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
  return interaction.update({ content: `✅ تم تحديث **${label}** → ${valueStr}`, ephemeral: true });
}

module.exports = { handleSettings, showSettingsPage, handleSettingsSelect };

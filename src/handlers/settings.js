const {
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
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
    new ButtonBuilder().setCustomId('settings_leave').setLabel('📋 إجازة').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('settings_daleel').setLabel('📌 دلائل').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('settings_report').setLabel('🛡️ بلاغات').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('settings_resign').setLabel('📄 استقالة').setStyle(ButtonStyle.Primary),
  );

  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// ------------------- أزرار الإعدادات -------------------

async function handleSettingsButton(interaction) {
  const cfg = getConfig();
  const type = interaction.customId.replace('settings_', ''); // leave, daleel, report, resign

  const titles = { leave: '📋 الإجازات', daleel: '📌 الدلائل', report: '🛡️ البلاغات', resign: '📄 الاستقالات' };
  const embed = new EmbedBuilder()
    .setTitle(`⚙️ إعدادات ${titles[type]}`)
    .setColor(0x3498DB)
    .setTimestamp();

  if (type === 'leave') {
    const l = cfg.leave;
    embed.addFields(
      { name: 'رتبة الاستخدام', value: l.allowedRoleId ? `<@&${l.allowedRoleId}>` : '❌ غير محددة' },
      { name: 'روم الطلبات', value: l.requestChannelId ? `<#${l.requestChannelId}>` : '❌ غير محدد' },
      { name: 'رتبة الإجازة', value: l.leaveRoleId ? `<@&${l.leaveRoleId}>` : '❌ غير محددة' },
      { name: 'الرتب المُزالة', value: l.rolesToRemove.length ? l.rolesToRemove.map(id => `<@&${id}>`).join(', ') : 'لا يوجد' },
      { name: 'روم اللوق', value: l.logChannelId ? `<#${l.logChannelId}>` : '❌ غير محدد' },
    );

    const rows = [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId('sl_leave_allowedRole').setPlaceholder('🎯 رتبة استخدام الإجازة').setMaxValues(1),
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId('sl_leave_requestChannel').setPlaceholder('📨 روم طلبات الإجازة').setMaxValues(1),
      ),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId('sl_leave_leaveRole').setPlaceholder('🎖️ رتبة الإجازة').setMaxValues(1),
      ),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId('sl_leave_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة (اختر متعدد)').setMaxValues(10),
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId('sl_leave_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1),
      ),
    ];
    return interaction.update({ embeds: [embed], components: rows });
  }

  if (type === 'daleel') {
    const d = cfg.daleel;
    embed.addFields(
      { name: 'رتبة الاستخدام', value: d.allowedRoleId ? `<@&${d.allowedRoleId}>` : '❌ غير محددة' },
      { name: 'روم الإرسال', value: d.channelId ? `<#${d.channelId}>` : '❌ غير محدد' },
      { name: 'روم اللوق', value: d.logChannelId ? `<#${d.logChannelId}>` : '❌ غير محدد' },
    );
    const rows = [
      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_daleel_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_channel').setPlaceholder('📨 روم الإرسال').setMaxValues(1)),
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
    ];
    return interaction.update({ embeds: [embed], components: rows });
  }

  if (type === 'report') {
    const r = cfg.report;
    embed.addFields(
      { name: 'رتبة الاستخدام', value: r.allowedRoleId ? `<@&${r.allowedRoleId}>` : 'الكل' },
      { name: 'رتبة الإدارة', value: r.adminRoleId ? `<@&${r.adminRoleId}>` : '❌ غير محددة' },
      { name: 'روم الاستقبال', value: r.channelId ? `<#${r.channelId}>` : '❌ غير محدد' },
      { name: 'تحذير أول', value: r.warning1RoleId ? `<@&${r.warning1RoleId}>` : '❌' },
      { name: 'تحذير ثاني', value: r.warning2RoleId ? `<@&${r.warning2RoleId}>` : '❌' },
      { name: 'تحذير ثالث (فصل)', value: r.warning3RoleId ? `<@&${r.warning3RoleId}>` : '❌' },
      { name: 'الإدارة العليا', value: r.upperManagementRoleId ? `<@&${r.upperManagementRoleId}>` : '❌' },
      { name: 'روم الإشعارات', value: r.upperManagementChannelId ? `<#${r.upperManagementChannelId}>` : '❌' },
      { name: 'روم اللوق', value: r.logChannelId ? `<#${r.logChannelId}>` : '❌' },
    );
    const rows = [
      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_adminRole').setPlaceholder('🎖️ رتبة الإدارة').setMaxValues(1)),
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_report_channel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1)),
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_report_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId('sl_report_warning1').setPlaceholder('⚠️ تحذير أول').setMaxValues(1),
        new RoleSelectMenuBuilder().setCustomId('sl_report_warning2').setPlaceholder('⚠️⚠️ تحذير ثاني').setMaxValues(1),
      ),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId('sl_report_warning3').setPlaceholder('🚫 فصل').setMaxValues(1),
        new RoleSelectMenuBuilder().setCustomId('sl_report_upperMgmt').setPlaceholder('👑 إدارة عليا').setMaxValues(1),
      ),
    ];
    return interaction.update({ embeds: [embed], components: rows });
  }

  if (type === 'resign') {
    const r = cfg.resign;
    embed.addFields(
      { name: 'رتبة الاستخدام', value: r.allowedRoleId ? `<@&${r.allowedRoleId}>` : '❌ غير محددة' },
      { name: 'روم الاستقبال', value: r.logChannelId ? `<#${r.logChannelId}>` : '❌ غير محدد' },
      { name: 'الرتب المُزالة', value: r.rolesToRemove.length ? r.rolesToRemove.map(id => `<@&${id}>`).join(', ') : 'لا يوجد' },
      { name: 'رتبة ما بعد الاستقالة', value: r.resignRoleId ? `<@&${r.resignRoleId}>` : '❌ غير محددة' },
    );
    const rows = [
      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_resign_logChannel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1)),
      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(10)),
      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_resignRole').setPlaceholder('🎖️ رتبة ما بعد الاستقالة').setMaxValues(1)),
    ];
    return interaction.update({ embeds: [embed], components: rows });
  }
}

// ------------------- معالجة اختيار القوائم -------------------

async function handleSettingsSelect(interaction) {
  const cfg = getConfig();
  const [prefix, system, field] = interaction.customId.split('_'); // sl_leave_allowedRole
  const values = interaction.values;

  if (prefix !== 'sl') return;

  // تحديث القيمة في الإعدادات
  if (field === 'allowedRole' || field === 'adminRole' || field === 'leaveRole' || field === 'resignRole' ||
      field === 'warning1' || field === 'warning2' || field === 'warning3' || field === 'upperMgmt') {
    cfg[system][field.replace('upperMgmt', 'upperManagementRoleId').replace('reignRole', 'resignRole')] = values[0] || null;
  } else if (field === 'channel' || field === 'requestChannel' || field === 'logChannel' || field === 'upperManagementChannel') {
    const key = field === 'channel' ? 'channelId' : field === 'requestChannel' ? 'requestChannelId' : field === 'logChannel' ? 'logChannelId' : 'upperManagementChannelId';
    cfg[system][key] = values[0] || null;
  } else if (field === 'rolesToRemove') {
    cfg[system].rolesToRemove = values || [];
  }

  saveConfig(cfg);
  await interaction.deferUpdate();

  // نعيد عرض الإعدادات بعد التحديث
  const fakeInteraction = { ...interaction, customId: `settings_${system}` };
  return handleSettingsButton(fakeInteraction);
}

module.exports = { handleSettings, handleSettingsButton, handleSettingsSelect };

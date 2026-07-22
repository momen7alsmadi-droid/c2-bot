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

// ------------------- أزرار الإعدادات -------------------

async function handleSettingsButton(interaction) {
  const cfg = getConfig();
  const customId = interaction.customId || '';
  let type = customId.replace('set_', '').split('_')[0]; // leave, daleel, report, resign
  let page = customId.includes('_page_') ? parseInt(customId.split('_page_')[1]) : 1;

  // لو ضغط رجوع من داخل الإعدادات
  if (customId === 'settings_back') return handleSettings(interaction);

  // لو ضغط تحديث
  if (customId.startsWith('settings_refresh_')) {
    type = customId.replace('settings_refresh_', '');
    page = 1;
  }

  const titles = { leave: '📋 الإجازات', daleel: '📌 الدلائل', report: '🛡️ البلاغات', resign: '📄 الاستقالات' };
  const embed = new EmbedBuilder()
    .setTitle(`⚙️ إعدادات ${titles[type]}`)
    .setColor(0x3498DB)
    .setTimestamp();

  // الرجوع للكل
  const btnBack = new ButtonBuilder().setCustomId('settings_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary);

  if (type === 'leave') {
    const l = cfg.leave;
    embed.setDescription('اختر من القوائم أدناه لتعديل الإعدادات');
    embed.addFields(
      { name: '🎯 رتبة الاستخدام', value: l.allowedRoleId ? `<@&${l.allowedRoleId}>` : '❌ غير محددة' },
      { name: '📨 روم الطلبات', value: l.requestChannelId ? `<#${l.requestChannelId}>` : '❌ غير محدد' },
      { name: '🎖️ رتبة الإجازة', value: l.leaveRoleId ? `<@&${l.leaveRoleId}>` : '❌ غير محددة' },
      { name: '🗑️ الرتب المُزالة', value: l.rolesToRemove.length ? l.rolesToRemove.map(id => `<@&${id}>`).join(', ') : 'لا يوجد' },
      { name: '📝 روم اللوق', value: l.logChannelId ? `<#${l.logChannelId}>` : '❌ غير محدد' },
    );
    return interaction.update({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_leave_requestChannel').setPlaceholder('📨 روم الطلبات').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_leaveRole').setPlaceholder('🎖️ رتبة الإجازة').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25)),
        new ActionRowBuilder().addComponents(btnBack, new ButtonBuilder().setCustomId('settings_refresh_leave').setLabel('🔄 تحديث').setStyle(ButtonStyle.Primary)),
      ]
    });
  }

  if (type === 'daleel') {
    const d = cfg.daleel;
    embed.setDescription('اختر من القوائم أدناه لتعديل الإعدادات');
    embed.addFields(
      { name: '🎯 رتبة الاستخدام', value: d.allowedRoleId ? `<@&${d.allowedRoleId}>` : '❌ غير محددة' },
      { name: '📨 روم الإرسال', value: d.channelId ? `<#${d.channelId}>` : '❌ غير محدد' },
      { name: '📝 روم اللوق', value: d.logChannelId ? `<#${d.logChannelId}>` : '❌ غير محدد' },
    );
    return interaction.update({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_daleel_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_channel').setPlaceholder('📨 روم الإرسال').setMaxValues(1)),
        new ActionRowBuilder().addComponents(btnBack, new ButtonBuilder().setCustomId('settings_refresh_daleel').setLabel('🔄 تحديث').setStyle(ButtonStyle.Primary)),
      ]
    });
  }

  if (type === 'report') {
    const r = cfg.report;
    const cdEnabled = r.cooldownEnabled !== false;
    const cdStatus = cdEnabled ? '🟢 شغال' : '🔴 متوقف';
    const cdDuration = r.cooldownDuration || 60;

    if (page === 1) {
      // الصفحة الأولى: الرتب
      embed.setDescription('📌 **الرتب** - اختر الرتب المناسبة');
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: r.allowedRoleId ? `<@&${r.allowedRoleId}>` : 'الكل' },
        { name: '🎖️ رتبة الإدارة', value: r.adminRoleId ? `<@&${r.adminRoleId}>` : '❌ غير محددة' },
        { name: '⚠️ تحذير أول', value: r.warning1RoleId ? `<@&${r.warning1RoleId}>` : '❌' },
        { name: '⚠️⚠️ تحذير ثاني', value: r.warning2RoleId ? `<@&${r.warning2RoleId}>` : '❌' },
        { name: '🚫 تحذير ثالث (فصل)', value: r.warning3RoleId ? `<@&${r.warning3RoleId}>` : '❌' },
        { name: '👑 الإدارة العليا', value: r.upperManagementRoleId ? `<@&${r.upperManagementRoleId}>` : '❌' },
      );
      return interaction.update({
        embeds: [embed],
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
            new ButtonBuilder().setCustomId('set_report_page_2').setLabel('📨 القنوات والكولداون ▶️').setStyle(ButtonStyle.Primary),
          ),
        ]
      });
    } else {
      // الصفحة الثانية: القنوات + الكولداون
      embed.setDescription('📌 **القنوات والكولداون**');
      embed.addFields(
        { name: '📨 روم الاستقبال', value: r.channelId ? `<#${r.channelId}>` : '❌ غير محدد' },
        { name: '📝 روم اللوق', value: r.logChannelId ? `<#${r.logChannelId}>` : '❌ غير محدد' },
        { name: '📢 روم الإشعارات', value: r.upperManagementChannelId ? `<#${r.upperManagementChannelId}>` : '❌ غير محدد' },
        { name: '⏱️ الكولداون', value: `${cdStatus} - المدة: ${cdDuration} دقيقة` },
      );
      return interaction.update({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder().setCustomId('sl_report_channel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1),
            new ChannelSelectMenuBuilder().setCustomId('sl_report_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1),
            new ChannelSelectMenuBuilder().setCustomId('sl_report_upperMgmtChannel').setPlaceholder('📢 روم الإشعارات').setMaxValues(1),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sl_report_cooldown_toggle').setLabel(cdEnabled ? '⏱️ إطفاء الكولداون' : '⏱️ تشغيل الكولداون').setStyle(cdEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder().setCustomId('sl_report_cooldown_15').setLabel('15د').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sl_report_cooldown_30').setLabel('30د').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sl_report_cooldown_60').setLabel('60د').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('sl_report_cooldown_120').setLabel('120د').setStyle(ButtonStyle.Secondary),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('set_report_page_1').setLabel('◀️ الرتب').setStyle(ButtonStyle.Primary),
            btnBack,
          ),
        ]
      });
    }
  }

  if (type === 'resign') {
    const r = cfg.resign;
    embed.setDescription('اختر من القوائم أدناه لتعديل الإعدادات');
    embed.addFields(
      { name: '🎯 رتبة الاستخدام', value: r.allowedRoleId ? `<@&${r.allowedRoleId}>` : '❌ غير محددة' },
      { name: '📨 روم الاستقبال', value: r.logChannelId ? `<#${r.logChannelId}>` : '❌ غير محدد' },
      { name: '🗑️ الرتب المُزالة', value: r.rolesToRemove.length ? r.rolesToRemove.map(id => `<@&${id}>`).join(', ') : 'لا يوجد' },
      { name: '🎖️ رتبة ما بعد الاستقالة', value: r.resignRoleId ? `<@&${r.resignRoleId}>` : '❌ غير محددة' },
    );
    return interaction.update({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_resign_logChannel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25)),
        new ActionRowBuilder().addComponents(btnBack, new ButtonBuilder().setCustomId('settings_refresh_resign').setLabel('🔄 تحديث').setStyle(ButtonStyle.Primary)),
      ]
    });
  }
}

// ------------------- معالجة اختيار القوائم -------------------

async function handleSettingsSelect(interaction) {
  const cfg = getConfig();
  const parts = interaction.customId.split('_'); // sl_leave_allowedRole
  const prefix = parts[0];
  if (prefix !== 'sl') return;

  const system = parts[1]; // leave, daleel, report, resign
  const field = parts.slice(2).join('_'); // allowedRole, requestChannel, etc
  const values = interaction.values;

  // تعيين القيمة - ربط أسماء الحقول مع ملف التخزين
  const mapField = (f) => {
    if (f === 'allowedRole') return 'allowedRoleId';
    if (f === 'adminRole') return 'adminRoleId';
    if (f === 'leaveRole') return 'leaveRoleId';
    if (f === 'resignRole') return 'resignRoleId';
    if (f === 'channel') return 'channelId';
    if (f === 'requestChannel') return 'requestChannelId';
    if (f === 'logChannel') return 'logChannelId';
    if (f === 'upperMgmtChannel') return 'upperManagementChannelId';
    if (f === 'warning1') return 'warning1RoleId';
    if (f === 'warning2') return 'warning2RoleId';
    if (f === 'warning3') return 'warning3RoleId';
    if (f === 'upperMgmt') return 'upperManagementRoleId';
    if (f === 'rolesToRemove') return 'rolesToRemove';
    return f;
  };

  const key = mapField(field);
  if (key === 'rolesToRemove') {
    cfg[system].rolesToRemove = values || [];
  } else {
    cfg[system][key] = values[0] || null;
  }

  saveConfig(cfg);
  await interaction.deferUpdate();

  // نعيد عرض الإعدادات بعد التحديث مباشرة
  const fakeInteraction = { ...interaction, customId: `set_${system}` };
  return handleSettingsButton(fakeInteraction);
}

// ------------------- معالجة أزرار الكولداون -------------------

async function handleSettingsButtonAction(interaction) {
  const cfg = getConfig();
  const id = interaction.customId;

  // كولداون: تبديل تشغيل/إطفاء
  if (id === 'sl_report_cooldown_toggle') {
    cfg.report.cooldownEnabled = cfg.report.cooldownEnabled === false ? true : false;
    saveConfig(cfg);
    await interaction.deferUpdate();
    return handleSettingsButton({ ...interaction, customId: 'set_report_page_2' });
  }

  // كولداون: تغيير المدة
  const cdMatch = id.match(/^sl_report_cooldown_(\d+)$/);
  if (cdMatch) {
    cfg.report.cooldownDuration = parseInt(cdMatch[1]);
    saveConfig(cfg);
    await interaction.deferUpdate();
    return handleSettingsButton({ ...interaction, customId: 'set_report_page_2' });
  }

  // لو ما وصلنا هنا، نمرره على handleSettingsButton
  return handleSettingsButton(interaction);
}

module.exports = { handleSettings, handleSettingsButton, handleSettingsSelect, handleSettingsButtonAction };

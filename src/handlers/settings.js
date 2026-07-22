const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder
} = require('discord.js');
const { getConfig, saveConfig } = require('../utils/storage');

// ------------------- التغييرات المعلقة -------------------
const pendingSettings = new Map(); // userId -> { system: 'leave', changes: { field: value, ... } }

function getPending(userId) { return pendingSettings.get(userId) || null; }
function setPending(userId, system, field, value) {
  let p = pendingSettings.get(userId);
  if (!p) { p = { system, changes: {} }; pendingSettings.set(userId, p); }
  p.system = system;
  p.changes[field] = value;
}
function clearPending(userId) { pendingSettings.delete(userId); }

// ------------------- /اعدادات -------------------

async function handleSettings(interaction) {
  clearPending(interaction.user.id);
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

async function renderSettingsPage(interaction) {
  const cfg = getConfig();
  const customId = interaction.customId || '';
  let type = customId.replace('set_', '').split('_')[0];
  let page = customId.includes('_page_') ? parseInt(customId.split('_page_')[1]) : 1;

  // رجوع
  if (customId === 'settings_back') return handleSettings(interaction);

  // تحديث (يمسح المعلقة)
  if (customId.startsWith('settings_refresh_')) {
    clearPending(interaction.user.id);
    type = customId.replace('settings_refresh_', '');
    page = 1;
  }

  const titles = { leave: '📋 الإجازات', daleel: '📌 الدلائل', report: '🛡️ البلاغات', resign: '📄 الاستقالات' };
  const embed = new EmbedBuilder()
    .setTitle(`⚙️ إعدادات ${titles[type]}`)
    .setColor(0x3498DB)
    .setTimestamp();

  const pending = getPending(interaction.user.id);
  const hasPending = pending && pending.system === type && Object.keys(pending.changes).length > 0;
  if (hasPending) embed.setDescription('📝 لديك تغييرات غير محفوظة');

  // أزرار مشتركة
  const btnBack = new ButtonBuilder().setCustomId('settings_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary);
  const btnSave = new ButtonBuilder().setCustomId(`settings_save_${type}`).setLabel('✅ حفظ').setStyle(ButtonStyle.Success).setDisabled(!hasPending);
  const btnRefresh = new ButtonBuilder().setCustomId(`settings_refresh_${type}`).setLabel('🔄 تحديث').setStyle(ButtonStyle.Primary);

  // دالة مساعدة لعرض القيمة (مع تمييز المعلقة)
  const val = (saved, field) => {
    if (pending && pending.system === type && field in pending.changes) {
      const v = pending.changes[field];
      if (v === null || v === undefined || v === '') return '📝 لم يتم الاختيار';
      if (field.includes('Role') || field === 'allowedRole' || field === 'adminRole' || field === 'leaveRole' || field === 'resignRole') return `📝 <@&${v}>`;
      if (field.includes('Channel')) return `📝 <#${v}>`;
      if (Array.isArray(v)) return v.length ? v.map(id => `📝 <@&${id}>`).join(', ') : '📝 لا يوجد';
      return `📝 ${v}`;
    }
    if (saved === null || saved === undefined) return '❌ غير محدد';
    if (Array.isArray(saved)) return saved.length ? saved.map(id => `<@&${id}>`).join(', ') : 'لا يوجد';
    return saved;
  };

  if (type === 'leave') {
    const l = cfg.leave;
    embed.addFields(
      { name: '🎯 رتبة الاستخدام', value: val(l.allowedRoleId, 'allowedRole') },
      { name: '📨 روم الطلبات', value: val(l.requestChannelId, 'requestChannel') },
      { name: '🎖️ رتبة الإجازة', value: val(l.leaveRoleId, 'leaveRole') },
      { name: '🗑️ الرتب المُزالة', value: val(l.rolesToRemove, 'rolesToRemove') },
      { name: '📝 روم اللوق', value: val(l.logChannelId, 'logChannel') },
    );
    return interaction.update({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_leave_requestChannel').setPlaceholder('📨 روم الطلبات').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_leaveRole').setPlaceholder('🎖️ رتبة الإجازة').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25)),
        new ActionRowBuilder().addComponents(btnBack, btnSave, btnRefresh),
      ]
    });
  }

  if (type === 'daleel') {
    const d = cfg.daleel;
    embed.addFields(
      { name: '🎯 رتبة الاستخدام', value: val(d.allowedRoleId, 'allowedRole') },
      { name: '📨 روم الإرسال', value: val(d.channelId, 'channel') },
      { name: '📝 روم اللوق', value: val(d.logChannelId, 'logChannel') },
    );
    return interaction.update({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_daleel_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_channel').setPlaceholder('📨 روم الإرسال').setMaxValues(1)),
        new ActionRowBuilder().addComponents(btnBack, btnSave, btnRefresh),
      ]
    });
  }

  if (type === 'report') {
    const r = cfg.report;
    const cdEnabled = r.cooldownEnabled !== false;
    const cdStatus = cdEnabled ? '🟢 شغال' : '🔴 متوقف';
    const cdDuration = r.cooldownDuration || 60;

    // كولداون من المعلقة
    let showCdStatus = cdStatus;
    let showCdDuration = cdDuration;
    if (pending && pending.system === 'report') {
      if ('cooldownEnabled' in pending.changes) showCdStatus = pending.changes.cooldownEnabled ? '📝 شغال' : '📝 متوقف';
      if ('cooldownDuration' in pending.changes) showCdDuration = pending.changes.cooldownDuration;
    }

    if (page === 1) {
      embed.setDescription('📌 **الرتب** - اختر الرتب المناسبة');
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: val(r.allowedRoleId, 'allowedRole') },
        { name: '🎖️ رتبة الإدارة', value: val(r.adminRoleId, 'adminRole') },
        { name: '⚠️ تحذير أول', value: val(r.warning1RoleId, 'warning1') },
        { name: '⚠️⚠️ تحذير ثاني', value: val(r.warning2RoleId, 'warning2') },
        { name: '🚫 تحذير ثالث (فصل)', value: val(r.warning3RoleId, 'warning3') },
        { name: '👑 الإدارة العليا', value: val(r.upperManagementRoleId, 'upperMgmt') },
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
            btnBack, btnSave,
            new ButtonBuilder().setCustomId('set_report_page_2').setLabel('📨 القنوات والكولداون ▶️').setStyle(ButtonStyle.Primary),
          ),
        ]
      });
    } else {
      embed.setDescription('📌 **القنوات والكولداون**');
      embed.addFields(
        { name: '📨 روم الاستقبال', value: val(r.channelId, 'channel') },
        { name: '📝 روم اللوق', value: val(r.logChannelId, 'logChannel') },
        { name: '📢 روم الإشعارات', value: val(r.upperManagementChannelId, 'upperMgmtChannel') },
        { name: '⏱️ الكولداون', value: `${showCdStatus} - المدة: ${showCdDuration} دقيقة` },
      );
      // أزرار الكولداون حسب الحالة المعلقة
      const isCdEnabled = pending && pending.system === 'report' && 'cooldownEnabled' in pending.changes ? pending.changes.cooldownEnabled : cdEnabled;
      return interaction.update({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder().setCustomId('sl_report_channel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1),
            new ChannelSelectMenuBuilder().setCustomId('sl_report_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1),
            new ChannelSelectMenuBuilder().setCustomId('sl_report_upperMgmtChannel').setPlaceholder('📢 روم الإشعارات').setMaxValues(1),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sl_report_cooldown_toggle').setLabel(isCdEnabled ? '⏱️ إطفاء الكولداون' : '⏱️ تشغيل الكولداون').setStyle(isCdEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder().setCustomId('sl_report_cooldown_15').setLabel('15د').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sl_report_cooldown_30').setLabel('30د').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('sl_report_cooldown_60').setLabel('60د').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('sl_report_cooldown_120').setLabel('120د').setStyle(ButtonStyle.Secondary),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('set_report_page_1').setLabel('◀️ الرتب').setStyle(ButtonStyle.Primary),
            btnBack, btnSave,
          ),
        ]
      });
    }
  }

  if (type === 'resign') {
    const r = cfg.resign;
    embed.addFields(
      { name: '🎯 رتبة الاستخدام', value: val(r.allowedRoleId, 'allowedRole') },
      { name: '📨 روم الاستقبال', value: val(r.logChannelId, 'logChannel') },
      { name: '🗑️ الرتب المُزالة', value: val(r.rolesToRemove, 'rolesToRemove') },
      { name: '🎖️ رتبة ما بعد الاستقالة', value: val(r.resignRoleId, 'resignRole') },
    );
    return interaction.update({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_resign_logChannel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1)),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25)),
        new ActionRowBuilder().addComponents(btnBack, btnSave, btnRefresh),
      ]
    });
  }
}

// ------------------- معالجة اختيار القوائم (تخزين معلق) -------------------

async function handleSettingsSelect(interaction) {
  const cfg = getConfig();
  const parts = interaction.customId.split('_');
  const prefix = parts[0];
  if (prefix !== 'sl') return;

  const system = parts[1];
  const field = parts.slice(2).join('_');
  const values = interaction.values;
  const userId = interaction.user.id;

  // تعيين القيمة - ربط أسماء الحقول مع ملف التخزين
  const mapField = (f) => {
    if (f === 'allowedRole') return 'allowedRole';
    if (f === 'adminRole') return 'adminRole';
    if (f === 'leaveRole') return 'leaveRole';
    if (f === 'resignRole') return 'resignRole';
    if (f === 'channel') return 'channel';
    if (f === 'requestChannel') return 'requestChannel';
    if (f === 'logChannel') return 'logChannel';
    if (f === 'upperMgmtChannel') return 'upperMgmtChannel';
    if (f === 'warning1') return 'warning1';
    if (f === 'warning2') return 'warning2';
    if (f === 'warning3') return 'warning3';
    if (f === 'upperMgmt') return 'upperMgmt';
    if (f === 'rolesToRemove') return 'rolesToRemove';
    return f;
  };

  const key = mapField(field);
  const value = key === 'rolesToRemove' ? values : (values[0] || null);

  setPending(userId, system, key, value);
  await interaction.deferUpdate();

  // نعرض الصفحة مرة ثانية مع التغييرات المعلقة
  const fakeInteraction = { ...interaction, customId: `set_${system}` };
  return renderSettingsPage(fakeInteraction);
}

// ------------------- حفظ التغييرات -------------------

async function handleSettingsSave(interaction) {
  const userId = interaction.user.id;
  const pending = getPending(userId);
  if (!pending || !pending.changes || Object.keys(pending.changes).length === 0) {
    return interaction.reply({ content: '⚠️ لا توجد تغييرات للحفظ.', ephemeral: true });
  }

  const cfg = getConfig();
  const system = pending.system;
  const changes = pending.changes;

  // تعيين القيم من المعلقة إلى الكونفج
  for (const [field, value] of Object.entries(changes)) {
    const mapKey = (f) => {
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
      if (f === 'cooldownEnabled') return 'cooldownEnabled';
      if (f === 'cooldownDuration') return 'cooldownDuration';
      if (f === 'rolesToRemove') return 'rolesToRemove';
      return f;
    };
    const cfgKey = mapKey(field);
    cfg[system][cfgKey] = value;
  }

  saveConfig(cfg);
  clearPending(userId);

  await interaction.update({ content: '✅ **تم حفظ جميع التغييرات بنجاح!**', embeds: [], components: [] });
}

// ------------------- أزرار الكولداون -------------------

async function handleSettingsButtonAction(interaction) {
  const id = interaction.customId;
  const userId = interaction.user.id;

  // كولداون: تبديل تشغيل/إطفاء
  if (id === 'sl_report_cooldown_toggle') {
    const p = getPending(userId);
    const current = p && p.system === 'report' && 'cooldownEnabled' in p.changes ? p.changes.cooldownEnabled : getConfig().report.cooldownEnabled !== false;
    setPending(userId, 'report', 'cooldownEnabled', !current);
    await interaction.deferUpdate();
    return renderSettingsPage({ ...interaction, customId: 'set_report_page_2' });
  }

  // كولداون: تغيير المدة
  const cdMatch = id.match(/^sl_report_cooldown_(\d+)$/);
  if (cdMatch) {
    setPending(userId, 'report', 'cooldownDuration', parseInt(cdMatch[1]));
    await interaction.deferUpdate();
    return renderSettingsPage({ ...interaction, customId: 'set_report_page_2' });
  }

  // حفظ
  if (id.startsWith('settings_save_')) {
    return handleSettingsSave(interaction);
  }

  // باقي الأزرار (رجوع، تحديث، تنقل بين الصفحات)
  return renderSettingsPage(interaction);
}

module.exports = { handleSettings, renderSettingsPage, handleSettingsSelect, handleSettingsButtonAction };

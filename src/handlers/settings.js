const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder
} = require('discord.js');
const { getConfig, saveConfig } = require('../utils/storage');

// ------------------- أكواد الأخطاء -------------------
const ERROR_CODES = {
  HANDLE_SETTINGS: 'ERR-001',
  SHOW_PAGE_MAIN: 'ERR-002',
  SHOW_PAGE_LEAVE: 'ERR-003',
  SHOW_PAGE_DALEEL: 'ERR-004',
  SHOW_PAGE_REPORT_P1: 'ERR-005',
  SHOW_PAGE_REPORT_P2: 'ERR-006',
  SHOW_PAGE_RESIGN: 'ERR-007',
  SELECT_COOLDOWN: 'ERR-008',
  SELECT_ROLE_CHANNEL: 'ERR-009',
  UPDATE_BACK: 'ERR-010',
  UNKNOWN_BUTTON: 'ERR-011',
};

// ------------------- /اعدادات -------------------

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
    console.error(ERROR_CODES.HANDLE_SETTINGS, e);
    return interaction.reply({ content: `⚠️ [${ERROR_CODES.HANDLE_SETTINGS}] خطأ في فتح الإعدادات`, ephemeral: true }).catch(()=>{});
  }
}

// ------------------- عرض صفحة الإعدادات -------------------

async function showSettingsPage(interaction, type, page) {
  try {
    const cfg = getConfig();
    const titles = { leave: '📋 الإجازات', daleel: '📌 الدلائل', report: '🛡️ البلاغات', resign: '📄 الاستقالات' };

    // الصفحة الرئيسية (الأزرار الأربعة)
    if (type === 'main') {
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
        return interaction.update({ embeds: [embed], components: [row], ephemeral: true });
      } catch (e) { console.error(ERROR_CODES.SHOW_PAGE_MAIN, e); return interaction.reply({ content: `⚠️ [${ERROR_CODES.SHOW_PAGE_MAIN}] خطأ في عرض الصفحة الرئيسية`, ephemeral: true }).catch(()=>{}); }
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚙️ إعدادات ${titles[type]}`)
      .setColor(0x3498DB)
      .setTimestamp();

    const btnBack = new ButtonBuilder().setCustomId('settings_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary);

    // لعرض القيم
    const mentionRole = (id) => id ? `<@&${id}>` : '❌ غير محدد';
    const mentionChan = (id) => id ? `<#${id}>` : '❌ غير محدد';
    const showList = (arr) => Array.isArray(arr) && arr.length ? arr.map(i => `<@&${i}>`).join(', ') : 'لا يوجد';

    // ------------------- الإجازات -------------------
    if (type === 'leave') {
      try {
        const l = cfg.leave;
        embed.addFields(
          { name: '🎯 رتبة الاستخدام', value: mentionRole(l.allowedRoleId) },
          { name: '📨 روم الطلبات', value: mentionChan(l.requestChannelId) },
          { name: '🎖️ رتبة الإجازة', value: mentionRole(l.leaveRoleId) },
          { name: '🗑️ الرتب المُزالة', value: showList(l.rolesToRemove) },
          { name: '📝 روم اللوق', value: mentionChan(l.logChannelId) },
        );
        return interaction.update({
          embeds: [embed], ephemeral: true,
          components: [
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
            new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_leave_requestChannel').setPlaceholder('📨 روم الطلبات').setMaxValues(1), new ChannelSelectMenuBuilder().setCustomId('sl_leave_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_leaveRole').setPlaceholder('🎖️ رتبة الإجازة').setMaxValues(1)),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25)),
            new ActionRowBuilder().addComponents(btnBack),
          ]
        });
      } catch (e) { console.error(ERROR_CODES.SHOW_PAGE_LEAVE, e); return interaction.reply({ content: `⚠️ [${ERROR_CODES.SHOW_PAGE_LEAVE}] خطأ في عرض إعدادات الإجازة`, ephemeral: true }).catch(()=>{}); }
    }

    // ------------------- الدلائل -------------------
    if (type === 'daleel') {
      try {
        const d = cfg.daleel;
        embed.addFields(
          { name: '🎯 رتبة الاستخدام', value: mentionRole(d.allowedRoleId) },
          { name: '📨 روم الإرسال', value: mentionChan(d.channelId) },
          { name: '📝 روم اللوق', value: mentionChan(d.logChannelId) },
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
      } catch (e) { console.error(ERROR_CODES.SHOW_PAGE_DALEEL, e); return interaction.reply({ content: `⚠️ [${ERROR_CODES.SHOW_PAGE_DALEEL}] خطأ في عرض إعدادات الدلائل`, ephemeral: true }).catch(()=>{}); }
    }

    // ------------------- البلاغات -------------------
    if (type === 'report') {
      const r = cfg.report;
      const cdStatus = r.cooldownEnabled !== false ? '🟢 شغال' : '🔴 متوقف';
      const cdDur = r.cooldownDuration || 60;

      if (page === 1) {
        try {
          embed.setDescription('🔄 اختر الرتب');
          embed.addFields(
            { name: '🎯 رتبة الاستخدام', value: mentionRole(r.allowedRoleId) },
            { name: '🎖️ رتبة الإدارة', value: mentionRole(r.adminRoleId) },
            { name: '⚠️ تحذير أول', value: mentionRole(r.warning1RoleId) },
            { name: '⚠️⚠️ تحذير ثاني', value: mentionRole(r.warning2RoleId) },
            { name: '🚫 تحذير ثالث', value: mentionRole(r.warning3RoleId) },
            { name: '👑 إدارة عليا', value: mentionRole(r.upperManagementRoleId) },
          );
          return interaction.update({
            embeds: [embed], ephemeral: true,
            components: [
              new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1), new RoleSelectMenuBuilder().setCustomId('sl_report_adminRole').setPlaceholder('🎖️ رتبة الإدارة').setMaxValues(1)),
              new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_warning1').setPlaceholder('⚠️ تحذير أول').setMaxValues(1), new RoleSelectMenuBuilder().setCustomId('sl_report_warning2').setPlaceholder('⚠️⚠️ تحذير ثاني').setMaxValues(1)),
              new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_warning3').setPlaceholder('🚫 فصل').setMaxValues(1), new RoleSelectMenuBuilder().setCustomId('sl_report_upperMgmt').setPlaceholder('👑 إدارة عليا').setMaxValues(1)),
              new ActionRowBuilder().addComponents(btnBack, new ButtonBuilder().setCustomId('set_report_next').setLabel('📨 القنوات والكولداون ▶️').setStyle(ButtonStyle.Primary)),
            ]
          });
        } catch (e) { console.error(ERROR_CODES.SHOW_PAGE_REPORT_P1, e); return interaction.reply({ content: `⚠️ [${ERROR_CODES.SHOW_PAGE_REPORT_P1}] خطأ في عرض الرتب`, ephemeral: true }).catch(()=>{}); }
      } else {
        try {
          embed.setDescription('🔄 اختر القنوات والكولداون');
          embed.addFields(
            { name: '📨 روم الاستقبال', value: mentionChan(r.channelId) },
            { name: '📝 روم اللوق', value: mentionChan(r.logChannelId) },
            { name: '📢 روم الإشعارات', value: mentionChan(r.upperManagementChannelId) },
            { name: '⏱️ الكولداون', value: `${cdStatus} - المدة: ${cdDur} دقيقة` },
          );
          return interaction.update({
            embeds: [embed], ephemeral: true,
            components: [
              new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_report_channel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1), new ChannelSelectMenuBuilder().setCustomId('sl_report_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1), new ChannelSelectMenuBuilder().setCustomId('sl_report_upperMgmtChannel').setPlaceholder('📢 روم الإشعارات').setMaxValues(1)),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sl_report_cd_toggle').setLabel(r.cooldownEnabled !== false ? '⏱️ إطفاء الكولداون' : '⏱️ تشغيل الكولداون').setStyle(r.cooldownEnabled !== false ? ButtonStyle.Danger : ButtonStyle.Success), new ButtonBuilder().setCustomId('sl_report_cd_15').setLabel('15د').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('sl_report_cd_30').setLabel('30د').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('sl_report_cd_60').setLabel('60د').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('sl_report_cd_120').setLabel('120د').setStyle(ButtonStyle.Secondary)),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('set_report_prev').setLabel('◀️ الرتب').setStyle(ButtonStyle.Primary), btnBack),
            ]
          });
        } catch (e) { console.error(ERROR_CODES.SHOW_PAGE_REPORT_P2, e); return interaction.reply({ content: `⚠️ [${ERROR_CODES.SHOW_PAGE_REPORT_P2}] خطأ في عرض القنوات`, ephemeral: true }).catch(()=>{}); }
      }
    }

    // ------------------- الاستقالات -------------------
    if (type === 'resign') {
      try {
        const r = cfg.resign;
        embed.addFields(
          { name: '🎯 رتبة الاستخدام', value: mentionRole(r.allowedRoleId) },
          { name: '📨 روم الاستقبال', value: mentionChan(r.logChannelId) },
          { name: '🗑️ الرتب المُزالة', value: showList(r.rolesToRemove) },
          { name: '🎖️ رتبة ما بعد الاستقالة', value: mentionRole(r.resignRoleId) },
        );
        return interaction.update({
          embeds: [embed], ephemeral: true,
          components: [
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1), new RoleSelectMenuBuilder().setCustomId('sl_resign_resignRole').setPlaceholder('🎖️ رتبة ما بعد الاستقالة').setMaxValues(1)),
            new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_resign_logChannel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1)),
            new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_rolesToRemove').setPlaceholder('🗑️ رتب للإزالة').setMaxValues(25)),
            new ActionRowBuilder().addComponents(btnBack),
          ]
        });
      } catch (e) { console.error(ERROR_CODES.SHOW_PAGE_RESIGN, e); return interaction.reply({ content: `⚠️ [${ERROR_CODES.SHOW_PAGE_RESIGN}] خطأ في عرض إعدادات الاستقالة`, ephemeral: true }).catch(()=>{}); }
    }

    // إذا وصلنا هنا، الزر غير معروف
    return interaction.reply({ content: `⚠️ [${ERROR_CODES.UNKNOWN_BUTTON}] زر غير معروف: ${type}`, ephemeral: true }).catch(()=>{});
  } catch (e) {
    console.error('SHOW_PAGE_GLOBAL', e);
    return interaction.reply({ content: '⚠️ [ERR-999] خطأ عام', ephemeral: true }).catch(()=>{});
  }
}

// ------------------- اختيار القوائم (حفظ فوري) -------------------

async function handleSettingsSelect(interaction) {
  try {
    const id = interaction.customId;
    const cfg = getConfig();

    // أزرار الكولداون
    if (id === 'sl_report_cd_toggle') {
      try {
        cfg.report.cooldownEnabled = cfg.report.cooldownEnabled === false ? true : false;
        saveConfig(cfg);
        return interaction.reply({ content: `✅ تم ${cfg.report.cooldownEnabled ? 'تشغيل' : 'إطفاء'} الكولداون.`, ephemeral: true });
      } catch (e) { console.error(ERROR_CODES.SELECT_COOLDOWN, e); return interaction.reply({ content: `⚠️ [${ERROR_CODES.SELECT_COOLDOWN}] خطأ في تبديل الكولداون`, ephemeral: true }).catch(()=>{}); }
    }
    const cdMatch = id.match(/^sl_report_cd_(\d+)$/);
    if (cdMatch) {
      try {
        cfg.report.cooldownDuration = parseInt(cdMatch[1]);
        saveConfig(cfg);
        return interaction.reply({ content: `✅ تم تعيين مدة الكولداون إلى ${cdMatch[1]} دقيقة.`, ephemeral: true });
      } catch (e) { console.error(ERROR_CODES.SELECT_COOLDOWN, e); return interaction.reply({ content: `⚠️ [${ERROR_CODES.SELECT_COOLDOWN}] خطأ في تعيين المدة`, ephemeral: true }).catch(()=>{}); }
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
    return interaction.reply({ content: `✅ تم تحديث **${label}** → ${valueStr}`, ephemeral: true });
  } catch (e) {
    console.error(ERROR_CODES.SELECT_ROLE_CHANNEL, e);
    return interaction.reply({ content: `⚠️ [${ERROR_CODES.SELECT_ROLE_CHANNEL}] خطأ في حفظ الإعداد`, ephemeral: true }).catch(()=>{});
  }
}

module.exports = { handleSettings, showSettingsPage, handleSettingsSelect };

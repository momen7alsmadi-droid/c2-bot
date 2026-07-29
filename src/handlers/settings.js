const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder
} = require('discord.js');
const mongoose = require('mongoose');
const { getConfig, saveConfig } = require('../utils/storage');
const { version } = require('../utils/version');

const rl = (id) => id ? `<@&${id}>` : '❌ غير محدد';
const ch = (id) => id ? `<#${id}>` : '❌ غير محدد';
const lst = (arr) => Array.isArray(arr) && arr.length ? arr.map(i => `<@&${i}>`).join(', ') : 'لا يوجد';

/** عرض ملخص نطاق الرتب بدون تجاوز حد 1024 حرف */
function rangeSummary(arr, guild) {
  if (!Array.isArray(arr) || arr.length === 0) return '❌ غير محدد';
  if (arr.length === 1) return rl(arr[0]);
  // نحدد أدنى وأعلى رتبة حسب position
  const roles = arr.map(id => guild?.roles?.cache?.get(id)).filter(Boolean);
  if (roles.length < 2) return rl(arr[0]) + (arr.length > 1 ? ` +${arr.length - 1}` : '');
  roles.sort((a, b) => a.position - b.position);
  const first = roles[0];
  const last = roles[roles.length - 1];
  return `من ${first} إلى ${last} | الإجمالي: **${arr.length}** رتبة`;
}

// ---------- دالة مساعدة: تحديث أو رد حسب حالة الـ interaction ----------
async function respondOrUpdate(interaction, payload) {
  if (interaction.deferred) {
    return interaction.editReply(payload);
  }
  if (interaction.isCommand() || interaction.isModalSubmit()) {
    // أول مرة من الأمر السلاش أو بعد مودال
    return interaction.reply({ ...payload, ephemeral: true });
  }
  // من زر أو قائمة منسدلة → نؤجل أولاً ثم نحدث
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferUpdate().catch(() => {});
  }
  return interaction.editReply(payload);
}

// ---------- معرفة الصفحة من الـ customId ----------
function getPageFromCustomId(id) {
  // sla_رقم_رقم_...
  const parts = id.split('_');
  const system = parts[1];

  // الكولداون → report page 3
  if (system === 'report' && parts[2] === 'cd') return { type: 'report', page: 3 };

  // القوائم المنسدلة والروابط
  const field = parts.slice(2).join('_');

  const pageMap = {
    // إجازة
    'leave_allowedRole':     { type: 'leave', page: 1 },
    'leave_requestChannel':  { type: 'leave', page: 1 },
    'leave_logChannel':      { type: 'leave', page: 1 },
    'leave_leaveRole':       { type: 'leave', page: 2 },
    'leave_rolesToRemove':   { type: 'leave', page: 2 },
    'leave_exemptedRoles':  { type: 'leave', page: 2 },
    // دليل
    'daleel_allowedRole':    { type: 'daleel', page: 1 },
    'daleel_channel':        { type: 'daleel', page: 1 },
    'daleel_logChannel':     { type: 'daleel', page: 1 },
    // بلاغات
    'report_allowedRole':    { type: 'report', page: 1 },
    'report_adminRole':      { type: 'report', page: 1 },
    'report_warning1':       { type: 'report', page: 1 },
    'report_mentionRole':    { type: 'report', page: 1 },
    'report_warning2':       { type: 'report', page: 2 },
    'report_warning3':       { type: 'report', page: 2 },
    'report_upperMgmt':      { type: 'report', page: 2 },
    'report_channel':        { type: 'report', page: 3 },
    'report_logChannel':     { type: 'report', page: 3 },
    'report_upperMgmtChannel': { type: 'report', page: 3 },
    // استقالة
    'resign_allowedRole':    { type: 'resign', page: 1 },
    'resign_resignRole':     { type: 'resign', page: 1 },
    'resign_upperMgmt':      { type: 'resign', page: 1 },
    'resign_logChannel':     { type: 'resign', page: 1 },
    'resign_rolesToRemove':  { type: 'resign', page: 2 },
    'resign_exemptedRoles': { type: 'resign', page: 2 },
  };

  return pageMap[`${system}_${field}`] || { type: system, page: 1 };
}

// الصفحة الرئيسية
async function handleSettings(interaction) {
  try {
    const embed = new EmbedBuilder()
      .setTitle('⚙️ لوحة الإعدادات')
      .setColor(0x2ECC71)
      .setDescription('اختر النظام الذي تريد تعديل إعداداته:')
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('set_leave').setLabel('📋 إجازة').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('set_daleel').setLabel('📌 دلائل').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('set_report').setLabel('🛡️ بلاغات').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('set_resign').setLabel('📄 استقالة').setStyle(ButtonStyle.Primary),
    );
    return respondOrUpdate(interaction, { embeds: [embed], components: [row] });
  } catch (e) {
    console.error('ERR-HOME:', e.message);
    const errMsg = `⚠️ **خطأ:** \`${e.message.slice(0, 500)}\``;
    if (interaction.deferred) {
      await interaction.editReply({ content: errMsg, components: [] }).catch(() => {});
    } else if (interaction.replied) {
      await interaction.followUp({ content: errMsg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: errMsg, ephemeral: true }).catch(() => {});
    }
  }
}

// عرض صفحة إعدادات
async function showSettingsPage(interaction, type, page) {
  try {
    const cfg = getConfig();
    const embed = new EmbedBuilder()
      .setTitle(`⚙️ ${type === 'leave' ? '📋 الإجازات' : type === 'daleel' ? '📌 الدلائل' : type === 'report' ? '🛡️ البلاغات' : '📄 الاستقالات'}`)
      .setColor(0x3498DB)
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    const btnBack = new ButtonBuilder().setCustomId('settings_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary);

    // الإجازة - صفحة 1
    if (type === 'leave' && page === 1) {
      const l = cfg.leave;
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: rl(l.allowedRoleId) },
        { name: '📨 روم الطلبات', value: ch(l.requestChannelId) },
        { name: '📝 روم اللوق', value: ch(l.logChannelId) },
      );
      return respondOrUpdate(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_leave_requestChannel').setPlaceholder('📨 روم الطلبات').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_leave_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
          new ActionRowBuilder().addComponents(btnBack, new ButtonBuilder().setCustomId('set_leave_2').setLabel('▶️ الرتب').setStyle(ButtonStyle.Primary)),
        ]
      });
    }

    // الإجازة - صفحة 2
    if (type === 'leave' && page === 2) {
      const l = cfg.leave;
      embed.addFields(
        { name: '🎖️ رتبة الإجازة', value: rl(l.leaveRoleId) },
        { name: '🗑️ الرتب المُزالة', value: rangeSummary(l.rolesToRemove, interaction.guild) },
        { name: '🛡️ الرتب المستثناة (لا تُسحب)', value: lst(l.exemptedRoles) },
      );
      return respondOrUpdate(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_leaveRole').setPlaceholder('🎖️ رتبة الإجازة').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_rolesToRemove').setPlaceholder('🗑️ اختر أدنى وأعلى رتبة للنطاق').setMinValues(2).setMaxValues(2)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_leave_exemptedRoles').setPlaceholder('🛡️ رتب مستثناة من السحب').setMinValues(0).setMaxValues(25)),
          new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('set_leave_1').setLabel('◀️ الأساسيات').setStyle(ButtonStyle.Primary), btnBack),
        ]
      });
    }

    // الدلائل
    if (type === 'daleel') {
      const d = cfg.daleel;
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: rl(d.allowedRoleId) },
        { name: '📨 روم الإرسال', value: ch(d.channelId) },
        { name: '📝 روم اللوق', value: ch(d.logChannelId) },
      );
      return respondOrUpdate(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_daleel_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_channel').setPlaceholder('📨 روم الإرسال').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_daleel_logChannel').setPlaceholder('📝 روم اللوق').setMaxValues(1)),
          new ActionRowBuilder().addComponents(btnBack),
        ]
      });
    }

    // البلاغات - صفحة 1 (الرتب 1)
    if (type === 'report' && page === 1) {
      const r = cfg.report;
      embed.setDescription('🔄 اختر الرتب (1/2)');
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: rl(r.allowedRoleId) },
        { name: '🎖️ رتبة الإدارة', value: rl(r.adminRoleId) },
        { name: '⚠️ تحذير أول', value: rl(r.warning1RoleId) },
        { name: '🔔 رتبة الإشعار (تُمنشن عند تقديم بلاغ)', value: rl(r.mentionRoleId) },
      );
      return respondOrUpdate(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_adminRole').setPlaceholder('🎖️ رتبة الإدارة').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_warning1').setPlaceholder('⚠️ تحذير أول').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_mentionRole').setPlaceholder('🔔 رتبة الإشعار').setMaxValues(1)),
          new ActionRowBuilder().addComponents(btnBack, new ButtonBuilder().setCustomId('set_report_2').setLabel('▶️ رتب 2/2').setStyle(ButtonStyle.Primary)),
        ]
      });
    }

    // البلاغات - صفحة 2 (الرتب 2)
    if (type === 'report' && page === 2) {
      const r = cfg.report;
      embed.setDescription('🔄 اختر الرتب (2/2)');
      embed.addFields(
        { name: '⚠️⚠️ تحذير ثاني', value: rl(r.warning2RoleId) },
        { name: '🚫 تحذير ثالث', value: rl(r.warning3RoleId) },
        { name: '👑 إدارة عليا', value: rl(r.upperManagementRoleId) },
      );
      return respondOrUpdate(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_warning2').setPlaceholder('⚠️⚠️ تحذير ثاني').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_warning3').setPlaceholder('🚫 فصل').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_report_upperMgmt').setPlaceholder('👑 إدارة عليا').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('set_report_1').setLabel('◀️ رتب 1/2').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('set_report_3').setLabel('▶️ قنوات').setStyle(ButtonStyle.Primary)),
        ]
      });
    }

    // البلاغات - صفحة 3 (القنوات والكولداون)
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
      return respondOrUpdate(interaction, {
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

    // الاستقالة - صفحة 1
    if (type === 'resign' && page === 1) {
      const r = cfg.resign;
      embed.setDescription('👑 أي شخص عنده صلاحية Administrator يعتبر من الإدارة العليا تلقائياً');
      embed.addFields(
        { name: '🎯 رتبة الاستخدام', value: rl(r.allowedRoleId) },
        { name: '🎖️ رتبة ما بعد الاستقالة', value: rl(r.resignRoleId) },
        { name: '👑 رتبة الإدارة العليا', value: rl(r.upperManagementRoleId) },
        { name: '📨 روم الاستقبال', value: ch(r.logChannelId) },
      );
      return respondOrUpdate(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_allowedRole').setPlaceholder('🎯 رتبة الاستخدام').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_resignRole').setPlaceholder('🎖️ رتبة ما بعد الاستقالة').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_upperMgmt').setPlaceholder('👑 رتبة الإدارة العليا').setMaxValues(1)),
          new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('sl_resign_logChannel').setPlaceholder('📨 روم الاستقبال').setMaxValues(1)),
          new ActionRowBuilder().addComponents(btnBack, new ButtonBuilder().setCustomId('set_resign_2').setLabel('▶️ الرتب المُزالة').setStyle(ButtonStyle.Primary)),
        ]
      });
    }

    // الاستقالة - صفحة 2
    if (type === 'resign' && page === 2) {
      const r = cfg.resign;
      embed.addFields(
        { name: '🗑️ الرتب المُزالة', value: rangeSummary(r.rolesToRemove, interaction.guild) },
        { name: '🛡️ الرتب المستثناة (لا تُسحب)', value: lst(r.exemptedRoles) },
      );
      return respondOrUpdate(interaction, {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_rolesToRemove').setPlaceholder('🗑️ اختر أدنى وأعلى رتبة للنطاق').setMinValues(2).setMaxValues(2)),
          new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('sl_resign_exemptedRoles').setPlaceholder('🛡️ رتب مستثناة من السحب').setMinValues(0).setMaxValues(25)),
          new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('set_resign_1').setLabel('◀️ الأساسيات').setStyle(ButtonStyle.Primary), btnBack),
        ]
      });
    }

    return respondOrUpdate(interaction, { content: '⚠️ ERR-UNK' });
  } catch (e) {
    console.error('ERR-GLOBAL:', e.message);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
    const errMsg = `⚠️ **خطأ:** \`${e.message.slice(0, 500)}\``;
    if (interaction.deferred) {
      await interaction.editReply({ content: errMsg, components: [] }).catch(() => {});
    } else if (interaction.replied) {
      await interaction.followUp({ content: errMsg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: errMsg, ephemeral: true }).catch(() => {});
    }
  }
}

// اختيار القوائم والأزرار (كولداون)
async function handleSettingsSelect(interaction) {
  await interaction.deferUpdate().catch(() => {});
  try {
    const id = interaction.customId;
    const cfg = getConfig();

    // كولداون (أزرار)
    if (id === 'sl_report_cd_toggle') {
      cfg.report.cooldownEnabled = cfg.report.cooldownEnabled === false ? true : false;
      saveConfig(cfg);
      // إعادة عرض صفحة البلاغات 3 بعد التحديث
      return showSettingsPage(interaction, 'report', 3);
    }
    const cdMatch = id.match(/^sl_report_cd_(\d+)$/);
    if (cdMatch) {
      cfg.report.cooldownDuration = parseInt(cdMatch[1]);
      saveConfig(cfg);
      return showSettingsPage(interaction, 'report', 3);
    }

    // قوائم منسدلة (رتب / قنوات)
    const parts = id.split('_');
    if (parts[0] !== 'sl') return;
    const system = parts[1];
    const field = parts.slice(2).join('_');
    const values = interaction.values;
    if (!cfg[system]) return respondOrUpdate(interaction, { content: `⚠️ النظام ${system} غير موجود` });

    // خريطة: اسم الحقل في الـ customId → اسم الحقل الحقيقي في الكوفيغ
    const fieldMap = {
      'allowedRole': 'allowedRoleId',
      'adminRole': 'adminRoleId',
      'leaveRole': 'leaveRoleId',
      'resignRole': 'resignRoleId',
      'channel': 'channelId',
      'requestChannel': 'requestChannelId',
      'logChannel': 'logChannelId',
      'upperMgmtChannel': 'upperManagementChannelId',
      'warning1': 'warning1RoleId',
      'warning2': 'warning2RoleId',
      'warning3': 'warning3RoleId',
      'mentionRole': 'mentionRoleId',
      'upperMgmt': 'upperManagementRoleId',
    };
    const listFields = ['rolesToRemove', 'exemptedRoles'];

    const mapKey = fieldMap[field] || field;

    if (listFields.includes(field)) {
      // نظام النطاق الهرمي: منشن رتبتين فقط، نحسب الرتب بينهما
      if (field === 'rolesToRemove' && values.length === 2) {
        const roleA = interaction.guild.roles.cache.get(values[0]);
        const roleB = interaction.guild.roles.cache.get(values[1]);
        if (roleA && roleB) {
          const minPos = Math.min(roleA.position, roleB.position);
          const maxPos = Math.max(roleA.position, roleB.position);
          // نجمع كل الرتب بين أقل position وأعلى position (شاملاً)
          const rolesInRange = interaction.guild.roles.cache.filter(r => r.position >= minPos && r.position <= maxPos && r.id !== interaction.guild.id);
          cfg[system].rolesToRemove = rolesInRange.map(r => r.id);
        } else {
          cfg[system][field] = values || [];
        }
      } else {
        // rolesToRemove (أقل من 2) أو exemptedRoles
        // استبدال كامل للمصفوفة (حتى لو فارغة [] إذا ألغى المستخدم التحديد)
        cfg[system][field] = [...(values || [])];
      }
    } else {
      cfg[system][mapKey] = values[0] || null;
    }

    saveConfig(cfg);

    // بعد الحفظ، نعيد عرض نفس الصفحة بقيم محدّثة
    const pageInfo = getPageFromCustomId(id);
    return showSettingsPage(interaction, pageInfo.type, pageInfo.page);
  } catch (e) {
    console.error('ERR-SEL:', e.message, e.stack);
    const errMsg = `⚠️ **خطأ:** \`${e.message.slice(0, 500)}\``;
    if (interaction.deferred) {
      await interaction.editReply({ content: errMsg, components: [] }).catch(() => {});
    } else if (interaction.replied) {
      await interaction.followUp({ content: errMsg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: errMsg, ephemeral: true }).catch(() => {});
    }
  }
}

/** فحص حالة قاعدة البيانات */
async function handleDbCheck(interaction) {
  try {
    const readyState = mongoose.connection.readyState;
    const stateNames = {
      0: '❌ غير متصل (Disconnected)',
      1: '✅ متصل (Connected)',
      2: '⏳ جاري الاتصال (Connecting)',
      3: '⚠️ يتم قطع الاتصال (Disconnecting)',
    };

    let desc = `**الحالة:** ${stateNames[readyState] || '❓ غير معروف'}\n\n`;

    if (readyState === 1) {
      desc += '✅ **قاعدة البيانات شغالة ويعمل.**\n';
      desc += `🗄️ **القاعدة:** \`${mongoose.connection.db.databaseName}\`\n`;
      desc += `🖥️ **المضيف:** \`${mongoose.connection.host}\``;
    } else {
      desc += '⚠️ **قاعدة البيانات غير متصلة.**\n\n';
      desc += '🔧 **حلول:**\n';
      desc += '1. تأكد من متغير MONGODB_URI في الإعدادات\n';
      desc += '2. أضف 0.0.0.0/0 في MongoDB Atlas → Network Access\n';
      desc += '3. أعد تشغيل البوت';
    }

    const embed = new EmbedBuilder()
      .setTitle('🗄️ فحص قاعدة البيانات')
      .setColor(readyState === 1 ? 0x2ECC71 : 0xE74C3C)
      .setDescription(desc)
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('settings_back').setLabel('🔙 رجوع للوحة الإعدادات').setStyle(ButtonStyle.Secondary),
    );

    return respondOrUpdate(interaction, { embeds: [embed], components: [row] });
  } catch (e) {
    console.error('ERR-DB:', e.message);
    const errMsg = `⚠️ **خطأ:** \`${e.message.slice(0, 500)}\``;
    try {
      if (interaction.isRepliable()) {
        if (interaction.deferred) await interaction.editReply({ content: errMsg, components: [] }).catch(() => {});
        else if (!interaction.replied) await interaction.reply({ content: errMsg, ephemeral: true }).catch(() => {});
      }
    } catch(_) {}
  }
}

module.exports = { handleSettings, showSettingsPage, handleSettingsSelect, handleDbCheck };

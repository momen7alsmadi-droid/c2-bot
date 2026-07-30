/**
 * admin-panel.js - 🛡️ نظام الإدارة - لوحة الإعدادات
 * كل التفاعلات تستخدم interaction.update لتعديل نفس الرسالة
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType
} = require('discord.js');
const { version } = require('../../package.json');
const { getAdminConfig, saveAdminConfig } = require('../utils/adminStorage');

// ---------- دالة مساعدة ----------
async function respondOrUpdate(interaction, payload) {
  if (interaction.deferred) return interaction.editReply(payload);
  if (interaction.isCommand()) return interaction.reply({ ...payload, ephemeral: true });
  // للأزرار والقوائم: defer أولاً لتجنب مشكلة InteractionNotReplied
  try {
    await interaction.deferUpdate();
    return interaction.editReply(payload);
  } catch {
    return interaction.editReply(payload).catch(() => {});
  }
}

/** عرض ملخص نطاق الرتب */
function rangeSummary(arr, guild) {
  if (!Array.isArray(arr) || arr.length === 0) return '❌ غير محدد';
  if (arr.length === 1) return `<@&${arr[0]}>`;
  const roles = arr.map(id => guild?.roles?.cache?.get(id)).filter(Boolean);
  if (roles.length < 2) return arr.slice(0, 2).map(id => `<@&${id}>`).join(', ');
  roles.sort((a, b) => a.position - b.position);
  return `من ${roles[0]} إلى ${roles[roles.length - 1]} | الإجمالي: **${arr.length}** رتبة`;
}

const rl = (id) => id ? `<@&${id}>` : '❌ غير محدد';
const ch = (id) => id ? `<#${id}>` : '❌ غير محدد';

// ================== اللوحة الرئيسية ==================

async function handleAdminPanelMain(interaction) {
  try {
    const cfg = getAdminConfig();
    const guild = interaction.guild;

    // الحصول على نطاق الرتب الفعلي (كل الرتب بين البداية والنهاية)
    let actualRolesInRange = [];
    if (cfg.hierarchyRangeStartId && cfg.hierarchyRangeEndId && guild) {
      const roleA = guild.roles.cache.get(cfg.hierarchyRangeStartId);
      const roleB = guild.roles.cache.get(cfg.hierarchyRangeEndId);
      if (roleA && roleB) {
        const minPos = Math.min(roleA.position, roleB.position);
        const maxPos = Math.max(roleA.position, roleB.position);
        actualRolesInRange = guild.roles.cache
          .filter(r => r.position >= minPos && r.position <= maxPos && r.id !== guild.id)
          .map(r => r.id);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🛡️ لوحة نظام الإدارة')
      .setColor(0x3498DB)
      .setDescription('إدارة الرتب والترقيات والتنزيلات')
      .addFields(
        { name: '🎖️ رتبة الإدارة المشتركة', value: rl(cfg.sharedAdminRoleId), inline: false },
        { name: '📊 نطاق التسلسل الهرمي', value: cfg.hierarchyRangeStartId && cfg.hierarchyRangeEndId
          ? `من ${rl(cfg.hierarchyRangeStartId)} إلى ${rl(cfg.hierarchyRangeEndId)} | الإجمالي: **${actualRolesInRange.length}** رتبة`
          : '❌ غير محدد', inline: false },
        { name: '🛡️ الرتب المستثناة', value: cfg.excludedRoles.length > 0
          ? cfg.excludedRoles.map(id => rl(id)).join(', ') : 'لا يوجد', inline: false },
        { name: '👑 رتب الإدارة العليا', value: cfg.highAdminRoles.length > 0
          ? cfg.highAdminRoles.map(id => rl(id)).join(', ') : '❌ غير محددة', inline: false },
        { name: '📤 روم الترقية', value: ch(cfg.promotionChannelId), inline: true },
        { name: '📥 روم التنزيل', value: ch(cfg.demotionChannelId), inline: true },
      )
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_roles').setLabel('🎖️ الرتب').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_high').setLabel('👑 الإدارة العليا').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adm_rooms').setLabel('📡 الرومات').setStyle(ButtonStyle.Primary),
    );

    return respondOrUpdate(interaction, { embeds: [embed], components: [row] });
  } catch (e) {
    console.error('❌ handleAdminPanelMain:', e.message);
    return respondOrUpdate(interaction, { content: '⚠️ خطأ في عرض اللوحة.' });
  }
}

// ================== الرتب ==================

async function showRolesPage(interaction) {
  try {
    const cfg = getAdminConfig();

    const embed = new EmbedBuilder()
      .setTitle('🎖️ إعدادات الرتب')
      .setColor(0x3498DB)
      .setDescription('اختر الرتب المناسبة لكل خيار:')
      .addFields(
        { name: '🎖️ رتبة الإدارة المشتركة', value: rl(cfg.sharedAdminRoleId), inline: false },
        { name: '📊 نطاق التسلسل الهرمي', value: cfg.hierarchyRangeStartId && cfg.hierarchyRangeEndId
          ? `${rl(cfg.hierarchyRangeStartId)} ← ${rl(cfg.hierarchyRangeEndId)}`
          : '❌ غير محدد (اختر رتبتين: البداية والنهاية)', inline: false },
        { name: '🛡️ الرتب المستثناة من السحب', value: cfg.excludedRoles.length > 0
          ? cfg.excludedRoles.map(id => rl(id)).join(', ') : 'لا يوجد', inline: false },
      )
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    const components = [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('adm_sel_sharedAdminRole')
          .setPlaceholder('🎖️ اختر رتبة الإدارة المشتركة')
          .setMaxValues(1)
      ),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('adm_sel_hierarchyRange')
          .setPlaceholder('📊 اختر رتبتي البداية والنهاية')
          .setMinValues(2)
          .setMaxValues(2)
      ),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('adm_sel_excludedRoles')
          .setPlaceholder('🛡️ اختر الرتب المستثناة')
          .setMinValues(0)
          .setMaxValues(25)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      ),
    ];

    return respondOrUpdate(interaction, { embeds: [embed], components });
  } catch (e) {
    console.error('❌ showRolesPage:', e.message);
    return respondOrUpdate(interaction, { content: '⚠️ خطأ.' });
  }
}

// ================== الإدارة العليا ==================

async function showHighAdminPage(interaction) {
  try {
    const cfg = getAdminConfig();
    const guild = interaction.guild;

    // كشف تلقائي لكل الرتب التي لديها Administrator
    const allRoles = guild.roles.cache
      .filter(r => r.permissions.has('Administrator'))
      .sort((a, b) => b.position - a.position);

    const adminRolesList = allRoles.map(r => `${r} — \`${r.id}\``).join('\n') || 'لا يوجد';

    const embed = new EmbedBuilder()
      .setTitle('👑 رتب الإدارة العليا')
      .setColor(0x9B59B6)
      .setDescription('اختر الرتب التي تمتلك صلاحية الإدارة العليا (تستطيع ترقية وتنزيل الأعضاء):')
      .addFields(
        { name: '👑 الرتب الحالية (مخزنة)', value: cfg.highAdminRoles.length > 0
          ? cfg.highAdminRoles.map(id => `<@&${id}>`).join(', ') : '❌ غير محددة', inline: false },
        { name: '🤖 الرتب التي تملك Administrator', value: adminRolesList || 'لا يوجد', inline: false },
      )
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    const selectRow = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('adm_sel_highAdminRoles')
        .setPlaceholder('👑 اختر رتب الإدارة العليا (يدوي)')
        .setMinValues(0)
        .setMaxValues(25)
    );

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_high_auto').setLabel('🔄 تعيين رتب الأدمن تلقائياً').setStyle(ButtonStyle.Success).setDisabled(allRoles.size === 0),
      new ButtonBuilder().setCustomId('adm_high_clear').setLabel('🗑️ مسح الكل').setStyle(ButtonStyle.Danger),
    );

    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adm_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
    );

    return respondOrUpdate(interaction, { embeds: [embed], components: [selectRow, btnRow, navRow] });
  } catch (e) {
    console.error('❌ showHighAdminPage:', e.message, e.stack?.split('\n')[1]);
    return respondOrUpdate(interaction, { content: `⚠️ خطأ: ${e.message}` });
  }
}

// ================== الرومات ==================

async function showRoomsPage(interaction) {
  try {
    const cfg = getAdminConfig();

    const embed = new EmbedBuilder()
      .setTitle('📡 إعدادات الرومات')
      .setColor(0x2ECC71)
      .setDescription('اختر الرومات المخصصة للترقية والتنزيل:')
      .addFields(
        { name: '📤 روم الترقية', value: ch(cfg.promotionChannelId), inline: false },
        { name: '📥 روم التنزيل', value: ch(cfg.demotionChannelId), inline: false },
      )
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    const components = [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('adm_sel_promotionChannel')
          .setPlaceholder('📤 اختر روم الترقية')
          .setChannelTypes(ChannelType.GuildText)
          .setMaxValues(1)
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('adm_sel_demotionChannel')
          .setPlaceholder('📥 اختر روم التنزيل')
          .setChannelTypes(ChannelType.GuildText)
          .setMaxValues(1)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      ),
    ];

    return respondOrUpdate(interaction, { embeds: [embed], components });
  } catch (e) {
    console.error('❌ showRoomsPage:', e.message);
    return respondOrUpdate(interaction, { content: '⚠️ خطأ.' });
  }
}

// ================== إرسال اللوحة إلى قناة ==================

async function handleSendPanel(interaction) {
  try {
    await interaction.deferUpdate().catch(() => {});
    const cfg = getAdminConfig();
    const guild = interaction.guild;

    if (!cfg.promotionChannelId) {
      return interaction.editReply({
        content: '⚠️ لم يتم تحديد روم الترقية بعد. اذهب إلى [📡 الرومات] واختر روم الترقية أولاً.',
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('adm_rooms').setLabel('📡 الرومات').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('adm_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
        )]
      });
    }

    const result = await sendBoardPanelToChannel(guild, cfg.promotionChannelId);
    if (result.success) {
      return interaction.editReply({
        content: `✅ تم إرسال لوحة الإدارة إلى <#${cfg.promotionChannelId}> بنجاح.`,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('adm_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
        )]
      });
    }
    return interaction.editReply({ content: `❌ فشل الإرسال: ${result.error}` });
  } catch (e) {
    console.error('❌ handleSendPanel:', e.message);
    try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch {}
  }
}

// ================== تعيين رتب الأدمن تلقائياً ==================

async function handleHighAdminAuto(interaction) {
  try {
    await interaction.deferUpdate().catch(() => {});
    const cfg = getAdminConfig();
    const guild = interaction.guild;

    // كشف كل الرتب اللي عندها Administrator وترتيبها تنازلياً
    const adminRoles = guild.roles.cache
      .filter(r => r.permissions.has('Administrator'))
      .sort((a, b) => b.position - a.position)
      .map(r => r.id);

    if (adminRoles.length === 0) {
      return interaction.editReply({ content: '⚠️ لا توجد رتب تملك صلاحية Administrator في السيرفر.' });
    }

    cfg.highAdminRoles = adminRoles;
    saveAdminConfig(cfg);

    await interaction.editReply({
      content: `✅ تم تعيين ${adminRoles.length} رتبة كإدارة عليا تلقائياً:\n${adminRoles.map(id => `<@&${id}>`).join(', ')}`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_high').setLabel('👑 العودة للإدارة العليا').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  } catch (e) {
    console.error('❌ handleHighAdminAuto:', e.message);
    try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch {}
  }
}

async function handleHighAdminClear(interaction) {
  try {
    await interaction.deferUpdate().catch(() => {});
    const cfg = getAdminConfig();
    cfg.highAdminRoles = [];
    saveAdminConfig(cfg);

    await interaction.editReply({
      content: '🗑️ تم مسح جميع رتب الإدارة العليا.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_high').setLabel('👑 العودة للإدارة العليا').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  } catch (e) {
    console.error('❌ handleHighAdminClear:', e.message);
    try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch {}
  }
}

// ================== معالج القوائم المنسدلة ==================

async function handleAdminSelect(interaction) {
  try {
    await interaction.deferUpdate().catch(() => {});
    const id = interaction.customId;
    const cfg = getAdminConfig();
    const values = interaction.values || [];

    // خريطة: last part of customId → config field
    const fieldMap = {
      'sharedAdminRole': 'sharedAdminRoleId',
      'hierarchyRange': null, // special handling
      'excludedRoles': 'excludedRoles',
      'highAdminRoles': 'highAdminRoles',
      'promotionChannel': 'promotionChannelId',
      'demotionChannel': 'demotionChannelId'
    };

    // استخراج اسم الحقل من id
    const parts = id.split('_');
    const fieldKey = parts.slice(2).join('_'); // adm_sel_{fieldKey}

    if (fieldKey === 'hierarchyRange' && values.length === 2) {
      cfg.hierarchyRangeStartId = values[0];
      cfg.hierarchyRangeEndId = values[1];
    } else if (fieldKey === 'excludedRoles' || fieldKey === 'highAdminRoles') {
      cfg[fieldMap[fieldKey]] = [...values];
    } else if (fieldKey === 'sharedAdminRole' || fieldKey === 'promotionChannel' || fieldKey === 'demotionChannel') {
      cfg[fieldMap[fieldKey]] = values[0] || null;
    }

    saveAdminConfig(cfg);

    // إعادة عرض الصفحة المناسبة
    if (fieldKey === 'sharedAdminRole' || fieldKey === 'hierarchyRange' || fieldKey === 'excludedRoles') {
      return showRolesPage(interaction);
    } else if (fieldKey === 'highAdminRoles') {
      return showHighAdminPage(interaction);
    } else if (fieldKey === 'promotionChannel' || fieldKey === 'demotionChannel') {
      return showRoomsPage(interaction);
    }

    return handleAdminPanelMain(interaction);
  } catch (e) {
    console.error('❌ handleAdminSelect:', e.message);
    try {
      await interaction.editReply({ content: '⚠️ خطأ في معالجة الاختيار.' });
    } catch {}
  }
}

// ================== الموزع الرئيسي ==================

async function handleAdminInteraction(interaction) {
  const id = interaction.customId;
  const parts = id.split('_');
  const prefix = parts[0];

  if (prefix !== 'adm') return;

  // أزرار التنقل
  if (id === 'adm_main') return handleAdminPanelMain(interaction);
  if (id === 'adm_roles') return showRolesPage(interaction);
  if (id === 'adm_high') return showHighAdminPage(interaction);
  if (id === 'adm_rooms') return showRoomsPage(interaction);

  // أزرار الإدارة العليا
  if (id === 'adm_high_auto') return handleHighAdminAuto(interaction);
  if (id === 'adm_high_clear') return handleHighAdminClear(interaction);

  // القوائم المنسدلة (adm_sel_xxx)
  if (id.startsWith('adm_sel_')) {
    return handleAdminSelect(interaction);
  }

  // إذا ما تعرفنا عليه
  try {
    await interaction.deferUpdate().catch(() => {});
    await interaction.editReply({ content: `⚠️ أمر غير معروف: ${id}` });
  } catch {}
}

module.exports = {
  handleAdminPanelMain,
  handleAdminInteraction
};

/**
 * admin-board.js - 🛡️ لوحة الإدارة، الترقية، التنزيل، السحب، وتوب الإدارة
 * كل التفاعلات تستخدم interaction.update
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const { version } = require('../../package.json');
const { getAdminConfig } = require('../utils/adminStorage');
const { sendLog } = require('../utils/helpers');
const { handleMyStats, handleTopStats, handleTopNav, handlePickPerson } = require('../../ticket-system/handlers/ticketStatsBuilder');

// ---------- حالة pagination لكل مستخدم ----------
const paginationState = new Map();

function getState(userId) { return paginationState.get(userId) || null; }

function setState(userId, state) {
  paginationState.set(userId, state);
  setTimeout(() => paginationState.delete(userId), 5 * 60 * 1000);
}

function clearState(userId) { paginationState.delete(userId); }

// ---------- دالة مساعدة ----------
async function respondOrUpdate(interaction, payload) {
  // ===== إضافة الزر الشكلي 'إعادة تعيين' في نهاية الرسائل التي تحتوي قوائم منسدلة =====
  const { appendDecorativeOption } = require('../utils/decorativeReset');
  if (payload && Array.isArray(payload.components) && payload.components.length > 0) {
    payload.components = appendDecorativeOption(payload.components);
  }

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

/** هل المستخدم من الإدارة العليا؟ */
function isHighAdmin(member, cfg) {
  if (member.permissions.has('Administrator')) return true;
  const highRoles = cfg.highAdminRoles || [];
  return highRoles.some(roleId => member.roles.cache.has(roleId));
}

/** جلب جميع أعضاء الإدارة الفعليين (بدون الرتب المستثناة) */
async function getAdminMembers(guild, cfg) {
  if (!guild) return [];
  // نجلب كل الأعضاء والرولات أولاً لحل مشكلة الكاش الناقص
  try { await guild.members.fetch(); } catch (e) { console.error('❌ getAdminMembers fetch members:', e.message); }
  try { await guild.roles.fetch(); } catch (e) { console.error('❌ getAdminMembers fetch roles:', e.message); }
  const hierarchyRoles = getHierarchyRolesInRange(guild, cfg);
  const hierarchyRoleIds = hierarchyRoles.map(r => r.id);

  const highRoles = getHighAdminRoleIds(cfg, guild);

  console.log(`📊 getAdminMembers: members in cache = ${guild.members.cache.size}, roles in cache = ${guild.roles.cache.size}, highAdminRoles = ${highRoles.length}, hierarchyRoles = ${hierarchyRoles.length}`);

  return guild.members.cache.filter(m => {
    if (m.user.bot) return false;

    // هل عنده رتبة من الإدارة العليا؟
    if (highRoles.some(roleId => m.roles.cache.has(roleId))) return true;

    // هل عنده رتبة الإدارة المشتركة + رتبة ضمن النطاق الهرمي؟
    if (cfg.sharedAdminRoleId && m.roles.cache.has(cfg.sharedAdminRoleId)) {
      const hasHierarchy = m.roles.cache.some(rId => hierarchyRoleIds.includes(rId));
      if (hasHierarchy) return true;
      return true;
    }

    // هل عنده رتب ضمن النطاق الهرمي؟
    const memberHierarchyRoles = m.roles.cache.filter(rId => hierarchyRoleIds.includes(rId));
    return memberHierarchyRoles.size > 0;
  }).sort((a, b) => b.roles.highest.position - a.roles.highest.position).map(m => m);
}

/** جلب كل الرتب ضمن التسلسل الهرمي (بدون الرتب المستثناة — كأنها غير موجودة) */
function getHierarchyRolesInRange(guild, cfg) {
  if (!cfg.hierarchyRangeStartId || !cfg.hierarchyRangeEndId || !guild) return [];
  const roleA = guild.roles.cache.get(cfg.hierarchyRangeStartId);
  const roleB = guild.roles.cache.get(cfg.hierarchyRangeEndId);
  if (!roleA || !roleB) {
    console.log(`📊 getHierarchyRolesInRange: roles not found in cache. start=${cfg.hierarchyRangeStartId} ${!!roleA}, end=${cfg.hierarchyRangeEndId} ${!!roleB}`);
    return [];
  }
  const minPos = Math.min(roleA.position, roleB.position);
  const maxPos = Math.max(roleA.position, roleB.position);
  const excluded = cfg.excludedRoles || [];
  return guild.roles.cache.filter(r => r.position >= minPos && r.position <= maxPos && r.id !== guild.id && !excluded.includes(r.id))
    .sort((a, b) => a.position - b.position).map(r => r);
}

/** جلب جميع رتب الإدارة العليا (من القائمة المحددة + النطاق) */
function getHighAdminRoleIds(cfg, guild) {
  const ids = new Set(cfg.highAdminRoles || []);
  if (cfg.highAdminRangeStartId && cfg.highAdminRangeEndId && guild) {
    const roleA = guild.roles.cache.get(cfg.highAdminRangeStartId);
    const roleB = guild.roles.cache.get(cfg.highAdminRangeEndId);
    if (roleA && roleB) {
      const minPos = Math.min(roleA.position, roleB.position);
      const maxPos = Math.max(roleA.position, roleB.position);
      guild.roles.cache.filter(r => r.position >= minPos && r.position <= maxPos && r.id !== guild.id)
        .forEach(r => ids.add(r.id));
    }
  }
  return [...ids];
}

/** الحصول على أعلى رتبة للعضو (الإدارة العليا لها الأولوية) */
function getHighestAdminRole(member, cfg, guild) {
  const memberRoles = member.roles.cache;
  const excluded = cfg.excludedRoles || [];

  // 1. الإدارة العليا لها أولوية قصوى (من القائمة + النطاق)
  const allHighIds = getHighAdminRoleIds(cfg, guild);
  if (allHighIds.length > 0) {
    const highRoleObjs = allHighIds
      .map(id => guild.roles.cache.get(id))
      .filter(r => r && memberRoles.has(r.id));
    if (highRoleObjs.length > 0) {
      return highRoleObjs.sort((a, b) => b.position - a.position)[0];
    }
  }

  // 2. ابحث عن أعلى رتبة ضمن النطاق الهرمي (غير مستثناة)
  const rolesInRange = getHierarchyRolesInRange(guild, cfg);
  const validRoles = rolesInRange.filter(r => memberRoles.has(r.id) && !excluded.includes(r.id));
  if (validRoles.length > 0) {
    return validRoles[validRoles.length - 1];
  }

  // 3. الرتبة المشتركة كبديل
  if (cfg.sharedAdminRoleId && memberRoles.has(cfg.sharedAdminRoleId)) {
    return guild.roles.cache.get(cfg.sharedAdminRoleId) || null;
  }

  return null;
}

/** ترتيب العضو بين الإدارة */
async function getAdminRank(member, cfg, guild) {
  const admins = await getAdminMembers(guild, cfg);
  const idx = admins.findIndex(m => m.id === member.id);
  if (idx === -1) return null;
  return { rank: idx + 1, total: admins.length };
}

/** رفع أعلى رتبة تالية ضمن النطاق */
function getNextHigherRole(currentRole, guild, cfg) {
  const rolesInRange = getHierarchyRolesInRange(guild, cfg);
  if (rolesInRange.length === 0) return null;
  const excluded = cfg.excludedRoles || [];
  const curIdx = rolesInRange.findIndex(r => r.id === currentRole?.id);
  if (curIdx === -1 || curIdx >= rolesInRange.length - 1) return null;
  // ابحث عن أول رتبة أعلى غير مستثناة
  for (let i = curIdx + 1; i < rolesInRange.length; i++) {
    if (!excluded.includes(rolesInRange[i].id)) return rolesInRange[i];
  }
  return null;
}

/** أدنى رتبة سابقة ضمن النطاق */
function getNextLowerRole(currentRole, guild, cfg) {
  const rolesInRange = getHierarchyRolesInRange(guild, cfg);
  if (rolesInRange.length === 0) return null;
  const excluded = cfg.excludedRoles || [];
  const curIdx = rolesInRange.findIndex(r => r.id === currentRole?.id);
  if (curIdx <= 0) return null;
  // ابحث عن أول رتبة أدنى غير مستثناة
  for (let i = curIdx - 1; i >= 0; i--) {
    if (!excluded.includes(rolesInRange[i].id)) return rolesInRange[i];
  }
  return null;
}

/** الرتب فوق العضو */
function getRolesAbove(member, guild, cfg) {
  const rolesInRange = getHierarchyRolesInRange(guild, cfg);
  const excluded = cfg.excludedRoles || [];
  const highestPos = member.roles.highest.position;
  return rolesInRange.filter(r => r.position > highestPos && !excluded.includes(r.id))
    .sort((a, b) => b.position - a.position);
}

/** الرتب تحت العضو */
function getRolesBelow(member, guild, cfg) {
  const rolesInRange = getHierarchyRolesInRange(guild, cfg);
  const excluded = cfg.excludedRoles || [];
  const highestPos = member.roles.highest.position;
  return rolesInRange.filter(r => r.position < highestPos && !excluded.includes(r.id))
    .sort((a, b) => b.position - a.position);
}

// ================== باني اللوحة الرئيسية (تستخدم للقناة وللأمر) ==================

function buildMainPanelEmbed(guild, cfg, stats) {
  return new EmbedBuilder()
    .setTitle('🛡️ لوحة نظام الإدارة')
    .setColor(0x3498DB)
    .setDescription('مرحباً بك في لوحة الإدارة. استخدم الأزرار أدناه للتفاعل.')
    .addFields(
      { name: '📊 إجمالي الإدارة', value: `${stats.total}`, inline: true },
      { name: '📈 أعلى رتبة', value: stats.highestRole || '—', inline: true },
      { name: '📉 أدنى رتبة', value: stats.lowestRole || '—', inline: true },
      { name: '🎖️ رتبة الإدارة المشتركة', value: cfg.sharedAdminRoleId ? `<@&${cfg.sharedAdminRoleId}>` : '❌', inline: false },
    )
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();
}

function buildMainPanelComponents(isHigh) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('adm_board_myprofile').setLabel('👤 عرض ملفي').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('adm_board_ladder').setLabel('🪜 سلم الرتب').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('adm_board_top').setLabel('🏆 توب الإدارة').setStyle(ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('adm_board_promote').setLabel('📈 ترقية').setStyle(ButtonStyle.Primary).setDisabled(!isHigh),
    new ButtonBuilder().setCustomId('adm_board_demote').setLabel('📉 تنزيل').setStyle(ButtonStyle.Primary).setDisabled(!isHigh),
    new ButtonBuilder().setCustomId('adm_board_remove').setLabel('🗑️ سحب').setStyle(ButtonStyle.Danger).setDisabled(!isHigh),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_stats_me').setLabel('📊 احصائياتي').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_stats_top').setLabel('🏆 توب نقاط').setStyle(ButtonStyle.Primary),
  );
  return [row1, row2, row3];
}

// ================== إرسال اللوحة إلى قناة ==================

async function sendBoardPanelToChannel(guild, channelId) {
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return { success: false, error: 'القناة غير موجودة' };
    const cfg = getAdminConfig();
    const admins = await getAdminMembers(guild, cfg);
    const rolesInRange = getHierarchyRolesInRange(guild, cfg);
    const allHighIds = getHighAdminRoleIds(cfg, guild);
    const highRoleObjs = allHighIds.map(id => guild.roles.cache.get(id)).filter(r => r);
    const allAdminRoles = [...highRoleObjs, ...rolesInRange].sort((a, b) => b.position - a.position);
    const stats = {
      total: admins.length,
      highestRole: allAdminRoles.length > 0 ? `${allAdminRoles[0]}` : '—',
      lowestRole: allAdminRoles.length > 0 ? `${allAdminRoles[allAdminRoles.length - 1]}` : '—',
    };
    const embed = buildMainPanelEmbed(guild, cfg, stats);
    const components = buildMainPanelComponents(true);
    await channel.send({ embeds: [embed], components });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ================== عرض الملف الشخصي (للأمر وزر [عرض ملفي]) ==================

async function showMyProfile(interaction) {
  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  const memberAdminRole = getHighestAdminRole(member, cfg, guild);
  const rank = await getAdminRank(member, cfg, guild);
  const allAbove = getRolesAbove(member, guild, cfg); // descending (أبعد أولاً)
  const allBelow = getRolesBelow(member, guild, cfg); // descending (أقرب أولاً)
  // أقرب رتبتين أعلى من العضو
  const rolesAbove = allAbove.slice(-2).reverse();
  // أقرب رتبتين أدنى من العضو
  const rolesBelow = allBelow.slice(0, 2);

  const embed = new EmbedBuilder()
    .setTitle(`👤 الملف الشخصي — ${member.user.tag}`)
    .setColor(memberAdminRole?.color || 0x3498DB)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '🎖️ رتبتك الإدارية', value: memberAdminRole ? `${memberAdminRole}` : '❌ لست ضمن الإدارة', inline: false },
      { name: '📊 ترتيبك', value: rank ? `${rank.rank} من ${rank.total}` : '—', inline: true },
      { name: '📈 الإجمالي', value: rank ? `${rank.total}` : '—', inline: true },
      { name: '⬆️ الرتبتين الأعلى (الأقرب)', value: rolesAbove.length > 0 ? rolesAbove.map(r => `${r}`).join('\n') : '—', inline: false },
      { name: '⬇️ الرتبتين الأدنى (الأقرب)', value: rolesBelow.length > 0 ? rolesBelow.map(r => `${r}`).join('\n') : '—', inline: false },
    )
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع للوحة').setStyle(ButtonStyle.Danger),
  );

  // الملف الشخصي يظهر بشكل خاص لكل مستخدم
  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// ================== العودة للملف من السلم (تحديث نفس الرسالة المخفية) ==================

async function showMyProfileUpdate(interaction) {
  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  const memberAdminRole = getHighestAdminRole(member, cfg, guild);
  const rank = await getAdminRank(member, cfg, guild);
  const allAbove = getRolesAbove(member, guild, cfg);
  const allBelow = getRolesBelow(member, guild, cfg);
  const rolesAbove = allAbove.slice(-2).reverse();
  const rolesBelow = allBelow.slice(0, 2);

  const embed = new EmbedBuilder()
    .setTitle(`👤 الملف الشخصي — ${member.user.tag}`)
    .setColor(memberAdminRole?.color || 0x3498DB)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '🎖️ رتبتك الإدارية', value: memberAdminRole ? `${memberAdminRole}` : '❌ لست ضمن الإدارة', inline: false },
      { name: '📊 ترتيبك', value: rank ? `${rank.rank} من ${rank.total}` : '—', inline: true },
      { name: '📈 الإجمالي', value: rank ? `${rank.total}` : '—', inline: true },
      { name: '⬆️ الرتبتين الأعلى (الأقرب)', value: rolesAbove.length > 0 ? rolesAbove.map(r => `${r}`).join('\n') : '—', inline: false },
      { name: '⬇️ الرتبتين الأدنى (الأقرب)', value: rolesBelow.length > 0 ? rolesBelow.map(r => `${r}`).join('\n') : '—', inline: false },
    )
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع للوحة').setStyle(ButtonStyle.Danger),
  );

  return respondOrUpdate(interaction, { embeds: [embed], components: [row] });
}

// ================== سلم الرتب (عرض كل الرتب مع موقع العضو) ==================

async function showRoleLadder(interaction) {
  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  // جميع رتب الإدارة العليا (من القائمة + النطاق، مرتبة تنازلياً)
  const allHighIds = getHighAdminRoleIds(cfg, guild);
  let highRoles = allHighIds
    .map(id => guild.roles.cache.get(id))
    .filter(r => r)
    .sort((a, b) => b.position - a.position);

  // جميع رتب التسلسل الهرمي (مرتبة تنازلياً)
  let hierarchyRoles = getHierarchyRolesInRange(guild, cfg).reverse();
  const excluded = cfg.excludedRoles || [];

  // الرتبة المشتركة (إن وجدت)
  const sharedRole = cfg.sharedAdminRoleId ? guild.roles.cache.get(cfg.sharedAdminRoleId) : null;

  // دالة: هل العضو يملك الرتبة؟
  const hasRole = (roleId) => member.roles.cache.has(roleId);

  // أعلى رتبة للعضو (نحتاجها للقسمين: العليا + الهرمي)
  const memberAdminRole = getHighestAdminRole(member, cfg, guild);

  const lines = [];

  // الإدارة العليا
  if (highRoles.length > 0) {
    lines.push('**👑 الإدارة العليا**');
    for (const role of highRoles) {
      let indicator;
      if (memberAdminRole && role.id === memberAdminRole.id) {
        indicator = '🔵'; // رتبة العضو الحالية
      } else if (hasRole(role.id)) {
        indicator = '🟢';
      } else {
        indicator = '⚪';
      }
      lines.push(`${indicator} ${role}`);
    }
    lines.push('');
  }

  // فاصل
  lines.push('━━━━━━━━━━━━━━━━━━');

  // التسلسل الهرمي
  lines.push('**📊 التسلسل الهرمي**');
  // memberAdminRole محدد أعلاه، يستخدم هنا أيضاً
  for (const role of hierarchyRoles) {
    if (excluded.includes(role.id)) continue;
    let indicator;
    if (memberAdminRole && role.id === memberAdminRole.id) {
      indicator = '🔵'; // رتبة العضو الحالية
    } else if (hasRole(role.id)) {
      indicator = '🟢'; // العضو يملكها
    } else {
      indicator = '⚪'; // لا يملكها
    }
    lines.push(`${indicator} ${role}`);
  }

  // الرتبة المشتركة
  if (sharedRole && !lines.some(l => l.includes(sharedRole.id))) {
    const indicator = hasRole(sharedRole.id) ? '🟢' : '⚪';
    lines.push(`🔄 ${indicator} ${sharedRole} *(مشتركة)*`);
  }

  // إذا السلم فارغ تماماً
  if (highRoles.length === 0 && hierarchyRoles.length === 0 && !sharedRole) {
    lines.push('⚠️ لم يتم إعداد أي رتب بعد.');
    lines.push('استخدم `/اعدادات_لوحة_الإدارة` لإعداد الرتب.');
  }

  const embed = new EmbedBuilder()
    .setTitle(`🪜 سلم الرتب — ${member.user.tag}`)
    .setColor(0x9B59B6)
    .setDescription(lines.join('\n'))
    .addFields(
      { name: '🔵', value: 'رتبتك الحالية', inline: true },
      { name: '🟢', value: 'رتب تمتلكها', inline: true },
      { name: '⚪', value: 'رتب لا تمتلكها', inline: true },
    )
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع للوحة').setStyle(ButtonStyle.Danger),
  );

  // سلم الرتب يظهر بشكل خاص لكل مستخدم
  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// ================== اللوحة الرئيسية (للأمر) ==================

async function handleBoardMain(interaction) {
  // للأزرار: تأكيد فوري قبل أي عملية طويلة (لمنع timeout)
  if (!interaction.isCommand()) {
    await interaction.deferUpdate().catch(() => {});
  }
  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;
  const isHigh = isHighAdmin(member, cfg);

  const admins = await getAdminMembers(guild, cfg);
  const rolesInRange = getHierarchyRolesInRange(guild, cfg);
  // دمج رتب الإدارة العليا لتحديد أعلى/أدنى رتبة
  const allHighIds = getHighAdminRoleIds(cfg, guild);
  const highRoleObjs = allHighIds.map(id => guild.roles.cache.get(id)).filter(r => r);
  const allAdminRoles = [...highRoleObjs, ...rolesInRange].sort((a, b) => b.position - a.position);
  const stats = {
    total: admins.length,
    highestRole: allAdminRoles.length > 0 ? `${allAdminRoles[0]}` : '—',
    lowestRole: allAdminRoles.length > 0 ? `${allAdminRoles[allAdminRoles.length - 1]}` : '—',
  };

  const embed = buildMainPanelEmbed(guild, cfg, stats);
  const components = buildMainPanelComponents(isHigh);

  // الأمر: لوحة عامة / الزر: رد على التأكيد الفوري
  if (interaction.isCommand()) {
    return interaction.reply({ embeds: [embed], components, ephemeral: false });
  }
  return interaction.editReply({ embeds: [embed], components });
}

// ================== ترقية / تنزيل / سحب — قائمة منسدلة مع pagination ==================

async function showMemberSelector(interaction, action) {
  // نأكد فوراً للزر (بدون تعديل اللوحة)، ثم نرسل كلشي كـ followUp مخفي
  await interaction.deferUpdate().catch(() => {});

  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  if (!isHighAdmin(member, cfg)) {
    return interaction.followUp({ content: '❌ ليس لديك صلاحية الإدارة العليا لاستخدام هذا الزر.', ephemeral: true }).catch(() => {});
  }

  // استبعد الإدارة العليا من نظام الترقية/التنزيل/السحب
  const highRoles = cfg.highAdminRoles || [];
  let admins = (await getAdminMembers(guild, cfg)).filter(m => m.id !== member.id);
  if (highRoles.length > 0) {
    admins = admins.filter(m => !highRoles.some(roleId => m.roles.cache.has(roleId)));
  }
  if (admins.length === 0) {
    return interaction.followUp({ content: '⚠️ لا يوجد أعضاء إدارة للاختيار منهم.', ephemeral: true }).catch(() => {});
  }

  const totalPages = Math.ceil(admins.length / 25);
  const state = {
    action, page: 0, totalPages,
    admins: admins.map(m => ({ id: m.id, tag: m.user.tag, displayName: m.displayName })),
    type: 'member_select'
  };
  setState(interaction.user.id, state);

  const firstPage = renderMemberPageContent(state);
  return interaction.followUp({ embeds: [firstPage.embed], components: firstPage.components, ephemeral: true });
}

function renderMemberPageContent(state) {
  const { action, page, totalPages, admins } = state;
  const start = page * 25;
  const end = Math.min(start + 25, admins.length);
  const pageAdmins = admins.slice(start, end);

  const actionNames = { promote: '📈 ترقية', demote: '📉 تنزيل', remove: '🗑️ سحب' };
  const actionLabel = actionNames[action] || action;

  const embed = new EmbedBuilder()
    .setTitle(`${actionLabel} — اختر عضواً`)
    .setColor(0x3498DB)
    .setDescription(`إجمالي الإدارة: ${admins.length} عضو\nالصفحة ${page + 1} من ${totalPages}`)
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const options = pageAdmins.map(a => ({
    label: a.displayName,
    description: a.tag,
    value: `adm_board_act_${action}_${a.id}`,
    emoji: action === 'promote' ? '📈' : action === 'demote' ? '📉' : '🗑️'
  }));

  const components = [];

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('adm_board_act_select')
      .setPlaceholder(`اختر عضواً لـ ${actionLabel}`)
      .addOptions(options)
  );
  components.push(selectRow);

  const navRow = new ActionRowBuilder();
  if (page > 0) {
    navRow.addComponents(new ButtonBuilder().setCustomId('adm_board_prev').setLabel('◀️ السابق').setStyle(ButtonStyle.Secondary));
  }
  if (page < totalPages - 1) {
    navRow.addComponents(new ButtonBuilder().setCustomId('adm_board_next').setLabel('التالي ▶️').setStyle(ButtonStyle.Secondary));
  }
  navRow.addComponents(new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Danger));
  components.push(navRow);

  return { embed, components };
}

async function renderMemberPage(interaction, state) {
  const content = renderMemberPageContent(state);
  return respondOrUpdate(interaction, { embeds: [content.embed], components: content.components });
}

// ================== تنفيذ الترقية / التنزيل / السحب ==================

async function executeAction(interaction, action, targetId) {
  // تأكيد فوري (السيليكت مينو على الرسالة المخفية)
  await interaction.deferUpdate().catch(() => {});

  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  if (!isHighAdmin(member, cfg)) {
    return interaction.followUp({ content: '❌ ليس لديك صلاحية.', ephemeral: true }).catch(() => {});
  }

  const targetMember = await guild.members.fetch(targetId).catch(() => null);
  if (!targetMember) {
    return interaction.followUp({ content: '⚠️ العضو غير موجود في السيرفر.', ephemeral: true }).catch(() => {});
  }

  const targetRole = getHighestAdminRole(targetMember, cfg, guild);
  if (!targetRole && action !== 'remove') {
    return interaction.followUp({ content: '⚠️ العضو لا يملك رتبة ضمن التسلسل الهرمي.', ephemeral: true }).catch(() => {});
  }

  const excludedRoles = cfg.excludedRoles || [];
  let resultMsg = '';
  const logEntries = [];
  let oldRoleName = '';
  let newRoleName = '';
  let channelId = '';

  try {
    if (action === 'promote') {
      const nextRole = getNextHigherRole(targetRole, guild, cfg);
      if (!nextRole) {
        return interaction.followUp({ content: `⚠️ العضو في أعلى رتبة بالفعل (${targetRole}).`, ephemeral: true }).catch(() => {});
      }
      await targetMember.roles.add(nextRole.id);
      oldRoleName = `${targetRole}`;
      newRoleName = `${nextRole}`;
      resultMsg = `✅ تمت ترقية ${targetMember} من ${oldRoleName} إلى ${newRoleName}`;
      channelId = cfg.promotionChannelId || '';
      logEntries.push(
        { name: 'الإجراء', value: '📈 ترقية', inline: true },
        { name: 'من', value: oldRoleName, inline: true },
        { name: 'إلى', value: newRoleName, inline: true },
      );
    } else if (action === 'demote') {
      const prevRole = getNextLowerRole(targetRole, guild, cfg);
      if (!prevRole) {
        return interaction.followUp({ content: `⚠️ العضو في أدنى رتبة بالفعل (${targetRole}).`, ephemeral: true }).catch(() => {});
      }
      const sharedRoleId = cfg.sharedAdminRoleId;
      if (sharedRoleId && targetRole.id !== sharedRoleId) {
        await targetMember.roles.remove(targetRole.id).catch(() => {});
      }
      await targetMember.roles.add(prevRole.id);
      oldRoleName = `${targetRole}`;
      newRoleName = `${prevRole}`;
      resultMsg = `✅ تم تنزيل ${targetMember} من ${oldRoleName} إلى ${newRoleName}`;
      channelId = cfg.demotionChannelId || '';
      logEntries.push(
        { name: 'الإجراء', value: '📉 تنزيل', inline: true },
        { name: 'من', value: oldRoleName, inline: true },
        { name: 'إلى', value: newRoleName, inline: true },
      );
    } else if (action === 'remove') {
      const rolesToRemove = [];
      if (cfg.sharedAdminRoleId && targetMember.roles.cache.has(cfg.sharedAdminRoleId)) {
        rolesToRemove.push(cfg.sharedAdminRoleId);
      }
      const rolesInRange = getHierarchyRolesInRange(guild, cfg);
      for (const role of rolesInRange) {
        if (targetMember.roles.cache.has(role.id) && !excludedRoles.includes(role.id)) {
          if (!rolesToRemove.includes(role.id)) rolesToRemove.push(role.id);
        }
      }
      if (rolesToRemove.length === 0) {
        return interaction.followUp({ content: '⚠️ العضو لا يملك أي رتب إدارة قابلة للسحب.', ephemeral: true }).catch(() => {});
      }
      for (const roleId of rolesToRemove) {
        await targetMember.roles.remove(roleId).catch(() => {});
      }
      resultMsg = `✅ تم سحب ${rolesToRemove.length} رتبة إدارية من ${targetMember}`;
      channelId = cfg.demotionChannelId || '';
      logEntries.push(
        { name: 'الإجراء', value: '🗑️ سحب', inline: true },
        { name: 'الرتب المُزالة', value: `${rolesToRemove.length} رتبة`, inline: true },
      );
    }

    clearState(interaction.user.id);

    // إرسال إشعار إلى روم الترقية/التنزيل
    if (channelId) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel) {
        const actionLabels = {
          promote: { title: '📈 ترقية', color: 0x2ECC71, desc: `نبارك للإداري ${targetMember} على ترقيته\nمن **${oldRoleName}**\nإلى **${newRoleName}**\nنتمنى أن يكون عند حسن الظن دائمًا.` },
          demote: { title: '📉 تنزيل', color: 0xF1C40F, desc: `تم تنزيل الإداري ${targetMember}\nمن **${oldRoleName}**\nإلى **${newRoleName}**` },
          remove: { title: '🗑️ سحب رتب', color: 0xE74C3C, desc: `تم سحب الرتب الإدارية من ${targetMember} بنجاح.` },
        };
        const al = actionLabels[action];
        const channelEmbed = new EmbedBuilder()
          .setTitle(al.title)
          .setColor(al.color)
          .setDescription(al.desc)
          .addFields(
            { name: 'نفذ بواسطة', value: `${member}`, inline: true },
            { name: '🕐 الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          )
          .setTimestamp();
        // منشن العضو + رتبة الإدارة المشتركة خارج الإيمبد
        const mentionParts = [`${targetMember}`];
        if (cfg.sharedAdminRoleId) mentionParts.push(`<@&${cfg.sharedAdminRoleId}>`);
        await channel.send({ content: mentionParts.join(' '), embeds: [channelEmbed] }).catch(() => {});
      }
    }

    const resultEmbed = new EmbedBuilder()
      .setTitle(resultMsg)
      .setColor(action === 'promote' ? 0x2ECC71 : action === 'demote' ? 0xF1C40F : 0xE74C3C)
      .addFields(
        { name: 'العضو', value: `${targetMember} (${targetMember.user.tag})`, inline: false },
        { name: 'نفذ بواسطة', value: `${member} (${member.user.tag})`, inline: false },
        ...logEntries,
        { name: '🕐 الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
      )
      .setTimestamp();

    return interaction.followUp({
      embeds: [resultEmbed],
      ephemeral: true
    }).catch(() => {});
  } catch (e) {
    console.error(`❌ executeAction ${action}:`, e.message);
    return interaction.followUp({ content: `⚠️ فشل التنفيذ: ${e.message}`, ephemeral: true }).catch(() => {});
  }
}

// ================== توب الإدارة ==================

async function showTopAdmins(interaction) {
  // تأكيد فوري للزر قبل العملية الطويلة
  await interaction.deferUpdate().catch(() => {});

  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  const admins = await getAdminMembers(guild, cfg);
  if (admins.length === 0) {
    return interaction.followUp({ content: '⚠️ لا يوجد أعضاء إدارة.', ephemeral: true }).catch(() => {});
  }

  // صاحب السيرفر دائماً الأول مهما كانت رتبته
  admins.sort((a, b) => {
    if (a.id === guild.ownerId) return -1;
    if (b.id === guild.ownerId) return 1;
    return b.roles.highest.position - a.roles.highest.position;
  });

  const totalPages = Math.ceil(admins.length / 10);
  const state = {
    type: 'top', page: 0, totalPages,
    admins: admins.map(m => ({
      id: m.id, tag: m.user.tag, displayName: m.displayName,
      highestRole: getHighestAdminRole(m, cfg, guild)
    })),
    userId: member.id
  };
  setState(interaction.user.id, state);

  // إرسال التوب بشكل مخفي (خاص) لكل مستخدم
  const embed = buildTopEmbed(state);
  const navRow = buildTopNavRow(state);
  return interaction.followUp({ embeds: [embed], components: [navRow], ephemeral: true }).catch(() => {});
}

function buildTopEmbed(state) {
  const { page, totalPages, admins, userId } = state;
  const start = page * 10;
  const end = Math.min(start + 10, admins.length);
  const pageAdmins = admins.slice(start, end);

  const userOnPage = pageAdmins.find(a => a.id === userId);
  const userInList = admins.find(a => a.id === userId);
  const userRank = userInList ? admins.indexOf(userInList) + 1 : null;

  const lines = pageAdmins.map((a, i) => {
    const rank = start + i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    const roleName = a.highestRole ? `${a.highestRole}` : '';
    return `${medal} <@${a.id}> — ${roleName}`;
  });

  let description = lines.join('\n\n');

  if (!userOnPage && userInList) {
    description += `\n\n━━━━━━━━━━━━━━━━━━\n📌 **ترتيبك:** #${userRank} من ${admins.length}\n👤 <@${userInList.id}> — ${userInList.highestRole || ''}`;
  }

  return new EmbedBuilder()
    .setTitle('🏆 توب الإدارة')
    .setColor(0xF1C40F)
    .setDescription(description)
    .setFooter({ text: `الصفحة ${page + 1} من ${totalPages} | الإصدار: ${version}` })
    .setTimestamp();
}

function buildTopNavRow(state) {
  const { page, totalPages } = state;
  const navRow = new ActionRowBuilder();
  if (page > 0) {
    navRow.addComponents(new ButtonBuilder().setCustomId('adm_top_prev').setLabel('◀️ السابق').setStyle(ButtonStyle.Primary));
  }
  if (page < totalPages - 1) {
    navRow.addComponents(new ButtonBuilder().setCustomId('adm_top_next').setLabel('التالي ▶️').setStyle(ButtonStyle.Primary));
  }
  navRow.addComponents(new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Danger));
  return navRow;
}

async function renderTopPage(interaction, state) {
  const embed = buildTopEmbed(state);
  const navRow = buildTopNavRow(state);
  return respondOrUpdate(interaction, { embeds: [embed], components: [navRow] });
}

// ================== الموزع الرئيسي ==================

async function handleBoardInteraction(interaction) {
  const id = interaction.customId;
  const parts = id.split('_');
  const prefix = parts[0];
  const second = parts[1];

  // أزرار اللوحة الرئيسية
  if (id === 'adm_board_main') return handleBoardMain(interaction);
  if (id === 'adm_board_refresh') return handleBoardMain(interaction);
  if (id === 'adm_board_myprofile') return showMyProfile(interaction);
  if (id === 'adm_board_back_profile') return showMyProfileUpdate(interaction);
  if (id === 'adm_board_ladder') return showRoleLadder(interaction);

  if (id === 'adm_board_promote') return showMemberSelector(interaction, 'promote');
  if (id === 'adm_board_demote') return showMemberSelector(interaction, 'demote');
  if (id === 'adm_board_remove') return showMemberSelector(interaction, 'remove');
  if (id === 'adm_board_top') return showTopAdmins(interaction);

  // إحصائيات التكتات (من لوحة الإدارة)
  if (id === 'ticket_stats_me') return handleMyStats(interaction);
  if (id === 'ticket_stats_top') return handleTopStats(interaction);
  if (id === 'ticket_stats_top_prev') return handleTopNav(interaction, 'prev');
  if (id === 'ticket_stats_top_next') return handleTopNav(interaction, 'next');
  if (id === 'ticket_stats_pick') return handlePickPerson(interaction);

  // Pagination - نمرر getState بعد الأزرار الرئيسية عشان نضمن state محدث
  const state = getState(interaction.user.id);

  if (id === 'adm_board_prev' || id === 'adm_board_next') {
    if (!state || state.type !== 'member_select') {
      try { await interaction.deferUpdate().catch(() => {}); } catch {}
      return handleBoardMain(interaction);
    }
    if (id === 'adm_board_prev') {
      state.page = Math.max(0, state.page - 1);
    } else {
      state.page = Math.min(state.totalPages - 1, state.page + 1);
    }
    setState(interaction.user.id, state);
    return renderMemberPage(interaction, state);
  }

  if (id === 'adm_top_prev' || id === 'adm_top_next') {
    if (!state || state.type !== 'top') {
      try { await interaction.deferUpdate().catch(() => {}); } catch {}
      return handleBoardMain(interaction);
    }
    if (id === 'adm_top_prev') {
      state.page = Math.max(0, state.page - 1);
    } else {
      state.page = Math.min(state.totalPages - 1, state.page + 1);
    }
    setState(interaction.user.id, state);
    return renderTopPage(interaction, state);
  }

  // اختيار عضو من القائمة المنسدلة
  if (id === 'adm_board_act_select') {
    const val = interaction.values[0];
    const valParts = val.split('_');
    const act = valParts[3];
    const targetId = valParts.slice(4).join('_');
    try { await interaction.deferUpdate().catch(() => {}); } catch {}
    return executeAction(interaction, act, targetId);
  }

  // إذا وصلنا هنا، الأمر غير معروف
  try { await interaction.deferUpdate().catch(() => {}); } catch {}
  return handleBoardMain(interaction);
}

module.exports = {
  handleBoardMain,
  handleBoardInteraction,
  sendBoardPanelToChannel,
  buildMainPanelEmbed,
  buildMainPanelComponents,
  isHighAdmin,
  getAdminMembers,
  getHighestAdminRole,
  getHierarchyRolesInRange
};

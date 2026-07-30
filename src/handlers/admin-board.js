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
  if (interaction.deferred) return interaction.editReply(payload);
  if (interaction.isCommand()) return interaction.reply({ ...payload, ephemeral: true });
  if (!interaction.replied && !interaction.deferred) {
    try { return await interaction.update(payload); } catch {
      await interaction.deferUpdate().catch(() => {});
      return interaction.editReply(payload);
    }
  }
  return interaction.editReply(payload);
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
  // نجلب كل الأعضاء أولاً لحل مشكلة الكاش الناقص
  try { await guild.members.fetch(); } catch {}
  const excludedRoles = cfg.excludedRoles || [];
  const hierarchyRoles = getHierarchyRolesInRange(guild, cfg);
  const hierarchyRoleIds = hierarchyRoles.map(r => r.id);

  return guild.members.cache.filter(m => {
    if (m.user.bot) return false;

    // هل عنده رتبة الإدارة المشتركة؟
    if (cfg.sharedAdminRoleId && m.roles.cache.has(cfg.sharedAdminRoleId)) {
      // تأكد أن له على الأقل رتبة واحدة ضمن النطاق غير مستثناة
      const hasNonExcluded = m.roles.cache.some(rId => hierarchyRoleIds.includes(rId) && !excludedRoles.includes(rId));
      if (hasNonExcluded) return true;
      // إذا ما عنده رتبة بالنطاق أصلاً، اعتبره إدارة (فقط الرتبة المشتركة)
      return true;
    }

    // هل عنده رتب ضمن النطاق الهرمي؟
    const memberHierarchyRoles = m.roles.cache.filter(rId => hierarchyRoleIds.includes(rId));
    if (memberHierarchyRoles.size === 0) return false;

    // تجاهل إذا كل رتبه ضمن النطاق هي رتب مستثناة
    const nonExcluded = memberHierarchyRoles.filter(rId => !excludedRoles.includes(rId));
    return nonExcluded.size > 0;
  }).sort((a, b) => b.roles.highest.position - a.roles.highest.position).map(m => m);
}

/** جلب كل الرتب ضمن التسلسل الهرمي */
function getHierarchyRolesInRange(guild, cfg) {
  if (!cfg.hierarchyRangeStartId || !cfg.hierarchyRangeEndId || !guild) return [];
  const roleA = guild.roles.cache.get(cfg.hierarchyRangeStartId);
  const roleB = guild.roles.cache.get(cfg.hierarchyRangeEndId);
  if (!roleA || !roleB) return [];
  const minPos = Math.min(roleA.position, roleB.position);
  const maxPos = Math.max(roleA.position, roleB.position);
  return guild.roles.cache.filter(r => r.position >= minPos && r.position <= maxPos && r.id !== guild.id)
    .sort((a, b) => a.position - b.position).map(r => r);
}

/** الحصول على أعلى رتبة للعضو ضمن التسلسل الهرمي (غير مستثناة) */
function getHighestAdminRole(member, cfg, guild) {
  const rolesInRange = getHierarchyRolesInRange(guild, cfg);
  const excluded = cfg.excludedRoles || [];
  const memberRoles = member.roles.cache;
  // ابحث عن أعلى رتبة يملكها العضو ضمن النطاق وغير مستثناة
  const validRoles = rolesInRange.filter(r => memberRoles.has(r.id) && !excluded.includes(r.id));
  if (validRoles.length === 0) {
    // إذا ما لقي، استخدم الرتبة المشتركة كبديل
    if (cfg.sharedAdminRoleId && memberRoles.has(cfg.sharedAdminRoleId)) {
      return guild.roles.cache.get(cfg.sharedAdminRoleId) || null;
    }
    return null;
  }
  return validRoles[validRoles.length - 1]; // آخر رتبة = أعلى position
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
    new ButtonBuilder().setCustomId('adm_board_top').setLabel('🏆 توب الإدارة').setStyle(ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('adm_board_promote').setLabel('📈 ترقية').setStyle(ButtonStyle.Primary).setDisabled(!isHigh),
    new ButtonBuilder().setCustomId('adm_board_demote').setLabel('📉 تنزيل').setStyle(ButtonStyle.Primary).setDisabled(!isHigh),
    new ButtonBuilder().setCustomId('adm_board_remove').setLabel('🗑️ سحب').setStyle(ButtonStyle.Danger).setDisabled(!isHigh),
  );
  return [row1, row2];
}

// ================== إرسال اللوحة إلى قناة ==================

async function sendBoardPanelToChannel(guild, channelId) {
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return { success: false, error: 'القناة غير موجودة' };
    const cfg = getAdminConfig();
    const admins = await getAdminMembers(guild, cfg);
    const rolesInRange = getHierarchyRolesInRange(guild, cfg);
    const stats = {
      total: admins.length,
      highestRole: rolesInRange.length > 0 ? `${rolesInRange[rolesInRange.length - 1]}` : '—',
      lowestRole: rolesInRange.length > 0 ? `${rolesInRange[0]}` : '—',
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
  const rolesAbove = getRolesAbove(member, guild, cfg);
  const rolesBelow = getRolesBelow(member, guild, cfg);

  const embed = new EmbedBuilder()
    .setTitle(`👤 الملف الشخصي — ${member.user.tag}`)
    .setColor(memberAdminRole?.color || 0x3498DB)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '🎖️ رتبتك الإدارية', value: memberAdminRole ? `${memberAdminRole}` : '❌ لست ضمن الإدارة', inline: false },
      { name: '📊 ترتيبك', value: rank ? `${rank.rank} من ${rank.total}` : '—', inline: true },
      { name: '📈 الإجمالي', value: rank ? `${rank.total}` : '—', inline: true },
      { name: '📤 الرتب الأعلى منك', value: rolesAbove.length > 0 ? rolesAbove.map(r => `${r}`).join('\n') : 'لا يوجد', inline: false },
      { name: '📥 الرتب الأدنى منك', value: rolesBelow.length > 0 ? rolesBelow.map(r => `${r}`).join('\n') : 'لا يوجد', inline: false },
    )
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ================== اللوحة الرئيسية (للأمر) ==================

async function handleBoardMain(interaction) {
  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;
  const isHigh = isHighAdmin(member, cfg);

  const admins = await getAdminMembers(guild, cfg);
  const rolesInRange = getHierarchyRolesInRange(guild, cfg);
  const stats = {
    total: admins.length,
    highestRole: rolesInRange.length > 0 ? `${rolesInRange[rolesInRange.length - 1]}` : '—',
    lowestRole: rolesInRange.length > 0 ? `${rolesInRange[0]}` : '—',
  };

  const embed = buildMainPanelEmbed(guild, cfg, stats);
  const components = buildMainPanelComponents(isHigh);

  return interaction.reply({ embeds: [embed], components, ephemeral: true });
}

// ================== ترقية / تنزيل / سحب — قائمة منسدلة مع pagination ==================

async function showMemberSelector(interaction, action) {
  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  if (!isHighAdmin(member, cfg)) {
    return respondOrUpdate(interaction, { content: '❌ ليس لديك صلاحية الإدارة العليا لاستخدام هذا الزر.', components: [] });
  }

  const admins = (await getAdminMembers(guild, cfg)).filter(m => m.id !== member.id);
  if (admins.length === 0) {
    return respondOrUpdate(interaction, { content: '⚠️ لا يوجد أعضاء إدارة للاختيار منهم.', components: [] });
  }

  const totalPages = Math.ceil(admins.length / 25);
  const state = {
    action, page: 0, totalPages,
    admins: admins.map(m => ({ id: m.id, tag: m.user.tag, displayName: m.displayName })),
    type: 'member_select'
  };
  setState(interaction.user.id, state);
  return renderMemberPage(interaction, state);
}

async function renderMemberPage(interaction, state) {
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

  return respondOrUpdate(interaction, { embeds: [embed], components });
}

// ================== تنفيذ الترقية / التنزيل / السحب ==================

async function executeAction(interaction, action, targetId) {
  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  if (!isHighAdmin(member, cfg)) {
    return respondOrUpdate(interaction, { content: '❌ ليس لديك صلاحية.', components: [] });
  }

  const targetMember = await guild.members.fetch(targetId).catch(() => null);
  if (!targetMember) {
    return respondOrUpdate(interaction, { content: '⚠️ العضو غير موجود في السيرفر.', components: [] });
  }

  const targetRole = getHighestAdminRole(targetMember, cfg, guild);
  if (!targetRole && action !== 'remove') {
    return respondOrUpdate(interaction, { content: '⚠️ العضو لا يملك رتبة ضمن التسلسل الهرمي.', components: [] });
  }

  const excludedRoles = cfg.excludedRoles || [];
  let resultMsg = '';
  const logEntries = [];

  try {
    if (action === 'promote') {
      const nextRole = getNextHigherRole(targetRole, guild, cfg);
      if (!nextRole) {
        return respondOrUpdate(interaction, { content: `⚠️ العضو في أعلى رتبة بالفعل (${targetRole}).`, components: [] });
      }
      const sharedRoleId = cfg.sharedAdminRoleId;
      if (sharedRoleId && targetRole.id !== sharedRoleId) {
        await targetMember.roles.remove(targetRole.id).catch(() => {});
      }
      await targetMember.roles.add(nextRole.id);
      resultMsg = `✅ تمت ترقية ${targetMember} من ${targetRole} إلى ${nextRole}`;
      logEntries.push(
        { name: 'الإجراء', value: '📈 ترقية', inline: true },
        { name: 'من', value: `${targetRole}`, inline: true },
        { name: 'إلى', value: `${nextRole}`, inline: true },
      );
    } else if (action === 'demote') {
      const prevRole = getNextLowerRole(targetRole, guild, cfg);
      if (!prevRole) {
        return respondOrUpdate(interaction, { content: `⚠️ العضو في أدنى رتبة بالفعل (${targetRole}).`, components: [] });
      }
      const sharedRoleId = cfg.sharedAdminRoleId;
      if (sharedRoleId && targetRole.id !== sharedRoleId) {
        await targetMember.roles.remove(targetRole.id).catch(() => {});
      }
      await targetMember.roles.add(prevRole.id);
      resultMsg = `✅ تم تنزيل ${targetMember} من ${targetRole} إلى ${prevRole}`;
      logEntries.push(
        { name: 'الإجراء', value: '📉 تنزيل', inline: true },
        { name: 'من', value: `${targetRole}`, inline: true },
        { name: 'إلى', value: `${prevRole}`, inline: true },
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
        return respondOrUpdate(interaction, { content: '⚠️ العضو لا يملك أي رتب إدارة قابلة للسحب.', components: [] });
      }
      for (const roleId of rolesToRemove) {
        await targetMember.roles.remove(roleId).catch(() => {});
      }
      resultMsg = `✅ تم سحب ${rolesToRemove.length} رتبة إدارية من ${targetMember}`;
      logEntries.push(
        { name: 'الإجراء', value: '🗑️ سحب', inline: true },
        { name: 'الرتب المُزالة', value: `${rolesToRemove.length} رتبة`, inline: true },
      );
    }

    clearState(interaction.user.id);

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

    return respondOrUpdate(interaction, {
      embeds: [resultEmbed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع للوحة').setStyle(ButtonStyle.Secondary)
      )]
    });
  } catch (e) {
    console.error(`❌ executeAction ${action}:`, e.message);
    return respondOrUpdate(interaction, { content: `⚠️ فشل التنفيذ: ${e.message}`, components: [] });
  }
}

// ================== توب الإدارة ==================

async function showTopAdmins(interaction) {
  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  const admins = await getAdminMembers(guild, cfg);
  if (admins.length === 0) {
    return respondOrUpdate(interaction, { content: '⚠️ لا يوجد أعضاء إدارة.', components: [] });
  }

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
  return renderTopPage(interaction, state);
}

async function renderTopPage(interaction, state) {
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
    return `${medal} **${a.displayName}** — ${roleName}\n└ ${a.tag}`;
  });

  let description = lines.join('\n\n');

  if (!userOnPage && userInList) {
    description += `\n\n━━━━━━━━━━━━━━━━━━\n📌 **ترتيبك:** #${userRank} من ${admins.length}\n👤 ${userInList.displayName} — ${userInList.highestRole || ''}`;
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆 توب الإدارة')
    .setColor(0xF1C40F)
    .setDescription(description)
    .setFooter({ text: `الصفحة ${page + 1} من ${totalPages} | الإصدار: ${version}` })
    .setTimestamp();

  const navRow = new ActionRowBuilder();
  if (page > 0) {
    navRow.addComponents(new ButtonBuilder().setCustomId('adm_top_prev').setLabel('◀️ السابق').setStyle(ButtonStyle.Primary));
  }
  if (page < totalPages - 1) {
    navRow.addComponents(new ButtonBuilder().setCustomId('adm_top_next').setLabel('التالي ▶️').setStyle(ButtonStyle.Primary));
  }
  navRow.addComponents(new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Danger));

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

  if (id === 'adm_board_promote') return showMemberSelector(interaction, 'promote');
  if (id === 'adm_board_demote') return showMemberSelector(interaction, 'demote');
  if (id === 'adm_board_remove') return showMemberSelector(interaction, 'remove');
  if (id === 'adm_board_top') return showTopAdmins(interaction);

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
  getAdminMembers
};

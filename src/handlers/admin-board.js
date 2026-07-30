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
const { getConfig } = require('../utils/storage');
const { sendLog } = require('../utils/helpers');

// ---------- حالة pagination لكل مستخدم ----------
const paginationState = new Map(); // userId → { page, totalPages, type, members[] }

function getState(userId) {
  return paginationState.get(userId) || null;
}

function setState(userId, state) {
  paginationState.set(userId, state);
  setTimeout(() => paginationState.delete(userId), 5 * 60 * 1000); // auto-clear after 5 min
}

function clearState(userId) {
  paginationState.delete(userId);
}

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

/** هل المستخدم عنده رتبة إدارة مشتركة أو ضمن التسلسل الهرمي؟ */
function isSharedAdmin(member, cfg, guild) {
  if (cfg.sharedAdminRoleId && member.roles.cache.has(cfg.sharedAdminRoleId)) return true;
  // Check hierarchy range
  if (cfg.hierarchyRangeStartId && cfg.hierarchyRangeEndId && guild) {
    const roleA = guild.roles.cache.get(cfg.hierarchyRangeStartId);
    const roleB = guild.roles.cache.get(cfg.hierarchyRangeEndId);
    if (roleA && roleB) {
      const minPos = Math.min(roleA.position, roleB.position);
      const maxPos = Math.max(roleA.position, roleB.position);
      return member.roles.cache.some(r => r.position >= minPos && r.position <= maxPos && r.id !== guild.id);
    }
  }
  return false;
}

/** جلب جميع أعضاء الإدارة (ذوي رتبة الإدارة المشتركة أو ضمن التسلسل) مرتبة حسب أعلى رتبة */
function getAdminMembers(guild, cfg) {
  if (!guild) return [];
  const members = guild.members.cache.filter(m => !m.user.bot && isSharedAdmin(m, cfg, guild));
  // Sort by highest role position descending
  return members.sort((a, b) => {
    const aPos = a.roles.highest.position;
    const bPos = b.roles.highest.position;
    return bPos - aPos;
  }).map(m => m);
}

/** الحصول على أعلى رتبة للعضو ضمن التسلسل الهرمي */
function getHighestAdminRole(member, cfg, guild) {
  if (!cfg.hierarchyRangeStartId || !cfg.hierarchyRangeEndId || !guild) return null;
  const roleA = guild.roles.cache.get(cfg.hierarchyRangeStartId);
  const roleB = guild.roles.cache.get(cfg.hierarchyRangeEndId);
  if (!roleA || !roleB) return null;
  const minPos = Math.min(roleA.position, roleB.position);
  const maxPos = Math.max(roleA.position, roleB.position);
  const adminRoles = member.roles.cache.filter(r => r.position >= minPos && r.position <= maxPos && r.id !== guild.id);
  if (adminRoles.size === 0) return null;
  return adminRoles.sort((a, b) => b.position - a.position).first();
}

/** ترتيب العضو بين الإدارة */
function getAdminRank(member, cfg, guild) {
  const admins = getAdminMembers(guild, cfg);
  const idx = admins.findIndex(m => m.id === member.id);
  if (idx === -1) return null;
  return { rank: idx + 1, total: admins.length };
}

/** رفع أعلى رتبة موجودة ضمن النطاق */
function getNextHigherRole(currentRole, guild, cfg) {
  if (!cfg.hierarchyRangeStartId || !cfg.hierarchyRangeEndId || !guild) return null;
  const rangeStart = guild.roles.cache.get(cfg.hierarchyRangeStartId);
  const rangeEnd = guild.roles.cache.get(cfg.hierarchyRangeEndId);
  if (!rangeStart || !rangeEnd) return null;
  const minPos = Math.min(rangeStart.position, rangeEnd.position);
  const maxPos = Math.max(rangeStart.position, rangeEnd.position);
  // Get all roles in range sorted ascending
  const rolesInRange = guild.roles.cache
    .filter(r => r.position >= minPos && r.position <= maxPos && r.id !== guild.id)
    .sort((a, b) => a.position - b.position);
  const rolesArray = [...rolesInRange.values()];
  const curIdx = rolesArray.findIndex(r => r.id === currentRole?.id);
  if (curIdx === -1 || curIdx >= rolesArray.length - 1) return null;
  return rolesArray[curIdx + 1];
}

/** أدنى رتبة موجودة ضمن النطاق */
function getNextLowerRole(currentRole, guild, cfg) {
  if (!cfg.hierarchyRangeStartId || !cfg.hierarchyRangeEndId || !guild) return null;
  const rangeStart = guild.roles.cache.get(cfg.hierarchyRangeStartId);
  const rangeEnd = guild.roles.cache.get(cfg.hierarchyRangeEndId);
  if (!rangeStart || !rangeEnd) return null;
  const minPos = Math.min(rangeStart.position, rangeEnd.position);
  const maxPos = Math.max(rangeStart.position, rangeEnd.position);
  const rolesInRange = guild.roles.cache
    .filter(r => r.position >= minPos && r.position <= maxPos && r.id !== guild.id)
    .sort((a, b) => a.position - b.position);
  const rolesArray = [...rolesInRange.values()];
  const curIdx = rolesArray.findIndex(r => r.id === currentRole?.id);
  if (curIdx <= 0) return null;
  return rolesArray[curIdx - 1];
}

/** الرتب فوق العضو (أعلى منه) */
function getRolesAbove(member, guild, cfg) {
  if (!cfg.hierarchyRangeStartId || !cfg.hierarchyRangeEndId || !guild) return [];
  const rangeStart = guild.roles.cache.get(cfg.hierarchyRangeStartId);
  const rangeEnd = guild.roles.cache.get(cfg.hierarchyRangeEndId);
  if (!rangeStart || !rangeEnd) return [];
  const minPos = Math.min(rangeStart.position, rangeEnd.position);
  const maxPos = Math.max(rangeStart.position, rangeEnd.position);
  const highestMemberRole = member.roles.highest.position;
  return guild.roles.cache
    .filter(r => r.position > highestMemberRole && r.position >= minPos && r.position <= maxPos && r.id !== guild.id)
    .sort((a, b) => b.position - a.position);
}

/** الرتب تحت العضو (أقل منه) */
function getRolesBelow(member, guild, cfg) {
  if (!cfg.hierarchyRangeStartId || !cfg.hierarchyRangeEndId || !guild) return [];
  const rangeStart = guild.roles.cache.get(cfg.hierarchyRangeStartId);
  const rangeEnd = guild.roles.cache.get(cfg.hierarchyRangeEndId);
  if (!rangeStart || !rangeEnd) return [];
  const minPos = Math.min(rangeStart.position, rangeEnd.position);
  const maxPos = Math.max(rangeStart.position, rangeEnd.position);
  const highestMemberRole = member.roles.highest.position;
  return guild.roles.cache
    .filter(r => r.position < highestMemberRole && r.position >= minPos && r.position <= maxPos && r.id !== guild.id)
    .sort((a, b) => b.position - a.position);
}

// ================== اللوحة الرئيسية ==================

async function handleBoardMain(interaction) {
  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  const memberAdminRole = getHighestAdminRole(member, cfg, guild);
  const rank = getAdminRank(member, cfg, guild);
  const rolesAbove = getRolesAbove(member, guild, cfg);
  const rolesBelow = getRolesBelow(member, guild, cfg);
  const admins = getAdminMembers(guild, cfg);

  const isHigh = isHighAdmin(member, cfg);

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ لوحة الإدارة — ${member.user.tag}`)
    .setColor(memberAdminRole?.color || 0x3498DB)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '🎖️ رتبتك الإدارية', value: memberAdminRole ? `${memberAdminRole}` : '❌ لست ضمن الإدارة', inline: false },
      { name: '📊 ترتيبك', value: rank ? `${rank.rank} من ${rank.total}` : '—', inline: true },
      { name: '📈 إجمالي الإدارة', value: `${admins.length}`, inline: true },
      { name: '📤 الرتب الأعلى منك', value: rolesAbove.length > 0 ? rolesAbove.map(r => `${r}`).join('\n') : 'لا يوجد', inline: false },
      { name: '📥 الرتب الأدنى منك', value: rolesBelow.length > 0 ? rolesBelow.map(r => `${r}`).join('\n') : 'لا يوجد', inline: false },
    )
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const row1 = new ActionRowBuilder();
  row1.addComponents(
    new ButtonBuilder().setCustomId('adm_board_promote').setLabel('📈 ترقية').setStyle(ButtonStyle.Success).setDisabled(!isHigh),
    new ButtonBuilder().setCustomId('adm_board_demote').setLabel('📉 تنزيل').setStyle(ButtonStyle.Primary).setDisabled(!isHigh),
    new ButtonBuilder().setCustomId('adm_board_remove').setLabel('🗑️ سحب').setStyle(ButtonStyle.Danger).setDisabled(!isHigh),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('adm_board_top').setLabel('🏆 توب الإدارة').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('adm_board_refresh').setLabel('🔄 تحديث').setStyle(ButtonStyle.Secondary),
  );

  return interaction.reply({
    embeds: [embed],
    components: [row1, row2],
    ephemeral: true
  });
}

// ================== ترقية / تنزيل / سحب — قائمة منسدلة مع pagination ==================

async function showMemberSelector(interaction, action) {
  const cfg = getAdminConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  if (!isHighAdmin(member, cfg)) {
    return respondOrUpdate(interaction, { content: '❌ ليس لديك صلاحية الإدارة العليا لاستخدام هذا الزر.', components: [] });
  }

  const admins = getAdminMembers(guild, cfg).filter(m => m.id !== member.id);
  if (admins.length === 0) {
    return respondOrUpdate(interaction, { content: '⚠️ لا يوجد أعضاء إدارة للاختيار منهم.', components: [] });
  }

  const totalPages = Math.ceil(admins.length / 25);
  const state = { action, page: 0, totalPages, admins: admins.map(m => ({ id: m.id, tag: m.user.tag, displayName: m.displayName })), type: 'member_select' };
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

  // القائمة المنسدلة
  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('adm_board_act_select')
      .setPlaceholder(`اختر عضواً لـ ${actionLabel}`)
      .addOptions(options)
  );
  components.push(selectRow);

  // أزرار التنقل + رجوع
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

  let resultMsg = '';
  const logEntries = [];
  const excludedRoles = cfg.excludedRoles || [];

  try {
    if (action === 'promote') {
      const nextRole = getNextHigherRole(targetRole, guild, cfg);
      if (!nextRole) {
        return respondOrUpdate(interaction, { content: `⚠️ العضو في أعلى رتبة بالفعل (${targetRole}).`, components: [] });
      }
      if (excludedRoles.includes(nextRole.id)) {
        return respondOrUpdate(interaction, { content: `⚠️ لا يمكن الترقية إلى ${nextRole} لأنها رتبة مستثناة.`, components: [] });
      }

      // إزالة الرتبة الحالية + إضافة الرتبة الجديدة (إذا كانت مختلفة)
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
      if (excludedRoles.includes(prevRole.id)) {
        return respondOrUpdate(interaction, { content: `⚠️ لا يمكن التنزيل إلى ${prevRole} لأنها رتبة مستثناة.`, components: [] });
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
      const sharedAdminRoleId = cfg.sharedAdminRoleId;
      const rolesToRemove = [];

      if (sharedAdminRoleId && targetMember.roles.cache.has(sharedAdminRoleId)) {
        rolesToRemove.push(sharedAdminRoleId);
      }

      // أضف كل الرتب ضمن النطاق الهرمي
      if (cfg.hierarchyRangeStartId && cfg.hierarchyRangeEndId) {
        const roleA = guild.roles.cache.get(cfg.hierarchyRangeStartId);
        const roleB = guild.roles.cache.get(cfg.hierarchyRangeEndId);
        if (roleA && roleB) {
          const minPos = Math.min(roleA.position, roleB.position);
          const maxPos = Math.max(roleA.position, roleB.position);
          guild.roles.cache.forEach(r => {
            if (r.position >= minPos && r.position <= maxPos && r.id !== guild.id && targetMember.roles.cache.has(r.id)) {
              if (!rolesToRemove.includes(r.id)) rolesToRemove.push(r.id);
            }
          });
        }
      }

      // استثناء الرتب المستثناة
      const finalRoles = rolesToRemove.filter(id => !excludedRoles.includes(id));

      if (finalRoles.length === 0) {
        return respondOrUpdate(interaction, { content: '⚠️ العضو لا يملك أي رتب إدارة قابلة للسحب.', components: [] });
      }

      for (const roleId of finalRoles) {
        await targetMember.roles.remove(roleId).catch(() => {});
      }
      resultMsg = `✅ تم سحب ${finalRoles.length} رتبة إدارية من ${targetMember}`;
      logEntries.push(
        { name: 'الإجراء', value: '🗑️ سحب', inline: true },
        { name: 'الرتب المُزالة', value: `${finalRoles.length} رتبة`, inline: true },
      );
    }

    clearState(interaction.user.id);

    // رد بنجاح
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

  const admins = getAdminMembers(guild, cfg);
  if (admins.length === 0) {
    return respondOrUpdate(interaction, { content: '⚠️ لا يوجد أعضاء إدارة.', components: [] });
  }

  const totalPages = Math.ceil(admins.length / 10);
  const state = { type: 'top', page: 0, totalPages, admins: admins.map(m => ({ id: m.id, tag: m.user.tag, displayName: m.displayName, highestRole: getHighestAdminRole(m, cfg, guild) })), userId: member.id };
  setState(interaction.user.id, state);

  return renderTopPage(interaction, state);
}

async function renderTopPage(interaction, state) {
  const { page, totalPages, admins, userId } = state;
  const start = page * 10;
  const end = Math.min(start + 10, admins.length);
  const pageAdmins = admins.slice(start, end);

  // البحث عن العضو الطالب في هذه الصفحة
  const userOnPage = pageAdmins.find(a => a.id === userId);
  const userInList = admins.find(a => a.id === userId);
  const userRank = userInList ? admins.indexOf(userInList) + 1 : null;

  // بناء الوصف
  const lines = pageAdmins.map((a, i) => {
    const rank = start + i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    const roleName = a.highestRole ? `${a.highestRole}` : '';
    return `${medal} **${a.displayName}** — ${roleName}\n└ ${a.tag}`;
  });

  let description = lines.join('\n\n');

  // إذا كان العضو الطالب ليس في هذه الصفحة، أضف فاصل + ترتيبه
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
  const third = parts[2];

  // أزرار اللوحة الرئيسية
  if (id === 'adm_board_main') return handleBoardMain(interaction);
  if (id === 'adm_board_refresh') return handleBoardMain(interaction);

  if (id === 'adm_board_promote') return showMemberSelector(interaction, 'promote');
  if (id === 'adm_board_demote') return showMemberSelector(interaction, 'demote');
  if (id === 'adm_board_remove') return showMemberSelector(interaction, 'remove');
  if (id === 'adm_board_top') return showTopAdmins(interaction);

  // Pagination للأعضاء
  const state = getState(interaction.user.id);
  if (id === 'adm_board_prev' && state) {
    state.page = Math.max(0, state.page - 1);
    setState(interaction.user.id, state);
    return renderMemberPage(interaction, state);
  }
  if (id === 'adm_board_next' && state) {
    state.page = Math.min(state.totalPages - 1, state.page + 1);
    setState(interaction.user.id, state);
    return renderMemberPage(interaction, state);
  }

  // Pagination للتوب
  const topState = getState(interaction.user.id);
  if (id === 'adm_top_prev' && topState && topState.type === 'top') {
    topState.page = Math.max(0, topState.page - 1);
    setState(interaction.user.id, topState);
    return renderTopPage(interaction, topState);
  }
  if (id === 'adm_top_next' && topState && topState.type === 'top') {
    topState.page = Math.min(topState.totalPages - 1, topState.page + 1);
    setState(interaction.user.id, topState);
    return renderTopPage(interaction, topState);
  }

  // اختيار عضو من القائمة المنسدلة
  if (id === 'adm_board_act_select') {
    const val = interaction.values[0];
    // val = adm_board_act_{action}_{userId}
    const valParts = val.split('_');
    const act = valParts[3]; // promote, demote, remove
    const targetId = valParts.slice(4).join('_');
    try { await interaction.deferUpdate().catch(() => {}); } catch {}
    return executeAction(interaction, act, targetId);
  }

  return respondOrUpdate(interaction, { content: `⚠️ أمر غير معروف: ${id}` });
}

module.exports = {
  handleBoardMain,
  handleBoardInteraction
};

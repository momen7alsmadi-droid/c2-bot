/**
 * =========================================================
 *  handlers/ticketStatsBuilder.js
 * =========================================================
 * واجهة إحصائيات التكتات (أزرار من لوحة الإدارة /لوحة_الادارة):
 *   - 📊 احصائياتي: تكتات مستلمة، تكتات مغلقة كآخر مستلم، رسائل في كل
 *     التكتات، عدد/معدل نجوم التقييم، معدل الرسائل لكل تكت، معدل
 *     الاستلام، وتفصيل النقاط (رسائل + تكتات مغلقة + تقييمات)
 *   - 🏆 توب نقاط: ترتيب الأعلى نقاطاً مع صفحات (10 لكل صفحة)، منشن
 *     الشخص + رتبته + نقاطه داخل الإيمبد، وزر اختيار شخص لعرض كل إحصائياته
 *   - 📊 إحصائيات عامة: كل الإدارة (رتبة الإدارة المشتركة) كشخص واحد،
 *     مع الأرقام القياسية (أسرع/أبطأ استلام وإغلاق...) باسم صاحبها
 *
 * الأزرار: ticket_stats_me | ticket_stats_top | ticket_stats_top_prev
 *          ticket_stats_top_next | ticket_stats_pick | ticket_stats_user_select
 *          ticket_stats_detail | ticket_stats_detail:<userId>
 *          ticket_stats_team | ticket_stats_team_detail
 * =========================================================
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js');
const { version } = require('../../package.json');
const { reportError } = require('../../src/utils/errorLogger');
const { getUserStats, getAllStats, getTotalClaims, getDetailedStats, getTeamAggregate, getLevelInfo, MESSAGES_PER_POINT, LOGIN_POINTS_PER_DAY } = require('../database/ticketStatsStore');
const { getAdminConfig } = require('../../src/utils/adminStorage');
const { getAllSessions } = require('./ticketStore');
const { ackComponent, deliverComponent } = require('../utils/interactionSafe');

const COLORS = { main: 0x5865F2, gold: 0xF1C40F, green: 0x2ECC71 };
const PER_PAGE = 10;

// ---------- حالة الـ pagination لكل مستخدم (تنتهي بعد 5 دقائق) ----------
const topState = new Map();

function getState(userId) { return topState.get(userId) || null; }

function setState(userId, state) {
    topState.set(userId, state);
    setTimeout(() => topState.delete(userId), 5 * 60 * 1000);
}

/** تحديث رسالة تفاعل (زر/قائمة) — نفس نمط respondOrUpdate المعتمد */
async function respondOrUpdate(interaction, payload) {
    if (interaction.deferred) return interaction.editReply(payload);
    try {
        await interaction.deferUpdate();
        return interaction.editReply(payload);
    } catch {
        return interaction.editReply(payload).catch(() => {});
    }
}

/** أعلى رتبة للعضو (بدون @everyone) */
function getRoleName(member) {
    if (!member) return '—';
    const role = member.roles.cache.filter(r => r.id !== member.guild.id).sort((a, b) => b.position - a.position).first();
    return role ? `${role}` : '—';
}

/** تنسيق مدة الاستلام (متوسط سرعة الاستلام) */
function formatClaimSpeed(ms) {
    if (!ms || ms <= 0) return '—';
    if (ms < 60000) {
        const s = Math.round(ms / 1000);
        return `${s} ثانية`;
    }
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return s > 0 ? `${m} دقيقة و ${s} ثانية` : `${m} دقيقة`;
}

/** حقل تفصيل النقاط */
function buildPointsBreakdownField(stats) {
    const { messagePoints, closePoints, ratingPoints, loginPoints } = stats.points;
    return [
        `📅 تسجيل دخول يومي (${LOGIN_POINTS_PER_DAY} نقاط لكل يوم تكتب فيه بالشات): **+${loginPoints}**`,
        `💬 رسائل (كل ${MESSAGES_PER_POINT} رسالة داخل التكتات = نقطة): **+${messagePoints}**`,
        `📥 تكتات مغلقة (نقطة لكل تكت كآخر مستلم): **+${closePoints}**`,
        `⭐ تقييمات (5★=1.5 | 4★=1 | 3★=0.75 | 2★=0.5 | 1★=0.25): **+${ratingPoints}**`,
    ].join('\n');
}

/** شريط تقدم من 10 خانات لمسار المستوى */
function buildProgressBar(ratio) {
    const filled = Math.max(0, Math.min(10, Math.round(ratio * 10)));
    return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

/** إيمبد إحصائيات كاملة لعضو (تُستخدم لـ"احصائياتي" ولعرض إحصائيات شخص) */
function buildUserStatsEmbed(targetUser, guild, options = {}) {
    const stats = getUserStats(targetUser.id);
    const totalClaims = getTotalClaims();
    const claimRate = totalClaims > 0 ? Math.round((stats.ticketsClaimed / totalClaims) * 100) : 0;
    const member = guild?.members.cache.get(targetUser.id) || null;
    const levelInfo = getLevelInfo(stats.points.total);
    const progressBar = buildProgressBar(levelInfo.inLevel / levelInfo.nextLevelAt);
    const levelText =
        `**المستوى ${levelInfo.level}**\n` +
        `🎯 ${progressBar} \`${levelInfo.inLevel}/${levelInfo.nextLevelAt}\` نقطة للمستوى ${levelInfo.level + 1}`;

    const embed = new EmbedBuilder()
        .setColor(options.color || COLORS.main)
        .setTitle(`📊 ${options.title || 'إحصائيات التكتات'} — ${targetUser.tag}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            { name: '🎖️ رتبته', value: member ? getRoleName(member) : '—', inline: false },
            { name: '🏆 النقاط الإجمالية', value: `**${stats.points.total} نقطة**`, inline: false },
            { name: '📊 المستوى', value: levelText, inline: false },
            { name: '🧮 تفاصيل النقاط', value: buildPointsBreakdownField(stats), inline: false },
            { name: '🎫 تكتات استلمها', value: `${stats.ticketsClaimed}`, inline: true },
            { name: '📥 تكتات مغلقة (كآخر مستلم)', value: `${stats.ticketsClosed}`, inline: true },
            { name: '💬 رسائله في كل التكتات', value: `${stats.messagesSent}`, inline: true },
            { name: '📅 أيام تسجيل الدخول', value: `${stats.loginDays}`, inline: true },
            { name: '📊 معدل الرسائل لكل تكت', value: `${stats.messagesPerTicket.toFixed(2)}`, inline: true },
            { name: '⚡ سرعة الاستلام (متوسط)', value: formatClaimSpeed(stats.avgClaimTimeMs), inline: true },
            { name: '⭐ مجموع التقيمات (بالنجوم)', value: stats.ratingCount > 0 ? `**${stats.ratingSum}** نجمة (من ${stats.ratingCount} تقييم)` : 'لا توجد تقييمات بعد', inline: true },
            { name: '🌟 متوسط التقييم لكل تكت', value: stats.ratingCount > 0 ? `**${stats.avgRating.toFixed(2)}** / 5` : 'لا توجد تقييمات بعد', inline: true },
            { name: '🎯 معدل الاستلام', value: `${claimRate}% من إجمالي **${totalClaims}** استلام بالسيرفر`, inline: true },
        )
        .setFooter({ text: `الإصدار: ${version}` })
        .setTimestamp();

    return { embed, stats, claimRate, totalClaims };
}

// ================== 📊 احصائياتي ==================
async function handleMyStats(interaction) {
    await ackComponent(interaction);
    const { embed } = buildUserStatsEmbed(interaction.user, interaction.guild, {
        title: 'احصائياتي',
        color: COLORS.main,
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_stats_detail').setLabel('📊 إحصائياتي المفصلة').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_stats_top').setLabel('🏆 توب نقاط').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع للوحة').setStyle(ButtonStyle.Secondary),
    );

    return deliverComponent(interaction, { embeds: [embed], components: [row], ephemeral: true });
}

// ================== 🏆 توب نقاط ==================
async function handleTopStats(interaction) {
    await ackComponent(interaction);
    const ranked = getAllStats();
    if (ranked.length === 0) {
        return deliverComponent(interaction, {
            content: '📊 لا توجد إحصائيات بعد — ابدأ بفتح التكتات والرد على الأعضاء!',
            ephemeral: true,
        });
    }
    const totalPages = Math.ceil(ranked.length / PER_PAGE);
    const state = { type: 'stats_top', page: 0, totalPages, ranked, userId: interaction.member.id };
    setState(interaction.member.id, state);

    const embed = buildTopEmbed(state, interaction.guild);
    const row = buildTopNavRow(state);
    return deliverComponent(interaction, { embeds: [embed], components: row, ephemeral: true });
}

function buildTopEmbed(state, guild) {
    const { page, totalPages, ranked, userId } = state;
    const start = page * PER_PAGE;
    const pageRanked = ranked.slice(start, start + PER_PAGE);

    const lines = pageRanked.map((entry, i) => {
        const rank = start + i + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
        const member = guild?.members.cache.get(entry.id);
        const roleName = member ? getRoleName(member) : '—';
        return `${medal} <@${entry.id}> — ${roleName}\n   🏆 **${entry.points} نقطة** | 🎫 ${entry.stats.ticketsClaimed} تكتات | 💬 ${entry.stats.messagesSent} رسالة | ⭐ ${entry.stats.ratingCount} تقييم | ⚡ ${formatClaimSpeed(entry.stats.avgClaimTimeMs)}`;
    });

    let description = lines.join('\n\n');

    // ترتيب المستخدم نفسه إن لم يكن ضمن هذه الصفحة
    const userRank = ranked.findIndex(r => r.id === userId) + 1;
    if (userRank > 0 && !pageRanked.some(r => r.id === userId)) {
        const userEntry = ranked[userRank - 1];
        description += `\n\n━━━━━━━━━━━━━━━━━━\n📌 **ترتيبك:** #${userRank} من ${ranked.length} — <@${userId}> — **${userEntry.points} نقطة**`;
    }

    return new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle('🏆 توب نقاط التكتات')
        .setDescription(description)
        .setFooter({ text: `الصفحة ${page + 1} من ${totalPages} | الإصدار: ${version}` })
        .setTimestamp();
}

function buildTopNavRow(state) {
    const { page, totalPages } = state;
    const navRow = new ActionRowBuilder();
    if (page > 0) navRow.addComponents(new ButtonBuilder().setCustomId('ticket_stats_top_prev').setLabel('◀️ السابق').setStyle(ButtonStyle.Secondary));
    if (page < totalPages - 1) navRow.addComponents(new ButtonBuilder().setCustomId('ticket_stats_top_next').setLabel('التالي ▶️').setStyle(ButtonStyle.Secondary));
    navRow.addComponents(new ButtonBuilder().setCustomId('ticket_stats_pick').setLabel('🔍 اختيار شخص').setStyle(ButtonStyle.Primary));
    navRow.addComponents(new ButtonBuilder().setCustomId('ticket_stats_me').setLabel('📊 احصائياتي').setStyle(ButtonStyle.Success));
    navRow.addComponents(new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع للوحة').setStyle(ButtonStyle.Secondary));
    return [navRow];
}

/** التنقل بين صفحات التوب */
async function handleTopNav(interaction, direction) {
    let state = getState(interaction.member.id);
    if (!state || state.type !== 'stats_top') {
        // انتهت الجلسة → نبني صفحة جديدة من البيانات الحالية
        await interaction.deferUpdate().catch(() => {});
        return handleTopStats(interaction);
    }
    state.page = direction === 'prev' ? Math.max(0, state.page - 1) : Math.min(state.totalPages - 1, state.page + 1);
    setState(interaction.member.id, state);
    const embed = buildTopEmbed(state, interaction.guild);
    const row = buildTopNavRow(state);
    return respondOrUpdate(interaction, { embeds: [embed], components: row });
}

// ================== 🔍 اختيار شخص ==================
async function handlePickPerson(interaction) {
    await ackComponent(interaction);
    const select = new UserSelectMenuBuilder()
        .setCustomId('ticket_stats_user_select')
        .setPlaceholder('اختر شخصاً لعرض إحصائياته...');

    const row = new ActionRowBuilder().addComponents(select);
    return deliverComponent(interaction, {
        content: '🔍 اختر شخصاً لعرض كل إحصائياته:',
        components: [row],
        ephemeral: true,
    });
}

/** عرض إحصائيات الشخص المختار من القائمة */
async function handleStatsUserSelect(interaction) {
    const selected = interaction.users.first();
    if (!selected) {
        await interaction.update({ content: '⚠️ لم يتم اختيار أي شخص.', components: [] });
        return;
    }
    const { embed } = buildUserStatsEmbed(selected, interaction.guild, {
        title: 'إحصائيات',
        color: COLORS.green,
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_stats_detail:${selected.id}`).setLabel('📊 إحصائيات مفصلة').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_stats_top').setLabel('🏆 توب نقاط').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_stats_me').setLabel('📊 احصائياتي').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع للوحة').setStyle(ButtonStyle.Secondary),
    );

    return interaction.update({ embeds: [embed], components: [row] });
}

// ================== 📊 إحصائيات مفصلة (مخفية للإداري فقط) ==================

/** تنسيق مدة (لأطول/متوسط المدد) */
const fmtDur = ms => (ms ? formatClaimSpeed(ms) : '—');

/** آخر تواجد بتكت — بصيغة نسبية */
const fmtLast = ms => (ms ? `<t:${Math.floor(ms / 1000)}:R>` : '—');

function buildDetailedStatsEmbed(targetUser, guild, detail) {
    return new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle(`📊 إحصائيات مفصلة — ${targetUser.tag}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(
            `${guild ? getRoleName(guild.members.cache.get(targetUser.id)) : '—'}\n` +
            `🎫 إجمالي التكتات المستلمة: **${detail.ticketsClaimed}** | 💬 رسائله: **${detail.messagesSent}**`
        )
        .addFields(
            // 🏆 النقاط (نفس قيمة التوب حتى لا يظهر التوب نقاطاً والإحصائيات لا)
            { name: '🏆 النقاط الإجمالية', value: `**${detail.points.total} نقطة**\n${buildPointsBreakdownField(detail)}`, inline: false },
            // 🎫 حالة التكتات
            { name: '🎫 تكتات قيد المعالجة', value: `**${detail.inProgress}**`, inline: true },
            { name: '🔀 حوّلها لغيره', value: `**${detail.transferredAway}**`, inline: true },
            { name: '📥 استلمها من غيره', value: `**${detail.receivedFromOthers}**`, inline: true },
            { name: '🗑️ حذفها نهائياً', value: `**${detail.ticketsDeleted}**`, inline: true },
            // ⏱️ المدد والأداء
            { name: '🚀 أسرع استلام', value: `**${fmtDur(detail.fastestClaimMs)}**`, inline: true },
            { name: '🏃‍♂️ أسرع إغلاق', value: `**${fmtDur(detail.fastestCloseMs)}**`, inline: true },
            { name: '⏳ متوسط مدة التكت', value: `**${fmtDur(detail.avgTicketDurationMs)}**`, inline: true },
            { name: '🕰️ أطول جلسة في تكت', value: `**${fmtDur(detail.longestSessionMs)}**`, inline: true },
            { name: '📜 أطول تكت بعدد رسائلي', value: `**${detail.maxMessagesInTicket} رسالة**`, inline: true },
            { name: '🕐 آخر تواجد بتكت', value: `**${fmtLast(detail.lastActivityAt)}**`, inline: true },
            // 💬 النشاط
            { name: '📅 رسائله خلال اليوم', value: `**${detail.messagesToday}**`, inline: true },
            { name: '📅 أيام تسجيل الدخول', value: `**${detail.loginDays}**`, inline: true },
            { name: '📢 عدد المنشنات (@)', value: `**${detail.mentionsCount}**`, inline: true },
            { name: '📎 عدد المرفقات', value: `**${detail.attachmentsCount}**`, inline: true },
            { name: '👥 رسائل أعضاء رد عليها', value: `**${detail.repliedToMembers}**`, inline: true },
            // ⭐ التقييمات
            { name: '🌟 تقييمات 5 نجوم', value: `**${detail.fiveStarRatings}**`, inline: true },
            { name: '💔 التقييمات السلبية (1-2★)', value: `**${detail.negativeRatings}**`, inline: true },
            { name: '⭐ مجموع التقيمات (بالنجوم)', value: `**${detail.ratingSum}** (من ${detail.ratingCount} تقييم)`, inline: true },
            { name: '🌟 متوسط التقييم لكل تكت', value: detail.avgRating > 0 ? `**${detail.avgRating.toFixed(2)}** / 5` : '—', inline: true },
            // 🏆 الخبرة والمركز
            { name: '🧬 نقاط الخبرة (XP)', value: `**${detail.xp}**`, inline: true },
            { name: '📊 المستوى', value: `**${detail.level}**`, inline: true },
            { name: '🏆 المركز بالسيرفر', value: `**#${detail.xpRank || '—'}** من ${detail.xpTotal || '—'}`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
        )
        .setFooter({ text: `الإصدار: ${version}` })
        .setTimestamp();
}

/** عرض الإحصائيات المفصلة — رسالة مخفية (Ephemeral) للإداري فقط */
async function handleDetailStats(interaction) {
    await ackComponent(interaction);
    const targetId = (interaction.customId || '').split(':')[1] || interaction.member.id;
    const member = interaction.guild?.members.cache.get(targetId);
    const targetUser = member?.user || (await interaction.client.users.fetch(targetId).catch(() => null));
    if (!targetUser) {
        return deliverComponent(interaction, {
            content: '⚠️ لم يتم العثور على هذا العضو.',
            ephemeral: true,
        });
    }

    const detail = getDetailedStats(targetId, getAllSessions());
    const embed = buildDetailedStatsEmbed(targetUser, interaction.guild, detail);

    // 🔙 زر رجوع: مفصلة شخص مختار → ملفه، مفصلة نفسي → احصائياتي
    const backId = targetId === interaction.member.id ? 'ticket_stats_me' : `ticket_stats_detail_back:${targetId}`;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(backId).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary),
    );
    return deliverComponent(interaction, { embeds: [embed], components: [row], ephemeral: true });
}

/** رجوع من مفصلة شخص مختار → إعادة عرض ملفه (نفس عرض اختيار الشخص) */
async function handleDetailStatsBack(interaction) {
    const targetId = (interaction.customId || '').split(':')[1];
    const member = interaction.guild?.members.cache.get(targetId);
    const targetUser = member?.user || (await interaction.client.users.fetch(targetId).catch(() => null));
    if (!targetUser) {
        return interaction.update({ content: '⚠️ لم يتم العثور على هذا العضو.', components: [] }).catch(() => {});
    }
    const { embed } = buildUserStatsEmbed(targetUser, interaction.guild, {
        title: 'إحصائيات',
        color: COLORS.green,
    });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_stats_detail:${targetId}`).setLabel('📊 إحصائيات مفصلة').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_stats_top').setLabel('🏆 توب نقاط').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_stats_me').setLabel('📊 احصائياتي').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع للوحة').setStyle(ButtonStyle.Secondary),
    );
    return interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
}

// ================== 📊 إحصائيات عامة (الإدارة كلها كشخص واحد) ==================

/** آيديات الإدارة: من يملك رتبة الإدارة المشتركة (أو صلاحية Administrator كبديل) */
async function getTeamAdminIds(guild) {
    if (!guild) return [];
    // نجلب الأعضاء والرولات أولاً حتى لا يكون عدد الإدارة ناقصاً
    // بسبب كاش غير مكتمل (كان يظهر 0 أو عدد خاطئ)
    try { await guild.members.fetch(); } catch (e) { console.error('❌ getTeamAdminIds fetch members:', e.message); reportError('TICKET_STATS', 'fetch-members', e); }
    try { await guild.roles.fetch(); } catch (e) { console.error('❌ getTeamAdminIds fetch roles:', e.message); reportError('TICKET_STATS', 'fetch-roles', e); }
    const cfg = getAdminConfig();
    const roleId = cfg.sharedAdminRoleId;
    if (roleId && guild.roles.cache.has(roleId)) {
        return guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(roleId)).map(m => m.id);
    }
    // بديل: إن لم تُحدَّد الرتبة المشتركة، نجمع من يملك صلاحية المدير
    return guild.members.cache.filter(m => !m.user.bot && m.permissions.has('Administrator')).map(m => m.id);
}

/** تنسيق رقم قياسي: القيمة + من سجّلها (مثال: 3 دقائق — <@id>) */
const fmtRecord = rec => (rec ? `${formatClaimSpeed(rec.value)} — <@${rec.id}>` : '—');

/** إيمبد الملخص العام للإدارة */
async function buildTeamStatsEmbed(guild) {
    const adminIds = await getTeamAdminIds(guild);
    const agg = getTeamAggregate(adminIds, getAllSessions());
    const levelInfo = getLevelInfo(agg.points.total);
    const bar = buildProgressBar(levelInfo.inLevel / levelInfo.nextLevelAt);
    const totalClaims = getTotalClaims();
    const claimRate = totalClaims > 0 ? Math.round((agg.ticketsClaimed / totalClaims) * 100) : 0;
    const cfg = getAdminConfig();
    const roleSource = (cfg.sharedAdminRoleId && guild.roles.cache.has(cfg.sharedAdminRoleId)) ? 'رتبة الإدارة المشتركة' : 'صلاحية Administrator';

    return new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle('📊 إحصائيات عامة — الإدارة')
        .setDescription(`👥 عدد أفراد الإدارة (${roleSource}): **${agg.members}**`)
        .addFields(
            { name: '🏆 النقاط الإجمالية (كل الإدارة)', value: `**${agg.points.total} نقطة**`, inline: false },
            { name: '📊 المستوى', value: `**المستوى ${levelInfo.level}**\n🎯 ${bar} \`${levelInfo.inLevel}/${levelInfo.nextLevelAt}\` نقطة للمستوى ${levelInfo.level + 1}`, inline: false },
            { name: '🧮 تفاصيل النقاط', value: [
                `📅 تسجيل دخول يومي: **+${agg.points.loginPoints}**`,
                `💬 رسائل (كل ${MESSAGES_PER_POINT} = نقطة): **+${agg.points.messagePoints}**`,
                `📥 تكتات مغلقة: **+${agg.points.closePoints}**`,
                `⭐ تقييمات: **+${agg.points.ratingPoints}**`,
            ].join('\n'), inline: false },
            { name: '🎫 تكتات استلموها', value: `${agg.ticketsClaimed}`, inline: true },
            { name: '📥 مغلقة (آخر مستلم)', value: `${agg.ticketsClosed}`, inline: true },
            { name: '💬 رسائلهم', value: `${agg.messagesSent}`, inline: true },
            { name: '📅 أيام تسجيل الدخول', value: `${agg.loginDays}`, inline: true },
            { name: '⭐ مجموع التقيمات (بالنجوم)', value: agg.ratingCount > 0 ? `**${agg.ratingSum}** (من ${agg.ratingCount} تقييم)` : 'لا توجد', inline: true },
            { name: '🌟 متوسط التقييم لكل تكت', value: agg.ratingCount > 0 ? `**${agg.avgRating.toFixed(2)}** / 5` : 'لا توجد', inline: true },
            { name: '⚡ متوسط سرعة الاستلام', value: formatClaimSpeed(agg.avgClaimTimeMs), inline: true },
            { name: '🎯 معدل الاستلام', value: `${claimRate}% من ${totalClaims}`, inline: true },
            { name: '🕐 آخر تواجد', value: agg.lastActivityAt ? `<t:${Math.floor(agg.lastActivityAt / 1000)}:R>` : '—', inline: true },
            // 🏅 الأرقام القياسية (الرقم + من سجّله)
            { name: '🚀 أسرع استلام', value: fmtRecord(agg.records.fastestClaim), inline: true },
            { name: '🐢 أبطأ استلام', value: fmtRecord(agg.records.slowestClaim), inline: true },
            { name: '🏃‍♂️ أسرع إغلاق', value: fmtRecord(agg.records.fastestClose), inline: true },
            { name: '🐌 أبطأ إغلاق', value: fmtRecord(agg.records.slowestClose), inline: true },
            { name: '🕰️ أطول جلسة', value: fmtRecord(agg.records.longestSession), inline: true },
            { name: '📜 أطول تكت رسائلي', value: agg.records.maxMessagesInTicket ? `${agg.records.maxMessagesInTicket.value} رسالة — <@${agg.records.maxMessagesInTicket.id}>` : '—', inline: true },
            { name: '💬 الأكثر رسائل', value: agg.records.mostMessages ? `${agg.records.mostMessages.value} — <@${agg.records.mostMessages.id}>` : '—', inline: true },
            { name: '🎫 الأكثر تكتات', value: agg.records.mostTickets ? `${agg.records.mostTickets.value} — <@${agg.records.mostTickets.id}>` : '—', inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
        )
        .setFooter({ text: `الإصدار: ${version}` })
        .setTimestamp();
}

/** إيمبد مفصّل عام (نفس صيغة الإحصائيات المفصلة لكن لكل الإدارة) */
async function buildTeamDetailEmbed(guild) {
    const agg = getTeamAggregate(await getTeamAdminIds(guild), getAllSessions());
    return new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle('📊 إحصائيات مفصلة عامة — الإدارة')
        .setDescription(`👥 عدد أفراد الإدارة: **${agg.members}** | 🎫 تكتات استلموها: **${agg.ticketsClaimed}** | 💬 رسائلهم: **${agg.messagesSent}**`)
        .addFields(
            { name: '🎫 تكتات قيد المعالجة', value: `**${agg.inProgress}**`, inline: true },
            { name: '🔀 حوّلوها لغيره', value: `**${agg.transferredAway}**`, inline: true },
            { name: '📥 استلموها من غيره', value: `**${agg.receivedFromOthers}**`, inline: true },
            { name: '🗑️ حذفوها نهائياً', value: `**${agg.ticketsDeleted}**`, inline: true },
            { name: '🚀 أسرع استلام', value: fmtRecord(agg.records.fastestClaim), inline: true },
            { name: '🐢 أبطأ استلام', value: fmtRecord(agg.records.slowestClaim), inline: true },
            { name: '🏃‍♂️ أسرع إغلاق', value: fmtRecord(agg.records.fastestClose), inline: true },
            { name: '🐌 أبطأ إغلاق', value: fmtRecord(agg.records.slowestClose), inline: true },
            { name: '⏳ متوسط مدة التكت', value: formatClaimSpeed(agg.avgTicketDurationMs), inline: true },
            { name: '🕰️ أطول جلسة', value: fmtRecord(agg.records.longestSession), inline: true },
            { name: '📜 أطول تكت رسائلي', value: agg.records.maxMessagesInTicket ? `${agg.records.maxMessagesInTicket.value} رسالة — <@${agg.records.maxMessagesInTicket.id}>` : '—', inline: true },
            { name: '🕐 آخر تواجد', value: agg.lastActivityAt ? `<t:${Math.floor(agg.lastActivityAt / 1000)}:R>` : '—', inline: true },
            { name: '📅 رسائلهم خلال اليوم', value: `**${agg.messagesToday}**`, inline: true },
            { name: '📅 أيام تسجيل الدخول', value: `**${agg.loginDays}**`, inline: true },
            { name: '📢 المنشنات (@)', value: `**${agg.mentionsCount}**`, inline: true },
            { name: '📎 المرفقات', value: `**${agg.attachmentsCount}**`, inline: true },
            { name: '👥 ردود على أعضاء', value: `**${agg.repliedToMembers}**`, inline: true },
            { name: '🌟 تقييمات 5 نجوم', value: `**${agg.fiveStarRatings}**`, inline: true },
            { name: '💔 التقييمات السلبية', value: `**${agg.negativeRatings}**`, inline: true },
            { name: '⭐ مجموع التقيمات (بالنجوم)', value: `**${agg.ratingSum}** (من ${agg.ratingCount} تقييم)`, inline: true },
            { name: '🌟 متوسط التقييم لكل تكت', value: agg.avgRating > 0 ? `**${agg.avgRating.toFixed(2)}** / 5` : '—', inline: true },
            { name: '🧬 نقاط الخبرة (XP)', value: `**${agg.xp}**`, inline: true },
            { name: '📊 المستوى', value: `**${agg.level}**`, inline: true },
            { name: '🏆 النقاط', value: `**${agg.points.total} نقطة**`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
        )
        .setFooter({ text: `الإصدار: ${version}` })
        .setTimestamp();
}

/** عرض الملخص العام (زر من لوحة الإدارة) */
async function handleTeamStats(interaction) {
    await ackComponent(interaction);
    if (!interaction.guild) return;
    const embed = await buildTeamStatsEmbed(interaction.guild);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_stats_team_detail').setLabel('📊 مفصلة عامة').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_stats_top').setLabel('🏆 توب نقاط').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_stats_me').setLabel('📊 احصائياتي').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع للوحة').setStyle(ButtonStyle.Secondary),
    );
    return deliverComponent(interaction, { embeds: [embed], components: [row], ephemeral: true });
}

/** عرض المفصلة العامة */
async function handleTeamDetail(interaction) {
    await ackComponent(interaction);
    if (!interaction.guild) return;
    const embed = await buildTeamDetailEmbed(interaction.guild);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_stats_team').setLabel('🔙 رجوع للملخص').setStyle(ButtonStyle.Secondary),
    );
    return deliverComponent(interaction, { embeds: [embed], components: [row], ephemeral: true });
}

module.exports = {
    handleMyStats,
    handleTopStats,
    handleTopNav,
    handlePickPerson,
    handleStatsUserSelect,
    handleDetailStats,
    handleDetailStatsBack,
    handleTeamStats,
    handleTeamDetail,
    formatClaimSpeed,
    getTeamAdminIds,
};

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
 *
 * الأزرار: ticket_stats_me | ticket_stats_top | ticket_stats_top_prev
 *          ticket_stats_top_next | ticket_stats_pick | ticket_stats_user_select
 *          ticket_stats_detail | ticket_stats_detail:<userId>
 * =========================================================
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js');
const { version } = require('../../package.json');
const { getUserStats, getAllStats, getTotalClaims, getDetailedStats, MESSAGES_PER_POINT } = require('../database/ticketStatsStore');
const { getAllSessions } = require('./ticketStore');

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
    const { messagePoints, closePoints, ratingPoints } = stats.points;
    return [
        `💬 رسائل (كل ${MESSAGES_PER_POINT} رسالة داخل التكتات = نقطة): **+${messagePoints}**`,
        `📥 تكتات مغلقة (نقطة لكل تكت كآخر مستلم): **+${closePoints}**`,
        `⭐ تقييمات (5★=1.5 | 4★=1 | 3★=0.75 | 2★=0.5 | 1★=0.25): **+${ratingPoints}**`,
    ].join('\n');
}

/** إيمبد إحصائيات كاملة لعضو (تُستخدم لـ"احصائياتي" ولعرض إحصائيات شخص) */
function buildUserStatsEmbed(targetUser, guild, options = {}) {
    const stats = getUserStats(targetUser.id);
    const totalClaims = getTotalClaims();
    const claimRate = totalClaims > 0 ? Math.round((stats.ticketsClaimed / totalClaims) * 100) : 0;
    const member = guild?.members.cache.get(targetUser.id) || null;

    const embed = new EmbedBuilder()
        .setColor(options.color || COLORS.main)
        .setTitle(`📊 ${options.title || 'إحصائيات التكتات'} — ${targetUser.tag}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            { name: '🎖️ رتبته', value: member ? getRoleName(member) : '—', inline: false },
            { name: '🏆 النقاط الإجمالية', value: `**${stats.points.total} نقطة**`, inline: false },
            { name: '🧮 تفاصيل النقاط', value: buildPointsBreakdownField(stats), inline: false },
            { name: '🎫 تكتات استلمها', value: `${stats.ticketsClaimed}`, inline: true },
            { name: '📥 تكتات مغلقة (كآخر مستلم)', value: `${stats.ticketsClosed}`, inline: true },
            { name: '💬 رسائله في كل التكتات', value: `${stats.messagesSent}`, inline: true },
            { name: '📊 معدل الرسائل لكل تكت', value: `${stats.messagesPerTicket.toFixed(2)}`, inline: true },
            { name: '⚡ سرعة الاستلام (متوسط)', value: formatClaimSpeed(stats.avgClaimTimeMs), inline: true },
            { name: '⭐ عدد نجوم التقييم', value: `${stats.ratingCount}`, inline: true },
            { name: '🌟 معدل التقييم', value: stats.ratingCount > 0 ? `${stats.avgRating.toFixed(2)} / 5` : 'لا توجد تقييمات بعد', inline: true },
            { name: '🎯 معدل الاستلام', value: `${claimRate}% من إجمالي **${totalClaims}** استلام بالسيرفر`, inline: true },
        )
        .setFooter({ text: `الإصدار: ${version}` })
        .setTimestamp();

    return { embed, stats, claimRate, totalClaims };
}

// ================== 📊 احصائياتي ==================
async function handleMyStats(interaction) {
    await interaction.deferUpdate().catch(() => {});
    const { embed } = buildUserStatsEmbed(interaction.user, interaction.guild, {
        title: 'احصائياتي',
        color: COLORS.main,
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_stats_detail').setLabel('📊 إحصائياتي المفصلة').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_stats_top').setLabel('🏆 توب نقاط').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_board_main').setLabel('🔙 رجوع للوحة').setStyle(ButtonStyle.Secondary),
    );

    return interaction.followUp({ embeds: [embed], components: [row], ephemeral: true }).catch(() => {});
}

// ================== 🏆 توب نقاط ==================
async function handleTopStats(interaction) {
    await interaction.deferUpdate().catch(() => {});
    const ranked = getAllStats();
    if (ranked.length === 0) {
        return interaction.followUp({
            content: '📊 لا توجد إحصائيات بعد — ابدأ بفتح التكتات والرد على الأعضاء!',
            ephemeral: true,
        }).catch(() => {});
    }
    const totalPages = Math.ceil(ranked.length / PER_PAGE);
    const state = { type: 'stats_top', page: 0, totalPages, ranked, userId: interaction.member.id };
    setState(interaction.member.id, state);

    const embed = buildTopEmbed(state, interaction.guild);
    const row = buildTopNavRow(state);
    return interaction.followUp({ embeds: [embed], components: row, ephemeral: true }).catch(() => {});
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
    await interaction.deferUpdate().catch(() => {});
    const select = new UserSelectMenuBuilder()
        .setCustomId('ticket_stats_user_select')
        .setPlaceholder('اختر شخصاً لعرض إحصائياته...');

    const row = new ActionRowBuilder().addComponents(select);
    return interaction.followUp({
        content: '🔍 اختر شخصاً لعرض كل إحصائياته:',
        components: [row],
        ephemeral: true,
    }).catch(() => {});
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
            // 🎫 حالة التكتات
            { name: '🎫 تكتات قيد المعالجة', value: `**${detail.inProgress}**`, inline: true },
            { name: '🔀 حوّلها لغيره', value: `**${detail.transferredAway}**`, inline: true },
            { name: '📥 استلمها من غيره', value: `**${detail.receivedFromOthers}**`, inline: true },
            { name: '🗑️ حذفها نهائياً', value: `**${detail.ticketsDeleted}**`, inline: true },
            { name: '⚠️ تكتات شكاوى مستلمة', value: `**${detail.complaintsClaimed}**`, inline: true },
            { name: '🛠️ تكتات دعم فني مستلمة', value: `**${detail.supportClaimed}**`, inline: true },
            // ⏱️ المدد والأداء
            { name: '🚀 أسرع استلام', value: `**${fmtDur(detail.fastestClaimMs)}**`, inline: true },
            { name: '🏃‍♂️ أسرع إغلاق', value: `**${fmtDur(detail.fastestCloseMs)}**`, inline: true },
            { name: '⏳ متوسط مدة التكت', value: `**${fmtDur(detail.avgTicketDurationMs)}**`, inline: true },
            { name: '🕰️ أطول جلسة في تكت', value: `**${fmtDur(detail.longestSessionMs)}**`, inline: true },
            { name: '📜 أطول تكت بعدد رسائلي', value: `**${detail.maxMessagesInTicket} رسالة**`, inline: true },
            { name: '🕐 آخر تواجد بتكت', value: `**${fmtLast(detail.lastActivityAt)}**`, inline: true },
            // 💬 النشاط
            { name: '📅 رسائله خلال اليوم', value: `**${detail.messagesToday}**`, inline: true },
            { name: '📢 عدد المنشنات (@)', value: `**${detail.mentionsCount}**`, inline: true },
            { name: '📎 عدد المرفقات', value: `**${detail.attachmentsCount}**`, inline: true },
            { name: '👥 رسائل أعضاء رد عليها', value: `**${detail.repliedToMembers}**`, inline: true },
            // ⭐ التقييمات
            { name: '🌟 تقييمات 5 نجوم', value: `**${detail.fiveStarRatings}**`, inline: true },
            { name: '💔 التقييمات السلبية (1-2★)', value: `**${detail.negativeRatings}**`, inline: true },
            { name: '🎯 عدد التقييمات', value: `**${detail.ratingCount}** (متوسط ${detail.avgRating > 0 ? detail.avgRating.toFixed(1) : '—'})`, inline: true },
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
    await interaction.deferUpdate().catch(() => {});
    const targetId = (interaction.customId || '').split(':')[1] || interaction.member.id;
    const member = interaction.guild?.members.cache.get(targetId);
    const targetUser = member?.user || (await interaction.client.users.fetch(targetId).catch(() => null));
    if (!targetUser) {
        return interaction.followUp({
            content: '⚠️ لم يتم العثور على هذا العضو.',
            ephemeral: true,
        }).catch(() => {});
    }

    const detail = getDetailedStats(targetId, getAllSessions());
    const embed = buildDetailedStatsEmbed(targetUser, interaction.guild, detail);
    return interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => {});
}

module.exports = {
    handleMyStats,
    handleTopStats,
    handleTopNav,
    handlePickPerson,
    handleStatsUserSelect,
    handleDetailStats,
    formatClaimSpeed,
};

/**
 * =========================================================
 *  database/ticketStatsStore.js
 * =========================================================
 * مخزن إحصائيات أعضاء التكتات (الستاف):
 *   - الملف: data/ticket-stats.json — { users: { [userId]: stats } }
 *   - كل عضو يُتتبع له: التكتات المستلمة، التكتات المغلقة كآخر مستلم،
 *     عدد الرسائل داخل كل التكتات، وتقييمات النجوم.
 *
 * نظام النقاط (يُحسب من البيانات الخام — لا يُخزَّن لئلا يتباعد):
 *   - كل 75 رسالة داخل التكتات        = نقطة واحدة
 *   - كل تكت يُقفل (آخر مستلم له)     = نقطة واحدة
 *   - التقييمات: 5★ = 1.5 | 4★ = 1 | 3★ = 0.75 | 2★ = 0.5 | 1★ = 0.25
 * =========================================================
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'ticket-stats.json');

/** كل 75 رسالة داخل التكتات = نقطة */
const MESSAGES_PER_POINT = 75;

/** نقاط كل تقييم نجمي */
const RATING_POINTS = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1, 5: 1.5 };

let state = { users: {} };
let saveTimer = null;

function ensureFile() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '{}', 'utf-8');
}

function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            ensureFile();
            fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf-8');
        } catch (err) {
            console.error('[ticketStats] فشل الحفظ على القرص:', err.message);
        }
    }, 300);
}

/** استعادة الإحصائيات عند الإقلاع */
function initStatsStore() {
    try {
        ensureFile();
        const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        if (raw && typeof raw.users === 'object') {
            state.users = raw.users;
        }
    } catch (err) {
        console.error('[ticketStats] فشل استعادة الإحصائيات:', err.message);
        state.users = {};
    }
}

function ensureUser(userId) {
    if (!state.users[userId]) {
        state.users[userId] = {
            ticketsClaimed: 0,
            ticketsClosed: 0,
            messagesSent: 0,
            ratings: [],
            claimTimes: [],
            // حقول الإحصائيات المفصلة:
            transferredAway: 0, // تكتات حوّلها لغيره (خرجت من استلامه)
            receivedFromOthers: 0, // تكتات استلمها من غيره
            ticketsDeleted: 0, // تكتات حذفها نهائياً
            longestSessionMs: 0, // أطول مدة جلس فيها بتكت
            maxMessagesInTicket: 0, // أكثر عدد رسائله في تكت واحد
            mentionsCount: 0, // عدد المنشنات @
            attachmentsCount: 0, // عدد المرفقات
            repliedToMembers: 0, // رسائل الأعضاء التي رد عليها
            sessionDurations: [], // مدد الجلسات (استلام → قفل/حذف)
            daily: {}, // { 'YYYY-MM-DD': عدد الرسائل }
            lastActivityAt: 0, // آخر تواجد له في أي تكت
        };
    }
    return state.users[userId];
}

/** تسجيل استلام تذكرة */
function recordClaim(userId) {
    if (!userId) return;
    ensureUser(userId).ticketsClaimed += 1;
    persist();
}

/** تسجيل إغلاق تذكرة (آخر مستلم لها — نقطة واحدة) */
function recordClose(userId) {
    if (!userId) return;
    ensureUser(userId).ticketsClosed += 1;
    persist();
}


/**
 * تسجيل تحويل ملكية استلام:
 *   fromId = صاحب الاستلام السابق (خرجت من يده → transferredAway)
 *   toId   = المستلم الجديد (وصلت إليه → receivedFromOthers)
 */
function recordTransfer(fromId, toId) {
    if (!fromId && !toId) return;
    if (fromId) ensureUser(fromId).transferredAway += 1;
    if (toId) ensureUser(toId).receivedFromOthers += 1;
    persist();
}

/** تسجيل حذف نهائي لتذكرة (على يد عضو — وليس تلقائياً) */
function recordTicketDeleted(userId) {
    if (!userId) return;
    ensureUser(userId).ticketsDeleted += 1;
    persist();
}

/** تسجيل رسالة داخل تذكرة */
function recordMessage(userId) {
    if (!userId) return;
    ensureUser(userId).messagesSent += 1;
    persist();
}

/** تسجيل دفعة رسائل دفعة واحدة (تُستدعى عند قفل التذكرة — لتقليل الضغط) */
function recordMessages(userId, count) {
    if (!userId || !count || count <= 0) return;
    ensureUser(userId).messagesSent += count;
    persist();
}

/** تسجيل سرعة استلام: الوقت من فتح التذكرة حتى استلامها (بالمللي ثانية) */
function recordClaimSpeed(userId, ms) {
    if (!userId || !ms || ms <= 0) return;
    const u = ensureUser(userId);
    if (!Array.isArray(u.claimTimes)) u.claimTimes = [];
    u.claimTimes.push(Math.floor(ms));
    if (u.claimTimes.length > 100) u.claimTimes = u.claimTimes.slice(-100); // نحتفظ بآخر 100
    persist();
}

/**
 * التزام إحصائيات التذكرة عند قفلها/حذفها (بدل التحديث مع كل رسالة):
 *   - رسائل كل المشاركين (دفعة واحدة)
 *   - الاستلام + نقطة الإغلاق (إن كانت مقفلة) + سرعة الاستلام
 * ملاحظة: تستدعى من معالجي القفل/الحذف — علامة statsCommitted تمنع التكرار
 */
/**
 * التزام إحصائيات التذكرة عند قفلها/حذفها (بدل التحديث مع كل رسالة):
 *   - رسائل كل المشاركين (دفعة واحدة) + التوزيع اليومي + آخر تواجد
 *   - النشاط التفصيلي: منشنات/مرفقات/ردود على الأعضاء/شكر/ردود جاهزة
 *   - الاستلام + نقطة الإغلاق + سرعة الاستلام + مدة الجلسة
 * ملاحظة: تستدعى من معالجي القفل/الحذف — علامة statsCommitted تمنع التكرار
 */
function commitTicketStats(session) {
    if (!session || session.statsCommitted) return;

    const claimer = session.claimedBy;
    const counts = session.messageCounts || {};
    const dayKey = new Date().toISOString().slice(0, 10);

    // 1) رسائل كل المشاركين (دفعة واحدة) + اليومي + أطول تكت + آخر تواجد
    for (const [uid, count] of Object.entries(counts)) {
        if (!count || count <= 0) continue;
        const raw = ensureUser(uid);
        raw.messagesSent += count;
        raw.daily = raw.daily || {};
        raw.daily[dayKey] = (raw.daily[dayKey] || 0) + count;
        raw.maxMessagesInTicket = Math.max(raw.maxMessagesInTicket || 0, count);
        raw.lastActivityAt = Math.max(raw.lastActivityAt || 0, session.lastActivityAt || 0);
    }

    // 2) النشاط التفصيلي في الجلسة (مجمّع في الذاكرة أثناء المحادثة)
    for (const [uid, act] of Object.entries(session.staffActivity || {})) {
        const raw = ensureUser(uid);
        raw.mentionsCount = (raw.mentionsCount || 0) + (act.mentions || 0);
        raw.attachmentsCount = (raw.attachmentsCount || 0) + (act.attachments || 0);
        raw.repliedToMembers = (raw.repliedToMembers || 0) + (act.repliedTo || 0);
    }

    // 3) الاستلام + نقطة الإغلاق + سرعة الاستلام + مدة الجلسة (لآخر مستلم)
    if (claimer) {
        recordClaim(claimer);
        if (session.lockedAt) recordClose(claimer);
        const claimedAt = session.claimedAt || 0;
        const openedAt = session.openedAt || 0;
        if (claimedAt > openedAt) recordClaimSpeed(claimer, claimedAt - openedAt);

        const closedAt = session.lockedAt || Date.now();
        if (claimedAt > 0 && closedAt > claimedAt) {
            const raw = ensureUser(claimer);
            raw.sessionDurations = raw.sessionDurations || [];
            raw.sessionDurations.push(closedAt - claimedAt);
            raw.longestSessionMs = Math.max(raw.longestSessionMs || 0, closedAt - claimedAt);
        }
    }

    persist();

    // 4) تعليم الجلسة كملتزمة + مسح العدّادات والنشاط المؤقت
    const { updateSession } = require('../handlers/ticketStore');
    updateSession(session.channelId, { statsCommitted: true, messageCounts: {}, staffActivity: {} });
}

/** تسجيل تقييم نجمي (1-5) */
function recordRating(userId, value) {
    if (!userId) return;
    const stars = Math.max(1, Math.min(5, Math.floor(Number(value) || 0)));
    ensureUser(userId).ratings.push({ value: stars, at: Date.now() });
    persist();
}

/** حساب نقاط عضو من بياناته الخام */
function calculatePoints(stats) {
    const messages = stats.messagesSent || 0;
    const closed = stats.ticketsClosed || 0;
    const ratings = Array.isArray(stats.ratings) ? stats.ratings : [];
    const messagePoints = Math.floor(messages / MESSAGES_PER_POINT);
    const ratingPoints = ratings.reduce((sum, r) => sum + (RATING_POINTS[r.value] || 0), 0);
    return { messagePoints, closePoints: closed, ratingPoints, total: messagePoints + closed + ratingPoints };
}

/**
 * إحصائيات كاملة لعضو (خام + محسوبة)
 * @returns {Object}
 */
function getUserStats(userId) {
    const raw = ensureUser(userId);
    const points = calculatePoints(raw);
    const ratings = Array.isArray(raw.ratings) ? raw.ratings : [];
    const ratingCount = ratings.length;
    const avgRating = ratingCount > 0 ? ratings.reduce((s, r) => s + r.value, 0) / ratingCount : 0;

    return {
        ticketsClaimed: raw.ticketsClaimed || 0,
        ticketsClosed: raw.ticketsClosed || 0,
        messagesSent: raw.messagesSent || 0,
        ratings,
        ratingCount,
        avgRating,
        claimTimes: Array.isArray(raw.claimTimes) ? raw.claimTimes : [],
        avgClaimTimeMs:
            Array.isArray(raw.claimTimes) && raw.claimTimes.length > 0
                ? raw.claimTimes.reduce((s, t) => s + t, 0) / raw.claimTimes.length
                : null,
        messagesPerTicket: raw.ticketsClaimed > 0 ? raw.messagesSent / raw.ticketsClaimed : 0,
        points,
    };
}

/**
 * كل الإحصائيات مرتبة حسب النقاط تنازلياً
 * @returns {Array<{ id: String, stats: Object, points: Number }>}
 */
function getAllStats() {
    return Object.entries(state.users)
        .map(([id, raw]) => ({ id, stats: getUserStats(id), points: calculatePoints(raw).total }))
        .filter(u => u.points > 0 || u.stats.ticketsClaimed > 0 || u.stats.messagesSent > 0)
        .sort((a, b) => b.points - a.points || b.stats.ticketsClaimed - a.stats.ticketsClaimed || b.stats.messagesSent - a.stats.messagesSent);
}

/** إجمالي الاستلامات في السيرفر (لحساب معدل الاستلام) */
function getTotalClaims() {
    return Object.values(state.users).reduce((sum, s) => sum + (s.ticketsClaimed || 0), 0);
}

/**
 * نقاط الخبرة (XP) — نظام منفصل عن نقاط الترتيب:
 *   رسالة = 1 | استلام = 5 | إغلاق = 10 | تحويل = 2 | استلام من غيره = 2
 *   حذف = 5 | كل نجمة تقييم = 10
 * المستوى: كل 200 XP مستوى واحد.
 */
function calculateXP(raw) {
    const ratings = Array.isArray(raw.ratings) ? raw.ratings : [];
    const ratingXp = ratings.reduce((s, r) => s + (r.value || 0) * 10, 0);
    const xp =
        (raw.messagesSent || 0) * 1 +
        (raw.ticketsClaimed || 0) * 5 +
        (raw.ticketsClosed || 0) * 10 +
        (raw.transferredAway || 0) * 2 +
        (raw.receivedFromOthers || 0) * 2 +
        (raw.ticketsDeleted || 0) * 5 +
        ratingXp;
    return { xp, level: Math.floor(xp / 200) + 1 };
}

/** لوحة XP مرتبة تنازلياً (لحساب المركز بالسيرفر) */
function getXPLeaderboard() {
    return Object.entries(state.users)
        .map(([id, raw]) => ({ id, xp: calculateXP(raw).xp }))
        .filter(u => u.xp > 0)
        .sort((a, b) => b.xp - a.xp);
}

/**
 * نظام المستويات — يعتمد على النقاط (نقاط الترتيب) بقانون رياضي لا نهائي:
 *   مطلوب للمستوى L: 2·L·(L+1) − 4 نقطة تراكمية
 *   المستوى 1 = 0 | 2 = 8 | 3 = 20 | 4 = 36 | 5 = 56 | 6 = 80 | 7 = 108
 *   8 = 140 | 9 = 176 | 10 = 216 | 15 = 476 | 20 = 836 | 30 = 1856 ...
 * الفجوة بين كل مستوىين = 4·L (4، 8، 12، 16...)، فلا يوجد سقف أعلى،
 * وتصبح أسرع من السابق بمراحل — لكنها تتطلب جهداً مستمراً في المستويات العليا.
 */
function pointsForLevel(level) {
    return 2 * level * (level + 1) - 4;
}

/** المستوى من النقاط (حل عكسي للمعادلة التربيعية) */
function levelFromPoints(points) {
    if (!points || points < 0) return 1;
    return Math.floor((Math.sqrt(2 * points + 9) - 1) / 2) || 1;
}

/** معلومات مستوى: رقمه + النقاط المكتسبة داخله + المطلوب للمستوى التالي */
function getLevelInfo(points) {
    const level = levelFromPoints(points);
    const base = pointsForLevel(level);
    const next = pointsForLevel(level + 1);
    return { level, inLevel: points - base, nextLevelAt: next - base };
}

/**
 * الإحصائيات المفصلة للإداري (المطلوبة في إيمبد "إحصائياتي المفصلة"):
 * تعتمد على بيانات المخزن + الجلسات الحية (قيد المعالجة)
 * @param {String} userId
 * @param {Array} sessions - getAllSessions() من ticketStore
 */
function getDetailedStats(userId, sessions = []) {
    const stats = getUserStats(userId);
    const raw = ensureUser(userId);
    const durations = Array.isArray(raw.sessionDurations) ? raw.sessionDurations : [];
    const daily = raw.daily || {};
    const todayKey = new Date().toISOString().slice(0, 10);
    const mySessions = sessions.filter(s => s.claimedBy === userId);
    const xpInfo = calculateXP(raw);
    const lb = getXPLeaderboard();
    const xpRank = lb.findIndex(u => u.id === userId) + 1;

    return {
        ...stats,
        // 🎫 حالة التكتات
        inProgress: mySessions.filter(s => !s.lockedAt).length,
        transferredAway: raw.transferredAway || 0,
        receivedFromOthers: raw.receivedFromOthers || 0,
        ticketsDeleted: raw.ticketsDeleted || 0,
        // ⏱️ المدد والأداء
        longestSessionMs: raw.longestSessionMs || null,
        fastestClaimMs: stats.claimTimes.length > 0 ? Math.min(...stats.claimTimes) : null,
        fastestCloseMs: durations.length > 0 ? Math.min(...durations) : null,
        avgTicketDurationMs: durations.length > 0 ? durations.reduce((s, v) => s + v, 0) / durations.length : null,
        maxMessagesInTicket: raw.maxMessagesInTicket || 0,
        lastActivityAt: raw.lastActivityAt || null,
        // 💬 النشاط
        messagesToday: daily[todayKey] || 0,
        mentionsCount: raw.mentionsCount || 0,
        attachmentsCount: raw.attachmentsCount || 0,
        repliedToMembers: raw.repliedToMembers || 0,
        // ⭐ التقييم
        fiveStarRatings: stats.ratings.filter(r => r.value === 5).length,
        negativeRatings: stats.ratings.filter(r => r.value <= 2).length,
        // 🏆 المستوى والمركز
        xp: xpInfo.xp,
        level: levelFromPoints(stats.points.total),
        xpRank,
        xpTotal: lb.length,
    };
}

module.exports = {
    initStatsStore,
    recordClaim,
    recordClose,
    recordMessage,
    recordMessages,
    recordClaimSpeed,
    recordRating,
    recordTransfer,
    recordTicketDeleted,
    commitTicketStats,
    getUserStats,
    getAllStats,
    getTotalClaims,
    getDetailedStats,
    calculatePoints,
    calculateXP,
    getXPLeaderboard,
    pointsForLevel,
    levelFromPoints,
    getLevelInfo,
    RATING_POINTS,
    MESSAGES_PER_POINT,
};

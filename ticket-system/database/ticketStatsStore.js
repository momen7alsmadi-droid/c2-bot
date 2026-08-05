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
 *   - كل 50 رسالة داخل التكتات        = نقطة واحدة
 *   - كل تكت يُقفل (آخر مستلم له)     = نقطة واحدة
 *   - التقييمات: 5★ = 1.5 | 4★ = 1 | 3★ = 0.75 | 2★ = 0.5 | 1★ = 0.25
 * =========================================================
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DB_PATH = path.join(__dirname, '..', 'data', 'ticket-stats.json');

/** كل 50 رسالة داخل التكتات = نقطة */
const MESSAGES_PER_POINT = 50;

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
            scheduleMongoSync(); // نسخ احتياطي إلى MongoDB (بلا انتظار)
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
            ratedTickets: [], // معرّفات التكتات المقيَّمة (منع التقييم المكرر)
            pointsLog: [], // [{ pts, at, reason }] — سجل نقاط زمني (لإداري الأسبوع وغيرها)
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
            loginDays: [], // أيام تسجيل الدخول اليومي ['YYYY-MM-DD', ...]
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

/** إضافة نقاط إلى سجل النقاط الزمني (لحساب نقاط الأسبوع) — مع تقليم تلقائي */
function pushPoints(userId, pts, reason) {
    if (!userId || !pts || pts <= 0) return;
    const raw = ensureUser(userId);
    if (!Array.isArray(raw.pointsLog)) raw.pointsLog = [];
    raw.pointsLog.push({ pts: Math.round(pts * 100) / 100, at: Date.now(), reason });
    // نحتفظ بآخر 14 يوم فقط (الأقدم يُحذف) + سقف 400 حدث
    const cutoff = Date.now() - 14 * 86400000;
    raw.pointsLog = raw.pointsLog.filter(e => e && e.at >= cutoff).slice(-400);
}

/** عدد النقاط اليومية مقابل كل يوم نشط */
const LOGIN_POINTS_PER_DAY = 3;

/**
 * تسجيل دخول يومي — أول رسالة من المستخدم في اليوم الجديد:
 * يُضاف اليوم لقائمة أيامه ويحصل على نقاط نشاط يومي (مرة واحدة في اليوم).
 * @returns {{ isNew: Boolean, days: Number, points: Number }}
 */
function recordDailyLogin(userId, date = new Date().toISOString().slice(0, 10)) {
    if (!userId) return { isNew: false, days: 0, points: 0 };
    const raw = ensureUser(userId);
    const days = Array.isArray(raw.loginDays) ? raw.loginDays : (raw.loginDays = []);
    if (days.includes(date)) return { isNew: false, days: days.length, points: 0 };
    days.push(date);
    pushPoints(userId, LOGIN_POINTS_PER_DAY, 'login');
    persist();
    return { isNew: true, days: days.length, points: LOGIN_POINTS_PER_DAY };
}

/** تسجيل إغلاق تذكرة (آخر مستلم لها — نقطة واحدة) */
function recordClose(userId) {
    if (!userId) return;
    ensureUser(userId).ticketsClosed += 1;
    pushPoints(userId, 1, 'close');
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
    const raw = ensureUser(userId);
    const before = Math.floor((raw.messagesSent || 0) / MESSAGES_PER_POINT);
    raw.messagesSent += 1;
    const after = Math.floor(raw.messagesSent / MESSAGES_PER_POINT);
    if (after > before) pushPoints(userId, after - before, 'messages');
    persist();
}

/** تسجيل دفعة رسائل دفعة واحدة (تُستدعى عند قفل التذكرة — لتقليل الضغط) */
function recordMessages(userId, count) {
    if (!userId || !count || count <= 0) return;
    const raw = ensureUser(userId);
    const before = Math.floor((raw.messagesSent || 0) / MESSAGES_PER_POINT);
    raw.messagesSent += count;
    const after = Math.floor(raw.messagesSent / MESSAGES_PER_POINT);
    if (after > before) pushPoints(userId, after - before, 'messages');
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

/**
 * هل قيّم هذا المستخدم هذه التذكرة من قبل؟ (منع التقييم المكرر حتى لو
 * وصلت رسالة تقييم مكررة — مثلاً عند ازدواج عملية الحذف)
 * @param {String} userId - آيدي المُقيِّم (صاحب التكت)
 * @param {String} ticketKey - معرّف فريد للتذكرة (channelId)
 */
function isTicketRated(userId, ticketKey) {
    if (!userId || !ticketKey) return false;
    const raw = state.users[userId];
    return !!raw && Array.isArray(raw.ratedTickets) && raw.ratedTickets.includes(ticketKey);
}

/** تسجيل أن التذكرة قُيّمت (لمنع التكرار) */
function markTicketRated(userId, ticketKey) {
    if (!userId || !ticketKey) return;
    const raw = ensureUser(userId);
    if (!Array.isArray(raw.ratedTickets)) raw.ratedTickets = [];
    if (!raw.ratedTickets.includes(ticketKey)) {
        raw.ratedTickets.push(ticketKey);
        persist();
    }
}

/** تسجيل تقييم نجمي (1-5) */
function recordRating(userId, value) {
    if (!userId) return;
    const stars = Math.max(1, Math.min(5, Math.floor(Number(value) || 0)));
    ensureUser(userId).ratings.push({ value: stars, at: Date.now() });
    pushPoints(userId, RATING_POINTS[stars] || 0, 'rating');
    persist();
}

/** حساب نقاط عضو من بياناته الخام */
function calculatePoints(stats) {
    const messages = stats.messagesSent || 0;
    const closed = stats.ticketsClosed || 0;
    const ratings = Array.isArray(stats.ratings) ? stats.ratings : [];
    const messagePoints = Math.floor(messages / MESSAGES_PER_POINT);
    const ratingPoints = ratings.reduce((sum, r) => sum + (RATING_POINTS[r.value] || 0), 0);
    const loginDays = Array.isArray(stats.loginDays) ? stats.loginDays.length : 0;
    const loginPoints = loginDays * LOGIN_POINTS_PER_DAY;
    return { messagePoints, closePoints: closed, ratingPoints, loginPoints, total: messagePoints + closed + ratingPoints + loginPoints };
}

/**
 * نقاط العضو خلال فترة زمنية (من سجل النقاط الزمني)
 * @param {String} userId
 * @param {Number} sinceMs - حد البداية (مثال: الآن - 7 أيام)
 * @returns {{ total: Number, messages: Number, close: Number, rating: Number, login: Number }}
 */
function getWeeklyPoints(userId, sinceMs) {
    const raw = ensureUser(userId);
    const log = Array.isArray(raw.pointsLog) ? raw.pointsLog : [];
    let total = 0;
    const byReason = { messages: 0, close: 0, rating: 0, login: 0 };
    for (const e of log) {
        if (!e || e.at < sinceMs) continue;
        const pts = Number(e.pts) || 0;
        total += pts;
        byReason[e.reason] = (byReason[e.reason] || 0) + pts;
    }
    return { total: Math.round(total * 100) / 100, messages: byReason.messages, close: byReason.close, rating: byReason.rating, login: byReason.login };
}

/**
 * ترتيب الإدارة حسب نقاط الأسبوع تنازلياً
 * @param {String[]} adminIds
 * @param {Number} sinceMs
 * @returns {Array<{ id: String, weekly: Object }>} — مرتب تنازلياً (بمن لديه نقاط فقط)
 */
function getTopStaffWeekly(adminIds, sinceMs) {
    const list = (Array.isArray(adminIds) ? adminIds : [])
        .map(id => ({ id, weekly: getWeeklyPoints(id, sinceMs) }))
        .filter(x => x.weekly.total > 0)
        .sort((a, b) => b.weekly.total - a.weekly.total || a.id.localeCompare(b.id));
    return list;
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
    const ratingSum = ratings.reduce((s, r) => s + r.value, 0);
    const avgRating = ratingCount > 0 ? ratingSum / ratingCount : 0;

    return {
        ticketsClaimed: raw.ticketsClaimed || 0,
        ticketsClosed: raw.ticketsClosed || 0,
        messagesSent: raw.messagesSent || 0,
        ratings,
        ratingCount,
        ratingSum,
        avgRating,
        claimTimes: Array.isArray(raw.claimTimes) ? raw.claimTimes : [],
        avgClaimTimeMs:
            Array.isArray(raw.claimTimes) && raw.claimTimes.length > 0
                ? raw.claimTimes.reduce((s, t) => s + t, 0) / raw.claimTimes.length
                : null,
        messagesPerTicket: raw.ticketsClaimed > 0 ? raw.messagesSent / raw.ticketsClaimed : 0,
        loginDays: Array.isArray(raw.loginDays) ? raw.loginDays.length : 0,
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
 *   مطلوب للمستوى L: (L² + 3L − 4) ÷ 2 نقطة تراكمية
 *   المستوى 1 = 0 | 2 = 3 | 3 = 7 | 4 = 12 | 5 = 18 | 6 = 25 | 7 = 33
 *   8 = 42 | 9 = 52 | 10 = 63 | 15 = 133 | 20 = 228 | 30 = 493 ...
 * الفجوة بين كل مستوىين = L + 2 (3، 4، 5، 6...)، لا سقف أعلى،
 * وهي أخف بكثير من السابق حتى لا تعيق تقدّم الأعضاء النشطين.
 */
function pointsForLevel(level) {
    return (level * level + 3 * level - 4) / 2;
}

/** المستوى من النقاط (حل عكسي للمعادلة التربيعية) */
function levelFromPoints(points) {
    if (!points || points < 0) return 1;
    return Math.floor((Math.sqrt(25 + 8 * points) - 3) / 2) || 1;
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
        ratingSum: stats.ratingSum,
        // 🏆 المستوى والمركز
        xp: xpInfo.xp,
        level: levelFromPoints(stats.points.total),
        xpRank,
        xpTotal: lb.length,
    };
}

/**
 * إحصائيات عامة للإدارة — يعامل كل الأعضاء المحددين كشخص واحد:
 * يجمع كل إحصائياتهم، ويسجّل الأرقام القياسية مع اسم صاحبها:
 *   الأسرع/الأبطأ استلام، الأسرع/الأبطأ إغلاق، أطول جلسة،
 *   أطول تكت رسائلي، الأكثر رسائل، الأكثر تكتات.
 * @param {String[]} adminIds - آيديات الإدارة (رتبة الإدارة المشتركة)
 * @param {Array} [sessions] - جلسات حية من ticketStore (لقيد المعالجة)
 * @returns {Object}
 */
function getTeamAggregate(adminIds, sessions = []) {
    const ids = [...new Set((adminIds || []).filter(Boolean))];
    const raws = ids.map(id => ({ id, raw: ensureUser(id) }));
    const idSet = new Set(ids);

    const agg = {
        members: ids.length,
        ticketsClaimed: 0, ticketsClosed: 0, messagesSent: 0, loginDays: 0,
        ratingCount: 0, ratingSum: 0,
        claimTimes: [], durations: [],
        longestSessionMs: 0, maxMessagesInTicket: 0,
        transferredAway: 0, receivedFromOthers: 0, ticketsDeleted: 0,
        mentionsCount: 0, attachmentsCount: 0, repliedToMembers: 0,
        messagesToday: 0, lastActivityAt: 0, inProgress: 0,
        xp: 0, daily: {},
    };

    // سجلات فردية لكل عضو (لأرقام القياسية مع الأسماء)
    const perUser = [];

    for (const { id, raw } of raws) {
        const stats = getUserStats(id);
        const ratings = Array.isArray(raw.ratings) ? raw.ratings : [];
        const durations = Array.isArray(raw.sessionDurations) ? raw.sessionDurations : [];
        const daily = raw.daily || {};
        const todayKey = new Date().toISOString().slice(0, 10);

        agg.ticketsClaimed += stats.ticketsClaimed;
        agg.ticketsClosed += stats.ticketsClosed;
        agg.messagesSent += stats.messagesSent;
        agg.loginDays += stats.loginDays;
        agg.ratingCount += ratings.length;
        agg.ratingSum += ratings.reduce((s, r) => s + r.value, 0);
        agg.claimTimes.push(...(stats.claimTimes || []));
        agg.durations.push(...durations);
        agg.longestSessionMs = Math.max(agg.longestSessionMs, raw.longestSessionMs || 0);
        agg.maxMessagesInTicket = Math.max(agg.maxMessagesInTicket, raw.maxMessagesInTicket || 0);
        agg.transferredAway += raw.transferredAway || 0;
        agg.receivedFromOthers += raw.receivedFromOthers || 0;
        agg.ticketsDeleted += raw.ticketsDeleted || 0;
        agg.mentionsCount += raw.mentionsCount || 0;
        agg.attachmentsCount += raw.attachmentsCount || 0;
        agg.repliedToMembers += raw.repliedToMembers || 0;
        agg.messagesToday += daily[todayKey] || 0;
        agg.lastActivityAt = Math.max(agg.lastActivityAt, raw.lastActivityAt || 0);
        agg.xp += calculateXP(raw).xp;

        perUser.push({
            id, raw,
            claimTimes: stats.claimTimes || [],
            durations,
            longestSessionMs: raw.longestSessionMs || 0,
            maxMessagesInTicket: raw.maxMessagesInTicket || 0,
            messagesSent: stats.messagesSent,
            ticketsClaimed: stats.ticketsClaimed,
            lastActivityAt: raw.lastActivityAt || 0,
        });
    }

    // 🎫 قيد المعالجة: الجلسات الحية المملوكة لأي من الإدارة
    agg.inProgress = sessions.filter(s => s.claimedBy && idSet.has(s.claimedBy) && !s.lockedAt).length;

    // 🏅 الأرقام القياسية مع اسم صاحبها
    // ملاحظة: نتجاهل القيم الصفرية/الفارغة حتى لا يظهر رقم قياسي
    // بلا قيمة (مثل "— <@id>" أو "0 رسالة — <@id>") لمستخدم لم
    // يسجل أي نشاط أصلاً.
    const findBest = (list, dir) => {
        let best = null;
        for (const u of perUser) {
            for (const v of list(u)) {
                if (!v || v <= 0) continue; // نتجاهل الصفر والفارغ
                if (!best || (dir === 'min' ? v < best.value : v > best.value)) best = { value: v, id: u.id };
            }
        }
        return best;
    };
    const allClaimTimes = () => [];
    const records = {
        fastestClaim: findBest(u => u.claimTimes, 'min'),
        slowestClaim: findBest(u => u.claimTimes, 'max'),
        fastestClose: findBest(u => u.durations, 'min'),
        slowestClose: findBest(u => u.durations, 'max'),
        longestSession: findBest(u => [u.longestSessionMs], 'max'),
        maxMessagesInTicket: findBest(u => [u.maxMessagesInTicket], 'max'),
        mostMessages: findBest(u => [u.messagesSent], 'max'),
        mostTickets: findBest(u => [u.ticketsClaimed], 'max'),
    };

    // النقاط (مجمّعة) + المستوى من الإجمالي
    let messagePoints = 0, closePoints = 0, ratingPoints = 0, loginPoints = 0;
    for (const { raw } of raws) {
        const p = calculatePoints(raw);
        messagePoints += p.messagePoints; closePoints += p.closePoints;
        ratingPoints += p.ratingPoints; loginPoints += p.loginPoints;
    }
    const points = { messagePoints, closePoints, ratingPoints, loginPoints, total: messagePoints + closePoints + ratingPoints + loginPoints };

    return {
        ...agg,
        points,
        avgRating: agg.ratingCount > 0 ? agg.ratingSum / agg.ratingCount : 0,
        avgClaimTimeMs: agg.claimTimes.length > 0 ? agg.claimTimes.reduce((s, v) => s + v, 0) / agg.claimTimes.length : null,
        avgTicketDurationMs: agg.durations.length > 0 ? agg.durations.reduce((s, v) => s + v, 0) / agg.durations.length : null,
        messagesPerTicket: agg.ticketsClaimed > 0 ? agg.messagesSent / agg.ticketsClaimed : 0,
        fiveStarRatings: raws.reduce((s, { raw }) => s + (Array.isArray(raw.ratings) ? raw.ratings : []).filter(r => r.value === 5).length, 0),
        negativeRatings: raws.reduce((s, { raw }) => s + (Array.isArray(raw.ratings) ? raw.ratings : []).filter(r => r.value <= 2).length, 0),
        level: levelFromPoints(points.total),
        records,
    };
}

// =========================================================
// MongoDB Backup (نسخ احتياطي — حماية من مسح القرص المؤقت)
// =========================================================
// الإحصائيات تُحفظ في MongoDB مثل البنلات: كل كتابة على القرص
// تُنسخ خلف الكواليس إلى MongoDB، وعند التشغيل نستعيد أي
// إحصائيات فُقدت من JSON (المنصات المجانية تمسح القرص المؤقت).

const statsSchema = new mongoose.Schema({ _id: String }, { collection: 'ticketstats', versionKey: false, strict: false });

let StatsModel;

function isMongoReady() {
    if (mongoose.connection.readyState !== 1) return false;
    if (StatsModel) return true;
    try {
        StatsModel = mongoose.models.TicketStats || mongoose.model('TicketStats', statsSchema);
        return true;
    } catch {
        return false;
    }
}

/** تهيئة النموذج (تُستدعى عند التشغيل) */
function initStatsModel() {
    if (isMongoReady()) {
        console.log('📦 ticketStats → ✅ MongoDB');
        return true;
    }
    console.log('📦 ticketStats → ⚠️ JSON فقط');
    return false;
}

let mongoSyncTimer = null;

/** مزامنة كل الإحصائيات من JSON إلى MongoDB (كتابة مخفّفة) */
function scheduleMongoSync() {
    clearTimeout(mongoSyncTimer);
    mongoSyncTimer = setTimeout(() => {
        syncStatsToMongo().catch(() => {});
    }, 2000);
}

/**
 * مزامنة كل المستخدمين من JSON إلى MongoDB (Upsert)
 * @returns {Promise<Number>} عدد المستخدمين المُزامنين
 */
async function syncStatsToMongo() {
    if (!isMongoReady()) return 0;
    const ids = Object.keys(state.users);
    if (ids.length === 0) return 0;
    try {
        const ops = ids.map(id => ({
            updateOne: {
                filter: { _id: id },
                update: { $set: { ...state.users[id], _id: id } },
                upsert: true,
            },
        }));
        await StatsModel.bulkWrite(ops, { ordered: false });
        console.log(`✅ stats: تمت مزامنة ${ids.length} مستخدم إلى MongoDB`);
        return ids.length;
    } catch (e) {
        console.error('❌ stats sync MongoDB:', e.message);
        return 0;
    }
}

/**
 * استعادة الإحصائيات من MongoDB (حماية من مسح القرص):
 * يُضاف أي مستخدم موجود في MongoDB ولا يوجد في JSON الحالي.
 * @returns {Promise<Number>} عدد المستخدمين المستعادين
 */
async function loadStatsFromMongo() {
    if (!isMongoReady()) return 0;
    try {
        const docs = await StatsModel.find().lean();
        if (!docs || docs.length === 0) return 0;
        let restored = 0;
        for (const doc of docs) {
            const id = doc._id;
            if (!id) continue;
            if (state.users[id]) continue; // الموجود في JSON هو المصدر الأحدث
            const { _id, ...raw } = doc;
            state.users[id] = raw;
            restored++;
        }
        if (restored > 0) {
            persist();
            console.log(`🔄 stats: تمت استعادة ${restored} مستخدم من MongoDB`);
        }
        return restored;
    } catch (e) {
        console.error('❌ stats load MongoDB:', e.message);
        return 0;
    }
}

module.exports = {
    initStatsStore,
    initStatsModel,
    recordClaim,
    recordClose,
    recordMessage,
    recordMessages,
    recordClaimSpeed,
    recordRating,
    isTicketRated,
    markTicketRated,
    recordTransfer,
    recordTicketDeleted,
    recordDailyLogin,
    commitTicketStats,
    getUserStats,
    getAllStats,
    getTotalClaims,
    getDetailedStats,
    getTeamAggregate,
    calculatePoints,
    calculateXP,
    getXPLeaderboard,
    pointsForLevel,
    levelFromPoints,
    getLevelInfo,
    RATING_POINTS,
    MESSAGES_PER_POINT,
    LOGIN_POINTS_PER_DAY,
    getWeeklyPoints,
    getTopStaffWeekly,
    // MongoDB backup
    loadStatsFromMongo,
    syncStatsToMongo,
};

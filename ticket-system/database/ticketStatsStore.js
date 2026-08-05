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
        state.users[userId] = { ticketsClaimed: 0, ticketsClosed: 0, messagesSent: 0, ratings: [] };
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

/** تسجيل رسالة داخل تذكرة */
function recordMessage(userId) {
    if (!userId) return;
    ensureUser(userId).messagesSent += 1;
    persist();
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

module.exports = {
    initStatsStore,
    recordClaim,
    recordClose,
    recordMessage,
    recordRating,
    getUserStats,
    getAllStats,
    getTotalClaims,
    calculatePoints,
    RATING_POINTS,
    MESSAGES_PER_POINT,
};

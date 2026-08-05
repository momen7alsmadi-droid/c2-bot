/**
 * =========================================================
 *  database/ticketCounterStore.js
 * =========================================================
 * عداد ترقيم التذاكر العام المستمر (مستقل عن حجم الكاتيجوري):
 *   - الملف: data/ticket-counter.json — { next: Number }
 *   - عند فتح تذكرة: getNextTicketNumber(start) يُعيد الرقم
 *     الحالي ثم يزيده — فيبقى الترقيم متسلسلاً حتى بعد حذف
 *     الرومات أو تغيير الكاتيجوري أو إعادة تشغيل البوت.
 * =========================================================
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'ticket-counter.json');

let state = { next: null };
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
            console.error('[ticketCounter] فشل الحفظ على القرص:', err.message);
        }
    }, 200);
}

/** استعادة العداد عند الإقلاع */
function initCounterStore() {
    try {
        ensureFile();
        const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        state.next = typeof raw.next === 'number' ? raw.next : null;
    } catch (err) {
        console.error('[ticketCounter] فشل استعادة العداد:', err.message);
        state.next = null;
    }
}

/**
 * الحصول على رقم التذكرة التالي (ويزيد العداد).
 * @param {Number} start - بداية الترقيم من الإعدادات العامة (افتراضياً 1)
 * @returns {Number}
 */
function getNextTicketNumber(start = 1) {
    const base = Math.max(0, Math.floor(Number(start)) || 0) || 1;
    const next = state.next === null ? base : state.next + 1;
    state.next = next;
    persist();
    return next;
}

module.exports = { getNextTicketNumber, initCounterStore };

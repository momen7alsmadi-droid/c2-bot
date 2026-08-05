/**
 * =========================================================
 *  database/ticketCooldownStore.js
 * =========================================================
 * تتبّع آخر وقت فتح تذكرة لكل عضو (لدعم "الكولداون" العام):
 *   الملف: data/ticket-cooldowns.json
 *   الشكل: { [userId]: lastOpenedAt (ms) }
 *
 * بيانات وقت تشغيل — JSON فقط (لا حاجة لمرآة MongoDB) لأنها
 * تاريخ مستخدم وليست إعدادات، وتُحفظ بكتابة مخفّفة (Debounced)
 * مثل ticketStore.
 * =========================================================
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'ticket-cooldowns.json');

let track = {};
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
            fs.writeFileSync(DB_PATH, JSON.stringify(track, null, 2), 'utf-8');
        } catch (err) {
            console.error('[ticketCooldown] فشل الحفظ على القرص:', err.message);
        }
    }, 400);
}

/** استعادة سجل الكولداون عند الإقلاع (يُستدعى من ملف التشغيل) */
function initCooldownStore() {
    try {
        ensureFile();
        track = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) || {};
    } catch (err) {
        console.error('[ticketCooldown] فشل استعادة السجل:', err.message);
        track = {};
    }
}

/** آخر وقت فتح تذكرة للعضو (null إن لم يفتح من قبل) */
function getLastOpen(userId) {
    return typeof track[userId] === 'number' ? track[userId] : null;
}

/** تسجيل وقت فتح تذكرة للعضو */
function setLastOpen(userId, timestamp) {
    track[userId] = timestamp;
    persist();
}

module.exports = { getLastOpen, setLastOpen, initCooldownStore };

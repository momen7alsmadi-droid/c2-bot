/**
 * =========================================================
 *  utils/imageLibrary.js
 * =========================================================
 * مكتبة الصور المسمّاة: يرفع الإداري صورة عبر /رفع-صورة مع
 * اسم لها (بدون ربطها ببنل معيّن)، ثم يختارها لاحقاً من
 * إعدادات أي بنل (صفحة "مكتبة الصور") باسمها.
 *
 * التخزين:
 *   1) JSON على القرص: data/image-library.json
 *      -> { [name]: { url, addedBy, addedAt } }
 *   2) رسالة البنك (روم 🖼️-بنك-الصور) تُرسل مع محتواها = اسم
 *      الصورة، لذلك عند إقلاع البوت يمكن إعادة بناء المكتبة
 *      من رسائل البنك حتى لو مُسح القرص (لأن رسائل ديسكورد
 *      دائمة) — rebuildImageLibrary().
 * =========================================================
 */

const fs = require('fs');
const path = require('path');
const { findOrCreateBank } = require('./imageStore');
const { reportError } = require('../../src/utils/errorLogger');

const LIB_PATH = path.join(__dirname, '..', 'data', 'image-library.json');

/**
 * قراءة المكتبة من القرص بأمان
 * @returns {Object<String, {url:String, addedBy:String, addedAt:Number}>}
 */
function readLibrary() {
    try {
        if (fs.existsSync(LIB_PATH)) {
            const data = JSON.parse(fs.readFileSync(LIB_PATH, 'utf8'));
            if (data && typeof data === 'object') return data;
        }
    } catch (err) {
        console.error('[imageLibrary] فشل قراءة المكتبة:', err.message);
        reportError('STORAGE', 'image-library-read', err);
    }
    return {};
}

/**
 * حفظ المكتبة على القرص
 */
function writeLibrary(lib) {
    try {
        fs.mkdirSync(path.dirname(LIB_PATH), { recursive: true });
        fs.writeFileSync(LIB_PATH, JSON.stringify(lib, null, 2), 'utf-8');
    } catch (err) {
        console.error('[imageLibrary] فشل حفظ المكتبة:', err.message);
        reportError('STORAGE', 'image-library-write', err);
    }
}

/**
 * إضافة صورة للمكتبة (تستبدل الصورة القديمة إذا وُجد الاسم)
 * @param {String} name
 * @param {String} url
 * @param {String} addedBy
 * @returns {{url:String, addedBy:String, addedAt:Number}}
 */
function addImage(name, url, addedBy = '') {
    const lib = readLibrary();
    const clean = String(name || '').trim().slice(0, 80);
    if (!clean) return null;

    const entry = { url: String(url), addedBy: String(addedBy || ''), addedAt: Date.now() };
    lib[clean] = entry;
    writeLibrary(lib);
    return entry;
}

/**
 * كل الصور في المكتبة (مرتبة: الأحدث أولاً)
 * @returns {Array<{name:String, url:String, addedBy:String, addedAt:Number}>}
 */
function getAllImages() {
    const lib = readLibrary();
    return Object.entries(lib)
        .map(([name, entry]) => ({ name, ...entry }))
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

/**
 * رابط صورة باسم معيّن (أو null)
 * @param {String} name
 * @returns {String|null}
 */
function getImageUrl(name) {
    const lib = readLibrary();
    const entry = lib[name];
    return entry ? entry.url : null;
}

/**
 * حذف صورة من المكتبة
 * @param {String} name
 * @returns {Boolean} true إذا وُجدت وحُذفت
 */
function removeImage(name) {
    const lib = readLibrary();
    if (!lib[name]) return false;
    delete lib[name];
    writeLibrary(lib);
    return true;
}

/**
 * إعادة بناء المكتبة من رسائل روم بنك الصور (عند الإقلاع):
 * كل رسالة في البنك محتواها = اسم الصورة ومرفقها = الصورة.
 * نضيف فقط الصور الغائبة (لا نحذف أي شيء).
 * @param {import('discord.js').Client} client
 * @returns {Promise<Number>} عدد الصور المضافة
 */
async function rebuildImageLibrary(client) {
    let added = 0;
    try {
        const lib = readLibrary();

        for (const guild of client.guilds.cache.values()) {
            const bank = await findOrCreateBank(guild).catch(() => null);
            if (!bank) continue;

            const fetched = await bank.messages.fetch({ limit: 100 }).catch(() => null);
            if (!fetched) continue;

            for (const msg of fetched.values()) {
                const name = (msg.content || '').trim();
                const att = msg.attachments.first();
                if (!name || !att) continue;

                // لا نستبدل الصور الموجودة (تجنب فقدان التعديلات)
                if (lib[name]) continue;
                lib[name] = { url: att.url, addedBy: msg.author?.id || '', addedAt: msg.createdTimestamp || Date.now() };
                added += 1;
            }
        }

        if (added > 0) writeLibrary(lib);
    } catch (err) {
        console.error('[imageLibrary] فشل إعادة بناء المكتبة:', err.message);
        reportError('STORAGE', 'image-library-rebuild', err);
    }
    return added;
}

module.exports = { addImage, getAllImages, getImageUrl, removeImage, rebuildImageLibrary };

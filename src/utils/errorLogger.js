/**
 * =========================================================
 *  src/utils/errorLogger.js
 * =========================================================
 * نظام الأخطاء المركزي للبوت:
 *   1) يكتب الخطأ في ملف السجل المحلي (data/error-log.json)
 *   2) يرسل إيمبد خطأ إلى "روم الأخطاء" المحدد في الإعدادات
 *      (errorLogChannelId) بنفس الشكل الموحد:
 *        🚨 خطأ: <النوع> | 🆔 <المعرف> | 🕐 <الوقت>
 *        📝 رسالة الخطأ
 *        📋 المكدس (Stack)
 *
 * يُستدعى من:
 *   - src/index.js (الأخطاء العامة + أعلى معالج التفاعلات)
 *   - معالجات نظام التذاكر عبر reportError() في كل catch
 *
 * أي خطأ (مهما كان داخلياً) يصل تلقائياً إلى روم الأخطاء.
 * =========================================================
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { getConfig } = require('./storage');

const ERROR_LOG_PATH = path.join(__dirname, '..', '..', 'data', 'error-log.json');
const MAX_LOG = 50;

// آيدي مطوّر البوت (يُمنشن في رسالة الخطأ)
const DEV_ID = '1387331972094890036';

let clientRef = null;

/**
 * ربط الـ client بعد إنشائه (يُستدعى مرة واحدة من src/index.js)
 * @param {import('discord.js').Client} client
 */
function setErrorClient(client) {
    clientRef = client;
}

/**
 * قراءة آيدي روم الأخطاء من الإعدادات بأمان (لا يرمي أبداً)
 */
function readErrorChannelId() {
    try {
        const cfg = getConfig();
        return cfg && cfg.errorLogChannelId ? cfg.errorLogChannelId : null;
    } catch {
        return null;
    }
}

/**
 * إرسال إيمبد الخطأ إلى روم الأخطاء المحدد (بنفس الشكل الموحد)
 * @param {import('discord.js').Client} client
 * @param {String} type - نوع الخطأ (مثلاً UNCAUGHT_EXCEPTION / TICKET_BUTTON)
 * @param {String} id - معرف مصدر الخطأ (customId / commandName / 'global')
 * @param {Error} err
 */
async function sendErrorToChannel(client, type, id, err) {
    // تجاهل أخطاء التوقيت العابرة (DiscordAPIError 10062, 40060)
    if (err && (err.code === 10062 || err.code === 40060)) return;

    const errorChannelId = readErrorChannelId();
    if (!errorChannelId) return;

    try {
        const channel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (!channel) return;

        const errMsg = (err.message || 'خطأ غير معروف').slice(0, 1000);
        // المكدس كاملاً (أول 12 سطراً) — الموقع الدقيق للخطأ
        const stackPreview = (err.stack || errMsg).split('\n').slice(0, 12).join('\n').slice(0, 1000);

        const embed = new EmbedBuilder()
            .setTitle(`🚨 خطأ: ${type}`)
            .setColor(0xe74c3c)
            .setDescription(`🆔 **${id || '?'}** | 🕐 <t:${Math.floor(Date.now() / 1000)}:F>`)
            .addFields(
                { name: '📝 رسالة الخطأ', value: errMsg || 'بدون رسالة', inline: false },
                { name: '📍 مكان الخطأ (Stack)', value: stackPreview || 'بدون مكدس', inline: false }
            )
            .setTimestamp();

        await channel.send({ content: `<@${DEV_ID}>`, embeds: [embed] });
    } catch (e) {
        console.error('❌ فشل إرسال الخطأ إلى الروم:', e.message);
    }
}

/**
 * تسجيل خطأ: ملف محلي + إرسال لروم الأخطاء (يستخدم الـ client المرتبط)
 */
function logError(type, id, err) {
    // تجاهل أخطاء التوقيت العابرة
    if (err && (err.code === 10062 || err.code === 40060)) return;
    try {
        const entry = {
            ts: Date.now(),
            type,
            id,
            msg: err.message || 'خطأ غير معروف',
            stack: (err.stack || '').split('\n').slice(0, 5).join('\n'),
        };
        let log = [];
        try {
            if (fs.existsSync(ERROR_LOG_PATH)) {
                log = JSON.parse(fs.readFileSync(ERROR_LOG_PATH, 'utf8'));
                if (!Array.isArray(log)) log = [];
            }
        } catch {
            log = [];
        }
        log.unshift(entry);
        if (log.length > MAX_LOG) log = log.slice(0, MAX_LOG);
        fs.writeFileSync(ERROR_LOG_PATH, JSON.stringify(log, null, 2), 'utf8');

        const client = clientRef;
        if (client && client.isReady()) {
            sendErrorToChannel(client, type, id, err);
        }
    } catch {
        /* تجاهل أي فشل في التسجيل نفسه */
    }
}

/**
 * غلاف آمن لا يرمي أبداً — للاستدعاء من معالجات التذاكر والداخلية
 * @param {String} type - نوع الخطأ (مثلاً TICKET_BUTTON / TICKET_CREATE)
 * @param {String} id - معرف مصدر الخطأ
 * @param {Error|any} err
 */
function reportError(type, id, err) {
    try {
        const normalized = err instanceof Error ? err : new Error(String(err || 'خطأ غير معروف'));
        logError(type, id, normalized);
    } catch {
        /* تجاهل */
    }
}

module.exports = { setErrorClient, logError, reportError, sendErrorToChannel };

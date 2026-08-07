const { PermissionFlagsBits } = require('discord.js');
const { reportError } = require('./errorLogger');

function hasRole(member, roleId) {
  return Boolean(roleId) && member.roles.cache.has(roleId);
}

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function setFieldValue(embedBuilder, fieldName, newValue) {
  const field = embedBuilder.data.fields?.find(f => f.name === fieldName);
  if (field) field.value = newValue;
  return embedBuilder;
}

// يولّد معرّف قصير (أحرف وأرقام فقط، بدون شرطة سفلية) ليُستخدم داخل customId الأزرار
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// إرسال إيمباد (أو أكثر) إلى روم لوق معيّن، بدون تعطيل باقي البوت إذا فشل الإرسال
async function sendLog(guild, channelId, payload) {
  if (!channelId) return;
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    await channel.send(payload);
  } catch (e) {
    console.error('فشل إرسال سجل اللوق:', e);
    reportError('LOG_SEND', 'send-log', e);
  }
}

module.exports = { hasRole, isAdmin, setFieldValue, generateId, sendLog };

// ================== 🔒 جلب الأعضاء/الرولات بأمان (منع تحديد Gateway opcode 8) ==================
// جلب كل الأعضاء عبر Gateway (opcode 8) له حصة محدودة جداً — التكرار مع كل
// عرض لوحة كان يسبب GatewayRateLimitError (Retry after Xs). الحل:
//   - لا نجلب إلا إذا كانت الكاش ناقصة فعلاً (cache.size < memberCount)
//   - لا نجلب أكثر من مرة كل دقيقة لكل سيرفر
//   - عند تحديد Gateway: نكمل بالكاش الحالي دون إزعاج روم الأخطاء
const fetchThrottle = new Map(); // 'members:<guildId>' | 'roles:<guildId>' → آخر جلب
const FETCH_THROTTLE_MS = 60 * 1000;

/** جلب كل أعضاء السيرفر (مرة واحدة بأمان — يعتمد الكاش عند اكتماله) */
async function ensureGuildMembers(guild) {
  if (!guild || !guild.id) return;
  const cacheSize = guild.members?.cache?.size || 0;
  if (cacheSize >= (guild.memberCount || 0)) return; // الكاش مكتمل فعلاً
  const key = `members:${guild.id}`;
  const last = fetchThrottle.get(key) || 0;
  const now = Date.now();
  if (now - last < FETCH_THROTTLE_MS) return; // جلبنا منذ أقل من دقيقة
  fetchThrottle.set(key, now);
  try {
    await guild.members.fetch();
  } catch (e) {
    // تحديد مؤقت من Gateway (متوقع) — نكمل بالكاش الحالي دون إزعاج روم الأخطاء
    if (e && (e.name === 'GatewayRateLimitError' || e.code === 4008)) {
      console.warn(`⚠️ GatewayRateLimit (جلب الأعضاء) — نكمل بالكاش الحالي. أعد المحاولة بعد ${Math.ceil((e.retryAfter || 0) / 1000)} ثانية`);
      return;
    }
    console.error('❌ ensureGuildMembers:', e.message);
    reportError('MEMBER_FETCH', guild.id, e);
  }
}

/** جلب رولات السيرفر (REST — بحد أدنى لمنع التكرار العبثي) */
async function ensureGuildRoles(guild) {
  if (!guild || !guild.id) return;
  const key = `roles:${guild.id}`;
  const last = fetchThrottle.get(key) || 0;
  const now = Date.now();
  if (now - last < FETCH_THROTTLE_MS) return;
  fetchThrottle.set(key, now);
  try {
    await guild.roles.fetch();
  } catch (e) {
    console.error('❌ ensureGuildRoles:', e.message);
    reportError('MEMBER_FETCH', `roles:${guild.id}`, e);
  }
}

module.exports = { hasRole, isAdmin, setFieldValue, generateId, sendLog, ensureGuildMembers, ensureGuildRoles };

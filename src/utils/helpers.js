const { PermissionFlagsBits } = require('discord.js');

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
  }
}

module.exports = { hasRole, isAdmin, setFieldValue, generateId, sendLog };

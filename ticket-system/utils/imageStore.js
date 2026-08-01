/**
 * =========================================================
 *  utils/imageStore.js
 * =========================================================
 * تخزين الصور المرفوعة من الإداري بشكل دائم:
 *
 * الفكرة: عندما يرفع الإداري صورة عبر أمر /رفع-صورة، لا نعتمد
 * على رابط المرفق الأصلي (قد يُحذف)، بل **يعيد البوت رفعها**
 * في روم سري خاص اسمه "🖼️-بنك-الصور" (لا يراه @everyone).
 * رابط الصورة الناتج ملك للبوت ويبقى سليماً دائماً، ثم نحفظه
 * في قاعدة بيانات البنل.
 *
 * إذا فشل إنشاء الروم أو الإرسال (صلاحيات مثلاً) نعود للرابط
 * الأصلي كحل احتياطي.
 * =========================================================
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');

const BANK_NAME = '🖼️-بنك-الصور';

/**
 * البحث عن روم بنك الصور أو إنشاؤه (مرة واحدة لكل سيرفر)
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function findOrCreateBank(guild) {
    // بحث في الكاش أولاً
    const existing = guild.channels.cache.find(
        c => c.name === BANK_NAME && c.type === ChannelType.GuildText
    );
    if (existing) return existing;

    // إن لم يوجد ننشئ روم سري (لا يراه @everyone)
    try {
        return await guild.channels.create({
            name: BANK_NAME,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
            ],
        });
    } catch (err) {
        console.error('[imageStore] فشل إنشاء روم بنك الصور:', err.message);
        return null;
    }
}

/**
 * تخزين صورة بشكل دائم عبر إعادة رفعها في روم بنك الصور.
 * المحتوى (content) = اسم الصورة في المكتبة — يُستخدم لاحقاً
 * لإعادة بناء المكتبة من رسائل البنك عند إقلاع البوت.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Attachment} attachment - مرفق الصورة من الأمر
 * @param {String} [content] - اسم الصورة (يُكتب كمحتوى الرسالة)
 * @returns {Promise<String>} رابط الصورة الدائم
 */
async function storeImageInBank(guild, attachment, content = '') {
    try {
        const bank = await findOrCreateBank(guild);
        if (!bank) return attachment.url; // احتياط: الرابط الأصلي

        const msg = await bank.send({
            content,
            files: [
                {
                    attachment: attachment.url,
                    name: attachment.name || `image-${Date.now()}.png`,
                },
            ],
        });

        const saved = msg.attachments.first();
        return saved ? saved.url : attachment.url;
    } catch (err) {
        console.error('[imageStore] فشل تخزين الصورة:', err.message);
        return attachment.url; // احتياط: الرابط الأصلي
    }
}

module.exports = { storeImageInBank, findOrCreateBank, BANK_NAME };

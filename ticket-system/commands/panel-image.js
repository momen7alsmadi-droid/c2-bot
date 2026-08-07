/**
 * =========================================================
 *  commands/panel-image.js
 * =========================================================
 * أمر /رفع-صورة — رفع صورة إلى "مكتبة الصور" المسمّاة:
 *
 *   /رفع-صورة الاسم: <اسم الصورة> الصورة: <ملف>
 *
 * (لا حاجة لتحديد بنل معيّن وقت الرفع)
 *
 * الميكانيكة:
 *   1) نستلم الملف المرفوع من ديسكورد (Attachment)
 *   2) نتحقق أنه صورة فعلية
 *   3) نعيد رفعه من البوت في روم سري "بنك الصور" (utils/imageStore)
 *      حتى يكون الرابط دائماً وملكاً للبوت، مع كتابة اسم الصورة
 *      كمحتوى الرسالة (لإعادة بناء المكتبة عند الإقلاع)
 *   4) نحفظ { الاسم -> الرابط } في مكتبة الصور (utils/imageLibrary)
 *   5) يعرض معاينة حية للمستخدم (إخفائي)
 *
 * لاحقاً: من إعدادات أي بنل ← "الرسائل" ← "🖼️ مكتبة الصور"
 * يختار الإداري اسم الصورة ليُطبَّق على البنل العام أو إيمبد التكت.
 * =========================================================
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { storeImageInBank } = require('../utils/imageStore');
const { addImage } = require('../utils/imageLibrary');
const { reportError } = require('../../src/utils/errorLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('رفع-صورة')
        .setDescription('رفع صورة إلى مكتبة الصور (بدون تحديد بنل) ثم اخترها من إعدادات البنل')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(o =>
            o
                .setName('الاسم')
                .setDescription('اسم الصورة — ستختارها بهذا الاسم من إعدادات البنل')
                .setRequired(true)
                .setMaxLength(80)
        )
        .addAttachmentOption(o =>
            o.setName('الصورة').setDescription('الصورة التي تريد رفعها').setRequired(true)
        ),

    async execute(interaction) {
        const name = interaction.options.getString('الاسم').trim();
        const attachment = interaction.options.getAttachment('الصورة');

        // التحقق من أن الملف صورة فعلاً
        if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
            await interaction.reply({
                content: '❌ الملف المرفوع ليس صورة. ارفع صورة بصيغة PNG أو JPG أو GIF أو WEBP.',
                ephemeral: true,
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // تخزين دائم: إعادة رفع الصورة من البوت في روم بنك الصور السري
            // مع كتابة اسم الصورة كمحتوى الرسالة (لإعادة البناء عند الإقلاع)
            const savedUrl = await storeImageInBank(interaction.guild, attachment, name);

            // حفظها في مكتبة الصور المسمّاة (تستبدل القديمة بنفس الاسم إن وُجدت)
            const overwritten = !!require('../utils/imageLibrary').getImageUrl(name);
            addImage(name, savedUrl, interaction.user.id);

            // معاينة حية
            const { EmbedBuilder } = require('discord.js');
            const preview = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setTitle(`${overwritten ? '🔄' : '✅'} تم حفظ الصورة في المكتبة`)
                .setDescription(
                    `**الاسم:** \`${name}\`\n` +
                    `**الحالة:** ${overwritten ? 'استُبدلت صورة قديمة بنفس الاسم' : 'أُضيفت كصورة جديدة'}\n\n` +
                    `📌 الآن افتح إعدادات أي بنل ← **الرسائل** ← **🖼️ مكتبة الصور** واختر \`${name}\``
                )
                .setImage(savedUrl)
                .setTimestamp();

            await interaction.editReply({
                embeds: [preview],
            });
        } catch (error) {
            console.error('[panel-image] حدث خطأ أثناء رفع الصورة:', error);
            reportError('PANEL_IMAGE', 'upload', error);
            await interaction.editReply({
                content: `❌ حدث خطأ أثناء رفع الصورة: \`${error.message}\``,
            });
        }
    },
};

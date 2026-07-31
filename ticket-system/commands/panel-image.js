/**
 * =========================================================
 *  commands/panel-image.js
 * =========================================================
 * أمر /رفع-صورة — رفع صورة مباشرة (اختيار ملف) بدون أي روابط:
 *
 *   /رفع-صورة البنل: <اسم البنل> النوع: <إيمبد التكت | البنل العام> الصورة: <ملف>
 *
 * الميكانيكة:
 *   1) نستلم الملف المرفوع من ديسكورد (Attachment)
 *   2) نتحقق أنه صورة فعلية
 *   3) نعيد رفعه من البوت في روم سري "بنك الصور" (utils/imageStore)
 *      حتى يكون الرابط دائماً وملكاً للبوت لا يعتمد على رسالة العضو
 *   4) نحفظ الرابط في panel.panelMessage.image أو panel.ticketEmbed.image
 *   5) نعرض معاينة حية للمستخدم (إخفائي)
 *
 * قائمة البنل تدعم الـ Autocomplete (اكتب جزءاً من الاسم وستظهر
 * الاقتراحات) — انظر handlers/panelImageAutocomplete.js
 * =========================================================
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getPanelByName, updatePanel } = require('../database/panelsDB');
const { storeImageInBank } = require('../utils/imageStore');
const { buildPublicPanelMessage } = require('../handlers/publicPanelBuilder');
const { buildTicketEmbed } = require('../handlers/ticketEmbedBuilder');
const { safeEmoji } = require('../utils/emoji');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('رفع-صورة')
        .setDescription('رفع صورة لإيمبد التكت أو البنل العام مباشرة (بدون روابط)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(o =>
            o
                .setName('البنل')
                .setDescription('اختر البنل الذي تريد رفع الصورة له')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(o =>
            o
                .setName('النوع')
                .setDescription('أين تُحفظ الصورة؟')
                .setRequired(true)
                .addChoices(
                    { name: '🖼️ إيمبد التكت (فوق الأزرار داخل التكت)', value: 'ticket' },
                    { name: '📤 البنل العام (إيمبد فتح التكت)', value: 'panel' }
                )
        )
        .addAttachmentOption(o =>
            o.setName('الصورة').setDescription('الصورة التي تريد رفعها').setRequired(true)
        ),

    async execute(interaction) {
        const panelName = interaction.options.getString('البنل').trim();
        const type = interaction.options.getString('النوع'); // 'ticket' | 'panel'
        const attachment = interaction.options.getAttachment('الصورة');

        // التحقق من وجود البنل
        const panel = getPanelByName(panelName);
        if (!panel) {
            await interaction.reply({
                content: `⚠️ لم يتم العثور على بنل باسم **${panelName}**. تأكد من الاسم من قائمة الاقتراحات.`,
                ephemeral: true,
            });
            return;
        }

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
            const savedUrl = await storeImageInBank(interaction.guild, attachment);

            // حفظ الرابط في المكان المطلوب (دون المساس بباقي الحقول)
            const fresh = getPanelByName(panelName);
            if (type === 'ticket') {
                const current = fresh.ticketEmbed || {};
                updatePanel(panelName, { ticketEmbed: { ...current, image: savedUrl } });
            } else {
                const current = fresh.panelMessage || {};
                updatePanel(panelName, { panelMessage: { ...current, image: savedUrl } });
            }

            // معاينة حية للنتيجة
            const updated = getPanelByName(panelName);
            const preview =
                type === 'ticket'
                    ? buildTicketEmbed(updated)
                    : buildPublicPanelMessage(updated).embeds[0];

            await interaction.editReply({
                content: `✅ تم رفع الصورة وحفظها في **${type === 'ticket' ? '🖼️ إيمبد التكت' : '📤 البنل العام'}** للبنل **${safeEmoji(panel.emoji)} ${panel.name}**.`,
                embeds: [preview],
            });
        } catch (error) {
            console.error('[panel-image] حدث خطأ أثناء رفع الصورة:', error);
            await interaction.editReply({
                content: `❌ حدث خطأ أثناء رفع الصورة: \`${error.message}\``,
            });
        }
    },
};

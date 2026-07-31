/**
 * =========================================================
 *  commands/ticket-setup.js
 * =========================================================
 * أمر Slash Command لإرسال "لوحة تحكم نظام التذاكر" لأول مرة.
 *
 * ملاحظة مهمة عن الميكانيكية:
 * هذا هو المكان الوحيد الذي نستخدم فيه interaction.reply()
 * لإرسال اللوحة كـ "رسالة جديدة". بعد هذه اللحظة، أي تنقل
 * بين قوائم اللوحة (أزرار/قوائم منسدلة) يجب أن يتم فقط عبر
 * interaction.update() على نفس الرسالة، ولا يُسمح بإرسال
 * رسائل جديدة إطلاقاً (Single Static Message).
 * =========================================================
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildMainDashboard } = require('../handlers/dashboardBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket-setup')
        .setDescription('فتح لوحة تحكم نظام التذاكر (للإدارة فقط)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        // بناء الواجهة الرئيسية عبر الملف المشترك
        const { embeds, components } = buildMainDashboard();

        // إرسال أولي فقط -> هذه هي الرسالة الثابتة التي سيتم
        // التعديل عليها لاحقاً عبر update() في كل الملفات الأخرى
        // لوحة تحكم خاصة بالإداري فقط: كل الأزرار والقوائم واللوحات
        // الفرعية مخفية تماماً عن باقي الأعضاء (ephemeral)
        await interaction.reply({
            embeds,
            components,
            ephemeral: true,
        });
    },
};

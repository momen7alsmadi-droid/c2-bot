/**
 * =========================================================
 *  handlers/ticketControlBuilder.js
 * =========================================================
 * بناء مكونات التحكم الأساسية التي تظهر في الرسالة الافتتاحية
 * لأي تذكرة: صف الأزرار (استلام/قفل) وقائمة تحكم الستاف.
 *
 * يُعاد استخدام هذه الدالة في كل مرة تتغير فيها حالة التذكرة
 * (استلام/إلغاء استلام/قفل/فتح) لتحديث الأزرار عبر update().
 * =========================================================
 */

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');

/**
 * @param {Object} session - جلسة التذكرة من ticketStore
 * @param {Boolean} locked - هل التذكرة مقفلة حالياً
 * @returns {ActionRowBuilder[]}
 */
function buildTicketControlRows(session, locked = false) {
    const claimButton = new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel(session.claimedBy ? 'إلغاء الاستلام' : 'استلام')
        .setEmoji(session.claimedBy ? '🙅' : '🙋')
        .setStyle(session.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(locked);

    const lockButton = new ButtonBuilder()
        .setCustomId('ticket_lock')
        .setLabel(locked ? 'فتح' : 'قفل')
        .setEmoji(locked ? '🔓' : '🔒')
        .setStyle(locked ? ButtonStyle.Success : ButtonStyle.Danger);

    const row1 = new ActionRowBuilder().addComponents(claimButton, lockButton);

    const staffMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_staff_menu')
        .setPlaceholder(
            session.claimedBy ? 'قائمة تحكم الستاف...' : 'يجب استلام التذكرة أولاً لاستخدام هذه القائمة'
        )
        .setDisabled(!session.claimedBy || locked)
        .addOptions(
            { label: 'تغيير اسم التكت', value: 'rename', emoji: '✏️' },
            { label: 'تفعيل إرسال الصور/الملفات', value: 'enable_attachments', emoji: '🖼️' },
            { label: 'إلغاء إرسال الصور/الملفات', value: 'disable_attachments', emoji: '🚫' },
            { label: 'إدخال عضو للتكت', value: 'add_member', emoji: '➕' },
            { label: 'إخراج عضو من التكت', value: 'remove_member', emoji: '➖' },
            { label: 'تحويل ملكية الاستلام', value: 'transfer', emoji: '🔄' },
            { label: 'التحويل للإدارة العليا', value: 'escalate', emoji: '📢' }
        );

    const row2 = new ActionRowBuilder().addComponents(staffMenu);

    // زر شكلي (منظر فقط): "إعادة تعيين القائمة" — يعيد بناء الأزرار
    // من الحالة الحالية للجلسة دون تغيير أي شيء (لا يفعل شيئاً فعلياً)
    const reloadRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_reload_menu')
            .setLabel('🔄 إعادة تعيين القائمة')
            .setStyle(ButtonStyle.Secondary)
    );

    return [row1, row2, reloadRow];
}

module.exports = { buildTicketControlRows };

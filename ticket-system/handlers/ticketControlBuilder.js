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
const { getPanelByName } = require('../database/panelsDB');
const { appendDecorativeOption } = require('../../src/utils/decorativeReset');

/**
 * بناء صف أزرار الرتب المخصصة (من إعدادات البنل):
 * كل زر مفعّل يظهر كزر واحد في صف مستقل يقع فوق القائمة المنسدلة
 * (تحت صف الاستلام/القفل وفوق قائمة الستاف). الزر المطفأ = مخفي.
 * @param {Object} session - جلسة التذكرة
 * @returns {ActionRowBuilder[]}
 */
function buildCustomRoleButtonRows(session) {
    const panel = session && session.panelName ? getPanelByName(session.panelName) : null;
    const buttons = (panel && Array.isArray(panel.customRoleButtons))
        ? panel.customRoleButtons.filter(b => b && b.enabled !== false)
        : [];

    if (buttons.length === 0) return [];

    // حد ديسكورد: 5 صفوف كحد أقصى للرسالة (صف الاستلام/القفل + صف
    // القائمة المنسدلة = صفان)، لذلك نعرض 3 أزرار كحد أقصى
    // (اللون المخصص من باقة /الألوان_المتوفرة يظهر في إيمبد الاختيار
    //  داخل التكت — ديسكورد لا يدعم ألوان Hex على الأزرار نفسها)
    const visible = buttons.slice(0, 3);

    const rows = [];
    for (let i = 0; i < visible.length; i += 1) {
        const b = visible[i];
        rows.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_role_btn:${b.id}`)
                    .setLabel(String(b.label || '🎖️ رتبة').slice(0, 80))
                    .setStyle(ButtonStyle.Primary)
            )
        );
    }
    return rows;
}

/**
 * @param {Object} session - جلسة التذكرة من ticketStore
 * @param {Boolean} locked - هل التذكرة مقفلة حالياً
 * @returns {ActionRowBuilder[]}
 */
function buildTicketControlRows(session, locked = false) {
    // لون زر الاستلام قابل للتخصيص من إعدادات البنل (claimButtonColor)
    const panel = session && session.panelName ? getPanelByName(session.panelName) : null;
    const CLAIM_COLORS = {
        success: ButtonStyle.Success,
        primary: ButtonStyle.Primary,
        danger: ButtonStyle.Danger,
        secondary: ButtonStyle.Secondary,
    };
    const claimColor = (panel && CLAIM_COLORS[panel.claimButtonColor]) || ButtonStyle.Success;

    const claimButton = new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel(session.claimedBy ? 'إلغاء الاستلام' : 'استلام')
        .setEmoji(session.claimedBy ? '🙅' : '🙋')
        .setStyle(session.claimedBy ? ButtonStyle.Secondary : claimColor)
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
            session.claimedBy
                ? 'قائمة تحكم الستاف...'
                : 'قائمة تحكم الستاف — الإدارة العليا بدون استلام'
        )
        // القائمة ظاهرة/مفعّلة دائماً (ما لم تكن التذكرة مقفلة) حتى يتمكن
        // الستاف من استلامها والإدارة العليا من استخدامها دون استلام،
        // والتحقق النهائي من الصلاحية يتم في ticketStaffMenuHandler.
        .setDisabled(locked)
        .addOptions(
            { label: 'تغيير اسم التكت', value: 'rename', emoji: '✏️' },
            { label: 'تفعيل إرسال الصور/الملفات', value: 'enable_attachments', emoji: '🖼️' },
            { label: 'إلغاء إرسال الصور/الملفات', value: 'disable_attachments', emoji: '🚫' },
            { label: 'إدخال عضو للتكت', value: 'add_member', emoji: '➕' },
            { label: 'إخراج عضو من التكت', value: 'remove_member', emoji: '➖' },
            { label: 'تحويل ملكية الاستلام', value: 'transfer', emoji: '🔄' },
            { label: 'التحويل للإدارة العليا', value: 'escalate', emoji: '📢' },
            { label: 'إعادة تعيين القائمة', value: 'reload_menu', emoji: '♻️' } // شكلي فقط، آخر خيار
        );

    const row2 = new ActionRowBuilder().addComponents(staffMenu);

    // أزرار الرتب المخصصة تظهر فوق القائمة المنسدلة مباشرة
    const customRows = buildCustomRoleButtonRows(session);

    const rows = [row1, ...customRows, row2];

    // الزر الشكلي "🔄 إعادة تعيين" أسفل القائمة المنسدلة (قائمة الستاف)
    return appendDecorativeOption(rows);
}

module.exports = { buildTicketControlRows };

/**
 * =========================================================
 *  handlers/dashboardBuilder.js
 * =========================================================
 * ملف مشترك (Shared Utility) مسؤول فقط عن "بناء" الإيمبدات
 * والأزرار والقوائم، بدون أي منطق تفاعل (Interaction Logic).
 *
 * السبب في فصله عن الأمر والـ Handlers:
 * لأن نفس "الواجهة الرئيسية" تُستدعى من مكانين:
 *   1. عند تشغيل الأمر لأول مرة (/ticket-setup) -> Reply
 *   2. عند الضغط على زر [رجوع] -> Update
 * فبدل تكرار كود بناء الإيمبد مرتين، نضعه هنا مرة واحدة.
 *
 * 🎨 تم توحيد التصميم مع باقي لوحات البوت (لوحة الإيمبد):
 *    - اللون الرئيسي: أزرق Discord 0x5865F2
 *    - صف الأزرار: إنشاء (Success) + عرض/تعديل/إرسال (Primary) + حذف (Danger)
 *    - الإيموجي داخل نص الزر (وليس كـ emoji منفصل)
 *    - الفوتر يعرض الإصدار مثل باقي اللوحات
 * =========================================================
 */

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');

const { getAllPanels } = require('../database/panelsDB');
const { safeEmoji } = require('../utils/emoji');
const { version } = require('../../package.json');

// ألوان موحدة مع باقي لوحات البوت (نفس لوحة الإيمبد)
const COLORS = {
    main: 0x5865f2,   // أزرق Discord
    sub: 0x2b2d31,    // رمادي داكن للوحات الفرعية
};

/**
 * بناء "الواجهة الرئيسية" للوحة التحكم - بنفس شكل لوحة الإيمبد
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildMainDashboard() {
    const embed = new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle('🎫 لوحة تحكم نظام التذاكر')
        .setDescription('🔒 هذه اللوحة خاصة بك أنت فقط — لا يراها أحد غيرك.\n\nاختر أحد الخيارات أدناه:')
        .setFooter({ text: `الإصدار: ${version}` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_add')
            .setLabel('➕ إضافة تكت')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('ticket_edit')
            .setLabel('✏️ تعديل تكت')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_log')
            .setLabel('📜 سجل التكتات')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_delete')
            .setLabel('🗑️ حذف تكت')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('ticket_send')
            .setLabel('📤 إرسال تكت')
            .setStyle(ButtonStyle.Primary),
    );

    return { embeds: [embed], components: [row] };
}

/**
 * بناء "اللوحة الفرعية" (Sub-panel) لأي من: تعديل / سجل / حذف / إرسال
 * بنفس شكل لوحات الإيمبد: رسالة نصية + قائمة منسدلة + زر رجوع
 *
 * @param {'edit'|'log'|'delete'|'send'} type - نوع اللوحة الفرعية
 * @returns {{ content: String, embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildSubPanel(type) {
    const content = {
        edit: '✏️ اختر التكت الذي تريد تعديله:',
        log: '📜 اختر التكت الذي تريد عرض سجله:',
        delete: '🗑️ اختر التكت الذي تريد حذفه:',
        send: '📤 اختر التكت الذي تريد إرساله:',
    };

    // جلب اللوحات المحفوظة من قاعدة البيانات
    const panels = getAllPanels();

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ticket_select_${type}`)
        .setPlaceholder('🎫 اختر تكت...');

    // قائمة "إرسال" تسمح باختيار **عدة بنلات** دفعة واحدة لنشرها كباقة
    // (الباقي: تعديل/سجل/حذف) يبقى باختيار واحد
    if (type === 'send' && panels.length > 1) {
        selectMenu.setMinValues(1).setMaxValues(Math.min(panels.length, 25));
        selectMenu.setPlaceholder('🎫 اختر بنلاً واحداً أو أكثر (باقة) لنشرها معاً...');
    }

    if (panels.length === 0) {
        // ⚠️ ديسكورد يرفض القوائم المنسدلة الفارغة تماماً (تسبب خطأ عند الإرسال)
        // لذلك نضع خياراً وهمياً واحداً عند عدم وجود أي لوحات محفوظة
        selectMenu.addOptions({
            label: 'لا يوجد أي تكت حالياً',
            value: 'none',
            emoji: '❌',
        });
        selectMenu.setDisabled(true); // تعطيل القائمة لأنه لا يوجد ما يُختار
    } else {
        selectMenu.addOptions(
            panels
                .slice(0, 25) // حد ديسكورد: 25 خيار كحد أقصى للقائمة الواحدة
                .map(panel => ({
                    label: panel.name.slice(0, 100),
                    description: (panel.description ? String(panel.description).slice(0, 100) : undefined) || 'لا يوجد وصف',
                    value: panel.name.slice(0, 100),
                    emoji: safeEmoji(panel.emoji),
                }))
        );
    }

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_back')
            .setLabel('🔙 رجوع')
            .setStyle(ButtonStyle.Secondary)
    );

    return {
        content: content[type],
        embeds: [],
        components: [selectRow, backRow],
    };
}

module.exports = {
    buildMainDashboard,
    buildSubPanel,
};

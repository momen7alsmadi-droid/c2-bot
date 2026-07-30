/**
 * =========================================================
 *  dashboardBuilder.js
 * =========================================================
 * ملف مشترك (Shared Utility) مسؤول فقط عن "بناء" الإيمبدات
 * والأزرار والقوائم، بدون أي منطق تفاعل (Interaction Logic).
 *
 * السبب في فصله عن الأمر والـ Handlers:
 * لأن نفس "الواجهة الرئيسية" تُستدعى من مكانين:
 *   1. عند تشغيل الأمر لأول مرة (/ticket-setup) -> Reply
 *   2. عند الضغط على زر [رجوع] -> Update
 * فبدل تكرار كود بناء الإيمبد مرتين، نضعه هنا مرة واحدة.
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

// ألوان موحدة للوحة حتى تبقى الهوية البصرية ثابتة
const COLORS = {
    main: 0x5865f2,   // أزرق Discord
    sub: 0x2b2d31,    // رمادي داكن للوحات الفرعية
};

/**
 * بناء "الواجهة الرئيسية" للوحة التحكم
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildMainDashboard() {
    const embed = new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle('🎫 لوحة تحكم نظام التذاكر')
        .setDescription(
            'مرحباً بك في لوحة إدارة نظام التذاكر.\n' +
            'الرجاء اختيار أحد الخيارات أدناه لإدارة النظام:'
        )
        .setFooter({ text: 'نظام التذاكر - لوحة الإدارة' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_add')
            .setLabel('إضافة تكت')
            .setStyle(ButtonStyle.Success)
            .setEmoji('➕'),
        new ButtonBuilder()
            .setCustomId('ticket_edit')
            .setLabel('تعديل تكت')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('✏️'),
        new ButtonBuilder()
            .setCustomId('ticket_log')
            .setLabel('سجل')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📜'),
        new ButtonBuilder()
            .setCustomId('ticket_delete')
            .setLabel('حذف')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
        new ButtonBuilder()
            .setCustomId('ticket_send')
            .setLabel('إرسال')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📤'),
    );

    return { embeds: [embed], components: [row] };
}

/**
 * بناء "اللوحة الفرعية" (Sub-panel) لأي من: تعديل / سجل / حذف / إرسال
 * جميعها تشترك بنفس الهيكل: إيمبد + قائمة منسدلة بأسماء اللوحات + زر رجوع
 *
 * @param {'edit'|'log'|'delete'|'send'} type - نوع اللوحة الفرعية
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildSubPanel(type) {
    const titles = {
        edit: '✏️ تعديل التذاكر',
        log: '📜 سجل التذاكر',
        delete: '🗑️ حذف التذاكر',
        send: '📤 إرسال لوحة التذاكر',
    };

    const descriptions = {
        edit: 'اختر لوحة التذاكر التي تريد تعديل إعداداتها من القائمة أدناه.',
        log: 'اختر لوحة التذاكر التي تريد عرض سجل التذاكر الخاص بها.',
        delete: 'اختر لوحة التذاكر التي تريد حذفها نهائياً.',
        send: 'اختر لوحة التذاكر التي تريد إرسالها في روم معيّن.',
    };

    const embed = new EmbedBuilder()
        .setColor(COLORS.sub)
        .setTitle(titles[type])
        .setDescription(descriptions[type])
        .setFooter({ text: 'اضغط على زر رجوع للعودة للوحة الرئيسية' });

    // جلب اللوحات المحفوظة من قاعدة البيانات
    const panels = getAllPanels();

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ticket_select_${type}`)
        .setPlaceholder('اختر لوحة تذاكر...');

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
            panels.map(panel => ({
                label: panel.name,
                description: panel.description?.slice(0, 100) || 'لا يوجد وصف',
                value: panel.name,
                emoji: panel.emoji || '🎫',
            }))
        );
    }

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_back')
            .setLabel('رجوع')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔙')
    );

    return { embeds: [embed], components: [selectRow, backRow] };
}

module.exports = {
    buildMainDashboard,
    buildSubPanel,
};

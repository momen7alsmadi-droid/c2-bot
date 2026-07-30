/**
 * =========================================================
 *  handlers/modalsBuilder.js
 * =========================================================
 * بناء كل نوافذ الـ Modals الخاصة بالجزء الثاني، معزولة هنا
 * لتسهيل التعديل عليها لاحقاً دون العبث بمنطق المعالجة.
 * =========================================================
 */

const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} = require('discord.js');

/**
 * Modal إنشاء بنل جديد (يُفتح عند الضغط على زر "إضافة تكت")
 */
function buildCreatePanelModal() {
    const modal = new ModalBuilder()
        .setCustomId('modal_create_panel')
        .setTitle('إنشاء بنل تذاكر جديد');

    const nameInput = new TextInputBuilder()
        .setCustomId('panel_name')
        .setLabel('اسم البنل')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('مثال: الدعم الفني')
        .setMaxLength(45)
        .setRequired(true);

    const descInput = new TextInputBuilder()
        .setCustomId('panel_description')
        .setLabel('وصف البنل')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('وصف مختصر يظهر للأعضاء عند فتح التكت')
        .setMaxLength(300)
        .setRequired(false);

    const emojiInput = new TextInputBuilder()
        .setCustomId('panel_emoji')
        .setLabel('إيموجي البنل')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('🎫')
        .setMaxLength(10)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(emojiInput)
    );

    return modal;
}

/**
 * Modal تعديل الاسم/الوصف/الإيموجي لبنل موجود
 * يتم تعبئة القيم الحالية مسبقاً عبر setValue حتى يرى الإداري ما هو محفوظ الآن
 * @param {Object} panel
 */
function buildEditNameDescModal(panel) {
    const modal = new ModalBuilder()
        .setCustomId('modal_edit_name_desc')
        .setTitle(`تعديل: ${panel.name}`);

    const nameInput = new TextInputBuilder()
        .setCustomId('panel_name')
        .setLabel('اسم البنل')
        .setStyle(TextInputStyle.Short)
        .setValue(panel.name)
        .setMaxLength(45)
        .setRequired(true);

    const descInput = new TextInputBuilder()
        .setCustomId('panel_description')
        .setLabel('وصف البنل')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(panel.description || '')
        .setMaxLength(300)
        .setRequired(false);

    const emojiInput = new TextInputBuilder()
        .setCustomId('panel_emoji')
        .setLabel('إيموجي البنل')
        .setStyle(TextInputStyle.Short)
        .setValue(panel.emoji || '')
        .setMaxLength(10)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(emojiInput)
    );

    return modal;
}

/**
 * Modal تخصيص رسالة الترحيب داخل التكت
 * @param {Object} panel
 */
function buildWelcomeMessageModal(panel) {
    const modal = new ModalBuilder()
        .setCustomId('modal_welcome_message')
        .setTitle('تخصيص رسالة الترحيب');

    const messageInput = new TextInputBuilder()
        .setCustomId('welcome_message')
        .setLabel('نص الرسالة')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('مثال: مرحباً [user]، شكراً لتواصلك مع [server]. سيتم الرد عليك قريباً.')
        .setValue(panel.welcomeMessage || '')
        .setMaxLength(1000)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(messageInput));

    return modal;
}

/**
 * Modal تغيير اسم التذكرة (من قائمة تحكم الستاف داخل التكت)
 * @param {String} currentName
 */
function buildRenameTicketModal(currentName) {
    const modal = new ModalBuilder()
        .setCustomId('modal_rename_ticket')
        .setTitle('تغيير اسم التذكرة');

    const nameInput = new TextInputBuilder()
        .setCustomId('new_ticket_name')
        .setLabel('الاسم الجديد للروم')
        .setStyle(TextInputStyle.Short)
        .setValue(currentName)
        .setMaxLength(90)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    return modal;
}

module.exports = {
    buildCreatePanelModal,
    buildEditNameDescModal,
    buildWelcomeMessageModal,
    buildRenameTicketModal,
};

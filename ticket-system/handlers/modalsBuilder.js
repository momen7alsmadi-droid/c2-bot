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
        .setTitle('➕ إنشاء تكت جديد');

    const nameInput = new TextInputBuilder()
        .setCustomId('panel_name')
        .setLabel('اسم التكت')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('مثال: الدعم الفني')
        .setMaxLength(45)
        .setRequired(true);

    const descInput = new TextInputBuilder()
        .setCustomId('panel_description')
        .setLabel('وصف التكت')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('وصف مختصر يظهر للأعضاء عند فتح التكت')
        .setMaxLength(300)
        .setRequired(false);

    const emojiInput = new TextInputBuilder()
        .setCustomId('panel_emoji')
        .setLabel('إيموجي التكت')
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
        .setTitle('📝 تعديل التكت');

    const nameInput = new TextInputBuilder()
        .setCustomId('panel_name')
        .setLabel('اسم التكت')
        .setStyle(TextInputStyle.Short)
        .setValue(panel.name)
        .setMaxLength(45)
        .setRequired(true);

    const descInput = new TextInputBuilder()
        .setCustomId('panel_description')
        .setLabel('وصف التكت')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(panel.description || '')
        .setMaxLength(300)
        .setRequired(false);

    const emojiInput = new TextInputBuilder()
        .setCustomId('panel_emoji')
        .setLabel('إيموجي التكت')
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
        .setTitle('💬 تخصيص رسالة الترحيب');

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
 * Modal تخصيص رسالة البنل العامة (الإيمبد المنشور مع زر/قائمة
 * فتح التكت). أي حقل يُترك فارغاً يعود للقيمة الافتراضية،
 * والنصوص تدعم المتغيرات مثل [server] [server_id] [time].
 * @param {Object} panel
 */
function buildPanelMessageModal(panel) {
    const custom = panel.panelMessage || {};

    const modal = new ModalBuilder()
        .setCustomId('modal_panel_message')
        .setTitle('📤 تخصيص رسالة البنل العامة');

    const titleInput = new TextInputBuilder()
        .setCustomId('panel_message_title')
        .setLabel('العنوان (فارغ = الافتراضي)')
        .setStyle(TextInputStyle.Short)
        .setValue(custom.title || '')
        .setPlaceholder('مثال: [server] - مركز الدعم')
        .setMaxLength(256)
        .setRequired(false);

    const descInput = new TextInputBuilder()
        .setCustomId('panel_message_description')
        .setLabel('الوصف (يدعم المتغيرات)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(custom.description || '')
        .setPlaceholder('اضغط الزر/القائمة أدناه لفتح تذكرة جديدة.')
        .setMaxLength(1000)
        .setRequired(false);

    const footerInput = new TextInputBuilder()
        .setCustomId('panel_message_footer')
        .setLabel('التذييل (فارغ = نظام التذاكر)')
        .setStyle(TextInputStyle.Short)
        .setValue(custom.footer || '')
        .setPlaceholder('نظام التذاكر')
        .setMaxLength(100)
        .setRequired(false);

    const colorInput = new TextInputBuilder()
        .setCustomId('panel_message_color')
        .setLabel('اللون (Hex مثل #5865F2 أو اسم مثل green)')
        .setStyle(TextInputStyle.Short)
        .setValue(custom.color || '')
        .setPlaceholder('#5865F2')
        .setMaxLength(20)
        .setRequired(false);

    const imageInput = new TextInputBuilder()
        .setCustomId('panel_message_image')
        .setLabel('🖼️ صورة الإيمبد')
        .setStyle(TextInputStyle.Short)
        .setValue(custom.image || '')
        .setPlaceholder('الأفضل: استخدم /رفع-صورة لرفع صورة مباشرة. هنا يمكنك أيضاً لصق رابط http/https')
        .setMaxLength(500)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(footerInput),
        new ActionRowBuilder().addComponents(colorInput),
        new ActionRowBuilder().addComponents(imageInput)
    );

    return modal;
}

/**
 * Modal تخصيص إيمبد التكت (الإيمبد فوق الأزرار داخل التكت)
 * العنوان + الوصف + الصورة + اللون.
 * - العنوان فارغ = اسم البنل مع الإيموجي
 * - الوصف فارغ = رسالة الترحيب المخصصة
 * - كل النصوص تدعم المتغيرات
 * @param {Object} panel
 */
function buildTicketEmbedModal(panel) {
    const custom = panel.ticketEmbed || {};

    const modal = new ModalBuilder()
        .setCustomId('modal_ticket_embed')
        .setTitle('🖼️ تخصيص إيمبد التكت');

    const titleInput = new TextInputBuilder()
        .setCustomId('ticket_embed_title')
        .setLabel('العنوان (فارغ = اسم البنل + الإيموجي)')
        .setStyle(TextInputStyle.Short)
        .setValue(custom.title || '')
        .setPlaceholder('مثال: مركز الدعم الفني')
        .setMaxLength(256)
        .setRequired(false);

    const descInput = new TextInputBuilder()
        .setCustomId('ticket_embed_description')
        .setLabel('الكلام داخل الإيمبد (يدعم المتغيرات)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(custom.description || '')
        .setPlaceholder('فارغ = رسالة الترحيب. مثال: مرحباً [user]، سيساعدك [staff] قريباً.')
        .setMaxLength(1000)
        .setRequired(false);

    const imageInput = new TextInputBuilder()
        .setCustomId('ticket_embed_image')
        .setLabel('🖼️ صورة الإيمبد')
        .setStyle(TextInputStyle.Short)
        .setValue(custom.image || '')
        .setPlaceholder('الأفضل: استخدم /رفع-صورة لرفع صورة مباشرة. هنا يمكنك أيضاً لصق رابط http/https')
        .setMaxLength(500)
        .setRequired(false);

    const colorInput = new TextInputBuilder()
        .setCustomId('ticket_embed_color')
        .setLabel('اللون (Hex مثل #5865F2 أو اسم مثل green)')
        .setStyle(TextInputStyle.Short)
        .setValue(custom.color || '')
        .setPlaceholder('#2b2d31')
        .setMaxLength(20)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(imageInput),
        new ActionRowBuilder().addComponents(colorInput)
    );

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
    buildPanelMessageModal,
    buildTicketEmbedModal,
    buildRenameTicketModal,
};

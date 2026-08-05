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
const { SUPPORTED_VARIABLES } = require('../utils/messageVariables');

// قائمة كل المتغيرات المدعومة — كل متغير في سطر مستقل مع شرح بسيط
// (تظهر داخل نافذة التخصيص في حقل "📋 كل المتغيرات المدعومة")
const VARIABLES_HINT = SUPPORTED_VARIABLES.split(' • ').join('\n');

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

    const hintInput = new TextInputBuilder()
        .setCustomId('panel_create_hint')
        .setLabel('📋 كل المتغيرات المدعومة (متغير + شرح بسيط)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(VARIABLES_HINT)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(emojiInput),
        new ActionRowBuilder().addComponents(hintInput)
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

    const hintInput = new TextInputBuilder()
        .setCustomId('panel_edit_hint')
        .setLabel('📋 كل المتغيرات المدعومة (متغير + شرح بسيط)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(VARIABLES_HINT)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(emojiInput),
        new ActionRowBuilder().addComponents(hintInput)
    );

    return modal;
}

/**
 * Modal تخصيص رسالة الترحيب — رسالة منفصلة عن أزرار التحكم:
 *   - content: الكلام خارج الإيمبد (أو نص الرسالة في وضع النص العادي)
 *   - title / description / color / image: محتوى الإيمبد (وضع الإيمبد فقط)
 * أي حقل فارغ يعود للقيمة الافتراضية، وكل النصوص تدعم المتغيرات.
 * @param {Object} panel
 */
function buildWelcomeMessageModal(panel) {
    const ws = panel.welcomeSettings || {};
    const modal = new ModalBuilder()
        .setCustomId('modal_welcome_message')
        .setTitle('💬 تخصيص رسالة الترحيب');

    const contentInput = new TextInputBuilder()
        .setCustomId('welcome_content')
        .setLabel('الكلام خارج الإيمبد (يدعم المتغيرات)')
        .setStyle(TextInputStyle.Short)
        .setValue(ws.content || '')
        .setPlaceholder('مثال: تم استلام تذكرتك [user] — اتركه فارغاً لعدم الإرسال')
        .setMaxLength(1000)
        .setRequired(false);

    const titleInput = new TextInputBuilder()
        .setCustomId('welcome_title')
        .setLabel('عنوان الإيمبد (فارغ = اسم البنل + الإيموجي)')
        .setStyle(TextInputStyle.Short)
        .setValue(ws.title || '')
        .setPlaceholder('مثال: مركز الدعم الفني')
        .setMaxLength(256)
        .setRequired(false);

    const descInput = new TextInputBuilder()
        .setCustomId('welcome_description')
        .setLabel('الكلام داخل الإيمبد (يدعم المتغيرات)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(ws.description || panel.welcomeMessage || '')
        .setPlaceholder('مثال: مرحباً [user]، شكراً لتواصلك مع [server]. سيتم الرد عليك قريباً.')
        .setMaxLength(1000)
        .setRequired(false);

    const colorInput = new TextInputBuilder()
        .setCustomId('welcome_color')
        .setLabel('اللون (Hex مثل #5865F2 أو اسم مثل green)')
        .setStyle(TextInputStyle.Short)
        .setValue(ws.color || '')
        .setPlaceholder('#5865F2')
        .setMaxLength(20)
        .setRequired(false);

    const imageInput = new TextInputBuilder()
        .setCustomId('welcome_image')
        .setLabel('🖼️ صورة الإيمبد')
        .setStyle(TextInputStyle.Short)
        .setValue(ws.image || '')
        .setPlaceholder('الأفضل: استخدم /رفع-صورة لرفع صورة مباشرة. هنا يمكنك أيضاً لصق رابط http/https')
        .setMaxLength(500)
        .setRequired(false);

    const hintInput = new TextInputBuilder()
        .setCustomId('welcome_hint')
        .setLabel('📋 كل المتغيرات المدعومة (متغير + شرح بسيط)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(VARIABLES_HINT)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(contentInput),
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(colorInput, imageInput),
        new ActionRowBuilder().addComponents(hintInput)
    );

    return modal;
}

/**
 * Modal تخصيص رسالة البنل العامة (الإيمبد المنشور مع زر/قائمة
 * فتح التكت). أي حقل يُترك فارغاً يعود للقيمة الافتراضية،
 * والنصوص تدعم المتغيرات مثل [server] [member_count] [time].
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

    const hintInput = new TextInputBuilder()
        .setCustomId('panel_message_hint')
        .setLabel('📋 كل المتغيرات المدعومة (متغير + شرح بسيط)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(VARIABLES_HINT)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(footerInput, colorInput),
        new ActionRowBuilder().addComponents(imageInput),
        new ActionRowBuilder().addComponents(hintInput)
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
        .setPlaceholder('فارغ = بدون وصف (رسالة الترحيب أصبحت رسالة منفصلة)')
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

    const hintInput = new TextInputBuilder()
        .setCustomId('ticket_embed_hint')
        .setLabel('📋 كل المتغيرات المدعومة (متغير + شرح بسيط)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(VARIABLES_HINT)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(imageInput),
        new ActionRowBuilder().addComponents(colorInput),
        new ActionRowBuilder().addComponents(hintInput)
    );

    return modal;
}

/**
 * Modal تخصيص اسم روم التذكرة (يدعم المتغيرات)
 * مثال: ticket-[username] أو [ticket_number]-[username]
 * @param {Object} panel
 */
function buildTicketNameModal(panel) {
    const modal = new ModalBuilder()
        .setCustomId('modal_ticket_name')
        .setTitle('🏷️ تخصيص اسم التكت');

    const templateInput = new TextInputBuilder()
        .setCustomId('ticket_name_template')
        .setLabel('قالب اسم الروم (فارغ = ticket-[username])')
        .setStyle(TextInputStyle.Short)
        .setValue(panel.ticketNameTemplate || '')
        .setPlaceholder('مثال: ticket-[username] أو [ticket_number]-[username]')
        .setMaxLength(100)
        .setRequired(false);

    const hintInput = new TextInputBuilder()
        .setCustomId('ticket_name_hint')
        .setLabel('المتغيرات المدعومة في الاسم')
        .setStyle(TextInputStyle.Paragraph)
        .setValue('[username] الاسم • [id] الآيدي • [server] السيرفر • [member_count] • [ticket_number] • [year] • [month] • [time] • [date] • [day]\n\nمنشنات مثل [user] [staff] [owner] تتحول لشرطة - تلقائياً لأن أسماء الرومات لا تدعمها')
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(templateInput),
        new ActionRowBuilder().addComponents(hintInput)
    );

    return modal;
}

/**
 * Modal تخصيص رسالة إجراء (زر) — من صفحة رسائل الأزرار
 * content = الكلام فوق الإيمبد • title = العنوان • description = داخل الإيمبد
 * أي حقل فارغ يعود للجملة الافتراضية الجاهزة
 * @param {Object} panel
 * @param {String} actionKey
 */
function buildActionMessageModal(panel, actionKey) {
    const { getActionMessage } = require('../utils/actionMessages');
    const def = getActionMessage(panel, actionKey);
    if (!def) return buildPanelMessageModal(panel); // احتياط نظري

    const modal = new ModalBuilder()
        .setCustomId('modal_action_message')
        .setTitle(`🔔 ${def.label}`);

    const contentInput = new TextInputBuilder()
        .setCustomId('action_content')
        .setLabel('الكلام فوق الإيمبد (فارغ = بدون)')
        .setStyle(TextInputStyle.Short)
        .setValue(def.content || '')
        .setPlaceholder('مثال: تم استلام تذكرتك، يرجى الانتظار.')
        .setMaxLength(1000)
        .setRequired(false);

    const titleInput = new TextInputBuilder()
        .setCustomId('action_title')
        .setLabel('عنوان الإيمبد (فارغ = الافتراضي)')
        .setStyle(TextInputStyle.Short)
        .setValue(def.title || '')
        .setMaxLength(256)
        .setRequired(false);

    const descInput = new TextInputBuilder()
        .setCustomId('action_description')
        .setLabel('الكلام داخل الإيمبد (يدعم المتغيرات)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(def.description || '')
        .setPlaceholder('مثال: تم استلام هذه التذكرة بواسطة [actor].')
        .setMaxLength(1000)
        .setRequired(false);

    const hintInput = new TextInputBuilder()
        .setCustomId('action_hint')
        .setLabel('📋 كل المتغيرات المدعومة (متغير + شرح بسيط)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(VARIABLES_HINT)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(contentInput),
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(hintInput)
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

/**
 * Modal إنشاء/تعديل "زر رتبة مخصص" (يظهر فوق القائمة المنسدلة داخل التكت)
 * @param {String} [btnId] - إذا وُجد = تعديل زر موجود (يملأ الحقول)
 */
function buildRoleButtonModal(panel, btnId = null) {
    const { getRoleButton } = require('../utils/roleButtons');
    const button = btnId ? getRoleButton(panel, btnId) : null;

    const modal = new ModalBuilder()
        .setCustomId(btnId ? `modal_custom_role_btn:${btnId}` : 'modal_custom_role_btn')
        .setTitle(btnId ? '✏️ تعديل زر الرتبة' : '➕ إنشاء زر رتبة');

    const nameInput = new TextInputBuilder()
        .setCustomId('role_btn_name')
        .setLabel('اسم الزر (يظهر داخل التكت فوق القائمة)')
        .setStyle(TextInputStyle.Short)
        .setValue(button ? button.label : '')
        .setPlaceholder('مثال: 🎖️ اختر رتبتك')
        .setMaxLength(80)
        .setRequired(true);

    const hintInput = new TextInputBuilder()
        .setCustomId('role_btn_hint')
        .setLabel('📋 كل المتغيرات المدعومة (متغير + شرح بسيط)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(VARIABLES_HINT)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(hintInput)
    );
    return modal;
}

/**
 * Modal إنشاء/تعديل "خيار" داخل زر رتبة
 * @param {String} btnId - الزر الذي يتبع له الخيار
 * @param {Object} [option] - إذا وُجد = تعديل خيار موجود
 */
function buildRoleButtonOptionModal(btnId, option = null) {
    const modal = new ModalBuilder()
        .setCustomId(option ? `modal_custom_role_btn_option:${btnId}:${option.id}` : `modal_custom_role_btn_option:${btnId}`)
        .setTitle(option ? '✏️ تعديل الخيار' : '➕ إضافة خيار');

    const nameInput = new TextInputBuilder()
        .setCustomId('role_opt_name')
        .setLabel('اسم الخيار')
        .setStyle(TextInputStyle.Short)
        .setValue(option ? option.label : '')
        .setPlaceholder('مثال: 🟢 جاهز للدعم')
        .setMaxLength(100)
        .setRequired(true);

    const descInput = new TextInputBuilder()
        .setCustomId('role_opt_desc')
        .setLabel('وصف الخيار (يظهر داخل القائمة المنسدلة)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(option ? option.description : '')
        .setPlaceholder('مثال: ستحصل على رتبة جاهز للدعم')
        .setMaxLength(100)
        .setRequired(false);

    const hintInput = new TextInputBuilder()
        .setCustomId('role_opt_hint')
        .setLabel('📋 كل المتغيرات المدعومة (متغير + شرح بسيط)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(VARIABLES_HINT)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(hintInput)
    );
    return modal;
}

/**
 * Modal إدخال لون مخصص لزر الرتبة (من باقة /الألوان_المتوفرة أو Hex مخصص)
 * @param {String} btnId
 */
function buildRoleButtonColorModal(btnId) {
    const modal = new ModalBuilder()
        .setCustomId(`modal_role_btn_color:${btnId}`)
        .setTitle('🎨 لون مخصص لزر الرتبة');

    const hexInput = new TextInputBuilder()
        .setCustomId('role_btn_color_hex')
        .setLabel('رمز اللون (Hex) — مثل #FF0000')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('#FF0000')
        .setMinLength(4)
        .setMaxLength(7)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(hexInput));
    return modal;
}

module.exports = {
    buildCreatePanelModal,
    buildEditNameDescModal,
    buildWelcomeMessageModal,
    buildPanelMessageModal,
    buildTicketEmbedModal,
    buildTicketNameModal,
    buildActionMessageModal,
    buildRenameTicketModal,
    buildRoleButtonModal,
    buildRoleButtonOptionModal,
    buildRoleButtonColorModal,
};

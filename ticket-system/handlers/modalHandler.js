/**
 * =========================================================
 *  handlers/modalHandler.js
 * =========================================================
 * معالج جميع نوافذ الـ Modals عند التقديم (ModalSubmitInteraction):
 *   - modal_create_panel     -> إنشاء بنل جديد في قاعدة البيانات
 *   - modal_edit_name_desc   -> تعديل الاسم/الوصف/الإيموجي لبنل موجود
 *   - modal_welcome_message  -> حفظ رسالة الترحيب المخصصة
 *
 * ⚠️ ملاحظة مهمة عن الميكانيكية:
 * بما أن كل هذه الـ Modals تُفتح من أزرار موجودة على رسالة اللوحة
 * الثابتة، فإن ModalSubmitInteraction الناتجة تحمل مرجعاً لنفس
 * الرسالة (interaction.message) ويمكن استخدام interaction.update()
 * مباشرة لتحديثها - تماماً كما لو كانت ButtonInteraction عادية،
 * دون الحاجة لإرسال أي رسالة جديدة.
 *
 * طريقة الاستخدام (في ملف التشغيل الرئيسي، غير مطلوب هنا):
 *   const { handleTicketModal } = require('./handlers/modalHandler');
 *   client.on('interactionCreate', async (interaction) => {
 *       if (interaction.isModalSubmit()) await handleTicketModal(interaction);
 *   });
 * =========================================================
 */

const { createPanel, updatePanel, renamePanel, getPanelByName } = require('../database/panelsDB');
const { reportError } = require('../../src/utils/errorLogger');
const { buildPanelSettings } = require('./panelSettingsBuilder');
const { setSession, getSession } = require('./sessionStore');
const { getSession: getTicketSession, addAuditLog } = require('./ticketStore');
const { safeEmoji } = require('../utils/emoji');
const { resolveSession } = require('../utils/panelResolver');
const { sendActionMessage } = require('../utils/actionMessages');
const { enrichActionContext } = require('../utils/ticketContext');
const { addRoleButton, addRoleOption, setRoleButtonColor } = require('../utils/roleButtons');
const { getTicketSettings, updateTicketSettings } = require('../database/ticketSettingsDB');
const { buildTicketSettingsPage, buildBlacklistPage } = require('./dashboardBuilder');

const RELEVANT_IDS = ['modal_create_panel', 'modal_edit_name_desc', 'modal_welcome_message', 'modal_panel_message', 'modal_ticket_embed', 'modal_ticket_name', 'modal_action_message', 'modal_rename_ticket', 'modal_custom_role_btn', 'modal_blacklist_add', 'modal_staff_note'];

/**
 * هل هذا الـ Modal من نظام أزرار الرتب؟ (customId يحمل btnId/optId)
 */
function isRoleButtonModal(customId) {
    return customId.startsWith('modal_custom_role_btn_option:');
}

/**
 * تحويل إدخال الصورة من الإداري إلى رابط صورة صالح:
 *   1) رابط رسالة ديسكورد (discord.com/channels/...) -> نُحضر الصورة من الرسالة
 *   2) رابط مباشر http/https -> يُقبل كما هو
 *   3) فارغ -> null (بدون صورة)
 *   4) أي شيء آخر -> يرمي خطأ برسالة واضحة
 * @param {String} input
 * @param {import('discord.js').BaseInteraction} interaction
 * @returns {Promise<String|null>}
 */
async function resolveImageInput(input, interaction) {
    const value = (input || '').trim();
    if (!value) return null;

    // رابط رسالة ديسكورد: نجلـب الصورة المرفقة مع الرسالة
    const messageLink = value.match(/discord(?:app)?\.com\/channels\/\d+\/(\d+)\/(\d+)/);
    if (messageLink) {
        try {
            const channel = await interaction.guild.channels.fetch(messageLink[1]).catch(() => null);
            if (channel && channel.isTextBased && channel.isTextBased()) {
                const msg = await channel.messages.fetch(messageLink[2]).catch(() => null);
                const attachment = msg && msg.attachments && msg.attachments.first();
                if (attachment && attachment.url) return attachment.url;
            }
        } catch {
            /* نكمل للإبلاغ عن خطأ الجلب */
        }
        throw new Error(
            'تعذّر جلب الصورة من رابط الرسالة. تأكد أن البوت يرى الروم وأن الرسالة تحتوي صورة.'
        );
    }

    // رابط مباشر
    if (/^https?:\/\//i.test(value)) return value;

    throw new Error('رابط الصورة غير صالح. استخدم رابطاً يبدأ بـ https:// أو رابط رسالة ديسكورد تحتوي صورة.');
}

/**
 * تطبيع قيمة اللون المدخلة من الإداري:
 *  - يقبل Hex بدون # (يُضاف تلقائياً) أو باسم (green) أو برقم
 *  - يعيد null عند الإدخال الفارغ أو اللون غير الصالح (يُستخدم الافتراضي)
 * @param {String} input
 * @returns {String|null}
 */
function normalizeColor(input) {
    if (!input) return null;
    let value = input.trim();
    if (/^[0-9a-fA-F]{6}$/.test(value)) value = '#' + value;
    try {
        const { resolveColor } = require('discord.js');
        resolveColor(value);
        return value;
    } catch {
        return null;
    }
}

/**
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleTicketModal(interaction) {
    if (!RELEVANT_IDS.includes(interaction.customId) && !isRoleButtonModal(interaction.customId) && !interaction.customId.startsWith('modal_role_btn_color:') && !interaction.customId.startsWith('modal_ticket_settings:')) return;

    try {
        // ---------------------------------------------------
        // 0-أ) إضافة عضو لقائمة الحظر (من صفحة قائمة الحظر)
        // ---------------------------------------------------
        if (interaction.customId === 'modal_blacklist_add') {
            const rawId = interaction.fields.getTextInputValue('bl_user_id').trim();
            const reason = interaction.fields.getTextInputValue('bl_reason').trim();

            if (!/^\d{15,20}$/.test(rawId)) {
                await interaction.reply({
                    content: '❌ آيدي العضو غير صالح (يجب أن يكون 15-20 رقماً).',
                    ephemeral: true,
                });
                return;
            }

            // التحقق أن العضو موجود فعلاً في السيرفر
            const target = await interaction.guild.members.fetch(rawId).catch(() => null);
            if (!target) {
                await interaction.reply({
                    content: '❌ لم يتم العثور على عضو بهذا الآيدي في السيرفر.',
                    ephemeral: true,
                });
                return;
            }

            const current = getTicketSettings().blockedUsers || [];
            if (current.some(b => b.id === rawId)) {
                await interaction.reply({
                    content: 'ℹ️ هذا العضو محظور بالفعل.',
                    ephemeral: true,
                });
                return;
            }

            updateTicketSettings({
                blockedUsers: [...current, { id: rawId, reason: reason || 'بدون سبب', at: Date.now() }],
            });

            // نُحدّث صفحة قائمة الحظر نفسها ونُثبت الحظر برسالة مخفية
            await interaction.update(buildBlacklistPage());
            await interaction
                .followUp({
                    content: `✅ تم حظر <@${rawId}> من فتح التذاكر${reason ? ' — السبب: ' + reason : ''}.`,
                    ephemeral: true,
                })
                .catch(() => {});
            return;
        }

        // ---------------------------------------------------
        // 0-ب) ملاحظة داخلية من الستاف (لا يراها صاحب التذكرة)
        // ---------------------------------------------------
        if (interaction.customId === 'modal_staff_note') {
            const text = interaction.fields.getTextInputValue('staff_note_text').trim();
            const ticketSess = getTicketSession(interaction.channel.id);
            if (!ticketSess) {
                await interaction.reply({ content: '⚠️ هذا الروم ليس تذكرة فعّالة.', ephemeral: true });
                return;
            }

            const notes = Array.isArray(ticketSess.staffNotes) ? ticketSess.staffNotes : [];
            const updated = [...notes, { text, by: interaction.member.id, at: Date.now() }].slice(-50);
            const { updateSession: updateTicketSession } = require('./ticketStore');
            updateTicketSession(interaction.channel.id, { staffNotes: updated });

            addAuditLog(interaction.channel.id, `🧾 <@${interaction.member.id}> أضاف ملاحظة داخلية`);
            await interaction.reply({
                content: '✅ تم حفظ الملاحظة الداخلية — ستظهر في أرشيف التذكرة.',
                ephemeral: true,
            });
            return;
        }

        // ---------------------------------------------------
        // 0) الإعدادات العامة: حدود فتح/استلام التذاكر + الكولداون
        //    (0 = بدون حد — الإدارة Administrator غير مشمولة)
        // ---------------------------------------------------
        if (interaction.customId.startsWith('modal_ticket_settings:')) {
            const key = interaction.customId.split(':')[1];

            // رسالة الصيانة: نص حر (غير رقمي)
            if (key === 'maintenanceMessage') {
                const text = interaction.fields.getTextInputValue('setting_value').trim();
                updateTicketSettings({ maintenanceMessage: text });
                await interaction.update(buildTicketSettingsPage());
                return;
            }

            // باقي الإعدادات: قيم رقمية 0..9999 (0 = بدون حد)
            const raw = interaction.fields.getTextInputValue('setting_value').trim();
            const value = Math.floor(Number(raw));
            if (!Number.isFinite(value) || value < 0 || value > 9999) {
                await interaction.reply({
                    content: '❌ أدخل رقماً صحيحاً بين 0 و 9999 (0 = بدون حد).',
                    ephemeral: true,
                });
                return;
            }

            updateTicketSettings({ [key]: value });
            await interaction.update(buildTicketSettingsPage());
            return;
        }

        // ---------------------------------------------------
        // 1) إنشاء بنل جديد
        // ---------------------------------------------------
        if (interaction.customId === 'modal_create_panel') {
            const name = interaction.fields.getTextInputValue('panel_name').trim();
            const description = interaction.fields.getTextInputValue('panel_description').trim();
            const emoji = interaction.fields.getTextInputValue('panel_emoji').trim();

            // التحقق من صحة الإيموجي قبل الحفظ (يمنع أخطاء Discord عند العرض)
            if (emoji && safeEmoji(emoji) !== emoji) {
                await interaction.reply({
                    content: '❌ الإيموجي غير صالح. استخدم إيموجي يونيكود (مثل 🎫) أو إيموجي مخصص صحيح بهذا الشكل: `<:name:id>`',
                    ephemeral: true,
                });
                return;
            }

            let panel;
            try {
                panel = createPanel({
                    name,
                    description,
                    emoji: emoji || '🎫',
                    createdBy: interaction.user.id,
                });
            } catch (err) {
                // خطأ متوقع: اسم مكرر - نرد برسالة واضحة دون كسر اللوحة الحالية
                await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
                return;
            }

            // إذا كان الـ Modal مفتوحاً من زر على رسالة اللوحة، نربط الجلسة بها
            if (interaction.isFromMessage()) {
                setSession(interaction.message.id, { panelName: panel.name, page: 'general' });
                const result = buildPanelSettings(panel.name, 'general');
                await interaction.update(result);
            } else {
                // احتياطي نظري فقط (لا يجب أن يحدث ضمن سياق اللوحة الحالية)
                await interaction.reply({ content: `✅ تم إنشاء البنل **${panel.name}** بنجاح.`, ephemeral: true });
            }
            return;
        }

        // ---------------------------------------------------
        // 2) تعديل الاسم / الوصف / الإيموجي لبنل موجود
        // ---------------------------------------------------
        if (interaction.customId === 'modal_edit_name_desc') {
            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const newName = interaction.fields.getTextInputValue('panel_name').trim();
            const description = interaction.fields.getTextInputValue('panel_description').trim();
            const emoji = interaction.fields.getTextInputValue('panel_emoji').trim();

            // التحقق من صحة الإيموجي قبل الحفظ
            if (emoji && safeEmoji(emoji) !== emoji) {
                await interaction.reply({
                    content: '❌ الإيموجي غير صالح. استخدم إيموجي يونيكود (مثل 🎫) أو إيموجي مخصص صحيح بهذا الشكل: `<:name:id>`',
                    ephemeral: true,
                });
                return;
            }

            try {
                // إعادة التسمية فقط إذا تغيّر الاسم فعلياً (تتحقق من عدم التكرار داخلياً)
                if (newName !== session.panelName) {
                    renamePanel(session.panelName, newName);
                }
                updatePanel(newName, { description, emoji: emoji || '🎫' });
            } catch (err) {
                await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
                return;
            }

            // تحديث الجلسة لتشير للاسم الجديد (حتى لو لم يتغيّر، هذا آمن)
            setSession(interaction.message.id, { panelName: newName, page: 'general' });

            const result = buildPanelSettings(newName, 'general');
            await interaction.update(result);
            return;
        }

        // ---------------------------------------------------
        // 3) حفظ رسالة الترحيب المخصصة (رسالة منفصلة عن أزرار التحكم)
        //    content = كلام خارج الإيمبد • title/description/color/image = الإيمبد
        //    (نوع الرسالة: إيمبد أو نص عادي — يُختار من قائمة صفحة الرسائل)
        // ---------------------------------------------------
        if (interaction.customId === 'modal_welcome_message') {
            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const content = interaction.fields.getTextInputValue('welcome_content').trim();
            const title = interaction.fields.getTextInputValue('welcome_title').trim();
            const description = interaction.fields.getTextInputValue('welcome_description').trim();
            const color = normalizeColor(interaction.fields.getTextInputValue('welcome_color'));

            let image = null;
            try {
                image = await resolveImageInput(
                    interaction.fields.getTextInputValue('welcome_image'),
                    interaction
                );
            } catch (err) {
                await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
                return;
            }

            const current = (getPanelByName(session.panelName) || {}).welcomeSettings || {};
            const welcomeSettings = {
                ...current,
                content: content || null,
                title: title || null,
                description: description || null,
                color,
                image,
            };

            updatePanel(session.panelName, {
                welcomeSettings,
                welcomeMessage: description || null, // توافق مع النسخ السابقة
            });

            const result = buildPanelSettings(session.panelName, 'messages');
            await interaction.update(result);
            return;
        }

        // ---------------------------------------------------
        // 3-أ) لون مخصص لزر الرتبة (Hex من باقة /الألوان_المتوفرة)
        // ---------------------------------------------------
        if (interaction.customId.startsWith('modal_role_btn_color:')) {
            const session = resolveSession(interaction);
            const btnId = interaction.customId.split(':')[1];
            if (!session.panelName || !btnId) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const hex = interaction.fields.getTextInputValue('role_btn_color_hex').trim();
            if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                await interaction.reply({
                    content: '❌ رمز اللون غير صالح. استخدم صيغة Hex من 6 أرقام/حروف مع #، مثال: #FF0000',
                    ephemeral: true,
                });
                return;
            }

            setRoleButtonColor(session.panelName, btnId, hex.toUpperCase());

            const result = buildPanelSettings(session.panelName, 'roleButtons', null, btnId, session.roleOptId);
            await interaction.update(result);
            return;
        }

        // ---------------------------------------------------
        // 3-ب) حفظ تخصيص رسالة البنل العامة (الإيمبد المنشور)
        //      العنوان + الوصف + التذييل + اللون
        //      (كل حقل فارغ = القيمة الافتراضية عند العرض)
        // ---------------------------------------------------
        if (interaction.customId === 'modal_panel_message') {
            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const title = interaction.fields.getTextInputValue('panel_message_title').trim();
            const description = interaction.fields.getTextInputValue('panel_message_description').trim();
            const footer = interaction.fields.getTextInputValue('panel_message_footer').trim();
            const color = normalizeColor(interaction.fields.getTextInputValue('panel_message_color'));

            // الصورة: رابط مباشر أو رابط رسالة ديسكورد
            let image = null;
            try {
                image = await resolveImageInput(
                    interaction.fields.getTextInputValue('panel_message_image'),
                    interaction
                );
            } catch (err) {
                await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
                return;
            }

            const current = (getPanelByName(session.panelName) || {}).panelMessage || {};
            const panelMessage = {
                ...current,
                title: title || null,
                description: description || null,
                footer: footer || null,
                color,
                image,
            };

            updatePanel(session.panelName, { panelMessage });

            const result = buildPanelSettings(session.panelName, 'messages');
            await interaction.update(result);
            return;
        }

        // ---------------------------------------------------
        // 3-ج) حفظ تخصيص إيمبد التكت (الإيمبد فوق الأزرار داخل التكت)
        //      العنوان + الكلام + الصورة + اللون (كل حقل فارغ = الافتراضي)
        // ---------------------------------------------------
        if (interaction.customId === 'modal_ticket_embed') {
            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const title = interaction.fields.getTextInputValue('ticket_embed_title').trim();
            const description = interaction.fields.getTextInputValue('ticket_embed_description').trim();
            const color = normalizeColor(interaction.fields.getTextInputValue('ticket_embed_color'));

            let image = null;
            try {
                image = await resolveImageInput(
                    interaction.fields.getTextInputValue('ticket_embed_image'),
                    interaction
                );
            } catch (err) {
                await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
                return;
            }

            const current = (getPanelByName(session.panelName) || {}).ticketEmbed || {};
            const ticketEmbed = {
                ...current,
                title: title || null,
                description: description || null,
                color,
                image,
            };

            updatePanel(session.panelName, { ticketEmbed });

            const result = buildPanelSettings(session.panelName, 'messages');
            await interaction.update(result);
            return;
        }
        // ---------------------------------------------------
        // 3-د) حفظ قالب اسم روم التذكرة (يدعم المتغيرات)
        //      فارغ = الافتراضي ticket-[username]
        // ---------------------------------------------------
        if (interaction.customId === 'modal_ticket_name') {
            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const template = interaction.fields.getTextInputValue('ticket_name_template').trim();
            updatePanel(session.panelName, { ticketNameTemplate: template || null });

            const result = buildPanelSettings(session.panelName, 'messages');
            await interaction.update(result);
            return;
        }

        // ---------------------------------------------------
        // 3-د) إنشاء/تعديل زر رتبة مخصص (صفحة أزرار الرتب)
        // ---------------------------------------------------
        // ---------------------------------------------------
        // 3-د) إنشاء/تعديل زر رتبة مخصص (صفحة أزرار الرتب)
        // ملاحظة: نستثني بصرياً نافذة الخيار (modal_custom_role_btn_option:)
        // لأنها تبدأ بنفس البادئة — يجب فحصها قبل هذا الفرع
        // ---------------------------------------------------
        if (interaction.customId === 'modal_custom_role_btn' ||
            (interaction.customId.startsWith('modal_custom_role_btn:') &&
             !interaction.customId.startsWith('modal_custom_role_btn_option:'))) {
            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const btnId = interaction.customId.split(':')[1] || null;
            const label = interaction.fields.getTextInputValue('role_btn_name').trim() || '🎖️ زر رتبة';
            let savedBtnId = btnId;

            if (btnId) {
                // تعديل زر موجود
                updatePanel(session.panelName, {
                    customRoleButtons: (getPanelByName(session.panelName)?.customRoleButtons || []).map(b =>
                        b.id === btnId ? { ...b, label: label.slice(0, 80) } : b
                    ),
                });
            } else {
                // إنشاء زر جديد (نأخذ معرفه ليبقى محدداً بعد البناء)
                const created = addRoleButton(session.panelName, label);
                if (created) savedBtnId = created.id;
            }

            const result = buildPanelSettings(session.panelName, 'roleButtons', null, savedBtnId, null);
            if (!result) {
                await interaction.reply({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true }).catch(() => {});
                return;
            }
            await interaction.update(result);
            return;
        }

        // ---------------------------------------------------
        // 3-هـ) إنشاء/تعديل خيار داخل زر رتبة (إضافة اسم + وصف)
        //      ثم تُعيّن رتبته لاحقاً من قائمة الرتب في الصفحة
        // ---------------------------------------------------
        if (isRoleButtonModal(interaction.customId)) {
            const session = resolveSession(interaction);
            if (!session.panelName) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const parts = interaction.customId.split(':'); // [modal_custom_role_btn_option, btnId, optId?]
            const btnId = parts[1];
            const optId = parts[2] || null;
            const label = interaction.fields.getTextInputValue('role_opt_name').trim();
            const description = interaction.fields.getTextInputValue('role_opt_desc').trim();

            let addedOk = true;
            if (btnId) {
                if (optId) {
                    // تعديل خيار موجود
                    updatePanel(session.panelName, {
                        customRoleButtons: (getPanelByName(session.panelName)?.customRoleButtons || []).map(b =>
                            b.id === btnId
                                ? {
                                      ...b,
                                      options: (b.options || []).map(o =>
                                          o.id === optId
                                              ? { ...o, label: label.slice(0, 100), description: description.slice(0, 100) }
                                              : o
                                      ),
                                  }
                                : b
                        ),
                    });
                } else {
                    // إضافة خيار جديد (قد يفشل إذا بلغنا حد 22 خياراً)
                    addedOk = !!addRoleOption(session.panelName, btnId, label, description);
                }
            }

            if (!addedOk) {
                await interaction.update({
                    content: '⚠️ لا يمكن إضافة المزيد من الخيارات: الحد الأقصى 22 خياراً لكل زر (حد ديسكورد 25).',
                    embeds: [],
                    components: [],
                }).catch(() => {});
                return;
            }

            // نعيد البناء مع إبقاء الزر المحدد (المعرف من customId — يعمل حتى لو ضاعت الجلسة)
            const result = buildPanelSettings(session.panelName, 'roleButtons', null, btnId, optId);
            if (!result) {
                await interaction.reply({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true }).catch(() => {});
                return;
            }
            await interaction.update(result);
            return;
        }

        // ---------------------------------------------------
        // 3-هـ) حفظ رسالة إجراء مخصصة (من صفحة رسائل الأزرار)
        //      content = فوق الإيمبد • title = العنوان • description = داخل الإيمبد
        //      أي حقل فارغ يعود للجملة الافتراضية
        // ---------------------------------------------------
        if (interaction.customId === 'modal_action_message') {
            const session = resolveSession(interaction);
            if (!session.panelName || !session.actionKey) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const content = interaction.fields.getTextInputValue('action_content').trim();
            const title = interaction.fields.getTextInputValue('action_title').trim();
            const description = interaction.fields.getTextInputValue('action_description').trim();

            const panel = getPanelByName(session.panelName) || {};
            const current = panel.actionMessages || {};
            updatePanel(session.panelName, {
                actionMessages: {
                    ...current,
                    [session.actionKey]: {
                        ...(current[session.actionKey] || {}),
                        content: content || null,
                        title: title || null,
                        description: description || null,
                    },
                },
            });

            const result = buildPanelSettings(session.panelName, 'actions');
            await interaction.update(result);
            return;
        }

        // ---------------------------------------------------
        // 4) تغيير اسم التذكرة (من قائمة تحكم الستاف داخل التكت)
        // ---------------------------------------------------
        if (interaction.customId === 'modal_rename_ticket') {
            const oldChannelName = interaction.channel.name;
            const newName = interaction.fields.getTextInputValue('new_ticket_name').trim();

            const ticketSession = getTicketSession(interaction.channel.id);
            if (!ticketSession) {
                await interaction.reply({ content: '⚠️ هذا الروم ليس تذكرة فعّالة.', ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            await interaction.channel.setName(newName.slice(0, 100)).catch(() => {});
            addAuditLog(interaction.channel.id, `<@${interaction.user.id}> قام بتغيير اسم التذكرة من "${oldChannelName}" إلى "${newName}"`);

            // رسالة "تغيير اسم التذكرة" — مع متغيرات [old_name] و [new_name]
            const panel = getTicketSession(interaction.channel.id)
                ? getPanelByName(getTicketSession(interaction.channel.id).panelName)
                : null;
            if (panel) {
                await sendActionMessage(
                    interaction.channel,
                    panel,
                    'rename',
                    await enrichActionContext(interaction, {
                        member: interaction.member,
                        guild: interaction.guild,
                        channelName: newName.slice(0, 100),
                        channelId: interaction.channel.id,
                        oldName: oldChannelName,
                        newName: newName.slice(0, 100),
                    })
                );
            }

            await interaction.editReply({ content: `✅ تم تغيير اسم التذكرة إلى **${newName}**.` });
            return;
        }
    } catch (error) {
        console.error('[modalHandler] حدث خطأ أثناء معالجة الـ Modal:', error);
        reportError('TICKET_MODAL', interaction.customId || '?', error);

        const errorPayload = { content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(errorPayload).catch(() => {});
        } else {
            await interaction.reply(errorPayload).catch(() => {});
        }
    }
}

module.exports = { handleTicketModal };

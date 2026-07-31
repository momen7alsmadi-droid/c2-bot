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
const { buildPanelSettings } = require('./panelSettingsBuilder');
const { setSession, getSession } = require('./sessionStore');
const { getSession: getTicketSession, addAuditLog } = require('./ticketStore');

const RELEVANT_IDS = ['modal_create_panel', 'modal_edit_name_desc', 'modal_welcome_message', 'modal_panel_message', 'modal_rename_ticket'];

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
    if (!RELEVANT_IDS.includes(interaction.customId)) return;

    try {
        // ---------------------------------------------------
        // 1) إنشاء بنل جديد
        // ---------------------------------------------------
        if (interaction.customId === 'modal_create_panel') {
            const name = interaction.fields.getTextInputValue('panel_name').trim();
            const description = interaction.fields.getTextInputValue('panel_description').trim();
            const emoji = interaction.fields.getTextInputValue('panel_emoji').trim();

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
            const session = getSession(interaction.isFromMessage() ? interaction.message.id : null);
            if (!session.panelName) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const newName = interaction.fields.getTextInputValue('panel_name').trim();
            const description = interaction.fields.getTextInputValue('panel_description').trim();
            const emoji = interaction.fields.getTextInputValue('panel_emoji').trim();

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
        // 3) حفظ رسالة الترحيب المخصصة
        // ---------------------------------------------------
        if (interaction.customId === 'modal_welcome_message') {
            const session = getSession(interaction.isFromMessage() ? interaction.message.id : null);
            if (!session.panelName) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const welcomeMessage = interaction.fields.getTextInputValue('welcome_message').trim();
            updatePanel(session.panelName, { welcomeMessage });

            const result = buildPanelSettings(session.panelName, 'messages');
            await interaction.update(result);
            return;
        }

        // ---------------------------------------------------
        // 3-ب) حفظ تخصيص رسالة البنل العامة (الإيمبد المنشور)
        //      العنوان + الوصف + التذييل + اللون
        //      (كل حقل فارغ = القيمة الافتراضية عند العرض)
        // ---------------------------------------------------
        if (interaction.customId === 'modal_panel_message') {
            const session = getSession(interaction.isFromMessage() ? interaction.message.id : null);
            if (!session.panelName) {
                await interaction.reply({ content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء المحاولة مجدداً.', ephemeral: true });
                return;
            }

            const title = interaction.fields.getTextInputValue('panel_message_title').trim();
            const description = interaction.fields.getTextInputValue('panel_message_description').trim();
            const footer = interaction.fields.getTextInputValue('panel_message_footer').trim();
            const color = normalizeColor(interaction.fields.getTextInputValue('panel_message_color'));

            const current = (getPanelByName(session.panelName) || {}).panelMessage || {};
            const panelMessage = {
                ...current,
                title: title || null,
                description: description || null,
                footer: footer || null,
                color,
            };

            updatePanel(session.panelName, { panelMessage });

            const result = buildPanelSettings(session.panelName, 'messages');
            await interaction.update(result);
            return;
        }
        // ---------------------------------------------------
        // 4) تغيير اسم التذكرة (من قائمة تحكم الستاف داخل التكت)
        // ---------------------------------------------------
        if (interaction.customId === 'modal_rename_ticket') {
            const newName = interaction.fields.getTextInputValue('new_ticket_name').trim();

            const ticketSession = getTicketSession(interaction.channel.id);
            if (!ticketSession) {
                await interaction.reply({ content: '⚠️ هذا الروم ليس تذكرة فعّالة.', ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            await interaction.channel.setName(newName.slice(0, 100)).catch(() => {});
            addAuditLog(interaction.channel.id, `<@${interaction.user.id}> قام بتغيير اسم التذكرة إلى "${newName}"`);

            await interaction.editReply({ content: `✅ تم تغيير اسم التذكرة إلى **${newName}**.` });
            return;
        }
    } catch (error) {
        console.error('[modalHandler] حدث خطأ أثناء معالجة الـ Modal:', error);

        const errorPayload = { content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(errorPayload).catch(() => {});
        } else {
            await interaction.reply(errorPayload).catch(() => {});
        }
    }
}

module.exports = { handleTicketModal };

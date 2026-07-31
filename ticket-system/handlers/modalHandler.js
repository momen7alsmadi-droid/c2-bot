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
const { safeEmoji } = require('../utils/emoji');
const { resolveSession } = require('../utils/panelResolver');
const { sendActionMessage } = require('../utils/actionMessages');

const RELEVANT_IDS = ['modal_create_panel', 'modal_edit_name_desc', 'modal_welcome_message', 'modal_panel_message', 'modal_ticket_embed', 'modal_ticket_name', 'modal_action_message', 'modal_rename_ticket'];

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
    if (!RELEVANT_IDS.includes(interaction.customId)) return;

    try {
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
        // 3) حفظ رسالة الترحيب المخصصة
        // ---------------------------------------------------
        if (interaction.customId === 'modal_welcome_message') {
            const session = resolveSession(interaction);
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
            const newName = interaction.fields.getTextInputValue('new_ticket_name').trim();

            const ticketSession = getTicketSession(interaction.channel.id);
            if (!ticketSession) {
                await interaction.reply({ content: '⚠️ هذا الروم ليس تذكرة فعّالة.', ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            await interaction.channel.setName(newName.slice(0, 100)).catch(() => {});
            addAuditLog(interaction.channel.id, `<@${interaction.user.id}> قام بتغيير اسم التذكرة إلى "${newName}"`);

            // رسالة "تغيير اسم التذكرة"
            const panel = getTicketSession(interaction.channel.id)
                ? getPanelByName(getTicketSession(interaction.channel.id).panelName)
                : null;
            if (panel) {
                await sendActionMessage(interaction.channel, panel, 'rename', {
                    member: interaction.member,
                    guild: interaction.guild,
                    channelName: newName.slice(0, 100),
                    channelId: interaction.channel.id,
                });
            }

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

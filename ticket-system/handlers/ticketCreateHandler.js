/**
 * =========================================================
 *  handlers/ticketCreateHandler.js
 * =========================================================
 * معالج إنشاء تذكرة جديدة، يُستدعى عند ضغط عضو على:
 *   - زر:    ticket_open:<panelName>
 *   - قائمة: ticket_open_select:<panelName>
 *
 * الخطوات: التحقق من الصلاحيات -> إنشاء القناة بالصلاحيات
 * الصحيحة -> إرسال رسالة الترحيب مع أزرار التحكم -> تسجيل
 * جلسة التذكرة في ticketStore.
 *
 * طريقة الاستخدام (في ملف التشغيل الرئيسي، غير مطلوب هنا):
 *   const { handleTicketCreate } = require('./handlers/ticketCreateHandler');
 *   client.on('interactionCreate', async (interaction) => {
 *       if (
 *           (interaction.isButton() && interaction.customId.startsWith('ticket_open:')) ||
 *           (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_open_select:'))
 *       ) {
 *           await handleTicketCreate(interaction);
 *       }
 *   });
 * =========================================================
 */

const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { getPanelByName } = require('../database/panelsDB');
const { canOpenTicket } = require('./permissionUtils');
const { createSession, updateSession, addAuditLog } = require('./ticketStore');
const { buildTicketControlRows } = require('./ticketControlBuilder');
const { applyMessageVariables } = require('../utils/messageVariables');

/**
 * توليد اسم روم آمن (بدون رموز يرفضها ديسكورد) من اسم العضو
 */
function buildChannelName(panel, member) {
    const safeUsername = member.user.username.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/gi, '-');
    return `ticket-${safeUsername}`.slice(0, 90);
}

/**
 * @param {import('discord.js').ButtonInteraction | import('discord.js').StringSelectMenuInteraction} interaction
 */
async function handleTicketCreate(interaction) {
    const isButton = interaction.isButton?.() && interaction.customId.startsWith('ticket_open:');
    const isSelect = interaction.isStringSelectMenu?.() && interaction.customId.startsWith('ticket_open_select:');
    if (!isButton && !isSelect) return;

    try {
        const panelName = interaction.customId.split(':')[1];
        const panel = getPanelByName(panelName);

        if (!panel) {
            await interaction.reply({ content: '⚠️ هذا البنل لم يعد موجوداً.', ephemeral: true });
            return;
        }
        if (!panel.enabled) {
            await interaction.reply({ content: '🚫 هذا البنل معطّل حالياً من قبل الإدارة.', ephemeral: true });
            return;
        }
        if (!panel.categoryId) {
            await interaction.reply({
                content: '⚠️ لم يتم تحديد كاتيجوري لهذا البنل بعد، يرجى إبلاغ الإدارة.',
                ephemeral: true,
            });
            return;
        }

        const { allowed, reason } = canOpenTicket(interaction.member, panel);
        if (!allowed) {
            await interaction.reply({ content: reason, ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const category = await guild.channels.fetch(panel.categoryId).catch(() => null);
        if (!category || category.type !== ChannelType.GuildCategory) {
            await interaction.editReply({ content: '⚠️ الكاتيجوري المحدد لهذا البنل لم يعد موجوداً، يرجى إبلاغ الإدارة.' });
            return;
        }

        // ---------------------------------------------------
        // بناء صلاحيات القناة:
        // - @everyone: ممنوع الرؤية تماماً
        // - صاحب التذكرة: رؤية + إرسال رسائل
        // - كل رتبة ستاف: رؤية
        // (الإدارة العليا تتجاوز صلاحيات الروم تلقائياً بحكم
        //  صلاحية Administrator في ديسكورد، فلا حاجة لإضافتها هنا)
        // ---------------------------------------------------
        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: interaction.member.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                ],
            },
            ...panel.staffRoles.map(roleId => ({
                id: roleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                ],
            })),
        ];

        const channelName = buildChannelName(panel, interaction.member);

        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites,
        });

        // ---------------------------------------------------
        // بناء رسالة الترحيب
        // ---------------------------------------------------
        const welcomeTemplate =
            panel.welcomeMessage ||
            'مرحباً [user]، شكراً لتواصلك مع [server]. سيقوم أحد أعضاء فريقنا بمساعدتك قريباً.';

        const welcomeText = applyMessageVariables(welcomeTemplate, {
            member: interaction.member,
            guild,
            channelName: ticketChannel.name,
            ticketNumber: category.children.cache.size,
        });

        const welcomeEmbed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle(`${panel.emoji || '🎫'} ${panel.name}`)
            .setDescription(welcomeText)
            .setTimestamp();

        // منشن صاحب التكت + رتب المنشن خارج الإيمبد كما هو مطلوب
        const pingMentions = [
            `<@${interaction.member.id}>`,
            ...panel.pingRoles.map(roleId => `<@&${roleId}>`),
        ].join(' ');

        // إنشاء جلسة التذكرة قبل إرسال الرسالة حتى تكون الأزرار
        // متوافقة مع الحالة الابتدائية (غير مستلمة، غير مقفلة)
        createSession(ticketChannel.id, {
            panelName: panel.name,
            openerId: interaction.member.id,
        });

        const controlRows = buildTicketControlRows({ claimedBy: null }, false);

        const controlMessage = await ticketChannel.send({
            content: pingMentions,
            embeds: [welcomeEmbed],
            components: controlRows,
        });

        // نخزّن آيدي رسالة التحكم لاستخدامها لاحقاً (مثلاً عند إعادة
        // الفتح من رسالة الإغلاق المنفصلة، حيث لا نملك مرجع الرسالة مباشرة)
        updateSession(ticketChannel.id, { controlMessageId: controlMessage.id });

        addAuditLog(ticketChannel.id, `<@${interaction.member.id}> قام بفتح التذكرة`);

        await interaction.editReply({ content: `✅ تم فتح تذكرتك: <#${ticketChannel.id}>` });
    } catch (error) {
        console.error('[ticketCreateHandler] حدث خطأ أثناء إنشاء التذكرة:', error);
        const payload = { content: '❌ حدث خطأ غير متوقع أثناء فتح التذكرة.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
}

module.exports = { handleTicketCreate };

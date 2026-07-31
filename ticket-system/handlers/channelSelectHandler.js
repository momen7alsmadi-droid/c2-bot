/**
 * =========================================================
 *  handlers/channelSelectHandler.js
 * =========================================================
 * معالج قوائم اختيار الرومات (ChannelSelectMenuInteraction) في
 * صفحة "إعدادات الرومات": الكاتيجوري وروم اللوق.
 *
 * نوع تفاعل مختلف عن StringSelectMenu في discord.js v14
 * (interaction.isChannelSelectMenu())، لذلك له ملف منفصل.
 *
 * طريقة الاستخدام (في ملف التشغيل الرئيسي، غير مطلوب هنا):
 *   const { handleChannelSelectMenu } = require('./handlers/channelSelectHandler');
 *   client.on('interactionCreate', async (interaction) => {
 *       if (interaction.isChannelSelectMenu()) await handleChannelSelectMenu(interaction);
 *   });
 * =========================================================
 */

const { buildPanelSettings } = require('./panelSettingsBuilder');
const { updatePanel, getPanelByName } = require('../database/panelsDB');
const { resolveSession } = require('../utils/panelResolver');
const { buildPublicPanelMessage } = require('./publicPanelBuilder');

const FIELD_MAP = {
    settings_select_category: 'categoryId',
    settings_select_log_channel: 'logChannelId',
};

/**
 * @param {import('discord.js').ChannelSelectMenuInteraction} interaction
 */
async function handleChannelSelectMenu(interaction) {
    // ---------------------------------------------------
    // حالة خاصة: اختيار روم لنشر البنل العام فيه (الجزء الثالث)
    // customId بصيغة: ticket_send_target_channel:<panelName>
    // ---------------------------------------------------
    if (interaction.customId.startsWith('ticket_send_target_channel:')) {
        try {
            const panelName = interaction.customId.split(':')[1];
            const panel = getPanelByName(panelName);
            if (!panel) {
                await interaction.update({ content: '⚠️ لم يتم العثور على هذا البنل، ربما تم حذفه.', components: [] });
                return;
            }

            const targetChannel = interaction.channels.first();
            const { embeds, components } = buildPublicPanelMessage(panel, {
                guild: interaction.guild,
            });
            await targetChannel.send({ embeds, components });

            await interaction.update({
                content: `✅ تم نشر بنل **${panel.name}** بنجاح في <#${targetChannel.id}>.`,
                components: [],
            });
        } catch (error) {
            console.error('[channelSelectHandler] خطأ أثناء نشر البنل العام:', error);
            await interaction
                .update({ content: '❌ حدث خطأ أثناء محاولة نشر البنل. تأكد أن للبوت صلاحية الإرسال في هذا الروم.', components: [] })
                .catch(() => {});
        }
        return;
    }

    const field = FIELD_MAP[interaction.customId];
    if (!field) return;

    try {
        await interaction.deferUpdate().catch(() => {});

        const session = resolveSession(interaction);
        if (!session.panelName) {
            await interaction.followUp({
                content: '⚠️ انتهت صلاحية هذه الجلسة، الرجاء الرجوع للوحة الرئيسية والمحاولة مجدداً.',
                ephemeral: true,
            }).catch(() => {});
            return;
        }

        // كل قائمة رومات هنا مضبوطة على اختيار واحد فقط، فنأخذ أول عنصر
        const selectedChannelId = interaction.values[0] || null;

        updatePanel(session.panelName, { [field]: selectedChannelId });

        const result = buildPanelSettings(session.panelName, 'channels');
        if (!result) {
            await interaction.followUp({ content: '⚠️ لم يتم العثور على هذا البنل.', ephemeral: true }).catch(() => {});
            return;
        }

        await interaction.editReply(result);
    } catch (error) {
        console.error('[channelSelectHandler] حدث خطأ أثناء معالجة قائمة الرومات:', error);
        await interaction
            .followUp({ content: '❌ حدث خطأ غير متوقع أثناء تنفيذ هذا الإجراء.', ephemeral: true })
            .catch(() => {});
    }
}

module.exports = { handleChannelSelectMenu };

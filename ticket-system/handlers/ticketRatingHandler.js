/**
 * =========================================================
 *  handlers/ticketRatingHandler.js
 * =========================================================
 * نظام تقييم التذاكر ⭐:
 *   - عند حذف أي تذكرة يُرسل لصاحبها رسالة خاصة فيها 5 أزرار نجوم
 *     (1★ إلى 5★) + زر 📝 ملاحظة (اختياري).
 *   - التقييم يسجَّل في إحصائيات الستاف (نقاط: 5★=1.5 | 4★=1 |
 *     3★=0.75 | 2★=0.5 | 1★=0.25) ويُرسل إلى روم "استقبال التقييمات".
 *   - الملاحظة تُرسل إلى روم "استقبال الملاحظات".
 *   - الرومان يُحدَّدان من الإعدادات العامة عبر صفحة "⭐ التقييم
 *     والملاحظات" (قائمتان منسدلتان لاختيار الرومات).
 *
 * صيغ customId:
 *   - ticket_rating:<النجوم>:<آيدي الستاف>:<اسم التذكرة>
 *   - ticket_note:<آيدي الستاف>:<اسم التذكرة>
 *   - modal_ticket_note:<آيدي الستاف>:<اسم التذكرة>
 * =========================================================
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { version } = require('../../package.json');
const { getTicketSettings, updateTicketSettings } = require('../database/ticketSettingsDB');
const { recordRating, getUserStats, isTicketRated, markTicketRated } = require('../database/ticketStatsStore');
const { formatClaimSpeed } = require('./ticketStatsBuilder');
const { reportError } = require('../../src/utils/errorLogger');

const COLORS = { main: 0x5865F2 };

/** ألوان إيمبد التقييم حسب عدد النجوم */
const RATING_COLORS = { 1: 0xe74c3c, 2: 0xe67e22, 3: 0xf1c40f, 4: 0x2ecc71, 5: 0x00d26a };

/**
 * اسم روم التذكرة من customId (قد يحتوي '-' وأرقام — آمناً من الفواصل)
 * الصيغة الجديدة: ticket_rating:<نجوم>:<ستاف>:<channelId>:<اسم التكت>
 * الصيغة القديمة: ticket_rating:<نجوم>:<ستاف>:<اسم التكت>
 * صيغة الملاحظة: ticket_note:<ستاف>:<اسم التكت>
 */
function decodeTicketName(parts, fromIndex = 3) {
    return parts.slice(fromIndex).join(':') || 'تذكرة';
}

/** قصّ اسم التكت حتى لا يتجاوز حد customId (100 حرف) عند حمله channelId */
function encodeTicketName(name) {
    return String(name || 'تذكرة').slice(0, 28);
}

/**
 * حماية من التقييم المزدوج: معرفات رسائل التقييم التي تم تقييمها
 * (تُحفظ في الذاكرة أثناء التشغيل — والأزرار تُزال من الرسالة نفسها
 * فلا يبقى أي زر لضغطه بعد ذلك حتى بعد إعادة تشغيل البوت)
 */
const ratedMessages = new Set();

/** منع إرسال رسالة تقييم مكررة لنفس القناة (ازدواج عملية الحذف/التنظيف) */
const ratingInvitedChannels = new Set();

// =========================================================
// إرسال رسالة التقييم الخاصة لصاحب التذكرة عند الحذف
// =========================================================
async function sendRatingDM(channel, session, panel) {
    try {
        if (!session?.openerId || !session?.claimedBy) return; // بلا مستلم = لا تقييم

        const settings = getTicketSettings();
        // لا نرسل إلا إذا كان هناك روم استقبال تقييمات أو ملاحظات محدد
        if (!settings.ratingChannelId && !settings.notesChannelId) return;

        const client = channel.client;
        const opener = await client.users.fetch(session.openerId).catch(() => null);
        if (!opener) return;

        // منع الإرسال المكرر لنفس القناة (ازدواج الحذف/التنظيف) — رسالة تقييم واحدة فقط
        if (ratingInvitedChannels.has(channel.id)) return;
        ratingInvitedChannels.add(channel.id);

        const ticketName = encodeTicketName(channel.name);
        const claimerId = session.claimedBy;

        const embed = new EmbedBuilder()
            .setColor(COLORS.main)
            .setTitle('⭐ تقييم تذكرتك')
            .setDescription(
                `شكراً لاستخدامك تذاكر **${channel.guild.name}**! 🎫\n` +
                `كيف كانت خدمة <@${claimerId}> في تذكرتك **${channel.name}**؟\n` +
                `اضغط على عدد النجوم التي تستحقها، أو أضف ملاحظة (اختياري).`
            )
            .addFields(
                { name: '🎫 التذكرة', value: `\`${channel.name}\``, inline: true },
                { name: '📁 البنل', value: panel?.name || '—', inline: true },
                { name: '👥 الستاف المستلم', value: `<@${claimerId}>`, inline: true }
            )
            .setFooter({ text: `الإصدار: ${version}` })
            .setTimestamp();

        const starRow = new ActionRowBuilder().addComponents(
            [1, 2, 3, 4, 5].map(stars =>
                new ButtonBuilder()
                    .setCustomId(`ticket_rating:${stars}:${claimerId}:${channel.id}:${ticketName}`)
                    .setLabel('⭐'.repeat(stars))
                    .setStyle(ButtonStyle.Primary)
            )
        );

        const noteRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket_note:${claimerId}:${ticketName}`)
                .setLabel('📝 إضافة ملاحظة')
                .setStyle(ButtonStyle.Secondary)
        );

        await opener.send({ embeds: [embed], components: [starRow, noteRow] }).catch(() => {
            // المستخدم أغلق الخاص أو حظر البوت — نتجاهل بصمت
        });
    } catch (err) {
        console.error('[ticketRating] فشل إرسال رسالة التقييم الخاصة:', err.message);
        reportError('TICKET_RATING_DM', channel?.id || '?', err);
    }
}

// =========================================================
// معالجة أزرار النجوم (تُضغط في الخاص)
// =========================================================
async function handleRatingButton(interaction) {
    try {
        const parts = interaction.customId.split(':');
        const stars = Math.max(1, Math.min(5, Math.floor(Number(parts[1]) || 0)));
        const claimerId = parts[2];
        const openerId = interaction.user.id;

        // الصيغة الجديدة (تحمل channelId للتذكرة الفريدة) / القديمة للتوافق
        let channelId = null;
        let ticketName;
        if (parts.length >= 5) {
            channelId = parts[3];
            ticketName = decodeTicketName(parts, 4);
        } else {
            ticketName = decodeTicketName(parts, 3);
        }

        // حماية 1 (ذاكرة): هذه الرسالة قُيّمت من قبل (منع التقييم أكثر من مرة)
        if (interaction.message?.id && ratedMessages.has(interaction.message.id)) {
            await interaction.reply({
                content: 'ℹ️ لقد قيّمت هذه التذكرة من قبل ✅ — لا يمكن التقييم أكثر من مرة.',
                ephemeral: true,
            });
            return;
        }

        // حماية 2 (دائمة): هذه التذكرة نفسها قُيّمت سابقاً حتى عبر رسالة مكررة
        if (channelId && isTicketRated(openerId, channelId)) {
            await interaction.reply({
                content: 'ℹ️ لقد قيّمت هذه التذكرة من قبل ✅ — لا يمكن التقييم أكثر من مرة.',
                ephemeral: true,
            });
            return;
        }

        if (interaction.message?.id) ratedMessages.add(interaction.message.id);
        if (channelId) markTicketRated(openerId, channelId);

        // تسجيل التقييم في إحصائيات الستاف (نقاط)
        recordRating(claimerId, stars);

        // إحصائيات الستاف المستلم لعرضها مع التقييم
        const claimerStats = getUserStats(claimerId);
        const statsLine =
            `🎫 ${claimerStats.ticketsClaimed} تكتات | 📥 ${claimerStats.ticketsClosed} مغلقة | ` +
            `💬 ${claimerStats.messagesSent} رسالة | 🏆 **${claimerStats.points.total} نقطة** | ` +
            `⚡ سرعة الاستلام: ${formatClaimSpeed(claimerStats.avgClaimTimeMs)}`;

        // إرسال التقييم إلى روم الاستقبال المحدد في الإعدادات العامة
        const settings = getTicketSettings();
        if (settings.ratingChannelId) {
            const ratingChannel = await interaction.client.channels
                .fetch(settings.ratingChannelId)
                .catch(() => null);
            if (ratingChannel) {
                await ratingChannel
                    .send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(RATING_COLORS[stars] || 0xf1c40f)
                                .setTitle('⭐ تقييم جديد')
                                .addFields(
                                    { name: '🎫 التذكرة', value: `\`${ticketName}\``, inline: true },
                                    { name: '🌟 التقييم', value: `${'⭐'.repeat(stars)} (${stars}/5)`, inline: true },
                                    { name: '👤 بواسطة', value: `<@${openerId}>`, inline: true },
                                    { name: '👥 لصالح', value: `<@${claimerId}>`, inline: true },
                                    { name: '📊 إحصائيات الستاف', value: statsLine, inline: false },
                                    { name: '🕐 الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                                )
                                .setFooter({ text: `الإصدار: ${version}` })
                                .setTimestamp(),
                        ],
                    })
                    .catch(err => {
                        console.error('[ticketRating] فشل إرسال التقييم لروم الاستقبال:', err.message);
                        reportError('TICKET_RATING_SEND', settings.ratingChannelId, err);
                    });
            }
        }

        await interaction.reply({
            content: `✅ شكراً لتقييمك! أعطيت **${stars} ${stars === 1 ? 'نجمة' : 'نجوم'}** 🌟`,
            ephemeral: true,
        });

        // إزالة أزرار التقييم نهائياً من الرسالة (لا يمكن التقييم مرة أخرى)
        // وتحديث الإيمبد برسالة تأكيد أن الاستمارة أُغلقت
        if (interaction.message?.id) {
            try {
                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds?.[0])
                    .setDescription(
                        `✅ **تم تسجيل تقييمك: ${'⭐'.repeat(stars)} (${stars}/5)**\n\n` +
                        'شكراً لك! تم إغلاق استمارة التقييم — لن تتمكن من التقييم مرة أخرى.'
                    );
                await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
            } catch {
                /* الرسالة حُذفت أو تعذّر التعديل — نكتفي بالحماية في الذاكرة */
            }
        }
    } catch (err) {
        console.error('[ticketRating] خطأ في معالجة زر التقييم:', err.message);
        reportError('TICKET_RATING_BTN', interaction.customId || '?', err);
        await interaction.reply({ content: '❌ حدث خطأ أثناء تسجيل تقييمك.', ephemeral: true }).catch(() => {});
    }
}

// =========================================================
// زر الملاحظات (يفتح Modal)
// =========================================================
async function handleNoteButton(interaction) {
    try {
        const parts = interaction.customId.split(':');
        const claimerId = parts[1];
        const ticketName = decodeTicketName(parts, 2); // ticket_note:<ستاف>:<اسم التكت>

        const modal = new ModalBuilder()
            .setCustomId(`modal_ticket_note:${claimerId}:${ticketName}`)
            .setTitle('📝 ملاحظة على تذكرتك');

        const noteInput = new TextInputBuilder()
            .setCustomId('note_text')
            .setLabel('ملاحظتك (اختياري — يمكنك إلغاؤها)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('اكتب أي ملاحظة عن خدمة التذكرة...')
            .setMaxLength(1000)
            .setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(noteInput));
        await interaction.showModal(modal);
    } catch (err) {
        console.error('[ticketRating] خطأ في فتح نافذة الملاحظات:', err.message);
        reportError('TICKET_NOTE_MODAL', interaction.customId || '?', err);
    }
}

// =========================================================
// معالجة إرسال الملاحظة (Modal)
// =========================================================
async function handleNoteModal(interaction) {
    try {
        const parts = interaction.customId.split(':');
        const claimerId = parts[1];
        const ticketName = decodeTicketName(parts, 2); // modal_ticket_note:<ستاف>:<اسم التكت>
        const openerId = interaction.user.id;
        const text = interaction.fields.getTextInputValue('note_text').trim();

        if (!text) {
            await interaction.reply({ content: 'ℹ️ أُلغيت الملاحظة (كانت فارغة). شكراً لك!', ephemeral: true });
            return;
        }

        const settings = getTicketSettings();
        if (settings.notesChannelId) {
            const notesChannel = await interaction.client.channels.fetch(settings.notesChannelId).catch(() => null);
            if (notesChannel) {
                await notesChannel
                    .send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x9b59b6)
                                .setTitle('📝 ملاحظة على تذكرة')
                                .addFields(
                                    { name: '🎫 التذكرة', value: `\`${ticketName}\``, inline: true },
                                    { name: '👤 بواسطة', value: `<@${openerId}>`, inline: true },
                                    { name: '👥 لصالح', value: `<@${claimerId}>`, inline: true },
                                    { name: '📝 نص الملاحظة', value: text.slice(0, 1024), inline: false },
                                    { name: '🕐 الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                                )
                                .setFooter({ text: `الإصدار: ${version}` })
                                .setTimestamp(),
                        ],
                    })
                    .catch(err => {
                        console.error('[ticketRating] فشل إرسال الملاحظة لروم الاستقبال:', err.message);
                        reportError('TICKET_NOTE_SEND', settings.notesChannelId, err);
                    });
            }
        }

        await interaction.reply({ content: '✅ تم إرسال ملاحظتك، شكراً لك! 📝', ephemeral: true });
    } catch (err) {
        console.error('[ticketRating] خطأ في معالجة الملاحظة:', err.message);
        reportError('TICKET_NOTE_SUBMIT', interaction.customId || '?', err);
        await interaction.reply({ content: '❌ حدث خطأ أثناء إرسال ملاحظتك.', ephemeral: true }).catch(() => {});
    }
}

// =========================================================
// صفحة إعدادات التقييم والملاحظات (من الإعدادات العامة)
// قائمتان منسدلتان لاختيار روم التقييمات وروم الملاحظات
// =========================================================
function buildRatingSettingsPage() {
    const s = getTicketSettings();

    const embed = new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle('⭐ التقييم والملاحظات')
        .setDescription(
            'حدد رومات استقبال التقييمات والملاحظات من القائمتين أدناه.\n' +
            'عند حذف أي تذكرة يصل صاحبها رسالة خاصة فيها أزرار النجوم، ' +
            'وما يختاره يصل إلى الروم المحدد.'
        )
        .addFields(
            { name: '⭐ روم استقبال التقييمات', value: s.ratingChannelId ? `<#${s.ratingChannelId}>` : '❌ غير محدد — لن تُرسل التقييمات', inline: false },
            { name: '📝 روم استقبال الملاحظات', value: s.notesChannelId ? `<#${s.notesChannelId}>` : '❌ غير محدد — لن تُرسل الملاحظات', inline: false }
        )
        .setFooter({ text: `الإصدار: ${version}` })
        .setTimestamp();

    const ratingSelect = new ChannelSelectMenuBuilder()
        .setCustomId('settings_select_rating_channel')
        .setPlaceholder(s.ratingChannelId ? '⭐ روم التقييمات (محدد)' : '⭐ اختر روم التقييمات...')
        .setChannelTypes(0); // 0 = GuildText

    const notesSelect = new ChannelSelectMenuBuilder()
        .setCustomId('settings_select_notes_channel')
        .setPlaceholder(s.notesChannelId ? '📝 روم الملاحظات (محدد)' : '📝 اختر روم الملاحظات...')
        .setChannelTypes(0);

    // ⚠️ ديسكورد: كل قائمة منسدلة (ChannelSelectMenu) تأخذ عرض الصف
    // كاملاً — لا يجوز وضع قائمتين في صف واحد (COMPONENT_LAYOUT_WIDTH_EXCEEDED)
    const row1 = new ActionRowBuilder().addComponents(ratingSelect);
    const row2 = new ActionRowBuilder().addComponents(notesSelect);
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_settings_rating_off').setLabel('🚫 تعطيل روم التقييمات').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_settings_notes_off').setLabel('🚫 تعطيل روم الملاحظات').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_settings_back').setLabel('🔙 رجوع للإعدادات').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = {
    sendRatingDM,
    handleRatingButton,
    handleNoteButton,
    handleNoteModal,
    buildRatingSettingsPage,
};

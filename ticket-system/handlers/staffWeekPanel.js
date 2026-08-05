/**
 * =========================================================
 *  handlers/staffWeekPanel.js
 * =========================================================
 * 🏆 نظام إداري الأسبوع:
 *   - أمر /اداري_الأسبوع (لرتبة Administrator فقط):
 *       تفعيل/إطفاء + اختيار روم الإرسال + يوم الإرسال
 *       + وقت الإرسال (توقيت الأردن) + رسالة مخصصة تدعم
 *       المتغيرات + معاينة فورية.
 *   - مجدول: كل دقيقة يقارن اليوم/الوقت (Asia/Amman) —
 *     عند التطابق يُرسل تهنئة لأعلى إداري نقاط خلال آخر
 *     7 أيام (سجل النقاط الزمني في ticketStatsStore).
 *
 * المتغيرات المدعومة في رسالة التهنئة:
 *   [user] [username] [id] [avatar] [highest_role]  ← الفائز
 *   [server] [member_count] [owner] [bot]
 *   [time] [date] [day] [year] [month]
 *   {points}     ← نقاط الفائز هذا الأسبوع
 *   {week}       ← نطاق الأسبوع (بداية ← نهاية)
 *   {week_start} ← بداية نطاق الأسبوع
 *   {week_end}   ← نهاية نطاق الأسبوع
 *   {day_name}   ← اسم يوم الإرسال
 *   {time}       ← وقت الإرسال المضبوط
 * =========================================================
 */

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
} = require('discord.js');
const { version } = require('../../package.json');
const { getTicketSettings, updateTicketSettings, DEFAULT_STAFF_WEEK_MESSAGE } = require('../database/ticketSettingsDB');
const { getTopStaffWeekly } = require('../database/ticketStatsStore');
const { getTeamAdminIds } = require('./ticketStatsBuilder');
const { applyMessageVariables } = require('../utils/messageVariables');
const { ackComponent, deliverComponent } = require('../utils/interactionSafe');
const { reportError } = require('../../src/utils/errorLogger');

const COLORS = { main: 0x5865F2, gold: 0xF1C40F, green: 0x2ECC71 };
const WEEK_MS = 7 * 86400000;
const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const FOOTER = { text: `الإصدار: ${version}` };

// ================== ⏰ توقيت الأردن (Asia/Amman) ==================

/** الوقت الحالي بتوقيت الأردن: { day: 0-6, time: 'HH:MM', dateKey: 'YYYY-MM-DD' } */
function ammanNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Amman',
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(new Date());
    const get = t => parts.find(p => p.type === t)?.value || '0';
    let hh = get('hour');
    if (hh === '24') hh = '00';
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
        day: dayMap[get('weekday')] ?? 0,
        time: `${hh}:${get('minute')}`,
        dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    };
}

/** تنسيق تاريخ بتوقيت الأردن بصيغة YYYY-MM-DD */
function fmtAmmanDate(ts) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

/** نطاق الأسبوع الحالي (آخر 7 أيام) */
function weekRange() {
    const end = Date.now();
    const start = end - WEEK_MS;
    return { start: fmtAmmanDate(start), end: fmtAmmanDate(end) };
}

/** استبدال متغيرات إداري الأسبوع المخصصة ({points}, {week}, ...) بعد متغيرات النظام */
function applyStaffWeekVars(text, winner, settings) {
    const r = weekRange();
    const dayName = DAY_NAMES[settings.staffWeekDay] ?? DAY_NAMES[5];
    return String(text || '')
        .replace(/\{points\}/g, String(winner ? winner.weekly.total : '0'))
        .replace(/\{week\}/g, `${r.start} ← ${r.end}`)
        .replace(/\{week_start\}/g, r.start)
        .replace(/\{week_end\}/g, r.end)
        .replace(/\{day_name\}/g, dayName)
        .replace(/\{time\}/g, settings.staffWeekTime || '18:00');
}

// ================== 🏆 بناء لوحة التحكم ==================

function buildStaffWeekEmbed(interaction, s) {
    const enabled = !!s.staffWeekEnabled;
    const msg = s.staffWeekMessage || DEFAULT_STAFF_WEEK_MESSAGE;
    const embed = new EmbedBuilder()
        .setColor(enabled ? COLORS.green : COLORS.main)
        .setTitle('🏆 إداري الأسبوع')
        .setDescription(
            enabled
                ? '✅ النظام **مفعّل** — تُرسل التهنئة أسبوعياً لأعلى إداري نقاط خلال آخر 7 أيام.'
                : '❌ النظام **معطّل** حالياً — فعّله بزر "✅ تفعيل" بالأسفل.'
        )
        .addFields(
            { name: '📢 روم الإرسال', value: s.staffWeekChannelId ? `<#${s.staffWeekChannelId}>` : '⚠️ غير محدد', inline: true },
            { name: '📅 يوم الإرسال', value: DAY_NAMES[s.staffWeekDay] ?? 'الجمعة', inline: true },
            { name: '⏰ الوقت (الأردن)', value: s.staffWeekTime || '18:00', inline: true },
            { name: '✏️ رسالة التهنئة', value: `\`\`\`${msg.slice(0, 300)}${msg.length > 300 ? '…' : ''}\`\`\``, inline: false },
            {
                name: '🔤 المتغيرات المدعومة',
                value: '`[user]` `[username]` `[server]` `{points}` `{week}` `{week_start}` `{week_end}` `{day_name}`',
                inline: false,
            }
        )
        .setFooter(FOOTER);
    return embed;
}

function buildPanelComponents(s) {
    const enabled = !!s.staffWeekEnabled;
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('sw_toggle')
            .setLabel(enabled ? '❌ إطفاء' : '✅ تفعيل')
            .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('sw_channel').setLabel('📢 روم الإرسال').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('sw_time').setLabel('⏰ الوقت').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('sw_msg').setLabel('✏️ الرسالة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('sw_preview').setLabel('👁️ معاينة').setStyle(ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('sw_day')
            .setPlaceholder(`📅 يوم الإرسال: ${DAY_NAMES[s.staffWeekDay] ?? 'الجمعة'}`)
            .addOptions(
                DAY_NAMES.map((name, i) => ({
                    label: `📅 ${name}`,
                    value: String(i),
                    default: i === (s.staffWeekDay ?? 5),
                }))
            ),
    );
    return [row1, row2];
}

async function rebuildPanel(interaction) {
    const s = getTicketSettings();
    const embed = buildStaffWeekEmbed(interaction, s);
    const components = buildPanelComponents(s);
    return interaction.editReply({ embeds: [embed], components }).catch(() => {});
}

// ================== 💻 أمر /اداري_الأسبوع ==================

async function handleStaffWeekCommand(interaction) {
    // Administrator فقط
    if (!interaction.member?.permissions?.has('Administrator')) {
        return interaction.reply({ content: '🚫 أمر **إداري الأسبوع** متاح فقط لمن يملك صلاحية **Administrator**.', ephemeral: true });
    }
    const s = getTicketSettings();
    return interaction.reply({ embeds: [buildStaffWeekEmbed(interaction, s)], components: buildPanelComponents(s), ephemeral: true });
}

// ================== 🔘 أزرار اللوحة ==================

/** فحص صلاحية Administrator لأي تفاعل (زر/قائمة/نافذة) */
function isAdmin(interaction) {
    return !!(interaction.member?.permissions?.has('Administrator'));
}

async function handleStaffWeekInteraction(interaction) {
    // 🔒 كل أزرار اللوحة لرتبة Administrator فقط
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: '🚫 هذه اللوحة متاحة فقط لمن يملك صلاحية **Administrator**.', ephemeral: true }).catch(() => {});
    }
    const id = interaction.customId;

    if (id === 'sw_back') {
        await ackComponent(interaction);
        return rebuildPanel(interaction);
    }

    if (id === 'sw_toggle') {
        await ackComponent(interaction);
        const s = getTicketSettings();
        updateTicketSettings({ staffWeekEnabled: s.staffWeekEnabled ? 0 : 1 });
        return rebuildPanel(interaction);
    }

    if (id === 'sw_channel') {
        await ackComponent(interaction);
        const s = getTicketSettings();
        const embed = buildStaffWeekEmbed(interaction, s);
        const selectRow = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId('sw_sel_channel')
                .setPlaceholder('📢 اختر روم إرسال التهنئة')
                .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setMinValues(1)
                .setMaxValues(1)
        );
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sw_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
        );
        return interaction.editReply({ embeds: [embed], components: [selectRow, backRow] }).catch(() => {});
    }

    if (id === 'sw_time') return showTimeModal(interaction);
    if (id === 'sw_msg') return showMsgModal(interaction);

    if (id === 'sw_preview') {
        await ackComponent(interaction);
        const embed = await buildPreviewEmbed(interaction);
        return deliverComponent(interaction, { embeds: [embed], ephemeral: true });
    }
}

// ================== 📋 قوائم الاختيار ==================

async function handleStaffWeekSelect(interaction) {
    // 🔒 قوائم اللوحة لرتبة Administrator فقط
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: '🚫 هذه اللوحة متاحة فقط لمن يملك صلاحية **Administrator**.', ephemeral: true }).catch(() => {});
    }
    if (interaction.customId === 'sw_sel_channel') {
        await ackComponent(interaction);
        const channelId = interaction.values?.[0];
        if (channelId) updateTicketSettings({ staffWeekChannelId: channelId });
        return rebuildPanel(interaction);
    }
    if (interaction.customId === 'sw_day') {
        await ackComponent(interaction);
        const day = Number(interaction.values?.[0]);
        if (!Number.isNaN(day)) updateTicketSettings({ staffWeekDay: day });
        return rebuildPanel(interaction);
    }
}

// ================== 📝 نوافذ الإدخال (الوقت/الرسالة) ==================

function showTimeModal(interaction) {
    const s = getTicketSettings();
    const modal = new ModalBuilder().setCustomId('sw_time_modal').setTitle('⏰ وقت إرسال التهنئة (توقيت الأردن)');
    const input = new TextInputBuilder()
        .setCustomId('sw_time_input')
        .setLabel('الوقت بصيغة HH:MM — مثال: 18:00')
        .setStyle(TextInputStyle.Short)
        .setValue(s.staffWeekTime || '18:00')
        .setMaxLength(5)
        .setMinLength(4)
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal).catch(() => {});
}

function showMsgModal(interaction) {
    const s = getTicketSettings();
    const modal = new ModalBuilder().setCustomId('sw_msg_modal').setTitle('✏️ رسالة التهنئة (تدعم المتغيرات)');
    const input = new TextInputBuilder()
        .setCustomId('sw_msg_input')
        .setLabel('اتركها فارغة لاستخدام الرسالة الافتراضية')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(s.staffWeekMessage || '')
        .setMaxLength(1500)
        .setRequired(false);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal).catch(() => {});
}

async function handleStaffWeekModal(interaction) {
    // 🔒 نوافذ اللوحة لرتبة Administrator فقط
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: '🚫 هذه اللوحة متاحة فقط لمن يملك صلاحية **Administrator**.', ephemeral: true }).catch(() => {});
    }
    if (interaction.customId === 'sw_time_modal') {
        const raw = interaction.fields.getTextInputValue('sw_time_input');
        updateTicketSettings({ staffWeekTime: raw });
        const s = getTicketSettings();
        return interaction.reply({
            embeds: [buildStaffWeekEmbed(interaction, s)],
            components: buildPanelComponents(s),
            ephemeral: true,
        });
    }
    if (interaction.customId === 'sw_msg_modal') {
        updateTicketSettings({ staffWeekMessage: interaction.fields.getTextInputValue('sw_msg_input') });
        const s = getTicketSettings();
        return interaction.reply({
            embeds: [buildStaffWeekEmbed(interaction, s)],
            components: buildPanelComponents(s),
            ephemeral: true,
        });
    }
}

// ================== 👁️ المعاينة ==================

async function buildPreviewEmbed(interaction) {
    const s = getTicketSettings();
    const template = s.staffWeekMessage || DEFAULT_STAFF_WEEK_MESSAGE;
    const guild = interaction.guild;
    const member = interaction.member;

    // معاينة: المستخدم نفسه بطل تجريبي بنقاط نموذجية
    let text = applyMessageVariables(template, { member, guild });
    text = applyStaffWeekVars(text, { weekly: { total: 25 } }, s);

    return new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle('👁️ معاينة التهنئة (نموذج)')
        .setDescription(text)
        .addFields(
            { name: '💡 ملاحظة', value: 'هذه معاينة تجريبية: `{points}` عُرضت كـ **25 نقطة** وأنت الفائز النموذجي. يوم الإرسال تُعرض القيم الحقيقية.', inline: false }
        )
        .setFooter(FOOTER);
}

// ================== 📢 الإرسال الفعلي + المجدول ==================

/** بناء إيمبد التهنئة لأعلى إداري نقاط خلال آخر 7 أيام */
async function buildAnnouncementEmbed(guild, top, settings) {
    const winner = top[0] || null;
    let winnerMember = null;
    if (winner) winnerMember = await guild.members.fetch(winner.id).catch(() => null);

    if (!winner || !winnerMember) {
        return new EmbedBuilder()
            .setColor(COLORS.main)
            .setTitle('🏆 إداري الأسبوع')
            .setDescription('📭 لا يوجد إداري حصل على نقاط خلال هذا الأسبوع بعد — ترقبوا الأسبوع القادم! ⏳')
            .setFooter(FOOTER);
    }

    const template = settings.staffWeekMessage || DEFAULT_STAFF_WEEK_MESSAGE;
    let text = applyMessageVariables(template, { member: winnerMember, guild });
    text = applyStaffWeekVars(text, winner, settings);

    const w = winner.weekly;
    const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle('🏆 إداري الأسبوع')
        .setDescription(text)
        .setThumbnail(winnerMember.user.displayAvatarURL())
        .addFields(
            { name: '🥇 إداري الأسبوع', value: `${winnerMember} — **${w.total} نقطة**`, inline: false },
            {
                name: '🧮 تفاصيل النقاط',
                value: [
                    `💬 رسائل داخل التكتات: **+${w.messages}**`,
                    `📥 تكتات مغلقة: **+${w.close}**`,
                    `⭐ تقييمات: **+${w.rating}**`,
                    `📅 تسجيل دخول يومي: **+${w.login}**`,
                ].join('\n'),
                inline: false,
            }
        );
    if (top[1]) {
        embed.addFields({ name: '🥈 المركز الثاني', value: `<@${top[1].id}> — **${top[1].weekly.total} نقطة**`, inline: true });
    }
    if (top[2]) {
        embed.addFields({ name: '🥉 المركز الثالث', value: `<@${top[2].id}> — **${top[2].weekly.total} نقطة**`, inline: true });
    }
    const r = weekRange();
    embed.addFields({ name: '📆 نطاق الأسبوع', value: `${r.start} ← ${r.end}`, inline: false });
    embed.setFooter(FOOTER);
    return embed;
}

/** تنفيذ تهنئة إداري الأسبوع (يستدعيها المجدول أو يدوياً) */
async function announceStaffOfWeek(client) {
    const settings = getTicketSettings();
    if (!settings.staffWeekEnabled || !settings.staffWeekChannelId) return;
    const channel = await client.channels.fetch(settings.staffWeekChannelId).catch(() => null);
    if (!channel || !channel.guild) return;

    const adminIds = await getTeamAdminIds(channel.guild);
    const top = getTopStaffWeekly(adminIds, Date.now() - WEEK_MS);

    const embed = await buildAnnouncementEmbed(channel.guild, top, settings);
    await channel.send({ embeds: [embed] }).catch(e => {
        console.error('❌ staffWeek send:', e.message);
        reportError('STAFF_WEEK_SEND', 'staff-of-week', e);
        return;
    });

    // تحديث آخر تشغيل (يمنع التكرار + يُحفظ في النسخة الاحتياطية)
    updateTicketSettings({ staffWeekLastRun: ammanNow().dateKey });
    console.log(`🏆 تم إرسال تهنئة إداري الأسبوع إلى <#${settings.staffWeekChannelId}>`);
}

/** تشغيل المجدول: فحص كل دقيقة (توقيت الأردن) */
function startStaffOfWeekScheduler(client) {
    setInterval(async () => {
        try {
            const settings = getTicketSettings();
            if (!settings.staffWeekEnabled || !settings.staffWeekChannelId) return;
            const now = ammanNow();
            if (now.day !== settings.staffWeekDay) return;
            if (now.time !== settings.staffWeekTime) return;
            if (settings.staffWeekLastRun === now.dateKey) return; // نُفذ اليوم بالفعل
            await announceStaffOfWeek(client);
        } catch (e) {
            console.error('❌ staffWeek scheduler:', e.message);
            reportError('STAFF_WEEK_RUN', 'staff-of-week', e);
        }
    }, 60000);
}

module.exports = {
    handleStaffWeekCommand,
    handleStaffWeekInteraction,
    handleStaffWeekSelect,
    handleStaffWeekModal,
    startStaffOfWeekScheduler,
    announceStaffOfWeek,
    buildStaffWeekEmbed,
    ammanNow,
    applyStaffWeekVars,
    buildAnnouncementEmbed,
};

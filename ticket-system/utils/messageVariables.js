/**
 * =========================================================
 *  utils/messageVariables.js
 * =========================================================
 * استبدال المتغيرات المدعومة داخل أي نص مخصص (رسالة الترحيب،
 * رسالة البنل العامة، إيمبد التكت، ... إلخ) لتظهر القيم الحقيقية
 * وقت الإرسال.
 *
 * المتغيرات المدعومة (22):
 *   [user]          -> منشن العضو            <@123456789>
 *   [username]      -> اسم المستخدم           momen
 *   [id]            -> آيدي العضو             123456789
 *   [avatar]        -> رابط صورة العضو        https://cdn...
 *   [created_at]    -> تاريخ إنشاء الحساب      <t:123: D>
 *   [joined_at]     -> تاريخ انضمام العضو      <t:123: D>
 *   [highest_role]  -> أعلى رتبة للعضو         <@&123>
 *   [server]        -> اسم السيرفر            C2 Server
 *   [server_id]     -> آيدي السيرفر           123456789
 *   [member_count]  -> عدد أعضاء السيرفر      1250
 *   [owner]         -> منشن مالك السيرفر      <@123>
 *   [boosts]        -> عدد البوستات           15
 *   [boost_tier]    -> مستوى البوست (0-3)     2
 *   [bot]           -> منشن البوت             <@123>
 *   [ticket_name]   -> اسم روم التذكرة        ticket-momen
 *   [channel]       -> منشن روم التذكرة       <#123>
 *   [ticket_number] -> رقم التذكرة (عدد الرومات في الكاتيجوري)
 *   [staff]         -> منشن رتب الستاف
 *   [ping]          -> منشن رتب المنشن
 *   [time]          -> الوقت الحالي           <t:1234567890:F>
 *   [date]          -> تاريخ اليوم            <t:1234567890:D>
 *   [day]           -> اسم اليوم              <t:1234567890:E>
 *
 * أي متغير بلا سياق (مثلاً [user] في رسالة عامة لا يفتحها عضو
 * معيّن) يبقى كما هو نصاً حرفياً بدل أن يتحول إلى "غير معروف".
 * =========================================================
 */

/**
 * استبدال المتغيرات في نص معيّن حسب السياق المتاح
 * @param {String} template
 * @param {Object} [context]
 * @param {Object} [context.member] - عضو (GuildMember) — يفعّل متغيرات العضو
 * @param {Object} [context.guild] - سيرفر (Guild) — يفعّل متغيرات السيرفر
 * @param {String} [context.channelName] - اسم روم التذكرة — يفعّل [ticket_name]
 * @param {String} [context.channelId] - آيدي روم التذكرة — يفعّل [channel]
 * @param {Number} [context.ticketNumber] - رقم التذكرة — يفعّل [ticket_number]
 * @param {String[]} [context.staffRoles] - آيدي رتب الستاف — يفعّل [staff]
 * @param {String[]} [context.pingRoles] - آيدي رتب المنشن — يفعّل [ping]
 * @returns {String}
 */
function applyMessageVariables(
    template,
    { member, guild, channelName, channelId, ticketNumber, staffRoles, pingRoles } = {}
) {
    let text = String(template || '');

    // ===== متغيرات العضو =====
    if (member) {
        const user = member.user || {};
        text = text
            .replaceAll('[user]', `<@${member.id}>`)
            .replaceAll('[username]', user.username || '')
            .replaceAll('[id]', member.id);

        if (user.displayAvatarURL) {
            text = text.replaceAll('[avatar]', user.displayAvatarURL({ size: 256 }));
        }
        if (member.roles && member.roles.highest) {
            text = text.replaceAll('[highest_role]', `<@&${member.roles.highest.id}>`);
        }
        if (user.createdTimestamp) {
            text = text.replaceAll('[created_at]', `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`);
        }
        if (member.joinedTimestamp) {
            text = text.replaceAll('[joined_at]', `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`);
        }
    }

    // ===== متغيرات السيرفر =====
    if (guild) {
        text = text
            .replaceAll('[server]', guild.name)
            .replaceAll('[server_id]', guild.id)
            .replaceAll('[member_count]', String(guild.memberCount ?? ''))
            .replaceAll('[boosts]', String(guild.premiumSubscriptionCount ?? ''))
            .replaceAll('[boost_tier]', String(guild.premiumTier ?? 0))
            .replaceAll('[owner]', guild.ownerId ? `<@${guild.ownerId}>` : '')
            .replaceAll('[bot]', guild.client && guild.client.user ? `<@${guild.client.user.id}>` : '');
    }

    // ===== متغيرات التذكرة =====
    if (channelName) text = text.replaceAll('[ticket_name]', channelName);
    if (channelId) text = text.replaceAll('[channel]', `<#${channelId}>`);
    if (ticketNumber !== undefined && ticketNumber !== null) {
        text = text.replaceAll('[ticket_number]', String(ticketNumber));
    }
    if (Array.isArray(staffRoles) && staffRoles.length) {
        text = text.replaceAll('[staff]', staffRoles.map(id => `<@&${id}>`).join(' '));
    }
    if (Array.isArray(pingRoles) && pingRoles.length) {
        text = text.replaceAll('[ping]', pingRoles.map(id => `<@&${id}>`).join(' '));
    }

    // ===== متغيرات الوقت (متاحة دائماً) =====
    const unix = Math.floor(Date.now() / 1000);
    text = text
        .replaceAll('[time]', `<t:${unix}:F>`)
        .replaceAll('[date]', `<t:${unix}:D>`)
        .replaceAll('[day]', `<t:${unix}:E>`);

    return text;
}

/**
 * نص عرض المتغيرات المدعومة — يُستخدم في إيمبد المعلومات
 */
const SUPPORTED_VARIABLES =
    '`[user]` منشن العضو • `[username]` الاسم • `[id]` الآيدي • `[avatar]` صورة العضو • `[created_at]` تاريخ الحساب • `[joined_at]` تاريخ الانضمام • `[highest_role]` أعلى رتبة • `[server]` اسم السيرفر • `[server_id]` آيدي السيرفر • `[member_count]` عدد الأعضاء • `[owner]` المالك • `[boosts]` البوستات • `[boost_tier]` مستوى البوست • `[bot]` البوت • `[ticket_name]` اسم التكت • `[channel]` منشن التكت • `[ticket_number]` رقم التكت • `[staff]` رتب الستاف • `[ping]` رتب المنشن • `[time]` الوقت • `[date]` التاريخ • `[day]` اليوم';

module.exports = { applyMessageVariables, SUPPORTED_VARIABLES };

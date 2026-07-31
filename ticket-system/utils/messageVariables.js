/**
 * =========================================================
 *  utils/messageVariables.js
 * =========================================================
 * استبدال المتغيرات المدعومة داخل أي نص مخصص (رسالة الترحيب،
 * رسالة البنل العامة، إيمبد التكت، رسائل الأزرار، ... إلخ)
 * لتظهر القيم الحقيقية وقت الإرسال.
 *
 * المتغيرات المدعومة (30):
 *   متغيرات العضو:
 *   [user]          -> منشن العضو            <@123456789>
 *   [username]      -> اسم المستخدم           momen
 *   [id]            -> آيدي العضو             123456789
 *   [avatar]        -> رابط صورة العضو        https://cdn...
 *   [created_at]    -> تاريخ إنشاء الحساب      <t:123:D>
 *   [joined_at]     -> تاريخ انضمام العضو      <t:123:D>
 *   [highest_role]  -> أعلى رتبة للعضو         <@&123>
 *
 *   متغيرات السيرفر:
 *   [server]        -> اسم السيرفر            C2 Server
 *   [member_count]  -> عدد أعضاء السيرفر      1250
 *   [owner]         -> منشن مالك السيرفر      <@123>
 *   [bot]           -> منشن البوت             <@123>
 *
 *   متغيرات التذكرة:
 *   [ticket_name]   -> اسم روم التذكرة        ticket-momen
 *   [channel]       -> منشن روم التذكرة       <#123>
 *   [ticket_number] -> رقم التذكرة            3
 *   [category]      -> اسم الكاتيجوري         الدعم
 *   [ticket_created]-> تاريخ فتح التذكرة      <t:123:F>
 *   [staff]         -> منشن رتب الستاف
 *   [ping]          -> منشن رتب المنشن
 *
 *   متغيرات الأزرار (من ضغط الزر — نفس من يضغط الزر في رسائل الأزرار):
 *   [actor]         -> منشن من ضغط الزر       <@123>
 *   [actor_name]    -> اسم من ضغط الزر        momen
 *   [actor_id]      -> آيدي من ضغط الزر       123456789
 *   [actor_role]    -> أعلى رتبة لمن ضغط الزر  <@&123>
 *   [member]        -> منشن العضو المستهدف (إضافة/إخراج/تحويل استلام)
 *   [opener]        -> منشن فاتح التذكرة      <@456>
 *   [opener_name]   -> اسم فاتح التذكرة       ahmed
 *   [claimed_by]    -> منشن مستلم التذكرة     <@789> (فارغ إن لم تكن مستلمة)
 *
 *   متغيرات الوقت (متاحة دائماً):
 *   [time]          -> الوقت الحالي           <t:1234567890:F>
 *   [date]          -> تاريخ اليوم            <t:1234567890:D>
 *   [day]           -> اسم اليوم              <t:1234567890:E>
 *   [year]          -> السنة                  2025
 *   [month]         -> الشهر (رقم)            11
 *
 * أي متغير بلا سياق (مثلاً [user] في رسالة عامة لا يفتحها عضو
 * معيّن) يبقى كما هو نصاً حرفياً بدل أن يتحول إلى "غير معروف".
 * =========================================================
 */

/**
 * استبدال المتغيرات في نص معيّن حسب السياق المتاح
 * @param {String} template
 * @param {Object} [context]
 * @param {Object} [context.member] - عضو (GuildMember) — يفعّل متغيرات العضو والأزرار ([actor])
 * @param {Object} [context.guild] - سيرفر (Guild) — يفعّل متغيرات السيرفر
 * @param {String} [context.channelName] - اسم روم التذكرة — يفعّل [ticket_name]
 * @param {String} [context.channelId] - آيدي روم التذكرة — يفعّل [channel]
 * @param {Number} [context.ticketNumber] - رقم التذكرة — يفعّل [ticket_number]
 * @param {String[]} [context.staffRoles] - آيدي رتب الستاف — يفعّل [staff]
 * @param {String[]} [context.pingRoles] - آيدي رتب المنشن — يفعّل [ping]
 * @param {Object} [context.opener] - فاتح التذكرة (GuildMember) — يفعّل [opener] و[opener_name]
 * @param {String} [context.openerId] - آيدي فاتح التذكرة (احتياط بدون جلب العضو) — يفعّل [opener]
 * @param {String} [context.claimedBy] - آيدي مستلم التذكرة — يفعّل [claimed_by]
 * @param {String} [context.categoryName] - اسم الكاتيجوري — يفعّل [category]
 * @param {Number} [context.ticketCreatedAt] - وقت فتح التذكرة (ms) — يفعّل [ticket_created]
 * @returns {String}
 */
function applyMessageVariables(
    template,
    {
        member,
        guild,
        channelName,
        channelId,
        ticketNumber,
        staffRoles,
        pingRoles,
        opener,
        openerId,
        claimedBy,
        categoryName,
        ticketCreatedAt,
    } = {}
) {
    let text = String(template || '');

    // ===== متغيرات العضو (وفي رسائل الأزرار: [actor] = من ضغط الزر) =====
    if (member) {
        const user = member.user || {};
        text = text
            .replaceAll('[user]', `<@${member.id}>`)
            .replaceAll('[actor]', `<@${member.id}>`)
            .replaceAll('[username]', user.username || '')
            .replaceAll('[actor_name]', user.username || '')
            .replaceAll('[id]', member.id)
            .replaceAll('[actor_id]', member.id);

        if (user.displayAvatarURL) {
            text = text.replaceAll('[avatar]', user.displayAvatarURL({ size: 256 }));
        }
        if (member.roles && member.roles.highest) {
            text = text
                .replaceAll('[highest_role]', `<@&${member.roles.highest.id}>`)
                .replaceAll('[actor_role]', `<@&${member.roles.highest.id}>`);
        }
        if (user.createdTimestamp) {
            text = text.replaceAll('[created_at]', `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`);
        }
        if (member.joinedTimestamp) {
            text = text.replaceAll('[joined_at]', `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`);
        }
    }

    // ===== متغيرات فاتح التذكرة =====
    const openerMember = opener || null;
    const openerMention = openerMember
        ? `<@${openerMember.id}>`
        : openerId
        ? `<@${openerId}>`
        : '';
    if (openerMention) text = text.replaceAll('[opener]', openerMention);
    if (openerMember) {
        const openerUser = openerMember.user || {};
        if (openerUser.username) text = text.replaceAll('[opener_name]', openerUser.username);
    }

    // ===== متغيرات مستلم التذكرة =====
    if (claimedBy) text = text.replaceAll('[claimed_by]', `<@${claimedBy}>`);

    // ===== متغيرات السيرفر =====
    if (guild) {
        text = text
            .replaceAll('[server]', guild.name)
            .replaceAll('[member_count]', String(guild.memberCount ?? ''))
            .replaceAll('[owner]', guild.ownerId ? `<@${guild.ownerId}>` : '')
            .replaceAll('[bot]', guild.client && guild.client.user ? `<@${guild.client.user.id}>` : '');
    }

    // ===== متغيرات التذكرة =====
    if (channelName) text = text.replaceAll('[ticket_name]', channelName);
    if (channelId) text = text.replaceAll('[channel]', `<#${channelId}>`);
    if (ticketNumber !== undefined && ticketNumber !== null) {
        text = text.replaceAll('[ticket_number]', String(ticketNumber));
    }
    if (categoryName) text = text.replaceAll('[category]', categoryName);
    if (ticketCreatedAt) {
        text = text.replaceAll('[ticket_created]', `<t:${Math.floor(ticketCreatedAt / 1000)}:F>`);
    }
    if (Array.isArray(staffRoles) && staffRoles.length) {
        text = text.replaceAll('[staff]', staffRoles.map(id => `<@&${id}>`).join(' '));
    }
    if (Array.isArray(pingRoles) && pingRoles.length) {
        text = text.replaceAll('[ping]', pingRoles.map(id => `<@&${id}>`).join(' '));
    }

    // ===== متغيرات الوقت (متاحة دائماً) =====
    const now = new Date();
    const unix = Math.floor(now.getTime() / 1000);
    text = text
        .replaceAll('[time]', `<t:${unix}:F>`)
        .replaceAll('[date]', `<t:${unix}:D>`)
        .replaceAll('[day]', `<t:${unix}:E>`)
        .replaceAll('[year]', String(now.getFullYear()))
        .replaceAll('[month]', String(now.getMonth() + 1));

    return text;
}

/**
 * نص عرض المتغيرات المدعومة — يُستخدم في إيمبد المعلومات
 */
const SUPPORTED_VARIABLES =
    '`[user]` العضو • `[username]` الاسم • `[id]` الآيدي • `[avatar]` صورة العضو • `[created_at]` تاريخ الحساب • `[joined_at]` تاريخ الانضمام • `[highest_role]` أعلى رتبة • `[server]` اسم السيرفر • `[member_count]` عدد الأعضاء • `[owner]` المالك • `[bot]` البوت • `[ticket_name]` اسم التكت • `[channel]` منشن التكت • `[ticket_number]` رقم التكت • `[category]` الكاتيجوري • `[ticket_created]` تاريخ الفتح • `[staff]` الستاف • `[ping]` المنشن • `[time]` الوقت • `[date]` التاريخ • `[day]` اليوم • `[year]` السنة • `[month]` الشهر • `[actor]` من ضغط الزر • `[actor_name]` اسمه • `[actor_id]` آيديه • `[actor_role]` رتبته • `[member]` العضو المستهدف • `[opener]` فاتح التكت • `[opener_name]` اسمه • `[claimed_by]` المستلم';

module.exports = { applyMessageVariables, SUPPORTED_VARIABLES };

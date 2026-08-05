/**
 * =========================================================
 *  handlers/dashboardBuilder.js
 * =========================================================
 * ملف مشترك (Shared Utility) مسؤول فقط عن "بناء" الإيمبدات
 * والأزرار والقوائم، بدون أي منطق تفاعل (Interaction Logic).
 *
 * السبب في فصله عن الأمر والـ Handlers:
 * لأن نفس "الواجهة الرئيسية" تُستدعى من مكانين:
 *   1. عند تشغيل الأمر لأول مرة (/ticket-setup) -> Reply
 *   2. عند الضغط على زر [رجوع] -> Update
 * فبدل تكرار كود بناء الإيمبد مرتين، نضعه هنا مرة واحدة.
 *
 * 🎨 تم توحيد التصميم مع باقي لوحات البوت (لوحة الإيمبد):
 *    - اللون الرئيسي: أزرق Discord 0x5865F2
 *    - صف الأزرار: إنشاء (Success) + عرض/تعديل/إرسال (Primary) + حذف (Danger)
 *    - الإيموجي داخل نص الزر (وليس كـ emoji منفصل)
 *    - الفوتر يعرض الإصدار مثل باقي اللوحات
 * =========================================================
 */

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');

const { getAllPanels } = require('../database/panelsDB');
const { getTicketSettings } = require('../database/ticketSettingsDB');
const { safeEmoji } = require('../utils/emoji');
const { formatDuration, SECOND_MS, MINUTE_MS, HOUR_MS, DAY_MS } = require('../utils/durationParser');
const { version } = require('../../package.json');
const { buildRatingSettingsPage } = require('./ticketRatingHandler');
const { appendDecorativeOption } = require('../../src/utils/decorativeReset');

// ألوان موحدة مع باقي لوحات البوت (نفس لوحة الإيمبد)
const COLORS = {
    main: 0x5865f2,   // أزرق Discord
    sub: 0x2b2d31,    // رمادي داكن للوحات الفرعية
};

/**
 * بناء "الواجهة الرئيسية" للوحة التحكم - بنفس شكل لوحة الإيمبد
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildMainDashboard() {
    const embed = new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle('🎫 لوحة تحكم نظام التذاكر')
        .setDescription('🔒 هذه اللوحة خاصة بك أنت فقط — لا يراها أحد غيرك.\n\nاختر أحد الخيارات أدناه:')
        .setFooter({ text: `الإصدار: ${version}` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_add')
            .setLabel('➕ إضافة تكت')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('ticket_edit')
            .setLabel('✏️ تعديل تكت')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_log')
            .setLabel('📜 سجل التكتات')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_delete')
            .setLabel('🗑️ حذف تكت')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('ticket_send')
            .setLabel('📤 إرسال تكت')
            .setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_settings')
            .setLabel('⚙️ إعدادات عامة')
            .setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], components: [row, row2] };
}

/**
 * بناء صفحة "⚙️ إعدادات عامة" لنظام التذاكر — مرتبة ومجمّعة:
 *   🎫 حدود الفتح • 👥 الاستلام • 🤖 الإغلاق التلقائي • 🗑️ الحذف • 🔢 الترقيم • 🛠️ الصيانة
 *
 * القواعد:
 *   - الإدارة (Administrator) لا يشملها أي حد أو كولداون.
 *   - القيمة 0 = بدون حد / معطّل.
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
/** تصنيف كل مفتاح إعداد (لتحديد أي صفحة تُعاد بعد التعديل) */
const KEY_CATEGORY = {
    maxOpenPerUser: 'limits',
    maxOpenPerPanelPerUser: 'limits',
    openCooldownMinutes: 'limits',
    maxClaimsPerStaff: 'limits',
    claimSlaMinutes: 'limits',
    autoCloseEnabled: 'auto_close',
    autoCloseIdleHours: 'auto_close',
    autoCloseGraceHours: 'auto_close',
    autoCloseAction: 'auto_close',
    maxTicketAgeHours: 'auto_close',
    deleteCountdownSeconds: 'delete',
    archiveOnDelete: 'delete',
    autoPurgeLockedDays: 'delete',
    maintenanceEnabled: 'maintenance',
    maintenanceMessage: 'maintenance',
    ticketNumberStart: 'maintenance',
    workHoursEnabled: 'work_hours',
    workHoursStart: 'work_hours',
    workHoursEnd: 'work_hours',
};

/**
 * تحديد الصفحة المناسبة بعد تعديل إعداد:
 * إذا كان المفتاح ضمن تصنيف واحد نُعيد صفحة ذلك التصنيف،
 * وإلا صفحة التصنيفات.
 * @param {String[]} keys - مفاتيح الإعدادات التي تغيّرت
 */
function buildPageForSettings(keys) {
    const cats = [...new Set(keys.map(k => KEY_CATEGORY[k]).filter(Boolean))];
    return cats.length === 1 ? buildTicketSettingsCategory(cats[0]) : buildTicketSettingsPage();
}

/**
 * صفحة التصنيفات الرئيسية — كل زر يفتح تصنيفاً داخل نفس اللوحة:
 *   1) 🎫 حدود الفتح والاستلام
 *   2) 🤖 الإغلاق التلقائي (الخمول + حد العمر)
 *   3) 🗑️ الحذف والأرشفة والتنظيف
 *   4) 🛠️ الصيانة والترقيم
 *   5) 🌙 ساعات العمل
 *   6) 🚫 قائمة الحظر
 *   7) ⭐ التقييم والملاحظات
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildTicketSettingsPage() {
    const s = getTicketSettings();
    const version = require('../../package.json').version;

    const embed = new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle('⚙️ الإعدادات العامة — التصنيفات')
        .setDescription(
            'اختر تصنيفاً لعرض إعداداته وضبطها (تظهر الواجهة في نفس اللوحة).\n' +
            '👑 **الإدارة لا يشملها أي حد أو كولداون** — القيمة **0** = بدون حد/معطّل.'
        )
        .addFields(
            { name: '🎫 حدود الفتح والاستلام', value: '👤 العضو • 📁 البنل • ⏱️ الكولداون • 👥 حد الستاف • ⏳ مهلة الرد', inline: true },
            { name: '🤖 الإغلاق التلقائي', value: '⏰ مدة الخمول • 🕰️ السماح • 🔒/🗑️ الإجراء • ⏱️ حد العمر', inline: true },
            { name: '🗑️ الحذف والأرشفة', value: '⏱️ مدة الحذف • 📜 الأرشيف • 🧹 تنظيف المقفلات', inline: true },
            { name: '🛠️ الصيانة والترقيم', value: '🛠️ وضع الصيانة • 💬 رسالته • 🔢 بداية الترقيم', inline: true },
            { name: '🌙 ساعات العمل', value: 'تشغيل/إيقاف • 🌅 البداية • 🌇 النهاية', inline: true },
            { name: '🚫 قائمة الحظر', value: `عدد المحظورين: **${(s.blockedUsers || []).length}**`, inline: true },
            {
                name: '⭐ التقييم والملاحظات',
                value: `روم التقييمات: ${s.ratingChannelId ? `<#${s.ratingChannelId}>` : '❌'}\nروم الملاحظات: ${s.notesChannelId ? `<#${s.notesChannelId}>` : '❌'}`,
                inline: true,
            }
        )
        .setFooter({ text: `الإصدار: ${version}` })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_settings_cat_limits').setLabel('🎫 حدود الفتح والاستلام').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_cat_auto_close').setLabel('🤖 الإغلاق التلقائي').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_cat_delete').setLabel('🗑️ الحذف والأرشفة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_cat_maintenance').setLabel('🛠️ الصيانة والترقيم').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_cat_work_hours').setLabel('🌙 ساعات العمل').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_settings_cat_blacklist').setLabel('🚫 قائمة الحظر').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_settings_cat_rating').setLabel('⭐ التقييم والملاحظات').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2] };
}

/**
 * بناء صفحة تصنيف فرعي داخل نفس اللوحة (مع زر رجوع للتصنيفات).
 * الأزرار تعيد استخدام نفس customIds — فلا حاجة لأي توجيه جديد.
 * @param {String} catId - limits | auto_close | delete | maintenance | work_hours
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }|null}
 */
function buildTicketSettingsCategory(catId) {
    const s = getTicketSettings();
    const version = require('../../package.json').version;

    const num = v => (v > 0 ? `**${v}**` : 'بدون حد');
    const onoff = v => (v ? '✅ مفعّل' : '❌ معطّل');
    const dur = (v, unitMs, zero) => `**${formatDuration(v * unitMs, zero)}**`;
    const toggleStyle = v => (v ? ButtonStyle.Success : ButtonStyle.Secondary);

    const back = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_settings_back').setLabel('🔙 رجوع للتصنيفات').setStyle(ButtonStyle.Secondary)
    );

    if (catId === 'limits') {
        const embed = new EmbedBuilder()
            .setColor(COLORS.main)
            .setTitle('🎫 حدود الفتح والاستلام')
            .setDescription('القيمة **0** = بدون حد — 👑 الإدارة غير مشمولة.')
            .addFields(
                { name: '👤 تذاكر متزامنة للعضو', value: `${num(s.maxOpenPerUser)}`, inline: true },
                { name: '📁 من نفس البنل', value: `${num(s.maxOpenPerPanelPerUser)}`, inline: true },
                { name: '⏱️ كولداون الفتح', value: `${dur(s.openCooldownMinutes, MINUTE_MS, 'بدون')}`, inline: true },
                { name: '👥 حد استلام الستاف', value: `${num(s.maxClaimsPerStaff)}`, inline: true },
                { name: '⏳ مهلة رد الستاف (SLA)', value: `${dur(s.claimSlaMinutes, MINUTE_MS, 'بدون')}\n(بلا رد = إلغاء استلام تلقائي)`, inline: true }
            )
            .setFooter({ text: `الإصدار: ${version}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_settings_max_open').setLabel('👤 حد تذاكر العضو').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_settings_max_panel').setLabel('📁 حد تذاكر البنل').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_settings_cooldown').setLabel('⏱️ كولداون الفتح').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_settings_max_claims').setLabel('👥 حد استلام الستاف').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_settings_claim_sla').setLabel('⏳ مهلة رد الستاف').setStyle(ButtonStyle.Primary)
        );
        return { embeds: [embed], components: [row, back] };
    }

    if (catId === 'auto_close') {
        const embed = new EmbedBuilder()
            .setColor(COLORS.main)
            .setTitle('🤖 الإغلاق التلقائي (الخمول + حد العمر)')
            .setDescription('الخمول: تنبيه بعد الساعات المحددة ثم تنفيذ الإجراء بعد فترة السماح.\nحد العمر: مفتوحة أكثر من المدة → نفس الإجراء حتى مع وجود رسائل.')
            .addFields(
                { name: '🔄 الحالة', value: `${onoff(s.autoCloseEnabled)}`, inline: true },
                { name: '⏰ تنبيه بعد خمول', value: `${dur(s.autoCloseIdleHours, HOUR_MS, 'بدون')}`, inline: true },
                { name: '🕰️ سماح إضافي', value: `${dur(s.autoCloseGraceHours, HOUR_MS, 'بدون')}`, inline: true },
                { name: '🔒/🗑️ إجراء التنفيذ', value: s.autoCloseAction === 'delete' ? '🗑️ حذف نهائي' : '🔒 قفل فقط', inline: true },
                { name: '⏱️ حد عمر التذكرة', value: `${dur(s.maxTicketAgeHours, HOUR_MS, 'معطّل (0)')}`, inline: true }
            )
            .setFooter({ text: `الإصدار: ${version}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_settings_auto_close')
                .setLabel(`🤖 تفعيل الخمول: ${onoff(s.autoCloseEnabled)}`)
                .setStyle(toggleStyle(s.autoCloseEnabled)),
            new ButtonBuilder().setCustomId('ticket_settings_auto_close_idle').setLabel('⏰ مدة الخمول').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_settings_auto_close_grace').setLabel('🕰️ مهلة السماح').setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('ticket_settings_auto_close_action')
                .setLabel(s.autoCloseAction === 'delete' ? '🗑️ إجراء الخمول: حذف' : '🔒 إجراء الخمول: قفل')
                .setStyle(s.autoCloseAction === 'delete' ? ButtonStyle.Danger : ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_settings_max_age').setLabel('⏱️ حد عمر التذكرة').setStyle(ButtonStyle.Primary)
        );
        return { embeds: [embed], components: [row, back] };
    }

    if (catId === 'delete') {
        const embed = new EmbedBuilder()
            .setColor(COLORS.main)
            .setTitle('🗑️ الحذف والأرشفة والتنظيف')
            .setDescription('الإعدادات الخاصة بحذف التذاكر وأرشفتها وتنظيف المقفلات تلقائياً.')
            .addFields(
                { name: '⏱️ العد التنازلي قبل الحذف', value: `${dur(s.deleteCountdownSeconds, SECOND_MS, '0')}`, inline: true },
                { name: '📜 أرشيف HTML عند الحذف', value: `${onoff(s.archiveOnDelete)}`, inline: true },
                { name: '🧹 تنظيف المقفلات', value: `${dur(s.autoPurgeLockedDays, DAY_MS, 'معطّل (0)')}\n(بعد القفل → حذف تلقائي)`, inline: true }
            )
            .setFooter({ text: `الإصدار: ${version}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_settings_delete_countdown').setLabel('⏱️ مدة الحذف').setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('ticket_settings_archive')
                .setLabel(`📜 الأرشيف: ${onoff(s.archiveOnDelete)}`)
                .setStyle(toggleStyle(s.archiveOnDelete)),
            new ButtonBuilder().setCustomId('ticket_settings_purge_locked').setLabel('🧹 تنظيف المقفلات').setStyle(ButtonStyle.Primary)
        );
        return { embeds: [embed], components: [row, back] };
    }

    if (catId === 'maintenance') {
        const embed = new EmbedBuilder()
            .setColor(COLORS.main)
            .setTitle('🛠️ الصيانة والترقيم')
            .setDescription('وضع الصيانة يمنع فتح كل التذاكر برسالة مخصصة — والإدارة غير مشمولة.')
            .addFields(
                { name: '🛠️ وضع الصيانة', value: `${onoff(s.maintenanceEnabled)}`, inline: true },
                { name: '💬 رسالة الصيانة', value: s.maintenanceMessage ? String(s.maintenanceMessage).slice(0, 150) : 'افتراضية', inline: true },
                { name: '🔢 بداية رقم التذاكر', value: `**${s.ticketNumberStart}**`, inline: true }
            )
            .setFooter({ text: `الإصدار: ${version}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_settings_maintenance')
                .setLabel(`🛠️ وضع الصيانة: ${onoff(s.maintenanceEnabled)}`)
                .setStyle(toggleStyle(s.maintenanceEnabled)),
            new ButtonBuilder().setCustomId('ticket_settings_maintenance_msg').setLabel('💬 رسالة الصيانة').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_settings_number_start').setLabel('🔢 بداية الترقيم').setStyle(ButtonStyle.Primary)
        );
        return { embeds: [embed], components: [row, back] };
    }

    if (catId === 'work_hours') {
        const embed = new EmbedBuilder()
            .setColor(COLORS.main)
            .setTitle('🌙 ساعات العمل')
            .setDescription('خارج النطاق المحدد يُمنع فتح التذاكر (يدعم النطاق الليلي الممتد).')
            .addFields(
                { name: '🔄 الحالة', value: `${onoff(s.workHoursEnabled)}`, inline: true },
                { name: '🌅 ساعة البداية', value: `**${String(s.workHoursStart).padStart(2, '0')}:00**`, inline: true },
                { name: '🌇 ساعة النهاية', value: `**${String(s.workHoursEnd).padStart(2, '0')}:00**`, inline: true }
            )
            .setFooter({ text: `الإصدار: ${version}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_settings_work_hours')
                .setLabel(`🌙 ساعات العمل: ${onoff(s.workHoursEnabled)}`)
                .setStyle(toggleStyle(s.workHoursEnabled)),
            new ButtonBuilder().setCustomId('ticket_settings_work_start').setLabel('🌅 ساعة البداية').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_settings_work_end').setLabel('🌇 ساعة النهاية').setStyle(ButtonStyle.Primary)
        );
        return { embeds: [embed], components: [row, back] };
    }

    return null;
}
function buildBlacklistPage() {
    const s = getTicketSettings();
    const blocked = (s.blockedUsers || []).slice(0, 20);

    // تنسيق المنشن حسب النوع: عضو <@id> أو رول <@&id> (القديم بلا type = عضو)
    const mentionOf = b => (b.type === 'role' ? `<@&${b.id}>` : `<@${b.id}>`);

    let description;
    if (blocked.length === 0) {
        description = 'لا يوجد أعضاء أو رولات محظورة حالياً.\nاستخدم **[➕ إضافة]** لحظر عضو أو رول من فتح التذاكر.';
    } else {
        description = blocked
            .map(
                (b, i) =>
                    `${i + 1}. ${mentionOf(b)} (\`${b.id}\`) — ${b.reason}\n   منذ <t:${Math.floor(b.at / 1000)}:R>`
            )
            .join('\n')
            .slice(0, 1024);
    }

    const embed = new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle('🚫 قائمة حظر فتح التذاكر')
        .setDescription(description)
        .setFooter({ text: `الإصدار: ${version} | المحظورون لا يستطيعون فتح أي تذكرة` })
        .setTimestamp();

    const removeSelect = new StringSelectMenuBuilder()
        .setCustomId('ticket_settings_blacklist_remove')
        .setPlaceholder('🗑️ اختر محظوراً لإزالته...')
        .setMaxValues(1);

    if (blocked.length === 0) {
        removeSelect.addOptions({ label: 'لا يوجد محظورون', value: 'none', emoji: '❌' }).setDisabled(true);
    } else {
        removeSelect.addOptions(
            ...blocked.slice(0, 25).map(b => ({
                label: String(b.reason || (b.type === 'role' ? 'رول محظور' : b.id)).slice(0, 80),
                value: b.id,
                description: `${mentionOf(b)} — ${b.reason}`.slice(0, 100),
            }))
        );
    }

    // ملاحظة: القائمة المنسدلة تأخذ عرض الصف كاملاً في ديسكورد،
    // فلا يجوز خلطها مع أزرار في نفس الصف (سبب COMPONENT_LAYOUT_WIDTH_EXCEEDED)
    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_settings_blacklist_add').setLabel('➕ إضافة عضو أو رول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_settings_back').setLabel('🔙 رجوع للإعدادات').setStyle(ButtonStyle.Secondary)
    );
    const rowSelect = new ActionRowBuilder().addComponents(removeSelect);

    return { embeds: [embed], components: [rowButtons, rowSelect] };
}

/**
 * بناء "اللوحة الفرعية" (Sub-panel) لأي من: تعديل / سجل / حذف / إرسال
 * بنفس شكل لوحات الإيمبد: رسالة نصية + قائمة منسدلة + زر رجوع
 *
 * @param {'edit'|'log'|'delete'|'send'} type - نوع اللوحة الفرعية
 * @returns {{ content: String, embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildSubPanel(type) {
    const content = {
        edit: '✏️ اختر التكت الذي تريد تعديله:',
        log: '📜 اختر التكت الذي تريد عرض سجله:',
        delete: '🗑️ اختر التكت الذي تريد حذفه:',
        send: '📤 اختر التكت الذي تريد إرساله:',
    };

    // جلب اللوحات المحفوظة من قاعدة البيانات
    const panels = getAllPanels();

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ticket_select_${type}`)
        .setPlaceholder('🎫 اختر تكت...');

    // قائمة "إرسال" تسمح باختيار **عدة بنلات** دفعة واحدة لنشرها كباقة
    // (الباقي: تعديل/سجل/حذف) يبقى باختيار واحد
    if (type === 'send' && panels.length > 1) {
        selectMenu.setMinValues(1).setMaxValues(Math.min(panels.length, 25));
        selectMenu.setPlaceholder('🎫 اختر بنلاً واحداً أو أكثر (باقة) لنشرها معاً...');
    }

    if (panels.length === 0) {
        // ⚠️ ديسكورد يرفض القوائم المنسدلة الفارغة تماماً (تسبب خطأ عند الإرسال)
        // لذلك نضع خياراً وهمياً واحداً عند عدم وجود أي لوحات محفوظة
        selectMenu.addOptions({
            label: 'لا يوجد أي تكت حالياً',
            value: 'none',
            emoji: '❌',
        });
        selectMenu.setDisabled(true); // تعطيل القائمة لأنه لا يوجد ما يُختار
    } else {
        selectMenu.addOptions(
            panels
                .slice(0, 25) // حد ديسكورد: 25 خيار كحد أقصى للقائمة الواحدة
                .map(panel => ({
                    label: panel.name.slice(0, 100),
                    description: (panel.description ? String(panel.description).slice(0, 100) : undefined) || 'لا يوجد وصف',
                    value: panel.name.slice(0, 100),
                    emoji: safeEmoji(panel.emoji),
                }))
        );
    }

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_back')
            .setLabel('🔙 رجوع')
            .setStyle(ButtonStyle.Secondary)
    );

    return {
        content: content[type],
        embeds: [],
        components: appendDecorativeOption([selectRow, backRow]),
    };
}

module.exports = {
    buildMainDashboard,
    buildSubPanel,
    buildTicketSettingsPage,
    buildTicketSettingsCategory,
    buildPageForSettings,
    buildBlacklistPage,
    buildRatingSettingsPage,
};

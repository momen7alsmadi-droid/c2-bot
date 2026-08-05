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
const { version } = require('../../package.json');
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
function buildTicketSettingsPage() {
    const s = getTicketSettings();
    const version = require('../../package.json').version;

    const num = v => (v > 0 ? `**${v}**` : 'بدون حد');
    const onoff = v => (v ? '✅ مفعّل' : '❌ معطّل');
    const mins = v => (v > 0 ? `**${v}** دقيقة` : 'بدون');

    const embed = new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle('⚙️ إعدادات عامة لنظام التذاكر')
        .setDescription(
            '👑 **الإدارة (Administrator) لا يشملها أي حد أو كولداون.**\n' +
            '• القيمة **0** = بدون حد / معطّل.\n' +
            '• **كل إجراء تلقائي من البوت يُسجَّل في روم اللوق.**'
        )
        .addFields(
            {
                name: '🎫 حدود الفتح',
                value: `👤 تذاكر متزامنة للعضو: ${num(s.maxOpenPerUser)}\n📁 من نفس البنل: ${num(s.maxOpenPerPanelPerUser)}\n⏱️ كولداون الفتح: ${mins(s.openCooldownMinutes)}`,
                inline: true,
            },
            {
                name: '👥 الاستلام',
                value: `👥 حد الاستلام المتزامن للستاف: ${num(s.maxClaimsPerStaff)}\n⏳ مهلة رد الستاف (SLA): ${mins(s.claimSlaMinutes)}\n   (بلا رد = إلغاء استلام تلقائي)`,
                inline: true,
            },
            {
                name: '🤖 الإغلاق التلقائي (الخمول)',
                value:
                    `الحالة: ${onoff(s.autoCloseEnabled)}\n` +
                    `⏰ تنبيه بعد خمول: **${s.autoCloseIdleHours} ساعة**\n` +
                    `🕰️ ثم سماح: **${s.autoCloseGraceHours} ساعة**\n` +
                    `الإجراء عند التنفيذ: ${s.autoCloseAction === 'delete' ? '🗑️ حذف نهائي' : '🔒 قفل فقط'}`,
                inline: true,
            },
            {
                name: '🗑️ الحذف والأرشفة',
                value: `⏱️ العد التنازلي قبل الحذف: **${s.deleteCountdownSeconds} ثانية**\n📜 أرشيف HTML في اللوق عند الحذف: ${onoff(s.archiveOnDelete)}`,
                inline: true,
            },
            {
                name: '🔢 الترقيم',
                value: `🔢 بداية رقم التذاكر: **${s.ticketNumberStart}**`,
                inline: true,
            },
            {
                name: '🛠️ وضع الصيانة',
                value:
                    `الحالة: ${onoff(s.maintenanceEnabled)}\n💬 الرسالة: ${s.maintenanceMessage ? '\n' + String(s.maintenanceMessage).slice(0, 150) : 'افتراضية'}`,
                inline: true,
            },
            {
                name: '🌙 ساعات العمل',
                value:
                    `الحالة: ${onoff(s.workHoursEnabled)}\n⏰ من **${String(s.workHoursStart).padStart(2, '0')}:00** إلى **${String(s.workHoursEnd).padStart(2, '0')}:00**\n   (خارجها يُمْنع الفتح)`,
                inline: true,
            },
            {
                name: '🚫 قائمة الحظر',
                value: `عدد المحظورين: **${(s.blockedUsers || []).length}**\nاضغط [قائمة الحظر] للعرض/الإضافة/الإزالة`,
                inline: true,
            },
            {
                name: '⏱️ حد عمر التذكرة',
                value:
                    `بعد **${s.maxTicketAgeHours > 0 ? s.maxTicketAgeHours + ' ساعة' : 'معطّل (0)'}** مفتوحة → ${s.autoCloseAction === 'delete' ? '🗑️ حذف' : '🔒 قفل'} تلقائي\n🧹 تنظيف المقفلات: ${s.autoPurgeLockedDays > 0 ? 'بعد **' + s.autoPurgeLockedDays + ' يوم** → حذف' : 'معطّل (0)'}`,
                inline: true,
            }
        )
        .setFooter({ text: `الإصدار: ${version}` })
        .setTimestamp();

    // ---------- الأزرار (3 صفوف × 5) ----------
    const toggleStyle = v => (v ? ButtonStyle.Success : ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_settings_max_open').setLabel('👤 حد تذاكر العضو').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_max_panel').setLabel('📁 حد تذاكر البنل').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_cooldown').setLabel('⏱️ كولداون الفتح').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_max_claims').setLabel('👥 حد استلام الستاف').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_claim_sla').setLabel('⏳ مهلة رد الستاف').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_settings_auto_close')
            .setLabel(`🤖 إغلاق الخمول: ${onoff(s.autoCloseEnabled)}`)
            .setStyle(toggleStyle(s.autoCloseEnabled)),
        new ButtonBuilder().setCustomId('ticket_settings_auto_close_idle').setLabel('⏰ ساعات الخمول').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_auto_close_grace').setLabel('🕰️ سماح التنبيه').setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_settings_auto_close_action')
            .setLabel(s.autoCloseAction === 'delete' ? '🗑️ إجراء الخمول: حذف' : '🔒 إجراء الخمول: قفل')
            .setStyle(s.autoCloseAction === 'delete' ? ButtonStyle.Danger : ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_delete_countdown').setLabel('⏱️ ثواني الحذف').setStyle(ButtonStyle.Primary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_settings_number_start').setLabel('🔢 بداية الترقيم').setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_settings_archive')
            .setLabel(`📜 أرشيف عند الحذف: ${onoff(s.archiveOnDelete)}`)
            .setStyle(toggleStyle(s.archiveOnDelete)),
        new ButtonBuilder()
            .setCustomId('ticket_settings_maintenance')
            .setLabel(`🛠️ وضع الصيانة: ${onoff(s.maintenanceEnabled)}`)
            .setStyle(toggleStyle(s.maintenanceEnabled)),
        new ButtonBuilder().setCustomId('ticket_settings_maintenance_msg').setLabel('💬 رسالة الصيانة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_blacklist').setLabel('🚫 قائمة الحظر').setStyle(ButtonStyle.Danger)
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_settings_work_hours')
            .setLabel(`🌙 ساعات العمل: ${onoff(s.workHoursEnabled)}`)
            .setStyle(toggleStyle(s.workHoursEnabled)),
        new ButtonBuilder().setCustomId('ticket_settings_work_start').setLabel('🌅 ساعة البداية').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_work_end').setLabel('🌇 ساعة النهاية').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_max_age').setLabel('⏱️ حد عمر التذكرة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_settings_purge_locked').setLabel('🧹 تنظيف المقفلات').setStyle(ButtonStyle.Primary)
    );

    const row5 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

/**
 * بناء صفحة "🚫 قائمة الحظر" — منع أعضاء محددين من فتح التذاكر:
 *   - عرض المحظورين (آيدي + السبب + التاريخ)
 *   - زر ➕ إضافة عضو (Modal: آيدي + سبب)
 *   - قائمة منسدلة لإزالة محظور
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildBlacklistPage() {
    const s = getTicketSettings();
    const blocked = (s.blockedUsers || []).slice(0, 20);

    let description;
    if (blocked.length === 0) {
        description = 'لا يوجد أعضاء محظورون حالياً.\nاستخدم **[➕ إضافة عضو]** لحظر شخص من فتح التذاكر.';
    } else {
        description = blocked
            .map(
                (b, i) =>
                    `${i + 1}. <@${b.id}> (\`${b.id}\`) — ${b.reason}\n   منذ <t:${Math.floor(b.at / 1000)}:R>`
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
                label: String(b.reason || b.id).slice(0, 80),
                value: b.id,
                description: `<@${b.id}> — ${b.reason}`.slice(0, 100),
            }))
        );
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_settings_blacklist_add').setLabel('➕ إضافة عضو').setStyle(ButtonStyle.Success),
        removeSelect,
        new ButtonBuilder().setCustomId('ticket_settings_back').setLabel('🔙 رجوع للإعدادات').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
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
    buildBlacklistPage,
};

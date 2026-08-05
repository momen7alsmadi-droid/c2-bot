# نظام التذاكر الكامل (الأجزاء 1 + 2 + 3)

## هيكل المشروع
```
ticket-system/
├── commands/
│   └── ticket-setup.js            # أمر /ticket-setup (لوحة الإدارة)
├── database/
│   └── panelsDB.js                # قاعدة بيانات إعدادات البنلات (JSON)
├── data/
│   └── panels.json
└── handlers/
    ├── dashboardBuilder.js        # اللوحة الرئيسية + اللوحات الفرعية (ج1)
    ├── panelSettingsBuilder.js    # صفحات إعدادات البنل (ج2)
    ├── modalsBuilder.js           # كل الـ Modals (إنشاء/تعديل/ترحيب/تسمية)
    ├── sessionStore.js            # جلسة لوحة الإدارة (message.id -> panel/page)
    ├── buttonHandler.js           # أزرار لوحة الإدارة
    ├── selectMenuHandler.js       # StringSelectMenu للوحة الإدارة
    ├── roleSelectHandler.js       # RoleSelectMenu لإعدادات الرتب
    ├── channelSelectHandler.js    # ChannelSelectMenu لإعدادات الرومات + نشر البنل
    ├── modalHandler.js            # استقبال كل الـ Modals
    │
    ├── publicPanelBuilder.js      # رسالة البنل العامة (ج3)
    ├── permissionUtils.js         # فحوصات الصلاحيات (ستاف/إدارة/مسموح)
    ├── ticketPermissionHelpers.js # تطبيق صلاحيات الروم الفعلية
    ├── ticketStore.js             # جلسة التذكرة + سجل الأحداث المؤقت (ج3)
    ├── ticketControlBuilder.js    # أزرار/قائمة التحكم داخل التذكرة
    ├── ticketCreateHandler.js     # فتح تذكرة جديدة
    ├── ticketControlHandler.js    # استلام/إلغاء استلام + قفل/فتح
    ├── ticketStaffMenuHandler.js  # قائمة تحكم الستاف (7 خيارات)
    ├── userSelectHandler.js       # UserSelectMenu (إضافة/إخراج/تحويل)
    ├── ticketCloseHandler.js      # رسالة الإغلاق + عد الحذف التنازلي
    └── transcriptLogger.js        # ترانسكربت + لوق + حذف نهائي
```

## تثبيت مكتبة الترانسكربت (اختياري لكن يُنصح به بشدة)
```
npm install discord-html-transcripts
```
إن لم تُثبَّت، يستخدم النظام مولّد HTML بسيط احتياطي تلقائياً
(انظر `generateTranscriptFile` في transcriptLogger.js) حتى لا ينهار البوت.

## طريقة الربط الكاملة في index.js (توضيحي فقط)
```js
const { handleTicketButton }       = require('./handlers/buttonHandler');
const { handleTicketSelectMenu }   = require('./handlers/selectMenuHandler');
const { handleRoleSelectMenu }     = require('./handlers/roleSelectHandler');
const { handleChannelSelectMenu }  = require('./handlers/channelSelectHandler');
const { handleTicketModal }        = require('./handlers/modalHandler');

const { handleTicketCreate }        = require('./handlers/ticketCreateHandler');
const { handleTicketControlButton } = require('./handlers/ticketControlHandler');
const { handleTicketStaffMenu }     = require('./handlers/ticketStaffMenuHandler');
const { handleUserSelectMenu }      = require('./handlers/userSelectHandler');
const { handleTicketCloseButton }   = require('./handlers/ticketCloseHandler');

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        // تنفيذ الأوامر العادية (بما فيها ticket-setup)
    }

    if (interaction.isButton()) {
        // ترتيب مهم: نجرب كل معالج، وكل واحد يتجاهل customId الذي لا يخصه
        if (interaction.customId.startsWith('ticket_open:')) {
            await handleTicketCreate(interaction);
        } else if (['ticket_claim', 'ticket_lock'].includes(interaction.customId)) {
            await handleTicketControlButton(interaction);
        } else if (['ticket_reopen', 'ticket_delete_confirm', 'ticket_delete_cancel'].includes(interaction.customId)) {
            await handleTicketCloseButton(interaction);
        } else {
            await handleTicketButton(interaction); // أزرار لوحة الإدارة (ج1+ج2)
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('ticket_open_select:')) {
            await handleTicketCreate(interaction);
        } else if (interaction.customId === 'ticket_staff_menu') {
            await handleTicketStaffMenu(interaction);
        } else {
            await handleTicketSelectMenu(interaction); // قوائم لوحة الإدارة (ج1+ج2)
        }
    }

    if (interaction.isRoleSelectMenu())    await handleRoleSelectMenu(interaction);
    if (interaction.isChannelSelectMenu()) await handleChannelSelectMenu(interaction);
    if (interaction.isUserSelectMenu())    await handleUserSelectMenu(interaction);
    if (interaction.isModalSubmit())       await handleTicketModal(interaction);
});
```

## سجل الأحداث المؤقت (Audit Log) - كيف يُخزَّن؟
راجع `handlers/ticketStore.js`. عند فتح كل تذكرة تُنشأ جلسة في
Map بالذاكرة (`channelId -> session`)، وكل حدث مهم (استلام، إلغاء
استلام، قفل، فتح، تسمية، إضافة/إخراج عضو، تحويل، تصعيد) يُضاف
كسطر عبر `addAuditLog(channelId, text)`. عند اكتمال العد التنازلي
للحذف، يستدعي `transcriptLogger.js` هذه المصفوفة لبناء حقل "سجل
الأحداث" في إيمبد اللوق، ثم تُمسح الجلسة نهائياً بعد الإرسال.

## إحصائيات الرسائل
`transcriptLogger.js` يجلب كل رسائل القناة (Pagination عبر
`before`, حتى 1000 رسالة كسقف احترازي) **قبل** حذف القناة، يحسب
عدد رسائل كل عضو (بشري فقط، بدون رسائل البوت)، ثم يبني حقل
"إحصائيات الرسائل" مرتباً تنازلياً حسب عدد الرسائل.

## رسالة الترحيب (منفصلة عن أزرار التحكم)
عند فتح تذكرة يُرسَل **رسالتان**:
1. **رسالة الترحيب** — رسالة منفصلة تماماً (قابلة للتخصيص من صفحة "الرسائل"):
   - النوع: `🖼️ إيمبد` (عنوان + وصف + لون + صورة) أو `📝 نص عادي`
   - `content` = الكلام خارج الإيمبد (في وضع الإيمبد) / نص الرسالة (في وضع النص العادي)
   - كل النصوص تدعم المتغيرات (`[user] [server] [time] ... إلخ`)
   - التخزين: `panel.welcomeSettings = { type, content, title, description, color, image }`
     (الحقل القديم `panel.welcomeMessage` بقي كـ fallback للوصف)
2. **رسالة التحكم** — المنشن + الإيمبد فوق الأزرار (`panel.ticketEmbed`) + صف أزرار (استلام/قفل) + قائمة الستاف.

## إحصائيات الستاف 📊
من لوحة الإدارة `/لوحة_الادارة`:
- 📊 احصائياتي — نقاط + **📊 المستوى** مع شريط تقدم للمستوى التالي، تكتات
  مستلمة/مغلقة، رسائل، ⚡ سرعة الاستلام (متوسط)، تقييمات
- 📊 إحصائياتي المفصلة — رسالة مخفية (Ephemeral) بها 21 حقلاً:
  🎫 قيد المعالجة/حوّلها/استلمها من غيره/حذفها نهائياً
  ⏱️ أسرع استلام/أسرع إغلاق/متوسط مدة/أطول جلسة/أطول تكت رسائل/آخر تواجد
  💬 رسائل اليوم/منشنات/مرفقات/ردود على أعضاء
  ⭐ 5 نجوم/سلبية + 🧬 XP/مستوى/مركز بالسيرفر
- 🏆 توب نقاط — ترتيب الأعلى نقاطاً مع ⚡ سرعة الاستلام لكل شخص

### نظام المستويات 🎖️
المستوى يعتمد على **نقاط الترتيب** بقانون رياضي لا نهائي (بلا سقف أعلى):
- مطلوب للمستوى L: `2·L·(L+1) − 4` نقطة تراكمية
- المستوى 1 = 0 | 2 = 8 | 3 = 20 | 4 = 36 | 5 = 56 | 6 = 80 |
  7 = 108 | 8 = 140 | 9 = 176 | 10 = 216 | 15 = 476 | 20 = 836 نقطة...
- الفجوة بين كل مستوىين = `4·L` (8، 12، 16، 20...) — سهلة البداية
  وتتطلب جهداً متصاعداً في المستويات العليا بلا نهاية
- يظهر بجانب المستوى شريط تقدم 🎯

### تسجيل الدخول اليومي 📅
أول رسالة يكتبها الشخص في أي شات يراه البوت خلال اليوم = **تسجيل دخول**:
- يحصل على **+3 نقاط** (مرة واحدة في اليوم فقط)
- يرسل البوت له رسالة خاصة فيها التاريخ + النقاط + عدد أيام تسجيل دخوله
- يُعرض عدد الأيام في الإحصائيات الرئيسية والمفصلة (حقل 📅 أيام تسجيل الدخول)

### النقاط 💰
- 50 رسالة داخل التكتات = نقطة | تكت مغلق كآخر مستلم = نقطة
- تقييمات: 5★=1.5 | 4★=1 | 3★=0.75 | 2★=0.5 | 1★=0.25

## صيغة المدد في الإعدادات العامة 🕒
أي إعداد زمني (الكولداون، مهلة الرد SLA، الخمول، حد العمر،
العد التنازلي للحذف، تنظيف المقفلات) يقبل **مدة مرنة بوحدات مركبة**:

| الوحدة | الحرف | مثال |
|---|---|---|
| يوم | `d` | `2d` |
| ساعة | `h` | `1h 30m` |
| دقيقة | `m` | `45m` |
| ثانية | `s` | `10s 500ms` غير مدعومة — استخدم `0.5s` |

- يمكن دمج عدة وحدات: `1h 10m 5s` أو `2d 6h` أو `1h30m` (بلا مسافات)
- رقم صرف بدون وحدة = وحدة الإعداد الأصلية (توافق قديم)
- `0` = بدون حد / معطّل — الإدارة لا تشملها الحدود
- التحويل: `ticket-system/utils/durationParser.js` (`parseDuration`, `toUnit`, `formatDuration`)

## ملاحظات ونقاط اعتمدتُ فيها اجتهاداً معقولاً (لعدم ذكرها صراحة):
- زر [إرسال] في لوحة الإدارة (الجزء 1) لم يكن مفعّلاً بعد -> تم
  تفعيله الآن في الجزء 3 (`ticket_select_send`) ليطلب اختيار روم
  عبر ChannelSelectMenu مخفي، ثم ينشر رسالة البنل العامة هناك عبر
  `publicPanelBuilder.js`.
- "الإدارة العليا" = أي رتبة/عضو يملك صلاحية `Administrator`،
  وهي تتجاوز صلاحيات الروم تلقائياً في ديسكورد فلا حاجة لـ Overwrite خاص بها.
- زر "إخراج عضو" مقصور على الأعضاء الذين أُضيفوا يدوياً عبر
  "إدخال عضو" فقط (وليس صاحب التكت أو الستاف) حفاظاً على سلامة النظام.
- "تحويل ملكية الاستلام" نُفّذ عبر UserSelectMenu (وليس RoleSelectMenu)
  لأن الاستلام مفهوم فردي (عضو واحد يستلم في كل مرة).

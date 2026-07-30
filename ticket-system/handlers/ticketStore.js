/**
 * =========================================================
 *  handlers/ticketStore.js
 * =========================================================
 * تخزين مؤقت (In-Memory Map) لحالة كل تذكرة "أثناء عملها" فقط.
 * المفتاح: channelId الخاص بروم التذكرة.
 *
 * ✅ هذا هو المكان الذي نحفظ فيه "سجل الأحداث المؤقت" المطلوب
 * في الجزء الثالث (Audit Log) — كل ضغطة زر مهمة (استلام، قفل،
 * تحويل، تصعيد...) تُضاف كسطر هنا عبر addAuditLog()، ثم عند
 * إغلاق/حذف التذكرة نستخدم هذه المصفوفة لبناء حقل "سجل الأحداث"
 * داخل إيمبد اللوق النهائي في transcriptLogger.js.
 *
 * لماذا في الذاكرة وليس في قاعدة البيانات (panelsDB)؟
 * لأن panelsDB مخصص فقط لإعدادات "القوالب" (كما حُدد في الجزء
 * الأول)، بينما هذه بيانات "حية" تخص تذكرة قيد التشغيل فقط وتُمحى
 * نهائياً بعد إرسال اللوق - تماماً كما طُلب: "مصفوفة مؤقتة داخل
 * التكت أثناء عمله".
 *
 * شكل الجلسة الواحدة:
 * {
 *   panelName: String,        -> اسم البنل الذي أُنشئت منه التذكرة
 *   openerId: String,         -> آيدي صاحب التذكرة
 *   claimedBy: String|null,   -> آيدي المستلم الحالي
 *   addedMembers: Array<String>, -> أعضاء تمت إضافتهم يدوياً للتكت
 *   escalated: Boolean,       -> هل تم تصعيد التكت للإدارة العليا
 *   openedAt: Number,
 *   lockedAt: Number|null,
 *   deleteTimer: NodeJS.Timeout|null, -> مرجع العداد التنازلي (للإلغاء)
 *   deleteCountdown: Number,
 *   auditLog: Array<{ text: String, timestamp: Number }>,
 * }
 * =========================================================
 */

const sessions = new Map();

/**
 * إنشاء جلسة جديدة عند فتح تذكرة
 * @param {String} channelId
 * @param {Object} data
 */
function createSession(channelId, data) {
    sessions.set(channelId, {
        panelName: data.panelName,
        openerId: data.openerId,
        claimedBy: null,
        addedMembers: [],
        escalated: false,
        openedAt: Date.now(),
        lockedAt: null,
        controlMessageId: null,
        closeMessageId: null,
        deleteTimer: null,
        deleteCountdown: 0,
        auditLog: [],
        ...data,
    });
}

/**
 * جلب جلسة تذكرة
 * @param {String} channelId
 * @returns {Object|null}
 */
function getSession(channelId) {
    return sessions.get(channelId) || null;
}

/**
 * تحديث (دمج) بيانات جلسة موجودة
 * @param {String} channelId
 * @param {Object} updates
 */
function updateSession(channelId, updates) {
    const current = sessions.get(channelId);
    if (!current) return null;
    const merged = { ...current, ...updates };
    sessions.set(channelId, merged);
    return merged;
}

/**
 * إضافة سطر إلى "سجل الأحداث المؤقت" الخاص بالتذكرة
 * @param {String} channelId
 * @param {String} text - وصف الحدث، مثال: "<@123> قام بالاستلام"
 */
function addAuditLog(channelId, text) {
    const session = sessions.get(channelId);
    if (!session) return;
    session.auditLog.push({ text, timestamp: Date.now() });
}

/**
 * حذف الجلسة نهائياً (بعد اكتمال الحذف والأرشفة في اللوق)
 * @param {String} channelId
 */
function deleteSession(channelId) {
    const session = sessions.get(channelId);
    if (session?.deleteTimer) clearInterval(session.deleteTimer);
    sessions.delete(channelId);
}

module.exports = {
    createSession,
    getSession,
    updateSession,
    addAuditLog,
    deleteSession,
};

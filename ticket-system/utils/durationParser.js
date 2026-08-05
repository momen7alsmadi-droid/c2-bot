/**
 * محلل المدد — يدعم عدة وحدات معاً: 1d 2h 30m 5s / 1h30m / 90s / 2d
 * الوحدات المدعومة: s = ثانية، m = دقيقة، h = ساعة، d = يوم
 * القيمة 0 = بدون حد / معطّل.
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60000;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;

const UNIT_MS = { s: SECOND_MS, m: MINUTE_MS, h: HOUR_MS, d: DAY_MS };
const MAX_MS = 10 * 365 * DAY_MS; // أقصى مدة: ~10 سنوات

/**
 * تحليل نص مدة إلى ميلي ثانية.
 * @param {String} input - مثل: "1h 30m 5s" / "2d" / "90s" / "0"
 * @param {Number} defaultUnitMs - وحدة الرقم الصرف (توافق قديم): "5" مع MINUTE_MS = 5 دقائق
 * @returns {{ ok: Boolean, ms: Number, error: String }}
 */
function parseDuration(input, defaultUnitMs = 0) {
    const str = String(input ?? '').trim();
    if (!str) return { ok: false, error: 'أدخل مدة أولاً.' };

    // رقم صرف (بدون وحدة) → نعتبره بوحدة الإعداد الافتراضية (توافق مع الطريقة القديمة)
    if (/^\d+(\.\d+)?$/.test(str)) {
        const v = parseFloat(str);
        if (v < 0) return { ok: false, error: 'المدة لا يمكن أن تكون سالبة.' };
        if (v === 0) return { ok: true, ms: 0 };
        if (!defaultUnitMs) return { ok: false, error: 'أدخل الوحدة (s m h d) — مثال: 1h 30m' };
        const ms = v * defaultUnitMs;
        if (ms > MAX_MS) return { ok: false, error: 'المدة كبيرة جداً (أقصى حد ~10 سنوات).' };
        return { ok: true, ms };
    }

    // وحدات مختلطة: 1h 30m 5s / 1h30m / 2d / 1.5h
    const tokenRe = /(\d+(?:\.\d+)?)\s*([smhd])/gi;
    const tokens = str.match(tokenRe);
    if (!tokens) return { ok: false, error: 'صيغة مدة غير صحيحة — استخدم h s m d (مثال: 1h 30m 5s).' };

    const leftover = str.replace(tokenRe, '').replace(/\s+/g, '');
    if (leftover) return { ok: false, error: 'صيغة مدة غير صحيحة — استخدم h s m d (مثال: 1h 30m 5s).' };

    let ms = 0;
    for (const t of tokens) {
        const m = t.match(/(\d+(?:\.\d+)?)\s*([smhd])/i);
        ms += parseFloat(m[1]) * UNIT_MS[m[2].toLowerCase()];
    }
    if (ms > MAX_MS) return { ok: false, error: 'المدة كبيرة جداً (أقصى حد ~10 سنوات).' };
    return { ok: true, ms };
}

/** تحويل ميلي ثانية إلى وحدة معينة مع تقريب لخانتين */
function toUnit(ms, unitMs) {
    return Math.round((ms / unitMs) * 100) / 100;
}

/** تنسيق مدة بلغة عربية: "1 يوم 3 ساعات 15 دقيقة 5 ثوانٍ" */
function formatDuration(ms, zeroText = '0') {
    if (!ms || ms <= 0) return zeroText;
    let total = ms;
    const parts = [];
    const UNITS = [
        { f: DAY_MS, one: 'يوم', fem: false, two: 'يومين', many: 'أيام' },
        { f: HOUR_MS, one: 'ساعة', fem: true, two: 'ساعتين', many: 'ساعات' },
        { f: MINUTE_MS, one: 'دقيقة', fem: true, two: 'دقيقتين', many: 'دقائق' },
        { f: SECOND_MS, one: 'ثانية', fem: true, two: 'ثانيتين', many: 'ثوانٍ' },
    ];
    for (const u of UNITS) {
        const n = Math.floor(total / u.f);
        if (n > 0) {
            total -= n * u.f;
            let text;
            if (n === 2) text = u.two; // يومين / ساعتين / دقيقتين / ثانيتين
            else if (n === 1) text = `${u.one} ${u.fem ? 'واحدة' : 'واحد'}`; // يوم واحد / ساعة واحدة
            else if (n <= 10) text = `${n} ${u.many}`; // 3 أيام / 10 دقائق
            else text = `${n} ${u.one}`; // 30 دقيقة / 11 ساعة / 100 يوم
            parts.push(text);
        }
    }
    return parts.join(' ');
}

module.exports = {
    parseDuration,
    toUnit,
    formatDuration,
    SECOND_MS,
    MINUTE_MS,
    HOUR_MS,
    DAY_MS,
    MAX_MS,
};

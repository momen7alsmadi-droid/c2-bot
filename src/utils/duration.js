// يحوّل النص الذي يكتبه العضو في خانة "مدة الاجازة" إلى عدد أيام تقريبي.
// الحد الأقصى المسموح به هو اسبوعين (14 يوم) كما هو مطلوب.

const MAX_DAYS = 14;

function normalizeDigits(str) {
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  return str.replace(/[٠-٩]/g, d => String(arabicIndic.indexOf(d)));
}

const WORD_NUMBERS = {
  'اسبوعين': 14, 'أسبوعين': 14,
  'اسبوع': 7, 'أسبوع': 7,
  'يومين': 2, 'يومان': 2,
  'عشرة ايام': 10, 'عشرة أيام': 10,
  'تسعة ايام': 9, 'ثمانية ايام': 8, 'سبعة ايام': 7,
  'ستة ايام': 6, 'خمسة ايام': 5, 'اربعة ايام': 4, 'أربعة ايام': 4,
  'ثلاثة ايام': 3, 'ثلاثة أيام': 3,
  'يوم': 1,
};

function parseDurationToDays(rawText) {
  if (!rawText) return { days: 7, guessed: true };
  const text = normalizeDigits(rawText.trim());

  // 1) رقم صريح مع وحدة (مثال: "10 ايام" أو "2 اسبوع")
  const numMatch = text.match(/(\d+)\s*(اسبوع|أسبوع|يوم)/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    const isWeeks = numMatch[2].includes('اسبوع') || numMatch[2].includes('أسبوع');
    const days = isWeeks ? n * 7 : n;
    return { days: Math.min(days, MAX_DAYS), guessed: false };
  }

  // 2) رقم فقط بدون وحدة -> نعتبره أيام
  const soloNum = text.match(/^(\d+)$/);
  if (soloNum) {
    return { days: Math.min(parseInt(soloNum[1], 10), MAX_DAYS), guessed: false };
  }

  // 3) كلمات شائعة (اسبوع، اسبوعين، يومين ...)
  const sortedWords = Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length);
  for (const word of sortedWords) {
    if (text.includes(word)) {
      return { days: Math.min(WORD_NUMBERS[word], MAX_DAYS), guessed: false };
    }
  }

  // 4) تعذر فهم النص -> نفترض أسبوع، والإدمن يشوف النص الأصلي قبل ما يقبل
  return { days: 7, guessed: true };
}

module.exports = { parseDurationToDays, MAX_DAYS };

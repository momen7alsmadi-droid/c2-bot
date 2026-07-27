/**
 * قائمة الألوان المتاحة للإيمبد
 * كل لون له: name (الاسم المعروض), value (hex value)
 */
const COLORS = [
  // === الألوان الأساسية ===
  { name: '🔴 أحمر (Red)', value: '#FF0000' },
  { name: '🟠 برتقالي (Orange)', value: '#FFA500' },
  { name: '🟡 أصفر (Yellow)', value: '#FFFF00' },
  { name: '🟢 أخضر (Green)', value: '#00FF00' },
  { name: '🔵 أزرق (Blue)', value: '#0000FF' },
  { name: '🟣 بنفسجي (Purple)', value: '#800080' },
  { name: '💗 وردي (Pink)', value: '#FF69B4' },
  { name: '⚫ أسود (Black)', value: '#000000' },
  { name: '⚪ أبيض (White)', value: '#FFFFFF' },
  { name: '🔘 رمادي (Gray)', value: '#808080' },

  // === الألوان الداكنة ===
  { name: '🟥 أحمر داكن (DarkRed)', value: '#8B0000' },
  { name: '🟠 برتقالي داكن (DarkOrange)', value: '#FF8C00' },
  { name: '🟡 ذهبي غامق (DarkGoldenrod)', value: '#B8860B' },
  { name: '🟩 أخضر داكن (DarkGreen)', value: '#006400' },
  { name: '🟦 أزرق داكن (DarkBlue)', value: '#00008B' },
  { name: '🟣 نيلي (Indigo)', value: '#4B0082' },
  { name: '🟤 بنفسجي داكن (DarkViolet)', value: '#9400D3' },
  { name: '🩸 مارون (Maroon)', value: '#800000' },
  { name: '🟤 كستنائي (SaddleBrown)', value: '#8B4513' },

  // === الألوان الفاتحة ===
  { name: '🩷 وردي فاتح (LightPink)', value: '#FFB6C1' },
  { name: '🟡 ذهبي فاتح (LightGoldenrod)', value: '#FAFAD2' },
  { name: '🟢 أخضر فاتح (LightGreen)', value: '#90EE90' },
  { name: '🩵 أزرق فاتح (LightBlue)', value: '#ADD8E6' },
  { name: '🟣 خزامي (Lavender)', value: '#E6E6FA' },
  { name: '🩶 رمادي فاتح (LightGray)', value: '#D3D3D3' },
  { name: '🩵 سماوي فاتح (LightCyan)', value: '#E0FFFF' },
  { name: '🟠 خوخي (Peach)', value: '#FFDAB9' },

  // === ألوان الباستيل ===
  { name: '🌸 وردي باستيل (PastelPink)', value: '#FFB3BA' },
  { name: '🟠 برتقالي باستيل (PastelOrange)', value: '#FFB347' },
  { name: '🟡 أصفر باستيل (PastelYellow)', value: '#FFF1A0' },
  { name: '🟢 أخضر باستيل (PastelGreen)', value: '#B5EAD7' },
  { name: '🩵 أزرق باستيل (PastelBlue)', value: '#A7C7E7' },
  { name: '🟣 بنفسجي باستيل (PastelPurple)', value: '#C3AED6' },

  // === ألوان مميزة ===
  { name: '⭐ ذهبي (Gold)', value: '#FFD700' },
  { name: '🥈 فضي (Silver)', value: '#C0C0C0' },
  { name: '🥉 برونزي (Bronze)', value: '#CD7F32' },
  { name: '💎 أزرق ملكي (RoyalBlue)', value: '#4169E1' },
  { name: '💚 زمردي (Emerald)', value: '#50C878' },
  { name: '💎 ياقوتي (Ruby)', value: '#E0115F' },
  { name: '💎 ياقوت أزرق (Sapphire)', value: '#0F52BA' },
  { name: '💎 جمري (Amethyst)', value: '#9966CC' },
  { name: '🫒 زيتي (Olive)', value: '#808000' },
  { name: '🩵 تركواز (Teal)', value: '#008080' },
  { name: '🩵 فيروزي (Turquoise)', value: '#40E0D0' },
  { name: '💚 ليموني (Lime)', value: '#32CD32' },
  { name: '💗 فوشيا (Fuchsia)', value: '#FF00FF' },
  { name: '🩷 أرجواني (Magenta)', value: '#FF00FF' },
  { name: '🩵 سماوي (Cyan)', value: '#00FFFF' },
  { name: '🟤 بني (Brown)', value: '#A52A2A' },
  { name: '🟤 كاكي (Khaki)', value: '#C3B091' },
  { name: '🟣 أرجواني (Mauve)', value: '#E0B0FF' },
  { name: '🌸 خوخي (Coral)', value: '#FF7F50' },
  { name: '🟠 سلمون (Salmon)', value: '#FA8072' },
  { name: '🩷 وردي ساخن (HotPink)', value: '#FF1493' },
  { name: '🟣 بنفسجي فاتح (Violet)', value: '#EE82EE' },
  { name: '🩵 كهربائي (ElectricBlue)', value: '#0892D0' },
  { name: '💚 نعناعي (Mint)', value: '#98FF98' },
  { name: '🟤 عاجي (Ivory)', value: '#FFFFF0' },
  { name: '🩶 أنثراسيت (Charcoal)', value: '#36454F' },
];

module.exports = { COLORS };

const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils/colors');
const { version } = require('../../package.json');

/**
 * /الألوان_المتوفرة - عرض جميع ألوان الإيمبد مع رموزها
 */
async function handleColorsCommand(interaction) {
  // تجميع الألوان حسب الفئات (عن طريق تحليل الاسم)
  const lines = COLORS.map(c => {
    const hex = c.value.toUpperCase();
    return `${c.name} — \`${hex}\``;
  });

  const embed = new EmbedBuilder()
    .setTitle('🎨 جميع ألوان الإيمبد المتوفرة')
    .setColor(0x5865F2)
    .setDescription(lines.join('\n'))
    .setFooter({
      text: `الإصدار: ${version} | إجمالي ${COLORS.length} لون`,
    })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleColorsCommand };

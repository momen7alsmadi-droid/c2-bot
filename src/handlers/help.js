const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('📖 مساعدة البوت')
    .setColor(0x3498DB)
    .setDescription('مرحباً بك في بوت الإدارة المتكامل! إليك الأوامر المتاحة:')
    .addFields(
      {
        name: '📋 /اجازة',
        value: 'تقديم طلب اجازة. تفتح لك نافذة تملأ فيها البيانات (المسؤول، السبب، المدة).',
      },
      {
        name: '📌 /دليل',
        value: 'تقديم استمارة دليل عقوبة لعضو معين (صورة + سبب + مكان).',
      },
      {
        name: '🛡️ /بلاغ',
        value: 'تقديم بلاغ سري على إداري. هويتك مخفية ولا يراها إلا الإدارة العليا.',
      },
      {
        name: '📄 /استقالة',
        value: 'تقديم استقالة من الإدارة (يتم إرسالها للمسؤولين للموافقة).',
      },
      {
        name: '📖 /مساعدة',
        value: 'عرض شرح البوت والأوامر.',
      },
    )
    .setFooter({ text: 'بوت الإدارة المتكامل' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🆘 سيرفر الدعم')
      .setStyle(ButtonStyle.Link)
      .setURL('https://discord.gg/qdDQWKxQZu'),
  );

  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

module.exports = { handleHelp };

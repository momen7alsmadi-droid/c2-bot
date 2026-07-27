const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils/colors');

/**
 * /broadcast - إرسال رسالة خاصة (DM) إلى أعضاء السيرفر
 * - فقط للأدمن (Administrator)
 * - required: message (string)
 * - required: format (embed/plain)
 * - required: show_sender (yes/no)
 * - optional: role (role)
 * - optional: color (autocomplete) - لون الإيمبد
 */
async function handleBroadcast(interaction) {
  // 1) التحقق من صلاحية Administrator
  if (!interaction.memberPermissions?.has('Administrator')) {
    return interaction.reply({
      content: '❌ هذا الأمر متاح فقط للأدمن (Administrator).',
      ephemeral: true,
    });
  }

  const messageContent = interaction.options.getString('message', true);
  const format = interaction.options.getString('format', true);
  const showSender = interaction.options.getString('show_sender', true);
  const targetRole = interaction.options.getRole('role');
  const colorInput = interaction.options.getString('color');

  await interaction.deferReply({ ephemeral: true });

  try {
    // جلب كل أعضاء السيرفر
    const guild = interaction.guild;
    await guild.members.fetch();

    let members;
    if (targetRole) {
      members = guild.members.cache.filter(m => m.roles.cache.has(targetRole.id));
    } else {
      members = guild.members.cache.filter(m => !m.user.bot);
    }

    if (members.size === 0) {
      return interaction.editReply({
        content: '⚠️ لا يوجد أعضاء مستهدفين لإرسال الرسالة.',
      });
    }

    let sentCount = 0;
    let failCount = 0;

    if (format === 'embed') {
      // ========== إرسال كايمبد ==========

      // تحديد لون الإيمبد
      const embedColor = colorInput ? parseInt(colorInput.replace('#', ''), 16) : randomColor();

      const embed = new EmbedBuilder()
        .setTitle(`📩 رسالة من ${guild.name}`)
        .setColor(embedColor)
        .setDescription(messageContent)
        .setTimestamp();

      if (showSender === 'yes') {
        embed.setFooter({
          text: `من: ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL(),
        });
      }

      for (const [, member] of members) {
        try {
          await member.send({ embeds: [embed] });
          sentCount++;
        } catch {
          failCount++;
        }
      }
    } else {
      // ========== إرسال كنص عادي ==========
      let text = `📩 **رسالة من ${guild.name}**\n\n${messageContent}`;

      if (showSender === 'yes') {
        text += `\n\n— ${interaction.user.tag}`;
      }

      for (const [, member] of members) {
        try {
          await member.send(text);
          sentCount++;
        } catch {
          failCount++;
        }
      }
    }

    // ========== تقرير النتيجة ==========
    const summaryEmbed = new EmbedBuilder()
      .setTitle('✅ تم إرسال الرسالة')
      .setColor(0x2ECC71)
      .addFields(
        { name: '📨 المستهدفون', value: `${members.size} عضو`, inline: true },
        { name: '✅ نجح', value: `${sentCount}`, inline: true },
        { name: '❌ فشل (خاص مغلق)', value: `${failCount}`, inline: true },
      )
      .setDescription(`\`\`\`${messageContent.slice(0, 500)}\`\`\``)
      .setTimestamp();

    if (targetRole) {
      summaryEmbed.addFields({ name: '🎯 الرتبة المحددة', value: `${targetRole}`, inline: false });
    }

    summaryEmbed.addFields(
      { name: '🖼️ النوع', value: format === 'embed' ? 'ايمبد' : 'نص عادي', inline: true },
      { name: '👤 إظهار المرسل', value: showSender === 'yes' ? '✅ نعم' : '❌ لا', inline: true },
    );

    return interaction.editReply({ embeds: [summaryEmbed] });
  } catch (err) {
    console.error('❌ خطأ في /broadcast:', err.message, err.stack);
    return interaction.editReply({
      content: '⚠️ حدث خطأ أثناء إرسال الرسائل. تأكد من صلاحيات البوت.',
    });
  }
}

/**
 * معالج الأوتوكومبليت لخيار اللون
 */
async function handleColorAutocomplete(interaction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  // تصفية الألوان حسب ما يكتبه المستخدم
  const filtered = COLORS.filter(c =>
    c.name.toLowerCase().includes(focusedValue) ||
    c.value.toLowerCase().includes(focusedValue)
  ).slice(0, 25); // الحد الأقصى 25 اقتراح

  await interaction.respond(
    filtered.map(c => ({ name: c.name, value: c.value }))
  );
}

/**
 * توليد لون عشوائي
 */
function randomColor() {
  return Math.floor(Math.random() * 0xFFFFFF);
}

module.exports = { handleBroadcast, handleColorAutocomplete };

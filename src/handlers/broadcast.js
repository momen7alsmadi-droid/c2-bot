const { EmbedBuilder } = require('discord.js');

/**
 * /broadcast - إرسال رسالة خاصة (DM) إلى أعضاء السيرفر
 * - فقط للأدمن (Administrator)
 * - required: message (string)
 * - optional: role (role) - إذا تركت فارغة ترسل للكل، وإلا ترسل فقط لأصحاب الرتبة
 * - required: format (embed/plain)
 * - required: show_sender (yes/no)
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
  const targetRole = interaction.options.getRole('role');
  const format = interaction.options.getString('format', true); // 'embed' or 'plain'
  const showSender = interaction.options.getString('show_sender', true); // 'yes' or 'no'

  await interaction.deferReply({ ephemeral: true });

  try {
    // جلب كل أعضاء السيرفر
    const guild = interaction.guild;
    await guild.members.fetch(); // تصوير كامل للأعضاء

    let members;
    if (targetRole) {
      // إذا تم تحديد رتبة، نأخذ فقط الأعضاء الذين يملكون الرتبة
      members = guild.members.cache.filter(m => m.roles.cache.has(targetRole.id));
    } else {
      // بدون رتبة → كل الأعضاء (ما عدا البوتات)
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
      const embed = new EmbedBuilder()
        .setTitle(`📩 رسالة من ${guild.name}`)
        .setColor(0x5865F2)
        .setDescription(messageContent)
        .setTimestamp();

      // إضافة اسم المرسل في الفوتر فقط إذا كان showSender = yes
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

module.exports = { handleBroadcast };

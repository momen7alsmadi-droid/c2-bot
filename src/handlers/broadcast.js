const { EmbedBuilder } = require('discord.js');

/**
 * /broadcast - إرسال رسالة خاصة (DM) إلى أعضاء السيرفر
 * - فقط للأدمن (Administrator)
 * - required: message (string)
 * - optional: role (role) - إذا تركت فارغة ترسل للكل، وإلا ترسل فقط لأصحاب الرتبة
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

    const embed = new EmbedBuilder()
      .setTitle('📩 رسالة من الإدارة')
      .setColor(0x5865F2)
      .setDescription(messageContent)
      .setFooter({
        text: `من: ${interaction.user.tag} | ${guild.name}`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    let sentCount = 0;
    let failCount = 0;

    // إرسال الرسالة لكل عضو في الخاص (DM)
    for (const [, member] of members) {
      try {
        await member.send({ embeds: [embed] });
        sentCount++;
      } catch {
        failCount++;
      }
    }

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

    return interaction.editReply({ embeds: [summaryEmbed] });
  } catch (err) {
    console.error('❌ خطأ في /broadcast:', err.message, err.stack);
    return interaction.editReply({
      content: '⚠️ حدث خطأ أثناء إرسال الرسائل. تأكد من صلاحيات البوت.',
    });
  }
}

module.exports = { handleBroadcast };

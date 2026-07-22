const { version } = require('../utils/version');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { getConfig, saveConfig, getLeaves, saveLeaves } = require('../utils/storage');
const { parseDurationToDays } = require('../utils/duration');
const { hasRole, setFieldValue, sendLog } = require('../utils/helpers');

const CHECK_INTERVAL_MS = 60 * 1000; // فحص الاجازات المنتهية كل دقيقة

// ------------------- /اجازة -------------------

async function handleLeaveCommand(interaction, cfg) {
  if (!hasRole(interaction.member, cfg.leave.allowedRoleId)) {
    return interaction.reply({ content: '❌ ما عندك صلاحية استخدام هذا الأمر.', ephemeral: true });
  }
  if (!cfg.leave.requestChannelId) {
    return interaction.reply({ content: '⚠️ لم يتم إعداد روم استقبال طلبات الاجازة بعد، تواصل مع الإدارة.', ephemeral: true });
  }

  // حفظ المسؤول مؤقتاً في الكولكشن
  if (!interaction.client.leaveManagers) interaction.client.leaveManagers = new Map();
  interaction.client.leaveManagers.set(interaction.user.id, interaction.options.getUser('المسؤول'));

  const modal = new ModalBuilder().setCustomId('modal_leave').setTitle('طلب اجازة');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason').setLabel('سبب الاجازة').setStyle(TextInputStyle.Paragraph).setRequired(true);
  const durationInput = new TextInputBuilder()
    .setCustomId('duration').setLabel('مدة الاجازة (أقصى مدة اسبوعين)').setStyle(TextInputStyle.Short).setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(reasonInput),
    new ActionRowBuilder().addComponents(durationInput),
  );

  return interaction.showModal(modal);
}

async function handleLeaveModalSubmit(interaction) {
  const cfg = getConfig();
  const manager = interaction.client.leaveManagers?.get(interaction.user.id);
  if (!manager) return interaction.reply({ content: '⚠️ خطأ: أعد استخدام الأمر من البداية.', ephemeral: true });

  const reason = interaction.fields.getTextInputValue('reason');
  const durationRaw = interaction.fields.getTextInputValue('duration');

  const { days, guessed } = parseDurationToDays(durationRaw);

  const embed = new EmbedBuilder()
    .setTitle('⎭ طـلـب اجـازة ⎧')
    .setColor(0x3498DB)
    .setDescription(
      '⚠️ تنبيه: نتمنى منكم في حال انتهاء مدة الاجازة الرجوع بأسرع وقت لتجنب المحاسبة.\n' +
      'أعلى مدة مسموحة: **اسبوعين**. في حال القبول التزم بصورة رتبتك وتوجهك.'
    )
    .addFields(
      { name: '— مـقـدم الـطـلـب', value: `${interaction.user}` },
      { name: '— مـسـؤولـك', value: `${manager}` },
      { name: '— سـبـب الاجـازة', value: reason },
      { name: '— مـده الاجـازه', value: durationRaw },
      { name: 'المدة المحتسبة', value: `${days} يوم${guessed ? ' ⚠️ (تخمين تلقائي)' : ''}` },
      { name: 'الحالة', value: '⏳ بانتظار القبول' },
    )
    .setFooter({ text: `الإصدار: ${version} | ${interaction.user.tag}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`leave_accept_${interaction.user.id}_${days}`).setLabel('قبول').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`leave_reject_${interaction.user.id}`).setLabel('رفض').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );

  const channel = await interaction.guild.channels.fetch(cfg.leave.requestChannelId).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: '⚠️ لم أستطع الوصول إلى روم الطلبات.', ephemeral: true });
  }

  await channel.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ تم إرسال طلب الاجازة، بانتظار موافقة الإدارة.', ephemeral: true });

  const logEmbed = new EmbedBuilder()
    .setTitle('📥 طلب اجازة جديد')
    .setColor(0x3498DB)
    .addFields(
      { name: 'مقدّم الطلب', value: `${interaction.user} (${interaction.user.tag} | ${interaction.user.id})` },
      { name: 'مسؤوله', value: `${manager} (${manager.tag} | ${manager.id})` },
      { name: 'السبب', value: reason },
      { name: 'المدة (كما كُتبت)', value: durationRaw },
      { name: 'المدة المحتسبة', value: `${days} يوم${guessed ? ' ⚠️ تخمين تلقائي' : ''}` },
      { name: 'الحالة', value: '⏳ بانتظار القبول' },
    )
    .setTimestamp();
  await sendLog(interaction.guild, cfg.leave.logChannelId, { embeds: [logEmbed] });
}

async function handleLeaveButton(interaction, action, userId, daysStr) {
  const guild = interaction.guild;
  const cfg = getConfig();
  const member = await guild.members.fetch(userId).catch(() => null);
  const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]);

  if (action === 'accept') {
    if (!member) {
      return interaction.reply({ content: '⚠️ العضو لم يعد موجوداً في السيرفر.', ephemeral: true });
    }

    const days = parseInt(daysStr, 10) || 7;
    const removedRoles = cfg.leave.rolesToRemove.filter(roleId => member.roles.cache.has(roleId));

    if (removedRoles.length) {
      await member.roles.remove(removedRoles).catch(() => {});
    }
    if (cfg.leave.leaveRoleId) {
      await member.roles.add(cfg.leave.leaveRoleId).catch(() => {});
    }

    const approvedAt = Date.now();
    const endsAt = approvedAt + days * 24 * 60 * 60 * 1000;

    const leaves = getLeaves();
    leaves[userId] = {
      guildId: guild.id,
      removedRoles,
      leaveRoleId: cfg.leave.leaveRoleId,
      approvedAt,
      endsAt,
      durationDays: days,
    };
    saveLeaves(leaves);

    setFieldValue(newEmbed, 'الحالة', `✅ مقبولة بواسطة ${interaction.user.tag}`);
    await interaction.update({ embeds: [newEmbed], components: [] });
    member.send(`✅ تم قبول طلب اجازتك لمدة ${days} يوم. نتمنى لك راحة طيبة.`).catch(() => {});

    const logEmbed = new EmbedBuilder()
      .setTitle('✅ تم قبول طلب اجازة')
      .setColor(0x2ECC71)
      .addFields(
        { name: 'العضو', value: `${member} (${member.user.tag} | ${member.id})` },
        { name: 'المدة', value: `${days} يوم` },
        { name: 'قُبل بواسطة', value: `${interaction.user} (${interaction.user.tag})` },
        { name: 'ينتهي في', value: `<t:${Math.floor((Date.now() + days * 24 * 60 * 60 * 1000) / 1000)}:F>` },
      )
      .setTimestamp();
    await sendLog(guild, cfg.leave.logChannelId, { embeds: [logEmbed] });
    return;
  }

  if (action === 'reject') {
    setFieldValue(newEmbed, 'الحالة', `❌ مرفوضة بواسطة ${interaction.user.tag}`);
    await interaction.update({ embeds: [newEmbed], components: [] });
    if (member) member.send('❌ تم رفض طلب اجازتك من قبل الإدارة.').catch(() => {});

    const logEmbed = new EmbedBuilder()
      .setTitle('❌ تم رفض طلب اجازة')
      .setColor(0xE74C3C)
      .addFields(
        { name: 'العضو', value: member ? `${member} (${member.user.tag} | ${member.id})` : `<@${userId}>` },
        { name: 'رُفض بواسطة', value: `${interaction.user} (${interaction.user.tag})` },
      )
      .setTimestamp();
    await sendLog(guild, cfg.leave.logChannelId, { embeds: [logEmbed] });
    return;
  }
}

// ------------------- فحص الاجازات المنتهية -------------------

async function checkExpiredLeaves(client) {
  const leaves = getLeaves();
  const cfg = getConfig();
  const now = Date.now();
  let changed = false;

  for (const [userId, leave] of Object.entries(leaves)) {
    if (leave.endsAt > now) continue;
    changed = true;

    try {
      const guild = await client.guilds.fetch(leave.guildId);
      const member = await guild.members.fetch(userId).catch(() => null);

      if (member) {
        if (leave.leaveRoleId && member.roles.cache.has(leave.leaveRoleId)) {
          await member.roles.remove(leave.leaveRoleId).catch(() => {});
        }
        for (const roleId of leave.removedRoles) {
          if (guild.roles.cache.has(roleId) && !member.roles.cache.has(roleId)) {
            await member.roles.add(roleId).catch(() => {});
          }
        }
        member.send('✅ انتهت مدة اجازتك وتم إرجاع رتبك تلقائياً، نتمنى رجوعك بأفضل حال.').catch(() => {});

        const logEmbed = new EmbedBuilder()
          .setTitle('⏰ انتهت مدة الاجازة - إرجاع تلقائي للرتب')
          .setColor(0x95A5A6)
          .addFields(
            { name: 'العضو', value: `${member} (${member.user.tag} | ${member.id})` },
            { name: 'الرتب المُرجَعة', value: leave.removedRoles.length ? leave.removedRoles.map(id => `<@&${id}>`).join(', ') : 'لا يوجد' },
          )
          .setTimestamp();
        await sendLog(guild, cfg.leave.logChannelId, { embeds: [logEmbed] });
      }
    } catch (e) {
      console.error('خطأ أثناء إرجاع رتب العضو بعد انتهاء الاجازة:', e);
    }

    delete leaves[userId];
  }

  if (changed) saveLeaves(leaves);
}

// ------------------- إعدادات الاجازة -------------------

async function handleLeaveSettings(interaction, cfg) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'رتبة_الاستخدام') {
    const role = interaction.options.getRole('الرتبة');
    cfg.leave.allowedRoleId = role.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد رتبة استخدام /اجازة: ${role}`, ephemeral: true });
  }

  if (sub === 'روم_الطلبات') {
    const channel = interaction.options.getChannel('الروم');
    cfg.leave.requestChannelId = channel.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد روم استقبال طلبات الاجازة: ${channel}`, ephemeral: true });
  }

  if (sub === 'رتبة_الاجازة') {
    const role = interaction.options.getRole('الرتبة');
    cfg.leave.leaveRoleId = role.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد رتبة الاجازة: ${role}`, ephemeral: true });
  }

  if (sub === 'اضافة_رتبة_للإزالة') {
    const role = interaction.options.getRole('الرتبة');
    if (!cfg.leave.rolesToRemove.includes(role.id)) {
      cfg.leave.rolesToRemove.push(role.id);
      saveConfig(cfg);
    }
    return interaction.reply({ content: `✅ تمت إضافة ${role} إلى قائمة الرتب التي تُزال أثناء الاجازة.`, ephemeral: true });
  }

  if (sub === 'ازالة_رتبة_من_القائمة') {
    const role = interaction.options.getRole('الرتبة');
    cfg.leave.rolesToRemove = cfg.leave.rolesToRemove.filter(id => id !== role.id);
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تمت إزالة ${role} من القائمة.`, ephemeral: true });
  }

  if (sub === 'روم_اللوق') {
    const channel = interaction.options.getChannel('الروم');
    cfg.leave.logChannelId = channel.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد روم لوق نظام الاجازات: ${channel}`, ephemeral: true });
  }

  if (sub === 'عرض_الاعدادات') {
    const embed = new EmbedBuilder()
      .setTitle('⚙️ إعدادات نظام الإجازات')
      .setColor(0x2ECC71)
      .addFields(
        { name: 'رتبة الاستخدام', value: cfg.leave.allowedRoleId ? `<@&${cfg.leave.allowedRoleId}>` : 'غير محددة' },
        { name: 'روم الطلبات', value: cfg.leave.requestChannelId ? `<#${cfg.leave.requestChannelId}>` : 'غير محدد' },
        { name: 'رتبة الاجازة', value: cfg.leave.leaveRoleId ? `<@&${cfg.leave.leaveRoleId}>` : 'غير محددة' },
        { name: 'الرتب التي تُزال عند القبول', value: cfg.leave.rolesToRemove.length ? cfg.leave.rolesToRemove.map(id => `<@&${id}>`).join(', ') : 'لا يوجد' },
        { name: 'روم اللوق', value: cfg.leave.logChannelId ? `<#${cfg.leave.logChannelId}>` : 'غير محدد' },
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = {
  handleLeaveCommand,
  handleLeaveModalSubmit,
  handleLeaveButton,
  handleLeaveSettings,
  checkExpiredLeaves,
  CHECK_INTERVAL_MS,
};

const { version } = require('../utils/version');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getConfig, saveConfig, getReports, saveReports } = require('../utils/storage');
const { hasRole, isAdmin, setFieldValue, generateId, sendLog } = require('../utils/helpers');

const REPORT_COLOR = 0xE74C3C;
const ACCEPT_COLOR = 0x2ECC71;
const DISMISS_COLOR = 0x992D22;

// كولداون البلاغات (1 ساعة)
const reportCooldowns = new Map();

function buildReportButtons(reportId, disableDecision) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blagh_accept_${reportId}`).setLabel('قبول البلاغ').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(Boolean(disableDecision)),
    new ButtonBuilder().setCustomId(`blagh_reject_${reportId}`).setLabel('رفض البلاغ').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(Boolean(disableDecision)),
    new ButtonBuilder().setCustomId(`blagh_reporter_${reportId}`).setLabel('من قدّم البلاغ').setEmoji('🕵️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`blagh_witnesses_${reportId}`).setLabel('الشهود').setEmoji('👥').setStyle(ButtonStyle.Secondary),
  );
}

function getWarningRoleId(cfg, level) {
  if (level === 1) return cfg.report.warning1RoleId;
  if (level === 2) return cfg.report.warning2RoleId;
  if (level === 3) return cfg.report.warning3RoleId;
  return null;
}

// يحدد مستوى التحذير الحالي للعضو بالاعتماد على الرتب التي يملكها فعلياً
function getWarningLevel(member, cfg) {
  if (cfg.report.warning3RoleId && member.roles.cache.has(cfg.report.warning3RoleId)) return 3;
  if (cfg.report.warning2RoleId && member.roles.cache.has(cfg.report.warning2RoleId)) return 2;
  if (cfg.report.warning1RoleId && member.roles.cache.has(cfg.report.warning1RoleId)) return 1;
  return 0;
}

// ------------------- /بلاغ -------------------

async function handleReportCommand(interaction, cfg) {
  if (cfg.report.allowedRoleId && !hasRole(interaction.member, cfg.report.allowedRoleId)) {
    return interaction.reply({ content: '❌ ما عندك صلاحية استخدام هذا الأمر.', ephemeral: true });
  }
  if (!cfg.report.channelId || !cfg.report.adminRoleId) {
    return interaction.reply({ content: '⚠️ لم يتم إعداد نظام البلاغات بالكامل بعد (الروم أو رتبة الإدارة)، تواصل مع الإدارة العليا.', ephemeral: true });
  }

  const target = interaction.options.getUser('الاداري');
  const reason = interaction.options.getString('السبب');
  const when = interaction.options.getString('متى');
  const whereChannel = interaction.options.getChannel('المكان');
  // كولداون (من الإعدادات)
  if (cfg.report.cooldownEnabled !== false) {
    const cdMs = (cfg.report.cooldownDuration || 60) * 60 * 1000;
    const lastReport = reportCooldowns.get(interaction.user.id);
    if (lastReport && Date.now() - lastReport < cdMs) {
      const remaining = Math.ceil((cdMs - (Date.now() - lastReport)) / 60000);
      return interaction.reply({ content: `⏳ يجب عليك الانتظار **${remaining} دقيقة** قبل تقديم بلاغ آخر.`, ephemeral: true });
    }
  }

  const evidenceList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => interaction.options.getAttachment(`دليل_${n}`)).filter(Boolean);
  const witnesses = [1, 2, 3].map(n => interaction.options.getUser(`شاهد_${n}`)).filter(Boolean);

  if (target.id === interaction.user.id) {
    return interaction.reply({ content: '❌ لا يمكنك تقديم بلاغ على نفسك.', ephemeral: true });
  }
  if (target.bot) {
    return interaction.reply({ content: '❌ لا يمكن تقديم بلاغ على بوت.', ephemeral: true });
  }

  const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!targetMember) {
    return interaction.reply({ content: '⚠️ تعذر العثور على هذا العضو في السيرفر.', ephemeral: true });
  }
  if (!hasRole(targetMember, cfg.report.adminRoleId)) {
    return interaction.reply({ content: '❌ الشخص الذي اخترته لا يملك رتبة الإدارة المحددة، لا يمكن تقديم بلاغ عليه.', ephemeral: true });
  }

  const channel = await interaction.guild.channels.fetch(cfg.report.channelId).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: '⚠️ لم أستطع الوصول إلى روم استقبال البلاغات، تأكد من الإعدادات.', ephemeral: true });
  }

  const id = generateId();

  const mainEmbed = new EmbedBuilder()
    .setTitle('🛡️ بلاغ جديد على إداري')
    .setColor(REPORT_COLOR)
    .setDescription('🔒 بلاغ سري — هوية مقدّم البلاغ والشهود مخفية بالكامل، ولا يمكن كشفها إلا لأصحاب صلاحية Administrator عبر الأزرار بالأسفل.')
    .addFields(
      { name: '— الإداري المُبلغ عنه', value: `${target}` },
      { name: '— السبب', value: reason },
      { name: '— متى حدث', value: when },
      { name: '— أين حدث', value: `${whereChannel}` },
      { name: '— مقدّم البلاغ', value: '🔒 مخفي — للإدارة فقط' },
      { name: '— الشهود', value: witnesses.length ? '🔒 مخفي — للإدارة فقط' : 'لا يوجد شهود' },
      { name: '— الحالة', value: '⏳ قيد المراجعة' },
    )
    .setImage(evidenceList[0].url)
    .setFooter({ text: `الإصدار: ${version} | رقم البلاغ: ${id}` })
    .setTimestamp();

  const extraEmbeds = evidenceList.slice(1).map(a => new EmbedBuilder().setColor(REPORT_COLOR).setImage(a.url));

  const witnessMentions = witnesses.length ? witnesses.join(' ') : null;
  const sentMessage = await channel.send({ content: witnessMentions, embeds: [mainEmbed, ...extraEmbeds], components: [buildReportButtons(id, false)] });

  const record = {
    id,
    guildId: interaction.guild.id,
    channelId: channel.id,
    messageId: sentMessage.id,
    reporterId: interaction.user.id,
    reporterTag: interaction.user.tag,
    targetId: target.id,
    targetTag: target.tag,
    reason,
    when,
    whereChannelId: whereChannel.id,
    witnesses: witnesses.map(w => w.id),
    witnessTags: witnesses.map(w => w.tag),
    evidence: evidenceList.map(a => a.url),
    status: 'pending',
    decidedBy: null,
    decidedByTag: null,
    decidedAt: null,
    warningLevelAssigned: null,
    createdAt: Date.now(),
  };
  const reports = getReports();
  reports[id] = record;
  saveReports(reports);

  // تسجيل وقت البلاغ للكولداون
  reportCooldowns.set(interaction.user.id, Date.now());

  await interaction.reply({
    content:
      '✅ تم إرسال بلاغك بسرية تامة، ولن يُكشف اسمك إلا لأصحاب صلاحية Administrator عبر زر مخصص.\n' +
      '⚠️ تذكير للمستقبل: تأكد دائماً ألا تظهر نفسك أو أي شيء يكشف هويتك داخل الصور التي ترفقها كدليل.',
    ephemeral: true,
  });

  const logEmbed = new EmbedBuilder()
    .setTitle('🛡️ بلاغ جديد على إداري')
    .setColor(REPORT_COLOR)
    .addFields(
      { name: 'رقم البلاغ', value: id },
      { name: 'الإداري المُبلغ عنه', value: `${target} (${target.tag} | ${target.id})` },
      { name: 'مقدّم البلاغ', value: `${interaction.user} (${interaction.user.tag} | ${interaction.user.id})` },
      { name: 'السبب', value: reason },
      { name: 'متى حدث', value: when },
      { name: 'أين حدث', value: `${whereChannel}` },
      { name: 'الشهود', value: witnesses.length ? witnesses.map(w => `${w} (${w.tag})`).join('\n') : 'لا يوجد' },
      { name: 'عدد الأدلة', value: `${evidenceList.length}` },
      { name: 'الحالة', value: '⏳ قيد المراجعة' },
    )
    .setImage(evidenceList[0].url)
    .setTimestamp();
  await sendLog(interaction.guild, cfg.report.logChannelId, {
    embeds: [logEmbed, ...evidenceList.slice(1).map(a => new EmbedBuilder().setColor(REPORT_COLOR).setImage(a.url))],
  });
}

// ------------------- أزرار البلاغ -------------------

async function handleReportButton(interaction, action, reportId) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ فقط من لديه صلاحية Administrator يقدر يستخدم أزرار البلاغات.', ephemeral: true });
  }

  const cfg = getConfig();
  const reports = getReports();
  const record = reports[reportId];

  if (!record) {
    return interaction.reply({ content: '⚠️ تعذر العثور على بيانات هذا البلاغ (ربما تم حذف بياناته).', ephemeral: true });
  }

  if (action === 'reporter') {
    return interaction.reply({ content: `🕵️ مقدّم هذا البلاغ: <@${record.reporterId}> (${record.reporterTag})`, ephemeral: true });
  }

  if (action === 'witnesses') {
    const list = record.witnesses.length
      ? record.witnesses.map((wid, i) => `${i + 1}. <@${wid}> (${record.witnessTags[i] || ''})`).join('\n')
      : 'لا يوجد شهود مذكورين في هذا البلاغ.';
    return interaction.reply({ content: `👥 الشهود:\n${list}`, ephemeral: true });
  }

  if (action !== 'accept' && action !== 'reject') return;

  if (record.status !== 'pending') {
    return interaction.reply({
      content: `⚠️ تم اتخاذ قرار على هذا البلاغ مسبقاً (${record.status === 'accepted' ? 'مقبول' : 'مرفوض'}).`,
      ephemeral: true,
    });
  }

  const guild = interaction.guild;
  const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
  const otherEmbeds = interaction.message.embeds.slice(1);
  const finalRow = buildReportButtons(reportId, true);

  if (action === 'reject') {
    record.status = 'rejected';
    record.decidedBy = interaction.user.id;
    record.decidedByTag = interaction.user.tag;
    record.decidedAt = Date.now();
    saveReports(reports);

    setFieldValue(newEmbed, '— الحالة', `❌ مرفوض بواسطة ${interaction.user.tag}`);
    await interaction.update({ embeds: [newEmbed, ...otherEmbeds], components: [finalRow] });

    const logEmbed = new EmbedBuilder()
      .setTitle('❌ تم رفض بلاغ')
      .setColor(REPORT_COLOR)
      .addFields(
        { name: 'رقم البلاغ', value: reportId },
        { name: 'الإداري المُبلغ عنه', value: `<@${record.targetId}> (${record.targetTag})` },
        { name: 'رُفض بواسطة', value: `${interaction.user} (${interaction.user.tag})` },
      )
      .setTimestamp();
    await sendLog(guild, cfg.report.logChannelId, { embeds: [logEmbed] });
    return;
  }

  // action === 'accept'
  const member = await guild.members.fetch(record.targetId).catch(() => null);

  if (!member) {
    record.status = 'accepted';
    record.decidedBy = interaction.user.id;
    record.decidedByTag = interaction.user.tag;
    record.decidedAt = Date.now();
    saveReports(reports);

    setFieldValue(newEmbed, '— الحالة', `✅ مقبول بواسطة ${interaction.user.tag} (⚠️ العضو غير موجود بالسيرفر، لم تُطبَّق أي رتبة)`);
    await interaction.update({ embeds: [newEmbed, ...otherEmbeds], components: [finalRow] });
    return;
  }

  const level = getWarningLevel(member, cfg);
  let resultText;

  if (level >= 3) {
    resultText = '⚠️ العضو وصل مسبقاً لأقصى مستوى (الفصل من الإدارة)، لم تُضف أي رتبة جديدة.';
  } else {
    const newLevel = level + 1;
    const roleToAdd = getWarningRoleId(cfg, newLevel);
    const roleToRemove = level > 0 ? getWarningRoleId(cfg, level) : null;

    if (roleToRemove && member.roles.cache.has(roleToRemove)) {
      await member.roles.remove(roleToRemove).catch(() => {});
    }
    if (roleToAdd) {
      await member.roles.add(roleToAdd).catch(() => {});
    }

    const levelNames = { 1: 'تحذير أول ⚠️', 2: 'تحذير ثاني ⚠️⚠️', 3: 'فصل من الإدارة 🚫' };
    resultText = `تم إعطاء: **${levelNames[newLevel]}**`;
    record.warningLevelAssigned = newLevel;

    if (newLevel === 3) {
      const mgmtMention = cfg.report.upperManagementRoleId ? `<@&${cfg.report.upperManagementRoleId}>` : undefined;
      const noticeEmbed = new EmbedBuilder()
        .setTitle('🚨 إشعار فصل من الإدارة')
        .setColor(DISMISS_COLOR)
        .setDescription(`العضو ${member} وصل إلى **3 تحذيرات** وتم فصله من الإدارة تلقائياً.`)
        .addFields(
          { name: 'رقم البلاغ', value: reportId },
          { name: 'قرار الفصل بواسطة', value: `${interaction.user} (${interaction.user.tag})` },
        )
        .setTimestamp();
      const noticeChannelId = cfg.report.upperManagementChannelId || cfg.report.logChannelId || record.channelId;
      await sendLog(guild, noticeChannelId, { content: mgmtMention, embeds: [noticeEmbed] });
    }
  }

  record.status = 'accepted';
  record.decidedBy = interaction.user.id;
  record.decidedByTag = interaction.user.tag;
  record.decidedAt = Date.now();
  saveReports(reports);

  setFieldValue(newEmbed, '— الحالة', `✅ مقبول بواسطة ${interaction.user.tag} — ${resultText}`);
  await interaction.update({ embeds: [newEmbed, ...otherEmbeds], components: [finalRow] });

  const logEmbed = new EmbedBuilder()
    .setTitle('✅ تم قبول بلاغ')
    .setColor(ACCEPT_COLOR)
    .addFields(
      { name: 'رقم البلاغ', value: reportId },
      { name: 'الإداري المُبلغ عنه', value: `${member} (${member.user.tag} | ${member.id})` },
      { name: 'النتيجة', value: resultText },
      { name: 'قُبل بواسطة', value: `${interaction.user} (${interaction.user.tag})` },
    )
    .setTimestamp();
  await sendLog(guild, cfg.report.logChannelId, { embeds: [logEmbed] });
}

// ------------------- إعدادات البلاغات -------------------

async function handleReportSettings(interaction, cfg) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'رتبة_الاستخدام') {
    const role = interaction.options.getRole('الرتبة');
    cfg.report.allowedRoleId = role.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد رتبة استخدام /بلاغ: ${role}`, ephemeral: true });
  }

  if (sub === 'رتبة_الادارة') {
    const role = interaction.options.getRole('الرتبة');
    cfg.report.adminRoleId = role.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد رتبة الإدارة (شرط أساسي بالشخص المُبلَّغ عنه): ${role}`, ephemeral: true });
  }

  if (sub === 'روم_الاستقبال') {
    const channel = interaction.options.getChannel('الروم');
    cfg.report.channelId = channel.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد روم استقبال البلاغات: ${channel}`, ephemeral: true });
  }

  if (sub === 'رتبة_تحذير_اول') {
    const role = interaction.options.getRole('الرتبة');
    cfg.report.warning1RoleId = role.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد رتبة التحذير الأول: ${role}`, ephemeral: true });
  }

  if (sub === 'رتبة_تحذير_ثاني') {
    const role = interaction.options.getRole('الرتبة');
    cfg.report.warning2RoleId = role.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد رتبة التحذير الثاني: ${role}`, ephemeral: true });
  }

  if (sub === 'رتبة_الفصل') {
    const role = interaction.options.getRole('الرتبة');
    cfg.report.warning3RoleId = role.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد رتبة الفصل من الإدارة (التحذير الثالث): ${role}`, ephemeral: true });
  }

  if (sub === 'رتبة_الادارة_العليا') {
    const role = interaction.options.getRole('الرتبة');
    cfg.report.upperManagementRoleId = role.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد رتبة الإدارة العليا (تُشعَر عند وصول عضو للفصل): ${role}`, ephemeral: true });
  }

  if (sub === 'روم_اشعار_الادارة_العليا') {
    const channel = interaction.options.getChannel('الروم');
    cfg.report.upperManagementChannelId = channel.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد روم إشعارات الإدارة العليا: ${channel}`, ephemeral: true });
  }

  if (sub === 'روم_اللوق') {
    const channel = interaction.options.getChannel('الروم');
    cfg.report.logChannelId = channel.id;
    saveConfig(cfg);
    return interaction.reply({ content: `✅ تم تحديد روم لوق نظام البلاغات: ${channel}`, ephemeral: true });
  }

  if (sub === 'عرض_الاعدادات') {
    const r = cfg.report;
    const embed = new EmbedBuilder()
      .setTitle('⚙️ إعدادات نظام البلاغات')
      .setColor(0x2ECC71)
      .addFields(
        { name: 'رتبة الاستخدام (من يقدر يبلّغ)', value: r.allowedRoleId ? `<@&${r.allowedRoleId}>` : 'الجميع (غير محددة)' },
        { name: 'رتبة الإدارة (شرط بالمُبلَّغ عنه)', value: r.adminRoleId ? `<@&${r.adminRoleId}>` : 'غير محددة' },
        { name: 'روم الاستقبال', value: r.channelId ? `<#${r.channelId}>` : 'غير محدد' },
        { name: 'رتبة التحذير الأول', value: r.warning1RoleId ? `<@&${r.warning1RoleId}>` : 'غير محددة' },
        { name: 'رتبة التحذير الثاني', value: r.warning2RoleId ? `<@&${r.warning2RoleId}>` : 'غير محددة' },
        { name: 'رتبة الفصل (تحذير ثالث)', value: r.warning3RoleId ? `<@&${r.warning3RoleId}>` : 'غير محددة' },
        { name: 'رتبة الإدارة العليا', value: r.upperManagementRoleId ? `<@&${r.upperManagementRoleId}>` : 'غير محددة' },
        { name: 'روم إشعار الإدارة العليا', value: r.upperManagementChannelId ? `<#${r.upperManagementChannelId}>` : 'غير محدد' },
        { name: 'روم اللوق', value: r.logChannelId ? `<#${r.logChannelId}>` : 'غير محدد' },
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { handleReportCommand, handleReportButton, handleReportSettings };

const { version } = require('../utils/version');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
    new ButtonBuilder().setCustomId(`blagh_details_${reportId}`).setLabel('تفاصيل البلاغ').setEmoji('📋').setStyle(ButtonStyle.Primary),
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
  // ⚠️ defer فوراً قبل أي شيء لمنع Timeout
  await interaction.deferReply({ ephemeral: true });

  if (cfg.report.allowedRoleId && !hasRole(interaction.member, cfg.report.allowedRoleId)) {
    return interaction.editReply({ content: '❌ ما عندك صلاحية استخدام هذا الأمر.' });
  }
  if (!cfg.report.channelId || !cfg.report.adminRoleId) {
    return interaction.editReply({ content: '⚠️ لم يتم إعداد نظام البلاغات بالكامل بعد (الروم أو رتبة الإدارة)، تواصل مع الإدارة العليا.' });
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
      return interaction.editReply({ content: `⏳ يجب عليك الانتظار **${remaining} دقيقة** قبل تقديم بلاغ آخر.` });
    }
  }

  // ملاحظات إضافية
  const note = interaction.options.getString('ملاحظات') || '';

  // معالجة الشهود (نص منشنات)
  const witnessesRaw = interaction.options.getString('شهود') || '';
  const witnessIds = [...witnessesRaw.matchAll(/<@!?(\d+)>/g)].map(m => m[1]);
  const witnesses = [];
  for (const id of witnessIds) {
    const user = await interaction.client.users.fetch(id).catch(() => null);
    if (user) witnesses.push(user);
  }
  // إذا ما في منشنات، نجرب نقرأها كآيديات رقمية مفصولة بمسافات
  if (!witnesses.length && witnessesRaw.trim()) {
    const possibleIds = witnessesRaw.trim().split(/[\s,]+/);
    for (const id of possibleIds) {
      if (/^\d{15,20}$/.test(id)) {
        const user = await interaction.client.users.fetch(id).catch(() => null);
        if (user) witnesses.push(user);
      }
    }
  }

  // معالجة الدلائل (صور مرفوعة)
  const evidenceList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map(n => interaction.options.getAttachment(`دليل_${n}`))
    .filter(Boolean)
    .map(a => a.url);


  if (target.id === interaction.user.id) {
    return interaction.editReply({ content: '❌ لا يمكنك تقديم بلاغ على نفسك.' });
  }
  if (target.bot) {
    return interaction.editReply({ content: '❌ لا يمكن تقديم بلاغ على بوت.' });
  }

  const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!targetMember) {
    return interaction.editReply({ content: '⚠️ تعذر العثور على هذا العضو في السيرفر.' });
  }
  if (!hasRole(targetMember, cfg.report.adminRoleId)) {
    return interaction.editReply({ content: '❌ الشخص الذي اخترته لا يملك رتبة الإدارة المحددة، لا يمكن تقديم بلاغ عليه.' });
  }

  const channel = await interaction.guild.channels.fetch(cfg.report.channelId).catch(() => null);
  if (!channel) {
    return interaction.editReply({ content: '⚠️ لم أستطع الوصول إلى روم استقبال البلاغات، تأكد من الإعدادات.' });
  }

  const id = generateId();

  const mainEmbed = new EmbedBuilder()
    .setTitle('🛡️ بلاغ جديد على إداري')
    .setColor(REPORT_COLOR)
    .setDescription('البلاغ قيد المراجعة من الإدارة')
    .addFields(
      { name: '— الإداري المُبلغ عنه', value: `${target}` },
      { name: '— الحالة', value: '⏳ قيد المراجعة' },
    )
    .setFooter({ text: `الإصدار: ${version} | رقم البلاغ: ${id}` })
    .setTimestamp();

  // منشن المُبلَّغ عنه + رتبة الإشعار (إن وجدت)
  const mentionParts = [];
  mentionParts.push(target.toString());
  if (cfg.report.mentionRoleId) mentionParts.push(`<@&${cfg.report.mentionRoleId}>`);
  const mentionContent = mentionParts.join(' ');

  const sentMessage = await channel.send({ content: mentionContent, embeds: [mainEmbed], components: [buildReportButtons(id, false)] });

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
    note,
    witnesses: witnesses.map(w => w.id),
    witnessTags: witnesses.map(w => w.tag),
    evidence: evidenceList.filter(Boolean),
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

  await interaction.editReply({
    content: '✅ تم قيد البلاغ بنجاح وإحالته إلى المجلس الأعلى للبت فيه.',
  });

  // ==== رسالة خاصة للمُبلِّغ (مقدم البلاغ) ====
  try {
    const reporterEmbed = new EmbedBuilder()
      .setTitle('⚖️ إشعار استلام بلاغ')
      .setColor(0xF1C40F) // أصفر
      .setDescription('تم رفع بلاغك ضد الإداري بنجاح، وهو الآن قيد التدقيق والمراجعة الصارمة من قبل المجلس الأعلى. سيتم إشعارك بالقرار النهائي.')
      .addFields({ name: 'رقم البلاغ', value: id })
      .setTimestamp();
    await interaction.user.send({ embeds: [reporterEmbed] });
  } catch (e) {
    // صامت - المستخدم قد يكون أغلق الخاص
  }

  // ==== رسالة خاصة للمُبلَّغ عليه ====
  try {
    const targetEmbed = new EmbedBuilder()
      .setTitle('⚠️ إشعار مراجعة إدارية')
      .setColor(0xE67E22) // برتقالي
      .setDescription('تم رفع بلاغ إداري بحقك، وهو حالياً قيد المراجعة من قبل المجلس الأعلى للتحقق من الملابسات. يرجى انتظار القرار.')
      .addFields({ name: 'رقم البلاغ', value: id })
      .setTimestamp();
    await target.send({ embeds: [targetEmbed] });
  } catch (e) {
    // صامت - المستخدم قد يكون أغلق الخاص
  }

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
      { name: 'ملاحظة', value: note || 'لا يوجد' },
      { name: 'عدد الأدلة', value: `${evidenceList.length}` },
      { name: 'الحالة', value: '⏳ قيد المراجعة' },
    )
    .setImage(evidenceList[0] || null)
    .setTimestamp();
  // إرسال اللوق (في حال ما في لوق، نرسله في روم الاستقبال نفسه)
  const logTargetChannelId = cfg.report.logChannelId || cfg.report.channelId;
  await sendLog(interaction.guild, logTargetChannelId, {
    embeds: [logEmbed, ...evidenceList.slice(1).filter(Boolean).map(url => new EmbedBuilder().setColor(REPORT_COLOR).setImage(url))],
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

  if (action === 'details') {
    const witnessList = record.witnesses.length
      ? record.witnesses.map((wid, i) => `<@${wid}> (${record.witnessTags[i] || ''})`).join('\n')
      : 'لا يوجد';

    const evidenceList = (record.evidence && record.evidence.length)
      ? record.evidence.map((url, i) => `[🔗 الدليل ${i + 1}](${url})`).join('\n')
      : 'لا يوجد';

    const detailsEmbed = new EmbedBuilder()
      .setTitle('📋 التفاصيل الكاملة للبلاغ')
      .setColor(0x3498DB)
      .addFields(
        { name: '🕵️ مقدم البلاغ', value: `<@${record.reporterId}> (${record.reporterTag})`, inline: false },
        { name: '🎯 الإداري المُبلَّغ عنه', value: `<@${record.targetId}> (${record.targetTag})`, inline: false },
        { name: '📝 السبب', value: record.reason, inline: false },
        { name: '🕰️ متى حدث', value: record.when, inline: true },
        { name: '📍 أين حدث', value: `<#${record.whereChannelId}>`, inline: true },
        { name: '📌 ملاحظات', value: record.note || 'لا يوجد', inline: false },
        { name: '👥 الشهود', value: witnessList, inline: false },
        { name: '🖼️ الأدلة المرفقة', value: evidenceList, inline: false },
      )
      .setFooter({ text: `رقم البلاغ: ${reportId}` })
      .setTimestamp();

    return interaction.reply({ embeds: [detailsEmbed], ephemeral: true });
  }

  if (action !== 'accept' && action !== 'reject') return;

  if (record.status !== 'pending') {
    return interaction.reply({
      content: `⚠️ تم اتخاذ قرار على هذا البلاغ مسبقاً (${record.status === 'accepted' ? 'مقبول' : 'مرفوض'}).`,
      ephemeral: true,
    });
  }

  // ====== قبول مباشر (بدون مودال) ======
  if (action === 'accept') {
    // ⚠️ deferUpdate فوراً
    await interaction.deferUpdate();

    const guild = interaction.guild;
    const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
    const finalRow = buildReportButtons(reportId, true);
    const member = await guild.members.fetch(record.targetId).catch(() => null);

    let resultText;
    let levelName = '';

    if (!member) {
      resultText = '⚠️ العضو غير موجود بالسيرفر، لم تُطبَّق أي رتبة.';
      levelName = '';
    } else {
      const level = getWarningLevel(member, cfg);

      if (level >= 3) {
        resultText = 'العضو وصل مسبقاً لأقصى مستوى (الفصل من الإدارة)، لم تُضف أي رتبة جديدة.';
        levelName = 'فصل من الإدارة 🚫';
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
        levelName = levelNames[newLevel];
        resultText = levelName;
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
    }

    record.status = 'accepted';
    record.decidedBy = interaction.user.id;
    record.decidedByTag = interaction.user.tag;
    record.decidedAt = Date.now();
    saveReports(reports);

    const acceptText = `✅ تم قبول البلاغ ضد ${member || record.targetTag} - ${levelName || resultText}`;
    setFieldValue(newEmbed, '— الحالة', acceptText);
    await interaction.editReply({ embeds: [newEmbed], components: [finalRow] });

    // ==== لوق القبول ====
    const logEmbed = new EmbedBuilder()
      .setTitle('✅ تم قبول بلاغ')
      .setColor(ACCEPT_COLOR)
      .addFields(
        { name: 'رقم البلاغ', value: reportId },
        { name: 'الإداري المُبلغ عنه', value: `${member || record.targetTag} (${record.targetTag} | ${record.targetId})` },
        { name: 'النتيجة', value: resultText },
        { name: 'قُبل بواسطة', value: `${interaction.user} (${interaction.user.tag})` },
      )
      .setTimestamp();
    await sendLog(guild, cfg.report.logChannelId, { embeds: [logEmbed] });

    // ==== رسائل خاصة للطرفين بالقبول ====
    // للمُبلَّغ عنه
    try {
      const targetUser = member || await interaction.client.users.fetch(record.targetId).catch(() => null);
      if (targetUser) {
        const dmEmbed = new EmbedBuilder()
          .setTitle('✅ قرار المجلس الأعلى')
          .setColor(ACCEPT_COLOR) // أخضر
          .setDescription('بعد التدقيق والمراجعة، تقرر قبول البلاغ المقدم وسيتم اتخاذ الإجراءات الإدارية المترتبة على ذلك.')
          .addFields(
            { name: 'النتيجة', value: levelName || resultText },
          )
          .setTimestamp();
        await targetUser.send({ embeds: [dmEmbed] });
      }
    } catch (_) { /* صامت */ }

    // لمقدم البلاغ
    try {
      const reporterUser = await interaction.client.users.fetch(record.reporterId).catch(() => null);
      if (reporterUser) {
        const dmEmbed = new EmbedBuilder()
          .setTitle('✅ قرار المجلس الأعلى')
          .setColor(ACCEPT_COLOR) // أخضر
          .setDescription('بعد التدقيق والمراجعة، تقرر قبول البلاغ المقدم وسيتم اتخاذ الإجراءات الإدارية المترتبة على ذلك.')
          .setTimestamp();
        await reporterUser.send({ embeds: [dmEmbed] });
      }
    } catch (_) { /* صامت */ }

    return;
  }

  // ====== رفض ← نعرض مودال لكتابة سبب الرفض ======
  const modal = new ModalBuilder()
    .setCustomId(`modal_blagh_reject_${reportId}`)
    .setTitle('❌ رفض البلاغ');

  const reasonInput = new TextInputBuilder()
    .setCustomId('blagh_decision_reason')
    .setLabel('سبب الرفض')
    .setPlaceholder('اكتب سبب رفض البلاغ...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

  return interaction.showModal(modal);
}

// ------------------- معالج مودال القبول/الرفض -------------------

async function handleBlaghModal(interaction) {
  // نحدد الإجراء: modal_blagh_accept_REPORTID أو modal_blagh_reject_REPORTID
  const customId = interaction.customId;
  const parts = customId.split('_');
  // parts[0]='modal', parts[1]='blagh', parts[2]='accept'/'reject', باقي الأجزاء = reportId
  const action = parts[2];
  const reportId = parts.slice(3).join('_');

  // ⚠️ deferUpdate فوراً قبل أي عملية لمنع انتهاء المهلة
  await interaction.deferUpdate();

  if (!isAdmin(interaction.member)) {
    return interaction.editReply({ content: '❌ فقط من لديه صلاحية Administrator يقدر يستخدم هذه الأزرار.', components: [] });
  }

  const cfg = getConfig();
  const reports = getReports();
  const record = reports[reportId];

  if (!record) {
    return interaction.editReply({ content: '⚠️ تعذر العثور على بيانات هذا البلاغ.', components: [] });
  }

  if (record.status !== 'pending') {
    return interaction.editReply({
      content: `⚠️ تم اتخاذ قرار على هذا البلاغ مسبقاً (${record.status === 'accepted' ? 'مقبول' : 'مرفوض'}).`,
      components: [],
    });
  }

  const reason = interaction.fields.getTextInputValue('blagh_decision_reason').trim();
  const guild = interaction.guild;
  const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
  const finalRow = buildReportButtons(reportId, true);

  // ======== رفض (يأتي من المودال) ========
  const member = await guild.members.fetch(record.targetId).catch(() => null);

  record.status = 'rejected';
  record.decidedBy = interaction.user.id;
  record.decidedByTag = interaction.user.tag;
  record.decidedAt = Date.now();
  saveReports(reports);

  setFieldValue(newEmbed, '— الحالة', '❌ تم رفض البلاغ');
  await interaction.editReply({ embeds: [newEmbed], components: [finalRow] });

  // ==== لوق الرفض ====
  const logEmbed = new EmbedBuilder()
    .setTitle('❌ تم رفض بلاغ')
    .setColor(REPORT_COLOR)
    .addFields(
      { name: 'رقم البلاغ', value: reportId },
      { name: 'الإداري المُبلغ عنه', value: `<@${record.targetId}> (${record.targetTag})` },
      { name: 'سبب الرفض', value: reason },
      { name: 'رُفض بواسطة', value: `${interaction.user} (${interaction.user.tag})` },
    )
    .setTimestamp();
  await sendLog(guild, cfg.report.logChannelId, { embeds: [logEmbed] });

  // ==== رسائل خاصة للطرفين بالرفض ====
  // للمُبلَّغ عنه
  try {
    const targetUser = member || await interaction.client.users.fetch(record.targetId).catch(() => null);
    if (targetUser) {
      const dmEmbed = new EmbedBuilder()
        .setTitle('❌ قرار المجلس الأعلى')
        .setColor(REPORT_COLOR) // أحمر
        .setDescription('بعد التدقيق والمراجعة، تقرر حفظ البلاغ ورفضه.')
        .addFields(
          { name: 'سبب الرفض', value: reason },
        )
        .setTimestamp();
      await targetUser.send({ embeds: [dmEmbed] });
    }
  } catch (_) { /* صامت */ }

  // لمقدم البلاغ
  try {
    const reporterUser = await interaction.client.users.fetch(record.reporterId).catch(() => null);
    if (reporterUser) {
      const dmEmbed = new EmbedBuilder()
        .setTitle('❌ قرار المجلس الأعلى')
        .setColor(REPORT_COLOR) // أحمر
        .setDescription('بعد التدقيق والمراجعة، تقرر حفظ البلاغ ورفضه.')
        .addFields(
          { name: 'سبب الرفض', value: reason },
        )
        .setTimestamp();
      await reporterUser.send({ embeds: [dmEmbed] });
    }
  } catch (_) { /* صامت */ }
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

module.exports = { handleReportCommand, handleReportButton, handleBlaghModal, handleReportSettings };

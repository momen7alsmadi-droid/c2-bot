const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType
} = require('discord.js');
const { version } = require('../../package.json');
const mongoose = require('mongoose');
const {
  createReply, updateReply, deleteReply, getReply,
  getAllReplies, getRepliesList, getEnabledReplies, incrementUseCount
} = require('../utils/autoReplyStorage');

// ====== MongoDB Dedup ATOMIC: منع التكرار بين نسخ البوت ======
// كل مستند = مفتاح فريد (messageId:replyName)
// unique _id يمنع الإدراج المكرر على مستوى قاعدة البيانات
const dedupSchema = new mongoose.Schema({
  _id: String, // messageId + ':' + replyName
  createdAt: { type: Date, default: Date.now, expires: 300 } // TTL: 5 دقائق
}, { collection: 'msgdedup2', versionKey: false });

let DedupModel;

function initDedup() {
  if (mongoose.connection.readyState === 1) {
    try {
      DedupModel = mongoose.models.Dedup2 || mongoose.model('Dedup2', dedupSchema);
      // تأكيد إنشاء الـ TTL index
      DedupModel.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 300 }).catch(() => {});
      console.log('📦 dedup → ✅ MongoDB');
      return true;
    } catch (e) {
      console.error('❌ dedup init error:', e.message);
      return false;
    }
  }
  console.log('📦 dedup → ⚠️ MongoDB غير متصل');
  return false;
}

/**
 * التحقق الذري: هل هذا الرد أُرسل لهذه الرسالة من قبل؟
 * يستخدم unique _id constraint في MongoDB لمنع التكرار
 */
async function canSendReply(messageId, replyName) {
  if (!DedupModel || mongoose.connection.readyState !== 1) {
    return true; // MongoDB غير متصل → نسمح
  }
  const key = messageId + ':' + replyName;
  try {
    await DedupModel.create({ _id: key });
    return true; // أول مرة → نسمح
  } catch (e) {
    if (e.code === 11000) {
      // duplicate key → هذا الرد أُرسل سابقاً
      console.log(`🗑️ dedup ATOMIC: ${replyName} ← ${messageId} (مكرر)`);
      return false;
    }
    // خطأ آخر → نسمح احتياطاً
    console.error('❌ dedup error:', e.message);
    return true;
  }
}
// =============================================================

// أنظمة منع التكرار:
// 1- سجل لمنع معالجة نفس الرسالة مرتين
const processedMessages = new Set();
// 2- كولدون لكل رد (ثانية بين كل إرسال)
const replyCooldowns = new Map();
const COOLDOWN_MS = 2000;

/** التحقق من كولدون الرد */
function checkCooldown(replyName, userId) {
  const key = replyName + ':' + userId;
  const now = Date.now();
  if (replyCooldowns.has(key)) {
    const last = replyCooldowns.get(key);
    if (now - last < COOLDOWN_MS) return false;
  }
  replyCooldowns.set(key, now);
  return true;
}
const {
  createReact, updateReact, deleteReact, getReact,
  getReactsList, getEnabledReacts, incrementReactCount
} = require('../utils/reactionReplyStorage');

// ---------- دالة مساعدة ----------
async function respondOrUpdate(interaction, payload) {
  // ===== إضافة الزر الشكلي 'إعادة تعيين' في نهاية الرسائل التي تحتوي قوائم منسدلة =====
  const { appendDecorativeOption } = require('../utils/decorativeReset');
  if (payload && Array.isArray(payload.components) && payload.components.length > 0) {
    payload.components = appendDecorativeOption(payload.components);
  }

  if (interaction.deferred) {
    return interaction.editReply(payload);
  }
  if (interaction.replied) {
    return interaction.followUp(payload);
  }
  if (interaction.isCommand() || interaction.isModalSubmit()) {
    return interaction.reply({ ...payload, ephemeral: true });
  }
  // أزرار/قوائم منسدلة لم يتم تأجيلها مسبقاً → استخدم update() الذي يعترف ويحدث مباشرة
  try {
    return await interaction.update(payload);
  } catch (e) {
    // إذا فشل update (مثلاً التفاعل سبق تأجيله)، نستخدم editReply
    if (interaction.deferred) {
      return interaction.editReply(payload);
    }
    // كملاذ أخير: نؤجل ثم نحدث
    await interaction.deferUpdate().catch(() => {});
    return interaction.editReply(payload);
  }
}

/** Parse time string like "10s", "5m", "2h", "1h 30m" → ms */
function parseTimeString(str) {
  const regex = /(\d+(?:\.\d+)?)\s*([dhms])/gi;
  let match;
  let totalMs = 0;
  let found = false;
  while ((match = regex.exec(str)) !== null) {
    found = true;
    const value = parseFloat(match[1]);
    if (value <= 0) return null;
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 'd': totalMs += value * 86400000; break;
      case 'h': totalMs += value * 3600000; break;
      case 'm': totalMs += value * 60000; break;
      case 's': totalMs += value * 1000; break;
    }
  }
  if (!found) {
    const justNumber = parseFloat(str);
    if (!isNaN(justNumber) && justNumber > 0) return justNumber * 60000;
    return null;
  }
  return Math.round(totalMs);
}

function formatDelay(ms) {
  if (ms <= 0) return 'بدون انتظار';
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000) % 24;
  const days = Math.floor(ms / 86400000);
  const parts = [];
  if (days > 0) parts.push(days + ' يوم');
  if (hours > 0) parts.push(hours + ' ساعة');
  if (minutes > 0) parts.push(minutes + ' دقيقة');
  if (seconds > 0) parts.push(seconds + ' ثانية');
  return parts.join(' و ') || 'لحظات';
}

// ================== اللوحة الرئيسية ==================

async function handleAutoReplyMain(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🤖 لوحة الردود التلقائية')
    .setColor(0x5865F2)
    .setDescription('اختر أحد الخيارات أدناه لإدارة الردود التلقائية.')
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ar_create').setLabel('➕ إضافة رد نصي').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ar_react_create').setLabel('😊 إضافة تفاعل').setStyle(ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ar_list').setLabel('📋 السجل').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ar_edit').setLabel('✏️ تعديل').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ar_delete').setLabel('🗑️ حذف').setStyle(ButtonStyle.Danger),
  );

  return respondOrUpdate(interaction, { embeds: [embed], components: [row1, row2] });
}

// ================== 1. إنشاء رد جديد ==================

async function handleArCreate(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_ar_create')
    .setTitle('➕ إضافة رد تلقائي جديد');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('ar_name')
        .setLabel('🏷️ الاسم الداخلي (لسجل الإدارة)')
        .setPlaceholder('مثال: رد_ترحيب')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('ar_trigger')
        .setLabel('🔑 الكلمة المحفزة (Trigger)')
        .setPlaceholder('مثال: مرحبا')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)
    ),
  );

  await interaction.showModal(modal);
}

async function handleArCreateModal(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.fields.getTextInputValue('ar_name').trim();
    const trigger = interaction.fields.getTextInputValue('ar_trigger').trim();

    const existing = await getReply(name);
    if (existing) {
      return interaction.editReply({ content: `⚠️ الرد "${name}" موجود مسبقاً.` });
    }

    const created = await createReply({
      name, trigger,
      guildId: interaction.guild?.id?.toString() || '',
      responses: [],
      randomReply: false,
      sendStyle: 'reply_mention',
      autoDelete: false, autoDeleteTime: 0,
      deleteUserMsg: false,
      replyDelay: false, replyDelayTime: 0,
      roleWhitelist: [], roleBlacklist: [],
      channelWhitelist: [], channelBlacklist: []
    });

    if (!created) {
      return interaction.editReply({ content: '❌ فشل إنشاء الرد.' });
    }

    return showArControlPanel(interaction, name);
  } catch (e) {
    console.error('[Modal:ArCreate]', e);
    try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch(_) {}
  }
}

// ================== لوحة التحكم الشاملة ==================

async function showArControlPanel(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });

  const responses = data.responses || [];
  const responseCount = responses.length;
  const responsePreview = responseCount > 0
    ? responses.map((r, i) => `**${i + 1}.** ${r.slice(0, 50)}${r.length > 50 ? '…' : ''}`).join('\n')
    : '*(لا توجد نصوص رد)*';

  const rolesW = data.roleWhitelist || [];
  const rolesB = data.roleBlacklist || [];
  const chansW = data.channelWhitelist || [];
  const chansB = data.channelBlacklist || [];

  const infoEmbed = new EmbedBuilder()
    .setTitle(`ℹ️ ${data.name}`)
    .setColor(0x5865F2)
    .addFields(
      { name: '🔑 الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true },
      { name: '✅ مفعل', value: data.enabled !== false ? '🟢 نعم' : '🔴 لا', inline: true },
      { name: '📨 مرات الاستخدام', value: `${data.useCount || 0}`, inline: true },
      { name: '🔍 بحث ضمني', value: data.triggerType === 'contains' ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '🎲 رد عشوائي', value: data.randomReply ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '↩️ نمط الإرسال', value: data.sendStyle === 'reply_mention' ? 'رد مع منشن' : data.sendStyle === 'reply_no_mention' ? 'رد بدون منشن' : 'رسالة عادية', inline: true },
      { name: '🖼️ إيمبد', value: data.replyAsEmbed ? `🟢${data.randomColor ? ' عشوائي' : data.embedColor ? ' ' + data.embedColor : ''}` : '🔴 معطل', inline: true },
      { name: '🗑️ حذف رسالة العضو', value: data.deleteUserMsg ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '⏱️ حذف الرد تلقائياً', value: data.autoDelete ? `🟢 ${formatDelay(data.autoDeleteTime)}` : '🔴 معطل', inline: true },
      { name: '⏳ تأخير الإرسال', value: data.replyDelay ? `🟢 ${formatDelay(data.replyDelayTime)}` : '🔴 معطل', inline: true },
      { name: '🛡️ الرتب المسموحة', value: rolesW.length > 0 ? rolesW.map(r => `<@&${r}>`).join(' ') : '*(الكل)*', inline: false },
      { name: '🚫 الرتب الممنوعة', value: rolesB.length > 0 ? rolesB.map(r => `<@&${r}>`).join(' ') : '*(لا يوجد)*', inline: false },
      { name: '📢 الرومات المسموحة', value: chansW.length > 0 ? chansW.map(c => `<#${c}>`).join(' ') : '*(الكل)*', inline: false },
      { name: '⛔ الرومات الممنوعة', value: chansB.length > 0 ? chansB.map(c => `<#${c}>`).join(' ') : '*(لا يوجد)*', inline: false },
    )
    .setTimestamp();

  if (responseCount > 0) {
    infoEmbed.addFields({ name: `💬 نصوص الرد (${responseCount})`, value: responsePreview, inline: false });
  }

  // ---- الصف الأول ----
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ar_toggle_${replyName}`).setLabel(data.enabled !== false ? '🟢 تعطيل' : '🔴 تفعيل').setStyle(data.enabled !== false ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ar_edit_trigger_${replyName}`).setLabel('✏️ الكلمة المفتاحية').setStyle(ButtonStyle.Primary),
  );

  // ---- الصف الثاني ----
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ar_responses_${replyName}`).setLabel('💬 إدارة نصوص الرد').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ar_random_${replyName}`).setLabel(data.randomReply ? '🎲 عشوائي 🟢' : '🎲 عشوائي 🔴').setStyle(data.randomReply ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ar_sendstyle_${replyName}`).setLabel('↩️ نمط الإرسال').setStyle(ButtonStyle.Secondary),
  );

  // ---- الصف الثالث ----
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ar_implicit_${replyName}`).setLabel(data.triggerType === 'contains' ? '🔍 ضمني 🟢' : '🔍 تام 🔴').setStyle(data.triggerType === 'contains' ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ar_autodel_${replyName}`).setLabel(data.autoDelete ? '⏱️ حذف تلقائي 🟢' : '⏱️ حذف تلقائي 🔴').setStyle(data.autoDelete ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ar_deluser_${replyName}`).setLabel(data.deleteUserMsg ? '🗑️ حذف رسالة العضو 🟢' : '🗑️ حذف رسالة العضو 🔴').setStyle(data.deleteUserMsg ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  // ---- الصف الرابع ----
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ar_delay_${replyName}`).setLabel(data.replyDelay ? '⏳ تأخير 🟢' : '⏳ تأخير 🔴').setStyle(data.replyDelay ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ar_roles_whitelist_${replyName}`).setLabel('🛡️ الرتب المسموحة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ar_roles_blacklist_${replyName}`).setLabel('🚫 الرتب الممنوعة').setStyle(ButtonStyle.Secondary),
  );

  // ---- الصف الخامس - يندمج معه أزرار الإيمبد إن كانت مفعلة ----
  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ar_chans_whitelist_${replyName}`).setLabel('📢 الرومات المسموحة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ar_chans_blacklist_${replyName}`).setLabel('⛔ الرومات الممنوعة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ar_embed_${replyName}`).setLabel(data.replyAsEmbed ? '🖼️ إيمبد 🟢' : '🖼️ إيمبد 🔴').setStyle(data.replyAsEmbed ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  // إذا كان الإيمبد مفعل، نضيف أزرار الألوان إلى نفس الصف الخامس (حد أقصى 5 أزرار)
  if (data.replyAsEmbed) {
    row5.addComponents(
      new ButtonBuilder().setCustomId(`ar_randcolor_${replyName}`).setLabel(data.randomColor ? '🎨 لون عشوائي 🟢' : '🎨 لون عشوائي 🔴').setStyle(data.randomColor ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ar_embedcolor_${replyName}`).setLabel('🎨 اختر لون').setStyle(ButtonStyle.Secondary),
    );
  }

  const components = [row1, row2, row3, row4, row5];

  return respondOrUpdate(interaction, { embeds: [infoEmbed], components });
}

// ================== 2. عرض الردود المسجلة (سجل + معاينة) ==================

async function handleArList(interaction) {
  const textList = await getRepliesList();
  const reactList = await getReactsList();

  if (textList.length === 0 && reactList.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد ردود أو تفاعلات مسجلة.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  // عرض القائمة
  const lines = [];
  if (textList.length > 0) {
    lines.push('**💬 الردود النصية:**');
    textList.forEach(r => {
      lines.push(`${r.enabled ? '🟢' : '🔴'} **${r.name}** — \`${r.trigger}\` | ${r.responsesCount} نص | ${r.useCount} استخدام`);
    });
  }
  if (reactList.length > 0) {
    lines.push('\n**😊 التفاعلات:**');
    reactList.forEach(r => {
      lines.push(`${r.enabled ? '🟢' : '🔴'} **${r.name}** — ${r.emoji} \`${r.trigger}\` | ${r.useCount} استخدام`);
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 السجل الكامل')
    .setColor(0x5865F2)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `إجمالي ${textList.length + reactList.length} | ${textList.length} رد نصي + ${reactList.length} تفاعل` })
    .setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
    )]
  });
}

// عرض تفاصيل رد + معاينة
async function handleArView(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });

  const responses = data.responses || [];
  const responseCount = responses.length;
  const firstResponse = responses.length > 0 ? responses[0] : '*(لا توجد نصوص رد)*';

  const rolesW = data.roleWhitelist || [];
  const rolesB = data.roleBlacklist || [];
  const chansW = data.channelWhitelist || [];
  const chansB = data.channelBlacklist || [];

  const infoEmbed = new EmbedBuilder()
    .setTitle(`📋 ${data.name}`)
    .setColor(0x5865F2)
    .addFields(
      { name: '🔑 الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true },
      { name: '✅ مفعل', value: data.enabled !== false ? '🟢 نعم' : '🔴 لا', inline: true },
      { name: '📨 مرات الاستخدام', value: `${data.useCount || 0}`, inline: true },
      { name: '🔍 بحث ضمني', value: data.triggerType === 'contains' ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '🎲 رد عشوائي', value: data.randomReply ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '↩️ نمط الإرسال', value: data.sendStyle === 'reply_mention' ? 'رد مع منشن' : data.sendStyle === 'reply_no_mention' ? 'رد بدون منشن' : 'رسالة عادية', inline: true },
      { name: '🗑️ حذف رسالة العضو', value: data.deleteUserMsg ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '⏱️ حذف الرد تلقائياً', value: data.autoDelete ? `🟢 ${formatDelay(data.autoDeleteTime)}` : '🔴 معطل', inline: true },
      { name: '⏳ تأخير الإرسال', value: data.replyDelay ? `🟢 ${formatDelay(data.replyDelayTime)}` : '🔴 معطل', inline: true },
      { name: '🛡️ الرتب المسموحة', value: rolesW.length > 0 ? rolesW.map(r => `<@&${r}>`).join(' ') : '*(الكل)*', inline: false },
      { name: '🚫 الرتب الممنوعة', value: rolesB.length > 0 ? rolesB.map(r => `<@&${r}>`).join(' ') : '*(لا يوجد)*', inline: false },
      { name: '📢 الرومات المسموحة', value: chansW.length > 0 ? chansW.map(c => `<#${c}>`).join(' ') : '*(الكل)*', inline: false },
      { name: '⛔ الرومات الممنوعة', value: chansB.length > 0 ? chansB.map(c => `<#${c}>`).join(' ') : '*(لا يوجد)*', inline: false },
    )
    .setTimestamp();

  // إضافة معاينة النص
  const previewEmbed = new EmbedBuilder()
    .setTitle('💬 معاينة نص الرد')
    .setColor(0x2ECC71)
    .setDescription(
      responseCount > 0
        ? responses.map((r, i) => `**${i + 1}.** ${r}`).join('\n\n')
        : '*(لا توجد نصوص رد)*'
    )
    .setFooter({ text: `إجمالي ${responseCount} نص | ${data.randomReply && responseCount > 1 ? '🔄 عشوائي' : '📋 أول نص'}` })
    .setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [infoEmbed, previewEmbed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar_list').setLabel('📋 العودة للسجل').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ar_edit_${replyName}`).setLabel('✏️ فتح لوحة التحكم').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 الرجوع للرئيسية').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// ================== 3. تعديل رد (اختيار) ==================

async function handleArEdit(interaction) {
  await interaction.deferUpdate().catch(() => {});
  const guildId = interaction.guild?.id?.toString() || '';
  const textList = await getRepliesList(guildId);
  const reactList = await getReactsList(guildId);

  const options = [];
  textList.forEach(r => {
    options.push({
      label: r.name,
      description: `💬 "${r.trigger}" — ${r.useCount} استخدام`,
      value: `ar_edit_text_${r.name}`,
      emoji: r.enabled ? '🟢' : '🔴'
    });
  });
  reactList.forEach(r => {
    options.push({
      label: r.name,
      description: `😊 ${r.emoji} "${r.trigger}" — ${r.useCount} استخدام`,
      value: `ar_edit_react_${r.name}`,
      emoji: r.enabled ? '🟢' : '🔴'
    });
  });

  if (options.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد ردود أو تفاعلات للتعديل.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  return respondOrUpdate(interaction, {
    content: '✏️ اختر ما تريد تعديله:',
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ar_edit_select').setPlaceholder('✏️ اختر')
          .addOptions(options.slice(0, 25))
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// ================== 3.1 معالج قائمة التعديل (ar_edit_select) ==================

/**
 * معالج اختيار رد من القائمة المنسدلة لتعديله.
 * الحل الصارم لمشكلتين:
 *  1) InteractionNotReplied → deferUpdate في أول سطر.
 *  2) "الرد غير موجود" → استخراج الاسم بـ slice ليطابق مفتاح قاعدة البيانات تماماً،
 *     مع التحقق من وجوده قبل عرض اللوحة، وتحديث نفس الرسالة عبر editReply.
 */
async function handleArEditSelect(interaction) {
  // 1) تأجيل فوري — أول رد للتفاعل (يمنع خطأ InteractionNotReplied)
  await interaction.deferUpdate().catch(() => {});

  // 2) فحص القيمة القادمة من القائمة المنسدلة
  const val = interaction.values[0];
  console.log(`🔽 [ar_edit_select] القيمة من القائمة: "${val}"`);

  if (!val) {
    return respondOrUpdate(interaction, { content: '⚠️ لم يتم تحديد أي رد.' });
  }

  // 3) استخراج اسم الرد من القيمة — slice يقطع البادئة بالضبط
  //    (القيم بُنيت في handleArEdit على الصيغة: ar_edit_text_{name} / ar_edit_react_{name})
  let name;
  let isReact = false;
  if (val.startsWith('ar_edit_react_')) {
    isReact = true;
    name = val.slice('ar_edit_react_'.length);
  } else if (val.startsWith('ar_edit_text_')) {
    name = val.slice('ar_edit_text_'.length);
  } else {
    console.error(`❌ [ar_edit_select] قيمة غير معروفة: "${val}"`);
    return respondOrUpdate(interaction, { content: `⚠️ قيمة غير معروفة: \`${val}\`` });
  }

  console.log(`🔽 [ar_edit_select] اسم الرد المستخرج: "${name}"`);

  // 4) مطابقة الاسم مع مفتاح البحث في قاعدة البيانات
  if (isReact) {
    const { showRrControlPanel } = require('./reactReply');
    return showRrControlPanel(interaction, name);
  }

  const data = await getReply(name);
  if (!data) {
    console.error(`❌ [ar_edit_select] الرد غير موجود في قاعدة البيانات: "${name}"`);
    return respondOrUpdate(interaction, { content: `⚠️ الرد غير موجود في قاعدة البيانات: \`${name}\`` });
  }
  console.log(`✅ [ar_edit_select] تم العثور على الرد: "${name}"`);

  // 5) عرض لوحة التحكم على نفس الرسالة (respondOrUpdate → editReply بعد deferUpdate)
  return showArControlPanel(interaction, name);
}

// ================== 4. حذف رد ==================

async function handleArDelete(interaction) {
  const textList = await getRepliesList();
  const reactList = await getReactsList();

  const options = [];
  textList.forEach(r => {
    options.push({
      label: r.name,
      description: `💬 "${r.trigger}"`,
      value: `ar_del_text_${r.name}`,
      emoji: '🗑️'
    });
  });
  reactList.forEach(r => {
    options.push({
      label: r.name,
      description: `😊 ${r.emoji} "${r.trigger}"`,
      value: `ar_del_react_${r.name}`,
      emoji: '🗑️'
    });
  });

  if (options.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد ردود أو تفاعلات للحذف.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  return respondOrUpdate(interaction, {
    content: '🗑️ اختر ما تريد حذفه:',
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ar_delete_select').setPlaceholder('🗑️ اختر')
          .addOptions(options.slice(0, 25))
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleArDeleteConfirm(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });

  const embed = new EmbedBuilder()
    .setTitle('🗑️ تأكيد الحذف')
    .setColor(0xFF0000)
    .setDescription(`هل أنت متأكد من حذف الرد **${replyName}**؟`)
    .addFields(
      { name: 'الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true },
      { name: 'مرات الاستخدام', value: `${data.useCount || 0}`, inline: true }
    )
    .setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ar_delete_yes_${replyName}`).setLabel('✅ نعم، احذف').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ar_delete').setLabel('❌ لا، تراجع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleArDeleteExecute(interaction, replyName) {
  const success = await deleteReply(replyName);
  return respondOrUpdate(interaction, {
    content: success ? `✅ تم حذف الرد **${replyName}** بنجاح.` : '❌ فشل حذف الرد.',
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
    )]
  });
}

// ================== معالجات الأزرار (Toggle & Edit) ==================

// تبديل التفعيل
async function handleArToggle(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });
  await updateReply(replyName, { enabled: data.enabled === false });
  return showArControlPanel(interaction, replyName);
}

// تعديل الكلمة المفتاحية
async function handleArEditTrigger(interaction, replyName) {
  const data = await getReply(replyName);
  const modal = new ModalBuilder().setCustomId(`modal_ar_trigger_${replyName}`).setTitle('✏️ تعديل الكلمة المفتاحية');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('ar_trigger').setLabel('الكلمة المفتاحية الجديدة')
      .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500).setValue(data?.trigger || '')
  ));
  await interaction.showModal(modal);
}

// تبديل البحث الضمني (contains ↔ exact)
async function handleArImplicit(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });
  const newType = data.triggerType === 'contains' ? 'exact' : 'contains';
  await updateReply(replyName, { triggerType: newType });
  return showArControlPanel(interaction, replyName);
}

// تبديل الرد العشوائي
async function handleArRandom(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });
  await updateReply(replyName, { randomReply: !data.randomReply });
  return showArControlPanel(interaction, replyName);
}

// تبديل حذف رسالة العضو
async function handleArDelUser(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });
  await updateReply(replyName, { deleteUserMsg: !data.deleteUserMsg });
  return showArControlPanel(interaction, replyName);
}

// ⏱️ تبديل الحذف التلقائي / ضبط المدة
async function handleArAutoDel(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });
  if (data.autoDelete) {
    // إيقاف الحذف التلقائي
    await updateReply(replyName, { autoDelete: false });
    return showArControlPanel(interaction, replyName);
  } else {
    // فتح Modal لضبط المدة
    const modal = new ModalBuilder().setCustomId(`modal_ar_autodel_${replyName}`).setTitle('⏱️ ضبط مدة الحذف التلقائي');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('ar_autodel_time').setLabel('المدة (مثال: 10s, 5m, 2h, 1d 30m)')
        .setPlaceholder('10s').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)
    ));
    await interaction.showModal(modal);
  }
}

// ⏳ تبديل تأخير الإرسال / ضبط المدة
async function handleArDelay(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });
  if (data.replyDelay) {
    await updateReply(replyName, { replyDelay: false });
    return showArControlPanel(interaction, replyName);
  } else {
    const modal = new ModalBuilder().setCustomId(`modal_ar_delay_${replyName}`).setTitle('⏳ ضبط مدة التأخير قبل الإرسال');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('ar_delay_time').setLabel('المدة (مثال: 5s, 1m, 30s)')
        .setPlaceholder('5s').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)
    ));
    await interaction.showModal(modal);
  }
}

// ================== 🖼️ إرسال كإيمبد ==================

async function handleArEmbed(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });
  const newVal = !data.replyAsEmbed;
  await updateReply(replyName, { replyAsEmbed: newVal });
  return showArControlPanel(interaction, replyName);
}

async function handleArRandColor(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });
  const newVal = !data.randomColor;
  await updateReply(replyName, { randomColor: newVal, replyAsEmbed: true });
  return showArControlPanel(interaction, replyName);
}

async function handleArEmbedColor(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });

  const modal = new ModalBuilder()
    .setCustomId(`modal_ar_embedcolor_${replyName}`)
    .setTitle('🎨 اختر لون الإيمبد');

  const colorInput = new TextInputBuilder()
    .setCustomId('ar_embed_color')
    .setLabel('لون (Hex: #FF0000 أو اسم: Red)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(data.embedColor || '#5865F2');

  modal.addComponents(new ActionRowBuilder().addComponents(colorInput));
  return interaction.showModal(modal);
}

// ================== 💬 إدارة نصوص الرد ==================

async function handleArResponses(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });

  const responses = data.responses || [];

  const embed = new EmbedBuilder()
    .setTitle(`💬 نصوص الرد — ${replyName}`)
    .setColor(0x5865F2)
    .setDescription(responses.length > 0
      ? responses.map((r, i) => `**${i + 1}.** ${r.slice(0, 100)}${r.length > 100 ? '…' : ''}`).join('\n\n')
      : '*(لا توجد نصوص رد بعد)*')
    .setFooter({ text: `إجمالي ${responses.length} نص` })
    .setTimestamp();

  const btnBack = new ButtonBuilder().setCustomId(`ar_edit_${replyName}`).setLabel('🔙 رجوع للوحة التحكم').setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ar_resp_add_${replyName}`).setLabel('➕ إضافة نص جديد').setStyle(ButtonStyle.Success),
    btnBack,
  );

  // إذا كان هناك نصوص، أضف أزرار الحذف
  const components = [row1];
  if (responses.length > 0) {
    const chunks = [];
    for (let i = 0; i < responses.length; i += 5) {
      chunks.push(responses.slice(i, i + 5));
    }
    // أضف زر حذف لكل نص (أقصى 5 أزرار)
    const deleteRow = new ActionRowBuilder();
    for (let i = 0; i < Math.min(responses.length, 5); i++) {
      deleteRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`ar_resp_del_${replyName}_${i}`)
          .setLabel(`❌ ${i + 1}`)
          .setStyle(ButtonStyle.Danger)
      );
    }
    if (deleteRow.components.length > 0) components.push(deleteRow);
  }

  return respondOrUpdate(interaction, { embeds: [embed], components });
}

// إضافة نص رد
async function handleArRespAdd(interaction, replyName) {
  const modal = new ModalBuilder().setCustomId(`modal_ar_resp_add_${replyName}`).setTitle('➕ إضافة نص رد جديد');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('ar_resp_text').setLabel('نص الرد الجديد')
      .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000)
  ));
  await interaction.showModal(modal);
}

// حذف نص رد
async function handleArRespDel(interaction, replyName, index) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });
  const responses = [...(data.responses || [])];
  if (index < 0 || index >= responses.length) {
    return respondOrUpdate(interaction, { content: '⚠️ الرقم غير صحيح.' });
  }
  responses.splice(index, 1);
  await updateReply(replyName, { responses });
  return handleArResponses(interaction, replyName);
}

// ================== ↩️ نمط الإرسال ==================

async function handleArSendStyle(interaction, replyName) {
  const data = await getReply(replyName);
  const options = [
    { label: 'رد مع منشن', value: `ar_setstyle_${replyName}_reply_mention`, emoji: '👤', default: data?.sendStyle === 'reply_mention' },
    { label: 'رد بدون منشن', value: `ar_setstyle_${replyName}_reply_no_mention`, emoji: '🔇', default: data?.sendStyle === 'reply_no_mention' },
    { label: 'رسالة عادية', value: `ar_setstyle_${replyName}_normal`, emoji: '📨', default: data?.sendStyle === 'normal' },
  ];
  const embed = new EmbedBuilder()
    .setTitle('↩️ اختر نمط الإرسال').setColor(0x5865F2)
    .setDescription(`الحالي: **${data?.sendStyle === 'reply_mention' ? 'رد مع منشن' : data?.sendStyle === 'reply_no_mention' ? 'رد بدون منشن' : 'رسالة عادية'}**`)
    .setTimestamp();
  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId('ar_setstyle_select').setPlaceholder('↩️ اختر نمط الإرسال').addOptions(options)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ar_edit_${replyName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// ================== قوائم الرتب (RoleSelectMenu) ==================

async function handleArRolesWhitelist(interaction, replyName) {
  const data = await getReply(replyName);
  const current = data?.roleWhitelist || [];
  return respondOrUpdate(interaction, {
    content: `🛡️ **الرتب المسموحة** (${current.length})\nالحالية: ${current.length > 0 ? current.map(r => `<@&${r}>`).join(' ') : '*(الكل)*'}\n\nاختر الرتب المسموح لها باستخدام هذا الرد (أو اختر空的 للإلغاء):`,
    components: [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`ar_roles_w_set_${replyName}`)
          .setPlaceholder('🛡️ اختر الرتب المسموحة')
          .setMinValues(0).setMaxValues(25)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ar_edit_${replyName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleArRolesBlacklist(interaction, replyName) {
  const data = await getReply(replyName);
  const current = data?.roleBlacklist || [];
  return respondOrUpdate(interaction, {
    content: `🚫 **الرتب الممنوعة** (${current.length})\nالحالية: ${current.length > 0 ? current.map(r => `<@&${r}>`).join(' ') : '*(لا يوجد)*'}\n\nاختر الرتب الممنوعة من استخدام هذا الرد:`,
    components: [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`ar_roles_b_set_${replyName}`)
          .setPlaceholder('🚫 اختر الرتب الممنوعة')
          .setMinValues(0).setMaxValues(25)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ar_edit_${replyName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// ================== قوائم الرومات (ChannelSelectMenu) ==================

async function handleArChansWhitelist(interaction, replyName) {
  const data = await getReply(replyName);
  const current = data?.channelWhitelist || [];
  return respondOrUpdate(interaction, {
    content: `📢 **الرومات المسموحة** (${current.length})\nالحالية: ${current.length > 0 ? current.map(c => `<#${c}>`).join(' ') : '*(الكل)*'}\n\nاختر الرومات التي يعمل فيها الرد:`,
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`ar_chans_w_set_${replyName}`)
          .setPlaceholder('📢 اختر الرومات المسموحة')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(0).setMaxValues(25)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ar_edit_${replyName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleArChansBlacklist(interaction, replyName) {
  const data = await getReply(replyName);
  const current = data?.channelBlacklist || [];
  return respondOrUpdate(interaction, {
    content: `⛔ **الرومات الممنوعة** (${current.length})\nالحالية: ${current.length > 0 ? current.map(c => `<#${c}>`).join(' ') : '*(لا يوجد)*'}\n\nاختر الرومات الممنوعة من استخدام الرد:`,
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`ar_chans_b_set_${replyName}`)
          .setPlaceholder('⛔ اختر الرومات الممنوعة')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(0).setMaxValues(25)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ar_edit_${replyName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// ================== معالجات القوائم المنسدلة ==================

// نوع الإرسال
async function handleArSetStyle(interaction) {
  const value = interaction.values[0]; // الصيغة: ar_setstyle_{name}_{style}

  // استخراج النمط من نهاية القيمة (يدعم أسماء تحتوي على _ داخلها)
  let style = null;
  if (value.endsWith('_reply_mention')) style = 'reply_mention';
  else if (value.endsWith('_reply_no_mention')) style = 'reply_no_mention';
  else if (value.endsWith('_normal')) style = 'normal';

  if (!style) {
    return respondOrUpdate(interaction, { content: '⚠️ نمط إرسال غير صالح.' });
  }

  // استخراج اسم الرد بقطع البادئة ar_setstyle_ واللاحقة _style
  const name = value.replace(/^ar_setstyle_/, '').slice(0, -(style.length + 1));

  const data = await getReply(name);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });

  await updateReply(name, { sendStyle: style });
  return showArControlPanel(interaction, name);
}

// الرتب المسموحة
async function handleArRolesWSet(interaction) {
  const id = interaction.customId; // ar_roles_w_set_{name}
  const name = id.replace('ar_roles_w_set_', '');
  const roles = interaction.values || [];
  await updateReply(name, { roleWhitelist: roles });
  return showArControlPanel(interaction, name);
}

// الرتب الممنوعة
async function handleArRolesBSet(interaction) {
  const id = interaction.customId;
  const name = id.replace('ar_roles_b_set_', '');
  const roles = interaction.values || [];
  await updateReply(name, { roleBlacklist: roles });
  return showArControlPanel(interaction, name);
}

// الرومات المسموحة
async function handleArChansWSet(interaction) {
  const id = interaction.customId;
  const name = id.replace('ar_chans_w_set_', '');
  const channels = interaction.values || [];
  await updateReply(name, { channelWhitelist: channels });
  return showArControlPanel(interaction, name);
}

// الرومات الممنوعة
async function handleArChansBSet(interaction) {
  const id = interaction.customId;
  const name = id.replace('ar_chans_b_set_', '');
  const channels = interaction.values || [];
  await updateReply(name, { channelBlacklist: channels });
  return showArControlPanel(interaction, name);
}

// ================== معالجات الـ Modal ==================

async function handleAutoReplyModal(interaction) {
  const id = interaction.customId;

  // إنشاء رد جديد
  if (id === 'modal_ar_create') return handleArCreateModal(interaction);

  // تعديل الكلمة المفتاحية
  if (id.startsWith('modal_ar_trigger_')) {
    const name = id.replace('modal_ar_trigger_', '');
    const trigger = interaction.fields.getTextInputValue('ar_trigger').trim();
    await updateReply(name, { trigger });
    return showArControlPanel(interaction, name);
  }

  // إضافة نص رد
  if (id.startsWith('modal_ar_resp_add_')) {
    const name = id.replace('modal_ar_resp_add_', '');
    const text = interaction.fields.getTextInputValue('ar_resp_text').trim();
    const data = await getReply(name);
    const responses = [...(data?.responses || []), text];
    await updateReply(name, { responses });
    return handleArResponses(interaction, name);
  }

  // ضبط مدة الحذف التلقائي
  if (id.startsWith('modal_ar_autodel_')) {
    const name = id.replace('modal_ar_autodel_', '');
    const timeStr = interaction.fields.getTextInputValue('ar_autodel_time').trim();
    const ms = parseTimeString(timeStr);
    if (!ms) {
      return interaction.reply({ content: '⚠️ صيغة الوقت غير صالحة. استخدم مثلاً: 10s, 5m, 2h, 1d 30m', ephemeral: true });
    }
    if (ms > 86400000) { // حد أقصى 24 ساعة
      return interaction.reply({ content: '⚠️ الحد الأقصى للحذف التلقائي هو 24 ساعة.', ephemeral: true });
    }
    await updateReply(name, { autoDelete: true, autoDeleteTime: ms });
    return showArControlPanel(interaction, name);
  }

  // ضبط مدة التأخير
  if (id.startsWith('modal_ar_delay_')) {
    const name = id.replace('modal_ar_delay_', '');
    const timeStr = interaction.fields.getTextInputValue('ar_delay_time').trim();
    const ms = parseTimeString(timeStr);
    if (!ms) {
      return interaction.reply({ content: '⚠️ صيغة الوقت غير صالحة.', ephemeral: true });
    }
    if (ms > 600000) { // حد أقصى 10 دقائق
      return interaction.reply({ content: '⚠️ الحد الأقصى للتأخير هو 10 دقائق.', ephemeral: true });
    }
    await updateReply(name, { replyDelay: true, replyDelayTime: ms });
    return showArControlPanel(interaction, name);
  }

  // اختيار لون الإيمبد
  if (id.startsWith('modal_ar_embedcolor_')) {
    const name = id.replace('modal_ar_embedcolor_', '');
    const color = interaction.fields.getTextInputValue('ar_embed_color').trim();
    await updateReply(name, { embedColor: color, replyAsEmbed: true });
    return showArControlPanel(interaction, name);
  }

  // توجيه مودالات التفاعلات
  if (id.startsWith('modal_rr_')) {
    const { handleReactModal } = require('./reactReply');
    return handleReactModal(interaction);
  }

  return interaction.reply({ content: '⚠️ Modal غير معروف.', ephemeral: true });
}

// ================== الموزع الرئيسي ==================

async function handleAutoReplyInteraction(interaction) {
  const id = interaction.customId;
  const parts = id.split('_');
  const prefix = parts[0];

  // ✅ تأجيل فوري لأي قائمة منسدلة (StringSelect / RoleSelect / ChannelSelect)
  // لمنع خطأ InteractionNotReplied عند تأخر عمليات قاعدة البيانات.
  // بعد التأجيل يتم تحديث نفس الرسالة عبر editReply داخل respondOrUpdate.
  if (
    id.startsWith('ar_') &&
    (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu())
  ) {
    await interaction.deferUpdate().catch(() => {});
  }

  // الأزرار الرئيسية
  if (id === 'ar_main') return handleAutoReplyMain(interaction);
  if (id === 'ar_create') return handleArCreate(interaction);
  if (id === 'ar_list') return handleArList(interaction);
  if (id === 'ar_edit') return handleArEdit(interaction);
  if (id === 'ar_delete') return handleArDelete(interaction);

  // اختيار للعرض (سجل + معاينة)
  if (id === 'ar_view_select') {
    const name = interaction.values[0].replace('ar_view_', '');
    return handleArView(interaction, name);
  }

  // اختيار للتعديل (نصي أو تفاعل) — معالج مخصص بإصلاح صارم
  if (id === 'ar_edit_select') {
    return handleArEditSelect(interaction);
  }

  // اختيار للحذف (نصي أو تفاعل)
  if (id === 'ar_delete_select') {
    const val = interaction.values[0];
    if (val.startsWith('ar_del_react_')) {
      const name = val.replace('ar_del_react_', '');
      const { handleRrDeleteConfirm } = require('./reactReply');
      return handleRrDeleteConfirm(interaction, name);
    } else {
      const name = val.replace('ar_del_text_', '');
      return handleArDeleteConfirm(interaction, name);
    }
  }

  // تأكيد حذف رد نصي
  if (prefix === 'ar' && parts[1] === 'delete' && parts[2] === 'yes') {
    return handleArDeleteExecute(interaction, parts.slice(3).join('_'));
  }

  // تأكيد حذف تفاعل
  if (id.startsWith('rr_delete_yes_')) {
    const { handleRrDeleteExecute } = require('./reactReply');
    return handleRrDeleteExecute(interaction, id.replace('rr_delete_yes_', ''));
  }

  // تراجع عن حذف تفاعل
  if (id === 'rr_delete') {
    return handleArDelete(interaction);
  }

  // ---- أزرار التبديل ----
  if (id.startsWith('ar_toggle_')) return handleArToggle(interaction, id.replace('ar_toggle_', ''));
  if (id.startsWith('ar_implicit_')) return handleArImplicit(interaction, id.replace('ar_implicit_', ''));
  if (id.startsWith('ar_random_')) return handleArRandom(interaction, id.replace('ar_random_', ''));
  if (id.startsWith('ar_deluser_')) return handleArDelUser(interaction, id.replace('ar_deluser_', ''));
  if (id.startsWith('ar_autodel_')) return handleArAutoDel(interaction, id.replace('ar_autodel_', ''));
  if (id.startsWith('ar_delay_')) return handleArDelay(interaction, id.replace('ar_delay_', ''));

  // أزرار الإيمبد
  if (id.startsWith('ar_embed_')) return handleArEmbed(interaction, id.replace('ar_embed_', ''));
  if (id.startsWith('ar_randcolor_')) return handleArRandColor(interaction, id.replace('ar_randcolor_', ''));
  if (id.startsWith('ar_embedcolor_')) return handleArEmbedColor(interaction, id.replace('ar_embedcolor_', ''));

  // تعديل الكلمة المفتاحية (قبل الرجوع العام)
  if (id.startsWith('ar_edit_trigger_')) return handleArEditTrigger(interaction, id.replace('ar_edit_trigger_', ''));

  // الرجوع للوحة التحكم (ar_edit_xxx) — بعد الأنماط الأكثر تحديداً
  if (prefix === 'ar' && parts[1] === 'edit' && parts.length > 2) {
    return showArControlPanel(interaction, id.replace(/^ar_edit_/, ''));
  }

  // إدارة نصوص الرد
  if (id.startsWith('ar_responses_')) return handleArResponses(interaction, id.replace('ar_responses_', ''));
  if (id.startsWith('ar_resp_add_')) return handleArRespAdd(interaction, id.replace('ar_resp_add_', ''));
  if (id.startsWith('ar_resp_del_')) {
    // ar_resp_del_{name}_{index}
    const match = id.match(/^ar_resp_del_(.+)_(\d+)$/);
    if (match) return handleArRespDel(interaction, match[1], parseInt(match[2], 10));
  }

  // نمط الإرسال
  if (id.startsWith('ar_sendstyle_')) return handleArSendStyle(interaction, id.replace('ar_sendstyle_', ''));

  // الرتب
  if (id.startsWith('ar_roles_whitelist_')) return handleArRolesWhitelist(interaction, id.replace('ar_roles_whitelist_', ''));
  if (id.startsWith('ar_roles_blacklist_')) return handleArRolesBlacklist(interaction, id.replace('ar_roles_blacklist_', ''));

  // الرومات
  if (id.startsWith('ar_chans_whitelist_')) return handleArChansWhitelist(interaction, id.replace('ar_chans_whitelist_', ''));
  if (id.startsWith('ar_chans_blacklist_')) return handleArChansBlacklist(interaction, id.replace('ar_chans_blacklist_', ''));

  // اختيار نوع الإرسال (StringSelectMenu)
  if (id === 'ar_setstyle_select') return handleArSetStyle(interaction);

  // اختيار الرتب المسموحة (RoleSelectMenu)
  if (id.startsWith('ar_roles_w_set_')) return handleArRolesWSet(interaction);
  if (id.startsWith('ar_roles_b_set_')) return handleArRolesBSet(interaction);

  // اختيار الرومات المسموحة (ChannelSelectMenu)
  if (id.startsWith('ar_chans_w_set_')) return handleArChansWSet(interaction);
  if (id.startsWith('ar_chans_b_set_')) return handleArChansBSet(interaction);

  // ========== توجيه التفاعلات (rr_) ==========
  if (id.startsWith('rr_')) {
    const { handleReactInteraction } = require('./reactReply');
    return handleReactInteraction(interaction);
  }

  return respondOrUpdate(interaction, { content: `⚠️ أمر غير معروف: ${id}` });
}

// ================== محرك معالجة الرسائل ==================

async function handleMessage(message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  // تهيئة نظام منع التكرار عبر MongoDB (لمنافذ متعددة)
  if (!DedupModel) initDedup();

  // منع التكرار عبر الذاكرة المحلية
  const msgKey = message.id;
  if (processedMessages.has(msgKey)) return;
  processedMessages.add(msgKey);
  setTimeout(() => processedMessages.delete(msgKey), 10000);

  const replies = await getEnabledReplies();
  if (replies.length === 0) return;

  const content = message.content;
  const member = message.member;
  const channel = message.channel;

  // تتبع المحفزات التي تم الرد عليها لمنع تكرار نفس المحفز
  const usedTriggers = new Set();

  for (const reply of replies) {
    // إذا كان هذا المحفز قد تم استخدامه بالفعل، نتخطاه
    const triggerLower = (reply.trigger || '').toLowerCase();
    if (usedTriggers.has(triggerLower)) {
      console.log(`⏭️ تكرار محفز: "${reply.trigger}" تم الرد عليه مسبقاً`);
      continue;
    }

    // === فحص الرومات (Whitelist / Blacklist) ===
    const chW = reply.channelWhitelist || [];
    const chB = reply.channelBlacklist || [];
    if (chW.length > 0 && !chW.includes(channel.id)) continue;
    if (chB.length > 0 && chB.includes(channel.id)) continue;

    // توافق مع channelId القديم
    if (reply.channelId && channel.id !== reply.channelId) continue;

    // === فحص الرتب (Whitelist / Blacklist) ===
    if (member) {
      const roles = member.roles.cache.map(r => r.id);
      const rW = reply.roleWhitelist || [];
      const rB = reply.roleBlacklist || [];

      // إذا كان هناك قائمة بيضاء، يجب أن يمتلك العضو رتبة منها (أو يكون أدمن)
      if (rW.length > 0 && !member.permissions.has('Administrator')) {
        const hasWhitelistedRole = roles.some(r => rW.includes(r));
        if (!hasWhitelistedRole) continue;
      }

      // إذا كان في القائمة السوداء، تخط
      if (rB.length > 0 && !member.permissions.has('Administrator')) {
        const hasBlacklistedRole = roles.some(r => rB.includes(r));
        if (hasBlacklistedRole) continue;
      }
    }

    // === المطابقة ===
    let matched = false;
    const msg = reply.caseSensitive ? content : content.toLowerCase();
    const trigger = reply.caseSensitive ? reply.trigger : reply.trigger.toLowerCase();

    if (reply.triggerType === 'contains') {
      matched = msg.includes(trigger);
    } else {
      // exact
      matched = msg === trigger;
    }

    if (!matched) continue;

    // تسجيل المحفز كمستخدم (لمنع التكرار)
    usedTriggers.add(triggerLower);

    // === تمت المطابقة ===

    try {
      // ✅ كولدون محلي: منع إرسال نفس الرد لنفس المستخدم خلال ثانيتين
      const cooldownKey = reply.name + ':' + message.author.id;
      const now = Date.now();
      if (replyCooldowns.has(cooldownKey)) {
        const last = replyCooldowns.get(cooldownKey);
        if (now - last < COOLDOWN_MS) {
          console.log(`⏳ كولدون: "${reply.name}" ← ${message.author.tag} (${now - last}ms)`);
          continue;
        }
      }
      replyCooldowns.set(cooldownKey, now);

      // ✅ MongoDB Dedup: منع التكرار بين نسخ البوت المتعددة
      const dedupOk = await canSendReply(message.id, reply.name);
      if (!dedupOk) {
        console.log(`🗑️ dedup منع: ${reply.name} للرسالة ${message.id}`);
        continue;
      }

      // زيادة العداد
      await incrementUseCount(reply.name);

      // حذف رسالة العضو إن مفعل
      if (reply.deleteUserMsg) {
        try {
          await message.delete();
        } catch { /* قد لا نملك الصلاحية */ }
      }

      // اختيار النص
      const responses = reply.responses || [];
      if (responses.length === 0) continue; // لا يوجد نصوص رد

      let text;
      if (reply.randomReply && responses.length > 1) {
        text = responses[Math.floor(Math.random() * responses.length)];
      } else {
        text = responses[0];
      }

      // دالة الإرسال (مع دعم الإيمبد)
      const sendReply = async () => {
        try {
          // بناء الإيمبد لو مفعل
          let payload;
          if (reply.replyAsEmbed) {
            const color = reply.randomColor
              ? Math.floor(Math.random() * 0xFFFFFF)
              : parseInt((reply.embedColor || '#5865F2').replace('#', ''), 16);
            const embed = new EmbedBuilder()
              .setDescription(text)
              .setColor(color)
              .setTimestamp();
            payload = { embeds: [embed] };
          } else {
            payload = { content: text };
          }

          if (reply.sendStyle === 'reply_with_mention' || reply.sendStyle === 'reply_mention') {
            await message.reply({ ...payload, allowedMentions: { repliedUser: true } });
          } else if (reply.sendStyle === 'reply_no_mention') {
            await message.reply({ ...payload, allowedMentions: { repliedUser: false } });
          } else {
            // normal
            await channel.send(payload);
          }

          // حذف تلقائي إن مفعل
          if (reply.autoDelete && reply.autoDeleteTime > 0) {
            setTimeout(async () => {
              try {
                // لا يمكن حذف رد بسهولة لأنه لا نعرف message ID الخاص بالرد,
                // سنحاول البحث عنه أو نستخدم channel.lastMessage
                // هذه ميزة متقدمة - سنتركها للتطوير المستقبلي
              } catch {}
            }, reply.autoDeleteTime);
          }
        } catch (e) {
          console.error(`❌ autoReply send error:`, e.message);
        }
      };

      // التأخير أو الإرسال مباشرة
      if (reply.replyDelay && reply.replyDelayTime > 0) {
        setTimeout(sendReply, reply.replyDelayTime);
      } else {
        await sendReply();
      }

      console.log(`✅ autoReply: "${reply.trigger}" ← ${message.author.tag}`);
    } catch (e) {
      console.error(`❌ autoReply error for "${reply.name}":`, e.message);
    }

    // ملاحظة: بدون break عشان كل الردود المطابقة تشتغل
  }
}

module.exports = {
  handleAutoReplyInteraction,
  handleAutoReplyModal,
  handleAutoReplyMain,
  handleMessage
};

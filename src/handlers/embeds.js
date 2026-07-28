const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { COLORS } = require('../utils/colors');
const { version } = require('../../package.json');
const {
  initEmbedModel,
  getAllEmbeds,
  getEmbed,
  createEmbed,
  updateEmbed,
  deleteEmbed,
  incrementSendCount,
  getEmbedsList
} = require('../utils/embedStorage');

// ---------- دالة مساعدة للرد أو التحديث ----------
async function respondOrUpdate(interaction, payload) {
  // إذا كان التفاعل مؤجلاً (deferReply / deferUpdate) → editReply
  if (interaction.deferred) {
    return interaction.editReply(payload).catch(() => {});
  }
  // أوامر سلاش ومودالات لم يسبق الرد عليها → reply
  if (interaction.isCommand() || interaction.isModalSubmit()) {
    return interaction.reply({ ...payload, ephemeral: true });
  }
  // أزرار وقوائم منسدلة لم يسبق الرد عليها → update
  if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
    return interaction.update(payload);
  }
  // في أي حالة أخرى → editReply أو reply
  return interaction.editReply(payload).catch(() => interaction.reply({ ...payload, ephemeral: true }).catch(() => {}));
}

// ---------- اللوحة الرئيسية ----------
async function handleEmbedsMain(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('📦 لوحة قوالب الإيمبدات')
    .setColor(0x5865F2)
    .setDescription('اختر أحد الخيارات أدناه:')
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('emb_create').setLabel('➕ إنشاء إيمبد جديد').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('emb_view').setLabel('📋 الإيمبدات المسجلة').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('emb_edit').setLabel('✏️ تعديل إيمبد').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('emb_delete').setLabel('🗑️ حذف إيمبد').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('emb_send').setLabel('📤 إرسال إيمبد').setStyle(ButtonStyle.Primary),
  );

  return respondOrUpdate(interaction, { embeds: [embed], components: [row] });
}

// ================== 1. إنشاء إيمبد جديد ==================

/** فتح Modal الإنشاء */
async function handleEmbCreate(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_emb_create')
    .setTitle('➕ إنشاء إيمبد جديد');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('emb_name')
        .setLabel('الاسم الداخلي (للحفظ والبحث)')
        .setPlaceholder('مثال: welcome_msg')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('emb_title')
        .setLabel('عنوان الإيمبد')
        .setPlaceholder('مرحباً بكم في السيرفر')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('emb_description')
        .setLabel('المحتوى (نص الإيمبد)')
        .setPlaceholder('اكتب المحتوى هنا...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
    ),
  );

  await interaction.showModal(modal);
}

/** معالجة Modal الإنشاء */
async function handleEmbCreateModal(interaction) {
  try {
    // ⏱️ نأخذ وقت كافي عشان ما نضرب تايم أوت (15 دقيقة بدل 3 ثواني)
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.fields.getTextInputValue('emb_name').trim();
    const title = interaction.fields.getTextInputValue('emb_title').trim();
    const description = interaction.fields.getTextInputValue('emb_description').trim();

    if (!name) return interaction.editReply({ content: '⚠️ الاسم الداخلي مطلوب.' });
    if (!title) return interaction.editReply({ content: '⚠️ عنوان الإيمبد مطلوب.' });
    if (!description) return interaction.editReply({ content: '⚠️ المحتوى مطلوب.' });

    // التحقق من عدم تكرار الاسم (حتى لو البيانات تالفة)
    try {
      const existing = await getEmbed(name);
      if (existing) {
        return interaction.editReply({
          content: '❌ هذا الاسم الداخلي مستخدم مسبقاً، يرجى اختيار اسم آخر.'
        });
      }
    } catch (checkErr) {
      // إذا فشل الفحص نفسه (مثلاً قاعدة البيانات ترجع بيانات تالفة)
      console.error('⚠️ embed فحص الاسم فشل:', checkErr.message);
      return interaction.editReply({
        content: '❌ هذا الاسم الداخلي مستخدم مسبقاً (بيانات تالفة)، يرجى اختيار اسم آخر.'
      });
    }

    // إنشاء الإيمبد في قاعدة البيانات
    const created = await createEmbed(name, { title, description });
    if (!created) {
      return interaction.editReply({
        content: '❌ فشل إنشاء الإيمبد. تأكد من اتصال قاعدة البيانات.'
      });
    }

    // فتح لوحة التحكم
    return showEmbedControlPanel(interaction, name);
  } catch (e) {
    console.error('[Modal:CreateEmbed]', e);
    try {
      if (interaction.deferred) await interaction.editReply({ content: '⚠️ خطأ غير متوقع: ' + e.message });
      else if (!interaction.replied) await interaction.reply({ content: '⚠️ خطأ غير متوقع.', ephemeral: true });
    } catch(_) {}
  }
}

/** لوحة التحكم بالإيمبد (بعد الإنشاء أو التعديل) */
async function showEmbedControlPanel(interaction, embedName, editMode = false) {
  const data = await getEmbed(embedName);
  if (!data) {
    return respondOrUpdate(interaction, { content: '⚠️ الإيمبد غير موجود.' });
  }

  // سلامة البيانات
  const safe = data || {};
  const title = safe.title || embedName;
  const color = (safe.color || '#5865F2') + '';
  const desc = (safe.description || '(بدون محتوى)') + '';
  const fields = Array.isArray(safe.fields) ? safe.fields : [];
  const footer = safe.footer || {};

  const embed = new EmbedBuilder()
    .setTitle(`📦 ${editMode ? '✏️' : '➕'} ${title}`)
    .setColor(parseInt(color.replace('#', ''), 16) || 0x5865F2)
    .setDescription(desc)
    .setTimestamp();

  fields.forEach(f => {
    if (f && f.name) embed.addFields({ name: f.name, value: f.value || '⠀', inline: f.inline || false });
  });

  if (footer.text) {
    embed.setFooter({ text: footer.text, iconURL: footer.iconURL || undefined });
  }

  const infoEmbed = new EmbedBuilder()
    .setTitle('ℹ️ معلومات الإيمبد')
    .setColor(0x2ECC71)
    .addFields(
      { name: '🏷️ الاسم الداخلي', value: `\`${safe.name || embedName}\``, inline: true },
      { name: '🎨 اللون', value: `${color}`, inline: true },
      { name: '📨 عدد الإرسال', value: `${safe.sendCount || 0}`, inline: true },
      { name: '📝 العنوان', value: title, inline: false },
    )
    .setTimestamp();

  const btnBack = new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary);

  // الصف الأول: إضافة حقل + اختيار لون
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`emb_addfield_${embedName}`).setLabel('➕ إضافة حقل').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`emb_edit_title_${embedName}`).setLabel('✏️ العنوان').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`emb_edit_desc_${embedName}`).setLabel('✏️ المحتوى').setStyle(ButtonStyle.Secondary),
  );

  // الصف الثاني: اختيار لون + إعدادات
  const colorOptions = COLORS.slice(0, 25).map(c => ({
    label: c.name,
    value: `${embedName}|${c.value}`,
    emoji: { name: c.name.split(' ')[0] || '🎨' },
    default: c.value === color
  }));

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`emb_color_${embedName}`)
      .setPlaceholder('🎨 اختر لون الإيمبد')
      .addOptions(colorOptions.length > 0 ? colorOptions : [{ label: 'أزرق افتراضي', value: `${embedName}|#5865F2` }])
  );

  // الصف الثالث: إعدادات الفوتر والتايمستامب
  const footerStatus = footer.text ? '🟢' : '🔴';
  const timeStatus = safe.timestamp !== false ? '🟢' : '🔴';
  const senderStatus = safe.showSender ? '🟢' : '🔴';

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`emb_footer_${embedName}`).setLabel(`${footerStatus} تذييل (Footer)`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`emb_toggle_time_${embedName}`).setLabel(`${timeStatus} Timestamp`).setStyle(timeStatus === '🟢' ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`emb_show_sender_${embedName}`).setLabel(`${senderStatus} إظهار المرسل`).setStyle(senderStatus === '🟢' ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`emb_save_${embedName}`).setLabel('💾 حفظ').setStyle(ButtonStyle.Success),
    btnBack,
  );

  // إذا كان في وضع التعديل من قائمة التعديل، نعطي خيار العودة لقائمة التعديل
  if (editMode) {
    row4.addComponents(new ButtonBuilder().setCustomId('emb_edit').setLabel('🔙 لقائمة التعديل').setStyle(ButtonStyle.Secondary));
  }

  // الصف الخامس: زر لون مخصص (بجانب القائمة المنسدلة دون المساس بها)
  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`emb_custom_color_${embedName}`).setLabel('لون مخصص 🎨').setStyle(ButtonStyle.Secondary),
  );

  return respondOrUpdate(interaction, {
    embeds: [infoEmbed, embed],
    components: [row1, row2, row3, row4, row5]
  });
}

// ================== 2. عرض الإيمبدات المسجلة ==================

async function handleEmbView(interaction) {
  const embeds = await getEmbedsList();
  if (embeds.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد إيمبدات مسجلة.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const options = embeds.map(e => ({
    label: e.name,
    description: (e.title || '(بدون عنوان)').slice(0, 100),
    value: `emb_view_${e.name}`,
    emoji: '📋'
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('emb_view_select')
      .setPlaceholder('📋 اختر إيمبد لعرضه')
      .addOptions(options.slice(0, 25))
  );

  return respondOrUpdate(interaction, {
    content: 'اختر الإيمبد الذي تريد عرض معلوماته ومعاينته:',
    components: [row, new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
    )]
  });
}

/** عرض إيمبد محدد مع معاينة */
async function handleEmbViewShow(interaction, embedName) {
  const data = await getEmbed(embedName);
  if (!data) {
    return respondOrUpdate(interaction, { content: '⚠️ الإيمبد غير موجود.' });
  }

  const safe = data || {};
  const safeTitle = safe.title || '(بدون عنوان)';
  const safeColor = (safe.color || '#5865F2') + '';
  const safeDesc = (safe.description || '(بدون محتوى)') + '';
  const safeFields = Array.isArray(safe.fields) ? safe.fields : [];
  const safeFooter = safe.footer || {};

  const preview = new EmbedBuilder()
    .setTitle(safeTitle)
    .setColor(parseInt(safeColor.replace('#', ''), 16) || 0x5865F2)
    .setDescription(safeDesc)
    .setTimestamp(safe.timestamp !== false ? new Date() : undefined);

  safeFields.forEach(f => {
    if (f && f.name) preview.addFields({ name: f.name, value: f.value || '⠀', inline: f.inline || false });
  });
  if (safeFooter.text) {
    preview.setFooter({ text: safeFooter.text, iconURL: safeFooter.iconURL || undefined });
  }

  const infoEmbed = new EmbedBuilder()
    .setTitle('ℹ️ معلومات الإيمبد')
    .setColor(0x2ECC71)
    .addFields(
      { name: '🏷️ الاسم الداخلي', value: `\`${safe.name || embedName}\``, inline: true },
      { name: '🎨 اللون', value: `${safeColor}`, inline: true },
      { name: '📨 عدد الإرسال', value: `${safe.sendCount || 0}`, inline: true },
      { name: '📝 العنوان', value: safeTitle, inline: false },
      { name: '📄 المحتوى', value: safeDesc.slice(0, 200), inline: false },
      { name: '🔻 عدد الحقول', value: `${safeFields.length}`, inline: true },
      { name: '⏱️ Timestamp', value: safe.timestamp !== false ? '✅ مفعل' : '❌ معطل', inline: true },
    )
    .setTimestamp();

  if (safeFooter.text) {
    infoEmbed.addFields({ name: '🔻 التذييل', value: safeFooter.text.slice(0, 100), inline: false });
  }

  return respondOrUpdate(interaction, {
    embeds: [infoEmbed, preview],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('emb_view').setLabel('🔙 لقائمة الإيمبدات').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
    )]
  });
}

// ================== 3. تعديل إيمبد ==================

async function handleEmbEdit(interaction) {
  const embeds = await getEmbedsList();
  if (embeds.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد إيمبدات للتعديل.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const options = embeds.map(e => ({
    label: e.name,
    description: (e.title || '(بدون عنوان)').slice(0, 100),
    value: `emb_edit_${e.name}`,
    emoji: '✏️'
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('emb_edit_select')
      .setPlaceholder('✏️ اختر إيمبد للتعديل')
      .addOptions(options.slice(0, 25))
  );

  return respondOrUpdate(interaction, {
    content: 'اختر الإيمبد الذي تريد تعديله:',
    components: [row, new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
    )]
  });
}

/** فتح لوحة تحكم التعديل لإيمبد معين */
async function handleEmbEditOpen(interaction, embedName) {
  return showEmbedControlPanel(interaction, embedName, true);
}

// ================== 4. حذف إيمبد ==================

async function handleEmbDelete(interaction) {
  const embeds = await getEmbedsList();
  if (embeds.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد إيمبدات للحذف.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const options = embeds.map(e => ({
    label: e.name,
    description: (e.title || '(بدون عنوان)').slice(0, 100),
    value: `emb_del_${e.name}`,
    emoji: '🗑️'
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('emb_delete_select')
      .setPlaceholder('🗑️ اختر إيمبد للحذف')
      .addOptions(options.slice(0, 25))
  );

  return respondOrUpdate(interaction, {
    content: '⚠️ اختر الإيمبد الذي تريد حذفه:',
    components: [row, new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
    )]
  });
}

/** تأكيد الحذف */
async function handleEmbDeleteConfirm(interaction, embedName) {
  const data = await getEmbed(embedName);
  if (!data) {
    return respondOrUpdate(interaction, { content: '⚠️ الإيمبد غير موجود.' });
  }

  const safe = data || {};
  const embed = new EmbedBuilder()
    .setTitle('🗑️ تأكيد الحذف')
    .setColor(0xFF0000)
    .setDescription(`هل أنت متأكد من حذف الإيمبد **${embedName}**؟`)
    .addFields(
      { name: 'العنوان', value: safe.title || '(بدون)', inline: true },
      { name: 'عدد الإرسال', value: `${safe.sendCount || 0}`, inline: true }
    )
    .setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`emb_delete_yes_${embedName}`).setLabel('✅ نعم، احذف').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('emb_delete').setLabel('❌ لا، تراجع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

/** تنفيذ الحذف */
async function handleEmbDeleteExecute(interaction, embedName) {
  const success = await deleteEmbed(embedName);
  if (success) {
    return respondOrUpdate(interaction, {
      content: `✅ تم حذف الإيمبد **${embedName}** بنجاح.`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
      )]
    });
  }
  return respondOrUpdate(interaction, { content: '❌ فشل حذف الإيمبد.' });
}

// ================== 5. إرسال إيمبد ==================

async function handleEmbSend(interaction) {
  const embeds = await getEmbedsList();
  if (embeds.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد إيمبدات للإرسال.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const options = embeds.map(e => ({
    label: e.name,
    description: (e.title || '(بدون عنوان)').slice(0, 100),
    value: `emb_send_${e.name}`,
    emoji: '📤'
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('emb_send_select')
      .setPlaceholder('📤 اختر إيمبد للإرسال')
      .addOptions(options.slice(0, 25))
  );

  return respondOrUpdate(interaction, {
    content: 'اختر الإيمبد الذي تريد إرساله:',
    components: [row, new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
    )]
  });
}

/** اختيار القناة → تظهر خيارات الإرسال */
async function handleEmbSendChannel(interaction, embedName) {
  const data = await getEmbed(embedName);
  if (!data) {
    return respondOrUpdate(interaction, { content: '⚠️ الإيمبد غير موجود.' });
  }

  const safe = data || {};
  const safeTitle = safe.title || '(بدون عنوان)';
  const safeColor = (safe.color || '#5865F2') + '';
  const safeDesc = (safe.description || '(بدون محتوى)') + '';
  const safeFields = Array.isArray(safe.fields) ? safe.fields : [];
  const safeFooter = safe.footer || {};

  const preview = new EmbedBuilder()
    .setTitle(safeTitle)
    .setColor(parseInt(safeColor.replace('#', ''), 16) || 0x5865F2)
    .setDescription(safeDesc)
    .setTimestamp(safe.timestamp !== false ? new Date() : undefined);

  safeFields.forEach(f => {
    if (f && f.name) preview.addFields({ name: f.name, value: f.value || '⠀', inline: f.inline || false });
  });
  if (safeFooter.text) {
    preview.setFooter({ text: safeFooter.text, iconURL: safeFooter.iconURL || undefined });
  }

  // إذا تم اختيار القناة (جاي من القناة المنسدلة)
  if (interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    const channel = interaction.guild?.channels.cache.get(channelId);
    return respondOrUpdate(interaction, {
      content: `📤 الإيمبد: **${embedName}**
القناة: ${channel}
اختر نوع الإرسال:`,
      embeds: [preview],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`emb_send_now_${embedName}_${channelId}`).setLabel('📤 إرسال فوري').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`emb_sched_${embedName}_${channelId}`).setLabel('⏱️ إرسال بمؤقت').setStyle(ButtonStyle.Primary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('emb_send').setLabel('🔙 لقائمة الإيمبدات').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  }

  // أول مرة (جاي من قائمة الإيمبدات) → اختر القناة
  return respondOrUpdate(interaction, {
    content: `📤 اختر القناة التي تريد إرسال الإيمبد **${embedName}** إليها:
(معاينة الإيمبد أدناه)`,
    embeds: [preview],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`emb_send_ch_${embedName}`)
          .setPlaceholder('📨 اختر القناة')
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('emb_send').setLabel('🔙 لقائمة الإيمبدات').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

/** إرسال فوري - تبقى اللوحة مفتوحة */
async function handleEmbSendNow(interaction, embedName, channelId) {
  // منع الإرسال المزدوج
  const sendKey = `send_${embedName}_${channelId}_${interaction.user.id}`;
  if (global.__emb_send_lock?.has(sendKey)) {
    return interaction.reply({ content: '⏳ الإرسال قيد التنفيذ...', ephemeral: true });
  }
  if (!global.__emb_send_lock) global.__emb_send_lock = new Set();
  global.__emb_send_lock.add(sendKey);

  try {
    const result = await sendEmbedToChannel(interaction.client, interaction.guild, embedName, channelId, interaction.user.tag);
    global.__emb_send_lock.delete(sendKey);

    if (result.success) {
      // رد عادي (مخفي) → اللوحة الأصلية تبقى مفتوحة بدون تغيير
      return interaction.reply({
        content: `✅ تم إرسال إيمبد **${embedName}** إلى روم ${result.channel} بنجاح.`,
        ephemeral: true
      });
    }
    return interaction.reply({
      content: `❌ ${result.error}`,
      ephemeral: true
    });
  } catch (e) {
    global.__emb_send_lock?.delete(sendKey);
    return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
  }
}

/** فتح Modal لإدخال وقت التأخير */
async function handleEmbSched(interaction, embedName, channelId) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_emb_sched_${embedName}_${channelId}`)
    .setTitle('⏱️ إرسال بمؤقت زمني');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sched_time')
        .setLabel('المدة (d, h, m, s)')
        .setPlaceholder('مثال: 1d 3h 10m 5s أو 30m أو 2h')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)
    ),
  );

  await interaction.showModal(modal);
}

/** معالجة Modal المؤقت */
async function handleEmbSchedModal(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const id = interaction.customId; // modal_emb_sched_{name}_{channelId}
    const rest = id.replace('modal_emb_sched_', '');
    const sepIndex = rest.lastIndexOf('_');
    const channelId = rest.slice(sepIndex + 1);
    const embedName = rest.slice(0, sepIndex);

    const timeInput = interaction.fields.getTextInputValue('sched_time').trim().toLowerCase();

    // تحليل الإدخال المركَّب: 1d 3h 10m 5s → ملي ثانية
    const delayMs = parseTimeString(timeInput);
    if (delayMs === null) {
      return interaction.editReply({
        content: '⚠️ صيغة الوقت غير صحيحة. استخدم مثلاً: `1d 3h 10m 5s` أو `30m` أو `2h`'
      });
    }

    if (delayMs > 7 * 24 * 60 * 60 * 1000) { // حد أقصى 7 أيام
      return interaction.editReply({ content: '⚠️ المدة كبيرة جداً. الحد الأقصى 7 أيام.' });
    }

    const senderTag = interaction.user.tag;
    const client = interaction.client;
    const guildId = interaction.guildId;

    await interaction.editReply({
      content: `⏳ تم جدولة إرسال الإيمبد **${embedName}** بعد ${formatDelay(delayMs)}.`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
      )]
    });

  // جدولة الإرسال
  setTimeout(async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      await sendEmbedToChannel(client, guild, embedName, channelId, senderTag);
      console.log(`✅ إرسال مجدول: ${embedName} إلى القناة ${channelId}`);
    } catch (e) {
      console.error(`❌ خطأ في الإرسال المجدول: ${embedName}`, e.message);
    }
  }, delayMs);
  } catch (e) {
    console.error('[Modal:Sched]', e);
    try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch(_) {}
  }
}

/** دالة مساعدة لإرسال الإيمبد (تستخدم فورياً أو مجدولاً) */
async function sendEmbedToChannel(client, guild, embedName, channelId, senderTag = null) {
  try {
    const data = await getEmbed(embedName);
    if (!data) return { success: false, error: 'الإيمبد غير موجود.' };

    const channel = guild?.channels.cache.get(channelId);
    if (!channel) return { success: false, error: 'القناة غير موجودة.' };

    const safe = data || {};
    const safeColor = (safe.color || '#5865F2') + '';
    const safeFields = Array.isArray(safe.fields) ? safe.fields : [];
    const safeFooter = safe.footer || {};

    const embed = new EmbedBuilder()
      .setTitle(safe.title || undefined)
      .setColor(parseInt(safeColor.replace('#', ''), 16) || 0x5865F2)
      .setDescription(safe.description || undefined)
      .setTimestamp(safe.timestamp !== false ? new Date() : undefined);

    safeFields.forEach(f => {
      if (f && f.name) embed.addFields({ name: f.name, value: f.value || '⠀', inline: f.inline || false });
    });

    // بناء التذييل تلقائياً: اسم السيرفر + اسم المرسل (اختياري)
    const footerParts = [];
    if (safeFooter.text) {
      footerParts.push(safeFooter.text);
    }
    footerParts.push(guild.name);
    if (safe.showSender && senderTag) {
      footerParts.push(`من: ${senderTag}`);
    }
    embed.setFooter({
      text: footerParts.join(' | '),
      iconURL: safeFooter.iconURL || undefined
    });

    await channel.send({ embeds: [embed] });
    await incrementSendCount(embedName);
    return { success: true, channel };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/** تنسيق المدة */
/**
 * تحليل نص الوقت إلى ملي ثانية
 * يدعم: 1d 3h 10m 5s, 30m, 2h, 1d, 45s, إلخ
 * @param {string} str - نص الوقت
 * @returns {number|null} - المدة بالملي ثانية أو null إن كان غير صالح
 */
function parseTimeString(str) {
  // Regex: يلتقط أرقاماً (بما في ذلك الكسور 0.5) متبوعة بـ d, h, m, s
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

  // إذا لم يعثر على شيء، جرب أن الرقم كامل يمثل دقائق (توافق مع القديم)
  if (!found) {
    const justNumber = parseFloat(str);
    if (!isNaN(justNumber) && justNumber > 0) {
      totalMs = justNumber * 60000; // دقائق
    } else {
      return null;
    }
  }

  return Math.round(totalMs);
}

/**
 * تنسيق المدة من ملي ثانية إلى نص مفهوم
 */
function formatDelay(ms) {
  if (ms <= 0) return '0 ثانية';

  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000) % 24;
  const days = Math.floor(ms / 86400000);

  const parts = [];
  if (days > 0) parts.push(`${days} يوم`);
  if (hours > 0) parts.push(`${hours} ساعة`);
  if (minutes > 0) parts.push(`${minutes} دقيقة`);
  if (seconds > 0) parts.push(`${seconds} ثانية`);

  return parts.join(' و ') || '0 ثانية';
}

// ================== معالجات الإضافات (Fields, Footer) ==================

/** فتح Modal لإضافة حقل */
async function handleEmbAddField(interaction, embedName) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_emb_addfield_${embedName}`)
    .setTitle('➕ إضافة حقل جديد');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('field_name')
        .setLabel('اسم الحقل')
        .setPlaceholder('مثال: البوتات')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('field_value')
        .setLabel('محتوى الحقل')
        .setPlaceholder('مثال: 5')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1024)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('field_inline')
        .setLabel('Inline (true/false)')
        .setPlaceholder('اكتب true أو false')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(5)
    ),
  );

  await interaction.showModal(modal);
}

/** معالجة Modal إضافة حقل */
async function handleEmbAddFieldModal(interaction, embedName) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const fieldName = interaction.fields.getTextInputValue('field_name').trim();
    const fieldValue = interaction.fields.getTextInputValue('field_value').trim();
    const inlineRaw = interaction.fields.getTextInputValue('field_inline').trim().toLowerCase();
    const inline = inlineRaw === 'true' || inlineRaw === 'نعم' || inlineRaw === 'yes';

    const data = await getEmbed(embedName);
    if (!data) {
      return interaction.editReply({ content: '⚠️ الإيمبد غير موجود.' });
    }

    const fields = data.fields || [];
    fields.push({ name: fieldName, value: fieldValue, inline });

    await updateEmbed(embedName, { fields });

    // إعادة فتح لوحة التحكم
    return showEmbedControlPanel(interaction, embedName, true);
  } catch (e) {
    console.error('[Modal:AddField]', e);
    try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch(_) {}
  }
}

/** فتح Modal لتعديل التذييل */
async function handleEmbFooter(interaction, embedName) {
  const data = await getEmbed(embedName);
  const currentText = data?.footer?.text || '';
  const currentIcon = data?.footer?.iconURL || '';

  const modal = new ModalBuilder()
    .setCustomId(`modal_emb_footer_${embedName}`)
    .setTitle('🔻 إعدادات التذييل (Footer)');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('footer_text')
        .setLabel('نص التذييل')
        .setPlaceholder('اكتب نص التذييل أو اتركه فارغاً')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(256)
        .setValue(currentText)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('footer_icon')
        .setLabel('رابط أيقونة التذييل (اختياري)')
        .setPlaceholder('https://example.com/icon.png')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(512)
        .setValue(currentIcon)
    ),
  );

  await interaction.showModal(modal);
}

/** معالجة Modal التذييل */
async function handleEmbFooterModal(interaction, embedName) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const text = interaction.fields.getTextInputValue('footer_text').trim();
    const iconURL = interaction.fields.getTextInputValue('footer_icon').trim();

    await updateEmbed(embedName, { footer: { text, iconURL } });

    return showEmbedControlPanel(interaction, embedName, true);
  } catch (e) {
    console.error('[Modal:Footer]', e);
    try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch(_) {}
  }
}

/** تبديل الـ Timestamp */
async function handleEmbToggleTime(interaction, embedName) {
  const data = await getEmbed(embedName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الإيمبد غير موجود.' });

  const current = data.timestamp !== false;
  await updateEmbed(embedName, { timestamp: !current });

  return showEmbedControlPanel(interaction, embedName, true);
}

// ================== معالج اللون ==================

async function handleEmbColor(interaction, embedName, colorValue) {
  await updateEmbed(embedName, { color: colorValue });
  return showEmbedControlPanel(interaction, embedName, true);
}

// ================== لون مخصص (Modal مع Hex) ==================

async function handleEmbCustomColor(interaction, embedName) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_emb_custom_color_${embedName}`)
    .setTitle('🎨 لون مخصص');

  const input = new TextInputBuilder()
    .setCustomId('emb_custom_color_val')
    .setLabel('أدخل رمز اللون السداسي (Hex Code)')
    .setPlaceholder('#3B82F6')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(4)
    .setMaxLength(7);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

// ================== معالجات التعديل (عنوان/محتوى) ==================

async function handleEmbEditTitle(interaction, embedName) {
  const data = await getEmbed(embedName);
  const modal = new ModalBuilder()
    .setCustomId(`modal_emb_title_${embedName}`)
    .setTitle('✏️ تعديل العنوان');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('emb_title')
        .setLabel('العنوان الجديد')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256)
        .setValue(data?.title || '')
    ),
  );

  await interaction.showModal(modal);
}

async function handleEmbEditDesc(interaction, embedName) {
  const data = await getEmbed(embedName);
  const modal = new ModalBuilder()
    .setCustomId(`modal_emb_desc_${embedName}`)
    .setTitle('✏️ تعديل المحتوى');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('emb_description')
        .setLabel('المحتوى الجديد')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
        .setValue(data?.description || '')
    ),
  );

  await interaction.showModal(modal);
}

async function handleEmbEditTitleModal(interaction, embedName) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const title = interaction.fields.getTextInputValue('emb_title').trim();
    await updateEmbed(embedName, { title });
    return showEmbedControlPanel(interaction, embedName, true);
  } catch (e) {
    console.error('[Modal:EditTitle]', e);
    try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch(_) {}
  }
}

async function handleEmbEditDescModal(interaction, embedName) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const description = interaction.fields.getTextInputValue('emb_description').trim();
    await updateEmbed(embedName, { description });
    return showEmbedControlPanel(interaction, embedName, true);
  } catch (e) {
    console.error('[Modal:EditDesc]', e);
    try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch(_) {}
  }
}

// ================== معالج حفظ (تحديث وقت التعديل) ==================

async function handleEmbSave(interaction, embedName) {
  await updateEmbed(embedName, {});
  return respondOrUpdate(interaction, {
    content: `✅ تم حفظ الإيمبد **${embedName}** بنجاح.`,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('emb_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
    )]
  });
}

// ================== الموزع الرئيسي ==================

async function handleEmbedsInteraction(interaction) {
  const id = interaction.customId;
  const parts = id.split('_');
  const prefix = parts[0];

  // الأزرار التي تظهر مودال (نحتاج التفاعل فوراً، ما نعمل defer)
  const isModalAction = id === 'emb_create' ||
    id.startsWith('emb_custom_color_') ||
    (prefix === 'emb' && (
      parts[1] === 'addfield' ||
      parts[1] === 'footer' ||
      parts[1] === 'sched' ||
      (parts[1] === 'edit' && (parts[2] === 'title' || parts[2] === 'desc'))
    ));

  // نعمل deferUpdate عشان ناخذ وقت (إلا الأزرار اللي تظهر مودال)
  if (!isModalAction) {
    try { await interaction.deferUpdate(); } catch { /* إذا كان مؤجلاً مسبقاً نكمل */ }
  }

  // الأزرار الرئيسية
  if (id === 'emb_main') return handleEmbedsMain(interaction);
  if (id === 'emb_create') return handleEmbCreate(interaction);
  if (id === 'emb_view') return handleEmbView(interaction);
  if (id === 'emb_edit') return handleEmbEdit(interaction);
  if (id === 'emb_delete') return handleEmbDelete(interaction);
  if (id === 'emb_send') return handleEmbSend(interaction);

  // اختيار إيمبد للعرض
  if (id === 'emb_view_select') {
    const selected = interaction.values[0];
    const name = selected.replace('emb_view_', '');
    return handleEmbViewShow(interaction, name);
  }

  // اختيار إيمبد للتعديل
  if (id === 'emb_edit_select') {
    const selected = interaction.values[0];
    const name = selected.replace('emb_edit_', '');
    return handleEmbEditOpen(interaction, name);
  }

  // اختيار إيمبد للحذف
  if (id === 'emb_delete_select') {
    const selected = interaction.values[0];
    const name = selected.replace('emb_del_', '');
    return handleEmbDeleteConfirm(interaction, name);
  }

  // تأكيد الحذف
  if (prefix === 'emb' && parts[1] === 'delete' && parts[2] === 'yes') {
    const name = parts.slice(3).join('_');
    return handleEmbDeleteExecute(interaction, name);
  }

  // اختيار إيمبد للإرسال
  if (id === 'emb_send_select') {
    const selected = interaction.values[0];
    const name = selected.replace('emb_send_', '');
    return handleEmbSendChannel(interaction, name);
  }

  // اختيار قناة للإرسال
  if (prefix === 'emb' && parts[1] === 'send' && parts[2] === 'ch') {
    const name = parts.slice(3).join('_');
    return handleEmbSendChannel(interaction, name);
  }

  // إرسال فوري
  if (prefix === 'emb' && parts[1] === 'send' && parts[2] === 'now') {
    const rest = parts.slice(3).join('_');
    const lastSep = rest.lastIndexOf('_');
    const channelId = rest.slice(lastSep + 1);
    const embedName = rest.slice(0, lastSep);
    return handleEmbSendNow(interaction, embedName, channelId);
  }

  // إرسال بمؤقت
  if (prefix === 'emb' && parts[1] === 'sched' && parts.length >= 4) {
    // sched_{name}_{channelId} → parts starts with 'emb'
    const rest = parts.slice(2).join('_');
    const lastSep = rest.lastIndexOf('_');
    const channelId = rest.slice(lastSep + 1);
    const embedName = rest.slice(0, lastSep);
    return handleEmbSched(interaction, embedName, channelId);
  }

  // إضافة حقل
  if (prefix === 'emb' && parts[1] === 'addfield') {
    const name = parts.slice(2).join('_');
    return handleEmbAddField(interaction, name);
  }

  // اختيار لون (قائمة جاهزة)
  if (prefix === 'emb' && parts[1] === 'color') {
    const name = parts.slice(2).join('_');
    const [realName, colorValue] = interaction.values[0].split('|');
    return handleEmbColor(interaction, realName, colorValue);
  }

  // لون مخصص (زر Modal)
  if (id.startsWith('emb_custom_color_')) {
    const name = id.replace('emb_custom_color_', '');
    return handleEmbCustomColor(interaction, name);
  }

  // تعديل التذييل
  if (prefix === 'emb' && parts[1] === 'footer') {
    const name = parts.slice(2).join('_');
    return handleEmbFooter(interaction, name);
  }

  // تبديل التايمستامب
  if (prefix === 'emb' && parts[1] === 'toggle' && parts[2] === 'time') {
    const name = parts.slice(3).join('_');
    return handleEmbToggleTime(interaction, name);
  }

  // تعديل العنوان
  if (prefix === 'emb' && parts[1] === 'edit' && parts[2] === 'title') {
    const name = parts.slice(3).join('_');
    return handleEmbEditTitle(interaction, name);
  }

  // تعديل المحتوى
  if (prefix === 'emb' && parts[1] === 'edit' && parts[2] === 'desc') {
    const name = parts.slice(3).join('_');
    return handleEmbEditDesc(interaction, name);
  }

  // حفظ
  if (prefix === 'emb' && parts[1] === 'save') {
    const name = parts.slice(2).join('_');
    return handleEmbSave(interaction, name);
  }

  // تبديل إظهار المرسل
  if (prefix === 'emb' && parts[1] === 'show' && parts[2] === 'sender') {
    const name = parts.slice(3).join('_');
    const data = await getEmbed(name);
    if (!data) return respondOrUpdate(interaction, { content: '⚠️ الإيمبد غير موجود.' });
    await updateEmbed(name, { showSender: !data.showSender });
    return showEmbedControlPanel(interaction, name, true);
  }

  // إذا ما وصلنا هنا → خطأ
  return respondOrUpdate(interaction, { content: `⚠️ أمر غير معروف: ${id}` });
}

// ================== معالجات الـ Modal ==================

async function handleEmbedsModal(interaction) {
  const id = interaction.customId;

  // إنشاء إيمبد جديد
  if (id === 'modal_emb_create') {
    return handleEmbCreateModal(interaction);
  }

  // إضافة حقل
  if (id.startsWith('modal_emb_addfield_')) {
    const name = id.replace('modal_emb_addfield_', '');
    return handleEmbAddFieldModal(interaction, name);
  }

  // تعديل التذييل
  if (id.startsWith('modal_emb_footer_')) {
    const name = id.replace('modal_emb_footer_', '');
    return handleEmbFooterModal(interaction, name);
  }

  // تعديل العنوان
  if (id.startsWith('modal_emb_title_')) {
    const name = id.replace('modal_emb_title_', '');
    return handleEmbEditTitleModal(interaction, name);
  }

  // تعديل المحتوى
  if (id.startsWith('modal_emb_desc_')) {
    const name = id.replace('modal_emb_desc_', '');
    return handleEmbEditDescModal(interaction, name);
  }

  // إرسال بمؤقت
  if (id.startsWith('modal_emb_sched_')) {
    return handleEmbSchedModal(interaction);
  }

  // لون مخصص
  if (id.startsWith('modal_emb_custom_color_')) {
    try {
      await interaction.deferUpdate();
      const embedName = id.replace('modal_emb_custom_color_', '');
      const hex = interaction.fields.getTextInputValue('emb_custom_color_val').trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        return interaction.editReply({ content: '❌ رمز اللون غير صالح. استخدم صيغة Hex مكونة من 6 أرقام/حروف، مثال: #FF0000', components: [] });
      }
      await updateEmbed(embedName, { color: hex.toUpperCase() });
      return showEmbedControlPanel(interaction, embedName, true);
    } catch (e) {
      console.error('[Modal:CustomColor]', e);
      try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch(_) {}
    }
  }

  return interaction.reply({ content: '⚠️ Modal غير معروف.', ephemeral: true });
}

module.exports = { handleEmbedsInteraction, handleEmbedsModal, handleEmbedsMain };

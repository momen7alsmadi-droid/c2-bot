/**
 * tickets.js - 🎫 نظام التذاكر المطور (واجهة الإدارة)
 *遵照系统: UI مطابق لنظام الإيمبدات
 * كل التفاعلات تستخدم interaction.update لتعديل نفس الرسالة
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const { version } = require('../../package.json');
const {
  getAllTicketConfigs,
  getTicketConfig,
  getTicketConfigsList,
  createTicketConfig,
  updateTicketConfig,
  deleteTicketConfig
} = require('../utils/ticketStorage');

// ---------- دالة مساعدة للرد أو التحديث ----------
async function respondOrUpdate(interaction, payload) {
  if (interaction.deferred) {
    return interaction.editReply(payload);
  }
  if (interaction.isCommand()) {
    return interaction.reply({ ...payload, ephemeral: true });
  }
  // في حالة الأزرار والقوائم: نستخدم update() لتعديل نفس الرسالة
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferUpdate().catch(() => {});
  }
  return interaction.editReply(payload);
}

// ================== اللوحة الرئيسية ==================

async function handleTicketsMain(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🎫 لوحة التذاكر')
    .setColor(0x5865F2)
    .setDescription('نظام قوالب التذاكر — اختر أحد الخيارات أدناه:')
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tkt_create').setLabel('➕ إضافة تكت').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tkt_edit').setLabel('✏️ تعديل تكت').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tkt_view').setLabel('📋 سجل').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tkt_delete').setLabel('🗑️ حذف').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('tkt_send').setLabel('📤 إرسال').setStyle(ButtonStyle.Primary),
  );

  return respondOrUpdate(interaction, { embeds: [embed], components: [row] });
}

// ================== 1. إضافة تكت ==================

async function handleTktCreate(interaction) {
  return interaction.reply({
    content: '⏳ قريباً... **Coming soon...**',
    ephemeral: true
  });
}

// ================== 2. تعديل تكت ==================

async function handleTktEdit(interaction) {
  const list = await getTicketConfigsList();

  const embed = new EmbedBuilder()
    .setTitle('✏️ تعديل تكت')
    .setColor(0x3498DB)
    .setDescription('اختر القالب الذي تريد تعديله من القائمة أدناه:')
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const options = list.map(t => ({
    label: t.name,
    description: t.title.slice(0, 100),
    value: `tkt_edit_${t.name}`,
    emoji: '✏️'
  }));

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tkt_edit_select')
      .setPlaceholder('✏️ اختر قالب تكت للتعديل')
      .addOptions(options.length > 0 ? options : [
        { label: 'لا يوجد أي تكت حالياً', value: 'tkt_none', emoji: '❌' }
      ])
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tkt_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
  );

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: options.length > 0 ? [row1, row2] : [row1, row2]
  });
}

// ================== 3. سجل (عرض) ==================

async function handleTktView(interaction) {
  const list = await getTicketConfigsList();

  const embed = new EmbedBuilder()
    .setTitle('📋 سجل قوالب التذاكر')
    .setColor(0x2ECC71)
    .setDescription('اختر قالباً لعرض معلوماته:')
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const options = list.map(t => ({
    label: t.name,
    description: t.title.slice(0, 100),
    value: `tkt_view_${t.name}`,
    emoji: '📋'
  }));

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tkt_view_select')
      .setPlaceholder('📋 اختر قالب تكت للعرض')
      .addOptions(options.length > 0 ? options : [
        { label: 'لا يوجد أي تكت حالياً', value: 'tkt_none', emoji: '❌' }
      ])
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tkt_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
  );

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [row1, row2]
  });
}

/** عرض تفاصيل قالب تكت */
async function handleTktViewShow(interaction, configName) {
  const data = await getTicketConfig(configName);
  if (!data) {
    return respondOrUpdate(interaction, { content: '⚠️ القالب غير موجود.' });
  }

  const safe = data || {};
  const safeColor = (safe.color || '#5865F2') + '';
  const colorInt = parseInt(safeColor.replace('#', ''), 16) || 0x5865F2;

  const embed = new EmbedBuilder()
    .setTitle(`📋 ${safe.title || safe.name}`)
    .setColor(colorInt)
    .setDescription(safe.description || '(بدون وصف)')
    .addFields(
      { name: '🏷️ الاسم الداخلي', value: `\`${safe.name}\``, inline: true },
      { name: '🎨 اللون', value: safeColor, inline: true },
      { name: '📨 روم الإنشاء', value: safe.channelId ? `<#${safe.channelId}>` : '❌ غير محدد', inline: false },
      { name: '📂 التصنيف (Category)', value: safe.categoryId ? `<#${safe.categoryId}>` : '❌ غير محدد', inline: false },
      { name: '🛡️ رتبة الدعم', value: safe.supportRoleId ? `<@&${safe.supportRoleId}>` : '❌ غير محددة', inline: false },
      { name: '👑 رتبة الإشراف', value: safe.staffRoleId ? `<@&${safe.staffRoleId}>` : '❌ غير محددة', inline: false },
      { name: '💬 رسالة الترحيب', value: safe.welcomeMessage || '(افتراضي)', inline: false },
      { name: '🔒 رسالة الإغلاق', value: safe.closeMessage || '(افتراضي)', inline: false },
      { name: '📜 النسخ الاحتياطي', value: safe.transcriptEnabled !== false ? '✅ مفعل' : '❌ معطل', inline: true },
      { name: '🔢 الحد الأقصى', value: `${safe.maxTicketsPerUser || 5} لكل عضو`, inline: true },
    )
    .setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tkt_view').setLabel('🔙 لقائمة السجل').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('tkt_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// ================== 4. حذف ==================

async function handleTktDelete(interaction) {
  const list = await getTicketConfigsList();

  const embed = new EmbedBuilder()
    .setTitle('🗑️ حذف قالب تكت')
    .setColor(0xE74C3C)
    .setDescription('⚠️ اختر القالب الذي تريد حذفه:')
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const options = list.map(t => ({
    label: t.name,
    description: t.title.slice(0, 100),
    value: `tkt_del_${t.name}`,
    emoji: '🗑️'
  }));

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tkt_delete_select')
      .setPlaceholder('🗑️ اختر قالب تكت للحذف')
      .addOptions(options.length > 0 ? options : [
        { label: 'لا يوجد أي تكت حالياً', value: 'tkt_none', emoji: '❌' }
      ])
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tkt_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
  );

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [row1, row2]
  });
}

/** تأكيد الحذف */
async function handleTktDeleteConfirm(interaction, configName) {
  const data = await getTicketConfig(configName);
  if (!data) {
    return respondOrUpdate(interaction, { content: '⚠️ القالب غير موجود.' });
  }

  const embed = new EmbedBuilder()
    .setTitle('🗑️ تأكيد الحذف')
    .setColor(0xFF0000)
    .setDescription(`هل أنت متأكد من حذف قالب التكت **${configName}**؟`)
    .addFields(
      { name: 'العنوان', value: data.title || '(بدون)', inline: true },
      { name: 'الحقول', value: data.description ? data.description.slice(0, 100) : '(بدون وصف)', inline: true }
    )
    .setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tkt_delete_yes_${configName}`).setLabel('✅ نعم، احذف').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('tkt_delete').setLabel('❌ لا، تراجع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

/** تنفيذ الحذف */
async function handleTktDeleteExecute(interaction, configName) {
  const success = await deleteTicketConfig(configName);
  if (success) {
    return respondOrUpdate(interaction, {
      content: `✅ تم حذف قالب التكت **${configName}** بنجاح.`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tkt_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
      )]
    });
  }
  return respondOrUpdate(interaction, { content: '❌ فشل حذف القالب.' });
}

// ================== 5. إرسال ==================

async function handleTktSend(interaction) {
  const list = await getTicketConfigsList();

  const embed = new EmbedBuilder()
    .setTitle('📤 إرسال قالب تكت')
    .setColor(0x9B59B6)
    .setDescription('اختر القالب الذي تريد إرسال/نشر واجهته:')
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const options = list.map(t => ({
    label: t.name,
    description: t.title.slice(0, 100),
    value: `tkt_send_${t.name}`,
    emoji: '📤'
  }));

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tkt_send_select')
      .setPlaceholder('📤 اختر قالب تكت للإرسال')
      .addOptions(options.length > 0 ? options : [
        { label: 'لا يوجد أي تكت حالياً', value: 'tkt_none', emoji: '❌' }
      ])
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tkt_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
  );

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [row1, row2]
  });
}

// ================== الموزع الرئيسي ==================

async function handleTicketsInteraction(interaction) {
  const id = interaction.customId;
  const parts = id.split('_');
  const prefix = parts[0];

  if (prefix !== 'tkt') return;

  // أزرار المودال الرئيسية (إضافة تكت يعمل reply ephemeral)
  if (id === 'tkt_create') return handleTktCreate(interaction);

  // كل ما تبقى من أزرار وقوائم → deferUpdate ثم update
  try { await interaction.deferUpdate().catch(() => {}); } catch {}

  // الأزرار الرئيسية
  if (id === 'tkt_main') return handleTicketsMain(interaction);
  if (id === 'tkt_edit') return handleTktEdit(interaction);
  if (id === 'tkt_view') return handleTktView(interaction);
  if (id === 'tkt_delete') return handleTktDelete(interaction);
  if (id === 'tkt_send') return handleTktSend(interaction);

  // اختيار من قائمة التعديل
  if (id === 'tkt_edit_select') {
    const val = interaction.values[0];
    if (val === 'tkt_none') return handleTktEdit(interaction);
    const name = val.replace('tkt_edit_', '');
    return interaction.editReply({
      content: `✏️ تم اختيار **${name}** — واجهة التعديل قيد التطوير (Coming soon...)`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tkt_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  // اختيار من قائمة السجل (عرض)
  if (id === 'tkt_view_select') {
    const val = interaction.values[0];
    if (val === 'tkt_none') return handleTktView(interaction);
    const name = val.replace('tkt_view_', '');
    return handleTktViewShow(interaction, name);
  }

  // اختيار من قائمة الحذف → تأكيد
  if (id === 'tkt_delete_select') {
    const val = interaction.values[0];
    if (val === 'tkt_none') return handleTktDelete(interaction);
    const name = val.replace('tkt_del_', '');
    return handleTktDeleteConfirm(interaction, name);
  }

  // تأكيد الحذف
  if (prefix === 'tkt' && parts[1] === 'delete' && parts[2] === 'yes') {
    const name = parts.slice(3).join('_');
    return handleTktDeleteExecute(interaction, name);
  }

  // اختيار من قائمة الإرسال
  if (id === 'tkt_send_select') {
    const val = interaction.values[0];
    if (val === 'tkt_none') return handleTktSend(interaction);
    const name = val.replace('tkt_send_', '');
    return interaction.editReply({
      content: `📤 تم اختيار **${name}** — واجهة الإرسال قيد التطوير (Coming soon...)`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tkt_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  return interaction.editReply({
    content: `⚠️ أمر غير معروف: ${id}`,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tkt_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
    )]
  });
}

module.exports = {
  handleTicketsMain,
  handleTicketsInteraction
};

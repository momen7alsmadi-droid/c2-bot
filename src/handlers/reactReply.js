const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType
} = require('discord.js');
const {
  createReact, updateReact, deleteReact, getReact,
  getReactsList, getEnabledReacts, incrementReactCount
} = require('../utils/reactionReplyStorage');
const { version } = require('../../package.json');

// سجل لمنع تكرار التفاعل لنفس الرسالة
const processedReacts = new Set();

async function respondOrUpdate(interaction, payload) {
  if (interaction.isCommand() || interaction.isModalSubmit()) {
    return interaction.reply({ ...payload, ephemeral: true });
  }
  if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
    return interaction.update(payload);
  }
  return interaction.editReply(payload).catch(() => interaction.reply({ ...payload, ephemeral: true }).catch(() => {}));
}

// ================== اللوحة الرئيسية ==================

async function handleReactMain(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('😊 لوحة الردود بالتفاعلات (رياكشن)')
    .setColor(0x5865F2)
    .setDescription('اختر أحد الخيارات أدناه لإدارة التفاعلات التلقائية.')
    .setFooter({ text: `الإصدار: ${version}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rr_create').setLabel('➕ إضافة تفاعل جديد').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('rr_list').setLabel('📋 التفاعلات المسجلة').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rr_edit').setLabel('✏️ تعديل تفاعل').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rr_delete').setLabel('🗑️ حذف تفاعل').setStyle(ButtonStyle.Danger),
  );

  return respondOrUpdate(interaction, { embeds: [embed], components: [row] });
}

// ================== 1. إنشاء تفاعل جديد ==================

async function handleRrCreate(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_rr_create')
    .setTitle('➕ إضافة تفاعل تلقائي جديد');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('rr_name').setLabel('🏷️ الاسم الداخلي')
        .setPlaceholder('مثال: ترحيب_قلب').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('rr_trigger').setLabel('🔑 الكلمة المفتاحية (Trigger)')
        .setPlaceholder('مثال: مرحبا').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('rr_emoji').setLabel('😊 الإيموجي (يمكنك إضافة المزيد لاحقاً)')
        .setPlaceholder('❤️').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
    ),
  );

  await interaction.showModal(modal);
}

async function handleRrCreateModal(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.fields.getTextInputValue('rr_name').trim();
    const trigger = interaction.fields.getTextInputValue('rr_trigger').trim();
    const emoji = interaction.fields.getTextInputValue('rr_emoji').trim();

    const existing = await getReact(name);
    if (existing) return interaction.editReply({ content: `⚠️ التفاعل "${name}" موجود مسبقاً.` });

    const created = await createReact({
      name, trigger, emojis: [emoji],
      randomReact: false, multipleReact: false,
      roleWhitelist: [], roleBlacklist: [],
      channelWhitelist: [], channelBlacklist: []
    });

    if (!created) return interaction.editReply({ content: '❌ فشل إنشاء التفاعل.' });
    return showRrControlPanel(interaction, name);
  } catch (e) {
    console.error('[Modal:RrCreate]', e);
    try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch(_) {}
  }
}

// ================== لوحة التحكم الشاملة ==================

async function showRrControlPanel(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });

  const emojis = data.emojis || [];
  const emojiCount = emojis.length;
  const emojiPreview = emojiCount > 0 ? emojis.join(' ') : '*(لا توجد إيموجيات)*';

  const rolesW = data.roleWhitelist || [];
  const rolesB = data.roleBlacklist || [];
  const chansW = data.channelWhitelist || [];
  const chansB = data.channelBlacklist || [];

  const infoEmbed = new EmbedBuilder()
    .setTitle(`ℹ️ ${data.name}`)
    .setColor(0x5865F2)
    .addFields(
      { name: '🔑 الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true },
      { name: '😊 الإيموجيات', value: emojiPreview, inline: true },
      { name: '✅ مفعل', value: data.enabled !== false ? '🟢 نعم' : '🔴 لا', inline: true },
      { name: '📨 مرات الاستخدام', value: `${data.useCount || 0}`, inline: true },
      { name: '🔍 بحث ضمني', value: data.triggerType === 'contains' ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '🎲 رد عشوائي', value: data.randomReact ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '🔁 متعدد', value: data.multipleReact ? '🟢 مفعل (كل الإيموجيات)' : '🔴 معطل (أول واحد)', inline: true },
      { name: '🛡️ الرتب المسموحة', value: rolesW.length > 0 ? rolesW.map(r => `<@&${r}>`).join(' ') : '*(الكل)*', inline: false },
      { name: '🚫 الرتب الممنوعة', value: rolesB.length > 0 ? rolesB.map(r => `<@&${r}>`).join(' ') : '*(لا يوجد)*', inline: false },
      { name: '📢 الرومات المسموحة', value: chansW.length > 0 ? chansW.map(c => `<#${c}>`).join(' ') : '*(الكل)*', inline: false },
      { name: '⛔ الرومات الممنوعة', value: chansB.length > 0 ? chansB.map(c => `<#${c}>`).join(' ') : '*(لا يوجد)*', inline: false },
    )
    .setTimestamp();

  // الصف الأول
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rr_toggle_${reactName}`).setLabel(data.enabled !== false ? '🟢 تعطيل' : '🔴 تفعيل').setStyle(data.enabled !== false ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rr_edit_trigger_${reactName}`).setLabel('✏️ الكلمة المفتاحية').setStyle(ButtonStyle.Primary),
  );

  // الصف الثاني - الإيموجيات والعشوائي والمتعدد
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rr_emojis_${reactName}`).setLabel('💬 إدارة الإيموجيات').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rr_random_${reactName}`).setLabel(data.randomReact ? '🎲 عشوائي 🟢' : '🎲 عشوائي 🔴').setStyle(data.randomReact ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`rr_multiple_${reactName}`).setLabel(data.multipleReact ? '🔁 متعدد 🟢' : '🔁 متعدد 🔴').setStyle(data.multipleReact ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  // الصف الثالث
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rr_implicit_${reactName}`).setLabel(data.triggerType === 'contains' ? '🔍 ضمني 🟢' : '🔍 تام 🔴').setStyle(data.triggerType === 'contains' ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`rr_edit_emoji_${reactName}`).setLabel('✏️ إيموجي فردي').setStyle(ButtonStyle.Secondary),
  );

  // الصف الرابع
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rr_roles_whitelist_${reactName}`).setLabel('🛡️ الرتب المسموحة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rr_roles_blacklist_${reactName}`).setLabel('🚫 الرتب الممنوعة').setStyle(ButtonStyle.Secondary),
  );

  // الصف الخامس
  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rr_chans_whitelist_${reactName}`).setLabel('📢 الرومات المسموحة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rr_chans_blacklist_${reactName}`).setLabel('⛔ الرومات الممنوعة').setStyle(ButtonStyle.Secondary),
  );

  return respondOrUpdate(interaction, { embeds: [infoEmbed], components: [row1, row2, row3, row4, row5] });
}

// ================== 2. عرض التفاعلات المسجلة ==================

async function handleRrList(interaction) {
  const list = await getReactsList();
  if (list.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد تفاعلات مسجلة.',
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))]
    });
  }
  const options = list.map(r => ({
    label: r.name,
    description: `${r.emoji} \`${r.trigger}\` | ${r.emojisCount || 1} إيموجي | ${r.useCount} استخدام`,
    value: `rr_view_${r.name}`, emoji: r.enabled ? '🟢' : '🔴'
  }));
  const embed = new EmbedBuilder()
    .setTitle('📋 التفاعلات المسجلة').setColor(0x5865F2)
    .setDescription('اختر تفاعلاً من القائمة لعرض التفاصيل الكاملة.')
    .setFooter({ text: `إجمالي ${list.length} تفاعل` }).setTimestamp();
  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rr_view_select').setPlaceholder('📋 اختر تفاعلاً للعرض').addOptions(options.slice(0, 25))),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary))
    ]
  });
}

async function handleRrView(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  const emojis = data.emojis || [];
  const rolesW = data.roleWhitelist || [];
  const rolesB = data.roleBlacklist || [];
  const chansW = data.channelWhitelist || [];
  const chansB = data.channelBlacklist || [];

  const infoEmbed = new EmbedBuilder()
    .setTitle(`📋 ${data.name}`).setColor(0x5865F2)
    .addFields(
      { name: '🔑 الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true },
      { name: '😊 الإيموجيات', value: emojis.length > 0 ? emojis.join(' ') : '*(لا يوجد)*', inline: true },
      { name: '✅ مفعل', value: data.enabled !== false ? '🟢 نعم' : '🔴 لا', inline: true },
      { name: '📨 مرات الاستخدام', value: `${data.useCount || 0}`, inline: true },
      { name: '🔍 بحث ضمني', value: data.triggerType === 'contains' ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '🎲 رد عشوائي', value: data.randomReact ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '🔁 متعدد', value: data.multipleReact ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '🛡️ الرتب المسموحة', value: rolesW.length > 0 ? rolesW.map(r => `<@&${r}>`).join(' ') : '*(الكل)*', inline: false },
      { name: '🚫 الرتب الممنوعة', value: rolesB.length > 0 ? rolesB.map(r => `<@&${r}>`).join(' ') : '*(لا يوجد)*', inline: false },
      { name: '📢 الرومات المسموحة', value: chansW.length > 0 ? chansW.map(c => `<#${c}>`).join(' ') : '*(الكل)*', inline: false },
      { name: '⛔ الرومات الممنوعة', value: chansB.length > 0 ? chansB.map(c => `<#${c}>`).join(' ') : '*(لا يوجد)*', inline: false },
    ).setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [infoEmbed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rr_list').setLabel('📋 العودة للسجل').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('✏️ فتح لوحة التحكم').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 الرجوع للرئيسية').setStyle(ButtonStyle.Secondary)
    )]
  });
}

// ================== 3. تعديل وتفاعل ==================

async function handleRrEdit(interaction) {
  const list = await getReactsList();
  if (list.length === 0) return respondOrUpdate(interaction, { content: '📭 لا يوجد تفاعلات للتعديل.', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))] });
  const options = list.map(r => ({ label: r.name, description: `${r.emoji} "${r.trigger}" — ${r.useCount} استخدام`, value: `rr_edit_${r.name}`, emoji: r.enabled ? '🟢' : '🔴' }));
  return respondOrUpdate(interaction, { content: '✏️ اختر التفاعل الذي تريد تعديله:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rr_edit_select').setPlaceholder('✏️ اختر تفاعلاً').addOptions(options.slice(0, 25))), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))] });
}

// ================== 4. حذف تفاعل ==================

async function handleRrDelete(interaction) {
  const list = await getReactsList();
  if (list.length === 0) return respondOrUpdate(interaction, { content: '📭 لا يوجد تفاعلات للحذف.', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))] });
  const options = list.map(r => ({ label: r.name, description: `${r.emoji} "${r.trigger}"`, value: `rr_del_${r.name}`, emoji: '🗑️' }));
  return respondOrUpdate(interaction, { content: '🗑️ اختر التفاعل الذي تريد حذفه:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rr_delete_select').setPlaceholder('🗑️ اختر تفاعلاً للحذف').addOptions(options.slice(0, 25))), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))] });
}

async function handleRrDeleteConfirm(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  const embed = new EmbedBuilder().setTitle('🗑️ تأكيد الحذف').setColor(0xFF0000).setDescription(`هل أنت متأكد من حذف التفاعل **${reactName}**؟`).addFields({ name: 'الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true }, { name: 'الإيموجيات', value: ((data.emojis||[]).join(' ')) || data.emoji || '?', inline: true }, { name: 'مرات الاستخدام', value: `${data.useCount || 0}`, inline: true }).setTimestamp();
  return respondOrUpdate(interaction, { embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rr_delete_yes_${reactName}`).setLabel('✅ نعم، احذف').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('rr_delete').setLabel('❌ لا، تراجع').setStyle(ButtonStyle.Secondary))] });
}

async function handleRrDeleteExecute(interaction, reactName) {
  const success = await deleteReact(reactName);
  return respondOrUpdate(interaction, { content: success ? `✅ تم حذف التفاعل **${reactName}** بنجاح.` : '❌ فشل حذف التفاعل.', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary))] });
}

// ================== معالجات التبديل ==================

async function handleRrToggle(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  await updateReact(reactName, { enabled: data.enabled === false });
  return showRrControlPanel(interaction, reactName);
}

async function handleRrImplicit(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  await updateReact(reactName, { triggerType: data.triggerType === 'contains' ? 'exact' : 'contains' });
  return showRrControlPanel(interaction, reactName);
}

async function handleRrRandom(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  // إذا كان المتعدد شغال، أوقفه أولاً
  const updates = { randomReact: !data.randomReact };
  if (updates.randomReact && data.multipleReact) updates.multipleReact = false;
  await updateReact(reactName, updates);
  return showRrControlPanel(interaction, reactName);
}

async function handleRrMultiple(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  // إذا كان العشوائي شغال، أوقفه أولاً
  const updates = { multipleReact: !data.multipleReact };
  if (updates.multipleReact && data.randomReact) updates.randomReact = false;
  await updateReact(reactName, updates);
  return showRrControlPanel(interaction, reactName);
}

// تعديل الكلمة المفتاحية
async function handleRrEditTrigger(interaction, reactName) {
  const data = await getReact(reactName);
  const modal = new ModalBuilder().setCustomId(`modal_rr_trigger_${reactName}`).setTitle('✏️ تعديل الكلمة المفتاحية');
  modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rr_trigger').setLabel('الكلمة المفتاحية الجديدة').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500).setValue(data?.trigger || '')));
  await interaction.showModal(modal);
}

// تعديل إيموجي فردي (للتوافق القديم)
async function handleRrEditEmoji(interaction, reactName) {
  const data = await getReact(reactName);
  const modal = new ModalBuilder().setCustomId(`modal_rr_emoji_${reactName}`).setTitle('✏️ تعديل الإيموجي الأساسي');
  modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rr_emoji').setLabel('الإيموجي').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(data?.emoji || (data?.emojis||[])[0] || '')));
  await interaction.showModal(modal);
}

// ================== 💬 إدارة الإيموجيات ==================

async function handleRrEmojis(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  const emojis = data.emojis || [];

  const embed = new EmbedBuilder()
    .setTitle(`💬 إدارة الإيموجيات — ${reactName}`)
    .setColor(0x5865F2)
    .setDescription(emojis.length > 0
      ? emojis.map((e, i) => `**${i + 1}.** ${e}`).join('\n')
      : '*(لا توجد إيموجيات بعد)*')
    .setFooter({ text: `إجمالي ${emojis.length} إيموجي` })
    .setTimestamp();

  const components = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rr_emojis_add_${reactName}`).setLabel('➕ إضافة إيموجي').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('🔙 رجوع للوحة التحكم').setStyle(ButtonStyle.Secondary),
  )];

  if (emojis.length > 0) {
    const delRow = new ActionRowBuilder();
    for (let i = 0; i < Math.min(emojis.length, 5); i++) {
      delRow.addComponents(new ButtonBuilder().setCustomId(`rr_emojis_del_${reactName}_${i}`).setLabel(`❌ ${i + 1}`).setStyle(ButtonStyle.Danger));
    }
    if (delRow.components.length > 0) components.push(delRow);
  }

  return respondOrUpdate(interaction, { embeds: [embed], components });
}

async function handleRrEmojisAdd(interaction, reactName) {
  const modal = new ModalBuilder().setCustomId(`modal_rr_emojis_add_${reactName}`).setTitle('➕ إضافة إيموجي جديد');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('rr_emojis_text').setLabel('الإيموجي').setPlaceholder('❤️').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
  ));
  await interaction.showModal(modal);
}

async function handleRrEmojisDel(interaction, reactName, index) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  const emojis = [...(data.emojis || [])];
  if (index < 0 || index >= emojis.length) return respondOrUpdate(interaction, { content: '⚠️ الرقم غير صحيح.' });
  emojis.splice(index, 1);
  await updateReact(reactName, { emojis, emoji: emojis[0] || '' });
  return handleRrEmojis(interaction, reactName);
}

// ================== القوائم ==================

async function handleRrRolesWhitelist(interaction, reactName) {
  const data = await getReact(reactName);
  return respondOrUpdate(interaction, { content: `🛡️ **الرتب المسموحة** (${(data?.roleWhitelist||[]).length})\nالحالية: ${(data?.roleWhitelist||[]).length > 0 ? data.roleWhitelist.map(r => `<@&${r}>`).join(' ') : '*(الكل)*'}`, components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`rr_roles_w_set_${reactName}`).setPlaceholder('🛡️ اختر الرتب المسموحة').setMinValues(0).setMaxValues(25)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))] });
}

async function handleRrRolesBlacklist(interaction, reactName) {
  const data = await getReact(reactName);
  return respondOrUpdate(interaction, { content: `🚫 **الرتب الممنوعة** (${(data?.roleBlacklist||[]).length})\nالحالية: ${(data?.roleBlacklist||[]).length > 0 ? data.roleBlacklist.map(r => `<@&${r}>`).join(' ') : '*(لا يوجد)*'}`, components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`rr_roles_b_set_${reactName}`).setPlaceholder('🚫 اختر الرتب الممنوعة').setMinValues(0).setMaxValues(25)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))] });
}

async function handleRrChansWhitelist(interaction, reactName) {
  const data = await getReact(reactName);
  return respondOrUpdate(interaction, { content: `📢 **الرومات المسموحة** (${(data?.channelWhitelist||[]).length})\nالحالية: ${(data?.channelWhitelist||[]).length > 0 ? data.channelWhitelist.map(c => `<#${c}>`).join(' ') : '*(الكل)*'}`, components: [new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`rr_chans_w_set_${reactName}`).setPlaceholder('📢 اختر الرومات المسموحة').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(25)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))] });
}

async function handleRrChansBlacklist(interaction, reactName) {
  const data = await getReact(reactName);
  return respondOrUpdate(interaction, { content: `⛔ **الرومات الممنوعة** (${(data?.channelBlacklist||[]).length})\nالحالية: ${(data?.channelBlacklist||[]).length > 0 ? data.channelBlacklist.map(c => `<#${c}>`).join(' ') : '*(لا يوجد)*'}`, components: [new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`rr_chans_b_set_${reactName}`).setPlaceholder('⛔ اختر الرومات الممنوعة').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(25)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))] });
}

// ================== معالجات القوائم المنسدلة ==================

async function handleRrRolesWSet(interaction) {
  const name = interaction.customId.replace('rr_roles_w_set_', '');
  await updateReact(name, { roleWhitelist: interaction.values || [] });
  return showRrControlPanel(interaction, name);
}
async function handleRrRolesBSet(interaction) {
  const name = interaction.customId.replace('rr_roles_b_set_', '');
  await updateReact(name, { roleBlacklist: interaction.values || [] });
  return showRrControlPanel(interaction, name);
}
async function handleRrChansWSet(interaction) {
  const name = interaction.customId.replace('rr_chans_w_set_', '');
  await updateReact(name, { channelWhitelist: interaction.values || [] });
  return showRrControlPanel(interaction, name);
}
async function handleRrChansBSet(interaction) {
  const name = interaction.customId.replace('rr_chans_b_set_', '');
  await updateReact(name, { channelBlacklist: interaction.values || [] });
  return showRrControlPanel(interaction, name);
}

// ================== معالجات Modal ==================

async function handleReactModal(interaction) {
  const id = interaction.customId;

  if (id === 'modal_rr_create') return handleRrCreateModal(interaction);

  if (id.startsWith('modal_rr_trigger_')) {
    const name = id.replace('modal_rr_trigger_', '');
    const trigger = interaction.fields.getTextInputValue('rr_trigger').trim();
    await updateReact(name, { trigger });
    return showRrControlPanel(interaction, name);
  }

  if (id.startsWith('modal_rr_emoji_')) {
    const name = id.replace('modal_rr_emoji_', '');
    const emoji = interaction.fields.getTextInputValue('rr_emoji').trim();
    // استبدال الإيموجي الأول أو إضافته
    const data = await getReact(name);
    const emojis = [...(data?.emojis || [])];
    if (emojis.length > 0) emojis[0] = emoji;
    else emojis.push(emoji);
    await updateReact(name, { emoji, emojis });
    return showRrControlPanel(interaction, name);
  }

  if (id.startsWith('modal_rr_emojis_add_')) {
    const name = id.replace('modal_rr_emojis_add_', '');
    const newEmoji = interaction.fields.getTextInputValue('rr_emojis_text').trim();
    const data = await getReact(name);
    const emojis = [...(data?.emojis || []), newEmoji];
    await updateReact(name, { emojis, emoji: emojis[0] || '' });
    return handleRrEmojis(interaction, name);
  }

  return interaction.reply({ content: '⚠️ Modal غير معروف.', ephemeral: true });
}

// ================== الموزع ==================

async function handleReactInteraction(interaction) {
  const id = interaction.customId;

  if (id === 'rr_main') return handleReactMain(interaction);
  if (id === 'rr_create') return handleRrCreate(interaction);
  if (id === 'rr_list') return handleRrList(interaction);
  if (id === 'rr_edit') return handleRrEdit(interaction);
  if (id === 'rr_delete') return handleRrDelete(interaction);

  if (id === 'rr_view_select') {
    const name = interaction.values[0].replace('rr_view_', '');
    return handleRrView(interaction, name);
  }
  if (id === 'rr_edit_select') {
    const name = interaction.values[0].replace('rr_edit_', '');
    return showRrControlPanel(interaction, name);
  }
  if (id === 'rr_delete_select') {
    const name = interaction.values[0].replace('rr_del_', '');
    return handleRrDeleteConfirm(interaction, name);
  }

  if (id.startsWith('rr_delete_yes_')) return handleRrDeleteExecute(interaction, id.replace('rr_delete_yes_', ''));
  if (id.startsWith('rr_toggle_')) return handleRrToggle(interaction, id.replace('rr_toggle_', ''));
  if (id.startsWith('rr_implicit_')) return handleRrImplicit(interaction, id.replace('rr_implicit_', ''));
  if (id.startsWith('rr_random_')) return handleRrRandom(interaction, id.replace('rr_random_', ''));
  if (id.startsWith('rr_multiple_')) return handleRrMultiple(interaction, id.replace('rr_multiple_', ''));
  if (id.startsWith('rr_edit_trigger_')) return handleRrEditTrigger(interaction, id.replace('rr_edit_trigger_', ''));
  if (id.startsWith('rr_edit_emoji_')) return handleRrEditEmoji(interaction, id.replace('rr_edit_emoji_', ''));

  // إدارة الإيموجيات
  if (id.startsWith('rr_emojis_') && !id.startsWith('rr_emojis_add_') && !id.startsWith('rr_emojis_del_')) {
    return handleRrEmojis(interaction, id.replace('rr_emojis_', ''));
  }
  if (id.startsWith('rr_emojis_add_')) return handleRrEmojisAdd(interaction, id.replace('rr_emojis_add_', ''));
  if (id.startsWith('rr_emojis_del_')) {
    const match = id.match(/^rr_emojis_del_(.+)_(\d+)$/);
    if (match) return handleRrEmojisDel(interaction, match[1], parseInt(match[2], 10));
  }

  // الرجوع للوحة التحكم
  if (id.startsWith('rr_edit_') && !id.startsWith('rr_edit_trigger_') && !id.startsWith('rr_edit_emoji_')) {
    return showRrControlPanel(interaction, id.replace('rr_edit_', ''));
  }

  if (id.startsWith('rr_roles_whitelist_')) return handleRrRolesWhitelist(interaction, id.replace('rr_roles_whitelist_', ''));
  if (id.startsWith('rr_roles_blacklist_')) return handleRrRolesBlacklist(interaction, id.replace('rr_roles_blacklist_', ''));
  if (id.startsWith('rr_chans_whitelist_')) return handleRrChansWhitelist(interaction, id.replace('rr_chans_whitelist_', ''));
  if (id.startsWith('rr_chans_blacklist_')) return handleRrChansBlacklist(interaction, id.replace('rr_chans_blacklist_', ''));

  if (id.startsWith('rr_roles_w_set_')) return handleRrRolesWSet(interaction);
  if (id.startsWith('rr_roles_b_set_')) return handleRrRolesBSet(interaction);
  if (id.startsWith('rr_chans_w_set_')) return handleRrChansWSet(interaction);
  if (id.startsWith('rr_chans_b_set_')) return handleRrChansBSet(interaction);

  return respondOrUpdate(interaction, { content: `⚠️ أمر غير معروف: ${id}` });
}

// ================== محرك معالجة الرسائل ==================

async function handleReactMessage(message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  // منع تكرار التفاعل لنفس الرسالة
  const msgKey = message.id;
  if (processedReacts.has(msgKey)) return;
  processedReacts.add(msgKey);
  setTimeout(() => processedReacts.delete(msgKey), 10000);

  const reacts = await getEnabledReacts();
  if (reacts.length === 0) return;

  const content = message.content;
  const member = message.member;
  const channel = message.channel;

  for (const react of reacts) {
    // فحص الرومات
    const chW = react.channelWhitelist || [];
    const chB = react.channelBlacklist || [];
    if (chW.length > 0 && !chW.includes(channel.id)) continue;
    if (chB.length > 0 && chB.includes(channel.id)) continue;
    if (react.channelId && channel.id !== react.channelId) continue;

    // فحص الرتب
    if (member) {
      const roles = member.roles.cache.map(r => r.id);
      const rW = react.roleWhitelist || [];
      const rB = react.roleBlacklist || [];
      if (rW.length > 0 && !member.permissions.has('Administrator') && !roles.some(r => rW.includes(r))) continue;
      if (rB.length > 0 && !member.permissions.has('Administrator') && roles.some(r => rB.includes(r))) continue;
    }

    // المطابقة
    let matched = false;
    const msg = react.caseSensitive ? content : content.toLowerCase();
    const trigger = react.caseSensitive ? react.trigger : react.trigger.toLowerCase();
    matched = react.triggerType === 'contains' ? msg.includes(trigger) : msg === trigger;
    if (!matched) continue;

    try {
      await incrementReactCount(react.name);
      const emojis = react.emojis || [];
      if (emojis.length === 0) {
        // توافق مع القديم
        if (react.emoji) await message.react(react.emoji);
        continue;
      }

      if (react.multipleReact) {
        // وضع كل الإيموجيات
        for (const emoji of emojis) {
          try { await message.react(emoji); } catch { /* تجاهل الخطأ لكل إيموجي */ }
        }
      } else if (react.randomReact && emojis.length > 1) {
        // اختيار عشوائي
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        await message.react(randomEmoji);
      } else {
        // أول إيموجي فقط
        await message.react(emojis[0]);
      }

      console.log(`✅ reactReply: "${react.trigger}" ← ${message.author.tag} ← ${emojis.join(' ')}`);
    } catch (e) {
      console.error(`❌ reactReply error for "${react.name}":`, e.message);
    }
    // بدون break — كل التفاعلات المطابقة تشتغل
  }
}

module.exports = {
  handleReactInteraction, handleReactModal, handleReactMain, handleReactMessage,
  handleRrCreate, showRrControlPanel, handleRrDeleteConfirm, handleRrDeleteExecute
};

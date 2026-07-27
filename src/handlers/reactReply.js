const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType
} = require('discord.js');
const {
  createReact, updateReact, deleteReact, getReact,
  getReactsList, getEnabledReacts, incrementReactCount
} = require('../utils/reactionReplyStorage');

// ---------- دالة مساعدة ----------
async function respondOrUpdate(interaction, payload) {
  if (interaction.isCommand()) return interaction.reply({ ...payload, ephemeral: true });
  return interaction.update(payload);
}

// ================== اللوحة الرئيسية ==================

async function handleReactMain(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('😊 لوحة الردود بالتفاعلات (رياكشن)')
    .setColor(0x5865F2)
    .setDescription('اختر أحد الخيارات أدناه لإدارة التفاعلات التلقائية.')
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
      new TextInputBuilder()
        .setCustomId('rr_name')
        .setLabel('🏷️ الاسم الداخلي')
        .setPlaceholder('مثال: ترحيب_قلب')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('rr_trigger')
        .setLabel('🔑 الكلمة المفتاحية (Trigger)')
        .setPlaceholder('مثال: مرحبا')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('rr_emoji')
        .setLabel('😊 الإيموجي (مثال: ❤️ أو 👍)')
        .setPlaceholder('❤️')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
    ),
  );

  await interaction.showModal(modal);
}

async function handleRrCreateModal(interaction) {
  const name = interaction.fields.getTextInputValue('rr_name').trim();
  const trigger = interaction.fields.getTextInputValue('rr_trigger').trim();
  const emoji = interaction.fields.getTextInputValue('rr_emoji').trim();

  const existing = await getReact(name);
  if (existing) {
    return interaction.reply({ content: `⚠️ التفاعل "${name}" موجود مسبقاً.`, ephemeral: true });
  }

  const created = await createReact({
    name, trigger, emoji,
    triggerType: 'contains',
    roleWhitelist: [], roleBlacklist: [],
    channelWhitelist: [], channelBlacklist: []
  });

  if (!created) {
    return interaction.reply({ content: '❌ فشل إنشاء التفاعل.', ephemeral: true });
  }

  return showRrControlPanel(interaction, name);
}

// ================== لوحة التحكم الشاملة ==================

async function showRrControlPanel(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });

  const rolesW = data.roleWhitelist || [];
  const rolesB = data.roleBlacklist || [];
  const chansW = data.channelWhitelist || [];
  const chansB = data.channelBlacklist || [];

  const infoEmbed = new EmbedBuilder()
    .setTitle(`ℹ️ ${data.name}`)
    .setColor(0x5865F2)
    .addFields(
      { name: '🔑 الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true },
      { name: '😊 الإيموجي', value: data.emoji, inline: true },
      { name: '✅ مفعل', value: data.enabled !== false ? '🟢 نعم' : '🔴 لا', inline: true },
      { name: '📨 مرات الاستخدام', value: `${data.useCount || 0}`, inline: true },
      { name: '🔍 بحث ضمني', value: data.triggerType === 'contains' ? '🟢 مفعل' : '🔴 معطل', inline: true },
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

  // الصف الثاني
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rr_edit_emoji_${reactName}`).setLabel('✏️ الإيموجي').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`rr_implicit_${reactName}`).setLabel(data.triggerType === 'contains' ? '🔍 ضمني 🟢' : '🔍 تام 🔴').setStyle(data.triggerType === 'contains' ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  // الصف الثالث
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rr_roles_whitelist_${reactName}`).setLabel('🛡️ الرتب المسموحة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rr_roles_blacklist_${reactName}`).setLabel('🚫 الرتب الممنوعة').setStyle(ButtonStyle.Secondary),
  );

  // الصف الرابع
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rr_chans_whitelist_${reactName}`).setLabel('📢 الرومات المسموحة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rr_chans_blacklist_${reactName}`).setLabel('⛔ الرومات الممنوعة').setStyle(ButtonStyle.Secondary),
  );

  return respondOrUpdate(interaction, { embeds: [infoEmbed], components: [row1, row2, row3, row4] });
}

// ================== 2. عرض التفاعلات المسجلة (سجل + معاينة) ==================

async function handleRrList(interaction) {
  const list = await getReactsList();
  if (list.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد تفاعلات مسجلة.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const options = list.map(r => ({
    label: r.name,
    description: `${r.emoji} \`${r.trigger}\` | ${r.useCount} استخدام`,
    value: `rr_view_${r.name}`,
    emoji: r.enabled ? '🟢' : '🔴'
  }));

  const embed = new EmbedBuilder()
    .setTitle('📋 التفاعلات المسجلة')
    .setColor(0x5865F2)
    .setDescription('اختر تفاعلاً من القائمة لعرض التفاصيل الكاملة.')
    .setFooter({ text: `إجمالي ${list.length} تفاعل` })
    .setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('rr_view_select')
          .setPlaceholder('📋 اختر تفاعلاً للعرض')
          .addOptions(options.slice(0, 25))
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// عرض تفاصيل تفاعل
async function handleRrView(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });

  const rolesW = data.roleWhitelist || [];
  const rolesB = data.roleBlacklist || [];
  const chansW = data.channelWhitelist || [];
  const chansB = data.channelBlacklist || [];

  const infoEmbed = new EmbedBuilder()
    .setTitle(`📋 ${data.name}`)
    .setColor(0x5865F2)
    .addFields(
      { name: '🔑 الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true },
      { name: '😊 الإيموجي', value: data.emoji, inline: true },
      { name: '✅ مفعل', value: data.enabled !== false ? '🟢 نعم' : '🔴 لا', inline: true },
      { name: '📨 مرات الاستخدام', value: `${data.useCount || 0}`, inline: true },
      { name: '🔍 بحث ضمني', value: data.triggerType === 'contains' ? '🟢 مفعل' : '🔴 معطل', inline: true },
      { name: '🛡️ الرتب المسموحة', value: rolesW.length > 0 ? rolesW.map(r => `<@&${r}>`).join(' ') : '*(الكل)*', inline: false },
      { name: '🚫 الرتب الممنوعة', value: rolesB.length > 0 ? rolesB.map(r => `<@&${r}>`).join(' ') : '*(لا يوجد)*', inline: false },
      { name: '📢 الرومات المسموحة', value: chansW.length > 0 ? chansW.map(c => `<#${c}>`).join(' ') : '*(الكل)*', inline: false },
      { name: '⛔ الرومات الممنوعة', value: chansB.length > 0 ? chansB.map(c => `<#${c}>`).join(' ') : '*(لا يوجد)*', inline: false },
    )
    .setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [infoEmbed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rr_list').setLabel('📋 العودة للسجل').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('✏️ فتح لوحة التحكم').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 الرجوع للرئيسية').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// ================== 3. تعديل تفاعل (اختيار) ==================

async function handleRrEdit(interaction) {
  const list = await getReactsList();
  if (list.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد تفاعلات للتعديل.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }
  const options = list.map(r => ({
    label: r.name, description: `${r.emoji} "${r.trigger}" — ${r.useCount} استخدام`,
    value: `rr_edit_${r.name}`, emoji: r.enabled ? '🟢' : '🔴'
  }));
  return respondOrUpdate(interaction, {
    content: '✏️ اختر التفاعل الذي تريد تعديله:',
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('rr_edit_select').setPlaceholder('✏️ اختر تفاعلاً').addOptions(options.slice(0, 25))
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// ================== 4. حذف تفاعل ==================

async function handleRrDelete(interaction) {
  const list = await getReactsList();
  if (list.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد تفاعلات للحذف.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }
  const options = list.map(r => ({
    label: r.name, description: `${r.emoji} "${r.trigger}"`,
    value: `rr_del_${r.name}`, emoji: '🗑️'
  }));
  return respondOrUpdate(interaction, {
    content: '🗑️ اختر التفاعل الذي تريد حذفه:',
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('rr_delete_select').setPlaceholder('🗑️ اختر تفاعلاً للحذف').addOptions(options.slice(0, 25))
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleRrDeleteConfirm(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  const embed = new EmbedBuilder()
    .setTitle('🗑️ تأكيد الحذف').setColor(0xFF0000)
    .setDescription(`هل أنت متأكد من حذف التفاعل **${reactName}**؟`)
    .addFields(
      { name: 'الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true },
      { name: 'الإيموجي', value: data.emoji, inline: true },
      { name: 'مرات الاستخدام', value: `${data.useCount || 0}`, inline: true }
    )
    .setTimestamp();
  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rr_delete_yes_${reactName}`).setLabel('✅ نعم، احذف').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('rr_delete').setLabel('❌ لا، تراجع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleRrDeleteExecute(interaction, reactName) {
  const success = await deleteReact(reactName);
  return respondOrUpdate(interaction, {
    content: success ? `✅ تم حذف التفاعل **${reactName}** بنجاح.` : '❌ فشل حذف التفاعل.',
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
    )]
  });
}

// ================== معالجات الأزرار (Toggle & Edit) ==================

// تبديل التفعيل
async function handleRrToggle(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  await updateReact(reactName, { enabled: data.enabled === false });
  return showRrControlPanel(interaction, reactName);
}

// تعديل الكلمة المفتاحية
async function handleRrEditTrigger(interaction, reactName) {
  const data = await getReact(reactName);
  const modal = new ModalBuilder().setCustomId(`modal_rr_trigger_${reactName}`).setTitle('✏️ تعديل الكلمة المفتاحية');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('rr_trigger').setLabel('الكلمة المفتاحية الجديدة')
      .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500).setValue(data?.trigger || '')
  ));
  await interaction.showModal(modal);
}

// تعديل الإيموجي
async function handleRrEditEmoji(interaction, reactName) {
  const data = await getReact(reactName);
  const modal = new ModalBuilder().setCustomId(`modal_rr_emoji_${reactName}`).setTitle('✏️ تعديل الإيموجي');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('rr_emoji').setLabel('الإيموجي الجديد')
      .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(data?.emoji || '')
  ));
  await interaction.showModal(modal);
}

// تبديل البحث الضمني (contains ↔ exact)
async function handleRrImplicit(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  const newType = data.triggerType === 'contains' ? 'exact' : 'contains';
  await updateReact(reactName, { triggerType: newType });
  return showRrControlPanel(interaction, reactName);
}

// ================== قوائم الرتب (RoleSelectMenu) ==================

async function handleRrRolesWhitelist(interaction, reactName) {
  const data = await getReact(reactName);
  return respondOrUpdate(interaction, {
    content: `🛡️ **الرتب المسموحة** (${(data?.roleWhitelist||[]).length})\nالحالية: ${(data?.roleWhitelist||[]).length > 0 ? data.roleWhitelist.map(r => `<@&${r}>`).join(' ') : '*(الكل)*'}\n\nاختر الرتب المسموح لها بالتفاعل:`,
    components: [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`rr_roles_w_set_${reactName}`)
          .setPlaceholder('🛡️ اختر الرتب المسموحة')
          .setMinValues(0).setMaxValues(25)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleRrRolesBlacklist(interaction, reactName) {
  const data = await getReact(reactName);
  return respondOrUpdate(interaction, {
    content: `🚫 **الرتب الممنوعة** (${(data?.roleBlacklist||[]).length})\nالحالية: ${(data?.roleBlacklist||[]).length > 0 ? data.roleBlacklist.map(r => `<@&${r}>`).join(' ') : '*(لا يوجد)*'}\n\nاختر الرتب الممنوعة من التفاعل:`,
    components: [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`rr_roles_b_set_${reactName}`)
          .setPlaceholder('🚫 اختر الرتب الممنوعة')
          .setMinValues(0).setMaxValues(25)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// ================== قوائم الرومات (ChannelSelectMenu) ==================

async function handleRrChansWhitelist(interaction, reactName) {
  const data = await getReact(reactName);
  return respondOrUpdate(interaction, {
    content: `📢 **الرومات المسموحة** (${(data?.channelWhitelist||[]).length})\nالحالية: ${(data?.channelWhitelist||[]).length > 0 ? data.channelWhitelist.map(c => `<#${c}>`).join(' ') : '*(الكل)*'}\n\nاختر الرومات التي يعمل فيها التفاعل:`,
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`rr_chans_w_set_${reactName}`)
          .setPlaceholder('📢 اختر الرومات المسموحة')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(0).setMaxValues(25)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleRrChansBlacklist(interaction, reactName) {
  const data = await getReact(reactName);
  return respondOrUpdate(interaction, {
    content: `⛔ **الرومات الممنوعة** (${(data?.channelBlacklist||[]).length})\nالحالية: ${(data?.channelBlacklist||[]).length > 0 ? data.channelBlacklist.map(c => `<#${c}>`).join(' ') : '*(لا يوجد)*'}\n\nاختر الرومات الممنوعة من التفاعل:`,
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`rr_chans_b_set_${reactName}`)
          .setPlaceholder('⛔ اختر الرومات الممنوعة')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(0).setMaxValues(25)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
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
    await updateReact(name, { emoji });
    return showRrControlPanel(interaction, name);
  }

  return interaction.reply({ content: '⚠️ Modal غير معروف.', ephemeral: true });
}

// ================== الموزع الرئيسي ==================

async function handleReactInteraction(interaction) {
  const id = interaction.customId;

  // الأزرار الرئيسية
  if (id === 'rr_main') return handleReactMain(interaction);
  if (id === 'rr_create') return handleRrCreate(interaction);
  if (id === 'rr_list') return handleRrList(interaction);
  if (id === 'rr_edit') return handleRrEdit(interaction);
  if (id === 'rr_delete') return handleRrDelete(interaction);

  // اختيار للعرض
  if (id === 'rr_view_select') {
    const name = interaction.values[0].replace('rr_view_', '');
    return handleRrView(interaction, name);
  }

  // اختيار للتعديل
  if (id === 'rr_edit_select') {
    const name = interaction.values[0].replace('rr_edit_', '');
    return showRrControlPanel(interaction, name);
  }

  // اختيار للحذف
  if (id === 'rr_delete_select') {
    const name = interaction.values[0].replace('rr_del_', '');
    return handleRrDeleteConfirm(interaction, name);
  }

  // تأكيد الحذف
  if (id.startsWith('rr_delete_yes_')) {
    return handleRrDeleteExecute(interaction, id.replace('rr_delete_yes_', ''));
  }

  // ---- أزرار التبديل ----
  if (id.startsWith('rr_toggle_')) return handleRrToggle(interaction, id.replace('rr_toggle_', ''));
  if (id.startsWith('rr_implicit_')) return handleRrImplicit(interaction, id.replace('rr_implicit_', ''));

  // تعديل
  if (id.startsWith('rr_edit_trigger_')) return handleRrEditTrigger(interaction, id.replace('rr_edit_trigger_', ''));
  if (id.startsWith('rr_edit_emoji_')) return handleRrEditEmoji(interaction, id.replace('rr_edit_emoji_', ''));

  // الرجوع للوحة التحكم (rr_edit_xxx) — بعد الأنماط الأكثر تحديداً
  if (id.startsWith('rr_edit_') && !id.startsWith('rr_edit_trigger_') && !id.startsWith('rr_edit_emoji_')) {
    return showRrControlPanel(interaction, id.replace('rr_edit_', ''));
  }

  // الرتب
  if (id.startsWith('rr_roles_whitelist_')) return handleRrRolesWhitelist(interaction, id.replace('rr_roles_whitelist_', ''));
  if (id.startsWith('rr_roles_blacklist_')) return handleRrRolesBlacklist(interaction, id.replace('rr_roles_blacklist_', ''));

  // الرومات
  if (id.startsWith('rr_chans_whitelist_')) return handleRrChansWhitelist(interaction, id.replace('rr_chans_whitelist_', ''));
  if (id.startsWith('rr_chans_blacklist_')) return handleRrChansBlacklist(interaction, id.replace('rr_chans_blacklist_', ''));

  // اختيار الرتب (RoleSelectMenu)
  if (id.startsWith('rr_roles_w_set_')) return handleRrRolesWSet(interaction);
  if (id.startsWith('rr_roles_b_set_')) return handleRrRolesBSet(interaction);

  // اختيار الرومات (ChannelSelectMenu)
  if (id.startsWith('rr_chans_w_set_')) return handleRrChansWSet(interaction);
  if (id.startsWith('rr_chans_b_set_')) return handleRrChansBSet(interaction);

  return respondOrUpdate(interaction, { content: `⚠️ أمر غير معروف: ${id}` });
}

// ================== محرك معالجة الرسائل للتفاعلات ==================

async function handleReactMessage(message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const reacts = await getEnabledReacts();
  if (reacts.length === 0) return;

  const content = message.content;
  const member = message.member;
  const channel = message.channel;

  for (const react of reacts) {
    // فحص الرومات (Whitelist / Blacklist)
    const chW = react.channelWhitelist || [];
    const chB = react.channelBlacklist || [];
    if (chW.length > 0 && !chW.includes(channel.id)) continue;
    if (chB.length > 0 && chB.includes(channel.id)) continue;
    if (react.channelId && channel.id !== react.channelId) continue;

    // فحص الرتب (Whitelist / Blacklist)
    if (member) {
      const roles = member.roles.cache.map(r => r.id);
      const rW = react.roleWhitelist || [];
      const rB = react.roleBlacklist || [];

      if (rW.length > 0 && !member.permissions.has('Administrator')) {
        if (!roles.some(r => rW.includes(r))) continue;
      }
      if (rB.length > 0 && !member.permissions.has('Administrator')) {
        if (roles.some(r => rB.includes(r))) continue;
      }
    }

    // المطابقة
    let matched = false;
    const msg = react.caseSensitive ? content : content.toLowerCase();
    const trigger = react.caseSensitive ? react.trigger : react.trigger.toLowerCase();

    if (react.triggerType === 'contains') {
      matched = msg.includes(trigger);
    } else {
      matched = msg === trigger;
    }

    if (!matched) continue;

    try {
      await incrementReactCount(react.name);
      await message.react(react.emoji);
      console.log(`✅ reactReply: "${react.trigger}" ← ${message.author.tag} ← ${react.emoji}`);
    } catch (e) {
      console.error(`❌ reactReply error for "${react.name}":`, e.message);
    }
    break;
  }
}

module.exports = {
  handleReactInteraction, handleReactModal, handleReactMain, handleReactMessage
};

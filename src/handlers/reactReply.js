const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const {
  createReact, updateReact, deleteReact, getReact,
  getAllReacts, getReactsList, getEnabledReacts, incrementReactCount
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
        .setLabel('الاسم الداخلي')
        .setPlaceholder('مثال: ترحيب_قلب')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('rr_trigger')
        .setLabel('الكلمة المفتاحية')
        .setPlaceholder('مثال: مرحبا')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('rr_emoji')
        .setLabel('الإيموجي (مثال: ❤️ أو 👍)')
        .setPlaceholder('❤️')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('rr_trigger_type')
        .setLabel('نوع المطابقة (exact/contains/starts/ends/regex)')
        .setPlaceholder('contains')
        .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20)
    ),
  );

  await interaction.showModal(modal);
}

async function handleRrCreateModal(interaction) {
  const name = interaction.fields.getTextInputValue('rr_name').trim();
  const trigger = interaction.fields.getTextInputValue('rr_trigger').trim();
  const emoji = interaction.fields.getTextInputValue('rr_emoji').trim();
  const triggerType = interaction.fields.getTextInputValue('rr_trigger_type').trim().toLowerCase() || 'contains';

  const validTypes = ['exact', 'contains', 'starts', 'ends', 'regex'];
  if (!validTypes.includes(triggerType)) {
    return interaction.reply({ content: `⚠️ نوع مطابقة غير صالح. الأنواع: ${validTypes.join(', ')}`, ephemeral: true });
  }

  const existing = await getReact(name);
  if (existing) {
    return interaction.reply({ content: `⚠️ التفاعل "${name}" موجود مسبقاً.`, ephemeral: true });
  }

  const created = await createReact({ name, trigger, triggerType, emoji });
  if (!created) {
    return interaction.reply({ content: '❌ فشل إنشاء التفاعل.', ephemeral: true });
  }

  return showRrControlPanel(interaction, name, false);
}

// ================== لوحة التحكم ==================

async function showRrControlPanel(interaction, reactName, editMode = false) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });

  const infoEmbed = new EmbedBuilder()
    .setTitle('ℹ️ معلومات التفاعل')
    .setColor(0x5865F2)
    .addFields(
      { name: '🏷️ الاسم', value: `\`${data.name}\``, inline: true },
      { name: '🔑 الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true },
      { name: '🔍 نوع المطابقة', value: data.triggerType, inline: true },
      { name: '😊 الإيموجي', value: data.emoji, inline: true },
      { name: '📨 مرات الاستخدام', value: `${data.useCount || 0}`, inline: true },
      { name: '✅ مفعل', value: data.enabled !== false ? '🟢 نعم' : '🔴 لا', inline: true },
    )
    .setTimestamp();

  if (data.channelId) {
    infoEmbed.addFields({ name: '📌 مقيد بروم', value: `<#${data.channelId}>`, inline: false });
  }

  const btnBack = new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rr_toggle_${reactName}`).setLabel(data.enabled !== false ? '🟢 تعطيل' : '🔴 تفعيل').setStyle(data.enabled !== false ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rr_edit_trigger_${reactName}`).setLabel('✏️ الكلمة المفتاحية').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rr_edit_emoji_${reactName}`).setLabel('✏️ الإيموجي').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rr_edit_type_${reactName}`).setLabel('🔍 نوع المطابقة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rr_channel_${reactName}`).setLabel(data.channelId ? '📌 تغيير الروم' : '📌 تحديد روم').setStyle(ButtonStyle.Secondary),
    btnBack,
  );

  return respondOrUpdate(interaction, { embeds: [infoEmbed], components: [row1, row2] });
}

// ================== 2. عرض التفاعلات المسجلة ==================

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

  const lines = list.map(r =>
    `${r.enabled ? '🟢' : '🔴'} **${r.name}** — ${r.emoji} \`${r.trigger}\` (${r.triggerType}) — استخدم ${r.useCount} مرة`
  );

  const embed = new EmbedBuilder()
    .setTitle('📋 التفاعلات المسجلة')
    .setColor(0x5865F2)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `إجمالي ${list.length} تفاعل` })
    .setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
    )]
  });
}

// ================== 3. تعديل تفاعل ==================

async function handleRrEdit(interaction) {
  const list = await getReactsList();
  if (list.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد تفاعلات للتعديل.',
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))]
    });
  }
  const options = list.map(r => ({
    label: r.name, description: `${r.emoji} "${r.trigger}" (${r.useCount})`,
    value: `rr_edit_${r.name}`, emoji: r.enabled ? '🟢' : '🔴'
  }));
  return respondOrUpdate(interaction, {
    content: '✏️ اختر التفاعل الذي تريد تعديله:',
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('rr_edit_select').setPlaceholder('✏️ اختر تفاعلاً').addOptions(options.slice(0, 25))
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))
    ]
  });
}

// ================== 4. حذف تفاعل ==================

async function handleRrDelete(interaction) {
  const list = await getReactsList();
  if (list.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد تفاعلات للحذف.',
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))]
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
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))
    ]
  });
}

async function handleRrDeleteConfirm(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  const embed = new EmbedBuilder()
    .setTitle('🗑️ تأكيد الحذف').setColor(0xFF0000)
    .setDescription(`هل أنت متأكد من حذف التفاعل **${reactName}**؟`)
    .addFields({ name: 'الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true },
              { name: 'الإيموجي', value: data.emoji, inline: true },
              { name: 'مرات الاستخدام', value: `${data.useCount || 0}`, inline: true })
    .setTimestamp();
  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rr_delete_yes_${reactName}`).setLabel('✅ نعم، احذف').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('rr_delete').setLabel('❌ لا، تراجع').setStyle(ButtonStyle.Secondary)
    )]
  });
}

async function handleRrDeleteExecute(interaction, reactName) {
  const success = await deleteReact(reactName);
  return respondOrUpdate(interaction, {
    content: success ? `✅ تم حذف التفاعل **${reactName}** بنجاح.` : '❌ فشل حذف التفاعل.',
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rr_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary))]
  });
}

// ================== معالجات التعديل ==================

async function handleRrToggle(interaction, reactName) {
  const data = await getReact(reactName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ التفاعل غير موجود.' });
  await updateReact(reactName, { enabled: data.enabled === false });
  return showRrControlPanel(interaction, reactName, true);
}

async function handleRrEditTrigger(interaction, reactName) {
  const data = await getReact(reactName);
  const modal = new ModalBuilder().setCustomId(`modal_rr_trigger_${reactName}`).setTitle('✏️ تعديل الكلمة المفتاحية');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('rr_trigger').setLabel('الكلمة المفتاحية الجديدة')
      .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500).setValue(data?.trigger || '')
  ));
  await interaction.showModal(modal);
}

async function handleRrEditEmoji(interaction, reactName) {
  const data = await getReact(reactName);
  const modal = new ModalBuilder().setCustomId(`modal_rr_emoji_${reactName}`).setTitle('✏️ تعديل الإيموجي');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('rr_emoji').setLabel('الإيموجي الجديد')
      .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(data?.emoji || '')
  ));
  await interaction.showModal(modal);
}

async function handleRrEditType(interaction, reactName) {
  const data = await getReact(reactName);
  const types = [
    { label: 'يحتوي على (contains)', value: `rr_settype_${reactName}_contains`, emoji: '🔍', default: data?.triggerType === 'contains' },
    { label: 'يطابق تماماً (exact)', value: `rr_settype_${reactName}_exact`, emoji: '✅', default: data?.triggerType === 'exact' },
    { label: 'يبدأ بـ (starts)', value: `rr_settype_${reactName}_starts`, emoji: '▶️', default: data?.triggerType === 'starts' },
    { label: 'ينتهي بـ (ends)', value: `rr_settype_${reactName}_ends`, emoji: '⏹️', default: data?.triggerType === 'ends' },
    { label: 'تعبير منتظم (regex)', value: `rr_settype_${reactName}_regex`, emoji: '🔣', default: data?.triggerType === 'regex' },
  ];
  const embed = new EmbedBuilder().setTitle('🔍 اختر نوع المطابقة').setColor(0x5865F2).setDescription(`الحالي: **${data?.triggerType}**`).setTimestamp();
  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('rr_settype_select').setPlaceholder('🔍 اختر نوع المطابقة').addOptions(types)
    ), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))]
  });
}

async function handleRrChannel(interaction, reactName) {
  const data = await getReact(reactName);
  return respondOrUpdate(interaction, {
    content: data?.channelId ? `📌 الروم الحالي: <#${data.channelId}>` : '📌 اختر الروم (اختياري)',
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`rr_setchannel_${reactName}`).setPlaceholder('📌 اختر الروم').addOptions([
        { label: 'بدون تحديد (كل الرومات)', value: `rr_ch_none_${reactName}`, emoji: '🌐' }
      ])
    ), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rr_edit_${reactName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary))]
  });
}

async function handleRrSetType(interaction) {
  const value = interaction.values[0];
  const parts = value.split('_');
  const type = parts[parts.length - 1];
  const name = parts.slice(2, -1).join('_');
  await updateReact(name, { triggerType: type });
  return showRrControlPanel(interaction, name, true);
}

async function handleRrSetChannel(interaction) {
  const value = interaction.values[0];
  const parts = value.split('_');
  if (parts[2] === 'none') {
    const name = parts.slice(3).join('_');
    await updateReact(name, { channelId: null });
    return showRrControlPanel(interaction, name, true);
  }
  return respondOrUpdate(interaction, { content: '⚠️ خيار غير معروف.' });
}

// ================== معالجات Modal ==================

async function handleRrEditTriggerModal(interaction, reactName) {
  const trigger = interaction.fields.getTextInputValue('rr_trigger').trim();
  await updateReact(reactName, { trigger });
  return showRrControlPanel(interaction, reactName, true);
}

async function handleRrEditEmojiModal(interaction, reactName) {
  const emoji = interaction.fields.getTextInputValue('rr_emoji').trim();
  await updateReact(reactName, { emoji });
  return showRrControlPanel(interaction, reactName, true);
}

// ================== الموزع الرئيسي ==================

async function handleReactInteraction(interaction) {
  const id = interaction.customId;
  const parts = id.split('_');
  const prefix = parts[0];

  if (id === 'rr_main') return handleReactMain(interaction);
  if (id === 'rr_create') return handleRrCreate(interaction);
  if (id === 'rr_list') return handleRrList(interaction);
  if (id === 'rr_edit') return handleRrEdit(interaction);
  if (id === 'rr_delete') return handleRrDelete(interaction);

  if (id === 'rr_edit_select') {
    const name = interaction.values[0].replace('rr_edit_', '');
    return showRrControlPanel(interaction, name, true);
  }
  if (id === 'rr_delete_select') {
    const name = interaction.values[0].replace('rr_del_', '');
    return handleRrDeleteConfirm(interaction, name);
  }
  if (prefix === 'rr' && parts[1] === 'delete' && parts[2] === 'yes') {
    return handleRrDeleteExecute(interaction, parts.slice(3).join('_'));
  }
  if (prefix === 'rr' && parts[1] === 'toggle') {
    return handleRrToggle(interaction, parts.slice(2).join('_'));
  }
  if (prefix === 'rr' && parts[1] === 'edit' && parts[2] === 'trigger') {
    return handleRrEditTrigger(interaction, parts.slice(3).join('_'));
  }
  if (prefix === 'rr' && parts[1] === 'edit' && parts[2] === 'emoji') {
    return handleRrEditEmoji(interaction, parts.slice(3).join('_'));
  }
  if (prefix === 'rr' && parts[1] === 'edit' && parts[2] === 'type') {
    return handleRrEditType(interaction, parts.slice(3).join('_'));
  }
  if (prefix === 'rr' && parts[1] === 'channel') {
    return handleRrChannel(interaction, parts.slice(2).join('_'));
  }
  if (id === 'rr_settype_select') return handleRrSetType(interaction);
  if (id.startsWith('rr_setchannel_')) return handleRrSetChannel(interaction);

  return respondOrUpdate(interaction, { content: `⚠️ أمر غير معروف: ${id}` });
}

// ================== معالجات Modal ==================

async function handleReactModal(interaction) {
  const id = interaction.customId;
  if (id === 'modal_rr_create') return handleRrCreateModal(interaction);
  if (id.startsWith('modal_rr_trigger_')) return handleRrEditTriggerModal(interaction, id.replace('modal_rr_trigger_', ''));
  if (id.startsWith('modal_rr_emoji_')) return handleRrEditEmojiModal(interaction, id.replace('modal_rr_emoji_', ''));
  return interaction.reply({ content: '⚠️ Modal غير معروف.', ephemeral: true });
}

// ================== محرك معالجة الرسائل (messageCreate) للتفاعلات ==================

async function handleReactMessage(message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const reacts = await getEnabledReacts();
  if (reacts.length === 0) return;

  const content = message.content;

  for (const react of reacts) {
    if (react.channelId && message.channel.id !== react.channelId) continue;

    let matched = false;
    const msg = react.caseSensitive ? content : content.toLowerCase();
    const trigger = react.caseSensitive ? react.trigger : react.trigger.toLowerCase();

    switch (react.triggerType) {
      case 'exact': matched = msg === trigger; break;
      case 'contains': matched = msg.includes(trigger); break;
      case 'starts': matched = msg.startsWith(trigger); break;
      case 'ends': matched = msg.endsWith(trigger); break;
      case 'regex':
        try {
          const flags = react.caseSensitive ? 'g' : 'gi';
          matched = new RegExp(trigger, flags).test(msg);
        } catch { /* ignore */ }
        break;
    }

    if (matched) {
      try {
        await incrementReactCount(react.name);
        // محاولة وضع التفاعل (الإيموجي)
        await message.react(react.emoji);
        console.log(`✅ reactReply: "${react.trigger}" ← ${message.author.tag} ← ${react.emoji}`);
      } catch (e) {
        console.error(`❌ reactReply error for "${react.name}":`, e.message);
      }
      break;
    }
  }
}

module.exports = {
  handleReactInteraction, handleReactModal, handleReactMain, handleReactMessage
};

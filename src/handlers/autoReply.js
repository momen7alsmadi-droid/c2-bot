const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { COLORS } = require('../utils/colors');
const {
  createReply, updateReply, deleteReply, getReply,
  getAllReplies, getRepliesList, getEnabledReplies, incrementUseCount
} = require('../utils/autoReplyStorage');

// ---------- دالة مساعدة ----------
async function respondOrUpdate(interaction, payload) {
  if (interaction.isCommand()) return interaction.reply({ ...payload, ephemeral: true });
  return interaction.update(payload);
}

// ================== اللوحة الرئيسية ==================

async function handleAutoReplyMain(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🤖 لوحة الردود التلقائية')
    .setColor(0x5865F2)
    .setDescription('اختر أحد الخيارات أدناه لإدارة الردود التلقائية.')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ar_create').setLabel('➕ إضافة رد جديد').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ar_list').setLabel('📋 الردود المسجلة').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ar_edit').setLabel('✏️ تعديل رد').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ar_delete').setLabel('🗑️ حذف رد').setStyle(ButtonStyle.Danger),
  );

  return respondOrUpdate(interaction, { embeds: [embed], components: [row] });
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
        .setLabel('الاسم الداخلي (للحفظ والبحث)')
        .setPlaceholder('مثال: مرحبا')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('ar_trigger')
        .setLabel('الكلمة المفتاحية / النمط')
        .setPlaceholder('مثال: مرحبا')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('ar_trigger_type')
        .setLabel('نوع المطابقة (exact/contains/starts/ends/regex)')
        .setPlaceholder('contains')
        .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('ar_response')
        .setLabel('نص الرد')
        .setPlaceholder('أهلاً بك!')
        .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000)
    ),
  );

  await interaction.showModal(modal);
}

async function handleArCreateModal(interaction) {
  const name = interaction.fields.getTextInputValue('ar_name').trim();
  const trigger = interaction.fields.getTextInputValue('ar_trigger').trim();
  const triggerType = interaction.fields.getTextInputValue('ar_trigger_type').trim().toLowerCase() || 'contains';
  const responseText = interaction.fields.getTextInputValue('ar_response').trim();

  const validTypes = ['exact', 'contains', 'starts', 'ends', 'regex'];
  if (!validTypes.includes(triggerType)) {
    return interaction.reply({ content: `⚠️ نوع مطابقة غير صالح. الأنواع: ${validTypes.join(', ')}`, ephemeral: true });
  }

  const existing = await getReply(name);
  if (existing) {
    return interaction.reply({ content: `⚠️ الرد "${name}" موجود مسبقاً.`, ephemeral: true });
  }

  const created = await createReply({ name, trigger, triggerType, responseText });
  if (!created) {
    return interaction.reply({ content: '❌ فشل إنشاء الرد.', ephemeral: true });
  }

  // الذهاب إلى لوحة التحكم
  return showArControlPanel(interaction, name, false);
}

// ================== لوحة التحكم ==================

async function showArControlPanel(interaction, replyName, editMode = false) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });

  const infoEmbed = new EmbedBuilder()
    .setTitle('ℹ️ معلومات الرد')
    .setColor(parseInt(COLORS.find(c => c.value === '#5865F2')?.value.replace('#', ''), 16) || 0x5865F2)
    .addFields(
      { name: '🏷️ الاسم', value: `\`${data.name}\``, inline: true },
      { name: '🔑 الكلمة المفتاحية', value: `\`${data.trigger}\``, inline: true },
      { name: '🔍 نوع المطابقة', value: data.triggerType, inline: true },
      { name: '📝 نص الرد', value: (data.responseText || '(بدون)').slice(0, 200), inline: false },
      { name: '📨 مرات الاستخدام', value: `${data.useCount || 0}`, inline: true },
      { name: '✅ مفعل', value: data.enabled !== false ? '🟢 نعم' : '🔴 لا', inline: true },
    )
    .setTimestamp();

  if (data.channelId) {
    infoEmbed.addFields({ name: '📌 مقيد بروم', value: `<#${data.channelId}>`, inline: false });
  }

  const btnBack = new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ar_toggle_${replyName}`).setLabel(data.enabled !== false ? '🟢 تعطيل' : '🔴 تفعيل').setStyle(data.enabled !== false ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ar_edit_trigger_${replyName}`).setLabel('✏️ الكلمة المفتاحية').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ar_edit_response_${replyName}`).setLabel('✏️ نص الرد').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ar_edit_type_${replyName}`).setLabel('🔍 نوع المطابقة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ar_channel_${replyName}`).setLabel(data.channelId ? '📌 تغيير الروم' : '📌 تحديد روم').setStyle(ButtonStyle.Secondary),
    btnBack,
  );

  return respondOrUpdate(interaction, { embeds: [infoEmbed], components: [row1, row2] });
}

// ================== 2. عرض الردود المسجلة ==================

async function handleArList(interaction) {
  const list = await getRepliesList();
  if (list.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد ردود تلقائية مسجلة.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const lines = list.map(r =>
    `${r.enabled ? '🟢' : '🔴'} **${r.name}** — \`${r.trigger}\` (${r.triggerType}) — استخدم ${r.useCount} مرة`
  );

  const embed = new EmbedBuilder()
    .setTitle('📋 الردود التلقائية المسجلة')
    .setColor(0x5865F2)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `إجمالي ${list.length} رد` })
    .setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
    )]
  });
}

// ================== 3. تعديل رد ==================

async function handleArEdit(interaction) {
  const list = await getRepliesList();
  if (list.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد ردود للتعديل.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const options = list.map(r => ({
    label: r.name,
    description: `"${r.trigger}" (${r.useCount})`,
    value: `ar_edit_${r.name}`,
    emoji: r.enabled ? '🟢' : '🔴'
  }));

  return respondOrUpdate(interaction, {
    content: '✏️ اختر الرد الذي تريد تعديله:',
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ar_edit_select').setPlaceholder('✏️ اختر رداً')
          .addOptions(options.slice(0, 25))
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// ================== 4. حذف رد ==================

async function handleArDelete(interaction) {
  const list = await getRepliesList();
  if (list.length === 0) {
    return respondOrUpdate(interaction, {
      content: '📭 لا يوجد ردود للحذف.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )]
    });
  }

  const options = list.map(r => ({
    label: r.name,
    description: `"${r.trigger}"`,
    value: `ar_del_${r.name}`,
    emoji: '🗑️'
  }));

  return respondOrUpdate(interaction, {
    content: '🗑️ اختر الرد الذي تريد حذفه:',
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ar_delete_select').setPlaceholder('🗑️ اختر رداً للحذف')
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

// ================== معالجات التعديل (أزرار + Modals) ==================

// تبديل التفعيل
async function handleArToggle(interaction, replyName) {
  const data = await getReply(replyName);
  if (!data) return respondOrUpdate(interaction, { content: '⚠️ الرد غير موجود.' });
  await updateReply(replyName, { enabled: data.enabled === false });
  return showArControlPanel(interaction, replyName, true);
}

// تعديل الكلمة المفتاحية
async function handleArEditTrigger(interaction, replyName) {
  const data = await getReply(replyName);
  const modal = new ModalBuilder()
    .setCustomId(`modal_ar_trigger_${replyName}`)
    .setTitle('✏️ تعديل الكلمة المفتاحية');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('ar_trigger')
        .setLabel('الكلمة المفتاحية الجديدة')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)
        .setValue(data?.trigger || '')
    ),
  );
  await interaction.showModal(modal);
}

// تعديل نص الرد
async function handleArEditResponse(interaction, replyName) {
  const data = await getReply(replyName);
  const modal = new ModalBuilder()
    .setCustomId(`modal_ar_response_${replyName}`)
    .setTitle('✏️ تعديل نص الرد');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('ar_response')
        .setLabel('نص الرد الجديد')
        .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000)
        .setValue(data?.responseText || '')
    ),
  );
  await interaction.showModal(modal);
}

// تعديل نوع المطابقة (قائمة منسدلة)
async function handleArEditType(interaction, replyName) {
  const data = await getReply(replyName);
  const types = [
    { label: 'يحتوي على (contains)', value: `ar_settype_${replyName}_contains`, emoji: '🔍', default: data?.triggerType === 'contains' },
    { label: 'يطابق تماماً (exact)', value: `ar_settype_${replyName}_exact`, emoji: '✅', default: data?.triggerType === 'exact' },
    { label: 'يبدأ بـ (starts)', value: `ar_settype_${replyName}_starts`, emoji: '▶️', default: data?.triggerType === 'starts' },
    { label: 'ينتهي بـ (ends)', value: `ar_settype_${replyName}_ends`, emoji: '⏹️', default: data?.triggerType === 'ends' },
    { label: 'تعبير منتظم (regex)', value: `ar_settype_${replyName}_regex`, emoji: '🔣', default: data?.triggerType === 'regex' },
  ];

  const embed = new EmbedBuilder()
    .setTitle('🔍 اختر نوع المطابقة')
    .setColor(0x5865F2)
    .setDescription(`الحالي: **${data?.triggerType}**`)
    .setTimestamp();

  return respondOrUpdate(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ar_settype_select')
          .setPlaceholder('🔍 اختر نوع المطابقة')
          .addOptions(types)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ar_edit_${replyName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// تحديد روم (قائمة منسدلة)
async function handleArChannel(interaction, replyName) {
  const data = await getReply(replyName);
  return respondOrUpdate(interaction, {
    content: data?.channelId
      ? `📌 الروم الحالي: <#${data.channelId}>. اختر روماً جديداً أو اختر "بدون" لإلغاء التحديد.`
      : '📌 اختر الروم الذي سيعمل فيه الرد (اختياري).',
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ar_setchannel_${replyName}`)
          .setPlaceholder('📌 اختر الروم')
          .addOptions([
            { label: 'بدون تحديد (كل الرومات)', value: `ar_ch_none_${replyName}`, emoji: '🌐' },
          ])
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ar_edit_${replyName}`).setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

// معالجة اختيار نوع المطابقة
async function handleArSetType(interaction) {
  const value = interaction.values[0]; // ar_settype_{name}_{type}
  const parts = value.split('_');
  const type = parts[parts.length - 1];
  const name = parts.slice(2, -1).join('_');
  await updateReply(name, { triggerType: type });
  return showArControlPanel(interaction, name, true);
}

// معالجة اختيار الروم (من القناة)
async function handleArSetChannel(interaction) {
  const value = interaction.values[0]; // ar_ch_none_{name}
  const parts = value.split('_');
  // ar_ch_none_{name}
  if (parts[2] === 'none') {
    const name = parts.slice(3).join('_');
    await updateReply(name, { channelId: null });
    return showArControlPanel(interaction, name, true);
  }
  return respondOrUpdate(interaction, { content: '⚠️ خيار غير معروف.' });
}

// ================== معالجات الـ Modal ==================

async function handleArEditTriggerModal(interaction, replyName) {
  const trigger = interaction.fields.getTextInputValue('ar_trigger').trim();
  await updateReply(replyName, { trigger });
  return showArControlPanel(interaction, replyName, true);
}

async function handleArEditResponseModal(interaction, replyName) {
  const responseText = interaction.fields.getTextInputValue('ar_response').trim();
  await updateReply(replyName, { responseText });
  return showArControlPanel(interaction, replyName, true);
}

// ================== الموزع الرئيسي ==================

async function handleAutoReplyInteraction(interaction) {
  const id = interaction.customId;
  const parts = id.split('_');
  const prefix = parts[0];

  // الأزرار الرئيسية
  if (id === 'ar_main') return handleAutoReplyMain(interaction);
  if (id === 'ar_create') return handleArCreate(interaction);
  if (id === 'ar_list') return handleArList(interaction);
  if (id === 'ar_edit') return handleArEdit(interaction);
  if (id === 'ar_delete') return handleArDelete(interaction);

  // اختيار للتعديل
  if (id === 'ar_edit_select') {
    const selected = interaction.values[0];
    const name = selected.replace('ar_edit_', '');
    return showArControlPanel(interaction, name, true);
  }

  // اختيار للحذف
  if (id === 'ar_delete_select') {
    const selected = interaction.values[0];
    const name = selected.replace('ar_del_', '');
    return handleArDeleteConfirm(interaction, name);
  }

  // تأكيد الحذف
  if (prefix === 'ar' && parts[1] === 'delete' && parts[2] === 'yes') {
    const name = parts.slice(3).join('_');
    return handleArDeleteExecute(interaction, name);
  }

  // تبديل التفعيل
  if (prefix === 'ar' && parts[1] === 'toggle') {
    const name = parts.slice(2).join('_');
    return handleArToggle(interaction, name);
  }

  // تعديل الكلمة المفتاحية
  if (prefix === 'ar' && parts[1] === 'edit' && parts[2] === 'trigger') {
    const name = parts.slice(3).join('_');
    return handleArEditTrigger(interaction, name);
  }

  // تعديل نص الرد
  if (prefix === 'ar' && parts[1] === 'edit' && parts[2] === 'response') {
    const name = parts.slice(3).join('_');
    return handleArEditResponse(interaction, name);
  }

  // تعديل نوع المطابقة
  if (prefix === 'ar' && parts[1] === 'edit' && parts[2] === 'type') {
    const name = parts.slice(3).join('_');
    return handleArEditType(interaction, name);
  }

  // تحديد روم
  if (prefix === 'ar' && parts[1] === 'channel') {
    const name = parts.slice(2).join('_');
    return handleArChannel(interaction, name);
  }

  // اختيار نوع المطابقة من القائمة
  if (id === 'ar_settype_select') {
    return handleArSetType(interaction);
  }

  // اختيار الروم من القائمة
  if (id.startsWith('ar_setchannel_')) {
    return handleArSetChannel(interaction);
  }

  return respondOrUpdate(interaction, { content: `⚠️ أمر غير معروف: ${id}` });
}

// ================== معالجات الـ Modal ==================

async function handleAutoReplyModal(interaction) {
  const id = interaction.customId;

  if (id === 'modal_ar_create') return handleArCreateModal(interaction);

  if (id.startsWith('modal_ar_trigger_')) {
    const name = id.replace('modal_ar_trigger_', '');
    return handleArEditTriggerModal(interaction, name);
  }

  if (id.startsWith('modal_ar_response_')) {
    const name = id.replace('modal_ar_response_', '');
    return handleArEditResponseModal(interaction, name);
  }

  return interaction.reply({ content: '⚠️ Modal غير معروف.', ephemeral: true });
}

// ================== محرك معالجة الرسائل (messageCreate) ==================

async function handleMessage(message) {
  // تجاهل رسائل البوتات
  if (message.author.bot) return;
  if (!message.guild) return; // فقط السيرفرات

  const replies = await getEnabledReplies();
  if (replies.length === 0) return;

  const content = message.content;

  for (const reply of replies) {
    // فحص الروم المحدد
    if (reply.channelId && message.channel.id !== reply.channelId) continue;

    let matched = false;
    const msg = reply.caseSensitive ? content : content.toLowerCase();
    const trigger = reply.caseSensitive ? reply.trigger : reply.trigger.toLowerCase();

    switch (reply.triggerType) {
      case 'exact':
        matched = msg === trigger;
        break;
      case 'contains':
        matched = msg.includes(trigger);
        break;
      case 'starts':
        matched = msg.startsWith(trigger);
        break;
      case 'ends':
        matched = msg.endsWith(trigger);
        break;
      case 'regex':
        try {
          const flags = reply.caseSensitive ? 'g' : 'gi';
          const regex = new RegExp(trigger, flags);
          matched = regex.test(msg);
        } catch { /* تجاهل الخطأ */ }
        break;
    }

    if (matched) {
      try {
        // زيادة العداد
        await incrementUseCount(reply.name);

        // إرسال الرد
        await message.reply(reply.responseText || '👋');

        console.log(`✅ autoReply: "${reply.trigger}" ← ${message.author.tag}`);
      } catch (e) {
        console.error(`❌ autoReply error for "${reply.name}":`, e.message);
      }
      // نطابق أول رد فقط
      break;
    }
  }
}

module.exports = {
  handleAutoReplyInteraction,
  handleAutoReplyModal,
  handleAutoReplyMain,
  handleMessage
};

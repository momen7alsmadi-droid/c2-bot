/**
 * starboard.js - ⭐ نظام لوحة النجوم (Starboard) متعدد اللوحات
 * تصميم مطابق لنظام الإيمبدات في التعامل مع اللوحات المتعددة
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ChannelSelectMenuBuilder, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType
} = require('discord.js');
const { version } = require('../utils/version');
const {
  getAllPanels, getPanel, savePanel, deletePanel
} = require('../utils/starboardStorage');
const { COLORS } = require('../utils/colors');

// ---------- دالة مساعدة: تحويل hex (#RRGGBB) إلى integer ----------
function hexToInt(hex) {
  return parseInt((hex || '#F1C40F').replace('#', ''), 16) || 0xF1C40F;
}

// ---------- دالة مساعدة: تحديث أو رد حسب حالة الـ interaction ----------
async function respondOrUpdate(interaction, payload) {
  if (interaction.deferred) return interaction.editReply(payload).catch(() => {});
  if (interaction.isCommand() || interaction.isModalSubmit()) {
    return interaction.reply({ ...payload, ephemeral: true });
  }
  if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
    return interaction.update(payload);
  }
  return interaction.editReply(payload).catch(() => interaction.reply({ ...payload, ephemeral: true }).catch(() => {}));
}

// ================== 1. الواجهة الرئيسية ==================

/** الأمر /لوحة_النجوم - يعرض الواجهة الرئيسية */
async function handleStarboardMain(interaction) {
  try {
    const embed = new EmbedBuilder()
      .setTitle('⭐ لوحة النجوم')
      .setColor(0xF1C40F)
      .setDescription('نظام متعدد اللوحات لنقل المنشورات المميزة تلقائياً')
      .addFields(
        { name: '📊 إجمالي اللوحات', value: `${getAllPanels().length}`, inline: true },
        { name: '⚙️ الحالة', value: '🟢 نشط', inline: true },
      )
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sb_add').setLabel('➕ إضافة لوحة').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('sb_edit').setLabel('✏️ تعديل لوحة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('sb_delete').setLabel('🗑️ حذف لوحة').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('sb_view').setLabel('📋 عرض اللوحات').setStyle(ButtonStyle.Secondary),
      ),
    ];

    return respondOrUpdate(interaction, { embeds: [embed], components });
  } catch (e) {
    console.error('❌ handleStarboardMain:', e.message);
    return respondOrUpdate(interaction, { content: '⚠️ خطأ.' });
  }
}

// ================== 2. معالج الأزرار الرئيسية ==================

async function handleStarboardButton(interaction, action) {
  try {
    // --- إضافة لوحة → showModal فوراً بدون defer ---
    if (action === 'add') {
      const modal = new ModalBuilder()
        .setCustomId('modal_sb_add')
        .setTitle('➕ إضافة لوحة نجوم جديدة');

      const input = new TextInputBuilder()
        .setCustomId('sb_name')
        .setLabel('اسم اللوحة (حروف إنجليزية أو أرقام فقط)')
        .setPlaceholder('مثال: main, ideas, suggestions')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(30);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // --- بقية الأزرار → deferUpdate ---
    await interaction.deferUpdate();

    const panels = getAllPanels();

    // --- تعديل لوحة ---
    if (action === 'edit') {
      if (panels.length === 0) {
        return interaction.editReply({ content: '❌ لا توجد لوحات بعد. أضف لوحة أولاً.', components: [] });
      }
      const options = panels.map(p => ({ label: p.name, value: p.name }));
      return interaction.editReply({
        content: '✏️ اختر اللوحة التي تريد تعديلها:',
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('sb_sel_edit')
              .setPlaceholder('اختر لوحة...')
              .addOptions(options)
          ),
        ]
      });
    }

    // --- حذف لوحة ---
    if (action === 'delete') {
      if (panels.length === 0) {
        return interaction.editReply({ content: '❌ لا توجد لوحات بعد.', components: [] });
      }
      const options = panels.map(p => ({ label: p.name, value: p.name }));
      return interaction.editReply({
        content: '🗑️ اختر اللوحة التي تريد حذفها:',
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('sb_sel_delete')
              .setPlaceholder('اختر لوحة...')
              .addOptions(options)
          ),
        ]
      });
    }

    // --- عرض اللوحات ---
    if (action === 'view') {
      if (panels.length === 0) {
        return interaction.editReply({ content: '📋 لا توجد لوحات بعد.', components: [] });
      }
      const lines = panels.map((p, i) =>
        `**${i + 1}.** \`${p.name}\`\n📥 <#${p.sourceChannelId || '❌'}>\n📤 <#${p.destChannelId || '❌'}>\n${p.emoji} | ${p.threshold} | 🎨 ${p.embedColor}`
      );
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('📋 جميع لوحات النجوم')
          .setColor(0x3498DB)
          .setDescription(lines.join('\n\n'))
          .setFooter({ text: `الإصدار: ${version}` })
          .setTimestamp()
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sb_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary),
          ),
        ]
      });
    }

    // --- الرجوع للرئيسية ---
    if (action === 'back') {
      return handleStarboardMain(interaction);
    }
  } catch (e) {
    console.error('❌ handleStarboardButton:', action, e.message);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '⚠️ خطأ.', components: [] });
      } else {
        await interaction.reply({ content: '⚠️ خطأ.', ephemeral: true });
      }
    } catch {}
  }
}

// ================== 3. معالج القوائم المنسدلة ==================

async function handleStarboardSelect(interaction) {
  try {
    await interaction.deferUpdate();
    const id = interaction.customId;
    const selected = interaction.values[0];

    // اختيار لوحة للتعديل
    if (id === 'sb_sel_edit') {
      return showPanelControl(interaction, selected);
    }

    // اختيار لوحة للحذف → تأكيد
    if (id === 'sb_sel_delete') {
      const embed = new EmbedBuilder()
        .setTitle('🗑️ تأكيد حذف اللوحة')
        .setColor(0xE74C3C)
        .setDescription(`هل أنت متأكد من حذف اللوحة **${selected}**؟`)
        .setTimestamp();

      return interaction.editReply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`sb_del_yes_${selected}`).setLabel('✅ نعم، احذف').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('sb_back').setLabel('❌ إلغاء').setStyle(ButtonStyle.Secondary),
          ),
        ]
      });
    }

    // اختيار روم المصدر للوحة
    if (id.startsWith('sb_sel_source_')) {
      const name = id.replace('sb_sel_source_', '');
      const panel = getPanel(name);
      if (panel) {
        panel.sourceChannelId = selected;
        savePanel(name, panel);

        // منع @everyone من إضافة تفاعلات
        try {
          const channel = await interaction.guild.channels.fetch(selected);
          if (channel) {
            await channel.permissionOverwrites.edit(interaction.guild.id, { AddReactions: false }).catch(() => {});
          }
        } catch {}
      }
      return showPanelControl(interaction, name);
    }

    // اختيار روم الوجهة للوحة
    if (id.startsWith('sb_sel_dest_')) {
      const name = id.replace('sb_sel_dest_', '');
      const panel = getPanel(name);
      if (panel) {
        panel.destChannelId = selected;
        savePanel(name, panel);
      }
      return showPanelControl(interaction, name);
    }

    // اختيار لون جاهز للوحة
    if (id.startsWith('sb_readycolor_')) {
      const name = id.replace('sb_readycolor_', '');
      const panel = getPanel(name);
      if (panel) {
        panel.embedColor = selected;
        savePanel(name, panel);
      }
      return showPanelControl(interaction, name);
    }
  } catch (e) {
    console.error('❌ handleStarboardSelect:', e.message);
    try { await interaction.editReply({ content: '⚠️ خطأ.' }); } catch {}
  }
}

// ================== 4. لوحة التحكم بلوحة واحدة ==================

async function showPanelControl(interaction, name) {
  try {
    const panel = getPanel(name);
    if (!panel) {
      return respondOrUpdate(interaction, { content: '⚠️ اللوحة غير موجودة.' });
    }

    const currentColorHex = panel.embedColor || '#F1C40F';
    const currentColorName = COLORS.find(c => c.value === currentColorHex)?.name || 'ذهبي (Gold)';

    const embed = new EmbedBuilder()
      .setTitle(`⭐ ${name}`)
      .setColor(hexToInt(currentColorHex))
      .setDescription('تحكم في إعدادات هذه اللوحة')
      .addFields(
        { name: '📥 روم المصدر', value: panel.sourceChannelId ? `<#${panel.sourceChannelId}>` : '❌ غير محدد', inline: false },
        { name: '📤 روم الوجهة', value: panel.destChannelId ? `<#${panel.destChannelId}>` : '❌ غير محدد', inline: false },
        { name: '😀 الإيموجي', value: panel.emoji || '⭐', inline: true },
        { name: '🔢 العدد', value: `${panel.threshold || 5}`, inline: true },
        { name: '🎨 اللون', value: currentColorName, inline: true },
      )
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    const readyColorOptions = COLORS.slice(0, 25).map(c => ({
      label: c.name,
      value: c.value,
      default: c.value === currentColorHex
    }));

    const components = [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`sb_sel_source_${name}`)
          .setPlaceholder('📥 روم المصدر')
          .setMaxValues(1)
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`sb_sel_dest_${name}`)
          .setPlaceholder('📤 روم الوجهة')
          .setMaxValues(1)
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sb_emoji_${name}`).setLabel('😀 الإيموجي ⏵').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`sb_customcolor_${name}`).setLabel('لون مخصص 🎨').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`sb_thresh_${name}`).setLabel('🔢 العدد ⏵').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`sb_readycolor_${name}`)
          .setPlaceholder('🎨 ألوان جاهزة')
          .addOptions(readyColorOptions)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sb_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary),
      ),
    ];

    return respondOrUpdate(interaction, { embeds: [embed], components });
  } catch (e) {
    console.error('❌ showPanelControl:', e.message);
    return respondOrUpdate(interaction, { content: '⚠️ خطأ في عرض اللوحة.' });
  }
}

// ================== 5. أزرار لوحة التحكم (إيموجي، لون مخصص، عدد) ==================

async function handlePanelButton(interaction, action, name) {
  try {
    if (action === 'emoji') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_sb_emoji_${name}`)
        .setTitle('😀 تغيير الإيموجي');

      const input = new TextInputBuilder()
        .setCustomId('sb_emoji_val')
        .setLabel('الإيموجي المطلوب')
        .setPlaceholder('مثال: ⭐')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (action === 'thresh') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_sb_thresh_${name}`)
        .setTitle('🔢 العدد المطلوب للنقل');

      const input = new TextInputBuilder()
        .setCustomId('sb_thresh_val')
        .setLabel('العدد (رقم صحيح أكبر من 0)')
        .setPlaceholder('مثال: 5')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(5);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (action === 'customcolor') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_sb_customcolor_${name}`)
        .setTitle('🎨 لون مخصص');

      const input = new TextInputBuilder()
        .setCustomId('sb_customcolor_val')
        .setLabel('أدخل رمز اللون السداسي (Hex Code)')
        .setPlaceholder('#3B82F6')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(4)
        .setMaxLength(7);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }
  } catch (e) {
    console.error('❌ handlePanelButton:', action, name, e.message);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ خطأ.', ephemeral: true });
      }
    } catch {}
  }
}

// ================== 6. معالج المودال ==================

async function handleStarboardModal(interaction) {
  const id = interaction.customId;
  try {
    // --- إضافة لوحة جديدة ---
    if (id === 'modal_sb_add') {
      const name = interaction.fields.getTextInputValue('sb_name').trim().toLowerCase().replace(/\s+/g, '_');
      if (!/^[a-zA-Z0-9_]+$/.test(name)) {
        return interaction.reply({ content: '❌ اسم اللوحة يجب أن يحتوي فقط على حروف إنجليزية وأرقام و _', ephemeral: true });
      }
      const existing = getPanel(name);
      if (existing) {
        return interaction.reply({ content: `❌ اللوحة \`${name}\` موجودة مسبقاً.`, ephemeral: true });
      }
      savePanel(name, {});
      return showPanelControl(interaction, name);
    }

    // --- تأكيد حذف لوحة ---
    if (id.startsWith('modal_sb_delete_yes_')) {
      const name = id.replace('modal_sb_delete_yes_', '');
      deletePanel(name);
      return handleStarboardMain(interaction);
    }

    // --- تعديل الإيموجي ---
    if (id.startsWith('modal_sb_emoji_')) {
      const name = id.replace('modal_sb_emoji_', '');
      await interaction.deferUpdate();
      const emoji = interaction.fields.getTextInputValue('sb_emoji_val').trim();
      if (!emoji) return interaction.editReply({ content: '❌ الإيموجي مطلوب.', components: [] });
      const panel = getPanel(name);
      if (panel) { panel.emoji = emoji; savePanel(name, panel); }
      return showPanelControl(interaction, name);
    }

    // --- تعديل العدد ---
    if (id.startsWith('modal_sb_thresh_')) {
      const name = id.replace('modal_sb_thresh_', '');
      await interaction.deferUpdate();
      const val = parseInt(interaction.fields.getTextInputValue('sb_thresh_val'), 10);
      if (isNaN(val) || val < 1) return interaction.editReply({ content: '❌ أدخل رقماً صحيحاً أكبر من 0.', components: [] });
      const panel = getPanel(name);
      if (panel) { panel.threshold = val; savePanel(name, panel); }
      return showPanelControl(interaction, name);
    }

    // --- لون مخصص ---
    if (id.startsWith('modal_sb_customcolor_')) {
      const name = id.replace('modal_sb_customcolor_', '');
      await interaction.deferUpdate();
      const hex = interaction.fields.getTextInputValue('sb_customcolor_val').trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        return interaction.editReply({ content: '❌ رمز اللون غير صالح. استخدم #RRGGBB مثل #FF0000', components: [] });
      }
      const panel = getPanel(name);
      if (panel) { panel.embedColor = hex.toUpperCase(); savePanel(name, panel); }
      return showPanelControl(interaction, name);
    }
  } catch (e) {
    console.error('❌ handleStarboardModal:', id, e.message);
    try {
      if (interaction.deferred) await interaction.editReply({ content: '⚠️ خطأ: ' + e.message });
      else if (!interaction.replied) await interaction.reply({ content: '⚠️ خطأ.', ephemeral: true });
    } catch {}
  }
}

// ================== 7. معالج تأكيد الحذف (زر) ==================

async function handleDeleteConfirm(interaction, name) {
  try {
    await interaction.deferUpdate();
    const modal = new ModalBuilder()
      .setCustomId(`modal_sb_delete_yes_${name}`)
      .setTitle('🗑️ تأكيد حذف اللوحة');

    const input = new TextInputBuilder()
      .setCustomId('sb_delete_confirm')
      .setLabel(`اكتب DELETE لتأكيد حذف ${name}`)
      .setPlaceholder('DELETE')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(6)
      .setMaxLength(6);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  } catch (e) {
    console.error('❌ handleDeleteConfirm:', e.message);
    try { await interaction.reply({ content: '⚠️ خطأ.', ephemeral: true }); } catch {}
  }
}

// ================== 8. أحداث الرسائل والتفاعلات ==================

/** معالج الرسائل الجديدة - يبحث في كل اللوحات ويضيف التفاعل التلقائي */
async function handleStarboardMessage(message) {
  try {
    if (message.author.bot || !message.guild) return;

    const panels = getAllPanels();
    if (panels.length === 0) return;

    const isThread = message.channel.isThread?.();
    const actualChannelId = isThread ? message.channel.parentId : message.channel.id;
    const isStarterMessage = isThread ? (message.id === message.channel.id) : true;

    if (!isStarterMessage) return;

    for (const panel of panels) {
      if (!panel.sourceChannelId || !panel.emoji) continue;
      if (actualChannelId !== panel.sourceChannelId) continue;

      try {
        await message.react(panel.emoji);
        console.log(`⭐ [${panel.name}] تم إضافة ${panel.emoji} على`, message.id);
      } catch (reactErr) {
        if (reactErr.code === 50013) {
          console.error(`⚠️ [${panel.name}] لا يملك صلاحية AddReactions`);
        }
      }
    }
  } catch (e) {
    console.error('❌ handleStarboardMessage:', e.message);
  }
}

/** معالج التفاعلات - يبحث في كل اللوحات وينقل إذا تحقق الشرط */
async function handleStarboardReaction(reaction, user) {
  try {
    if (user.bot || !reaction.message.guild) return;

    const panels = getAllPanels();
    if (panels.length === 0) return;

    const channel = reaction.message.channel;
    const isThread = channel.isThread?.();
    const actualChannelId = isThread ? channel.parentId : channel.id;

    for (const panel of panels) {
      if (!panel.sourceChannelId || !panel.destChannelId || !panel.emoji) continue;
      if (actualChannelId !== panel.sourceChannelId) continue;

      const emojiStr = reaction.emoji.id ? reaction.emoji.toString() : reaction.emoji.name;
      if (emojiStr !== panel.emoji) {
        // إيموجي غير مصرح → احذفه
        try {
          await reaction.users.remove(user.id);
          console.log(`🗑️ [${panel.name}] تم حذف ${emojiStr} غير المصرح`);
        } catch {}
        return;
      }

      // حساب العدد الحقيقي
      const reactedUsers = await reaction.users.fetch();
      const realUserCount = reactedUsers.filter(u => !u.bot).size;
      if (realUserCount < panel.threshold) continue;

      const message = reaction.message;

      // جهز روم الوجهة
      const destChannel = await message.guild.channels.fetch(panel.destChannelId).catch(() => null);
      if (!destChannel) continue;

      // بناء الإيمبد
      const descContent = message.content || '';
      const threadId = message.channel?.id;
      const mentionLink = `<#${threadId}>`;
      const topLine = `${realUserCount} ${panel.emoji} | ${mentionLink}`;

      const featuredEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setDescription(`${descContent}\n👤 ${message.author}\n\n[📎 اضغط للانتقال إلى الرسالة الأصلية](${message.url})`)
        .setColor(hexToInt(panel.embedColor || '#F1C40F'))
        .setTimestamp();

      if (message.attachments.size > 0) {
        const first = message.attachments.first();
        if (first.contentType?.startsWith('image/')) featuredEmbed.setImage(first.url);
      }

      try {
        const sentMsg = await destChannel.send({ content: topLine, embeds: [featuredEmbed] });
        await sentMsg.react(panel.emoji).catch(() => {});
        console.log(`✅ [${panel.name}] تم النقل إلى ${destChannel.name}`);
      } catch (sendErr) {
        console.error(`❌ [${panel.name}] فشل النقل:`, sendErr.message);
      }
      return; // تم النقل، لا داعي لفحص بقية اللوحات
    }
  } catch (e) {
    console.error('❌ handleStarboardReaction:', e.message);
  }
}

// ================== 9. الموزع الرئيسي ==================

async function handleStarboardInteraction(interaction) {
  const id = interaction.customId;
  const parts = id.split('_');
  const prefix = parts[0];

  if (prefix !== 'sb') return;

  try {
    // --- الأزرار التي تظهر مودال فوراً (بدون defer) ---
    if (id === 'sb_add') return handleStarboardButton(interaction, 'add');
    if (id.startsWith('sb_emoji_')) {
      const name = id.replace('sb_emoji_', '');
      return handlePanelButton(interaction, 'emoji', name);
    }
    if (id.startsWith('sb_customcolor_')) {
      const name = id.replace('sb_customcolor_', '');
      return handlePanelButton(interaction, 'customcolor', name);
    }
    if (id.startsWith('sb_thresh_')) {
      const name = id.replace('sb_thresh_', '');
      return handlePanelButton(interaction, 'thresh', name);
    }

    // --- أزرار تأكيد الحذف (تظهر مودال) ---
    if (id.startsWith('sb_del_yes_')) {
      const name = id.replace('sb_del_yes_', '');
      return handleDeleteConfirm(interaction, name);
    }

    // --- بقية الأزرار → deferUpdate ---
    await interaction.deferUpdate();

    if (id === 'sb_edit') return handleStarboardButton(interaction, 'edit');
    if (id === 'sb_delete') return handleStarboardButton(interaction, 'delete');
    if (id === 'sb_view') return handleStarboardButton(interaction, 'view');
    if (id === 'sb_back') return handleStarboardButton(interaction, 'back');

    // --- القوائم المنسدلة ---
    if (id.startsWith('sb_sel_') || id.startsWith('sb_readycolor_') || id.startsWith('sb_sel_source_') || id.startsWith('sb_sel_dest_')) {
      return handleStarboardSelect(interaction);
    }

    console.warn('⚠️ sb unknown id:', id);
  } catch (e) {
    console.error('❌ handleStarboardInteraction:', id, e.message);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '⚠️ خطأ غير متوقع.' });
      } else if (interaction.isRepliable()) {
        await interaction.reply({ content: '⚠️ خطأ غير متوقع.', ephemeral: true });
      }
    } catch {}
  }
}

module.exports = {
  handleStarboardMain,
  handleStarboardInteraction,
  handleStarboardModal,
  handleStarboardMessage,
  handleStarboardReaction
};

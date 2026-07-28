/**
 * featured.js - نظام المنشورات المميزة
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ChannelSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { version } = require('../utils/version');
const {
  getFeaturedConfig, saveFeaturedConfig,
  getFeaturedPost, markAsFeatured, addLike
} = require('../utils/featuredStorage');

// ========== لوحة الإعدادات ==========

async function handleFeaturedSettings(interaction) {
  try {
    const cfg = getFeaturedConfig();
    const embed = new EmbedBuilder()
      .setTitle('⭐ إعدادات المنشورات المميزة')
      .setColor(0xF1C40F)
      .setDescription('تحكم في نظام ترشيح المنشورات المميزة')
      .addFields(
        { name: '📥 روم المصدر (الاقتراحات)', value: cfg.sourceChannelId ? `<#${cfg.sourceChannelId}>` : '❌ غير محدد', inline: false },
        { name: '📤 روم الوجهة (المميزة)', value: cfg.destChannelId ? `<#${cfg.destChannelId}>` : '❌ غير محدد', inline: false },
        { name: '😀 الإيموجي المطلوب', value: cfg.emoji || '⭐', inline: true },
        { name: '🔢 العدد المطلوب للنقل', value: `${cfg.threshold || 5}`, inline: true },
      )
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('feat_source').setLabel('📥 روم المصدر').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('feat_dest').setLabel('📤 روم الوجهة').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('feat_emoji').setLabel('😀 تغيير الإيموجي').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('feat_threshold').setLabel('🔢 تغيير العدد').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('feat_refresh').setLabel('🔄 تحديث').setStyle(ButtonStyle.Secondary),
      ),
    ];

    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  } catch (e) {
    console.error('❌ featured settings:', e.message);
    return interaction.reply({ content: '⚠️ خطأ في عرض الإعدادات.', ephemeral: true }).catch(() => {});
  }
}

// ========== معالج أزرار الإعدادات ==========

async function handleFeaturedButton(interaction, action) {
  try {
    if (action === 'source' || action === 'dest') {
      // عرض ChannelSelectMenu لاختيار الروم
      const placeholder = action === 'source' ? '📥 اختر روم المصدر (الاقتراحات)' : '📤 اختر روم الوجهة (المميزة)';
      const customId = action === 'source' ? 'feat_ch_source' : 'feat_ch_dest';

      return interaction.reply({
        content: `اختر الروم المطلوب:`,
        components: [
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId(customId)
              .setPlaceholder(placeholder)
              .setMaxValues(1)
          )
        ],
        ephemeral: true
      });
    }

    if (action === 'emoji') {
      // مودال لإدخال الإيموجي
      const modal = new ModalBuilder()
        .setCustomId('modal_feat_emoji')
        .setTitle('😀 تغيير الإيموجي المطلوب');

      const input = new TextInputBuilder()
        .setCustomId('feat_emoji_input')
        .setLabel('الإيموجي')
        .setPlaceholder('مثال: ⭐ أو 👍')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (action === 'threshold') {
      // مودال لإدخال العدد
      const cfg = getFeaturedConfig();
      const modal = new ModalBuilder()
        .setCustomId('modal_feat_threshold')
        .setTitle('🔢 العدد المطلوب للنقل');

      const input = new TextInputBuilder()
        .setCustomId('feat_threshold_input')
        .setLabel('العدد المطلوب من الإيموجي')
        .setPlaceholder('مثال: 5')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(5);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (action === 'refresh') {
      return handleFeaturedSettings(interaction);
    }
  } catch (e) {
    console.error('❌ featured button:', e.message);
    try { await interaction.reply({ content: '⚠️ خطأ.', ephemeral: true }); } catch {}
  }
}

// ========== معالج اختيار الروم ==========

async function handleFeaturedChannelSelect(interaction, field) {
  try {
    const channelId = interaction.values[0];
    const cfg = getFeaturedConfig();

    if (field === 'source') {
      cfg.sourceChannelId = channelId;
    } else if (field === 'dest') {
      cfg.destChannelId = channelId;
    }
    saveFeaturedConfig(cfg);

    // تعديل صلاحيات الروم لمنع @everyone من إضافة تفاعلات
    try {
      const channel = await interaction.guild.channels.fetch(channelId);
      if (channel) {
        await channel.permissionOverwrites.edit(interaction.guild.id, {
          AddReactions: false
        }).catch(() => {});
      }
    } catch {}

    await interaction.deferUpdate();
    return handleFeaturedSettings(interaction);
  } catch (e) {
    console.error('❌ featured channel select:', e.message);
    try { await interaction.reply({ content: '⚠️ خطأ.', ephemeral: true }); } catch {}
  }
}

// ========== معالج المودال ==========

async function handleFeaturedModal(interaction) {
  try {
    const customId = interaction.customId;

    if (customId === 'modal_feat_emoji') {
      const emoji = interaction.fields.getTextInputValue('feat_emoji_input').trim();
      if (!emoji) {
        return interaction.reply({ content: '❌ الإيموجي مطلوب.', ephemeral: true });
      }
      const cfg = getFeaturedConfig();
      cfg.emoji = emoji;
      saveFeaturedConfig(cfg);
      await interaction.deferUpdate();
      return handleFeaturedSettings(interaction);
    }

    if (customId === 'modal_feat_threshold') {
      const threshold = parseInt(interaction.fields.getTextInputValue('feat_threshold_input'), 10);
      if (isNaN(threshold) || threshold < 1) {
        return interaction.reply({ content: '❌ الرجاء إدخال رقم صحيح أكبر من 0.', ephemeral: true });
      }
      const cfg = getFeaturedConfig();
      cfg.threshold = threshold;
      saveFeaturedConfig(cfg);
      await interaction.deferUpdate();
      return handleFeaturedSettings(interaction);
    }
  } catch (e) {
    console.error('❌ featured modal:', e.message);
    try { await interaction.reply({ content: '⚠️ خطأ.', ephemeral: true }); } catch {}
  }
}

// ========== معالج الرسائل الجديدة ==========

async function handleFeaturedMessage(message) {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const cfg = getFeaturedConfig();
    if (!cfg.sourceChannelId || !cfg.emoji) return;
    if (message.channel.id !== cfg.sourceChannelId) return;

    // وضع الإيموجي المطلوب تلقائياً
    await message.react(cfg.emoji).catch(() => {});
  } catch (e) {
    console.error('❌ featured message:', e.message);
  }
}

// ========== معالج إضافة التفاعل ==========

async function handleFeaturedReaction(reaction, user) {
  try {
    if (user.bot) return;
    if (!reaction.message.guild) return;

    const cfg = getFeaturedConfig();
    if (!cfg.sourceChannelId || !cfg.emoji) return;
    if (reaction.message.channel.id !== cfg.sourceChannelId) return;

    // إذا أضاف إيموجي مختلف عن المطلوب، احذفه
    if (reaction.emoji.name !== cfg.emoji && (!reaction.emoji.id || reaction.emoji.toString() !== cfg.emoji)) {
      try {
        await reaction.users.remove(user.id);
      } catch {}
      return;
    }

    // إذا وصل العداد إلى الحد المطلوب
    const count = reaction.count;
    if (count >= cfg.threshold) {
      const message = reaction.message;

      // تأكد أن الرسالة لم تُنقل مسبقاً
      const existing = getFeaturedPost(message.id);
      if (existing && existing.featured) return;

      // تأكد من وجود روم الوجهة
      if (!cfg.destChannelId) return;
      const destChannel = await message.guild.channels.fetch(cfg.destChannelId).catch(() => null);
      if (!destChannel) return;

      // بناء الإيمبد
      const content = message.content || '(محتوى غير نصي)';
      const featuredEmbed = new EmbedBuilder()
        .setTitle('⭐ منشور مميز')
        .setColor(0xF1C40F)
        .setDescription(content)
        .addFields(
          { name: '👤 مقدّم الاقتراح', value: `${message.author}`, inline: true },
          { name: '🔗 الرابط', value: `[انتقل إلى الرسالة الأصلية](${message.url})`, inline: true },
        )
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setFooter({ text: `⭐ تم التمييز تلقائياً` })
        .setTimestamp();

      if (message.attachments.size > 0) {
        const first = message.attachments.first();
        if (first.contentType && first.contentType.startsWith('image/')) {
          featuredEmbed.setImage(first.url);
        }
      }

      // زر ✅ إعجاب (بدون زر ❌)
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`feat_like_${message.id}`)
          .setEmoji('✅')
          .setLabel('إعجاب')
          .setStyle(ButtonStyle.Success)
      );

      const sentMsg = await destChannel.send({ embeds: [featuredEmbed], components: [row] });

      // حفظ في قاعدة البيانات
      markAsFeatured(message.id, message.author.id, content, message.url);
    }
  } catch (e) {
    console.error('❌ featured reaction:', e.message);
  }
}

// ========== معالج زر ✅ الإعجاب ==========

async function handleFeaturedLike(interaction, messageId) {
  try {
    await interaction.deferUpdate();

    const post = getFeaturedPost(messageId);
    if (!post) {
      return interaction.editReply({ content: '⚠️ هذا المنشور غير مسجل في النظام.', embeds: [], components: [] });
    }

    // حفظ الإعجاب في قاعدة البيانات
    addLike(messageId, interaction.user.id);

    // تحديث الإيمبد بعدد الإعجابات
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    const likes = post.likes ? post.likes.length : 0;
    embed.setFooter({ text: `⭐ تم التمييز تلقائياً | ✅ ${likes} إعجاب` });

    await interaction.editReply({ embeds: [embed], components: interaction.message.components });
  } catch (e) {
    console.error('❌ featured like:', e.message);
    try { await interaction.editReply({ content: '⚠️ خطأ.', embeds: [], components: [] }); } catch {}
  }
}

// ========== الموزع الرئيسي ==========

async function handleFeaturedInteraction(interaction) {
  const id = interaction.customId;
  const parts = id.split('_');
  const prefix = parts[0];

  if (prefix !== 'feat') return;

  if (id === 'feat_source' || id === 'feat_dest' || id === 'feat_emoji' || id === 'feat_threshold' || id === 'feat_refresh') {
    const action = parts[1];
    return handleFeaturedButton(interaction, action);
  }

  if (id.startsWith('feat_ch_source')) {
    return handleFeaturedChannelSelect(interaction, 'source');
  }
  if (id.startsWith('feat_ch_dest')) {
    return handleFeaturedChannelSelect(interaction, 'dest');
  }

  if (id.startsWith('feat_like_')) {
    const messageId = id.replace('feat_like_', '');
    return handleFeaturedLike(interaction, messageId);
  }
}

module.exports = {
  handleFeaturedSettings,
  handleFeaturedInteraction,
  handleFeaturedModal,
  handleFeaturedMessage,
  handleFeaturedReaction,
  handleFeaturedLike
};

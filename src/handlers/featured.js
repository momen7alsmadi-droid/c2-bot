/**
 * featured.js - ⭐ نظام الاقتراحات المميزة
 * يتبع نفس نمط لوحات الإعدادات (settings.js) في التصميم والتعامل مع القوائم
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ChannelSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType
} = require('discord.js');
const { version } = require('../utils/version');
const {
  getFeaturedConfig, saveFeaturedConfig,
  getFeaturedPost, markAsFeatured, addLike
} = require('../utils/featuredStorage');

// ---------- دالة مساعدة: تحديث أو رد حسب حالة الـ interaction ----------
async function respondOrUpdate(interaction, payload) {
  if (interaction.deferred) {
    return interaction.editReply(payload).catch(() => {});
  }
  if (interaction.isCommand() || interaction.isModalSubmit()) {
    return interaction.reply({ ...payload, ephemeral: true });
  }
  if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
    return interaction.update(payload);
  }
  return interaction.editReply(payload).catch(() => interaction.reply({ ...payload, ephemeral: true }).catch(() => {}));
}

// ---------- عرض لوحة الإعدادات ----------
async function showFeaturedSettings(interaction) {
  try {
    const cfg = getFeaturedConfig();
    const embed = new EmbedBuilder()
      .setTitle('⭐ إعدادات نظام الاقتراحات')
      .setColor(0xF1C40F)
      .setDescription('تحكم في نظام ترشيح الاقتراحات المميزة')
      .addFields(
        { name: '📥 روم المصدر (الاقتراحات)', value: cfg.sourceChannelId ? `<#${cfg.sourceChannelId}>` : '❌ غير محدد', inline: false },
        { name: '📤 روم الوجهة (المميزة)', value: cfg.destChannelId ? `<#${cfg.destChannelId}>` : '❌ غير محدد', inline: false },
        { name: '😀 الإيموجي المطلوب', value: cfg.emoji || '⭐', inline: true },
        { name: '🔢 العدد المطلوب للنقل', value: `${cfg.threshold || 5}`, inline: true },
      )
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    const components = [
      // كل خيار في صف مستقل مثل نمط settings.js
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('feat_sel_source')
          .setPlaceholder('📥 روم المصدر (الاقتراحات)')
          .setMaxValues(1)
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('feat_sel_dest')
          .setPlaceholder('📤 روم الوجهة (المميزة)')
          .setMaxValues(1)
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('feat_emoji').setLabel('😀 الإيموجي المطلوب ⏵').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('feat_thresh').setLabel('🔢 العدد المطلوب ⏵').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('feat_refresh').setLabel('🔄 تحديث').setStyle(ButtonStyle.Primary),
      ),
    ];

    return respondOrUpdate(interaction, { embeds: [embed], components });
  } catch (e) {
    console.error('❌ showFeaturedSettings:', e.message);
    return respondOrUpdate(interaction, { content: '⚠️ خطأ في عرض الإعدادات.' });
  }
}

// ---------- معالج أزرار الإعدادات (إيموجي + عدد + تحديث) ----------
async function handleFeaturedButton(interaction, action) {
  try {
    if (action === 'emoji' || action === 'thresh') {
      const isEmoji = action === 'emoji';
      const modal = new ModalBuilder()
        .setCustomId(isEmoji ? 'modal_feat_emoji' : 'modal_feat_threshold')
        .setTitle(isEmoji ? '😀 تغيير الإيموجي المطلوب' : '🔢 العدد المطلوب للنقل');

      const input = new TextInputBuilder()
        .setCustomId(isEmoji ? 'feat_emoji_val' : 'feat_threshold_val')
        .setLabel(isEmoji ? 'الإيموجي' : 'العدد (رقم صحيح)')
        .setPlaceholder(isEmoji ? 'مثال: ⭐' : 'مثال: 5')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(isEmoji ? 10 : 5);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (action === 'refresh') {
      return showFeaturedSettings(interaction);
    }
  } catch (e) {
    console.error('========== ❌ handleFeaturedButton ==========');
    console.error('Action:', action);
    console.error('Message:', e.message);
    console.error('Stack:', e.stack);
    console.error('=============================================');
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '⚠️ خطأ.', components: [] });
      } else {
        await interaction.reply({ content: '⚠️ خطأ.', ephemeral: true });
      }
    } catch {}
  }
}

// ---------- معالج القوائم المنسدلة (اختيار الروم) ----------
async function handleFeaturedSelect(interaction) {
  try {
    await interaction.deferUpdate();

    const field = interaction.customId.replace('feat_sel_', '');
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
    } catch (e) {
      console.error('❌ feat permission edit:', e.message);
    }

    // العودة للوحة الإعدادات
    return showFeaturedSettings(interaction);
  } catch (e) {
    console.error('========== ❌ handleFeaturedSelect ==========');
    console.error('customId:', interaction.customId);
    console.error('Message:', e.message);
    console.error('Stack:', e.stack);
    console.error('=============================================');
    return showFeaturedSettings(interaction);
  }
}

// ---------- معالج المودال ----------
async function handleFeaturedModal(interaction) {
  try {
    const customId = interaction.customId;

    if (customId === 'modal_feat_emoji') {
      const emoji = interaction.fields.getTextInputValue('feat_emoji_val').trim();
      if (!emoji) {
        return interaction.reply({ content: '❌ الإيموجي مطلوب.', ephemeral: true });
      }
      const cfg = getFeaturedConfig();
      cfg.emoji = emoji;
      saveFeaturedConfig(cfg);
      return showFeaturedSettings(interaction);
    }

    if (customId === 'modal_feat_threshold') {
      const threshold = parseInt(interaction.fields.getTextInputValue('feat_threshold_val'), 10);
      if (isNaN(threshold) || threshold < 1) {
        return interaction.reply({ content: '❌ الرجاء إدخال رقم صحيح أكبر من 0.', ephemeral: true });
      }
      const cfg = getFeaturedConfig();
      cfg.threshold = threshold;
      saveFeaturedConfig(cfg);
      return showFeaturedSettings(interaction);
    }
  } catch (e) {
    console.error('========== ❌ handleFeaturedModal ==========');
    console.error('customId:', interaction.customId);
    console.error('Message:', e.message);
    console.error('Stack:', e.stack);
    console.error('=============================================');
    try {
      return interaction.editReply({ content: '⚠️ خطأ في معالجة الإدخال.' });
    } catch {
      return interaction.reply({ content: '⚠️ خطأ في معالجة الإدخال.', ephemeral: true });
    }
  }
}

// ---------- معالج الرسائل الجديدة (وضع الإيموجي تلقائياً) ----------
async function handleFeaturedMessage(message) {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const cfg = getFeaturedConfig();
    if (!cfg.sourceChannelId || !cfg.emoji) return;
    if (message.channel.id !== cfg.sourceChannelId) return;

    await message.react(cfg.emoji).catch(() => {});
  } catch (e) {
    console.error('❌ handleFeaturedMessage:', e.message);
  }
}

// ---------- معالج إضافة التفاعل ----------
async function handleFeaturedReaction(reaction, user) {
  try {
    if (user.bot) return;
    if (!reaction.message.guild) return;

    const cfg = getFeaturedConfig();
    if (!cfg.sourceChannelId || !cfg.emoji) return;
    if (reaction.message.channel.id !== cfg.sourceChannelId) return;

    // إن أضاف إيموجي مختلف عن المطلوب → احذفه
    const emojiStr = reaction.emoji.id ? reaction.emoji.toString() : reaction.emoji.name;
    if (emojiStr !== cfg.emoji) {
      try {
        await reaction.users.remove(user.id);
      } catch {}
      return;
    }

    // تحقق من العدد
    const count = reaction.count;
    if (count < cfg.threshold) return;
    if (!cfg.destChannelId) return;

    const message = reaction.message;

    // تأكد أن الرسالة لم تُنقل مسبقاً
    const existing = getFeaturedPost(message.id);
    if (existing && existing.featured) return;

    // جهز روم الوجهة
    const destChannel = await message.guild.channels.fetch(cfg.destChannelId).catch(() => null);
    if (!destChannel) return;

    // بناء الإيمبد (فخم)
    const content = message.content || '*(محتوى غير نصي)*';
    const featuredEmbed = new EmbedBuilder()
      .setTitle('⭐ اقتراح مميز')
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

    // زر ✅ إعجاب فقط (بدون ❌)
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
  } catch (e) {
    console.error('❌ handleFeaturedReaction:', e.message);
  }
}

// ---------- معالج زر ✅ الإعجاب ----------
async function handleFeaturedLike(interaction, messageId) {
  try {
    await interaction.deferUpdate();

    const post = getFeaturedPost(messageId);
    if (!post) {
      return interaction.editReply({ content: '⚠️ هذا المنشور غير مسجل في النظام.', embeds: [], components: [] });
    }

    addLike(messageId, interaction.user.id);

    // تحديث الإيمبد بعدد الإعجابات
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    const likes = post.likes ? post.likes.length : 0;
    embed.setFooter({ text: `⭐ تم التمييز تلقائياً | ✅ ${likes} إعجاب` });

    await interaction.editReply({ embeds: [embed], components: interaction.message.components });
  } catch (e) {
    console.error('❌ handleFeaturedLike:', e.message);
    try { await interaction.editReply({ content: '⚠️ خطأ.', embeds: [], components: [] }); } catch {}
  }
}

// ========== الموزع الرئيسي ==========

async function handleFeaturedInteraction(interaction) {
  try {
    const id = interaction.customId;
    const parts = id.split('_');
    const prefix = parts[0];

    if (prefix !== 'feat') return;

    // أزرار الإعدادات (إيموجي، عدد، تحديث)
    if (id === 'feat_emoji' || id === 'feat_thresh' || id === 'feat_refresh') {
      const action = parts[1];
      return handleFeaturedButton(interaction, action);
    }

    // قوائم اختيار الروم (مصدر، وجهة) ← باترون settings.js
    if (id.startsWith('feat_sel_')) {
      return handleFeaturedSelect(interaction);
    }

    // زر ✅ الإعجاب
    if (id.startsWith('feat_like_')) {
      const messageId = id.replace('feat_like_', '');
      return handleFeaturedLike(interaction, messageId);
    }

    console.warn('⚠️ feat unknown id:', id);
  } catch (e) {
    console.error('========== ❌ handleFeaturedInteraction ==========');
    console.error('customId:', interaction.customId);
    console.error('Message:', e.message);
    console.error('Stack:', e.stack);
    console.error('=============================================');
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '⚠️ خطأ غير متوقع.' });
      } else {
        await interaction.reply({ content: '⚠️ خطأ غير متوقع.', ephemeral: true });
      }
    } catch {}
  }
}

module.exports = {
  showFeaturedSettings,
  handleFeaturedInteraction,
  handleFeaturedModal,
  handleFeaturedMessage,
  handleFeaturedReaction
};

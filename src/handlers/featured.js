/**
 * featured.js - ⭐ نظام الاقتراحات المميزة
 * يتبع نفس نمط لوحات الإعدادات (settings.js) في التصميم والتعامل مع القوائم
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ChannelSelectMenuBuilder, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType
} = require('discord.js');
const { version } = require('../utils/version');
const {
  getFeaturedConfig, saveFeaturedConfig
} = require('../utils/featuredStorage');
const { COLORS } = require('../utils/colors');

// ---------- دالة مساعدة: تحويل hex (#RRGGBB) إلى integer لـ discord.js ----------
function hexToInt(hex) {
  return parseInt((hex || '#F1C40F').replace('#', ''), 16) || 0xF1C40F;
}

// ---------- دالة مساعدة: تحديث أو رد حسب حالة الـ interaction ----------
async function respondOrUpdate(interaction, payload) {
  if (interaction.deferred) {
    return interaction.editReply(payload);
  }
  if (interaction.isCommand() || interaction.isModalSubmit()) {
    return interaction.reply({ ...payload, ephemeral: true });
  }
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferUpdate().catch(() => {});
  }
  return interaction.editReply(payload);
}

// ---------- عرض لوحة الإعدادات ----------
async function showFeaturedSettings(interaction) {
  try {
    const cfg = getFeaturedConfig();
    const currentColorHex = cfg.embedColor || '#F1C40F';
    const currentColorName = COLORS.find(c => c.value === currentColorHex)?.name || 'ذهبي (Gold)';
    const embedColorInt = hexToInt(currentColorHex);

    const embed = new EmbedBuilder()
      .setTitle('⭐ إعدادات نظام الاقتراحات')
      .setColor(embedColorInt)
      .setDescription('تحكم في نظام ترشيح الاقتراحات المميزة')
      .addFields(
        { name: '📥 روم المصدر (الاقتراحات)', value: cfg.sourceChannelId ? `<#${cfg.sourceChannelId}>` : '❌ غير محدد', inline: false },
        { name: '📤 روم الوجهة (المميزة)', value: cfg.destChannelId ? `<#${cfg.destChannelId}>` : '❌ غير محدد', inline: false },
        { name: '😀 الإيموجي المطلوب', value: cfg.emoji || '⭐', inline: true },
        { name: '🔢 العدد المطلوب للنقل', value: `${cfg.threshold || 5}`, inline: true },
        { name: '🎨 لون الإيمبد', value: currentColorName, inline: true },
      )
      .setFooter({ text: `الإصدار: ${version}` })
      .setTimestamp();

    // قائمة الألوان الجاهزة (أول 25 لون)
    const readyColorOptions = COLORS.slice(0, 25).map(c => ({
      label: c.name,
      value: c.value,
      default: c.value === currentColorHex
    }));

    const components = [
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
        new ButtonBuilder().setCustomId('feat_custom_color').setLabel('لون مخصص 🎨').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('feat_thresh').setLabel('🔢 العدد المطلوب ⏵').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('feat_readycolor')
          .setPlaceholder('🎨 ألوان جاهزة')
          .addOptions(readyColorOptions)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('feat_refresh').setLabel('🔄 تحديث').setStyle(ButtonStyle.Primary),
      ),
    ];

    return respondOrUpdate(interaction, { embeds: [embed], components });
  } catch (e) {
    console.error('❌ showFeaturedSettings:', e.message);
    return respondOrUpdate(interaction, { content: '⚠️ خطأ في عرض الإعدادات.' });
  }
}

// ---------- معالج أزرار الإعدادات (إيموجي + عدد + لون + تحديث) ----------
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

    if (action === 'custom_color') {
      const modal = new ModalBuilder()
        .setCustomId('modal_feat_custom_color')
        .setTitle('🎨 لون مخصص');

      const input = new TextInputBuilder()
        .setCustomId('feat_custom_color_val')
        .setLabel('أدخل رمز اللون السداسي (Hex Code)')
        .setPlaceholder('#3B82F6')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(4)
        .setMaxLength(7);

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

    const id = interaction.customId;
    const cfg = getFeaturedConfig();

    // قائمة الألوان الجاهزة
    if (id === 'feat_readycolor') {
      cfg.embedColor = interaction.values[0];
      saveFeaturedConfig(cfg);
      return showFeaturedSettings(interaction);
    }

    // قوائم اختيار الروم (feat_sel_source / feat_sel_dest)
    const field = id.replace('feat_sel_', '');
    const channelId = interaction.values[0];

    if (field === 'source') {
      cfg.sourceChannelId = channelId;
    } else if (field === 'dest') {
      cfg.destChannelId = channelId;
    }
    saveFeaturedConfig(cfg);

    // تعديل صلاحيات الروم لمنع @everyone من إضافة تفاعلات
    if (field === 'source' || field === 'dest') {
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

    if (customId === 'modal_feat_custom_color') {
      try {
        await interaction.deferUpdate();
        const hex = interaction.fields.getTextInputValue('feat_custom_color_val').trim();
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          return interaction.editReply({ content: '❌ رمز اللون غير صالح. استخدم صيغة Hex مكونة من 6 أرقام/حروف، مثال: #FF0000', components: [] });
        }
        const cfg = getFeaturedConfig();
        cfg.embedColor = hex.toUpperCase();
        saveFeaturedConfig(cfg);
        return showFeaturedSettings(interaction);
      } catch (e) {
        console.error('[Modal:FeatCustomColor]', e);
        try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch(_) {}
      }
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
    console.log('👀 handleFeaturedMessage:', message.id, 'channel:', message.channel?.id, 'type:', message.channel?.type, 'author:', message.author?.tag);

    if (message.author.bot) {
      console.log('⏭️ رسالة بوت، تجاهل');
      return;
    }
    if (!message.guild) {
      console.log('⏭️ ليست في سيرفر، تجاهل');
      return;
    }

    const cfg = getFeaturedConfig();
    console.log('📋 featuredConfig:', JSON.stringify(cfg));

    if (!cfg.sourceChannelId) {
      console.log('⏭️ لم يتم تحديد روم المصدر بعد');
      return;
    }
    if (!cfg.emoji) {
      console.log('⏭️ لم يتم تحديد الإيموجي بعد');
      return;
    }

    // ===== دعم رومات الفورم (Forum Channels) =====
    // في الفورم، كل منشور هو Thread. message.channel هو ID الـ Thread
    // نحتاج لمقارنة parentId (روم الفورم الأصلي) بـ sourceChannelId
    const isThread = message.channel.isThread?.();
    const actualChannelId = isThread ? message.channel.parentId : message.channel.id;
    const isStarterMessage = isThread ? (message.id === message.channel.id) : true;

    console.log('🔍 isThread:', isThread, '| parentId:', isThread ? message.channel.parentId : '-', '| actualChannelId:', actualChannelId);
    console.log('🔍 مقارنة:', actualChannelId, '===', cfg.sourceChannelId, '?', actualChannelId === cfg.sourceChannelId);

    if (actualChannelId !== cfg.sourceChannelId) {
      console.log('⏭️ الروم الحالي ليس روم المصدر');
      return;
    }

    // إذا كان Thread (فورم)، نضيف التفاعل فقط لرسالة البداية (starter message)
    // message.id === message.channel.id هي رسالة البداية للـ Thread
    if (!isStarterMessage) {
      console.log('⏭️ هذه رد داخل منشور فورم، وليست رسالة البداية - نتجاهل');
      return;
    }

    console.log('✅ الروم يطابق روم المصدر، نحاول إضافة التفاعل', cfg.emoji);
    try {
      await message.react(cfg.emoji);
      console.log('✅ تم إضافة', cfg.emoji, 'تلقائياً على رسالة', message.id);
    } catch (reactErr) {
      console.error('❌ فشل إضافة التفاعل التلقائي:', cfg.emoji, '| خطأ:', reactErr.message);
      if (reactErr.code === 50013) {
        console.error('⚠️ البوت لا يملك صلاحية AddReactions في هذا الروم!');
      }
    }
  } catch (e) {
    console.error('❌ handleFeaturedMessage:', e.message);
  }
}

// ---------- معالج إضافة التفاعل ----------
async function handleFeaturedReaction(reaction, user) {
  try {
    console.log('👀 handleFeaturedReaction:', reaction.emoji?.name, 'من', user.tag, 'على رسالة', reaction.message?.id);

    if (user.bot) {
      console.log('⏭️ تفاعل بوت، تجاهل');
      return;
    }
    if (!reaction.message.guild) {
      console.log('⏭️ ليست في سيرفر، تجاهل');
      return;
    }

    const cfg = getFeaturedConfig();
    console.log('📋 featuredConfig:', JSON.stringify(cfg));

    if (!cfg.sourceChannelId) {
      console.log('⏭️ لم يتم تحديد روم المصدر بعد');
      return;
    }
    if (!cfg.emoji) {
      console.log('⏭️ لم يتم تحديد الإيموجي بعد');
      return;
    }

    // ===== دعم رومات الفورم (Forum Channels) =====
    const channel = reaction.message.channel;
    const isThread = channel.isThread?.();
    const actualChannelId = isThread ? channel.parentId : channel.id;

    console.log('🔍 isThread:', isThread, '| parentId:', isThread ? channel.parentId : '-', '| actualChannelId:', actualChannelId);
    console.log('🔍 مقارنة الروم:', actualChannelId, '===', cfg.sourceChannelId, '?', actualChannelId === cfg.sourceChannelId);

    if (actualChannelId !== cfg.sourceChannelId) {
      console.log('⏭️ الروم الحالي ليس روم المصدر');
      return;
    }

    // إن أضاف إيموجي مختلف عن المطلوب → احذفه
    const emojiStr = reaction.emoji.id ? reaction.emoji.toString() : reaction.emoji.name;
    console.log('🔍 مقارنة الإيموجي:', emojiStr, '===', cfg.emoji, '?', emojiStr === cfg.emoji);

    if (emojiStr !== cfg.emoji) {
      console.log('🗑️ نحاول حذف', emojiStr, 'للمستخدم', user.tag);
      try {
        await reaction.users.remove(user.id);
        console.log('✅ تم حذف', emojiStr, '(غير مصرح) من رسالة', reaction.message.id);
      } catch (err) {
        console.error('❌ فشل حذف التفاعل غير المصرح:', emojiStr, '| خطأ:', err.message);
        if (err.code === 50013) {
          console.error('⚠️ البوت لا يملك صلاحية ManageMessages!');
        }
      }
      return;
    }

    // ===== حساب عدد المستخدمين الحقيقيين (بدون البوت) =====
    const reactedUsers = await reaction.users.fetch();
    const realUserCount = reactedUsers.filter(u => !u.bot).size;
    console.log('📊 عدد المستخدمين الحقيقيين:', realUserCount, '(المطلوب:', cfg.threshold, ')');
    console.log('   (reaction.count الكلي:', reaction.count, ')');

    if (realUserCount < cfg.threshold) {
      console.log('⏭️ لم يصل للعدد المطلوب بعد');
      return;
    }

    if (!cfg.destChannelId) {
      console.log('⏭️ لم يتم تحديد روم الوجهة بعد');
      return;
    }

    const message = reaction.message;

    console.log('✅ العدد كافٍ! ننقل الرسالة', message.id, 'إلى روم الوجهة');

    // جهز روم الوجهة
    const destChannel = await message.guild.channels.fetch(cfg.destChannelId).catch((err) => {
      console.error('❌ فشل جلب روم الوجهة:', err.message);
      return null;
    });
    if (!destChannel) {
      console.error('❌ روم الوجهة غير موجود');
      return;
    }

    // ===== شكل الإيمبد (نمط Dyno Starboard) =====
    const descContent = message.content || '';
    const emoji = cfg.emoji || '⭐';

    // ===== تشخيص: طباعة القيمة قبل بناء الرابط =====
    console.log('\n========== 🔍 تشخيص ID المنشن ==========');
    console.log('📌 message.channel.id         :', message.channel?.id);
    console.log('📌 message.channel.parentId   :', message.channel?.parentId);
    console.log('📌 هل هما متساويان؟            :', message.channel?.id === message.channel?.parentId);
    console.log('==========================================\n');

    // نستخدم message.channel.id فقط (لا parent ولا إعدادات)
    // message هنا هي الرسالة الأصلية في روم المصدر (reaction.message)
    const threadId = message.channel?.id;
    console.log('✅ قيمة threadId المُستخدمة:', threadId);
    const mentionLink = `<#${threadId}>`;
    const topLine = `${realUserCount} ${emoji} | ${mentionLink}`;

    const embedColorHex = cfg.embedColor || '#F1C40F';
    const embedColorInt = hexToInt(embedColorHex);

    const featuredEmbed = new EmbedBuilder()
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setDescription(`${descContent}\n👤 ${message.author}\n\n[📎 اضغط للانتقال إلى الرسالة الأصلية](${message.url})`)
      .setColor(embedColorInt)
      .setTimestamp();

    if (message.attachments.size > 0) {
      const first = message.attachments.first();
      if (first.contentType && first.contentType.startsWith('image/')) {
        featuredEmbed.setImage(first.url);
      }
    }

    // إرسال: content (السطر العلوي) + embed (بدون title/url)
    try {
      const sentMsg = await destChannel.send({ content: topLine, embeds: [featuredEmbed] });
      console.log('✅ تم إرسال الاقتراح المميز إلى', destChannel.name, 'مع messageId:', sentMsg.id);

      // إضافة تفاعل تلقائي على الرسالة المنقولة بنفس الإيموجي
      await sentMsg.react(emoji).catch(err => {
        console.error('❌ فشل إضافة التفاعل على الرسالة المنقولة:', err.message);
      });
      console.log('✅ تم إضافة', emoji, 'على الرسالة المنقولة', sentMsg.id);
    } catch (sendErr) {
      console.error('❌ فشل إرسال/تفاعل الرسالة إلى روم الوجهة:', sendErr.message);
      return;
    }
  } catch (e) {
    console.error('❌ handleFeaturedReaction:', e.message);
    console.error('Stack:', e.stack);
  }
}

// ========== الموزع الرئيسي ==========

async function handleFeaturedInteraction(interaction) {
  try {
    const id = interaction.customId;
    const parts = id.split('_');
    const prefix = parts[0];

    if (prefix !== 'feat') return;

    // أزرار الإعدادات (إيموجي، عدد، لون مخصص، تحديث)
    if (id === 'feat_emoji') return handleFeaturedButton(interaction, 'emoji');
    if (id === 'feat_custom_color') return handleFeaturedButton(interaction, 'custom_color');
    if (id === 'feat_thresh') return handleFeaturedButton(interaction, 'thresh');
    if (id === 'feat_refresh') return handleFeaturedButton(interaction, 'refresh');

    // قوائم اختيار الروم (مصدر، وجهة) ← باترون settings.js
    if (id.startsWith('feat_sel_')) {
      return handleFeaturedSelect(interaction);
    }

    // قائمة الألوان الجاهزة
    if (id === 'feat_readycolor') {
      return handleFeaturedSelect(interaction);
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

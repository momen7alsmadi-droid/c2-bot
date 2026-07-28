/**
 * starboard.js - ⭐ نظام لوحة النجوم (Starboard)
 * نفس كود نظام الاقتراحات القديم مع تغيير الأسماء
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ChannelSelectMenuBuilder, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType
} = require('discord.js');
const { version } = require('../utils/version');
const {
  getStarboardConfig, saveStarboardConfig
} = require('../utils/starboardStorage');
const { COLORS } = require('../utils/colors');

function hexToInt(hex) {
  return parseInt((hex || '#F1C40F').replace('#', ''), 16) || 0xF1C40F;
}

async function respondOrUpdate(interaction, payload) {
  if (interaction.deferred) return interaction.editReply(payload).catch(() => {});
  if (interaction.isCommand() || interaction.isModalSubmit()) return interaction.reply({ ...payload, ephemeral: true });
  if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) return interaction.update(payload);
  return interaction.editReply(payload).catch(() => interaction.reply({ ...payload, ephemeral: true }).catch(() => {}));
}

// ---------- عرض لوحة الإعدادات ----------
async function showStarboardSettings(interaction) {
  try {
    const cfg = getStarboardConfig();
    const currentColorHex = cfg.embedColor || '#F1C40F';
    const currentColorName = COLORS.find(c => c.value === currentColorHex)?.name || 'ذهبي (Gold)';
    const embedColorInt = hexToInt(currentColorHex);

    const embed = new EmbedBuilder()
      .setTitle('⭐ لوحة النجوم')
      .setColor(embedColorInt)
      .setDescription('تحكم في إعدادات لوحة النجوم')
      .addFields(
        { name: '📥 روم المصدر', value: cfg.sourceChannelId ? `<#${cfg.sourceChannelId}>` : '❌ غير محدد', inline: false },
        { name: '📤 روم الوجهة', value: cfg.destChannelId ? `<#${cfg.destChannelId}>` : '❌ غير محدد', inline: false },
        { name: '😀 الإيموجي المطلوب', value: cfg.emoji || '⭐', inline: true },
        { name: '🔢 العدد المطلوب للنقل', value: `${cfg.threshold || 5}`, inline: true },
        { name: '🎨 لون الإيمبد', value: currentColorName, inline: true },
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
          .setCustomId('sb_sel_source')
          .setPlaceholder('📥 روم المصدر')
          .setMaxValues(1)
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('sb_sel_dest')
          .setPlaceholder('📤 روم الوجهة')
          .setMaxValues(1)
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sb_emoji').setLabel('😀 الإيموجي المطلوب ⏵').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('sb_custom_color').setLabel('لون مخصص 🎨').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('sb_thresh').setLabel('🔢 العدد المطلوب ⏵').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('sb_readycolor')
          .setPlaceholder('🎨 ألوان جاهزة')
          .addOptions(readyColorOptions)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sb_refresh').setLabel('🔄 تحديث').setStyle(ButtonStyle.Primary),
      ),
    ];

    return respondOrUpdate(interaction, { embeds: [embed], components });
  } catch (e) {
    console.error('❌ showStarboardSettings:', e.message);
    return respondOrUpdate(interaction, { content: '⚠️ خطأ في عرض الإعدادات.' });
  }
}

// ---------- معالج الأزرار ----------
async function handleStarboardButton(interaction, action) {
  try {
    if (action === 'emoji' || action === 'thresh') {
      const isEmoji = action === 'emoji';
      const modal = new ModalBuilder()
        .setCustomId(isEmoji ? 'modal_sb_emoji' : 'modal_sb_threshold')
        .setTitle(isEmoji ? '😀 تغيير الإيموجي المطلوب' : '🔢 العدد المطلوب للنقل');

      const input = new TextInputBuilder()
        .setCustomId(isEmoji ? 'sb_emoji_val' : 'sb_threshold_val')
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
        .setCustomId('modal_sb_custom_color')
        .setTitle('🎨 لون مخصص');

      const input = new TextInputBuilder()
        .setCustomId('sb_custom_color_val')
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
      return showStarboardSettings(interaction);
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

// ---------- معالج القوائم المنسدلة ----------
async function handleStarboardSelect(interaction) {
  try {
    await interaction.deferUpdate();

    const id = interaction.customId;
    const cfg = getStarboardConfig();

    if (id === 'sb_readycolor') {
      cfg.embedColor = interaction.values[0];
      saveStarboardConfig(cfg);
      return showStarboardSettings(interaction);
    }

    const field = id.replace('sb_sel_', '');

    if (field === 'source' || field === 'dest') {
      const channelId = interaction.values[0];
      if (field === 'source') cfg.sourceChannelId = channelId;
      else if (field === 'dest') cfg.destChannelId = channelId;
      saveStarboardConfig(cfg);

      try {
        const channel = await interaction.guild.channels.fetch(channelId);
        if (channel) {
          await channel.permissionOverwrites.edit(interaction.guild.id, { AddReactions: false }).catch(() => {});
        }
      } catch (e) {
        console.error('❌ sb permission edit:', e.message);
      }
    }

    return showStarboardSettings(interaction);
  } catch (e) {
    console.error('❌ handleStarboardSelect:', e.message);
    return showStarboardSettings(interaction);
  }
}

// ---------- معالج المودال ----------
async function handleStarboardModal(interaction) {
  try {
    const customId = interaction.customId;

    if (customId === 'modal_sb_emoji') {
      const emoji = interaction.fields.getTextInputValue('sb_emoji_val').trim();
      if (!emoji) return interaction.reply({ content: '❌ الإيموجي مطلوب.', ephemeral: true });
      const cfg = getStarboardConfig();
      cfg.emoji = emoji;
      saveStarboardConfig(cfg);
      return showStarboardSettings(interaction);
    }

    if (customId === 'modal_sb_threshold') {
      const threshold = parseInt(interaction.fields.getTextInputValue('sb_threshold_val'), 10);
      if (isNaN(threshold) || threshold < 1) return interaction.reply({ content: '❌ الرجاء إدخال رقم صحيح أكبر من 0.', ephemeral: true });
      const cfg = getStarboardConfig();
      cfg.threshold = threshold;
      saveStarboardConfig(cfg);
      return showStarboardSettings(interaction);
    }

    if (customId === 'modal_sb_custom_color') {
      try {
        await interaction.deferUpdate();
        const hex = interaction.fields.getTextInputValue('sb_custom_color_val').trim();
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          return interaction.editReply({ content: '❌ رمز اللون غير صالح. استخدم صيغة Hex مكونة من 6 أرقام/حروف، مثال: #FF0000', components: [] });
        }
        const cfg = getStarboardConfig();
        cfg.embedColor = hex.toUpperCase();
        saveStarboardConfig(cfg);
        return showStarboardSettings(interaction);
      } catch (e) {
        console.error('[Modal:SbCustomColor]', e);
        try { await interaction.editReply({ content: '⚠️ خطأ: ' + e.message }); } catch(_) {}
      }
    }
  } catch (e) {
    console.error('❌ handleStarboardModal:', e.message);
    try {
      return interaction.editReply({ content: '⚠️ خطأ في معالجة الإدخال.' });
    } catch {
      return interaction.reply({ content: '⚠️ خطأ في معالجة الإدخال.', ephemeral: true });
    }
  }
}

// ---------- معالج الرسائل الجديدة ----------
async function handleStarboardMessage(message) {
  try {
    if (message.author.bot || !message.guild) return;

    const cfg = getStarboardConfig();
    if (!cfg.sourceChannelId || !cfg.emoji) return;

    const isThread = message.channel.isThread?.();
    const actualChannelId = isThread ? message.channel.parentId : message.channel.id;
    const isStarterMessage = isThread ? (message.id === message.channel.id) : true;

    if (actualChannelId !== cfg.sourceChannelId || !isStarterMessage) return;

    try {
      await message.react(cfg.emoji);
    } catch (reactErr) {
      if (reactErr.code === 50013) console.error('⚠️ البوت لا يملك صلاحية AddReactions');
    }
  } catch (e) {
    console.error('❌ handleStarboardMessage:', e.message);
  }
}

// ---------- معالج التفاعلات ----------
async function handleStarboardReaction(reaction, user) {
  try {
    if (user.bot || !reaction.message.guild) return;

    const cfg = getStarboardConfig();
    if (!cfg.sourceChannelId || !cfg.emoji || !cfg.destChannelId) return;

    const channel = reaction.message.channel;
    const isThread = channel.isThread?.();
    const actualChannelId = isThread ? channel.parentId : channel.id;
    if (actualChannelId !== cfg.sourceChannelId) return;

    const emojiStr = reaction.emoji.id ? reaction.emoji.toString() : reaction.emoji.name;
    if (emojiStr !== cfg.emoji) {
      try { await reaction.users.remove(user.id); } catch {}
      return;
    }

    const reactedUsers = await reaction.users.fetch();
    const realUserCount = reactedUsers.filter(u => !u.bot).size;
    if (realUserCount < cfg.threshold) return;

    const message = reaction.message;
    const destChannel = await message.guild.channels.fetch(cfg.destChannelId).catch(() => null);
    if (!destChannel) return;

    const descContent = message.content || '';
    const emoji = cfg.emoji || '⭐';
    const threadId = message.channel?.id;
    const mentionLink = `<#${threadId}>`;
    const topLine = `${realUserCount} ${emoji} | ${mentionLink}`;

    const embed = new EmbedBuilder()
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setDescription(`${descContent}\n👤 ${message.author}\n\n[📎 اضغط للانتقال إلى الرسالة الأصلية](${message.url})`)
      .setColor(hexToInt(cfg.embedColor || '#F1C40F'))
      .setTimestamp();

    if (message.attachments.size > 0) {
      const first = message.attachments.first();
      if (first.contentType?.startsWith('image/')) embed.setImage(first.url);
    }

    try {
      const sentMsg = await destChannel.send({ content: topLine, embeds: [embed] });
      await sentMsg.react(emoji).catch(() => {});
    } catch (sendErr) {
      console.error('❌ فشل إرسال:', sendErr.message);
    }
  } catch (e) {
    console.error('❌ handleStarboardReaction:', e.message);
  }
}

// ========== الموزع الرئيسي ==========

async function handleStarboardInteraction(interaction) {
  try {
    const id = interaction.customId;
    const parts = id.split('_');
    const prefix = parts[0];

    if (prefix !== 'sb') return;

    if (id === 'sb_emoji') return handleStarboardButton(interaction, 'emoji');
    if (id === 'sb_custom_color') return handleStarboardButton(interaction, 'custom_color');
    if (id === 'sb_thresh') return handleStarboardButton(interaction, 'thresh');
    if (id === 'sb_refresh') return handleStarboardButton(interaction, 'refresh');

    if (id.startsWith('sb_sel_') || id === 'sb_readycolor') {
      return handleStarboardSelect(interaction);
    }

    console.warn('⚠️ sb unknown id:', id);
  } catch (e) {
    console.error('❌ handleStarboardInteraction:', e.message);
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
  handleStarboardMain: showStarboardSettings,
  handleStarboardInteraction,
  handleStarboardModal,
  handleStarboardMessage,
  handleStarboardReaction
};

import { Client, GatewayIntentBits, Events, PermissionFlagsBits, ActivityType } from 'discord.js';
import { REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } from 'discord.js';
import dotenv from 'dotenv';
import cron from 'node-cron';
import moment from 'moment-timezone';
import 'moment/locale/ja.js';
import {
  addSent,
  addReceived,
  addDailySent,
  addDailyReceived,
  getStatsByGuild,
  getWeeklyStats,
  resetStats,
  setEmoji,
  setChannel,
  setTime,
  setDay,
  setLastSent,
  getSettings,
  getLastSent,
  saveDisplayName,
  saveGuildId
} from './db.js';
import { getAllGuildConfigs } from './db.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: `${client.guilds.cache.size}つのサーバーで導入中`, type: ActivityType.Playing }],
    status: 'online'
  });

  // Presence update every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    client.user.setPresence({
      activities: [{ name: `${client.guilds.cache.size}つのサーバーで導入中`, type: ActivityType.Playing }],
      status: 'online'
    });
  }, {
    timezone: 'Asia/Tokyo'
  });

  for (const [guildId, guild] of client.guilds.cache) {
    await saveGuildId(guildId);
    try {
      await guild.members.fetch();
      console.log(`✅ ${guild.name} のメンバーをフェッチしました`);
    } catch (err) {
      console.error(`❌ ${guild.name} のメンバー取得に失敗:`, err);
    }
  }

  // グローバルコマンド登録
  const commands = [
    new SlashCommandBuilder()
      .setName('pia_config')
      .setDescription('Pia Botの設定メニューを表示します'),

    new SlashCommandBuilder()
      .setName('pia_total')
      .setDescription('累計の送受信数ランキングを表示します'),

    // new SlashCommandBuilder()
    //   .setName('pia_weekly')
    //   .setDescription('今週の送受信数ランキングを表示します'),

    new SlashCommandBuilder()
      .setName('pia_help')
      .setDescription('Pia Botの使い方を表示します'),

    new SlashCommandBuilder()
      .setName('pia_settings')
      .setDescription('現在のBot設定を確認します')
  ].map(cmd => cmd.toJSON());

  // Ensure CLIENT_ID is defined for global command registration
  const CLIENT_ID = process.env.CLIENT_ID;
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log('✅ pia_config コマンドをグローバル登録しました');
  } catch (error) {
    console.error('❌ pia_config グローバル登録エラー:', error);
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const mentions = new Set();
  const senderId = message.author.id;

  message.mentions.users.forEach(user => {
    if (!user.bot && user.id !== senderId) mentions.add(user.id);
  });

  message.mentions.roles.forEach(role => {
    role.members.forEach(member => {
      if (!member.user.bot && member.id !== senderId) mentions.add(member.id);
    });
  });

  if (message.mentions.everyone) {
    message.guild.members.cache.forEach(member => {
      if (!member.user.bot && member.id !== senderId) mentions.add(member.id);
    });
  }

  mentions.delete(client.user.id);
  if (mentions.size === 0) return;

  const guildId = message.guild.id;
  const today = new Date().toISOString().slice(0, 10);

  getSettings(guildId, (settings) => {
    const emoji = settings?.emoji;
    if (!emoji || !message.content.includes(emoji)) return;

    addSent(guildId, senderId);
    addDailySent(guildId, senderId, today);

    mentions.forEach(userId => {
      addReceived(guildId, userId);
      addDailyReceived(guildId, userId, today);
    });

    const reply = mentions.size === 1
      ? `<@${senderId}>さん、記録しました！`
      : `<@${senderId}>さん、${mentions.size}人分を記録しました！`;

    message.reply(reply);
  });
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.commandName === 'pia_config') {
    // 管理者権限チェック
    if (!interaction.memberPermissions || !interaction.memberPermissions.has('Administrator')) {
      return await interaction.reply({
        content: '❌ このコマンドはサーバーの管理者のみ使用できます。',
        ephemeral: true,
      });
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('set_channel').setLabel('チャンネル設定').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('set_emoji').setLabel('絵文字設定').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('set_day').setLabel('曜日設定').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('set_time').setLabel('時刻設定').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('preview').setLabel('プレビュー').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('reset_stats').setLabel('記録リセット').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('reset_settings').setLabel('設定リセット').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: '**📋 Pia Bot 設定メニュー**\n以下のボタンから設定を行ってください。',
      components: [row, row2],
      ephemeral: true
    });
    return;
  }

  // ボタン/セレクト/モーダル処理
  if (interaction.isButton()) {
    const guildId = interaction.guildId;

    if (interaction.customId === 'set_channel') {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('channel_select')
          .setPlaceholder('送信先チャンネルを選択してください')
          .addOptions(
            interaction.guild.channels.cache
              .filter(ch => ch.isTextBased())
              .map(ch => ({
                label: ch.name,
                value: ch.id
              }))
              .slice(0, 25)
          )
      );
      return interaction.reply({ content: '📢 チャンネルを選択してください', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'set_emoji') {
      const modal = new ModalBuilder()
        .setCustomId('emoji_modal')
        .setTitle('絵文字設定')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('emoji_input')
              .setLabel('記録対象の絵文字（例: <:coin:123456>）')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'set_day') {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('day_select')
          .setPlaceholder('曜日を選択してください')
          .addOptions(
            [
              { label: '月曜日', value: '月曜日' },
              { label: '火曜日', value: '火曜日' },
              { label: '水曜日', value: '水曜日' },
              { label: '木曜日', value: '木曜日' },
              { label: '金曜日', value: '金曜日' },
              { label: '土曜日', value: '土曜日' },
              { label: '日曜日', value: '日曜日' }
            ]
          )
      );
      return interaction.reply({ content: '📅 曜日を選択してください', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'set_time') {
      const modal = new ModalBuilder()
        .setCustomId('time_modal')
        .setTitle('送信時刻設定')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('time_input')
              .setLabel('送信時刻 (HH:mm)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'preview') {
      getSettings(guildId, settings => {
        if (!settings) {
          return interaction.reply({ content: '⚠️ 設定がまだありません。', ephemeral: true });
        }
        const summary = [
          `📝 **現在の設定**`,
          `📌 絵文字: ${settings.emoji || '未設定'}`,
          `📢 チャンネル: ${settings.channelId ? `<#${settings.channelId}>` : '未設定'}`,
          `⏰ 送信時刻: ${settings.sendTime || '未設定'}`,
          `📅 曜日: ${settings.sendDay || '未設定'}`
        ].join('\n');
        interaction.reply({ content: summary, ephemeral: true });
      });
    }

    if (interaction.customId === 'reset_stats') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_reset_total')
          .setLabel('累計データをリセット')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('confirm_reset_weekly')
          .setLabel('今週のデータをリセット')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('cancel_reset')
          .setLabel('キャンセル')
          .setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({
        content: '⚠️ **どの統計データをリセットしますか？**',
        components: [row],
        ephemeral: true
      });
    }

    if (interaction.customId === 'reset_settings') {
      setEmoji(interaction.guildId, null);
      setChannel(interaction.guildId, null);
      setTime(interaction.guildId, null);
      setDay(interaction.guildId, null);
      return interaction.reply({ content: '🧹 設定をリセットしました。', ephemeral: true });
    }


    if (interaction.customId === 'confirm_reset_total') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_reset_total_yes')
          .setLabel('はい、累計データを削除します')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_reset')
          .setLabel('キャンセル')
          .setStyle(ButtonStyle.Secondary)
      );
      return interaction.update({
        content: '⚠️ 本当に **累計データ** をリセットしますか？',
        components: [row]
      });
    }

    if (interaction.customId === 'confirm_reset_total_yes') {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      resetStats(interaction.guildId, null, today, true);
      return interaction.update({ content: '✅ 累計データをリセットしました。', components: [] });
    }

    if (interaction.customId === 'confirm_reset_weekly') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_reset_weekly_yes')
          .setLabel('はい、今週のデータを削除します')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_reset')
          .setLabel('キャンセル')
          .setStyle(ButtonStyle.Secondary)
      );
      return interaction.update({
        content: '⚠️ 本当に **今週のデータ** をリセットしますか？',
        components: [row]
      });
    }

    if (interaction.customId === 'confirm_reset_weekly_yes') {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      resetStats(interaction.guildId, null, today, false);
      return interaction.update({ content: '✅ 今週のデータをリセットしました。', components: [] });
    }

    if (interaction.customId === 'cancel_reset') {
      return interaction.update({ content: '❎ リセットをキャンセルしました。', components: [] });
    }
  }

  if (interaction.isStringSelectMenu()) {
    const guildId = interaction.guildId;

    if (interaction.customId === 'channel_select') {
      const selected = interaction.values[0];
      setChannel(guildId, selected);
      return interaction.update({ content: `📢 チャンネルを <#${selected}> に設定しました`, components: [] });
    }

    if (interaction.customId === 'day_select') {
      const selected = interaction.values[0];
      setDay(guildId, selected);
      return interaction.update({ content: `📅 曜日を ${selected} に設定しました`, components: [] });
    }
  }

  if (interaction.isModalSubmit()) {
    const guildId = interaction.guildId;

    if (interaction.customId === 'emoji_modal') {
      const emoji = interaction.fields.getTextInputValue('emoji_input');
      setEmoji(guildId, emoji);
      return interaction.reply({ content: `📌 絵文字を ${emoji} に設定しました`, ephemeral: true });
    }

    if (interaction.customId === 'time_modal') {
      const time = interaction.fields.getTextInputValue('time_input');
      setTime(guildId, time);
      return interaction.reply({ content: `⏰ 送信時刻を ${time} に設定しました`, ephemeral: true });
    }
  }

if (!interaction.isChatInputCommand()) return;
const { commandName, options, guildId, user, member } = interaction;

if (commandName === 'pia_help') {
  interaction.reply({
    content:
      `📘 **Pia Bot ヘルプガイド**\n\n` +
      `🛠 **設定方法**\n` +
      `- \`/pia_config\` を使用して設定メニューを表示\n` +
      `- ボタンから「チャンネル」「絵文字」「曜日」「時刻」「記録リセット」「設定リセット」の設定が可能です\n\n` +
      `📊 **情報確認**\n` +
      `- /pia_total：累計ランキング\n` +
      `- /pia_weekly：今週のランキング\n` +
      `- /pia_settings：現在の設定表示`,
    ephemeral: true
  });

} else if (commandName === 'pia_total') {
  getStatsByGuild(guildId, async rows => {
    const filteredRows = rows.filter(r => r.sent > 0 || r.received > 0);
    if (filteredRows.length === 0) {
      return interaction.reply({ content: '統計データがありません。', ephemeral: true });
    }

    getSettings(guildId, async settings => {
      const emoji = settings?.emoji ?? '🔸';

      const sentStats = filteredRows.filter(r => r.sent > 0).sort((a, b) => b.sent - a.sent);
      const receivedStats = filteredRows.filter(r => r.received > 0).sort((a, b) => b.received - a.received);

      const formatLines = async (list, type) => {
        return Promise.all(list.map(async (stat, index) => {
          const member = await interaction.guild.members.fetch(stat.userId).catch(() => null);
          const name = member?.displayName ?? `<@${stat.userId}>`;
          const count = type === 'sent' ? stat.sent : stat.received;
          return `${index + 1}位: ${name} さん　（${emoji} ✕ ${count}）`;
        }));
      };

      const linesSent = await formatLines(sentStats, 'sent');
      const linesReceived = await formatLines(receivedStats, 'received');

      const content = [
        `==累計のgiveAward==`,
        ...linesSent,
        '',
        `==累計のreceiveAward==`,
        ...linesReceived
      ].join('\n');

      // --- splitMessageContent utility ---
      function splitMessageContent(content, maxLength = 2000) {
        const chunks = [];
        let current = '';
        for (const line of content.split('\n')) {
          if ((current + line + '\n').length > maxLength) {
            chunks.push(current);
            current = '';
          }
          current += line + '\n';
        }
        if (current) chunks.push(current);
        return chunks;
      }

      // --- split and send ---
      const contents = splitMessageContent(content);
      if (contents.length > 0) {
        await interaction.reply({ content: contents[0], ephemeral: false });
        for (let i = 1; i < contents.length; i++) {
          await interaction.followUp({ content: contents[i], ephemeral: false });
        }
      }
    });
  });

} else if (commandName === 'pia_settings') {
  getSettings(guildId, (settings) => {
    if (!settings) {
      return interaction.reply({ content: '設定がまだ保存されていません。', ephemeral: true });
    }

    const summary = [
      `📝 **現在の設定**`,
      `📌 絵文字: ${settings.emoji || '未設定'}`,
      `📢 チャンネル: ${settings.channelId ? `<#${settings.channelId}>` : '未設定'}`,
      `⏰ 送信時刻: ${settings.sendTime || '未設定'}`,
      `📅 曜日: ${settings.sendDay || '未設定'}`
    ].join('\n');

    interaction.reply({ content: summary, ephemeral: true });
  });
}

// --- pia_weekly コマンド: 今週の送受信数ランキングを表示 ---
else if (commandName === 'pia_weekly') {
  const guildId = interaction.guildId;
  // Utility to split a message by lines to fit Discord's 2000 char limit
  function splitMessageContent(content, maxLength = 2000) {
    const chunks = [];
    let current = '';
    for (const line of content.split('\n')) {
      if ((current + line + '\n').length > maxLength) {
        chunks.push(current);
        current = '';
      }
      current += line + '\n';
    }
    if (current) chunks.push(current);
    return chunks;
  }


  // Get weekly stats for this guild
  const now = moment().tz('Asia/Tokyo');
  const endDate = now.toDate();
  const startDate = now.clone().subtract(7, 'days').toDate();

  getWeeklyStats(
    guildId,
    startDate.toISOString(),
    endDate.toISOString()
  ).then(async rows => {
    if (!rows || rows.length === 0) {
      return interaction.reply({ content: '今週のデータがありません。', ephemeral: true });
    }

    getSettings(guildId, async settings => {
      const emoji = settings?.emoji ?? '🔸';
      const sortedSent = rows.filter(r => r.sent > 0).sort((a, b) => b.sent - a.sent);
      const sortedReceived = rows.filter(r => r.received > 0).sort((a, b) => b.received - a.received);

      const linesSent = await Promise.all(sortedSent.map(async (row, idx) => {
        const member = await interaction.guild.members.fetch(row.userId).catch(() => null);
        const displayName = member?.displayName ?? `<@${row.userId}>`;
        const count = row.sent;
        return `${idx + 1}位: ${displayName} さん　（${emoji} ✕ ${count}）`;
      }));

      const linesReceived = await Promise.all(sortedReceived.map(async (row, idx) => {
        const member = await interaction.guild.members.fetch(row.userId).catch(() => null);
        const displayName = member?.displayName ?? `<@${row.userId}>`;
        const count = row.received;
        return `${idx + 1}位: ${displayName} さん　（${emoji} ✕ ${count}）`;
      }));

      const weeklyText = [
        `==今週のgiveAward==`,
        ...linesSent,
        '',
        `==今週のreceiveAward==`,
        ...linesReceived
      ].join('\n');

      // Use splitMessageContent to split and send, using reply for first chunk and followUp for subsequent
      const chunks = splitMessageContent(weeklyText);
      if (chunks.length > 0) {
        await interaction.reply({ content: chunks[0], ephemeral: false });
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp({ content: chunks[i], ephemeral: false });
        }
      }
    });
  });
}
});

cron.schedule('*/5 * * * *', () => {
  client.guilds.cache.forEach(async guild => {
    await guild.members.fetch();
    guild.members.cache.forEach(member => {
      if (!member.user.bot) {
        saveDisplayName(guild.id, member.id, member.displayName); // 仮の関数
      }
    });
  });
}, {
  timezone: 'Asia/Tokyo'
});

async function sendWeeklyStats(guildId, channelId) {
  const botClient = client;
  const channel = botClient?.channels?.cache?.get(channelId);
  if (!channel) {
    console.log(`⚠️ チャンネルが見つかりません: channelId=${channelId}`);
    return;
  }
  try {
    const now = moment().tz('Asia/Tokyo');
    // 集計期間: 送信時間の7日前から送信日時まで
    const endDate = now.toDate();
    const startDate = now.clone().subtract(7, 'days').toDate();
    // スレッド名: M月D日～M月D日の集計（未来日を含まないようにendDateは今日まで）
    const formattedStart = moment(startDate).format('M月D日');
    const formattedEnd = moment(endDate).format('M月D日');
    const threadName = `${formattedStart}～${formattedEnd}の集計`;

    const msg = await channel.send(
      'こんにちは！\n今週も皆さんお疲れ様でした\n今週のピアボーナスの結果をスレッドに投稿しました！\nご覧ください！'
    );
    console.log('✅ メッセージ送信に成功');

    const thread = await msg.startThread({
      name: threadName,
      autoArchiveDuration: 60,
    });
    console.log('✅ スレッド作成に成功');

    // ギルド設定からemoji取得
    const guildConfig = await new Promise(res => getSettings(guildId, res));
    const emoji = guildConfig?.emoji ?? '';

    // 集計期間を引数に渡して取得 (ISO8601文字列で渡す)
    const rows = await getWeeklyStats(
      guildId,
      startDate.toISOString(),
      endDate.toISOString()
    );
    if (!rows || rows.length === 0) {
      const nextTime = now.clone().add(1, 'week').startOf('isoWeek').hour(0).minute(0);
      const duration = moment.duration(nextTime.diff(now));
      const formatted = `${duration.days()}日${duration.hours()}時間${duration.minutes()}分`;

      await thread.send(`今週のデータはまだありません。\n次回の集計送信まで: **${formatted}**`);
      return;
    }

    const sortedSent = rows.filter(r => r.sent > 0).sort((a, b) => b.sent - a.sent);
    const sortedReceived = rows.filter(r => r.received > 0).sort((a, b) => b.received - a.received);

    const linesSent = await Promise.all(sortedSent.map(async row => {
      const member = await botClient.guilds.cache.get(guildId)?.members.fetch(row.userId).catch(() => null);
      const displayName = member?.displayName ?? row.userId;
      const count = row.sent;
      return `- ${displayName}（${emoji} ✕ ${count}）`;
    }));

    const linesReceived = await Promise.all(sortedReceived.map(async row => {
      const member = await botClient.guilds.cache.get(guildId)?.members.fetch(row.userId).catch(() => null);
      const displayName = member?.displayName ?? row.userId;
      const count = row.received;
      return `- ${displayName}（${emoji} ✕ ${count}）`;
    }));

    const content = [
      '**今週のgiveAward:**',
      ...linesSent,
      '',
      '**今週のreceiveAward:**',
      ...linesReceived
    ].join('\n');

    await thread.send(content);
    console.log('✅ スレッドにデータ送信完了');
  } catch (err) {
    console.error('❌ 集計送信中にエラーが発生:', err);
  }
}

// Updated checkAndSendStats function
async function checkAndSendStats() {
  const now     = moment().tz('Asia/Tokyo').locale('ja');
  const today   = now.format('dddd');   // e.g., 木曜日
  const nowTime = now.format('HH:mm');  // e.g., 11:10

  for (const [guildId, guild] of client.guilds.cache) {
    const settings = await new Promise(res => getSettings(guildId, res));
    if (!settings) {
      console.log(`⚠️ [${guild.name}] 設定未登録`);
      continue;
    }
    const { sendDay: scheduledDay, sendTime: scheduledTime, channelId } = settings;

    console.log(`🔍 [${guild.name}] day=${scheduledDay}, time=${scheduledTime}`);

    if (today === scheduledDay && nowTime === scheduledTime) {
      console.log(`📤 送信条件一致 → ${guild.name}`);
      try {
        // Prepare startDate and endDate as ISO strings
        const now = moment().tz('Asia/Tokyo');
        const startDate = now.clone().subtract(7, 'days').startOf('day').toDate().toISOString();
        const endDate = now.toDate().toISOString();

        // Use startDate and endDate in getWeeklyStats if needed here
        // If sendWeeklyStats needs these, you would pass them; otherwise, if getWeeklyStats is called here, use them.
        // If you want to use getWeeklyStats here instead of sendWeeklyStats, adapt accordingly.

        // If you want to call getWeeklyStats here, example:
        // const rows = await getWeeklyStats(guild.guild_id, startDate, endDate);

        await sendWeeklyStats(guildId, channelId);
      } catch (err) {
        console.error(`❌ 送信失敗 [${guild.name}]:`, err);
      }
    }
  }
}

// Replace the old cron with the new function
cron.schedule('* * * * *', () => {
  checkAndSendStats();
}, { timezone: 'Asia/Tokyo' });

client.login(process.env.BOT_TOKEN);

// --- Log and refresh all guild configs every 60 seconds ---
async function logGuildConfigs() {
  const configs = await getAllGuildConfigs();
  console.log(`[${new Date().toISOString()}] 🔄 Loaded Guild Configs:`);
  configs.forEach(config => {
    console.log(`Guild ID: ${config.guildId}, Channel: ${config.channelId}, Time: ${config.time}, Day: ${config.day}`);
  });
}

// Call once on startup
logGuildConfigs();

// Schedule to run every minute
setInterval(logGuildConfigs, 60 * 1000);  
  // --- pia_weekly コマンド: 今週の送受信数ランキングを表示 ---
  // Removed redundant block starting with `} else if (commandName === 'pia_weekly') {`
  // The functionality for 'pia_weekly' is already implemented earlier in the code.
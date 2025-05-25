import { Client, GatewayIntentBits, Events, PermissionFlagsBits, ActivityType } from 'discord.js';
import dotenv from 'dotenv';
import cron from 'node-cron';
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
  getLastSent
} from './db.js';

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
    activities: [{ name: `${client.guilds.cache.size}のサーバーで導入中`, type: ActivityType.Playing }],
    status: 'online'
  });

  for (const [guildId, guild] of client.guilds.cache) {
    try {
      await guild.members.fetch();
      console.log(`✅ ${guild.name} のメンバーをフェッチしました`);
    } catch (err) {
      console.error(`❌ ${guild.name} のメンバー取得に失敗:`, err);
    }
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
      : `<@${senderId}>さん、${mentions.size}人分（ロール含む）を記録しました！`;

    message.reply(reply);
  });
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guildId, user, member } = interaction;

  if (commandName === 'pia_setemoji') {
    const emoji = options.getString('emoji');
    setEmoji(guildId, emoji);
    interaction.reply({ content: `絵文字を ${emoji} に設定しました。`, ephemeral: true });

  } else if (commandName === 'pia_setchannel') {
    const channel = options.getChannel('channel');
    setChannel(guildId, channel.id);
    interaction.reply({ content: `チャンネルを <#${channel.id}> に設定しました。`, ephemeral: true });

  } else if (commandName === 'pia_settime') {
    const time = options.getString('time');
    setTime(guildId, time);
    interaction.reply({ content: `送信時間を ${time} に設定しました。`, ephemeral: true });

  } else if (commandName === 'pia_setday') {
    const day = options.getString('day');
    setDay(guildId, day);
    interaction.reply({ content: `送信曜日を ${day} に設定しました。`, ephemeral: true });

  } else if (commandName === 'pia_help') {
    interaction.reply({
      content:
        `📘 **Pia Bot ヘルプガイド**\n\n🛠 **設定コマンド**\n` +
        `- /pia_setemoji <:emoji:>：記録対象の絵文字を設定\n` +
        `- /pia_setchannel #チャンネル：送信先チャンネル設定\n` +
        `- /pia_settime HH:mm：送信時間を設定\n` +
        `- /pia_setday 曜日：送信曜日を設定\n\n📊 **情報確認**\n` +
        `- /pia_total：累計ランキング\n` +
        `- /pia_weekly：今週のランキング\n` +
        `- /pia_settings：現在の設定表示\n\n🔄 **リセット**\n` +
        `- /pia_reset 自分 / 全体：記録をリセット（全体は管理者のみ）`,
      ephemeral: true
    });

  } else if (commandName === 'pia_total' || commandName === 'pia_weekly') {
    getStatsByGuild(guildId, async rows => {
      const sortedSent = rows.filter(r => r.sent > 0).sort((a, b) => b.sent - a.sent).slice(0, 5);
      const sortedReceived = rows.filter(r => r.received > 0).sort((a, b) => b.received - a.received).slice(0, 5);

      const linesSent = await Promise.all(sortedSent.map(async row => {
        const user = await client.users.fetch(row.userId).catch(() => null);
        return `${user?.username ?? row.userId}: ${row.sent}個`;
      }));

      const linesReceived = await Promise.all(sortedReceived.map(async row => {
        const user = await client.users.fetch(row.userId).catch(() => null);
        return `${user?.username ?? row.userId}: ${row.received}個`;
      }));

      const response = [
        `**${commandName === 'pia_total' ? '累計' : '今週'}のgiveAward:**`,
        ...linesSent,
        '',
        `**${commandName === 'pia_total' ? '累計' : '今週'}のreceiveAward:**`,
        ...linesReceived
      ].join('\n');

      interaction.reply({ content: response });
    });

  } else if (commandName === 'pia_reset') {
    const target = options.getString('target');
    if (target === 'me') {
      resetStats(guildId, user.id);
      interaction.reply({ content: 'あなたの記録をリセットしました。', ephemeral: true });
    } else {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '🚫 あなたには全体のリセットを行う権限がありません。', ephemeral: true });
      }
      resetStats(guildId);
      interaction.reply({ content: 'サーバー全体の記録をリセットしました。', ephemeral: true });
    }

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
});

cron.schedule('*/5 * * * *', () => {
  const now = new Date();
  const todayWeekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const todayTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  client.guilds.cache.forEach(guild => {
    getSettings(guild.id, async settings => {
      if (!settings || !settings.sendDay || !settings.sendTime || !settings.channelId) return;
      if (settings.sendDay !== todayWeekday || settings.sendTime !== todayTime) return;

      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const start = new Date(end);
      start.setDate(end.getDate() - 6);

      const format = d => d.toISOString().slice(0, 10);
      const startDate = format(start);
      const endDate = format(end);

      getWeeklyStats(guild.id, startDate, endDate, async rows => {
        if (!rows.length) return;

        const linesSent = await Promise.all(rows
          .filter(r => r.sent > 0)
          .sort((a, b) => b.sent - a.sent).slice(0, 5)
          .map(async row => {
            const user = await client.users.fetch(row.userId).catch(() => null);
            return `${user?.username ?? row.userId}: ${row.sent}個`;
          }));

        const linesReceived = await Promise.all(rows
          .filter(r => r.received > 0)
          .sort((a, b) => b.received - a.received).slice(0, 5)
          .map(async row => {
            const user = await client.users.fetch(row.userId).catch(() => null);
            return `${user?.username ?? row.userId}: ${row.received}個`;
          }));

        const channel = await client.channels.fetch(settings.channelId).catch(() => null);
        if (!channel?.isTextBased()) return;

        const msg = await channel.send(
          'こんにちは！\n今週も皆さんお疲れ様でした\n今週のピアボーナスの結果をスレッドに投稿しました！\nご覧ください！'
        );

        await new Promise(resolve => setTimeout(resolve, 2000));

        const threadName = `${startDate} ~ ${endDate} の結果`;

        const thread = await msg.startThread({
          name: threadName,
          autoArchiveDuration: 1440
        });

        const response = [
          '**【週次集計】giveAward:**',
          ...linesSent,
          '',
          '**【週次集計】receiveAward:**',
          ...linesReceived
        ].join('\n');

        await thread.send(response);
        setLastSent(guild.id, now.toISOString());
      });
    });
  });
}, {
  timezone: 'Asia/Tokyo'
});

client.login(process.env.BOT_TOKEN);
import { Client, GatewayIntentBits, Events, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
import cron from 'node-cron';
import {
  addSent,
  addReceived,
  getStatsByGuild,
  resetStats,
  setEmoji,
  setChannel,
  setTime,
  setDay,
  getSettings
} from './db.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const mentions = new Set(message.mentions.users.map(user => user.id));

  message.mentions.roles.forEach(role => {
    role.members.forEach(member => {
      if (!member.user.bot) mentions.add(member.user.id);
    });
  });

  if (message.mentions.everyone) {
    const members = await message.guild.members.fetch();
    members.forEach(member => {
      if (!member.user.bot) mentions.add(member.user.id);
    });
  }

  const guildId = message.guild.id;

  getSettings(guildId, (settings) => {
    const emoji = settings?.emoji;
    if (!emoji || mentions.size === 0 || !message.content.includes(emoji)) return;
    if (message.mentions.has(client.user)) return;

    addSent(guildId, message.author.id);
    mentions.forEach(userId => {
      addReceived(guildId, userId);
    });

    message.reply(`<@${message.author.id}>さん、記録しました！`);
  });
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guildId, user, member } = interaction;

  if (commandName === 'pia_settings') {
    await interaction.deferReply({ ephemeral: true });
    getSettings(guildId, (settings) => {
      if (!settings) {
        return interaction.editReply({ content: '設定がまだ保存されていません。' });
      }
      const summary = [
        `📝 **現在の設定**`,
        `📌 絵文字: ${settings.emoji || '未設定'}`,
        `📢 チャンネル: ${settings.channelId ? `<#${settings.channelId}>` : '未設定'}`,
        `⏰ 送信時刻: ${settings.sendTime || '未設定'}`,
        `📅 曜日: ${settings.sendDay || '未設定'}`
      ].join('\n');
      interaction.editReply({ content: summary });
    });

  } else if (commandName === 'pia_setemoji') {
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
    interaction.reply({ content: `送信時刻を ${time} に設定しました。`, ephemeral: true });

  } else if (commandName === 'pia_setday') {
    const day = options.getString('day');
    setDay(guildId, day);
    interaction.reply({ content: `曜日を ${day} に設定しました。`, ephemeral: true });

  } else if (commandName === 'pia_total' || commandName === 'pia_weekly') {
    getStatsByGuild(guildId, async rows => {
      const sortedSent = rows.sort((a, b) => b.sent - a.sent).slice(0, 5);
      const sortedReceived = rows.sort((a, b) => b.received - a.received).slice(0, 5);

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

  } else if (commandName === 'pia_help') {
    interaction.reply({
      content: `📘 **Pia Bot ヘルプガイド**\n\n🛠 **設定**\n- /pia_setemoji <:emoji:>\n- /pia_setchannel #チャンネル\n- /pia_settime HH:mm\n- /pia_setday 曜日\n\n📊 **集計**\n- /pia_total（累計）\n- /pia_weekly（今週）\n- /pia_settings（現在の設定）\n\n🔄 **リセット**\n- /pia_reset 自分 / 全体`,
      ephemeral: true
    });
  }
});

cron.schedule('0 * * * *', () => {
  const now = new Date();
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = daysOfWeek[now.getDay()];

  client.guilds.cache.forEach(guild => {
    getSettings(guild.id, async settings => {
      if (!settings || !settings.channelId || !settings.sendTime || !settings.sendDay) return;

      const [hour, minute] = settings.sendTime.split(':').map(Number);
      if (hour !== now.getHours() || minute !== now.getMinutes()) return;
      if (settings.sendDay !== today) return;

      getStatsByGuild(guild.id, async rows => {
        if (!rows.length) return;

        const linesSent = await Promise.all(rows
          .sort((a, b) => b.sent - a.sent).slice(0, 5)
          .map(async row => {
            const user = await client.users.fetch(row.userId).catch(() => null);
            return `${user?.username ?? row.userId}: ${row.sent}個`;
          }));

        const linesReceived = await Promise.all(rows
          .sort((a, b) => b.received - a.received).slice(0, 5)
          .map(async row => {
            const user = await client.users.fetch(row.userId).catch(() => null);
            return `${user?.username ?? row.userId}: ${row.received}個`;
          }));

        const channel = await client.channels.fetch(settings.channelId).catch(() => null);
        if (!channel?.isTextBased()) return;

        const start = new Date();
        start.setDate(now.getDate() - 6);

        const formatDate = (d) => `${('0' + (d.getMonth() + 1)).slice(-2)}/${('0' + d.getDate()).slice(-2)}`;
        const threadName = `${formatDate(start)}~${formatDate(now)}までの結果`;

        const announcement = await channel.send(
          'こんにちは！\n今週も皆さんお疲れ様でした\n今週のピアボーナスの結果をスレッドに投稿しました！\nご覧ください！'
        );

        const thread = await announcement.startThread({
          name: threadName,
          autoArchiveDuration: 1440
        });

        const response = [
          '**【毎週集計】giveAward:**',
          ...linesSent,
          '',
          '**【毎週集計】receiveAward:**',
          ...linesReceived
        ].join('\n');

        thread.send(response);
      });
    });
  });
}, {
  timezone: 'Asia/Tokyo'
});

client.login(process.env.BOT_TOKEN);
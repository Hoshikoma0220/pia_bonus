// index.js
import { Client, GatewayIntentBits, Events } from 'discord.js';
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
  getSettings
} from './db.js';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const mentions = message.mentions.users;
  const guildId = message.guild.id;

  getSettings(guildId, (settings) => {
    const emoji = settings?.emoji;
    if (!emoji || !mentions.size || !message.content.includes(emoji)) return;
    if (mentions.has(client.user)) return;

    addSent(guildId, message.author.id);
    mentions.forEach(user => {
      if (!user.bot) addReceived(guildId, user.id);
    });

    message.reply(`<@${message.author.id}>さん、記録しました！`);
  });
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guildId, user } = interaction;

  if (commandName === 'piasetemoji') {
    const emoji = options.getString('emoji');
    setEmoji(guildId, emoji);
    interaction.reply({ content: `絵文字を ${emoji} に設定しました。`, ephemeral: true });

  } else if (commandName === 'piasetchannel') {
    const channel = options.getChannel('channel');
    setChannel(guildId, channel.id);
    interaction.reply({ content: `チャンネルを <#${channel.id}> に設定しました。`, ephemeral: true });

  } else if (commandName === 'piasettime') {
    const time = options.getString('time');
    setTime(guildId, time);
    interaction.reply({ content: `毎週の送信時刻を ${time} に設定しました。`, ephemeral: true });

  } else if (commandName === 'piahelp') {
    interaction.reply({
      content: `**📘 Pia Bot コマンド一覧**\n- /piasetemoji <絵文字>\n- /piasetchannel <チャンネル>\n- /piasettime <HH:mm>\n- /piatotal\n- /piaweekly\n- /piareset <自分 / 全体>`,
      ephemeral: true
    });

  } else if (commandName === 'piatotal' || commandName === 'piaweekly') {
    getStatsByGuild(guildId, async rows => {
      const sortedSent = rows.sort((a, b) => b.sent - a.sent).slice(0, 5);
      const sortedReceived = rows.sort((a, b) => b.received - a.received).slice(0, 5);

      const linesSent = await Promise.all(sortedSent.map(async row => {
        const u = await client.users.fetch(row.userId).catch(() => null);
        return `${u?.username ?? row.userId}: ${row.sent}個`;
      }));

      const linesReceived = await Promise.all(sortedReceived.map(async row => {
        const u = await client.users.fetch(row.userId).catch(() => null);
        return `${u?.username ?? row.userId}: ${row.received}個`;
      }));

      const response = [
        `**🏆 ${commandName === 'piatotal' ? '累計' : '今週'}のgiveAward:**`,
        ...linesSent,
        '',
        `**== ${commandName === 'piatotal' ? '累計' : '今週'}のreceiveAward ==:**`,
        ...linesReceived
      ].join('\n');

      interaction.reply({ content: response, ephemeral: true });
    });

  } else if (commandName === 'piareset') {
    const target = options.getString('target');
    if (target === 'me') {
      resetStats(guildId, user.id);
      interaction.reply({ content: `あなたの記録をリセットしました。`, ephemeral: true });
    } else {
      resetStats(guildId);
      interaction.reply({ content: `サーバー全体の記録をリセットしました。`, ephemeral: true });
    }
  }
});

cron.schedule('0 0 * * *', () => {
  const now = new Date();
  if (now.getDay() !== 1) return;

  client.guilds.cache.forEach(guild => {
    getSettings(guild.id, async (settings) => {
      if (!settings || !settings.channelId || settings.sendTime !== '09:00') return;

      getStatsByGuild(guild.id, async rows => {
        if (!rows.length) return;

        const linesSent = await Promise.all(rows
          .sort((a, b) => b.sent - a.sent).slice(0, 5)
          .map(async row => {
            const u = await client.users.fetch(row.userId).catch(() => null);
            return `${u?.username ?? row.userId}: ${row.sent}個`;
          }));

        const linesReceived = await Promise.all(rows
          .sort((a, b) => b.received - a.received).slice(0, 5)
          .map(async row => {
            const u = await client.users.fetch(row.userId).catch(() => null);
            return `${u?.username ?? row.userId}: ${row.received}個`;
          }));

        const response = [
          '**【毎週集計】giveAward:**',
          ...linesSent,
          '',
          '**【毎週集計】receiveAward:**',
          ...linesReceived
        ].join('\n');

        const channel = await client.channels.fetch(settings.channelId).catch(() => null);
        if (channel?.isTextBased()) channel.send(response);
      });
    });
  });
}, {
  timezone: 'Asia/Tokyo'
});

client.login(process.env.BOT_TOKEN);
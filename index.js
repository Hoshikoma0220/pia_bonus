// index.js
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
  const { commandName, options, guildId, user, member, channel } = interaction;

  if (commandName === 'piasetemoji') {
    const emoji = options.getString('emoji');
    setEmoji(guildId, emoji);
    interaction.reply({ content: `絵文字を ${emoji} に設定しました。`, ephemeral: true });

  } else if (commandName === 'piasetchannel') {
    const targetChannel = options.getChannel('channel');
    setChannel(guildId, targetChannel.id);
    interaction.reply({ content: `チャンネルを <#${targetChannel.id}> に設定しました。`, ephemeral: true });

  } else if (commandName === 'piasettime') {
    const time = options.getString('time');
    setTime(guildId, time);
    interaction.reply({ content: `毎週の送信時刻を ${time} に設定しました。`, ephemeral: true });

  } else if (commandName === 'piasetday') {
    const day = options.getString('day');
    setDay(guildId, day);
    interaction.reply({ content: `送信曜日を ${day} に設定しました。`, ephemeral: true });

  } else if (commandName === 'piahelp') {
    interaction.reply({
      content: `📘 **Pia Bot ヘルプガイド**\n\n🛠 **設定コマンド**\n- /piasetemoji <:emoji:>：記録対象の絵文字を設定\n- /piasetchannel #チャンネル：毎週の集計結果を送信するチャンネルを設定\n- /piasettime HH:mm：送信する時刻を設定（例: 09:00）\n- /piasetday 曜日：送信する曜日を設定（Monday〜Sunday）\n\n📊 **情報確認**\n- /piatotal：累計の送受信数ランキングを表示\n- /piaweekly：今週の送受信数ランキングを表示\n\n🔄 **リセット（管理者のみ）**\n- /piareset 自分 / 全体：記録をリセット（全体は管理者のみ）`,
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
        `** ${commandName === 'piatotal' ? '累計' : '今週'}のgiveAward:**`,
        ...linesSent,
        '',
        `** ${commandName === 'piatotal' ? '累計' : '今週'}のreceiveAward :**`,
        ...linesReceived
      ].join('\n');

      interaction.reply({ content: response });
    });

  } else if (commandName === 'piareset') {
    const target = options.getString('target');
    if (target === 'me') {
      resetStats(guildId, user.id);
      interaction.reply({ content: `あなたの記録をリセットしました。`, ephemeral: true });
    } else {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '🚫 あなたには全体のリセットを行う権限がありません。', ephemeral: true });
      }
      resetStats(guildId);
      interaction.reply({ content: `サーバー全体の記録をリセットしました。`, ephemeral: true });
    }
  }
});

cron.schedule('0 * * * *', () => {
  const now = new Date();
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = daysOfWeek[now.getDay()];

  client.guilds.cache.forEach(guild => {
    getSettings(guild.id, async (settings) => {
      if (!settings || !settings.channelId || !settings.sendTime || !settings.sendDay) return;

      const [setHour, setMin] = settings.sendTime.split(":").map(v => parseInt(v));
      const nowHour = now.getHours();
      const nowMin = now.getMinutes();
      if (setHour !== nowHour || setMin !== nowMin) return;
      if (settings.sendDay !== today) return;

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
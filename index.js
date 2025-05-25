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
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

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

// 週次送信（5分おきにチェック）
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
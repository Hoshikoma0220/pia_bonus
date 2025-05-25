import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  console.log(`✅ Bot Logged in as ${client.user.tag}`);

  try {
    const channelId = '1376009165646073938'; // ← あなたのテキストチャンネルID
    const channel = await client.channels.fetch(channelId);

    if (!channel.isTextBased()) {
      console.error('❌ チャンネルはテキストチャンネルではありません');
      return;
    }

    const message = await channel.send('🧪 スレッド作成テストメッセージです');

    const thread = await message.startThread({
      name: '🧵 スレッド検証スレッド',
      autoArchiveDuration: 60
    });

    await thread.send('✅ スレッド内へのメッセージ送信に成功しました！');
    console.log('🎉 スレッドの作成と投稿に成功しました');
  } catch (error) {
    console.error('🚨 スレッド作成中にエラーが発生:', error);
  }
});

client.login(process.env.BOT_TOKEN);
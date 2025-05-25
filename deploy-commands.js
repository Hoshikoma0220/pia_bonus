import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const commands = [
  new SlashCommandBuilder().setName('piasetemoji').setDescription('反応する絵文字を設定')
    .addStringOption(opt =>
      opt.setName('emoji').setDescription('使用する絵文字').setRequired(true)),
  new SlashCommandBuilder().setName('piasetchannel').setDescription('集計チャンネルを設定')
    .addChannelOption(opt =>
      opt.setName('channel').setDescription('チャンネルを選択').setRequired(true)),
  new SlashCommandBuilder().setName('piasettime').setDescription('集計送信時間を設定')
    .addStringOption(opt =>
      opt.setName('time').setDescription('例: 09:00').setRequired(true)),
  new SlashCommandBuilder().setName('piatotal').setDescription('累計を表示'),
  new SlashCommandBuilder().setName('piaweekly').setDescription('今週の集計を表示'),
  new SlashCommandBuilder().setName('piareset').setDescription('集計をリセット')
    .addStringOption(opt => opt.setName('target').setDescription('自分 or 全体').setRequired(true).addChoices(
      { name: '自分だけ', value: 'me' },
      { name: 'サーバー全体', value: 'all' }
    )),
  new SlashCommandBuilder().setName('piahelp').setDescription('Botの使い方を表示')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('📡 スラッシュコマンドを登録中...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands
    });
    console.log('✅ 登録完了！');
  } catch (err) {
    console.error('❌ 登録失敗:', err);
  }
})();
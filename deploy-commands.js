// deploy-commands.js
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName('piasetemoji')
    .setDescription('記録対象にする絵文字を設定します')
    .addStringOption(option =>
      option.setName('emoji')
        .setDescription('対象とする絵文字')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('piasetchannel')
    .setDescription('集計結果を送信するチャンネルを設定します')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('送信チャンネル')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('piasettime')
    .setDescription('集計結果を送信する時刻を設定します (例: 09:00)')
    .addStringOption(option =>
      option.setName('time')
        .setDescription('HH:mm 形式で入力')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('piasetday')
    .setDescription('集計結果を送信する曜日を設定します')
    .addStringOption(option =>
      option.setName('day')
        .setDescription('曜日を選択 (Monday〜Sunday)')
        .setRequired(true)
        .addChoices(
          { name: 'Monday', value: 'Monday' },
          { name: 'Tuesday', value: 'Tuesday' },
          { name: 'Wednesday', value: 'Wednesday' },
          { name: 'Thursday', value: 'Thursday' },
          { name: 'Friday', value: 'Friday' },
          { name: 'Saturday', value: 'Saturday' },
          { name: 'Sunday', value: 'Sunday' }
        )),

  new SlashCommandBuilder()
    .setName('piatotal')
    .setDescription('累計の送受信数ランキングを表示します'),

  new SlashCommandBuilder()
    .setName('piaweekly')
    .setDescription('今週の送受信数ランキングを表示します'),

  new SlashCommandBuilder()
    .setName('piareset')
    .setDescription('統計をリセットします')
    .addStringOption(option =>
      option.setName('target')
        .setDescription('自分 / 全体')
        .setRequired(true)
        .addChoices(
          { name: '自分', value: 'me' },
          { name: '全体', value: 'all' }
        )),

  new SlashCommandBuilder()
    .setName('piahelp')
    .setDescription('Pia Botの使い方を表示します'),

  new SlashCommandBuilder()
    .setName('piasettings')
    .setDescription('現在のBot設定を確認します')
]
  .map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log('🔁 スラッシュコマンドを登録中...');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log('✅ スラッシュコマンドを登録しました');
  } catch (error) {
    console.error('❌ コマンド登録エラー:', error);
  }
})();
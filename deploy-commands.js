// deploy-commands.js
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN = 'YOUR_BOT_TOKEN';
const CLIENT_ID = 'YOUR_CLIENT_ID';       // Discord Developer Portalで確認
const GUILD_ID = 'YOUR_GUILD_ID';         // テスト用サーバーのID

const commands = [
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('送信/受信数の統計を表示')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('スラッシュコマンドを登録中...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('登録完了!');
  } catch (error) {
    console.error(error);
  }
})();

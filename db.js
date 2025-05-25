import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('./emojiStats.db');

db.serialize(() => {
  // 統計データ（累計）
  db.run(`
    CREATE TABLE IF NOT EXISTS stats (
      guildId TEXT,
      userId TEXT,
      sent INTEGER DEFAULT 0,
      received INTEGER DEFAULT 0,
      PRIMARY KEY (guildId, userId)
    )
  `);

  // サーバーごとの設定
  db.run(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guildId TEXT PRIMARY KEY,
      emoji TEXT DEFAULT '<:mag_coin:1367495903900074054>',
      channelId TEXT,
      sendTime TEXT DEFAULT '09:00',
      sendDay TEXT DEFAULT 'Monday',
      lastSent TEXT
    )
  `);

  // 日別統計（週次集計用）
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      guildId TEXT,
      userId TEXT,
      date TEXT, -- yyyy-mm-dd
      sent INTEGER DEFAULT 0,
      received INTEGER DEFAULT 0,
      PRIMARY KEY (guildId, userId, date)
    )
  `);
});

// ------------------------
// 累計統計
// ------------------------

export function addSent(guildId, userId) {
  db.run(`
    INSERT INTO stats (guildId, userId, sent, received)
    VALUES (?, ?, 1, 0)
    ON CONFLICT(guildId, userId) DO UPDATE SET sent = sent + 1
  `, [guildId, userId]);
}

export function addReceived(guildId, userId) {
  db.run(`
    INSERT INTO stats (guildId, userId, sent, received)
    VALUES (?, ?, 0, 1)
    ON CONFLICT(guildId, userId) DO UPDATE SET received = received + 1
  `, [guildId, userId]);
}

export function getStatsByGuild(guildId, callback) {
  db.all(`SELECT * FROM stats WHERE guildId = ?`, [guildId], (err, rows) => {
    if (err) return callback([]);
    callback(rows);
  });
}

export function resetStats(guildId, userId = null) {
  if (userId) {
    db.run(`UPDATE stats SET sent = 0, received = 0 WHERE guildId = ? AND userId = ?`, [guildId, userId]);
  } else {
    db.run(`UPDATE stats SET sent = 0, received = 0 WHERE guildId = ?`, [guildId]);
  }
}

// ------------------------
// 日別統計（週次集計用）
// ------------------------

export function addDailySent(guildId, userId, date) {
  db.run(`
    INSERT INTO daily_stats (guildId, userId, date, sent, received)
    VALUES (?, ?, ?, 1, 0)
    ON CONFLICT(guildId, userId, date) DO UPDATE SET sent = sent + 1
  `, [guildId, userId, date]);
}

export function addDailyReceived(guildId, userId, date) {
  db.run(`
    INSERT INTO daily_stats (guildId, userId, date, sent, received)
    VALUES (?, ?, ?, 0, 1)
    ON CONFLICT(guildId, userId, date) DO UPDATE SET received = received + 1
  `, [guildId, userId, date]);
}

export function getWeeklyStats(guildId, startDate, endDate, callback) {
  db.all(`
    SELECT userId, SUM(sent) as sent, SUM(received) as received
    FROM daily_stats
    WHERE guildId = ? AND date BETWEEN ? AND ?
    GROUP BY userId
  `, [guildId, startDate, endDate], (err, rows) => {
    if (err) return callback([]);
    callback(rows);
  });
}

// ------------------------
// サーバー設定管理
// ------------------------

export function setEmoji(guildId, emoji) {
  db.run(`
    INSERT INTO guild_settings (guildId, emoji)
    VALUES (?, ?)
    ON CONFLICT(guildId) DO UPDATE SET emoji = ?
  `, [guildId, emoji, emoji]);
}

export function setChannel(guildId, channelId) {
  db.run(`
    INSERT INTO guild_settings (guildId, channelId)
    VALUES (?, ?)
    ON CONFLICT(guildId) DO UPDATE SET channelId = ?
  `, [guildId, channelId, channelId]);
}

export function setTime(guildId, time) {
  db.run(`
    INSERT INTO guild_settings (guildId, sendTime)
    VALUES (?, ?)
    ON CONFLICT(guildId) DO UPDATE SET sendTime = ?
  `, [guildId, time, time]);
}

export function setDay(guildId, day) {
  db.run(`
    INSERT INTO guild_settings (guildId, sendDay)
    VALUES (?, ?)
    ON CONFLICT(guildId) DO UPDATE SET sendDay = ?
  `, [guildId, day, day]);
}

export function getSettings(guildId, callback) {
  db.get(`SELECT * FROM guild_settings WHERE guildId = ?`, [guildId], (err, row) => {
    if (err) return callback(null);
    callback(row);
  });
}

export function setLastSent(guildId, timestamp) {
  db.run(`UPDATE guild_settings SET lastSent = ? WHERE guildId = ?`, [timestamp, guildId]);
}

export function getLastSent(guildId, callback) {
  db.get(`SELECT lastSent FROM guild_settings WHERE guildId = ?`, [guildId], (err, row) => {
    if (err) return callback(null);
    callback(row?.lastSent);
  });
}
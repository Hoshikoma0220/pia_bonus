import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('./emojiStats.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS stats (
      guildId TEXT,
      userId TEXT,
      sent INTEGER DEFAULT 0,
      received INTEGER DEFAULT 0,
      PRIMARY KEY (guildId, userId)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guildId TEXT PRIMARY KEY,
      emoji TEXT,
      channelId TEXT,
      sendTime TEXT DEFAULT '09:00',
      sendDay TEXT DEFAULT 'Monday'
    )
  `);
});

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
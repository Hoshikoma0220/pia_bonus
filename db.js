import Database from 'better-sqlite3';

console.log('📦 Connecting to emojiStats.db...');
const db = new Database('emojiStats.db');

// テーブルがなければ作成
db.prepare(`
  CREATE TABLE IF NOT EXISTS guild_configs (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT,
    send_time TEXT,
    send_day TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS user_stats (
    guild_id TEXT,
    user_id TEXT,
    total_sent INTEGER DEFAULT 0,
    total_received INTEGER DEFAULT 0,
    weekly_sent INTEGER DEFAULT 0,
    weekly_received INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  )
`).run();

// 統計データ（累計）
db.prepare(`
  CREATE TABLE IF NOT EXISTS stats (
    guildId TEXT,
    userId TEXT,
    sent INTEGER DEFAULT 0,
    received INTEGER DEFAULT 0,
    PRIMARY KEY (guildId, userId)
  )
`).run();
console.log('✅ stats table is ready');
// サーバーごとの設定
// Ensure the guild_settings table has the correct schema (with channel_id)
db.prepare(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guildId TEXT PRIMARY KEY,
    sendDay TEXT,
    sendTime TEXT,
    channelId TEXT,
    lastSent TEXT,
    emoji TEXT
  )
`).run();
console.log('✅ guild_settings table is ready');

// Ensure all required columns exist before any queries that use them
const pragma = db.prepare("PRAGMA table_info(guild_settings)").all();
const columns = pragma.map(col => col.name);

if (!columns.includes("channelId")) {
  db.prepare("ALTER TABLE guild_settings ADD COLUMN channelId TEXT").run();
  console.log("✅ Added 'channelId' column to 'guild_settings' table.");
}
if (!columns.includes("sendTime")) {
  db.prepare("ALTER TABLE guild_settings ADD COLUMN sendTime TEXT").run();
  console.log("✅ Added 'sendTime' column to 'guild_settings' table.");
}
if (!columns.includes("sendDay")) {
  db.prepare("ALTER TABLE guild_settings ADD COLUMN sendDay TEXT").run();
  console.log("✅ Added 'sendDay' column to 'guild_settings' table.");
}
if (!columns.includes("emoji")) {
  db.prepare("ALTER TABLE guild_settings ADD COLUMN emoji TEXT").run();
  console.log("✅ Added 'emoji' column to 'guild_settings' table.");
}
if (!columns.includes("lastSent")) {
  db.prepare("ALTER TABLE guild_settings ADD COLUMN lastSent TEXT").run();
  console.log("✅ Added 'lastSent' column to 'guild_settings' table.");
}
// 日別統計（週次集計用）
db.prepare(`
  CREATE TABLE IF NOT EXISTS daily_stats (
    guildId TEXT,
    userId TEXT,
    date TEXT, -- yyyy-mm-dd
    sent INTEGER DEFAULT 0,
    received INTEGER DEFAULT 0,
    PRIMARY KEY (guildId, userId, date)
  )
`).run();
console.log('✅ daily_stats table is ready');
// ユーザー表示名管理
db.prepare(`
  CREATE TABLE IF NOT EXISTS user_display_names (
    guildId TEXT,
    userId TEXT,
    displayName TEXT,
    PRIMARY KEY (guildId, userId)
  )
`).run();
console.log('✅ user_display_names table is ready');
// ギルドID管理
db.prepare(`
  CREATE TABLE IF NOT EXISTS guilds (
    guildId TEXT PRIMARY KEY
  )
`).run();
console.log('✅ guilds table is ready');

// ------------------------
// 累計統計
// ------------------------

export function addSent(guildId, userId) {
  db.prepare(`
    INSERT INTO stats (guildId, userId, sent, received)
    VALUES (?, ?, 1, 0)
    ON CONFLICT(guildId, userId) DO UPDATE SET sent = sent + 1
  `).run(guildId, userId);
}

export function addReceived(guildId, userId) {
  db.prepare(`
    INSERT INTO stats (guildId, userId, sent, received)
    VALUES (?, ?, 0, 1)
    ON CONFLICT(guildId, userId) DO UPDATE SET received = received + 1
  `).run(guildId, userId);
}

export function getStatsByGuild(guildId, callback) {
  try {
    const rows = db.prepare(`SELECT * FROM stats WHERE guildId = ?`).all(guildId);
    callback(rows);
  } catch {
    callback([]);
  }
}

export function resetStats(guildId, userId = null) {
  if (userId) {
    db.prepare(`UPDATE stats SET sent = 0, received = 0 WHERE guildId = ? AND userId = ?`).run(guildId, userId);
  } else {
    db.prepare(`UPDATE stats SET sent = 0, received = 0 WHERE guildId = ?`).run(guildId);
  }
}

// ------------------------
// 日別統計（週次集計用）
// ------------------------

export function addDailySent(guildId, userId, date) {
  db.prepare(`
    INSERT INTO daily_stats (guildId, userId, date, sent, received)
    VALUES (?, ?, ?, 1, 0)
    ON CONFLICT(guildId, userId, date) DO UPDATE SET sent = sent + 1
  `).run(guildId, userId, date);
}

export function addDailyReceived(guildId, userId, date) {
  db.prepare(`
    INSERT INTO daily_stats (guildId, userId, date, sent, received)
    VALUES (?, ?, ?, 0, 1)
    ON CONFLICT(guildId, userId, date) DO UPDATE SET received = received + 1
  `).run(guildId, userId, date);
}

export function getWeeklyStats(guildId, startDate, endDate) {
  try {
    const toDateStr = d => {
      if (typeof d === 'string') return d;
      if (d instanceof Date) return d.toISOString().split('T')[0];
      if (typeof d.format === 'function') return d.format('YYYY-MM-DD');
      throw new Error('Invalid date format for getWeeklyStats');
    };

    const startStr = toDateStr(startDate);
    const endStr = toDateStr(endDate);

    const rows = db.prepare(`
      SELECT userId, SUM(sent) as sent, SUM(received) as received
      FROM daily_stats
      WHERE guildId = ? AND date >= ? AND date < ?
      GROUP BY userId
    `).all(guildId, startStr, endStr);

    return rows;
  } catch (e) {
    console.error('❌ getWeeklyStats error:', e);
    return [];
  }
}

// ------------------------
// サーバー設定管理
// ------------------------

export function setEmoji(guildId, emoji) {
  db.prepare(`
    INSERT INTO guild_settings (guildId, emoji)
    VALUES (?, ?)
    ON CONFLICT(guildId) DO UPDATE SET emoji = ?
  `).run(guildId, emoji, emoji);
}

export function setChannel(guildId, channelId) {
  db.prepare(`
    INSERT INTO guild_settings (guildId, channelId)
    VALUES (?, ?)
    ON CONFLICT(guildId) DO UPDATE SET channelId = ?
  `).run(guildId, channelId, channelId);
}

export function setTime(guildId, time) {
  db.prepare(`
    INSERT INTO guild_settings (guildId, sendTime)
    VALUES (?, ?)
    ON CONFLICT(guildId) DO UPDATE SET sendTime = ?
  `).run(guildId, time, time);
}

export function setDay(guildId, day) {
  db.prepare(`
    INSERT INTO guild_settings (guildId, sendDay)
    VALUES (?, ?)
    ON CONFLICT(guildId) DO UPDATE SET sendDay = ?
  `).run(guildId, day, day);
}

export function getSettings(guildId, callback) {
  try {
    const row = db.prepare(`SELECT * FROM guild_settings WHERE guildId = ?`).get(guildId);
    callback(row);
  } catch {
    callback(null);
  }
}

export function setLastSent(guildId, timestamp) {
  db.prepare(`UPDATE guild_settings SET lastSent = ? WHERE guildId = ?`).run(timestamp, guildId);
}

export function getLastSent(guildId, callback) {
  try {
    const row = db.prepare(`SELECT lastSent FROM guild_settings WHERE guildId = ?`).get(guildId);
    callback(row?.lastSent);
  } catch {
    callback(null);
  }
}

// ------------------------
// ユーザー表示名管理
// ------------------------

export function saveDisplayName(guildId, userId, displayName) {
  db.prepare(`
    INSERT OR REPLACE INTO user_display_names (guildId, userId, displayName)
    VALUES (?, ?, ?)
  `).run(guildId, userId, displayName);
}

export function getDisplayName(guildId, userId) {
  const row = db.prepare(`
    SELECT displayName FROM user_display_names
    WHERE guildId = ? AND userId = ?
  `).get(guildId, userId);
  return row?.displayName ?? null;
}

export function saveGuildId(guildId) {
  db.prepare(`
    INSERT OR IGNORE INTO guilds (guildId)
    VALUES (?)
  `).run(guildId);
}

export function getAllGuildConfigs() {
  const stmt = db.prepare(`
    SELECT guildId, channelId, sendTime, sendDay
    FROM guild_settings
  `);
  return stmt.all().map(row => ({
    guildId: row.guildId,
    channelId: row.channelId,
    time: row.sendTime,
    day: row.sendDay
  }));
}
// ------------------------
// 統計データ表示用フォーマット
// ------------------------

export function getFormattedStats(guildId) {
  try {
    const rows = db.prepare(`
      SELECT s.userId, s.sent, s.received, d.displayName, gs.emoji
      FROM stats s
      LEFT JOIN user_display_names d ON s.guildId = d.guildId AND s.userId = d.userId
      LEFT JOIN guild_settings gs ON s.guildId = gs.guildId
      WHERE s.guildId = ?
    `).all(guildId);

    const emoji = rows.length > 0 ? (rows[0].emoji || '🔸') : '🔸';

    const sortedSent = rows.filter(r => r.sent > 0).sort((a, b) => b.sent - a.sent);
    const sortedReceived = rows.filter(r => r.received > 0).sort((a, b) => b.received - a.received);

    const linesSent = sortedSent.map((row, i) =>
      `${i + 1}位: ${row.displayName || `不明なユーザー`} さん　（${emoji} × ${row.sent}）`
    );
    const linesReceived = sortedReceived.map((row, i) =>
      `${i + 1}位: ${row.displayName || `不明なユーザー`} さん　（${emoji} × ${row.received}）`
    );

    return [
      `==今週のgiveAward==`,
      ...linesSent,
      '',
      `==今週のreceiveAward==`,
      ...linesReceived
    ];
  } catch (e) {
    console.error('❌ getFormattedStats error:', e);
    return [];
  }
}
import path from 'path'

let DatabaseSync: any
try {
  DatabaseSync = eval("require('node:sqlite')").DatabaseSync
} catch (err) {
  console.error('Failed to load native node:sqlite:', err)
}

let dbConnection: any = null

export function getDb(): any {
  if (dbConnection) return dbConnection

  dbConnection = new DatabaseSync(path.join(process.cwd(), 'config', 'bobo.db'))

  // 啟用外鍵約束
  dbConnection.exec('PRAGMA foreign_keys = ON;')

  // 初始化資料表
  dbConnection.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      server_id TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS commands (
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      response TEXT NOT NULL,
      PRIMARY KEY (server_id, name),
      FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      server_id TEXT PRIMARY KEY,
      detect_twitter INTEGER DEFAULT 1,
      FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_memories (
      user_id TEXT PRIMARY KEY,
      profile TEXT DEFAULT '',
      updated_at INTEGER,
      memory_enabled INTEGER DEFAULT 1
    );
  `)

  // 執行 Schema 遷移 (如果欄位不存在則新增)
  try {
    dbConnection.exec('ALTER TABLE user_memories ADD COLUMN memory_enabled INTEGER DEFAULT 1;')
  } catch {
    // 欄位已存在會丟出錯誤，可以直接忽略
  }

  return dbConnection
}

/**
 * 取得推特連結偵測設定 (預設為開啟: true)
 */
export function getTwitterSetting(serverId: string): boolean {
  const db = getDb()
  try {
    const row = db
      .prepare('SELECT detect_twitter FROM settings WHERE server_id = ?')
      .get(serverId) as { detect_twitter: number } | undefined
    return row ? row.detect_twitter === 1 : true
  } catch (error) {
    console.error('Error fetching twitter setting:', error)
    return true
  }
}

/**
 * 儲存推特連結偵測設定
 */
export function setTwitterSetting(serverId: string, enable: boolean): void {
  const db = getDb()
  try {
    // 確保伺服器已記錄在 servers 表中
    db.prepare('INSERT OR IGNORE INTO servers (server_id) VALUES (?)').run(serverId)
    // 寫入/更新設定
    db.prepare('INSERT OR REPLACE INTO settings (server_id, detect_twitter) VALUES (?, ?)').run(
      serverId,
      enable ? 1 : 0
    )
  } catch (error) {
    console.error('Error setting twitter setting:', error)
  }
}

/**
 * 取得使用者的長期記憶 Profile
 */
export function getUserMemory(userId: string): string {
  const db = getDb()
  try {
    const row = db
      .prepare('SELECT profile FROM user_memories WHERE user_id = ?')
      .get(userId) as { profile: string } | undefined
    return row ? row.profile : ''
  } catch (error) {
    console.error('Error fetching user memory:', error)
    return ''
  }
}

/**
 * 儲存/更新使用者的長期記憶 Profile
 */
export function setUserMemory(userId: string, profile: string): void {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  try {
    db.prepare(`
      INSERT OR REPLACE INTO user_memories (user_id, profile, updated_at)
      VALUES (?, ?, ?)
    `).run(userId, profile, now)
  } catch (error) {
    console.error('Error setting user memory:', error)
  }
}

/**
 * 取得使用者的長期記憶功能開關設定 (預設為開啟: true)
 */
export function getUserMemorySetting(userId: string): boolean {
  const db = getDb()
  try {
    const row = db
      .prepare('SELECT memory_enabled FROM user_memories WHERE user_id = ?')
      .get(userId) as { memory_enabled: number } | undefined
    return row ? row.memory_enabled === 1 : true
  } catch (error) {
    console.error('Error fetching user memory setting:', error)
    return true
  }
}

/**
 * 設定使用者的長期記憶功能開關
 */
export function setUserMemorySetting(userId: string, enable: boolean): void {
  const db = getDb()
  const val = enable ? 1 : 0
  try {
    db.prepare(`
      INSERT INTO user_memories (user_id, memory_enabled)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET memory_enabled = excluded.memory_enabled
    `).run(userId, val)
  } catch (error) {
    console.error('Error setting user memory setting:', error)
  }
}



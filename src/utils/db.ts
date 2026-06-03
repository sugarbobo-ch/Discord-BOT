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
  `)

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

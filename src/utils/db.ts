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
  `)

  return dbConnection
}

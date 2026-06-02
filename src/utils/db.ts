import path from 'path'
import Database from 'better-sqlite3'

let dbConnection: Database.Database | null = null

export function getDb(): Database.Database {
  if (dbConnection) return dbConnection

  dbConnection = new Database(path.join(process.cwd(), 'config', 'bobo.db'))

  // 啟用外鍵約束
  dbConnection.pragma('foreign_keys = ON')

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


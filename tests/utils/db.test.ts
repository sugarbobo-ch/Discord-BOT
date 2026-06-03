import { describe, test, expect, beforeAll } from 'vitest'
import { getDb, getTwitterSetting, setTwitterSetting } from '../../src/utils/db'

describe('SQLite Database Tests', () => {
  let db: any

  beforeAll(() => {
    db = getDb()
  })

  test('should initialize tables successfully', () => {
    expect(db).toBeDefined()

    // 檢查資料表是否存在
    const serversTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='servers'")
      .get()
    const commandsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='commands'")
      .get()
    const settingsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
      .get()

    expect(serversTable).toBeDefined()
    expect(serversTable.name).toBe('servers')
    expect(commandsTable).toBeDefined()
    expect(commandsTable.name).toBe('commands')
    expect(settingsTable).toBeDefined()
    expect(settingsTable.name).toBe('settings')
  })

  test('should insert and retrieve server', () => {
    const testServerId = 'test_server_123'

    // 插入
    db.prepare('INSERT OR IGNORE INTO servers (server_id) VALUES (?)').run(testServerId)

    // 查詢
    const row = db.prepare('SELECT server_id FROM servers WHERE server_id = ?').get(testServerId)
    expect(row).toBeDefined()
    expect(row.server_id).toBe(testServerId)

    // 刪除
    db.prepare('DELETE FROM servers WHERE server_id = ?').run(testServerId)
    const rowAfter = db
      .prepare('SELECT server_id FROM servers WHERE server_id = ?')
      .get(testServerId)
    expect(rowAfter).toBeUndefined()
  })

  test('should insert, update, and delete command', () => {
    const testServerId = 'test_server_456'
    db.prepare('INSERT OR IGNORE INTO servers (server_id) VALUES (?)').run(testServerId)

    // 新增自訂指令
    db.prepare('INSERT OR REPLACE INTO commands (server_id, name, response) VALUES (?, ?, ?)').run(
      testServerId,
      'hello',
      'world'
    )

    const cmd = db
      .prepare('SELECT response FROM commands WHERE server_id = ? AND name = ?')
      .get(testServerId, 'hello')
    expect(cmd).toBeDefined()
    expect(cmd.response).toBe('world')

    // 更新自訂指令
    db.prepare('INSERT OR REPLACE INTO commands (server_id, name, response) VALUES (?, ?, ?)').run(
      testServerId,
      'hello',
      'universe'
    )

    const cmdUpdated = db
      .prepare('SELECT response FROM commands WHERE server_id = ? AND name = ?')
      .get(testServerId, 'hello')
    expect(cmdUpdated.response).toBe('universe')

    // 刪除自訂指令
    db.prepare('DELETE FROM commands WHERE server_id = ? AND name = ?').run(testServerId, 'hello')
    const cmdDeleted = db
      .prepare('SELECT response FROM commands WHERE server_id = ? AND name = ?')
      .get(testServerId, 'hello')
    expect(cmdDeleted).toBeUndefined()

    // 清理
    db.prepare('DELETE FROM servers WHERE server_id = ?').run(testServerId)
  })

  test('should get and set twitter setting', () => {
    const testServerId = 'test_server_setting'

    // 預設應為開啟 (true)
    expect(getTwitterSetting(testServerId)).toBe(true)

    // 設定為關閉 (false)
    setTwitterSetting(testServerId, false)
    expect(getTwitterSetting(testServerId)).toBe(false)

    // 設定為開啟 (true)
    setTwitterSetting(testServerId, true)
    expect(getTwitterSetting(testServerId)).toBe(true)

    // 清除測試資料
    db.prepare('DELETE FROM settings WHERE server_id = ?').run(testServerId)
    db.prepare('DELETE FROM servers WHERE server_id = ?').run(testServerId)
  })
})

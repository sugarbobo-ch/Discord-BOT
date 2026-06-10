import { getDb } from '../src/utils/db'

async function clearOldMemory() {
  console.log('連線至舊版記憶資料庫，準備清空 profile 檔案...')
  const db = getDb()

  try {
    // 檢查 user_memories 資料表是否存在
    const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='user_memories'
    `).get()

    if (!tableCheck) {
      console.log('資料庫中未偵測到 user_memories 資料表，無需清理。')
      return
    }

    // 執行 SQL 更新，只將舊文字長期記憶 profiles 清空，保留使用者的功能開關 (memory_enabled)
    const result = db.prepare("UPDATE user_memories SET profile = ''").run()
    console.log(`🧹 舊版資料庫清理完成！`)
    console.log(`   成功清空 ${result.changes} 位使用者的舊版記憶 Profile 資料。`)
  } catch (error: any) {
    console.error('清理舊記憶資料失敗:', error.message)
  } finally {
    process.exit(0)
  }
}

clearOldMemory()

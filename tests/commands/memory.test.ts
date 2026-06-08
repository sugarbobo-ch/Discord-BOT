import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest'
import { MemoryCommand } from '../../src/commands/memory'
import { CustomCommand } from '../../src/commands/custom'
import { commandRegistry } from '../../src/utils/registry'
import { getDb, setUserMemory, getUserMemory, getUserMemorySetting, setUserMemorySetting } from '../../src/utils/db'

describe('MemoryCommand Tests', () => {
  let memoryCommand: MemoryCommand
  let mockMessage: any
  let db: any

  beforeAll(() => {
    db = getDb()
  })

  beforeEach(() => {
    vi.resetAllMocks()
    memoryCommand = new MemoryCommand()
    
    mockMessage = {
      content: '!記憶',
      author: { id: 'test_user_cmd_123', username: 'TestUser' },
      reply: vi.fn().mockResolvedValue(true)
    }
  })

  test('should register correct command names', () => {
    expect(memoryCommand.names).toContain('記憶')
    expect(memoryCommand.names).toContain('memory')
    expect(memoryCommand.names).toContain('我的記憶')
  })

  test('should show empty message if no memory exists', async () => {
    // Ensure database is clean for this user
    db.prepare('DELETE FROM user_memories WHERE user_id = ?').run(mockMessage.author.id)

    mockMessage.content = '!記憶 查看'
    await memoryCommand.execute(mockMessage, ['查看'])

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('目前沒有關於你的長期記憶')
    )
  })

  test('should show user memory if it exists', async () => {
    setUserMemory(mockMessage.author.id, '- Likes coding in TypeScript\n- Loves cats')

    mockMessage.content = '!記憶 查看'
    await memoryCommand.execute(mockMessage, ['查看'])

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('Likes coding in TypeScript')
    )

    // Cleanup
    db.prepare('DELETE FROM user_memories WHERE user_id = ?').run(mockMessage.author.id)
  })

  test('should show user memory via !我的記憶 alias', async () => {
    setUserMemory(mockMessage.author.id, '- Likes coding in TypeScript\n- Loves cats')

    mockMessage.content = '!我的記憶'
    await memoryCommand.execute(mockMessage, [])

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('Likes coding in TypeScript')
    )

    // Cleanup
    db.prepare('DELETE FROM user_memories WHERE user_id = ?').run(mockMessage.author.id)
  })

  test('should clear user memory successfully', async () => {
    setUserMemory(mockMessage.author.id, '- Temp memory')

    mockMessage.content = '!記憶 清除'
    await memoryCommand.execute(mockMessage, ['清除'])

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('長期記憶已成功清除')
    )
    expect(getUserMemory(mockMessage.author.id)).toBe('')
  })

  test('should set user memory successfully', async () => {
    mockMessage.content = '!記憶 設定 我是個喜歡吃拉麵的人。'
    await memoryCommand.execute(mockMessage, ['設定', '我是個喜歡吃拉麵的人。'])

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('長期記憶已設定為')
    )
    expect(getUserMemory(mockMessage.author.id)).toBe('我是個喜歡吃拉麵的人。')

    // Cleanup
    db.prepare('DELETE FROM user_memories WHERE user_id = ?').run(mockMessage.author.id)
  })

  test('should enable memory setting successfully via subcommands', async () => {
    setUserMemorySetting(mockMessage.author.id, false)

    mockMessage.content = '!記憶 開啟'
    await memoryCommand.execute(mockMessage, ['開啟'])

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('長期記憶功能已開啟')
    )
    expect(getUserMemorySetting(mockMessage.author.id)).toBe(true)
  })

  test('should disable memory setting successfully via subcommands', async () => {
    setUserMemorySetting(mockMessage.author.id, true)

    mockMessage.content = '!記憶 關閉'
    await memoryCommand.execute(mockMessage, ['關閉'])

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('長期記憶功能已關閉')
    )
    expect(getUserMemorySetting(mockMessage.author.id)).toBe(false)
  })

  test('should show usage instructions if invalid subcommand or empty args', async () => {
    mockMessage.content = '!記憶'
    await memoryCommand.execute(mockMessage, [])
    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('使用說明')
    )

    mockMessage.content = '!記憶 invalid_subcommand'
    await memoryCommand.execute(mockMessage, ['invalid_subcommand'])
    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('使用說明')
    )
  })

  test('should route via CommandRegistry to MemoryCommand rather than CustomCommand', async () => {
    // 註冊 CustomCommand 與 MemoryCommand 以模擬真實環境
    commandRegistry.register(new CustomCommand())
    commandRegistry.register(new MemoryCommand())

    mockMessage.content = '!記憶'
    mockMessage.reply = vi.fn().mockResolvedValue(true)

    await commandRegistry.execute(mockMessage)

    // 如果正確路由到 MemoryCommand，應該會回覆 usageInstructions (包含「使用說明」)
    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('使用說明')
    )
  })
})

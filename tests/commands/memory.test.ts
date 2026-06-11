import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest'
import { MemoryCommand } from '../../src/commands/memory'
import { CustomCommand } from '../../src/commands/custom'
import { commandRegistry } from '../../src/utils/registry'
import { getDb, getUserMemorySetting, setUserMemorySetting } from '../../src/utils/db'

// Mock mem0
const { mockAdd, mockSearch, mockGetAll, mockDeleteAll } = vi.hoisted(() => {
  return {
    mockAdd: vi.fn(),
    mockSearch: vi.fn(),
    mockGetAll: vi.fn().mockResolvedValue({ results: [] }),
    mockDeleteAll: vi.fn()
  }
})

vi.mock('../../src/utils/gemini/mem0', () => {
  const mockMemory = {
    add: mockAdd,
    search: mockSearch,
    getAll: mockGetAll,
    deleteAll: mockDeleteAll
  }
  return {
    getMemory: () => mockMemory,
    executeMemoryOp: (fn: any) => fn(mockMemory)
  }
})

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
    
    const mockCollector = {
      on: vi.fn()
    }
    const mockResponse = {
      createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
      edit: vi.fn().mockResolvedValue(true)
    }
    mockMessage = {
      content: '!記憶',
      author: { id: 'test_user_cmd_123', username: 'TestUser' },
      member: { displayName: 'TestUser' },
      reply: vi.fn().mockResolvedValue(mockResponse)
    }
  })

  test('should register correct command names', () => {
    expect(memoryCommand.names).toContain('記憶')
    expect(memoryCommand.names).toContain('memory')
    expect(memoryCommand.names).toContain('我的記憶')
  })

  test('should show empty message if no memory exists', async () => {
    mockGetAll.mockResolvedValueOnce({ results: [] })

    mockMessage.content = '!記憶 查看'
    await memoryCommand.execute(mockMessage, ['查看'])

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('目前沒有關於你的長期記憶')
      })
    )
  })

  test('should show user memory if it exists', async () => {
    mockGetAll.mockResolvedValueOnce({
      results: [
        { id: '1', memory: 'Likes coding in TypeScript', createdAt: '2026-06-11T12:00:00Z' },
        { id: '2', memory: 'Loves cats', createdAt: '2026-06-11T12:01:00Z' }
      ]
    })

    mockMessage.content = '!記憶 查看'
    await memoryCommand.execute(mockMessage, ['查看'])

    expect(mockMessage.reply).toHaveBeenCalled()
    const callArgs = mockMessage.reply.mock.calls[0][0]
    expect(callArgs.embeds).toBeDefined()
    const embed = callArgs.embeds[0]
    expect(embed.data.title).toBe('🧠 波波對「TestUser」的長期記憶')
    expect(embed.data.fields).toHaveLength(2)
    // 預設是新到舊，所以 Loves cats 先
    expect(embed.data.fields[0].value).toContain('Loves cats')
    expect(embed.data.fields[1].value).toContain('Likes coding in TypeScript')
  })

  test('should show user memory via !我的記憶 alias', async () => {
    mockGetAll.mockResolvedValueOnce({
      results: [
        { id: '1', memory: 'Likes coding in TypeScript', createdAt: '2026-06-11T12:00:00Z' },
        { id: '2', memory: 'Loves cats', createdAt: '2026-06-11T12:01:00Z' }
      ]
    })

    mockMessage.content = '!我的記憶'
    await memoryCommand.execute(mockMessage, [])

    expect(mockMessage.reply).toHaveBeenCalled()
    const callArgs = mockMessage.reply.mock.calls[0][0]
    expect(callArgs.embeds).toBeDefined()
    const embed = callArgs.embeds[0]
    expect(embed.data.fields).toHaveLength(2)
    expect(embed.data.fields[0].value).toContain('Loves cats')
  })

  test('should sort user memory oldest to newest', async () => {
    mockGetAll.mockResolvedValueOnce({
      results: [
        { id: '1', memory: 'Likes coding in TypeScript', createdAt: '2026-06-11T12:00:00Z' },
        { id: '2', memory: 'Loves cats', createdAt: '2026-06-11T12:01:00Z' }
      ]
    })

    mockMessage.content = '!記憶 查看 舊到新'
    await memoryCommand.execute(mockMessage, ['查看', '舊到新'])

    expect(mockMessage.reply).toHaveBeenCalled()
    const callArgs = mockMessage.reply.mock.calls[0][0]
    const embed = callArgs.embeds[0]
    expect(embed.data.fields[0].value).toContain('Likes coding in TypeScript')
    expect(embed.data.fields[1].value).toContain('Loves cats')
  })

  test('should sort user memory alphabetically', async () => {
    mockGetAll.mockResolvedValueOnce({
      results: [
        { id: '1', memory: 'Banana', createdAt: '2026-06-11T12:00:00Z' },
        { id: '2', memory: 'Apple', createdAt: '2026-06-11T12:01:00Z' }
      ]
    })

    mockMessage.content = '!記憶 查看 字母'
    await memoryCommand.execute(mockMessage, ['查看', '字母'])

    expect(mockMessage.reply).toHaveBeenCalled()
    const callArgs = mockMessage.reply.mock.calls[0][0]
    const embed = callArgs.embeds[0]
    expect(embed.data.fields[0].value).toContain('Apple')
    expect(embed.data.fields[1].value).toContain('Banana')
  })

  test('should clear user memory successfully', async () => {
    mockMessage.content = '!記憶 清除'
    await memoryCommand.execute(mockMessage, ['清除'])

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('長期記憶已成功清除')
    )
    expect(mockDeleteAll).toHaveBeenCalledWith({ userId: mockMessage.author.id })
  })

  test('should set user memory successfully', async () => {
    mockMessage.content = '!記憶 設定 我是個喜歡吃拉麵的人。'
    
    const mockEdit = vi.fn().mockResolvedValue(true)
    mockMessage.reply.mockResolvedValueOnce({
      edit: mockEdit
    })

    await memoryCommand.execute(mockMessage, ['設定', '我是個喜歡吃拉麵的人。'])

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('正在處理並設定長期記憶')
    )
    expect(mockEdit).toHaveBeenCalledWith(
      expect.stringContaining('長期記憶已設定為')
    )
    expect(mockDeleteAll).toHaveBeenCalledWith({ userId: mockMessage.author.id })
    expect(mockAdd).toHaveBeenCalledWith('我是個喜歡吃拉麵的人。', { userId: mockMessage.author.id })
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

  test('should handle copy_all button interaction', async () => {
    mockGetAll.mockResolvedValueOnce({
      results: [
        { id: '1', memory: 'Likes coding in TypeScript', createdAt: '2026-06-11T12:00:00Z' }
      ]
    })

    let collectCallback: any
    const mockCollector = {
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'collect') {
          collectCallback = cb
        }
      })
    }
    const mockResponse = {
      createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
      edit: vi.fn().mockResolvedValue(true)
    }
    mockMessage.reply.mockResolvedValueOnce(mockResponse)

    mockMessage.content = '!記憶 查看'
    await memoryCommand.execute(mockMessage, ['查看'])

    expect(collectCallback).toBeDefined()

    // Trigger copy_all interaction
    const mockInteraction = {
      customId: 'copy_all',
      user: { id: mockMessage.author.id },
      reply: vi.fn().mockResolvedValue(true)
    }
    await collectCallback(mockInteraction)

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Likes coding in TypeScript')
      })
    )
  })

  test('should fall back to channel.send if message.reply throws Unknown Message (50035)', async () => {
    // Mock error from reply
    const discordError = new Error('Unknown Message')
    ;(discordError as any).code = 50035
    mockMessage.reply.mockRejectedValueOnce(discordError)
    
    // Mock channel.send to return a message with edit mock
    const mockEdit = vi.fn().mockResolvedValue(true)
    const mockSend = vi.fn().mockResolvedValue({
      edit: mockEdit
    })
    mockMessage.channel = {
      send: mockSend
    }

    // Apply the global safety reply wrapper mock to mockMessage
    const originalReply = mockMessage.reply
    mockMessage.reply = vi.fn().mockImplementation(async function (options: any) {
      try {
        return await originalReply(options)
      } catch (err: any) {
        if (err.code === 50035 || err.code === 10008) {
          return await mockMessage.channel.send(options)
        }
        throw err
      }
    })

    mockMessage.content = '!記憶 設定 我是個喜歡吃拉麵的人。'
    await memoryCommand.execute(mockMessage, ['設定', '我是個喜歡吃拉麵的人。'])

    expect(mockMessage.reply).toHaveBeenCalled()
    expect(mockSend).toHaveBeenCalledWith(
      expect.stringContaining('正在處理並設定長期記憶')
    )
    expect(mockEdit).toHaveBeenCalledWith(
      expect.stringContaining('長期記憶已設定為')
    )
  })
})

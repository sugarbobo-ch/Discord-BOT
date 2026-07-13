import { describe, test, expect, vi, beforeEach } from 'vitest'
import { getRollCallCommand } from '../../src/features/rollCall'

describe('RollCall Feature Tests', () => {
  let mockChannel: any
  let mockReply: any

  beforeEach(() => {
    mockChannel = {
      send: vi.fn()
    }
    mockReply = vi.fn()
  })

  test('should create roll call with !開始點名', () => {
    const mockMsg = {
      content: '!開始點名 本日點名',
      guild: { id: 'guild_roll_1' },
      channel: mockChannel,
      reply: mockReply,
      author: { id: 'user_admin' }
    } as any

    getRollCallCommand(mockMsg)
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('已建立本日點名點名清單'))
  })

  test('should add member with !點名', () => {
    // 建立點名
    const createMsg = {
      content: '!開始點名 測試點名',
      guild: { id: 'guild_roll_2' },
      channel: mockChannel,
      reply: vi.fn(),
      author: { id: 'user_admin' }
    } as any
    getRollCallCommand(createMsg)

    // 成員點名
    const joinMsg = {
      content: '!點名 小明',
      guild: { id: 'guild_roll_2' },
      channel: mockChannel,
      reply: mockReply,
      author: { id: 'user_xiaoming', toString: () => '小明' }
    } as any
    getRollCallCommand(joinMsg)

    expect(mockReply).toHaveBeenCalledWith('您已完成點名：小明')
  })

  test('should list members with !點名清單', () => {
    const createMsg = {
      content: '!開始點名 列表點名',
      guild: { id: 'guild_roll_3' },
      channel: mockChannel,
      reply: vi.fn(),
      author: { id: 'user_admin' }
    } as any
    getRollCallCommand(createMsg)

    const joinMsg = {
      content: '!點名',
      guild: { id: 'guild_roll_3' },
      channel: mockChannel,
      reply: vi.fn(),
      author: { id: 'user_xiaoming', toString: () => '小明' }
    } as any
    getRollCallCommand(joinMsg)

    const listMsg = {
      content: '!點名清單',
      guild: { id: 'guild_roll_3' },
      channel: mockChannel,
      reply: vi.fn(),
      author: { id: 'user_xiaoming' }
    } as any
    getRollCallCommand(listMsg)

    expect(listMsg.reply).toHaveBeenCalled()
    const callArgs = (listMsg.reply as any).mock.calls[0][0]
    expect(callArgs.embeds).toBeDefined()
    expect(callArgs.embeds[0].data.title).toBe('列表點名 點名清單')
  })

  test('should close roll call after 3 votes with !結束點名', () => {
    const createMsg = {
      content: '!開始點名 結束測試',
      guild: { id: 'guild_roll_4' },
      channel: mockChannel,
      reply: vi.fn(),
      author: { id: 'user_admin' }
    } as any
    getRollCallCommand(createMsg)

    const vote1 = {
      content: '!結束點名',
      guild: { id: 'guild_roll_4' },
      channel: mockChannel,
      reply: mockReply,
      author: { id: 'user_1' }
    } as any
    getRollCallCommand(vote1)
    expect(mockReply).toHaveBeenCalledWith('投票：結束結束測試點名 (1/3)')

    const vote2 = {
      content: '!結束點名',
      guild: { id: 'guild_roll_4' },
      channel: mockChannel,
      reply: mockReply,
      author: { id: 'user_2' }
    } as any
    getRollCallCommand(vote2)
    expect(mockReply).toHaveBeenCalledWith('投票：結束結束測試點名 (2/3)')

    const vote3 = {
      content: '!結束點名',
      guild: { id: 'guild_roll_4' },
      channel: mockChannel,
      reply: mockReply,
      author: { id: 'user_3' }
    } as any
    getRollCallCommand(vote3)
    expect(mockReply).toHaveBeenCalledWith('投票：結束結束測試點名 (3/3)，關閉結束測試點名')

    // 關閉後再點名應該失敗
    const joinMsg = {
      content: '!點名',
      guild: { id: 'guild_roll_4' },
      channel: mockChannel,
      reply: mockReply,
      author: { id: 'user_xiaoming' }
    } as any
    getRollCallCommand(joinMsg)
    expect(mockReply).toHaveBeenCalledWith('已經關閉點名，下次請早')
  })
})

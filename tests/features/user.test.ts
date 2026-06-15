import { describe, test, expect, vi, beforeEach } from 'vitest'
import { keep, getKeepsList } from '../../src/features/user'
import { EmbedBuilder } from 'discord.js'

describe('User Feature Tests', () => {
  let mockChannel: any

  beforeEach(() => {
    mockChannel = {
      send: vi.fn()
    }
  })

  test('should keep message and reply', () => {
    const mockReply = vi.fn()
    const mockMsg = {
      content: '!keep test message',
      author: { id: 'user_1', username: 'TestUser' },
      guild: {},
      channel: mockChannel,
      reply: mockReply
    } as any

    keep(mockMsg)
    expect(mockReply).toHaveBeenCalledWith('已儲存，注意機器人重啟後會自動清除')
  })

  test('should reply format error if keep has no arguments', () => {
    const mockReply = vi.fn()
    const mockMsg = {
      content: '!keep',
      author: { id: 'user_1', username: 'TestUser' },
      guild: {},
      channel: mockChannel,
      reply: mockReply
    } as any

    keep(mockMsg)
    expect(mockReply).toHaveBeenCalledWith('格式錯誤，正確格式為：!keep [文字訊息]')
  })

  test('should keep at most 10 messages and pop oldest', () => {
    const mockReply = vi.fn()

    // 存入 11 筆訊息
    for (let i = 1; i <= 11; i++) {
      const mockMsg = {
        content: `!keep msg${i}`,
        author: { id: 'user_1', username: 'TestUser' },
        guild: {},
        channel: mockChannel,
        reply: mockReply
      } as any
      keep(mockMsg)
    }

    const mockListMsg = {
      content: '!keeplist',
      author: { id: 'user_1', username: 'TestUser' },
      guild: {},
      channel: mockChannel,
      reply: mockReply
    } as any

    getKeepsList(mockListMsg)

    expect(mockChannel.send).toHaveBeenCalled()
    const callArgs = mockChannel.send.mock.calls[0][0]
    expect(callArgs.embeds).toBeDefined()
    const embed: EmbedBuilder = callArgs.embeds[0]

    // 因為 unshift 且上限 10 筆，最後的 10 筆應該是 msg11 到 msg2，而 msg1 (最舊) 被 pop 掉了
    // 檢查 fields 長度為 10
    const fields = (embed.data as any).fields
    expect(fields.length).toBe(10)
    // 第一筆應該是 msg11
    expect(fields[0].value).toBe('msg11')
    // 最後一筆應該是 msg2
    expect(fields[9].value).toBe('msg2')
  })

  test('should show empty message if keelist called with no kept messages', () => {
    const mockMsg = {
      content: '!keeplist',
      author: { id: 'new_user', username: 'NewUser' },
      guild: {},
      channel: mockChannel,
      reply: vi.fn()
    } as any

    getKeepsList(mockMsg)
    expect(mockChannel.send).toHaveBeenCalledWith('尚未儲存任何訊息')
  })
})

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { processLotteryCommands } from '../../src/features/lottery'

describe('Lottery Feature Tests', () => {
  let mockChannel: any
  let mockReply: any

  beforeEach(() => {
    mockChannel = {
      send: vi.fn()
    }
    mockReply = vi.fn()
  })

  test('should create lottery with !開始抽獎', () => {
    const mockMsg = {
      content: '!開始抽獎 抽大獎 5',
      guild: { id: 'guild_lot_1' },
      channel: { id: 'channel_lot_1', send: mockChannel.send },
      reply: mockReply,
      author: { id: 'user_holder' }
    } as any

    processLotteryCommands(mockMsg)
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('已建立好 抽大獎 的抽獎'))
  })

  test('should join lottery with !抽獎', () => {
    const serverConfig = { id: 'guild_lot_2' }
    const channelConfig = { id: 'channel_lot_2', send: mockChannel.send }

    const createMsg = {
      content: '!開始抽獎 抽遊戲 5',
      guild: serverConfig,
      channel: channelConfig,
      reply: vi.fn(),
      author: { id: 'user_holder' }
    } as any
    processLotteryCommands(createMsg)

    const joinMsg = {
      content: '!抽獎',
      guild: serverConfig,
      channel: channelConfig,
      reply: mockReply,
      author: { id: 'user_participant', username: 'Gamer' }
    } as any
    processLotteryCommands(joinMsg)

    expect(mockReply).toHaveBeenCalledWith('參加抽獎成功')

    // 重複參加測試
    const joinMsgAgain = {
      content: '!抽獎',
      guild: serverConfig,
      channel: channelConfig,
      reply: mockReply,
      author: { id: 'user_participant', username: 'Gamer' }
    } as any
    processLotteryCommands(joinMsgAgain)
    expect(mockReply).toHaveBeenLastCalledWith('您已經參加了抽獎，請勿重複參加')
  })

  test('should show lottery list with !抽獎名單', () => {
    const serverConfig = { id: 'guild_lot_3' }
    const channelConfig = { id: 'channel_lot_3', send: mockChannel.send }

    const createMsg = {
      content: '!開始抽獎 禮物 10',
      guild: serverConfig,
      channel: channelConfig,
      reply: vi.fn(),
      author: { id: 'user_holder' }
    } as any
    processLotteryCommands(createMsg)

    const listMsg = {
      content: '!抽獎名單',
      guild: serverConfig,
      channel: channelConfig,
      reply: vi.fn(),
      author: { id: 'user_anyone' }
    } as any
    processLotteryCommands(listMsg)

    expect(mockChannel.send).toHaveBeenCalled()
    const callArgs = mockChannel.send.mock.calls[0][0]
    expect(callArgs.embeds).toBeDefined()
    expect(callArgs.embeds[0].data.title).toBe('禮物 抽獎清單以及說明')
  })

  test('should not draw if not ended, and draw successfully after time limit', () => {
    vi.useFakeTimers()
    const serverConfig = { id: 'guild_lot_4' }
    const channelConfig = { id: 'channel_lot_4', send: mockChannel.send }

    // 建立 1 分鐘後截止的抽獎
    const createMsg = {
      content: '!開始抽獎 短期抽獎 1',
      guild: serverConfig,
      channel: channelConfig,
      reply: vi.fn(),
      author: { id: 'user_holder' }
    } as any
    processLotteryCommands(createMsg)

    const joinMsg = {
      content: '!抽獎',
      guild: serverConfig,
      channel: channelConfig,
      reply: vi.fn(),
      author: {
        id: 'user_participant_1',
        username: 'User1',
        displayAvatarURL: () => 'https://example.com/avatar1.png'
      }
    } as any
    processLotteryCommands(joinMsg)

    // 尚未結束時嘗試開獎，應回報不可開獎
    const drawMsgBefore = {
      content: '!開獎 1',
      guild: serverConfig,
      channel: channelConfig,
      reply: mockReply,
      author: { id: 'user_holder' }
    } as any
    processLotteryCommands(drawMsgBefore)
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('抽獎還在進行中'))

    // 快進 65 秒使抽獎過期
    vi.advanceTimersByTime(65 * 1000)

    // 過期後開獎，應成功
    const drawMsgAfter = {
      content: '!開獎 1',
      guild: serverConfig,
      channel: channelConfig,
      reply: mockReply,
      author: { id: 'user_holder' }
    } as any
    processLotteryCommands(drawMsgAfter)

    expect(mockChannel.send).toHaveBeenCalledWith('洗牌中...等我一下喔 >u<')
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              description: expect.stringContaining('恭喜幸運兒')
            })
          })
        ])
      })
    )

    vi.useRealTimers()
  })

  test('should close lottery and clean config with !結束抽獎', () => {
    const serverConfig = { id: 'guild_lot_5' }
    const channelConfig = { id: 'channel_lot_5', send: mockChannel.send }

    const createMsg = {
      content: '!開始抽獎 可結束抽獎 5',
      guild: serverConfig,
      channel: channelConfig,
      reply: vi.fn(),
      author: { id: 'user_holder' }
    } as any
    processLotteryCommands(createMsg)

    const closeMsg = {
      content: '!結束抽獎',
      guild: serverConfig,
      channel: channelConfig,
      reply: mockReply,
      author: { id: 'user_holder' }
    } as any
    processLotteryCommands(closeMsg)
    expect(mockReply).toHaveBeenCalledWith('已結束 可結束抽獎 抽獎活動')

    // 結束後名單應該為空/不存在
    const joinMsg = {
      content: '!抽獎',
      guild: serverConfig,
      channel: channelConfig,
      reply: mockReply,
      author: { id: 'user_anyone' }
    } as any
    processLotteryCommands(joinMsg)
    expect(mockReply).toHaveBeenLastCalledWith('目前沒有進行中的抽獎')
  })
})

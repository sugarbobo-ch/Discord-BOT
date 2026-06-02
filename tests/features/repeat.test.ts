import { describe, test, expect, vi, beforeEach } from 'vitest'
import { sendRepeatedMessage } from '../../src/features/repeat'

describe('Repeat Feature Tests', () => {
  let mockChannel: any

  beforeEach(() => {
    mockChannel = {
      id: 'channel_123',
      send: vi.fn()
    }
  })

  test('should not trigger repeat if message count is less than 5', () => {
    const mockMsg = (text: string, time: number) =>
      ({
        content: text,
        guild: { id: 'guild_123' },
        channel: mockChannel,
        createdAt: new Date(time)
      }) as any

    const baseTime = Date.now()
    for (let i = 0; i < 4; i++) {
      sendRepeatedMessage(mockMsg('hello', baseTime + i * 1000))
    }

    expect(mockChannel.send).not.toHaveBeenCalled()
  })

  test('should trigger repeat if message is repeated 5 times within 10 minutes', () => {
    const mockMsg = (text: string, time: number) =>
      ({
        content: text,
        guild: { id: 'guild_123' },
        channel: mockChannel,
        createdAt: new Date(time)
      }) as any

    const baseTime = Date.now()
    // 傳送前 4 次
    for (let i = 0; i < 4; i++) {
      sendRepeatedMessage(mockMsg('repeat me', baseTime + i * 1000))
    }
    expect(mockChannel.send).not.toHaveBeenCalled()

    // 傳送第 5 次
    sendRepeatedMessage(mockMsg('repeat me', baseTime + 4000))
    expect(mockChannel.send).toHaveBeenCalledWith('repeat me')
  })

  test('should not trigger repeat if time gap between 1st and 5th messages is more than 10 minutes', () => {
    const mockChannelExtended = {
      id: 'channel_extended',
      send: vi.fn()
    }
    const mockMsg = (text: string, time: number) =>
      ({
        content: text,
        guild: { id: 'guild_extended' },
        channel: mockChannelExtended,
        createdAt: new Date(time)
      }) as any

    const baseTime = Date.now()

    // 第 1 次
    sendRepeatedMessage(mockMsg('too slow', baseTime))
    // 第 2, 3, 4 次
    for (let i = 1; i <= 3; i++) {
      sendRepeatedMessage(mockMsg('too slow', baseTime + i * 1000))
    }
    // 第 5 次 (比第 1 次多 10 分鐘 1 秒，即 601000 毫秒)
    sendRepeatedMessage(mockMsg('too slow', baseTime + 601000))

    expect(mockChannelExtended.send).not.toHaveBeenCalled()
  })
})

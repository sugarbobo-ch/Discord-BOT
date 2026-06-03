import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkAndFixTwitterEmbed } from '../../src/features/twitter'
import { getTwitterSetting } from '../../src/utils/db'

vi.mock('../../src/utils/db', () => ({
  getTwitterSetting: vi.fn()
}))

describe('Twitter Embed Fixer Feature Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(getTwitterSetting).mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('should do nothing if message does not contain x.com link', () => {
    const mockChannel = {
      messages: {
        fetch: vi.fn()
      },
      send: vi.fn()
    }
    const mockMessage = {
      id: '123',
      content: 'hello world',
      channel: mockChannel
    } as any

    checkAndFixTwitterEmbed(mockMessage)
    vi.runAllTimers()

    expect(mockChannel.messages.fetch).not.toHaveBeenCalled()
    expect(mockChannel.send).not.toHaveBeenCalled()
  })

  test('should do nothing if x.com link exists and embeds are present after delay', async () => {
    const mockChannel = {
      messages: {
        fetch: vi.fn()
      },
      send: vi.fn()
    }
    const mockMessage = {
      id: '123',
      content: 'check this: https://x.com/user/status/123456',
      channel: mockChannel
    } as any

    // Mock fetch to resolve with a message that has embeds
    mockChannel.messages.fetch.mockResolvedValue({
      id: '123',
      content: 'check this: https://x.com/user/status/123456',
      embeds: [{ title: 'Tweet Title' }]
    })

    checkAndFixTwitterEmbed(mockMessage)

    // Fast-forward timers
    await vi.runAllTimersAsync()

    expect(mockChannel.messages.fetch).toHaveBeenCalledWith('123')
    expect(mockChannel.send).not.toHaveBeenCalled()
  })

  test('should replace x.com with fixvx.com if no embeds are present after delay', async () => {
    const mockChannel = {
      messages: {
        fetch: vi.fn()
      },
      send: vi.fn()
    }
    const mockMessage = {
      id: '123',
      content: 'check this: https://x.com/user/status/123456',
      channel: mockChannel
    } as any

    // Mock fetch to resolve with a message that has NO embeds
    mockChannel.messages.fetch.mockResolvedValue({
      id: '123',
      content: 'check this: https://x.com/user/status/123456',
      embeds: []
    })

    checkAndFixTwitterEmbed(mockMessage)

    // Fast-forward timers
    await vi.runAllTimersAsync()

    expect(mockChannel.messages.fetch).toHaveBeenCalledWith('123')
    expect(mockChannel.send).toHaveBeenCalledWith(
      'check this: https://fixvx.com/user/status/123456'
    )
  })

  test('should do nothing if x.com link exists but twitter detection setting is disabled', async () => {
    vi.mocked(getTwitterSetting).mockReturnValue(false)
    const mockChannel = {
      messages: {
        fetch: vi.fn()
      },
      send: vi.fn()
    }
    const mockMessage = {
      id: '123',
      content: 'check this: https://x.com/user/status/123456',
      guild: { id: 'guild123' },
      channel: mockChannel
    } as any

    checkAndFixTwitterEmbed(mockMessage)
    await vi.runAllTimersAsync()

    expect(mockChannel.messages.fetch).not.toHaveBeenCalled()
    expect(mockChannel.send).not.toHaveBeenCalled()
  })
})

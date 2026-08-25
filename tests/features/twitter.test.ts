import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkAndFixTwitterEmbed,
  replaceTwitterUrls,
  hasRichMediaEmbed
} from '../../src/features/twitter'
import { getTwitterSetting } from '../../src/utils/db'

vi.mock('../../src/utils/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/utils/db')>()
  return {
    ...actual,
    getTwitterSetting: vi.fn()
  }
})

describe('Twitter Embed Fixer Feature Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(getTwitterSetting).mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('replaceTwitterUrls helper', () => {
    test('should replace x.com with fixupx.com', () => {
      const input = 'Check this: https://x.com/BXlM08/status/2092182306769518961?s=20'
      const output = replaceTwitterUrls(input)
      expect(output).toBe('Check this: https://fixupx.com/BXlM08/status/2092182306769518961?s=20')
    })

    test('should replace twitter.com with fxtwitter.com', () => {
      const input = 'Check this: https://twitter.com/user/status/123456'
      const output = replaceTwitterUrls(input)
      expect(output).toBe('Check this: https://fxtwitter.com/user/status/123456')
    })

    test('should replace both x.com and twitter.com in same message', () => {
      const input = 'Link1: https://x.com/a/status/1 and Link2: https://www.twitter.com/b/status/2'
      const output = replaceTwitterUrls(input)
      expect(output).toBe(
        'Link1: https://fixupx.com/a/status/1 and Link2: https://fxtwitter.com/b/status/2'
      )
    })
  })

  describe('hasRichMediaEmbed helper', () => {
    test('should return false for null, undefined, or empty embeds', () => {
      expect(hasRichMediaEmbed(null)).toBe(false)
      expect(hasRichMediaEmbed(undefined)).toBe(false)
      expect(hasRichMediaEmbed([])).toBe(false)
    })

    test('should return false if embed only contains title/description with no media', () => {
      expect(hasRichMediaEmbed([{ title: 'Tweet title', description: 'Some text' }])).toBe(false)
    })

    test('should return false if thumbnail is only default twitter avatar icon', () => {
      expect(
        hasRichMediaEmbed([
          { thumbnail: { url: 'https://abs.twimg.com/favicons/twitter.3.ico' } }
        ])
      ).toBe(false)
    })

    test('should return false if embed is generic X Post placeholder', () => {
      expect(
        hasRichMediaEmbed([
          {
            title: 'Post',
            description: 'Post',
            image: { url: 'https://abs.twimg.com/responsive-web/client-web/seo.jpg' }
          }
        ])
      ).toBe(false)
    })

    test('should return true if embed has an image', () => {
      expect(
        hasRichMediaEmbed([{ image: { url: 'https://pbs.twimg.com/media/test.jpg' } }])
      ).toBe(true)
    })

    test('should return true if embed has a video', () => {
      expect(
        hasRichMediaEmbed([{ video: { url: 'https://video.twimg.com/test.mp4' } }])
      ).toBe(true)
    })

    test('should return true if embed has custom thumbnail image', () => {
      expect(
        hasRichMediaEmbed([
          { thumbnail: { url: 'https://pbs.twimg.com/media/custom_thumb.jpg' } }
        ])
      ).toBe(true)
    })
  })

  describe('checkAndFixTwitterEmbed', () => {
    test('should do nothing if message does not contain x.com or twitter.com link', () => {
      const mockChannel = {
        messages: {
          fetch: vi.fn()
        },
        send: vi.fn()
      }
      const mockMessage = {
        id: '123',
        content: 'hello world https://example.com',
        channel: mockChannel
      } as any

      checkAndFixTwitterEmbed(mockMessage)
      vi.runAllTimers()

      expect(mockChannel.messages.fetch).not.toHaveBeenCalled()
      expect(mockChannel.send).not.toHaveBeenCalled()
    })

    test('should do nothing if link exists and rich embeds (image/video) are present after delay', async () => {
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

      // Mock fetch to resolve with a message that has image embed
      mockChannel.messages.fetch.mockResolvedValue({
        id: '123',
        content: 'check this: https://x.com/user/status/123456',
        embeds: [{ title: 'Tweet Title', image: { url: 'https://pbs.twimg.com/media/pic.jpg' } }]
      })

      checkAndFixTwitterEmbed(mockMessage)

      // Fast-forward timers
      await vi.runAllTimersAsync()

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith('123')
      expect(mockChannel.send).not.toHaveBeenCalled()
    })

    test('should replace x.com with fixupx.com if no embeds are present after delay', async () => {
      const mockChannel = {
        messages: {
          fetch: vi.fn()
        },
        send: vi.fn()
      }
      const mockMessage = {
        id: '123',
        content: 'check this: https://x.com/BXlM08/status/2092182306769518961?s=20',
        channel: mockChannel
      } as any

      // Mock fetch to resolve with a message that has NO embeds
      mockChannel.messages.fetch.mockResolvedValue({
        id: '123',
        content: 'check this: https://x.com/BXlM08/status/2092182306769518961?s=20',
        embeds: []
      })

      checkAndFixTwitterEmbed(mockMessage)

      // Fast-forward timers
      await vi.runAllTimersAsync()

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith('123')
      expect(mockChannel.send).toHaveBeenCalledWith(
        'check this: https://fixupx.com/BXlM08/status/2092182306769518961?s=20'
      )
    })

    test('should replace x.com with fixupx.com if embed exists but lacks media (e.g. text/article card only)', async () => {
      const mockChannel = {
        messages: {
          fetch: vi.fn()
        },
        send: vi.fn()
      }
      const mockMessage = {
        id: '123',
        content: 'check this: https://x.com/BXlM08/status/2092182306769518961?s=20',
        channel: mockChannel
      } as any

      // Mock fetch to resolve with a message that has embed but NO image or video
      mockChannel.messages.fetch.mockResolvedValue({
        id: '123',
        content: 'check this: https://x.com/BXlM08/status/2092182306769518961?s=20',
        embeds: [{ title: 'X Link with no media preview' }]
      })

      checkAndFixTwitterEmbed(mockMessage)

      // Fast-forward timers
      await vi.runAllTimersAsync()

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith('123')
      expect(mockChannel.send).toHaveBeenCalledWith(
        'check this: https://fixupx.com/BXlM08/status/2092182306769518961?s=20'
      )
    })

    test('should replace twitter.com with fxtwitter.com if embeds lack media', async () => {
      const mockChannel = {
        messages: {
          fetch: vi.fn()
        },
        send: vi.fn()
      }
      const mockMessage = {
        id: '123',
        content: 'check this: https://twitter.com/user/status/123456',
        channel: mockChannel
      } as any

      mockChannel.messages.fetch.mockResolvedValue({
        id: '123',
        content: 'check this: https://twitter.com/user/status/123456',
        embeds: []
      })

      checkAndFixTwitterEmbed(mockMessage)
      await vi.runAllTimersAsync()

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith('123')
      expect(mockChannel.send).toHaveBeenCalledWith(
        'check this: https://fxtwitter.com/user/status/123456'
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
})


import { describe, test, expect, vi, beforeEach } from 'vitest'
import { isSuspiciousLink, handleAutoMod, spamTracker } from '../../src/features/automod'
import { addForbiddenWord, getForbiddenWords } from '../../src/utils/db'

vi.mock('../../src/utils/db', async (importOriginal) => {
  const actual = await importOriginal() as any
  let fakeWords: string[] = []
  return {
    ...actual,
    getForbiddenWords: vi.fn().mockImplementation(() => fakeWords),
    addForbiddenWord: vi.fn().mockImplementation((guildId, word) => { fakeWords.push(word) })
  }
})

describe('AutoMod Scanner Tests', () => {
  let mockMessage: any
  let mockMember: any
  let mockChannel: any

  beforeEach(() => {
    vi.clearAllMocks()
    spamTracker.clear()

    mockMember = {
      permissions: {
        has: vi.fn().mockReturnValue(false) // Not admin by default
      },
      moderatable: true,
      bannable: true,
      timeout: vi.fn().mockResolvedValue(true),
      ban: vi.fn().mockResolvedValue(true)
    }

    mockChannel = {
      id: 'channel_1',
      send: vi.fn().mockResolvedValue(true)
    }

    mockMessage = {
      id: 'msg_1',
      content: '',
      guild: { id: 'guild_test' },
      channel: mockChannel,
      member: mockMember,
      author: { id: 'user_123', tag: 'Spammer#0000' },
      mentions: { everyone: false },
      reply: vi.fn().mockResolvedValue({ delete: vi.fn() }),
      delete: vi.fn().mockResolvedValue(true),
      deletable: true,
      client: {
        channels: {
          fetch: vi.fn().mockImplementation(async (id) => {
            return {
              id,
              messages: {
                fetch: vi.fn().mockImplementation(async (msgId) => ({
                  id: msgId,
                  deletable: true,
                  delete: vi.fn().mockResolvedValue(true)
                }))
              }
            }
          })
        }
      }
    } as any
  })

  describe('isSuspiciousLink', () => {
    test('should identify official domains as safe', () => {
      expect(isSuspiciousLink('Check this out: https://discord.gg/invite')).toBe(false)
      expect(isSuspiciousLink('Check this out: https://discord.com/login')).toBe(false)
      expect(isSuspiciousLink('Check this out: https://steamcommunity.com/id/profile')).toBe(false)
    })

    test('should identify typosquatted/lookalike domains as suspicious', () => {
      expect(isSuspiciousLink('https://dlscord.gift/nitro')).toBe(true)
      expect(isSuspiciousLink('https://discord-gift.ru.com/claim')).toBe(true)
      expect(isSuspiciousLink('https://steamcommmunity.xyz/free-game')).toBe(true)
      expect(isSuspiciousLink('https://discordd.gift/free')).toBe(true)
    })

    test('should identify suspicious keywords and sketchy TLDs as suspicious', () => {
      expect(isSuspiciousLink('https://claim-free-nitro.ru/info')).toBe(true)
      expect(isSuspiciousLink('https://steam-nitro-airdrop.xyz/login')).toBe(true)
    })
  })

  describe('handleAutoMod - Forbidden Words', () => {
    test('should timeout non-admin users and delete message when forbidden word is matched', async () => {
      vi.mocked(getForbiddenWords).mockReturnValueOnce(['壞字', '笨蛋'])
      mockMessage.content = '你這個笨蛋！'

      const result = await handleAutoMod(mockMessage)

      expect(result).toBe(true)
      expect(mockMember.timeout).toHaveBeenCalledWith(60 * 1000, expect.stringContaining('笨蛋'))
      expect(mockMessage.delete).toHaveBeenCalled()
    })

    test('should exempt administrators from forbidden word timeout', async () => {
      vi.mocked(getForbiddenWords).mockReturnValueOnce(['笨蛋'])
      mockMessage.content = '你這個笨蛋！'
      mockMember.permissions.has.mockReturnValue(true) // Admin status

      const result = await handleAutoMod(mockMessage)

      expect(result).toBe(false)
      expect(mockMember.timeout).not.toHaveBeenCalled()
      expect(mockMessage.delete).not.toHaveBeenCalled()
    })
  })

  describe('handleAutoMod - @everyone Phishing Protection', () => {
    test('should delete single phishing message first', async () => {
      mockMessage.content = '@everyone 免費領取 Nitro! https://dlscord.gift/nitro'
      mockMessage.mentions.everyone = true

      const result = await handleAutoMod(mockMessage)

      expect(result).toBe(true)
      expect(mockMessage.delete).toHaveBeenCalled()
      expect(mockMember.ban).not.toHaveBeenCalled() // Only posted in 1 channel so far
    })

    test('should ban user and delete all posts when phishing message is sent across multiple channels', async () => {
      // Channel 1 post
      mockMessage.content = '@everyone 免費領取 Nitro! https://dlscord.gift/nitro'
      mockMessage.mentions.everyone = true
      mockMessage.channel.id = 'channel_1'
      mockMessage.id = 'msg_ch1'
      await handleAutoMod(mockMessage)

      // Channel 2 post (within 60 seconds)
      const mockMsg2 = {
        ...mockMessage,
        id: 'msg_ch2',
        channel: { id: 'channel_2', send: vi.fn() }
      } as any
      
      const result = await handleAutoMod(mockMsg2)

      expect(result).toBe(true)
      expect(mockMember.ban).toHaveBeenCalledWith({ reason: expect.stringContaining('跨頻道發送 @everyone 釣魚連結') })
      expect(mockMsg2.channel.send).toHaveBeenCalledWith(expect.stringContaining('已被系統封鎖'))
    })
  })
})

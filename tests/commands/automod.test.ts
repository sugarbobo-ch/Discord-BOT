import { describe, test, expect, vi, beforeEach } from 'vitest'
import { AutoModCommand } from '../../src/commands/automod'
import { addForbiddenWord, removeForbiddenWord, getForbiddenWords } from '../../src/utils/db'

vi.mock('../../src/utils/db', () => ({
  addForbiddenWord: vi.fn(),
  removeForbiddenWord: vi.fn(),
  getForbiddenWords: vi.fn().mockReturnValue([])
}))

describe('AutoModCommand Tests', () => {
  let automodCommand: AutoModCommand
  let mockMessage: any
  let mockInteraction: any
  let mockReply: any

  beforeEach(() => {
    vi.clearAllMocks()
    automodCommand = new AutoModCommand()
    mockReply = vi.fn()

    mockMessage = {
      content: '',
      guild: { id: 'guild_123' },
      guildId: 'guild_123',
      reply: mockReply,
      member: {
        permissions: {
          has: vi.fn().mockReturnValue(true) // Admin by default
        }
      }
    } as any

    mockInteraction = {
      commandName: 'automod',
      guildId: 'guild_123',
      guild: { id: 'guild_123' },
      memberPermissions: {
        has: vi.fn().mockReturnValue(true) // Admin by default
      },
      options: {
        getSubcommand: vi.fn(),
        getString: vi.fn()
      },
      reply: mockReply
    } as any
  })

  describe('execute (prefix message commands)', () => {
    test('should reject non-admin users', async () => {
      mockMessage.member.permissions.has.mockReturnValue(false)
      mockMessage.content = '!automod 新增 壞字'
      
      await automodCommand.execute(mockMessage, ['新增', '壞字'])

      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('只有管理員'))
      expect(addForbiddenWord).not.toHaveBeenCalled()
    })

    test('should add forbidden word successfully', async () => {
      mockMessage.content = '!automod 新增 壞字'
      await automodCommand.execute(mockMessage, ['新增', '壞字'])

      expect(addForbiddenWord).toHaveBeenCalledWith('guild_123', '壞字')
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('已成功新增禁用詞語：`壞字`'))
    })

    test('should remove forbidden word successfully', async () => {
      mockMessage.content = '!automod 移除 壞字'
      await automodCommand.execute(mockMessage, ['移除', '壞字'])

      expect(removeForbiddenWord).toHaveBeenCalledWith('guild_123', '壞字')
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('已成功移除禁用詞語：`壞字`'))
    })

    test('should list forbidden words successfully', async () => {
      vi.mocked(getForbiddenWords).mockReturnValueOnce(['壞詞1', '壞詞2'])
      mockMessage.content = '!automod 列表'
      await automodCommand.execute(mockMessage, ['列表'])

      expect(getForbiddenWords).toHaveBeenCalledWith('guild_123')
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('壞詞1'))
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('壞詞2'))
    })
  })

  describe('executeSlash (slash commands)', () => {
    test('should add forbidden word via slash command', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('新增')
      mockInteraction.options.getString.mockReturnValue('壞字S')

      await automodCommand.executeSlash(mockInteraction)

      expect(addForbiddenWord).toHaveBeenCalledWith('guild_123', '壞字S')
      expect(mockReply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('已成功新增禁用詞語：`壞字S`'),
        flags: 64 // Ephemeral flag
      }))
    })
  })
})

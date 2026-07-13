import { describe, test, expect, vi, beforeEach } from 'vitest'
import { RollCallCommand } from '../../src/commands/rollcall'

describe('RollCallCommand Tests', () => {
  let rollCallCommand: RollCallCommand
  let mockMessage: any
  let mockInteraction: any
  let mockReply: any
  let mockChannel: any

  beforeEach(() => {
    vi.restoreAllMocks()
    rollCallCommand = new RollCallCommand()
    mockReply = vi.fn()
    mockChannel = {
      send: vi.fn(),
      isTextBased: () => true
    }

    mockMessage = {
      content: '',
      guild: { id: 'test_guild_rc' },
      guildId: 'test_guild_rc',
      channel: mockChannel,
      reply: mockReply,
      author: { id: 'test_user_rc', username: 'TestUser', toString: () => 'TestUser' }
    } as any

    mockInteraction = {
      commandName: '',
      guildId: 'test_guild_rc',
      guild: { id: 'test_guild_rc' },
      channel: mockChannel,
      user: { id: 'test_user_rc', username: 'TestUser', toString: () => 'TestUser' },
      options: {
        getString: vi.fn()
      },
      reply: mockReply
    } as any
  })

  describe('execute (prefix message commands)', () => {
    test('should start roll call and add member', async () => {
      mockMessage.guild.id = 'guild_rc_execute_1'
      mockMessage.guildId = 'guild_rc_execute_1'

      // Start roll call
      mockMessage.content = '!開始點名 本日點名'
      await rollCallCommand.execute(mockMessage, ['本日點名'])
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('已建立本日點名點名清單'))

      // Join roll call
      mockReply.mockClear()
      mockMessage.content = '!點名'
      await rollCallCommand.execute(mockMessage, [])
      expect(mockReply).toHaveBeenCalledWith('您已完成點名：TestUser')
    })

    test('should close roll call after 3 votes', async () => {
      mockMessage.guild.id = 'guild_rc_execute_2'
      mockMessage.guildId = 'guild_rc_execute_2'

      // Start roll call
      mockMessage.content = '!開始點名 點名點名'
      await rollCallCommand.execute(mockMessage, ['點名點名'])

      // Votes to close
      mockReply.mockClear()
      mockMessage.content = '!結束點名'
      mockMessage.author = { id: 'user1', username: 'User1' } as any
      await rollCallCommand.execute(mockMessage, [])
      expect(mockReply).toHaveBeenCalledWith('投票：結束點名點名點名 (1/3)')

      mockReply.mockClear()
      mockMessage.author = { id: 'user2', username: 'User2' } as any
      await rollCallCommand.execute(mockMessage, [])
      expect(mockReply).toHaveBeenCalledWith('投票：結束點名點名點名 (2/3)')

      mockReply.mockClear()
      mockMessage.author = { id: 'user3', username: 'User3' } as any
      await rollCallCommand.execute(mockMessage, [])
      expect(mockReply).toHaveBeenCalledWith('投票：結束點名點名點名 (3/3)，關閉點名點名點名')
    })
  })

  describe('executeSlash (slash commands)', () => {
    test('should handle start roll call and add member via slash command', async () => {
      mockInteraction.guildId = 'guild_rc_slash_1'
      mockInteraction.guild.id = 'guild_rc_slash_1'

      // Start roll call
      mockInteraction.commandName = '開始點名'
      mockInteraction.options.getString.mockReturnValue('本日點名-S')
      await rollCallCommand.executeSlash(mockInteraction)
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('已建立本日點名-S點名清單'))

      // Join roll call with remark
      mockReply.mockClear()
      mockInteraction.commandName = '點名'
      mockInteraction.options.getString.mockReturnValue('我在線上')
      await rollCallCommand.executeSlash(mockInteraction)
      expect(mockReply).toHaveBeenCalledWith('您已完成點名：我在線上')
    })
  })
})

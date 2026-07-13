import { describe, test, expect, vi, beforeEach } from 'vitest'
import { LotteryCommand } from '../../src/commands/lottery'

describe('LotteryCommand Tests', () => {
  let lotteryCommand: LotteryCommand
  let mockMessage: any
  let mockInteraction: any
  let mockReply: any
  let mockChannel: any

  beforeEach(() => {
    vi.restoreAllMocks()
    lotteryCommand = new LotteryCommand()
    mockReply = vi.fn()
    mockChannel = {
      send: vi.fn(),
      isTextBased: () => true
    }

    mockMessage = {
      content: '',
      guild: { id: 'test_guild_lot' },
      guildId: 'test_guild_lot',
      channel: { id: 'test_channel_lot', send: mockChannel.send, isTextBased: () => true },
      reply: mockReply,
      author: { id: 'test_user_lot', username: 'TestUser', displayAvatarURL: () => 'avatar_url' }
    } as any

    mockInteraction = {
      commandName: '',
      guildId: 'test_guild_lot',
      guild: { id: 'test_guild_lot' },
      channel: { id: 'test_channel_lot', send: mockChannel.send, isTextBased: () => true },
      user: { id: 'test_user_lot', username: 'TestUser', displayAvatarURL: () => 'avatar_url' },
      options: {
        getString: vi.fn(),
        getInteger: vi.fn()
      },
      reply: mockReply
    } as any
  })

  describe('execute (prefix message commands)', () => {
    test('should start and join lottery successfully', async () => {
      mockMessage.guild.id = 'guild_lot_execute_1'
      mockMessage.guildId = 'guild_lot_execute_1'
      mockMessage.channel.id = 'channel_lot_execute_1'

      // Start lottery
      mockMessage.content = '!開始抽獎 抽大獎 5'
      await lotteryCommand.execute(mockMessage, ['抽大獎', '5'])
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('已建立好 抽大獎 的抽獎'))

      // Join lottery
      mockReply.mockClear()
      mockMessage.content = '!抽獎'
      mockMessage.author = { id: 'participant_1', username: 'Participant 1' } as any
      await lotteryCommand.execute(mockMessage, [])
      expect(mockReply).toHaveBeenCalledWith('參加抽獎成功')
    })

    test('should show command help list', async () => {
      mockMessage.guild.id = 'guild_lot_execute_2'
      mockMessage.guildId = 'guild_lot_execute_2'
      mockMessage.channel.id = 'channel_lot_execute_2'

      mockMessage.content = '!抽獎指令'
      await lotteryCommand.execute(mockMessage, [])
      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '抽獎功能指令與介紹'
              })
            })
          ])
        })
      )
    })
  })

  describe('executeSlash (slash commands)', () => {
    test('should handle start and join lottery via slash commands', async () => {
      mockInteraction.guildId = 'guild_lot_slash_1'
      mockInteraction.guild.id = 'guild_lot_slash_1'
      mockInteraction.channel.id = 'channel_lot_slash_1'

      // Start lottery
      mockInteraction.commandName = '開始抽獎'
      mockInteraction.options.getString.mockReturnValue('抽Switch')
      mockInteraction.options.getInteger.mockReturnValue(10)
      await lotteryCommand.executeSlash(mockInteraction)
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('已建立好 抽Switch 的抽獎'))

      // Join lottery
      mockReply.mockClear()
      mockInteraction.commandName = '抽獎'
      mockInteraction.user = { id: 'participant_2', username: 'Participant 2' } as any
      await lotteryCommand.executeSlash(mockInteraction)
      expect(mockReply).toHaveBeenCalledWith('參加抽獎成功')
    })
  })
})

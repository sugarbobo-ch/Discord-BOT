import { describe, test, expect, vi, beforeEach } from 'vitest'
import { UserCommand } from '../../src/commands/user'

describe('UserCommand Tests', () => {
  let userCommand: UserCommand
  let mockMessage: any
  let mockInteraction: any
  let mockReply: any

  beforeEach(() => {
    vi.restoreAllMocks()
    userCommand = new UserCommand()
    mockReply = vi.fn()

    mockMessage = {
      content: '',
      author: { id: 'test_user_id', username: 'TestUser' },
      reply: mockReply,
      channel: {
        send: vi.fn()
      }
    } as any

    mockInteraction = {
      commandName: '',
      user: { id: 'test_user_id', username: 'TestUser' },
      options: {
        getString: vi.fn()
      },
      reply: mockReply,
      editReply: vi.fn(),
      channel: {
        send: vi.fn()
      }
    } as any
  })

  describe('execute (prefix message commands)', () => {
    test('should keep message and reply', async () => {
      mockMessage.content = '!keep test message content'
      mockMessage.author.id = 'user_prefix_keep'
      await userCommand.execute(mockMessage, ['test', 'message', 'content'])
      expect(mockReply).toHaveBeenCalledWith('已儲存，注意機器人重啟後會自動清除')
    })

    test('should reply format error if keep has no args', async () => {
      mockMessage.content = '!keep'
      mockMessage.author.id = 'user_prefix_empty_keep'
      await userCommand.execute(mockMessage, [])
      expect(mockReply).toHaveBeenCalledWith('格式錯誤，正確格式為：!keep [文字訊息]')
    })

    test('should show empty message if keeplist has no kept messages', async () => {
      mockMessage.content = '!keeplist'
      mockMessage.author.id = 'user_prefix_keeplist_empty'
      await userCommand.execute(mockMessage, [])
      expect(mockReply).toHaveBeenCalledWith('尚未儲存任何訊息')
    })
  })

  describe('executeSlash (slash commands)', () => {
    test('should keep message via slash command', async () => {
      mockInteraction.commandName = 'keep'
      mockInteraction.user.id = 'user_slash_keep'
      mockInteraction.options.getString.mockReturnValue('slash keep message')
      await userCommand.executeSlash(mockInteraction)

      expect(mockInteraction.options.getString).toHaveBeenCalledWith('message', true)
      expect(mockReply).toHaveBeenCalledWith({
        content: '已儲存，注意機器人重啟後會自動清除',
        ephemeral: true
      })
    })

    test('should show keeplist via slash command', async () => {
      // First save a message using slash command
      mockInteraction.commandName = 'keep'
      mockInteraction.user.id = 'user_slash_keeplist'
      mockInteraction.options.getString.mockReturnValue('slash keep message')
      await userCommand.executeSlash(mockInteraction)

      // Then read the keeplist
      mockReply.mockClear()
      mockInteraction.commandName = 'keeplist'
      await userCommand.executeSlash(mockInteraction)

      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: 'Keep 列表'
              })
            })
          ])
        })
      )
    })
  })
})

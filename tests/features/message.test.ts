import { describe, test, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import {
  checkPrefix,
  checkMentions,
  checkEmoji,
  getCommandName,
  isNormalCommand,
  editCommand,
  checkCommand,
  getImageCommand,
  getMediaCommand,
  readCommandDict,
  isCustomCommandResponse,
  shouldSkipDialogueTrigger
} from '../../src/features/message'
import { CustomCommand } from '../../src/commands/custom'
import { getDb } from '../../src/utils/db'
import * as fileManager from '../../src/utils/file'
import { checkImageNSFW } from '../../src/utils/gemini'
import fs from 'fs'
import { commandRegistry } from '../../src/utils/registry'

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    promises: {
      readFile: vi.fn().mockResolvedValue(Buffer.from('dummy_image_data')),
      unlink: vi.fn().mockResolvedValue(undefined)
    }
  },
  existsSync: vi.fn().mockReturnValue(true),
  promises: {
    readFile: vi.fn().mockResolvedValue(Buffer.from('dummy_image_data')),
    unlink: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('../../src/utils/file', () => ({
  downloadFile: vi.fn().mockResolvedValue('assets/images/testfolder/image.png'),
  removeFile: vi.fn().mockResolvedValue(undefined),
  getRandomFile: vi.fn().mockResolvedValue('assets/images/testfolder/image.png'),
  checkFileDirectoryIsExist: vi.fn().mockReturnValue(true),
  isImage: vi.fn().mockReturnValue(true)
}))

vi.mock('../../src/utils/gemini', () => ({
  checkImageNSFW: vi.fn().mockResolvedValue({ nsfw: false, reason: '' })
}))

const mockMessage = (content: string, guildId = 'test_guild_message_feature') => {
  const channelSendMock = vi.fn().mockResolvedValue(true)
  const messageReplyMock = vi.fn().mockResolvedValue(true)
  return {
    content,
    guild: {
      id: guildId
    },
    channel: {
      isTextBased: () => true,
      nsfw: false,
      send: channelSendMock
    },
    reply: messageReplyMock,
    author: { bot: false, id: '123', username: 'testuser' },
    member: { displayName: 'testnickname' }
  } as any
}

describe('Message Feature Tests', () => {
  describe('checkPrefix', () => {
    test('should return true for messages starting with ! or ！', () => {
      expect(checkPrefix(mockMessage('!help'))).toBe(true)
      expect(checkPrefix(mockMessage('！list'))).toBe(true)
    })

    test('should return false for messages not starting with prefix', () => {
      expect(checkPrefix(mockMessage('hello'))).toBe(false)
      expect(checkPrefix(mockMessage(' !help'))).toBe(false) // 空白開頭
    })

    test('should return false for single prefix message', () => {
      expect(checkPrefix(mockMessage('!'))).toBe(false)
      expect(checkPrefix(mockMessage('！'))).toBe(false)
    })
  })

  describe('checkMentions', () => {
    test('should return true if message contains mention', () => {
      expect(checkMentions(mockMessage('hello <@123456789>'))).toBe(true)
      expect(checkMentions('<@123456789>')).toBe(true)
    })

    test('should return false if message does not contain mention', () => {
      expect(checkMentions(mockMessage('hello world'))).toBe(false)
      expect(checkMentions('hello')).toBe(false)
    })
  })

  describe('checkEmoji', () => {
    test('should return true if message starts with custom emoji syntax', () => {
      expect(checkEmoji(mockMessage('<:emoji:123456789>'))).toBe(true)
      expect(checkEmoji('<:emoji:123456789>')).toBe(true)
    })

    test('should return false if message does not start with custom emoji syntax', () => {
      expect(checkEmoji(mockMessage('hello <:emoji:123456789>'))).toBe(false)
      expect(checkEmoji('hello')).toBe(false)
    })
  })

  describe('getCommandName', () => {
    test('should extract command name correctly', () => {
      expect(getCommandName(mockMessage('!help'))).toBe('help')
      expect(getCommandName(mockMessage('!add cmd text'))).toBe('add')
      expect(getCommandName(mockMessage('！list'))).toBe('list')
    })

    test('should handle mention commands correctly', () => {
      expect(getCommandName(mockMessage('<@123456789>'))).toBe('<@123456789>')
    })

    test('should handle emoji commands correctly', () => {
      expect(getCommandName(mockMessage('<:emoji:123456789>'))).toBe('<:emoji:123456789>')
    })
  })

  describe('isNormalCommand', () => {
    test('should identify non-keyword commands as normal commands', () => {
      expect(isNormalCommand(mockMessage('!hello'))).toEqual({
        isNormalCommand: true,
        name: 'hello'
      })
      expect(isNormalCommand(mockMessage('!image'))).toEqual({
        isNormalCommand: true,
        name: 'image'
      })
    })

    test('should identify keywords as system commands', () => {
      expect(isNormalCommand(mockMessage('!add'))).toEqual({ isNormalCommand: false, name: 'add' })
      expect(isNormalCommand(mockMessage('!remove'))).toEqual({
        isNormalCommand: false,
        name: 'remove'
      })
      expect(isNormalCommand(mockMessage('!list'))).toEqual({
        isNormalCommand: false,
        name: 'list'
      })
      expect(isNormalCommand(mockMessage('!記憶'))).toEqual({
        isNormalCommand: false,
        name: '記憶'
      })
      expect(isNormalCommand(mockMessage('!memory'))).toEqual({
        isNormalCommand: false,
        name: 'memory'
      })
      expect(isNormalCommand(mockMessage('!我的記憶'))).toEqual({
        isNormalCommand: false,
        name: '我的記憶'
      })
    })
  })

  describe('Custom Command Management Integration Tests', () => {
    const testServerId = 'test_guild_message_feature'
    let db: any

    beforeAll(() => {
      db = getDb()
      db.prepare('INSERT OR IGNORE INTO servers (server_id) VALUES (?)').run(testServerId)
      commandRegistry.register(new CustomCommand())
    })

    afterEach(() => {
      db.prepare('DELETE FROM commands WHERE server_id = ?').run(testServerId)
    })

    test('should add and read custom command successfully', async () => {
      const msg = mockMessage('!add hello_test world_reply', testServerId)
      await editCommand(msg, 'add')

      expect(msg.reply).toHaveBeenCalledWith(
        expect.stringContaining('hello_test 指令已經新增到列表中')
      )

      await readCommandDict()

      const triggerMsg = mockMessage('!hello_test', testServerId)
      checkCommand(triggerMsg, 'hello_test')

      expect(triggerMsg.channel.send).toHaveBeenCalledWith('world_reply')
    })

    test('should edit existing custom command successfully', async () => {
      // First, add a command
      const addMsg = mockMessage('!add edit_test initial_value', testServerId)
      await editCommand(addMsg, 'add')

      // Then, edit it
      const editMsg = mockMessage('!edit edit_test edited_value', testServerId)
      await editCommand(editMsg, 'edit')

      expect(editMsg.reply).toHaveBeenCalledWith(expect.stringContaining('edit_test 指令已經更新'))

      await readCommandDict()

      const triggerMsg = mockMessage('!edit_test', testServerId)
      checkCommand(triggerMsg, 'edit_test')

      expect(triggerMsg.channel.send).toHaveBeenCalledWith('edited_value')
    })

    test('should prevent adding duplicate text command if it is set to 隨機圖片', async () => {
      const addRandomMsg = mockMessage('!add random_img_test 隨機圖片', testServerId)
      await editCommand(addRandomMsg, 'add')

      await readCommandDict()

      const addAgainMsg = mockMessage('!add random_img_test another_value', testServerId)
      await editCommand(addAgainMsg, 'add')

      expect(addAgainMsg.reply).toHaveBeenCalledWith(
        expect.stringContaining('目前是設定回覆隨機圖片，若要增加圖片到這個指令請使用 !addimg')
      )
    })

    test('should remove custom command successfully', async () => {
      const addMsg = mockMessage('!add remove_test delete_me', testServerId)
      await editCommand(addMsg, 'add')

      await readCommandDict()

      const removeMsg = mockMessage('!remove remove_test', testServerId)
      await editCommand(removeMsg, 'remove')

      expect(removeMsg.reply).toHaveBeenCalledWith(
        expect.stringContaining('remove_test 指令已經刪除')
      )

      await readCommandDict()

      const triggerMsg = mockMessage('!remove_test', testServerId)
      checkCommand(triggerMsg, 'remove_test')

      expect(triggerMsg.channel.send).not.toHaveBeenCalled()
    })

    test('should reject adding a command that matches a reserved keyword', async () => {
      const msg = mockMessage('!add add 123', testServerId)
      await editCommand(msg, 'add')

      expect(msg.reply).toHaveBeenCalledWith(
        expect.stringContaining('是系統保留指令或關鍵字，不可使用此名稱')
      )
    })

    test('should add image via !addimg successfully', async () => {
      vi.mocked(fileManager.downloadFile).mockResolvedValue('assets/images/testcmd/uuid.png')
      vi.mocked(checkImageNSFW).mockResolvedValue({ nsfw: false, reason: '' })

      const msg = mockMessage('!addimg testcmd http://example.com/test.png', testServerId)
      await editCommand(msg, 'addimg')

      expect(msg.reply).toHaveBeenCalledWith('正在下載並分析圖片安全性...')
      expect(msg.reply).toHaveBeenCalledWith('圖片新增成功')
      expect(fileManager.downloadFile).toHaveBeenCalledWith(
        'http://example.com/test.png',
        'testcmd',
        expect.any(Function)
      )
    })

    test('should reject NSFW image in !addimg on non-NSFW channel', async () => {
      vi.mocked(fileManager.downloadFile).mockResolvedValue('assets/images/testcmd/nsfw.png')
      vi.mocked(checkImageNSFW).mockResolvedValue({ nsfw: true, reason: 'NSFW Content detected' })

      const msg = mockMessage('!addimg testcmd http://example.com/nsfw.png', testServerId)
      await editCommand(msg, 'addimg')

      expect(msg.reply).toHaveBeenCalledWith('正在下載並分析圖片安全性...')
      expect(msg.reply).toHaveBeenCalledWith(
        expect.stringContaining('⛔ 圖片檢測為 NSFW 內容，已被拒絕！原因：NSFW Content detected')
      )
      expect(fileManager.removeFile).toHaveBeenCalled()
    })

    test('should delete image file via !delimg successfully', async () => {
      vi.mocked(fileManager.checkFileDirectoryIsExist).mockReturnValue(true)

      const msg = mockMessage('!delimg testcmd img.png', testServerId)
      await editCommand(msg, 'delimg')

      expect(fileManager.removeFile).toHaveBeenCalledWith(
        'assets/images/testcmd/',
        'img.png',
        'testcmd'
      )
      expect(msg.reply).toHaveBeenCalledWith('圖片刪除成功')
    })

    test('should return random image command result', async () => {
      // 1. Add random image command config
      const addRandomMsg = mockMessage('!add random_cmd 隨機圖片', testServerId)
      await editCommand(addRandomMsg, 'add')
      await readCommandDict()

      // 2. Mock fileManager
      vi.mocked(fileManager.checkFileDirectoryIsExist).mockReturnValue(true)
      vi.mocked(fileManager.getRandomFile).mockResolvedValue('assets/images/random_cmd/img.png')

      const triggerMsg = mockMessage('!random_cmd', testServerId)
      await getImageCommand(triggerMsg, 'random_cmd')

      expect(triggerMsg.channel.send).toHaveBeenCalled()
    })

    test('should display list of commands', async () => {
      const msg = mockMessage('!list', testServerId)
      await editCommand(msg, 'list')

      expect(msg.channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array)
        })
      )
    })

    test('should reset server commands successfully', async () => {
      const addMsg = mockMessage('!add reset_test val', testServerId)
      await editCommand(addMsg, 'add')
      await readCommandDict()

      const resetMsg = mockMessage('!reset server', testServerId)
      await editCommand(resetMsg, 'reset')

      await readCommandDict()

      const triggerMsg = mockMessage('!reset_test', testServerId)
      checkCommand(triggerMsg, 'reset_test')

      expect(triggerMsg.channel.send).not.toHaveBeenCalled()
    })

    test('should search for all commands successfully', async () => {
      const addMsg = mockMessage('!add search_cmd_1 response1', testServerId)
      await editCommand(addMsg, 'add')
      await readCommandDict()

      const searchMsg = mockMessage('!大全 search_cmd', testServerId)
      await editCommand(searchMsg, '大全')

      expect(searchMsg.channel.send).toHaveBeenCalledWith(expect.stringContaining('search_cmd_1'))
    })

    test('should reply format errors for incorrect custom commands format', async () => {
      // !add
      const addMsg = mockMessage('!add name', testServerId)
      await editCommand(addMsg, 'add')
      expect(addMsg.reply).toHaveBeenCalledWith('格式錯誤，正確格式為：!add [指令名稱] [BOT回覆內容]')

      // !edit
      const editMsg = mockMessage('!edit name', testServerId)
      await editCommand(editMsg, 'edit')
      expect(editMsg.reply).toHaveBeenCalledWith('格式錯誤，正確格式為：!edit [指令名稱] [BOT回覆內容]')

      // !remove
      const removeMsg = mockMessage('!remove', testServerId)
      await editCommand(removeMsg, 'remove')
      expect(removeMsg.reply).toHaveBeenCalledWith('格式錯誤，正確格式為：!remove [指令名稱]')

      // !reset
      const resetMsg1 = mockMessage('!reset', testServerId)
      await editCommand(resetMsg1, 'reset')
      expect(resetMsg1.reply).toHaveBeenCalledWith('格式錯誤，正確格式為：!reset server')

      const resetMsg2 = mockMessage('!reset notserver', testServerId)
      await editCommand(resetMsg2, 'reset')
      expect(resetMsg2.reply).toHaveBeenCalledWith('格式錯誤，正確格式為：!reset server')

      // !addimg
      const addimgMsg = mockMessage('!addimg cmd', testServerId)
      await editCommand(addimgMsg, 'addimg')
      expect(addimgMsg.reply).toHaveBeenCalledWith('格式錯誤，正確格式為：!addimg [指令名稱] [圖片網址]')

      // !delimg
      const delimgMsg = mockMessage('!delimg cmd', testServerId)
      await editCommand(delimgMsg, 'delimg')
      expect(delimgMsg.reply).toHaveBeenCalledWith('格式錯誤，正確格式為：!delimg [指令名稱/資料夾名稱] [檔案名稱含副檔名]')

      // !send
      const sendMsg = mockMessage('!send channel', testServerId)
      await editCommand(sendMsg, 'send')
      expect(sendMsg.reply).toHaveBeenCalledWith('格式錯誤，正確格式為：!send [頻道ID] [訊息內容]')

      // !大全
      const searchMsg = mockMessage('!大全', testServerId)
      await editCommand(searchMsg, '大全')
      expect(searchMsg.reply).toHaveBeenCalledWith('格式錯誤，正確格式為：!大全 [關鍵字]')
    })
  })

  describe('CustomCommand Routing Integration Tests', () => {
    const testServerId = 'test_guild_message_feature'
    let customCommand: CustomCommand

    beforeAll(() => {
      customCommand = new CustomCommand()
      const db = getDb()
      db.prepare('INSERT OR IGNORE INTO servers (server_id) VALUES (?)').run(testServerId)
    })

    test('should route !add directly to editCommand and create custom command', async () => {
      const msg = mockMessage('!add direct_add_test success_msg', testServerId)

      // Execute through CustomCommand to test routing
      await customCommand.execute(msg, ['direct_add_test', 'success_msg'])

      expect(msg.reply).toHaveBeenCalledWith(
        expect.stringContaining('direct_add_test 指令已經新增到列表中')
      )

      await readCommandDict()

      const triggerMsg = mockMessage('!direct_add_test', testServerId)
      checkCommand(triggerMsg, 'direct_add_test')
      expect(triggerMsg.channel.send).toHaveBeenCalledWith('success_msg')
    })
  })

  describe('isCustomCommandResponse', () => {
    const testServerId = 'test_guild_message_feature'

    beforeAll(async () => {
      const db = getDb()
      db.prepare('INSERT OR IGNORE INTO servers (server_id) VALUES (?)').run(testServerId)
      const addMsg = mockMessage('!add custom_reply_test dummy_response', testServerId)
      await editCommand(addMsg, 'add')
      await readCommandDict()
    })

    test('should return true if message content matches a custom command response', () => {
      const msg = mockMessage('dummy_response', testServerId)
      expect(isCustomCommandResponse(msg)).toBe(true)
    })

    test('should return false if message content does not match any custom command response', () => {
      const msg = mockMessage('not_a_custom_response', testServerId)
      expect(isCustomCommandResponse(msg)).toBe(false)
    })

    test('should return false if message is not in a guild', () => {
      const msg = mockMessage('dummy_response')
      delete msg.guild
      expect(isCustomCommandResponse(msg)).toBe(false)
    })
  })

  describe('shouldSkipDialogueTrigger', () => {
    test('should return true if current message contains a fixvx URL', () => {
      const msg = mockMessage('check this out https://fixvx.com/status/123')
      expect(shouldSkipDialogueTrigger(msg, null)).toBe(true)
    })

    test('should return true if replied message contains a fixvx URL', () => {
      const msg = mockMessage('hello')
      const repliedMsg = mockMessage('https://vxtwitter.com/status/123')
      expect(shouldSkipDialogueTrigger(msg, repliedMsg)).toBe(true)
    })

    test('should return true if current message is a comic URL', () => {
      const msg = mockMessage('https://nhentai.net/g/123456')
      expect(shouldSkipDialogueTrigger(msg, null)).toBe(true)
    })

    test('should return true if replied message starts with a command prefix', () => {
      const msg = mockMessage('hello')
      const repliedMsg1 = mockMessage('!lottery')
      const repliedMsg2 = mockMessage('！rollcall')
      const repliedMsg3 = mockMessage('/setting')
      const repliedMsg4 = mockMessage('#123456')

      expect(shouldSkipDialogueTrigger(msg, repliedMsg1)).toBe(true)
      expect(shouldSkipDialogueTrigger(msg, repliedMsg2)).toBe(true)
      expect(shouldSkipDialogueTrigger(msg, repliedMsg3)).toBe(true)
      expect(shouldSkipDialogueTrigger(msg, repliedMsg4)).toBe(true)
    })

    test('should return true if replied message has a slash command interaction', () => {
      const msg = mockMessage('hello')
      const repliedMsg = mockMessage('some reply content', 'test_guild_message_feature')
      ;(repliedMsg as any).interaction = { id: 'slash_interaction_id' }
      expect(shouldSkipDialogueTrigger(msg, repliedMsg)).toBe(true)
    })

    test('should return true if replied message is a custom command response', () => {
      const msg = mockMessage('hello', 'test_guild_message_feature')
      const repliedMsg = mockMessage('dummy_response', 'test_guild_message_feature')
      expect(shouldSkipDialogueTrigger(msg, repliedMsg)).toBe(true)
    })

    test('should return true if replied message content matches a bot command response pattern', () => {
      const msg = mockMessage('hello')
      const repliedMsg1 = mockMessage('投票：結束點名 (3/3)')
      const repliedMsg2 = mockMessage('抽獎清單以及說明')
      const repliedMsg3 = mockMessage('機器人伺服器設定')
      const repliedMsg4 = mockMessage('長期記憶功能已開啟')
      const repliedMsg5 = mockMessage('股票歷史走勢')

      expect(shouldSkipDialogueTrigger(msg, repliedMsg1)).toBe(true)
      expect(shouldSkipDialogueTrigger(msg, repliedMsg2)).toBe(true)
      expect(shouldSkipDialogueTrigger(msg, repliedMsg3)).toBe(true)
      expect(shouldSkipDialogueTrigger(msg, repliedMsg4)).toBe(true)
      expect(shouldSkipDialogueTrigger(msg, repliedMsg5)).toBe(true)
    })

    test('should return true if replied message contains a comic site URL', () => {
      const msg = mockMessage('hello')
      const repliedMsg = mockMessage('https://wnacg.com/photos-index-aid-123.html')
      expect(shouldSkipDialogueTrigger(msg, repliedMsg)).toBe(true)
    })

    test('should return true if replied message embeds matches comic keywords', () => {
      const msg = mockMessage('hello')
      const repliedMsg = mockMessage('some text')
      ;(repliedMsg as any).embeds = [
        {
          title: '紳士漫畫 - Wnacg',
          description: 'something description'
        }
      ]
      expect(shouldSkipDialogueTrigger(msg, repliedMsg)).toBe(true)
    })

    test('should return false if it is a normal user text reply to the bot', () => {
      const msg = mockMessage('你好啊')
      const repliedMsg = mockMessage('哈囉！我是波波。')
      expect(shouldSkipDialogueTrigger(msg, repliedMsg)).toBe(false)
    })
  })
})

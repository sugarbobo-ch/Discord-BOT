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
  readCommandDict
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
})

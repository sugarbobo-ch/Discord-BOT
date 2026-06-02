import { describe, test, expect } from 'vitest'
import {
  checkPrefix,
  checkMentions,
  checkEmoji,
  getCommandName,
  isNormalCommand
} from '../../src/features/message'

const mockMessage = (content: string) =>
  ({
    content,
    author: { bot: false, id: '123' }
  }) as any

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
})

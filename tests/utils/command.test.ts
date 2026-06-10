import { describe, test, expect } from 'vitest'
import { checkPrefix, checkMentions, checkEmoji, getCommandName, normalizeMessageContent } from '../../src/utils/command'

const mockMessage = (content: string) =>
  ({
    content,
    author: { bot: false, id: '123' }
  }) as any

describe('Command Utility Tests', () => {
  describe('normalizeMessageContent', () => {
    test('should convert full-width exclamation mark to half-width', () => {
      expect(normalizeMessageContent('！bobo')).toBe('!bobo')
      expect(normalizeMessageContent('！stock 2330')).toBe('!stock 2330')
    })

    test('should convert full-width spaces to half-width spaces for command messages', () => {
      expect(normalizeMessageContent('！bobo　2330')).toBe('!bobo 2330')
      expect(normalizeMessageContent('!add　cmd　text')).toBe('!add cmd text')
      expect(normalizeMessageContent('/setting　enable')).toBe('/setting enable')
    })

    test('should not change non-command messages', () => {
      expect(normalizeMessageContent('哈囉！我是波波。')).toBe('哈囉！我是波波。')
      expect(normalizeMessageContent('這是一隻　小貓')).toBe('這是一隻　小貓')
    })
  })

  describe('checkPrefix', () => {
    test('should return true for messages starting with !, ！, or /', () => {
      expect(checkPrefix(mockMessage('!help'))).toBe(true)
      expect(checkPrefix(mockMessage('！list'))).toBe(true)
      expect(checkPrefix(mockMessage('/help'))).toBe(true)
    })

    test('should return false for messages not starting with prefix', () => {
      expect(checkPrefix(mockMessage('hello'))).toBe(false)
      expect(checkPrefix(mockMessage(' !help'))).toBe(false)
    })

    test('should return false for single prefix message', () => {
      expect(checkPrefix(mockMessage('!'))).toBe(false)
      expect(checkPrefix(mockMessage('！'))).toBe(false)
      expect(checkPrefix(mockMessage('/'))).toBe(false)
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
      expect(getCommandName(mockMessage('/setting'))).toBe('setting')
    })

    test('should handle mention commands correctly', () => {
      expect(getCommandName(mockMessage('<@123456789>'))).toBe('<@123456789>')
    })

    test('should handle emoji commands correctly', () => {
      expect(getCommandName(mockMessage('<:emoji:123456789>'))).toBe('<:emoji:123456789>')
    })
  })
})

import { describe, test, expect } from 'vitest'
import { isHashPrefix } from '../../src/features/nsfw'

const mockMessage = (content: string) =>
  ({
    content,
    author: { bot: false, id: '123' }
  }) as any

describe('NSFW Feature Tests', () => {
  describe('isHashPrefix', () => {
    test('should return true for messages starting with #', () => {
      expect(isHashPrefix(mockMessage('#228922'))).toBe(true)
      expect(isHashPrefix(mockMessage('#test'))).toBe(true)
    })

    test('should return false for messages not starting with #', () => {
      expect(isHashPrefix(mockMessage('!help'))).toBe(false)
      expect(isHashPrefix(mockMessage('hello'))).toBe(false)
    })
  })
})

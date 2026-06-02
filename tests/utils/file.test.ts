import { describe, test, expect } from 'vitest'
import { isDirValid, checkURL, isGif, uuidv4 } from '../../src/utils/file'

describe('File Utility Tests', () => {
  describe('isDirValid', () => {
    test('should return true for valid directory names', () => {
      expect(isDirValid('images')).toBe(true)
      expect(isDirValid('command1')).toBe(true)
      expect(isDirValid('sub_dir-123')).toBe(true)
    })

    test('should return false for invalid directory names containing restricted characters', () => {
      expect(isDirValid('img:dir')).toBe(false)
      expect(isDirValid('img/dir')).toBe(false)
      expect(isDirValid('img\\dir')).toBe(false)
      expect(isDirValid('img?dir')).toBe(false)
      expect(isDirValid('img*dir')).toBe(false)
    })
  })

  describe('checkURL', () => {
    test('should return true for valid image extensions', () => {
      expect(checkURL('https://example.com/pic.jpg')).toBe(true)
      expect(checkURL('https://example.com/pic.png')).toBe(true)
      expect(checkURL('https://example.com/pic.gif')).toBe(true)
      expect(checkURL('https://example.com/pic.JPG')).toBe(true)
    })

    test('should return false for invalid image extensions', () => {
      expect(checkURL('https://example.com/pic.html')).toBe(false)
      expect(checkURL('https://example.com/pic.mp4')).toBe(false)
      expect(checkURL('https://example.com/pic.jpg?width=100')).toBe(false) // 結尾並非圖片格式
      expect(checkURL('https://example.com/pic')).toBe(false)
    })
  })

  describe('isGif', () => {
    test('should return true for gif extension', () => {
      expect(isGif('https://example.com/anim.gif')).toBe(true)
      expect(isGif('https://example.com/anim.GIF')).toBe(true)
    })

    test('should return false for non-gif extension', () => {
      expect(isGif('https://example.com/anim.jpg')).toBe(false)
      expect(isGif('https://example.com/anim.png')).toBe(false)
    })
  })

  describe('uuidv4', () => {
    test('should generate a valid UUID v4 format string', () => {
      const uuid = uuidv4()
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    test('should generate unique values', () => {
      const uuid1 = uuidv4()
      const uuid2 = uuidv4()
      expect(uuid1).not.toBe(uuid2)
    })
  })
})

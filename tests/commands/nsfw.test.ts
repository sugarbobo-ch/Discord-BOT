import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NsfwCommand } from '../../src/commands/nsfw'

describe('NsfwCommand Format Validation Tests', () => {
  let mockChannel: any
  let mockReply: any
  let nsfwCommand: NsfwCommand

  beforeEach(() => {
    mockChannel = {
      isTextBased: vi.fn().mockReturnValue(true),
      send: vi.fn(),
      nsfw: true
    }
    mockReply = vi.fn()
    nsfwCommand = new NsfwCommand()
  })

  test('should reply format error for pixiv command with wrong arg count', async () => {
    const msg = {
      content: '!pixiv',
      channel: mockChannel,
      reply: mockReply
    } as any

    await nsfwCommand.execute(msg, [])
    expect(mockReply).toHaveBeenCalledWith('格式錯誤，正確格式為：!pixiv [作品ID]')
  })

  test('should reply format error for nhentai command with wrong arg count', async () => {
    const msg = {
      content: '!nhentai',
      channel: mockChannel,
      reply: mockReply
    } as any

    await nsfwCommand.execute(msg, [])
    expect(mockReply).toHaveBeenCalledWith('格式錯誤，正確格式為：!nhentai [車號]')
  })

  test('should reply format error for god command with wrong arg count', async () => {
    const msg = {
      content: '!god',
      channel: mockChannel,
      reply: mockReply
    } as any

    await nsfwCommand.execute(msg, [])
    expect(mockReply).toHaveBeenCalledWith('格式錯誤，正確格式為：!god [車號]')
  })

  test('should reply format error for wnacg command with wrong arg count', async () => {
    const msg = {
      content: '!wnacg',
      channel: mockChannel,
      reply: mockReply
    } as any

    await nsfwCommand.execute(msg, [])
    expect(mockReply).toHaveBeenCalledWith('格式錯誤，正確格式為：!wnacg [車號]')
  })
})

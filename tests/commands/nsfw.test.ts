import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NsfwCommand } from '../../src/commands/nsfw'
import { fetchWnacgMetadata, fetchNhentaiMetadata, createEmbed } from '../../src/features/nsfwEmbed'

vi.mock('../../src/features/nsfwEmbed', () => ({
  fetchWnacgMetadata: vi.fn(),
  fetchNhentaiMetadata: vi.fn(),
  createEmbed: vi.fn().mockImplementation((meta) => ({
    data: meta,
    toJSON: () => meta
  }))
}))

describe('NsfwCommand Format Validation and Execution Tests', () => {
  let mockChannel: any
  let mockReply: any
  let nsfwCommand: NsfwCommand
  let mockStatusMsg: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createEmbed).mockImplementation((meta) => ({
      data: meta,
      toJSON: () => meta
    }) as any)

    mockStatusMsg = {
      edit: vi.fn().mockResolvedValue({})
    }

    mockChannel = {
      isTextBased: vi.fn().mockReturnValue(true),
      send: vi.fn().mockImplementation(async (options) => {
        return mockStatusMsg
      }),
      nsfw: true
    }
    mockReply = vi.fn().mockResolvedValue(mockStatusMsg)
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

  test('should block commands in non-NSFW channel', async () => {
    mockChannel.nsfw = false
    const msg = {
      content: '!pixiv 12345',
      channel: mockChannel,
      reply: mockReply
    } as any

    await nsfwCommand.execute(msg, ['12345'])
    expect(mockReply).toHaveBeenCalledWith('請至開車頻道使用此指令')
  })

  test('should send raw URL in non-NSFW channel for nhentai/god commands', async () => {
    mockChannel.nsfw = false
    const msg = {
      content: '!god 177013',
      channel: mockChannel,
      reply: mockReply
    } as any

    await nsfwCommand.execute(msg, ['177013'])
    expect(mockReply).toHaveBeenCalledWith('https://nhentai.net/g/177013/')
  })

  test('should send pixiv embed in NSFW channel', async () => {
    const msg = {
      content: '!pixiv 12345',
      channel: mockChannel,
      reply: mockReply
    } as any

    await nsfwCommand.execute(msg, ['12345'])
    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Pixiv 作品 - 12345',
              url: 'https://www.pixiv.net/artworks/12345',
              image: expect.objectContaining({ url: 'https://pixiv.cat/12345.png' })
            })
          })
        ])
      })
    )
  })

  test('should fetch and send Wnacg embed in NSFW channel', async () => {
    const mockMeta = {
      title: 'Wnacg Book Title',
      url: 'https://www.wnacg.com/photos-index-aid-301531.html',
      coverUrl: 'https://img.wnacg.com/cover.jpg',
      author: 'Author',
      tags: ['tag1', 'tag2'],
      siteName: 'Wnacg 紳士漫畫',
      color: 0x2196f3
    }
    vi.mocked(fetchWnacgMetadata).mockResolvedValueOnce(mockMeta)

    const msg = {
      content: '!wnacg 301531',
      channel: mockChannel,
      reply: mockReply
    } as any

    await nsfwCommand.execute(msg, ['301531'])

    expect(fetchWnacgMetadata).toHaveBeenCalledWith('https://www.wnacg.com/photos-index-aid-301531.html')
    expect(mockStatusMsg.edit).toHaveBeenCalledWith({
      content: '',
      embeds: [expect.objectContaining({ data: mockMeta })]
    })
  })

  test('should fetch and send nhentai embed in NSFW channel', async () => {
    const mockMeta = {
      title: 'nhentai Book Title',
      url: 'https://nhentai.net/g/177013/',
      coverUrl: 'https://i.nhentaimg.com/cover.jpg',
      author: 'Author',
      tags: ['tag1', 'tag2'],
      siteName: 'nhentai',
      color: 0xed2553
    }
    vi.mocked(fetchNhentaiMetadata).mockResolvedValueOnce(mockMeta)

    const msg = {
      content: '!god 177013',
      channel: mockChannel,
      reply: mockReply
    } as any

    await nsfwCommand.execute(msg, ['177013'])

    expect(fetchNhentaiMetadata).toHaveBeenCalledWith('177013')
    expect(mockStatusMsg.edit).toHaveBeenCalledWith({
      content: '',
      embeds: [expect.objectContaining({ data: mockMeta })]
    })
  })

  describe('executeSlash (slash commands)', () => {
    let mockInteraction: any

    beforeEach(() => {
      mockInteraction = {
        commandName: '',
        options: {
          getString: vi.fn(),
          getAttachment: vi.fn()
        },
        channel: mockChannel,
        reply: mockReply,
        editReply: vi.fn()
      } as any
    })

    test('should execute pixiv slash command successfully', async () => {
      mockInteraction.commandName = 'pixiv'
      mockInteraction.options.getString.mockReturnValue('12345')

      await nsfwCommand.executeSlash(mockInteraction)

      expect(mockInteraction.options.getString).toHaveBeenCalledWith('作品id', true)
      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: 'Pixiv 作品 - 12345'
              })
            })
          ])
        })
      )
    })
  })
})

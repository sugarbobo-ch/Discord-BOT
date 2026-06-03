import { describe, test, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { checkAndAddNsfwEmbed } from '../../src/features/nsfwEmbed'
import { Message } from 'discord.js'

vi.mock('axios')

describe('NSFW Embed Features Tests', () => {
  let mockMessage: any

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()

    // 模擬 Discord Message 物件
    mockMessage = {
      id: 'msg_123456',
      content: '',
      channel: {
        isTextBased: vi.fn().mockReturnValue(true),
        nsfw: true,
        messages: {
          fetch: vi.fn().mockImplementation(async () => mockMessage)
        },
        send: vi.fn().mockResolvedValue({})
      },
      embeds: []
    }
  })

  test('should do nothing if channel is not NSFW', async () => {
    mockMessage.channel.nsfw = false
    mockMessage.content = 'https://www.wnacg.com/photos-index-aid-301531.html'

    checkAndAddNsfwEmbed(mockMessage as unknown as Message, 0)

    vi.runAllTimers()

    expect(mockMessage.channel.messages.fetch).not.toHaveBeenCalled()
    expect(mockMessage.channel.send).not.toHaveBeenCalled()
  })

  test('should do nothing if no matching R18 URLs are found', async () => {
    mockMessage.content = 'https://google.com'

    checkAndAddNsfwEmbed(mockMessage as unknown as Message, 0)

    vi.runAllTimers()

    expect(mockMessage.channel.messages.fetch).not.toHaveBeenCalled()
    expect(mockMessage.channel.send).not.toHaveBeenCalled()
  })

  test('should do nothing if Discord has already generated an embed with a thumbnail', async () => {
    mockMessage.content = 'https://www.wnacg.com/photos-index-aid-301531.html'
    mockMessage.embeds = [
      {
        url: 'https://www.wnacg.com/photos-index-aid-301531.html',
        thumbnail: { url: 'https://img.com/thumb.jpg' }
      }
    ]

    checkAndAddNsfwEmbed(mockMessage as unknown as Message, 0)

    vi.runAllTimers()

    // 仍會呼叫 fetch 以重新確認狀態
    expect(mockMessage.channel.messages.fetch).toHaveBeenCalledWith('msg_123456')
    // 但不會呼叫 send
    expect(mockMessage.channel.send).not.toHaveBeenCalled()
  })

  test('should fetch and send embed for E-Hentai url', async () => {
    mockMessage.content = 'https://e-hentai.org/g/3558817/0a9d73d6ea/'

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        gmetadata: [
          {
            title: 'Test Gallery',
            title_jpn: '測試畫廊',
            thumb: 'https://eh.com/thumb.jpg',
            uploader: 'uploader_user',
            category: 'Doujinshi',
            tags: ['artist:reid', 'female:sole female', 'group:circle', 'misc_tag']
          }
        ]
      }
    })

    checkAndAddNsfwEmbed(mockMessage as unknown as Message, 0)

    // 觸發延遲執行
    await vi.runAllTimersAsync()

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.e-hentai.org/api.php',
      expect.objectContaining({
        method: 'gdata',
        gidlist: [[3558817, '0a9d73d6ea']]
      }),
      expect.any(Object)
    )

    expect(mockMessage.channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.any(Object) // EmbedBuilder
        ])
      })
    )
  })

  test('should fetch and send embed for Wnacg url', async () => {
    mockMessage.content = 'https://www.wnacg.com/photos-index-aid-301531.html'

    const mockHtml = `
      <h2>[Artist (Circle)] Album Title</h2>
      <div class="asTBcell uwthumb">
        <img alt="cover" src="//img3.wnacg.com/cdn/cover.jpg">
      </div>
      <div class="asTBcell uwuinfo">
        <p>uploader_user</p>
      </div>
      <label>分類：同人誌／日語</label>
      <div class="addtags">
        <a class="tagshow">tag1</a>
        <a class="tagshow">tag2</a>
      </div>
    `
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: mockHtml
    })

    checkAndAddNsfwEmbed(mockMessage as unknown as Message, 0)

    await vi.runAllTimersAsync()

    expect(axios.get).toHaveBeenCalledWith(
      'https://www.wnacg.com/photos-index-aid-301531.html',
      expect.any(Object)
    )

    expect(mockMessage.channel.send).toHaveBeenCalled()
  })

  test('should fetch and send embed for 18Comic url', async () => {
    mockMessage.content = 'https://18comic.vip/album/370216'

    const mockHtml = `
      <meta property="og:title" content="Test Comic Title" />
      <meta property="og:image" content="https://18c.com/cover.jpg" />
      作者：<span itemprop="author"><a href="#">Comic Artist</a></span>
      <a href="/search/photos?search_query=tag1">tag1</a>
      <a href="/search/photos?search_query=tag2">tag2</a>
    `
    // 第一個 domain 成功
    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 200,
      data: mockHtml
    })

    checkAndAddNsfwEmbed(mockMessage as unknown as Message, 0)

    await vi.runAllTimersAsync()

    expect(axios.get).toHaveBeenCalledWith('https://18comic.vip/album/370216', expect.any(Object))

    expect(mockMessage.channel.send).toHaveBeenCalled()
  })

  test('should treat 18comic.ink and 18comic.vip as identical and handle duplicate checking properly', async () => {
    mockMessage.content = 'https://18comic.ink/photo/1444113'
    mockMessage.embeds = [
      {
        url: 'https://18comic.vip/photo/1444113',
        thumbnail: { url: 'https://18c.com/cover.jpg' }
      }
    ]

    checkAndAddNsfwEmbed(mockMessage as unknown as Message, 0)

    await vi.runAllTimersAsync()

    expect(mockMessage.channel.send).not.toHaveBeenCalled()
    expect(axios.get).not.toHaveBeenCalled()
  })

  test('should deduplicate multiple matching URLs with the same ID in the same message', async () => {
    // 同一則訊息貼了不同鏡像的同一個作品連結
    mockMessage.content = 'https://18comic.ink/photo/1444113 and https://18comic.vip/photo/1444113'

    const mockHtml = `
      <meta property="og:title" content="Test Comic 1444113" />
      <meta property="og:image" content="https://18c.com/cover.jpg" />
      作者：<span itemprop="author"><a href="#">Comic Artist</a></span>
      <a href="/search/photos?search_query=tag1">tag1</a>
    `
    // 只會對第一個進行請求與發送
    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 200,
      data: mockHtml
    })

    checkAndAddNsfwEmbed(mockMessage as unknown as Message, 0)

    await vi.runAllTimersAsync()

    // 應該只呼叫一次 axios.get
    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(axios.get).toHaveBeenCalledWith('https://18comic.ink/photo/1444113', expect.any(Object))

    // 應該只發送一次自訂 embed
    expect(mockMessage.channel.send).toHaveBeenCalledTimes(1)
  })
})

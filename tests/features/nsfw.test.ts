import { describe, test, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { Message, EmbedBuilder } from 'discord.js'
import { isHashPrefix, getSourceURL } from '../../src/features/nsfw'

vi.mock('axios')

const mockMessage = (content: string) =>
  ({
    content,
    author: { bot: false, id: '123' },
    attachments: {
      first: () => null
    }
  }) as any

describe('NSFW Feature Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

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

  describe('getSourceURL', () => {
    test('should download and upload image to Saucenao, and send Embed when results are found', async () => {
      const mockChannel = {
        isTextBased: vi.fn().mockReturnValue(true),
        send: vi.fn()
      }
      const mockMsg = {
        content: '!搜圖 http://example.com/image.jpg',
        author: { bot: false, id: '123' },
        channel: mockChannel,
        attachments: {
          first: () => null
        }
      } as any

      // Mock axios.get for downloading
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: Buffer.from('mock data'),
        headers: { 'content-type': 'image/jpeg' }
      })

      // Mock axios.post for uploading to Saucenao (with rich search results HTML)
      const mockHtml = `
        <table class="resulttable">
          <tr>
            <td class="resulttableimage">
              <div class="resultimage"><img src="/userdata/testImg123.jpg.jpg" /></div>
            </td>
            <td class="resulttablecontent">
              <div class="resultmatchinfo">
                <div class="resultsimilarityinfo">95.40%</div>
              </div>
              <div class="resultcontent">
                <div class="resulttitle"><strong>Test Artwork Title</strong></div>
                <div class="resultcontentcolumn">
                  <strong>Creator: </strong><a href="https://www.pixiv.net/users/12345">nihn</a><br />
                  <strong>Pixiv ID: </strong><a href="https://www.pixiv.net/artworks/118304954">118304954</a><br />
                  <strong>Material: </strong>blue archive<br />
                  <strong>Characters: </strong>arona (blue archive), plana (blue archive)<br />
                </div>
              </div>
            </td>
          </tr>
        </table>
        <div id="yourimage"><a href="edit.php?f=1&image=testImg123.jpg"><img src="/userdata/testImg123.jpg.jpg" /></a></div>
      `
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: mockHtml
      })

      const statusMsgMock = {
        edit: vi.fn().mockResolvedValue({})
      }
      mockChannel.send.mockResolvedValueOnce(statusMsgMock)

      await getSourceURL(mockMsg)

      expect(statusMsgMock.edit).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '搜尋完成！',
          embeds: expect.arrayContaining([
            expect.any(EmbedBuilder)
          ])
        })
      )

      // Inspect details of the generated embed
      const lastCallArgs = vi.mocked(statusMsgMock.edit).mock.calls[0][0] as any
      const embed = lastCallArgs.embeds[0] as EmbedBuilder
      const data = embed.data

      expect(data.title).toBe('Test Artwork Title')
      expect(data.url).toContain('https://saucenao.com/search.php?db=999&url=')
      expect(data.fields).toContainEqual(expect.objectContaining({ name: '相似度', value: '95.4%' }))
      expect(data.fields).toContainEqual(expect.objectContaining({ name: '作者 (Creator)', value: '[nihn](https://www.pixiv.net/users/12345)' }))
      expect(data.fields).toContainEqual(expect.objectContaining({ name: '來源 (Source)', value: '[點我前往](https://www.pixiv.net/artworks/118304954)' }))
      expect(data.fields).toContainEqual(expect.objectContaining({ name: '原作 (Material)', value: 'blue archive' }))
      expect(data.fields).toContainEqual(expect.objectContaining({ name: '角色 (Characters)', value: 'arona (blue archive), plana (blue archive)' }))
    })

    test('should download and upload image to Saucenao, then send the temp search URL if no match results parsed', async () => {
      const mockChannel = {
        isTextBased: vi.fn().mockReturnValue(true),
        send: vi.fn()
      }
      const mockMsg = {
        content: '!搜圖 http://example.com/image.jpg?foo=bar&baz=qux',
        author: { bot: false, id: '123' },
        channel: mockChannel,
        attachments: {
          first: () => null
        }
      } as any

      // Mock axios.get for downloading
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: Buffer.from('mock data'),
        headers: { 'content-type': 'image/jpeg' }
      })

      // Mock axios.post for uploading to Saucenao (only filename, no results)
      const mockHtml = `
        <div id="yourimage"><a href="edit.php?f=1&image=testImg123.jpg"><img src="/userdata/testImg123.jpg.jpg" /></a></div>
      `
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: mockHtml
      })

      const statusMsgMock = {
        edit: vi.fn().mockResolvedValue({})
      }
      mockChannel.send.mockResolvedValueOnce(statusMsgMock)

      await getSourceURL(mockMsg)

      expect(axios.get).toHaveBeenCalledWith('http://example.com/image.jpg?foo=bar&baz=qux', {
        responseType: 'arraybuffer',
        timeout: 10000
      })

      expect(axios.post).toHaveBeenCalledWith('https://saucenao.com/search.php', expect.any(FormData), {
        headers: expect.any(Object),
        timeout: 15000
      })

      expect(statusMsgMock.edit).toHaveBeenCalledWith(
        'https://saucenao.com/search.php?db=999&url=https%3A%2F%2Fsaucenao.com%2Fuserdata%2Ftmp%2FtestImg123.jpg'
      )
    })

    test('should fallback to direct search url if upload to Saucenao fails', async () => {
      const mockChannel = {
        isTextBased: vi.fn().mockReturnValue(true),
        send: vi.fn()
      }
      const mockMsg = {
        content: '!搜圖 http://example.com/image.jpg?foo=bar&baz=qux',
        author: { bot: false, id: '123' },
        channel: mockChannel,
        attachments: {
          first: () => null
        }
      } as any

      // Mock axios.get success
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: Buffer.from('mock data'),
        headers: { 'content-type': 'image/jpeg' }
      })

      // Mock axios.post upload failure
      vi.mocked(axios.post).mockRejectedValueOnce(new Error('Network Error'))

      const statusMsgMock = {
        edit: vi.fn().mockResolvedValue({})
      }
      mockChannel.send.mockResolvedValueOnce(statusMsgMock)

      await getSourceURL(mockMsg)

      expect(statusMsgMock.edit).toHaveBeenCalledWith(
        'https://saucenao.com/search.php?db=999&url=http%3A%2F%2Fexample.com%2Fimage.jpg%3Ffoo%3Dbar%26baz%3Dqux'
      )
    })
  })
})

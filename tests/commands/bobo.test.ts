import { describe, test, expect, vi, beforeEach } from 'vitest'
import { BoboCommand } from '../../src/commands/bobo'
import { chatWithBobo } from '../../src/utils/gemini'
import axios from 'axios'

vi.mock('axios')
vi.mock('../../src/utils/gemini', () => ({
  chatWithBobo: vi.fn().mockResolvedValue('這是波波的回答')
}))

describe('BoboCommand Reply Tests', () => {
  let boboCommand: BoboCommand
  let mockMessage: any
  let mockRepliedMsg: any

  beforeEach(() => {
    vi.resetAllMocks()
    boboCommand = new BoboCommand()

    vi.mocked(chatWithBobo).mockResolvedValue('這是波波的回答')

    vi.mocked(axios.get).mockImplementation((url: any) => {
      const urlStr = typeof url === 'string' ? url : ''
      const mime = urlStr.includes('current.jpg') ? 'image/jpeg' : 'image/png'
      return Promise.resolve({
        data: Buffer.from('mock_image_data'),
        headers: {
          'content-type': mime
        }
      } as any)
    })

    mockRepliedMsg = {
      id: 'replied_msg_id',
      type: 0,
      content: '這是被回覆的原始訊息內容',
      attachments: {
        filter: vi.fn().mockReturnValue({
          size: 0,
          first: () => null
        }),
        forEach: vi.fn()
      },
      member: { displayName: '小明' },
      author: { username: 'xiaoming', id: 'xiaoming_id' },
      createdTimestamp: Date.now() - 5000
    }

    mockMessage = {
      id: 'msg_id',
      type: 0,
      content: '!bobo 你好',
      attachments: {
        first: vi.fn().mockReturnValue(null)
      },
      reference: {
        messageId: 'replied_msg_id'
      },
      author: { id: 'user_123', username: 'user_123' },
      member: { displayName: '大華' },
      client: {
        user: { id: 'bot_id' }
      },
      reply: vi.fn().mockResolvedValue({
        edit: vi.fn().mockResolvedValue(true)
      }),
      channel: {
        isTextBased: () => true,
        sendTyping: vi.fn().mockResolvedValue(true),
        messages: {
          fetch: vi.fn().mockImplementation((options) => {
            if (typeof options === 'string') {
              if (options === 'replied_msg_id') {
                return mockRepliedMsg
              }
              throw new Error('Message not found')
            }
            // Fetch history: return mocked replied message as part of history
            return {
              values: () => [mockRepliedMsg]
            }
          })
        }
      }
    }
  })

  test('should fetch referenced message and weight it to 1.00 in text history', async () => {
    await boboCommand.execute(mockMessage, ['你好'])

    expect(mockMessage.channel.messages.fetch).toHaveBeenCalledWith('replied_msg_id')
    expect(chatWithBobo).toHaveBeenCalled()

    const historyContextArg = vi.mocked(chatWithBobo).mock.calls[0][2]
    expect(historyContextArg).toContain('回覆給: 小明')
    expect(historyContextArg).toContain('熱度權重: 1.00, 此為回覆目標')
    expect(historyContextArg).toContain('這是被回覆的原始訊息內容')
  })

  test('should download and set replied image as primary image if current message has no image', async () => {
    // Mock the replied message having an image attachment
    const mockImageAttachment = {
      contentType: 'image/png',
      url: 'https://example.com/attachments/123/456/image.png'
    }
    mockRepliedMsg.attachments.filter = vi.fn().mockReturnValue({
      size: 1,
      first: () => mockImageAttachment
    })

    await boboCommand.execute(mockMessage, ['你好'])

    // Verify axios downloaded the image
    expect(axios.get).toHaveBeenCalledWith('https://example.com/attachments/123/456/image.png', expect.any(Object))

    // Verify chatWithBobo received the image as primary image (4th argument)
    const primaryImageArg = vi.mocked(chatWithBobo).mock.calls[0][3]
    expect(primaryImageArg).toBeDefined()
    expect(primaryImageArg?.buffer.toString()).toBe('mock_image_data')

    // Verify channelHistoryContext reflects that the replied image is used
    const historyContextArg = vi.mocked(chatWithBobo).mock.calls[0][2]
    expect(historyContextArg).toContain('[回覆的圖片 (由 小明 上傳，URL: https://example.com/attachments/123/456/image.png)]')
  })

  test('should prioritize replied image as primary image if current message also has an image', async () => {
    // Current message has image
    const mockCurrentAttachment = {
      contentType: 'image/jpeg',
      url: 'https://example.com/attachments/999/888/current.jpg'
    }
    mockMessage.attachments.first = vi.fn().mockReturnValue(mockCurrentAttachment)

    // Replied message has image
    const mockRepliedAttachment = {
      contentType: 'image/png',
      url: 'https://example.com/attachments/123/456/replied.png'
    }
    mockRepliedMsg.attachments.filter = vi.fn().mockReturnValue({
      size: 1,
      first: () => mockRepliedAttachment
    })

    await boboCommand.execute(mockMessage, ['你好'])

    // Verify both images downloaded
    expect(axios.get).toHaveBeenCalledWith('https://example.com/attachments/999/888/current.jpg', expect.any(Object))
    expect(axios.get).toHaveBeenCalledWith('https://example.com/attachments/123/456/replied.png', expect.any(Object))

    // Primary image should be the replied message image
    const primaryImageArg = vi.mocked(chatWithBobo).mock.calls[0][3]
    expect(primaryImageArg?.mimeType).toBe('image/png')

    // History images payload should contain the current message image (5th argument)
    const historyImagesPayload = vi.mocked(chatWithBobo).mock.calls[0][4]
    expect(historyImagesPayload).toHaveLength(1)
    expect(historyImagesPayload?.[0].mimeType).toBe('image/jpeg')
  })

  test('should set default prompt when prompt is empty for text-only replies', async () => {
    await boboCommand.execute(mockMessage, [])

    const promptArg = vi.mocked(chatWithBobo).mock.calls[0][0]
    expect(promptArg).toBe('請回覆此訊息。')
  })

  test('should set default prompt when prompt is empty for image replies', async () => {
    // Mock the replied message having an image attachment
    const mockImageAttachment = {
      contentType: 'image/png',
      url: 'https://example.com/attachments/123/456/image.png'
    }
    mockRepliedMsg.attachments.filter = vi.fn().mockReturnValue({
      size: 1,
      first: () => mockImageAttachment
    })

    await boboCommand.execute(mockMessage, [])

    const promptArg = vi.mocked(chatWithBobo).mock.calls[0][0]
    expect(promptArg).toBe('這張圖片是什麼？請跟我聊聊。')
  })
})

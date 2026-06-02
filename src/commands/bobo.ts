import { Message } from 'discord.js'
import { Command } from './command.interface'
import { chatWithBobo } from '../utils/gemini'
import auth from '../../config/auth.json'
import axios from 'axios'

export class BoboCommand implements Command {
  public names = ['bobo']

  public async execute(message: Message, args: string[]): Promise<void> {
    let prompt = args.join(' ')
    const attachment = message.attachments.first()
    const hasAttachment = attachment && attachment.contentType?.startsWith('image/')

    if (!prompt && !hasAttachment) {
      message.reply('叫波波幹嘛？後面要加上你想說的話或提供圖片啦！')
      return
    }

    if (!prompt && hasAttachment) {
      prompt = '這張圖片是什麼？請跟我聊聊。'
    }

    try {
      // 在等待 AI 回應時顯示「正在輸入...」狀態
      await (message.channel as any).sendTyping()

      const limit = (auth as any).chatMemoryLimit || 50
      let channelHistoryContext = ''
      const historyImagesPayload: { buffer: Buffer; mimeType: string }[] = []

      if (message.channel && message.channel.isTextBased()) {
        try {
          const fetched = await (message.channel as any).messages.fetch({ limit, before: message.id })
          const msgArray = Array.from(fetched.values()) as Message[] // [最新, ..., 最舊]
          const k = msgArray.length
          if (k > 0) {
            const nowSeconds = Math.floor(Date.now() / 1000)
            const chronologicalMsgs = msgArray.reverse() // [最舊, ..., 最新]

            // 1. 先從最新往舊尋找最多 3 張圖片，將其下載
            const MAX_HISTORY_IMAGES = 3
            const imagesToDownload: { msgId: string; url: string }[] = []

            for (const msg of [...chronologicalMsgs].reverse()) {
              if (imagesToDownload.length >= MAX_HISTORY_IMAGES) break

              // 檢查附件
              const imageAttachments = msg.attachments.filter(att => att.contentType?.startsWith('image/'))
              if (imageAttachments.size > 0) {
                const firstAtt = imageAttachments.first()
                if (firstAtt) {
                  imagesToDownload.push({ msgId: msg.id, url: firstAtt.url })
                  continue
                }
              }

              // 檢查內文 URL
              const urlMatch = msg.content.match(/https?:\/\/\S+/gi)
              if (urlMatch) {
                let found = false
                for (const url of urlMatch) {
                  const isImg = url.match(/\.(jpeg|jpg|gif|png|webp|heic|heif|JEPG|JPG|GIF|PNG|WEBP|HEIC|HEIF)$/) != null
                  if (isImg) {
                    imagesToDownload.push({ msgId: msg.id, url })
                    found = true
                    break
                  }
                }
                if (found) continue
              }
            }

            // 依序 [舊 -> 新] 下載以與 parts 編號對應
            const downloadedHistoryImagesMap = new Map<string, { buffer: Buffer; mimeType: string; labelIndex: number }>()
            let labelIdx = 1

            for (const item of imagesToDownload.reverse()) {
              try {
                const response = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 5000 })
                const contentType = response.headers['content-type']
                const contentTypeStr = typeof contentType === 'string' ? contentType : undefined
                const ext = item.url.split('.').pop()?.toLowerCase()
                const mimeType = (contentTypeStr && contentTypeStr.startsWith('image/'))
                  ? contentTypeStr
                  : ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'

                const imgObj = {
                  buffer: Buffer.from(response.data),
                  mimeType,
                  labelIndex: labelIdx++
                }
                downloadedHistoryImagesMap.set(item.msgId, imgObj)
                historyImagesPayload.push({ buffer: imgObj.buffer, mimeType: imgObj.mimeType })
              } catch (downloadError: any) {
                console.warn(`Failed to download history image from ${item.url}:`, downloadError.message)
              }
            }

            // 3. 組合歷史文字 context
            channelHistoryContext = chronologicalMsgs
              .map((msg: Message, i) => {
                const msgTimeSeconds = Math.floor(msg.createdTimestamp / 1000)
                const secondsAgo = nowSeconds - msgTimeSeconds
                const weight = ((i + 1) / k).toFixed(2)
                const authorName = msg.member?.displayName || msg.author.username
                const sender = msg.author.id === message.client.user?.id ? '波波' : authorName

                let processedContent = msg.content

                // 優先使用已下載的標記
                const downloadedImg = downloadedHistoryImagesMap.get(msg.id)
                if (downloadedImg) {
                  processedContent = `[歷史圖片 ${downloadedImg.labelIndex}] ${processedContent}`.trim()
                } else {
                  // 未下載或超出上限則標為純文字提示
                  const imageAttachments = msg.attachments.filter(att => att.contentType?.startsWith('image/'))
                  if (imageAttachments.size > 0) {
                    processedContent = `[圖片附件] ${processedContent}`.trim()
                  }

                  const urlMatch = msg.content.match(/https?:\/\/\S+/gi)
                  if (urlMatch) {
                    urlMatch.forEach(url => {
                      const isImg = url.match(/\.(jpeg|jpg|gif|png|webp|heic|heif|JEPG|JPG|GIF|PNG|WEBP|HEIC|HEIF)$/) != null
                      if (isImg) {
                        processedContent = processedContent.replace(url, `[圖片連結]`)
                      }
                    })
                  }
                }

                return `[時間: ${secondsAgo}秒前, 發送者: ${sender}, 熱度權重: ${weight}] 內容: "${processedContent}"`
              })
              .join('\n')
          }
        } catch (fetchError: any) {
          console.warn('Failed to fetch channel history:', fetchError.message)
        }
      }

      // 嘗試抓取圖片內容
      let image: { buffer: Buffer; mimeType: string } | undefined

      if (attachment && attachment.contentType?.startsWith('image/')) {
        try {
          const response = await axios.get(attachment.url, { responseType: 'arraybuffer', timeout: 10000 })
          image = {
            buffer: Buffer.from(response.data),
            mimeType: attachment.contentType
          }
        } catch (downloadError: any) {
          console.warn('Failed to download attachment:', downloadError.message)
        }
      }

      // 若無附件，偵測文字中是否含有圖片網址
      if (!image && prompt) {
        const urlMatch = prompt.match(/https?:\/\/\S+/i)
        if (urlMatch) {
          const url = urlMatch[0]
          const isImageUrl = url.match(/\.(jpeg|jpg|gif|png|webp|heic|heif|JEPG|JPG|GIF|PNG|WEBP|HEIC|HEIF)$/) != null
          if (isImageUrl) {
            try {
              const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 })
              const contentType = response.headers['content-type']
              const contentTypeStr = typeof contentType === 'string' ? contentType : undefined
              const ext = url.split('.').pop()?.toLowerCase()
              const mimeType = (contentTypeStr && contentTypeStr.startsWith('image/'))
                ? contentTypeStr
                : ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
              image = {
                buffer: Buffer.from(response.data),
                mimeType
              }
            } catch (urlError: any) {
              console.warn('Failed to download image from URL:', urlError.message)
            }
          }
        }
      }

      const reply = await chatWithBobo(prompt, message.author.id, channelHistoryContext, image, historyImagesPayload)
      message.reply(reply)
    } catch (error: any) {
      console.error('Error in BoboCommand:', error.message)
      message.reply('波波出錯了，無法回應。')
    }
  }
}

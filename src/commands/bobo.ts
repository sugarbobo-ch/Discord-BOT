import { Message } from 'discord.js'
import { Command } from './command.interface'
import { chatWithBobo } from '../utils/gemini'
import auth from '../../config/auth.json'
import axios from 'axios'

/**
 * 檢查 Discord 附件連結是否已過期或無效
 */
const isDiscordUrlExpired = (urlStr: string): boolean => {
  try {
    const url = new URL(urlStr)
    const isDiscordCdn = url.host.includes('discordapp.com') || url.host.includes('discordapp.net')
    if (!isDiscordCdn) {
      return false
    }

    // Discord 附件連結通常路徑包含 /attachments/
    if (url.pathname.includes('/attachments/')) {
      const ex = url.searchParams.get('ex')
      if (!ex) {
        // 沒有簽名參數，在 Discord CDN 機制下為已過期/無效連結
        return true
      }
      const expireTimestamp = parseInt(ex, 16) * 1000
      return Date.now() > expireTimestamp
    }
  } catch {
    // 網址解析失敗，不阻擋以進行一般請求嘗試
  }
  return false
}

/**
 * 檢查是否為圖片連結
 */
const isImageUrl = (urlStr: string): boolean => {
  try {
    const url = new URL(urlStr)
    const ext = url.pathname.split('.').pop()?.toLowerCase()
    return !!(ext && ['jpeg', 'jpg', 'gif', 'png', 'webp', 'heic', 'heif'].includes(ext))
  } catch {
    return false
  }
}

/**
 * 檢查是否為影片連結
 */
const isVideoUrl = (urlStr: string): boolean => {
  try {
    const url = new URL(urlStr)
    const ext = url.pathname.split('.').pop()?.toLowerCase()
    return !!(ext && ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'].includes(ext))
  } catch {
    return false
  }
}


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
            const historyMsgs = msgArray // [最新, ..., 最舊]

            // 1. 先從最新往舊尋找最多 3 張圖片，將其下載
            const MAX_HISTORY_IMAGES = 3
            const imagesToDownload: { msgId: string; url: string }[] = []

            for (const msg of historyMsgs) {
              if (imagesToDownload.length >= MAX_HISTORY_IMAGES) break

              // 檢查附件
              const imageAttachments = msg.attachments.filter(att => att.contentType?.startsWith('image/'))
              if (imageAttachments.size > 0) {
                const firstAtt = imageAttachments.first()
                if (firstAtt && !isDiscordUrlExpired(firstAtt.url)) {
                  imagesToDownload.push({ msgId: msg.id, url: firstAtt.url })
                  continue
                }
              }

              // 檢查內文 URL
              const urlMatch = msg.content.match(/https?:\/\/\S+/gi)
              if (urlMatch) {
                let found = false
                for (const url of urlMatch) {
                  if (isImageUrl(url) && !isDiscordUrlExpired(url)) {
                    imagesToDownload.push({ msgId: msg.id, url })
                    found = true
                    break
                  }
                }
                if (found) continue
              }
            }

            // 依序 [舊 -> 新] 下載以與 parts 編號對應
            const downloadedHistoryImagesMap = new Map<string, { buffer: Buffer; mimeType: string; labelIndex: number; url: string }>()
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
                  labelIndex: labelIdx++,
                  url: item.url
                }
                downloadedHistoryImagesMap.set(item.msgId, imgObj)
                historyImagesPayload.push({ buffer: imgObj.buffer, mimeType: imgObj.mimeType })
              } catch (downloadError: any) {
                const status = downloadError.response?.status
                if (status === 404 || status === 403) {
                  // Discord CDN 連結失效或已被刪除，此為預期現象，使用 info 記錄以保持 log 清潔
                  console.info(`History image from ${item.url} is no longer accessible (HTTP ${status}).`)
                } else {
                  console.warn(`Failed to download history image from ${item.url}:`, downloadError.message)
                }
              }
            }

            // 3. 組合歷史文字 context
            channelHistoryContext = historyMsgs
              .map((msg: Message, i) => {
                const msgTimeSeconds = Math.floor(msg.createdTimestamp / 1000)
                const secondsAgo = nowSeconds - msgTimeSeconds
                
                // 計算權重：最新一筆 (i = 0) 為 1.00，其餘依位置與時間衰減 (離當前時間越遠，分數調得越低)
                let calculatedWeight = Math.pow((k - i) / k, 2)
                if (i === 0) {
                  calculatedWeight = 1.0
                } else {
                  // 對於較舊的訊息，再額外乘以時間衰減係數（越久遠衰減越多，30 分鐘衰減常數，最低保留 0.1 避免完全歸零）
                  const timeDecay = Math.max(0.1, Math.exp(-secondsAgo / 1800))
                  calculatedWeight = calculatedWeight * timeDecay
                }
                const weight = Math.max(0.01, calculatedWeight).toFixed(2)

                const authorName = msg.member?.displayName || msg.author.username
                const sender = msg.author.id === message.client.user?.id ? '波波' : authorName

                let processedContent = msg.content

                // 優先使用已下載的標記
                const downloadedImg = downloadedHistoryImagesMap.get(msg.id)
                if (downloadedImg) {
                  processedContent = `[歷史圖片 ${downloadedImg.labelIndex} (由 ${sender} 分享，URL: ${downloadedImg.url})] ${processedContent}`.trim()
                }

                // 處理所有附件 (圖片與影片)
                const mediaAttachmentsInfo: string[] = []
                msg.attachments.forEach(att => {
                  const isImage = att.contentType?.startsWith('image/')
                  const isVideo = att.contentType?.startsWith('video/')
                  if (isImage) {
                    if (downloadedImg && downloadedImg.url === att.url) {
                      return // 已被 downloadedImg 包含，不重複處理
                    }
                    mediaAttachmentsInfo.push(`[圖片附件 (由 ${sender} 上傳): ${att.url}]`)
                  } else if (isVideo) {
                    mediaAttachmentsInfo.push(`[影片附件 (由 ${sender} 上傳): ${att.url}]`)
                  }
                })

                // 處理內文中的 URL
                const urlMatch = msg.content.match(/https?:\/\/\S+/gi)
                if (urlMatch) {
                  urlMatch.forEach(url => {
                    if (isImageUrl(url)) {
                      if (downloadedImg && downloadedImg.url === url) {
                        return // 已被 downloadedImg 包含，不重複處理
                      }
                      processedContent = processedContent.replace(url, `[圖片連結 (由 ${sender} 分享): ${url}]`)
                    } else if (isVideoUrl(url)) {
                      processedContent = processedContent.replace(url, `[影片連結 (由 ${sender} 分享): ${url}]`)
                    }
                  })
                }

                // 若有其他媒體附件，附加在內文後面
                if (mediaAttachmentsInfo.length > 0) {
                  processedContent = `${processedContent} ${mediaAttachmentsInfo.join(' ')}`.trim()
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
          if (isImageUrl(url)) {
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

      let statusMessage: any = null

      const reply = await chatWithBobo(
        prompt,
        message.author.id,
        channelHistoryContext,
        image,
        historyImagesPayload,
        async (statusText) => {
          try {
            if (!statusMessage) {
              statusMessage = await message.reply(statusText)
            } else {
              await statusMessage.edit(statusText)
            }
          } catch (msgErr: any) {
            console.error('Failed to send status update in Discord:', msgErr.message)
          }
        }
      )
      
      // Discord 訊息長度上限為 2000 字，在此進行切分以避免 API 報錯
      if (reply.length <= 2000) {
        if (statusMessage) {
          await statusMessage.edit(reply)
        } else {
          await message.reply(reply)
        }
      } else {
        const CHUNK_SIZE = 1900
        const chunks: string[] = []
        for (let i = 0; i < reply.length; i += CHUNK_SIZE) {
          chunks.push(reply.substring(i, i + CHUNK_SIZE))
        }

        if (chunks.length > 0) {
          let firstMsg: any
          if (statusMessage) {
            firstMsg = await statusMessage.edit(chunks[0])
          } else {
            firstMsg = await message.reply(chunks[0])
          }
          for (let i = 1; i < chunks.length; i++) {
            await (firstMsg.channel as any).send(chunks[i])
          }
        }
      }
    } catch (error: any) {
      console.error('Error in BoboCommand:', error.message)
      message.reply('波波出錯了，無法回應。')
    }
  }
}

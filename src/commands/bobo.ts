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

/**
 * 獲取訊息中的圖片網址 (優先使用附件，其次使用內文連結)
 */
const getMessageImageUrl = (msg: Message): string | null => {
  const imageAttachments = msg.attachments.filter(att =>
    att.contentType?.startsWith('image/')
  )
  if (imageAttachments.size > 0) {
    const firstAtt = imageAttachments.first()
    if (firstAtt && !isDiscordUrlExpired(firstAtt.url)) {
      return firstAtt.url
    }
  }

  const urlMatch = msg.content.match(/https?:\/\/\S+/gi)
  if (urlMatch) {
    for (const url of urlMatch) {
      if (isImageUrl(url) && !isDiscordUrlExpired(url)) {
        return url
      }
    }
  }
  return null
}

export class BoboCommand implements Command {
  public names = ['bobo']

  public async execute(message: Message, args: string[]): Promise<void> {
    let prompt = args.join(' ')
    const attachment = message.attachments.first()
    const hasAttachment = attachment && attachment.contentType?.startsWith('image/')

    // 1. 獲取被回覆的訊息
    let repliedMsg: Message | null = null
    if (message.reference && message.reference.messageId) {
      try {
        repliedMsg = await message.channel.messages.fetch(message.reference.messageId)
      } catch (fetchRefError: any) {
        console.warn('Failed to fetch referenced message:', fetchRefError.message)
      }
    }

    const repliedMsgImageUrl = repliedMsg ? getMessageImageUrl(repliedMsg) : null

    // 2. 處理當前 Prompt 與回覆訊息的關聯
    if (!prompt && !hasAttachment) {
      if (repliedMsg) {
        if (repliedMsgImageUrl) {
          prompt = '這張圖片是什麼？請跟我聊聊。'
        } else {
          prompt = '請回覆此訊息。'
        }
      } else {
        message.reply('叫波波幹嘛？後面要加上你想說的話或提供圖片啦！')
        return
      }
    }

    if (!prompt && hasAttachment) {
      prompt = '這張圖片是什麼？請跟我聊聊。'
    }

    let typingInterval: NodeJS.Timeout | undefined
    try {
      // 在等待 AI 回應時顯示「正在輸入...」狀態
      await (message.channel as any).sendTyping()
      typingInterval = setInterval(() => {
        ;(message.channel as any).sendTyping().catch((err: any) => {
          console.error('Failed to send typing indicator:', err.message)
        })
      }, 5000)

      // 3. 嘗試下載當前訊息的主圖片內容
      let image: { buffer: Buffer; mimeType: string } | undefined
      let isImageFromRepliedMsg = false

      if (attachment && attachment.contentType?.startsWith('image/')) {
        try {
          const response = await axios.get(attachment.url, {
            responseType: 'arraybuffer',
            timeout: 10000
          })
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
              const mimeType =
                contentTypeStr && contentTypeStr.startsWith('image/')
                  ? contentTypeStr
                  : ext === 'png'
                    ? 'image/png'
                    : ext === 'gif'
                      ? 'image/gif'
                      : 'image/jpeg'
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

      // 若當前訊息皆無圖片，且回覆訊息有圖片，將回覆訊息的圖片下載並作為主圖
      if (!image && repliedMsgImageUrl) {
        try {
          const response = await axios.get(repliedMsgImageUrl, {
            responseType: 'arraybuffer',
            timeout: 10000
          })
          const contentType = response.headers['content-type']
          const contentTypeStr = typeof contentType === 'string' ? contentType : undefined
          const ext = repliedMsgImageUrl.split('.').pop()?.toLowerCase()
          const mimeType =
            contentTypeStr && contentTypeStr.startsWith('image/')
              ? contentTypeStr
              : ext === 'png'
                ? 'image/png'
                : ext === 'gif'
                  ? 'image/gif'
                  : 'image/jpeg'
          image = {
            buffer: Buffer.from(response.data),
            mimeType
          }
          isImageFromRepliedMsg = true
        } catch (downloadError: any) {
          console.warn('Failed to download replied message image:', downloadError.message)
        }
      }

      const limit = (auth as any).chatMemoryLimit || 50
      let channelHistoryContext = ''
      const historyImagesPayload: { buffer: Buffer; mimeType: string }[] = []

      if (message.channel && message.channel.isTextBased()) {
        try {
          const fetched = await (message.channel as any).messages.fetch({
            limit,
            before: message.id
          })
          const msgArray = Array.from(fetched.values()) as Message[] // [最新, ..., 最舊]
          const historyMsgs = [...msgArray]

          // 4. 確保回覆的訊息存在於 historyMsgs 之中 (若它比歷史前 50 筆更舊，就將其 append 於最後)
          if (repliedMsg) {
            const hasRepliedInHistory = historyMsgs.some(m => m.id === repliedMsg!.id)
            if (!hasRepliedInHistory) {
              historyMsgs.push(repliedMsg)
            }
          }

          const k = historyMsgs.length
          if (k > 0) {
            const nowSeconds = Math.floor(Date.now() / 1000)

            // 1. 先從最新往舊尋找最多 3 張圖片，將其下載
            const MAX_HISTORY_IMAGES = 3
            const imagesToDownload: { msgId: string; url: string }[] = []

            // 如果有回覆的圖片，且沒有被用作主圖片 (isImageFromRepliedMsg 為 false)，則優先強行放入歷史下載清單
            if (repliedMsg && repliedMsgImageUrl && !isImageFromRepliedMsg) {
              imagesToDownload.push({ msgId: repliedMsg.id, url: repliedMsgImageUrl })
            }

            for (const msg of historyMsgs) {
              if (imagesToDownload.length >= MAX_HISTORY_IMAGES) break

              // 避免重複加入回覆訊息的圖片 (不管是當作主圖還是已經當作歷史圖加入)
              if (repliedMsg && msg.id === repliedMsg.id && repliedMsgImageUrl) {
                continue
              }

              const imgUrl = getMessageImageUrl(msg)
              if (imgUrl) {
                imagesToDownload.push({ msgId: msg.id, url: imgUrl })
              }
            }

            // 依序 [舊 -> 新] 下載以與 parts 編號對應 (讓最舊的圖片標記為 1，最新的歷史圖片標記為最後，符合時序)
            const downloadedHistoryImagesMap = new Map<
              string,
              { buffer: Buffer; mimeType: string; labelIndex: number; url: string }
            >()
            let labelIdx = 1

            for (const item of [...imagesToDownload].reverse()) {
              try {
                const response = await axios.get(item.url, {
                  responseType: 'arraybuffer',
                  timeout: 5000
                })
                const contentType = response.headers['content-type']
                const contentTypeStr = typeof contentType === 'string' ? contentType : undefined
                const ext = item.url.split('.').pop()?.toLowerCase()
                const mimeType =
                  contentTypeStr && contentTypeStr.startsWith('image/')
                    ? contentTypeStr
                    : ext === 'png'
                      ? 'image/png'
                      : ext === 'gif'
                        ? 'image/gif'
                        : 'image/jpeg'

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
                  console.info(
                    `History image from ${item.url} is no longer accessible (HTTP ${status}).`
                  )
                } else {
                  console.warn(
                    `Failed to download history image from ${item.url}:`,
                    downloadError.message
                  )
                }
              }
            }

            // 3. 組合歷史文字 context (包含當前訊息作為最上方最新的一筆，權重為 1.00)
            const currentSender = message.member?.displayName || message.author.username
            let currentProcessedContent = prompt
            if (hasAttachment && attachment) {
              currentProcessedContent = `[當前圖片 (由 ${currentSender} 上傳，URL: ${attachment.url})] ${currentProcessedContent}`.trim()
            } else if (repliedMsg && repliedMsgImageUrl && image && isImageFromRepliedMsg) {
              const repliedSender = repliedMsg.member?.displayName || repliedMsg.author.username
              currentProcessedContent = `[回覆的圖片 (由 ${repliedSender} 上傳，URL: ${repliedMsgImageUrl})] ${currentProcessedContent}`.trim()
            }

            let currentEntry = ''
            if (repliedMsg) {
              const repliedSender = repliedMsg.member?.displayName || repliedMsg.author.username
              currentEntry = `[時間: 0秒前, 發送者: ${currentSender}, 熱度權重: 1.00, 回覆給: ${repliedSender}] 內容: "${currentProcessedContent}"`
            } else {
              currentEntry = `[時間: 0秒前, 發送者: ${currentSender}, 熱度權重: 1.00] 內容: "${currentProcessedContent}"`
            }

            const historyEntries = historyMsgs.map((msg: Message, i) => {
              const msgTimeSeconds = Math.floor(msg.createdTimestamp / 1000)
              const secondsAgo = nowSeconds - msgTimeSeconds

              // 計算權重：回覆訊息權重強行設為 1.00。其他歷史訊息則依位置與時間衰減，最大上限為 0.90
              let weight = '0.90'
              const isRepliedMessage = msg.id === repliedMsg?.id
              if (isRepliedMessage) {
                weight = '1.00'
              } else {
                let calculatedWeight = Math.pow((k - i) / k, 2)
                const timeDecay = Math.max(0.1, Math.exp(-secondsAgo / 1800))
                calculatedWeight = calculatedWeight * timeDecay
                weight = Math.min(0.90, Math.max(0.01, calculatedWeight)).toFixed(2)
              }

              const authorName = msg.member?.displayName || msg.author.username
              const sender = msg.author.id === message.client.user?.id ? '波波' : authorName

              let processedContent = msg.content

              // 優先使用已下載的標記
              const downloadedImg = downloadedHistoryImagesMap.get(msg.id)
              if (downloadedImg) {
                const imgLabel = isRepliedMessage
                  ? '回覆的圖片'
                  : `歷史圖片 ${downloadedImg.labelIndex}`
                processedContent =
                  `[${imgLabel} (由 ${sender} 分享，URL: ${downloadedImg.url})] ${processedContent}`.trim()
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
                    processedContent = processedContent.replace(
                      url,
                      `[圖片連結 (由 ${sender} 分享): ${url}]`
                    )
                  } else if (isVideoUrl(url)) {
                    processedContent = processedContent.replace(
                      url,
                      `[影片連結 (由 ${sender} 分享): ${url}]`
                    )
                  }
                })
              }

              // 若有其他媒體附件，附加在內文後面
              if (mediaAttachmentsInfo.length > 0) {
                processedContent = `${processedContent} ${mediaAttachmentsInfo.join(' ')}`.trim()
              }

              const replyTargetLabel = isRepliedMessage ? ', 此為回覆目標' : ''
              return `[時間: ${secondsAgo}秒前, 發送者: ${sender}, 熱度權重: ${weight}${replyTargetLabel}] 內容: "${processedContent}"`
            })

            channelHistoryContext = [currentEntry, ...historyEntries].join('\n')
          }
        } catch (fetchError: any) {
          console.warn('Failed to fetch channel history:', fetchError.message)
        }
      }

      let statusMessage: any = null

      const currentAuthorName = message.member?.displayName || message.author.username
      const reply = await chatWithBobo(
        prompt,
        message.author.id,
        channelHistoryContext,
        image,
        historyImagesPayload,
        async statusText => {
          try {
            if (!statusMessage) {
              statusMessage = await message.reply(statusText)
            } else {
              await statusMessage.edit(statusText)
            }
            // 編輯狀態訊息後重新觸發「正在輸入...」狀態，確保指示器在後續查詢中持續保有
            await (message.channel as any).sendTyping().catch((err: any) => {
              console.error('Failed to send typing indicator after status update:', err.message)
            })
          } catch (msgErr: any) {
            console.error('Failed to send status update in Discord:', msgErr.message)
          }
        },
        currentAuthorName
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
    } finally {
      if (typingInterval) {
        clearInterval(typingInterval)
      }
    }
  }
}

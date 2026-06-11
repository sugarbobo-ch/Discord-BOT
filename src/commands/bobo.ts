import { Message, MessageType } from 'discord.js'
import { Command } from './command.interface'
import { chatWithBobo, getHybridContext, updateMemoryInBackground } from '../utils/gemini'
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
 * 判斷是否為系統訊息（身分組通知、伺服器加成等），這類訊息不應被讀取圖片
 */
const isSystemMessage = (msg: Message): boolean => {
  // MessageType.Default = 0, MessageType.Reply = 19
  // 只有一般訊息和回覆訊息才應處理，其餘皆為系統訊息（如身分組購買、加成通知等）
  return msg.type !== MessageType.Default && msg.type !== MessageType.Reply
}

/**
 * 判斷是否為 Discord 身分組圖示 CDN 連結（role-icons）
 * 格式: https://cdn.discordapp.com/role-icons/{role_id}/{icon_hash}.webp
 */
const isRoleIconUrl = (urlStr: string): boolean => {
  return urlStr.includes('/role-icons/')
}

/**
 * 獲取訊息中的圖片網址 (優先使用附件，其次使用 Embed 圖片，最後使用內文連結)
 * 注意：此函數不處理系統訊息的過濾，呼叫端應先以 isSystemMessage 判斷
 */
const getMessageImageUrl = (msg: Message): string | null => {
  // 1. 優先使用直接上傳的圖片附件
  const imageAttachments = msg.attachments.filter(att => att.contentType?.startsWith('image/'))
  if (imageAttachments.size > 0) {
    const firstAtt = imageAttachments.first()
    if (firstAtt && !isDiscordUrlExpired(firstAtt.url)) {
      return firstAtt.url
    }
  }

  // 2. 從 Embed 中提取圖片（例如連結預覽圖、K線圖等，過濾掉身分組圖示）
  if (msg.embeds && msg.embeds.length > 0) {
    for (const embed of msg.embeds) {
      // 優先取 embed.image，其次取 embed.thumbnail
      const embedImageUrl = embed.image?.url || embed.thumbnail?.url
      if (embedImageUrl && !isDiscordUrlExpired(embedImageUrl) && !isRoleIconUrl(embedImageUrl)) {
        return embedImageUrl
      }
    }
  }

  // 3. 從內文中尋找圖片連結
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

/**
 * 安全地回覆訊息，如果原始訊息被刪除，則退回直接發送至頻道，防止崩潰
 */
const safeReply = async (msg: Message, content: any): Promise<Message | null> => {
  try {
    return await msg.reply(content)
  } catch (err: any) {
    console.warn(`Failed to reply to message ${msg.id}, falling back to channel send:`, err.message)
    try {
      return await (msg.channel as any).send(content)
    } catch (channelErr: any) {
      console.error('Failed to send fallback channel message:', channelErr.message)
      return null
    }
  }
}

/**
 * 安全地編輯狀態訊息，如果狀態訊息或原始訊息失效/被刪，則改用 safeReply 發送新訊息
 */
const safeEdit = async (
  statusMsg: Message | null,
  originalMsg: Message,
  content: any
): Promise<Message | null> => {
  if (statusMsg) {
    try {
      return await statusMsg.edit(content)
    } catch (err: any) {
      console.warn(
        `Failed to edit status message ${statusMsg.id}, falling back to reply/send:`,
        err.message
      )
      return await safeReply(originalMsg, content)
    }
  } else {
    return await safeReply(originalMsg, content)
  }
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
        await safeReply(message, '叫波波幹嘛？後面要加上你想說的話或提供圖片啦！')
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

      // 3. 嘗試下載當前訊息的主圖片內容 (若為回覆訊息含有圖片，以該張圖片為主)
      let image: { buffer: Buffer; mimeType: string; description?: string } | undefined
      let isImageFromRepliedMsg = false
      const currentSender = message.member?.displayName || message.author.username

      // 優先檢查被回覆的訊息是否含有圖片
      if (repliedMsg && repliedMsgImageUrl) {
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

          const repliedSender = repliedMsg.member?.displayName || repliedMsg.author.username
          image = {
            buffer: Buffer.from(response.data),
            mimeType,
            description: `[發送者: ${repliedSender}] 內容: "${repliedMsg.content || ''}"`
          }
          isImageFromRepliedMsg = true
        } catch (downloadError: any) {
          console.warn('Failed to download replied message image:', downloadError.message)
        }
      }

      // 如果不是回覆圖片 (或者回覆圖片下載失敗)，才下載當前訊息的附件
      if (!image) {
        if (attachment && attachment.contentType?.startsWith('image/')) {
          try {
            const response = await axios.get(attachment.url, {
              responseType: 'arraybuffer',
              timeout: 10000
            })
            image = {
              buffer: Buffer.from(response.data),
              mimeType: attachment.contentType,
              description: `[發送者: ${currentSender}] 內容: "${prompt}"`
            }
          } catch (downloadError: any) {
            console.warn('Failed to download attachment:', downloadError.message)
          }
        }
      }

      // 若皆無，最後偵測文字中是否含有圖片網址
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
                mimeType,
                description: `[發送者: ${currentSender}] 內容: "${prompt}"`
              }
            } catch (urlError: any) {
              console.warn('Failed to download image from URL:', urlError.message)
            }
          }
        }
      }

      const limit = (auth as any).chatMemoryLimit || 50
      let channelHistoryContext = ''
      const historyImagesPayload: { buffer: Buffer; mimeType: string; description?: string }[] = []

      if (message.channel && message.channel.isTextBased()) {
        try {
          // 4. 取得混合式上下文 (包含最近的頻道訊息與顯式回覆鏈)
          const hybridMsgs = await getHybridContext(message, limit, 5)
          const historyMsgs = [...hybridMsgs].reverse() // 轉為 [最新, ..., 最舊] 以配合原先的處理順序與權重計算

          const k = historyMsgs.length
          if (k > 0) {
            const nowSeconds = Math.floor(Date.now() / 1000)

            // 1. 先從最新往舊尋找最多 3 張圖片，將其下載
            const MAX_HISTORY_IMAGES = 3
            const imagesToDownload: { msgId: string; url: string }[] = []

            // 如果當前訊息有圖片附件，但主圖被回覆訊息的圖片佔用，則當前訊息圖片優先當作最優先/最新的歷史圖片
            if (
              attachment &&
              attachment.contentType?.startsWith('image/') &&
              isImageFromRepliedMsg
            ) {
              imagesToDownload.push({ msgId: message.id, url: attachment.url })
            }

            // 如果有回覆的圖片，且沒有被用作主圖片 (isImageFromRepliedMsg 為 false)，則優先強行放入歷史下載清單
            if (repliedMsg && repliedMsgImageUrl && !isImageFromRepliedMsg) {
              imagesToDownload.push({ msgId: repliedMsg.id, url: repliedMsgImageUrl })
            }

            for (const msg of historyMsgs) {
              if (imagesToDownload.length >= MAX_HISTORY_IMAGES) break

              // 跳過系統訊息（身分組通知、伺服器加成等），避免讀取無關圖片
              if (isSystemMessage(msg)) continue

              // 避免重複加入回覆訊息的圖片 (不管是當作主圖還是已經當作歷史圖加入)
              if (repliedMsg && msg.id === repliedMsg.id && repliedMsgImageUrl) {
                continue
              }

              const imgUrl = getMessageImageUrl(msg)
              if (imgUrl) {
                imagesToDownload.push({ msgId: msg.id, url: imgUrl })
              }
            }

            // 依序 [新 -> 舊] 下載以符合最新的那張圖在最前面的順序 (讓最新的歷史圖片標記為 1，較舊的歷史圖片標記為後，符合時序)
            const downloadedHistoryImagesMap = new Map<
              string,
              {
                buffer: Buffer
                mimeType: string
                labelIndex: number
                url: string
                description: string
              }
            >()
            let labelIdx = 1

            for (const item of imagesToDownload) {
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

                // 獲取該圖片對應的訊息內容作為描述
                const msg =
                  historyMsgs.find(m => m.id === item.msgId) ||
                  (item.msgId === message.id ? message : null)
                let description = ''
                if (msg) {
                  const author = msg.member?.displayName || msg.author.username
                  const sender = msg.author.id === message.client.user?.id ? '波波' : author
                  description = `[發送者: ${sender}] 內容: "${msg.content || ''}"`
                }

                const imgObj = {
                  buffer: Buffer.from(response.data),
                  mimeType,
                  labelIndex: labelIdx++,
                  url: item.url,
                  description
                }
                downloadedHistoryImagesMap.set(item.msgId, imgObj)
                historyImagesPayload.push({
                  buffer: imgObj.buffer,
                  mimeType: imgObj.mimeType,
                  description: imgObj.description
                })
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
            let currentProcessedContent = prompt
            if (isImageFromRepliedMsg && repliedMsgImageUrl) {
              const repliedSender = repliedMsg!.member?.displayName || repliedMsg!.author.username
              currentProcessedContent =
                `[回覆的圖片 (由 ${repliedSender} 上傳，URL: ${repliedMsgImageUrl})] ${currentProcessedContent}`.trim()
            } else if (hasAttachment && attachment) {
              currentProcessedContent =
                `[當前圖片 (由 ${currentSender} 上傳，URL: ${attachment.url})] ${currentProcessedContent}`.trim()
            }

            let currentEntry = ''
            if (repliedMsg) {
              const repliedSender = repliedMsg.member?.displayName || repliedMsg.author.username
              currentEntry = `[時間: 0秒前, 發送者: ${currentSender}, 熱度權重: 1.00, 回覆給: ${repliedSender}] 內容: "${currentProcessedContent}"`
            } else {
              currentEntry = `[時間: 0秒前, 發送者: ${currentSender}, 熱度權重: 1.00] 內容: "${currentProcessedContent}"`
            }

            const historyEntries = historyMsgs
              .filter((msg: Message) => !isSystemMessage(msg)) // 過濾掉系統訊息（身分組通知等）
              .map((msg: Message, i) => {
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
                  weight = Math.min(0.9, Math.max(0.01, calculatedWeight)).toFixed(2)
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

                // 處理 Embed 圖片（連結預覽圖、K線圖等）
                if (msg.embeds && msg.embeds.length > 0) {
                  for (const embed of msg.embeds) {
                    const embedImageUrl = embed.image?.url || embed.thumbnail?.url
                    if (embedImageUrl && !isRoleIconUrl(embedImageUrl)) {
                      if (downloadedImg && downloadedImg.url === embedImageUrl) {
                        continue // 已被 downloadedImg 包含，不重複處理
                      }
                      mediaAttachmentsInfo.push(
                        `[Embed 圖片 (由 ${sender} 分享): ${embedImageUrl}]`
                      )
                    }
                  }
                }

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
              statusMessage = await safeReply(message, statusText)
            } else {
              statusMessage = await safeEdit(statusMessage, message, statusText)
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

      // 5. 異步更新長期記憶
      updateMemoryInBackground(
        message.author.id,
        currentAuthorName,
        prompt,
        reply
      ).catch(err => {
        console.error('[Memory Update Background Error]:', err)
      })

      // Discord 訊息長度上限為 2000 字，在此進行切分以避免 API 報錯
      if (reply.length <= 2000) {
        if (statusMessage) {
          await safeEdit(statusMessage, message, reply)
        } else {
          await safeReply(message, reply)
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
            firstMsg = await safeEdit(statusMessage, message, chunks[0])
          } else {
            firstMsg = await safeReply(message, chunks[0])
          }
          if (firstMsg) {
            for (let i = 1; i < chunks.length; i++) {
              await (firstMsg.channel as any).send(chunks[i]).catch((err: any) => {
                console.error(`Failed to send chunk ${i}:`, err.message)
              })
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Error in BoboCommand:', error.message)
      await safeReply(message, '波波出錯了，無法回應。')
    } finally {
      if (typingInterval) {
        clearInterval(typingInterval)
      }
      // 強制結束 Discord 的正在輸入狀態 (透過發送並立即刪除隱形訊息)
      try {
        const dummy = await (message.channel as any).send({ content: '\u200B' })
        await dummy.delete().catch(() => {})
      } catch {
        // 忽略可能存在的發言權限或刪除權限錯誤
      }
    }
  }
}

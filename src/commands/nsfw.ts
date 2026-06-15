import { Message, EmbedBuilder } from 'discord.js'
import { Command } from './command.interface'
import axios from 'axios'
import { fetchWnacgMetadata, fetchNhentaiMetadata, createEmbed } from '../features/nsfwEmbed'

interface SaucenaoResult {
  similarity: number
  thumbnail?: string
  title?: string
  sourceUrl?: string
  authorName?: string
  authorUrl?: string
  material?: string
  characters?: string
  rawMetadata?: string
}

export class NsfwCommand implements Command {
  public names = ['pixiv', '搜圖', '神的語言', 'nhentai', 'god', 'wnacg']

  public async execute(message: Message, args: string[]): Promise<void> {
    const cmd = message.content.substring(1).split(' ')[0].toLowerCase()
    switch (cmd) {
      case 'pixiv':
        await this.getPixivURL(message, args)
        break
      case '搜圖':
        await this.getSourceURL(message, args)
        break
      case '神的語言':
      case 'nhentai':
      case 'god':
        await this.getHentaiURL(message, args)
        break
      case 'wnacg':
        await this.getWnacgURL(message, args)
        break
    }
  }

  private async getPixivURL(message: Message, args: string[]): Promise<void> {
    if (args.length === 1) {
      if (message.channel.isTextBased() && 'nsfw' in message.channel && !message.channel.nsfw) {
        ;(message.channel as any).send('請至開車頻道使用此指令')
        return
      }
      const id = args[0].trim()
      if (!/^\d+$/.test(id)) {
        message.reply('格式錯誤，正確格式為：!pixiv [作品ID]')
        return
      }
      const embed = new EmbedBuilder()
        .setTitle(`Pixiv 作品 - ${id}`)
        .setURL(`https://www.pixiv.net/artworks/${id}`)
        .setImage(`https://pixiv.cat/${id}.png`)
        .setColor(0x0096fa)
        .setAuthor({ name: 'Pixiv' })
        .setTimestamp()

      ;(message.channel as any).send({ embeds: [embed] })
    } else {
      message.reply('格式錯誤，正確格式為：!pixiv [作品ID]')
    }
  }

  private getImageUrlFromMessage(msg: Message): string | null {
    // 1. 優先使用直接上傳的圖片附件
    const attachment = msg.attachments.find(
      att => !!(att.contentType?.startsWith('image/') || this.isImageUrl(att.url))
    )
    if (attachment) {
      return attachment.url
    }

    // 2. 從 Embed 中提取圖片（例如連結預覽圖、K線圖等）
    if (msg.embeds && msg.embeds.length > 0) {
      for (const embed of msg.embeds) {
        const embedImageUrl = embed.image?.url || embed.thumbnail?.url
        if (embedImageUrl && !embedImageUrl.includes('/role-icons/')) {
          return embedImageUrl
        }
      }
    }

    // 3. 從內文中尋找圖片連結
    const urlMatch = msg.content.match(/https?:\/\/\S+/gi)
    if (urlMatch) {
      for (const url of urlMatch) {
        if (this.isImageUrl(url)) {
          return url
        }
      }
    }

    return null
  }

  private async getSourceURL(message: Message, args: string[]): Promise<void> {
    let imageUrl = ''

    // 1. Check if args[0] is a URL
    if (args.length === 1 && (args[0].startsWith('http://') || args[0].startsWith('https://'))) {
      imageUrl = args[0]
    }

    // 2. Check if current message has image attachments
    if (!imageUrl) {
      imageUrl = this.getImageUrlFromMessage(message) || ''
    }

    // 3. Check if current message is a reply
    if (!imageUrl && message.reference && message.reference.messageId) {
      try {
        const refMsg = await message.channel.messages.fetch(message.reference.messageId)
        imageUrl = this.getImageUrlFromMessage(refMsg) || ''
      } catch (err: any) {
        console.warn('Failed to fetch referenced message:', err.message)
      }
    }

    // 4. Check channel history for recent images
    if (!imageUrl && message.channel.isTextBased()) {
      try {
        const fetched = await message.channel.messages.fetch({ limit: 20, before: message.id })
        for (const msg of fetched.values()) {
          const url = this.getImageUrlFromMessage(msg)
          if (url) {
            imageUrl = url
            break
          }
        }
      } catch (err: any) {
        console.warn('Failed to fetch channel history for image search:', err.message)
      }
    }

    if (!imageUrl) {
      ;(message.channel as any).send(
        '找不到可以搜尋的圖片，請提供圖片網址、附帶圖片或回覆一張圖片！'
      )
      return
    }

    let statusMessage: Message | null = null
    try {
      statusMessage = await (message.channel as any).send('🔍 正在搜尋圖片，請稍候...')
    } catch (err) {
      console.warn('Failed to send status message:', err)
    }

    try {
      // 5. Download the image
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 })
      const uint8Array = new Uint8Array(response.data)

      let ext = imageUrl.split('.').pop()?.toLowerCase() || 'png'
      // Strip query parameters if present in the extension parsing
      if (ext.includes('?')) {
        ext = ext.split('?')[0]
      }
      if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
        ext = 'png'
      }

      const contentType = response.headers['content-type']
      const mimeType = (typeof contentType === 'string' ? contentType : undefined) || `image/${ext}`

      // 6. Upload the image to Saucenao's public form
      const formData = new FormData()
      const blob = new Blob([uint8Array], { type: mimeType })
      formData.append('file', blob, `image.${ext}`)

      const uploadResponse = await axios.post('https://saucenao.com/search.php', formData, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      })

      const html = uploadResponse.data
      const regexEdit = /edit\.php\?[^"]*image=([A-Za-z0-9._-]+)/i
      const matchEdit = html.match(regexEdit)

      if (matchEdit) {
        const fileName = matchEdit[1]
        const tempUrl = `https://saucenao.com/userdata/tmp/${fileName}`
        const finalSearchUrl = `https://saucenao.com/search.php?db=999&url=${encodeURIComponent(tempUrl)}`

        // Parse the results from the HTML response
        const results = this.parseSaucenaoHtml(html)
        const bestResult = results[0]

        if (bestResult && bestResult.similarity > 0) {
          const embed = new EmbedBuilder()
            .setTitle(bestResult.title || '搜尋結果')
            .setURL(finalSearchUrl)
            .setColor(bestResult.similarity >= 60 ? 0x4caf50 : 0xff9800)
            .addFields({ name: '相似度', value: `${bestResult.similarity}%`, inline: true })

          if (bestResult.authorName) {
            const authorVal = bestResult.authorUrl
              ? `[${bestResult.authorName}](${bestResult.authorUrl})`
              : bestResult.authorName
            embed.addFields({ name: '作者 (Creator)', value: authorVal, inline: true })
          }

          if (bestResult.sourceUrl) {
            embed.addFields({
              name: '來源 (Source)',
              value: `[點我前往](${bestResult.sourceUrl})`,
              inline: true
            })
          }

          if (bestResult.material) {
            embed.addFields({ name: '原作 (Material)', value: bestResult.material, inline: false })
          }

          if (bestResult.characters) {
            embed.addFields({
              name: '角色 (Characters)',
              value: bestResult.characters,
              inline: false
            })
          }

          if (bestResult.thumbnail) {
            embed.setImage(bestResult.thumbnail)
          }

          if (bestResult.similarity < 60) {
            embed.setDescription('⚠️ 相似度較低，此結果可能非目標圖片。')
          }

          embed
            .setFooter({ text: '搜尋服務由 Saucenao 提供 • 點擊標題查看完整網頁結果' })
            .setTimestamp()

          if (statusMessage) {
            await statusMessage.edit({ content: '搜尋完成！', embeds: [embed] })
          } else {
            ;(message.channel as any).send({ embeds: [embed] })
          }
        } else {
          // No results parsed successfully, fallback to link sending
          if (statusMessage) {
            await statusMessage.edit(finalSearchUrl)
          } else {
            ;(message.channel as any).send(finalSearchUrl)
          }
        }
      } else {
        throw new Error('Could not parse upload file name from Saucenao response')
      }
    } catch (err: any) {
      console.warn('Saucenao upload failed, falling back to direct URL search:', err.message)
      const fallbackUrl = `https://saucenao.com/search.php?db=999&url=${encodeURIComponent(imageUrl)}`
      if (statusMessage) {
        await statusMessage.edit(fallbackUrl)
      } else {
        ;(message.channel as any).send(fallbackUrl)
      }
    }
  }

  private parseSaucenaoHtml(html: string): SaucenaoResult[] {
    const results: SaucenaoResult[] = []
    const resultBlockRegex = /<table class="resulttable">([\s\S]*?)<\/table>/gi
    let blockMatch: RegExpExecArray | null

    while ((blockMatch = resultBlockRegex.exec(html)) !== null) {
      const tableHtml = blockMatch[1]

      // 1. Similarity
      const similarityMatch = tableHtml.match(/<div class="resultsimilarityinfo">([\d.]+)%<\/div>/i)
      const similarity = similarityMatch ? parseFloat(similarityMatch[1]) : 0

      // 2. Thumbnail
      let thumbnail: string | undefined
      const dataSrcMatch = tableHtml.match(/data-src="([^"]+)"/i)
      if (dataSrcMatch) {
        thumbnail = dataSrcMatch[1]
      } else {
        const srcMatch = tableHtml.match(/src="([^"]+)"/i)
        if (srcMatch && !srcMatch[1].includes('blocked.gif')) {
          thumbnail = srcMatch[1]
        }
      }

      if (thumbnail) {
        if (thumbnail.startsWith('//')) {
          thumbnail = `https:${thumbnail}`
        } else if (thumbnail.startsWith('/')) {
          thumbnail = `https://saucenao.com${thumbnail}`
        } else if (!thumbnail.startsWith('http')) {
          thumbnail = `https://saucenao.com/${thumbnail}`
        }
      }

      // 3. Title
      const titleMatch = tableHtml.match(/<div class="resulttitle">([\s\S]*?)<\/div>/i)
      let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : undefined

      // 4. Metadata content
      const contentColumnMatch = tableHtml.match(
        /<div class="resultcontentcolumn">([\s\S]*?)<\/div>/i
      )
      const metadataHtml = contentColumnMatch ? contentColumnMatch[1] : ''

      let sourceUrl: string | undefined
      let authorName: string | undefined
      let authorUrl: string | undefined
      let material: string | undefined
      let characters: string | undefined

      const itemRegex = /<strong>([\s\S]*?):?\s*<\/strong>([\s\S]*?)(?=<br|$)/gi
      let itemMatch: RegExpExecArray | null

      // Extract the first link in the content column as a default sourceUrl if not matched yet
      const firstLinkMatch = metadataHtml.match(/href="([^"]+)"/i)
      if (firstLinkMatch) {
        sourceUrl = firstLinkMatch[1]
      }

      while ((itemMatch = itemRegex.exec(metadataHtml)) !== null) {
        const label = itemMatch[1]
          .replace(/<[^>]+>/g, '')
          .trim()
          .toLowerCase()
        const valHtml = itemMatch[2].trim()
        const valText = valHtml.replace(/<[^>]+>/g, '').trim()

        if (
          label.includes('creator') ||
          label.includes('author') ||
          label.includes('member') ||
          label.includes('artist')
        ) {
          authorName = valText
          const authorLinkMatch = valHtml.match(/href="([^"]+)"/i)
          if (authorLinkMatch) {
            authorUrl = authorLinkMatch[1]
          }
        } else if (label.includes('source') || label.includes('pixiv') || label.includes('da id')) {
          const sourceLinkMatch = valHtml.match(/href="([^"]+)"/i)
          if (sourceLinkMatch) {
            sourceUrl = sourceLinkMatch[1]
          } else {
            sourceUrl = valText
          }
        } else if (label.includes('material')) {
          material = valText
        } else if (label.includes('character')) {
          characters = valText
        }
      }

      results.push({
        similarity,
        thumbnail,
        title,
        sourceUrl,
        authorName,
        authorUrl,
        material,
        characters,
        rawMetadata: metadataHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      })
    }

    return results
  }

  private isImageUrl(urlStr: string): boolean {
    try {
      const url = new URL(urlStr)
      let ext = url.pathname.split('.').pop()?.toLowerCase()
      if (ext && ext.includes('?')) {
        ext = ext.split('?')[0]
      }
      return !!(ext && ['jpeg', 'jpg', 'gif', 'png', 'webp', 'heic', 'heif'].includes(ext))
    } catch {
      return false
    }
  }

  private async getHentaiURL(message: Message, args: string[]): Promise<void> {
    const cmd = message.content.substring(1).split(' ')[0].toLowerCase()
    if (args.length === 1) {
      if (message.channel.isTextBased() && 'nsfw' in message.channel && !message.channel.nsfw) {
        ;(message.channel as any).send('請至開車頻道使用此指令')
        return
      }
      const id = args[0].trim()
      if (!/^\d+$/.test(id)) {
        message.reply(`格式錯誤，正確格式為：!${cmd} [車號]`)
        return
      }

      let statusMessage: Message | null = null
      try {
        statusMessage = await (message.channel as any).send('🔍 正在讀取本本資訊，請稍候...')
      } catch (err) {
        console.warn('Failed to send status message:', err)
      }

      try {
        const metadata = await fetchNhentaiMetadata(id)
        if (metadata) {
          const embed = createEmbed(metadata)
          if (statusMessage) {
            await statusMessage.edit({ content: '讀取完成！', embeds: [embed] })
          } else {
            ;(message.channel as any).send({ embeds: [embed] })
          }
        } else {
          // Fallback to basic embed if scraping mirror fails
          const fallbackEmbed = new EmbedBuilder()
            .setTitle(`nhentai 本子 - ${id}`)
            .setURL(`https://nhentai.net/g/${id}`)
            .setColor(0xed2553)
            .setDescription('⚠️ 無法自動獲取詳細資訊，請點擊標題連結前往閱讀。')
            .setTimestamp()

          if (statusMessage) {
            await statusMessage.edit({ content: '', embeds: [fallbackEmbed] })
          } else {
            ;(message.channel as any).send({ embeds: [fallbackEmbed] })
          }
        }
      } catch (error: any) {
        console.error('Failed to send nhentai embed:', error.message || error)
        if (statusMessage) {
          await statusMessage.edit(`https://nhentai.net/g/${id}`)
        } else {
          ;(message.channel as any).send(`https://nhentai.net/g/${id}`)
        }
      }
    } else {
      message.reply(`格式錯誤，正確格式為：!${cmd} [車號]`)
    }
  }

  private async getWnacgURL(message: Message, args: string[]): Promise<void> {
    if (args.length === 1) {
      if (message.channel.isTextBased() && 'nsfw' in message.channel && !message.channel.nsfw) {
        ;(message.channel as any).send('請至開車頻道使用此指令')
        return
      }
      const id = args[0].trim()
      if (!/^\d+$/.test(id)) {
        message.reply('格式錯誤，正確格式為：!wnacg [車號]')
        return
      }

      let statusMessage: Message | null = null
      try {
        statusMessage = await (message.channel as any).send('🔍 正在讀取本本資訊，請稍候...')
      } catch (err) {
        console.warn('Failed to send status message:', err)
      }

      try {
        const url = `https://www.wnacg.com/photos-index-aid-${id}.html`
        const metadata = await fetchWnacgMetadata(url)
        if (metadata) {
          const embed = createEmbed(metadata)
          if (statusMessage) {
            await statusMessage.edit({ content: '讀取完成！', embeds: [embed] })
          } else {
            ;(message.channel as any).send({ embeds: [embed] })
          }
        } else {
          if (statusMessage) {
            await statusMessage.edit(url)
          } else {
            ;(message.channel as any).send(url)
          }
        }
      } catch (error: any) {
        console.error('Failed to send wnacg embed:', error.message || error)
        const url = `https://www.wnacg.com/photos-index-aid-${id}.html`
        if (statusMessage) {
          await statusMessage.edit(url)
        } else {
          ;(message.channel as any).send(url)
        }
      }
    } else {
      message.reply('格式錯誤，正確格式為：!wnacg [車號]')
    }
  }
}

export const runNsfwCommand = (message: Message): Promise<void> | void => {
  const content = message.content.substring(1)
  const commands = content.split(' ')
  const args = commands.slice(1)
  return new NsfwCommand().execute(message, args)
}

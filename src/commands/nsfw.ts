import { Message, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js'
import { Command } from './command.interface'
import axios from 'axios'
import { fetchWnacgMetadata, fetchNhentaiMetadata, createEmbed } from '../features/nsfwEmbed'
import { CommandContext } from '../utils/context'

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

  public slashData = [
    {
      name: 'pixiv',
      description: '生成 Pixiv 作品的嵌入預覽圖 (限開車頻道)',
      options: [
        {
          name: '作品id',
          type: 3, // String
          description: 'Pixiv 的作品 ID (純數字)',
          required: true
        }
      ]
    },
    {
      name: 'nhentai',
      description: '搜尋並生成 nhentai 本本的詳細資訊卡片',
      options: [
        {
          name: '車號',
          type: 3, // String
          description: '本本的 6 位數車號',
          required: true
        }
      ]
    },
    {
      name: 'wnacg',
      description: '搜尋並生成 wnacg 紳士漫畫的詳細資訊卡片 (限開車頻道)',
      options: [
        {
          name: '車號',
          type: 3, // String
          description: '漫畫的 aid 車號',
          required: true
        }
      ]
    },
    {
      name: '搜圖',
      description: '使用 Saucenao 搜尋圖片的來源與畫師資訊',
      options: [
        {
          name: '圖片',
          type: 11, // Attachment
          description: '上傳要搜圖的圖片檔案',
          required: false
        },
        {
          name: '網址',
          type: 3, // String
          description: '輸入要搜圖的圖片網址',
          required: false
        }
      ]
    }
  ]

  public async execute(message: Message, args: string[]): Promise<void> {
    const cmd = message.content.substring(1).split(' ')[0].toLowerCase()
    const ctx = new CommandContext(message)
    const val = args[0]?.trim() || ''
    switch (cmd) {
      case 'pixiv':
        await this.getPixivURL(ctx, val)
        break
      case '搜圖':
        await this.getSourceURL(ctx, val.startsWith('http') ? val : undefined)
        break
      case '神的語言':
      case 'nhentai':
      case 'god':
        await this.getHentaiURL(ctx, val)
        break
      case 'wnacg':
        await this.getWnacgURL(ctx, val)
        break
    }
  }

  public async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const cmd = interaction.commandName.toLowerCase()
    const ctx = new CommandContext(interaction)
    switch (cmd) {
      case 'pixiv': {
        const id = interaction.options.getString('作品id', true)
        await this.getPixivURL(ctx, id)
        break
      }
      case 'nhentai': {
        const id = interaction.options.getString('車號', true)
        await this.getHentaiURL(ctx, id)
        break
      }
      case 'wnacg': {
        const id = interaction.options.getString('車號', true)
        await this.getWnacgURL(ctx, id)
        break
      }
      case '搜圖': {
        const url = interaction.options.getString('網址') || undefined
        const img = interaction.options.getAttachment('圖片')
        await this.getSourceURL(ctx, url, img?.url || undefined)
        break
      }
    }
  }

  private async getPixivURL(ctx: CommandContext, id: string): Promise<void> {
    if (!id) {
      const prefix = ctx.isInteraction ? '/' : '!'
      ctx.reply(`格式錯誤，正確格式為：${prefix}pixiv [作品ID]`)
      return
    }
    if (ctx.channel && 'nsfw' in ctx.channel && !ctx.channel.nsfw) {
      ctx.reply('請至開車頻道使用此指令')
      return
    }
    if (!/^\d+$/.test(id)) {
      ctx.reply('格式錯誤，作品ID必須為數字')
      return
    }
    const embed = new EmbedBuilder()
      .setTitle(`Pixiv 作品 - ${id}`)
      .setURL(`https://www.pixiv.net/artworks/${id}`)
      .setImage(`https://pixiv.cat/${id}.png`)
      .setColor(0x0096fa)
      .setAuthor({ name: 'Pixiv' })
      .setTimestamp()

    ctx.reply({ embeds: [embed] })
  }

  private getImageUrlFromMessage(msg: Message): string | null {
    const attachment = msg.attachments.find(
      att => !!(att.contentType?.startsWith('image/') || this.isImageUrl(att.url))
    )
    if (attachment) {
      return attachment.url
    }

    if (msg.embeds && msg.embeds.length > 0) {
      for (const embed of msg.embeds) {
        const embedImageUrl = embed.image?.url || embed.thumbnail?.url
        if (embedImageUrl && !embedImageUrl.includes('/role-icons/')) {
          return embedImageUrl
        }
      }
    }

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

  private async getSourceURL(ctx: CommandContext, urlArg?: string, attachmentUrl?: string): Promise<void> {
    let imageUrl = urlArg || attachmentUrl || ''

    if (!imageUrl && ctx.message) {
      imageUrl = this.getImageUrlFromMessage(ctx.message) || ''
    }

    if (!imageUrl && ctx.message && ctx.message.reference && ctx.message.reference.messageId) {
      try {
        const refMsg = await ctx.channel!.messages.fetch(ctx.message.reference.messageId)
        imageUrl = this.getImageUrlFromMessage(refMsg) || ''
      } catch (err: any) {
        console.warn('Failed to fetch referenced message:', err.message)
      }
    }

    if (!imageUrl && ctx.channel && ctx.channel.isTextBased()) {
      try {
        const beforeId = ctx.interaction ? undefined : ctx.message?.id
        const fetched = await ctx.channel.messages.fetch({ limit: 20, before: beforeId })
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
      ctx.reply('找不到可以搜尋的圖片，請提供圖片網址、附帶圖片或回覆一張圖片！')
      return
    }

    let statusMessage: any = null
    if (ctx.isInteraction) {
      await ctx.reply('🔍 正在搜尋圖片，請稍候...')
    } else {
      statusMessage = await ctx.reply('🔍 正在搜尋圖片，請稍候...')
    }

    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 })
      const uint8Array = new Uint8Array(response.data)

      let ext = imageUrl.split('.').pop()?.toLowerCase() || 'png'
      if (ext.includes('?')) {
        ext = ext.split('?')[0]
      }
      if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
        ext = 'png'
      }

      const contentType = response.headers['content-type']
      const mimeType = (typeof contentType === 'string' ? contentType : undefined) || `image/${ext}`

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

          if (ctx.isInteraction) {
            await ctx.editReply({ content: '搜尋完成！', embeds: [embed] })
          } else {
            await statusMessage.edit({ content: '搜尋完成！', embeds: [embed] })
          }
        } else {
          if (ctx.isInteraction) {
            await ctx.editReply({ content: finalSearchUrl })
          } else {
            await statusMessage.edit(finalSearchUrl)
          }
        }
      } else {
        throw new Error('Could not parse upload file name from Saucenao response')
      }
    } catch (err: any) {
      console.warn('Saucenao upload failed, falling back to direct URL search:', err.message)
      const fallbackUrl = `https://saucenao.com/search.php?db=999&url=${encodeURIComponent(imageUrl)}`
      if (ctx.isInteraction) {
        await ctx.editReply({ content: fallbackUrl })
      } else {
        await statusMessage.edit(fallbackUrl)
      }
    }
  }

  private parseSaucenaoHtml(html: string): SaucenaoResult[] {
    const results: SaucenaoResult[] = []
    const resultBlockRegex = /<table class="resulttable">([\s\S]*?)<\/table>/gi
    let blockMatch: RegExpExecArray | null

    while ((blockMatch = resultBlockRegex.exec(html)) !== null) {
      const tableHtml = blockMatch[1]

      const similarityMatch = tableHtml.match(/<div class="resultsimilarityinfo">([\d.]+)%<\/div>/i)
      const similarity = similarityMatch ? parseFloat(similarityMatch[1]) : 0

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

      const titleMatch = tableHtml.match(/<div class="resulttitle">([\s\S]*?)<\/div>/i)
      let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : undefined

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

  private async getHentaiURL(ctx: CommandContext, id: string): Promise<void> {
    if (!id) {
      const prefix = ctx.isInteraction ? '/' : '!'
      const cmd = ctx.isInteraction ? 'nhentai' : (ctx.message?.content.substring(1).split(' ')[0].toLowerCase() || 'nhentai')
      ctx.reply(`格式錯誤，正確格式為：${prefix}${cmd} [車號]`)
      return
    }
    if (!/^\d+$/.test(id)) {
      ctx.reply('格式錯誤，車號必須為數字')
      return
    }

    if (ctx.channel && 'nsfw' in ctx.channel && !ctx.channel.nsfw) {
      ctx.reply(`https://nhentai.net/g/${id}/`)
      return
    }

    let statusMessage: any = null
    if (ctx.isInteraction) {
      await ctx.reply('🔍 正在讀取本本資訊，請稍候...')
    } else {
      statusMessage = await ctx.reply('🔍 正在讀取本本資訊，請稍候...')
    }

    try {
      const metadata = await fetchNhentaiMetadata(id)
      if (metadata) {
        const embed = createEmbed(metadata)
        if (ctx.isInteraction) {
          await ctx.editReply({ content: '', embeds: [embed] })
        } else {
          if (statusMessage) {
            await statusMessage.edit({ content: '', embeds: [embed] })
          } else {
            await ctx.reply({ embeds: [embed] })
          }
        }
      } else {
        const fallbackEmbed = new EmbedBuilder()
          .setTitle(`nhentai 本子 - ${id}`)
          .setURL(`https://nhentai.net/g/${id}`)
          .setColor(0xed2553)
          .setDescription('⚠️ 無法自動獲取詳細資訊，請點擊標題連結前往閱讀。')
          .setTimestamp()

        if (ctx.isInteraction) {
          await ctx.editReply({ content: '', embeds: [fallbackEmbed] })
        } else {
          if (statusMessage) {
            await statusMessage.edit({ content: '', embeds: [fallbackEmbed] })
          } else {
            await ctx.reply({ embeds: [fallbackEmbed] })
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to send nhentai embed:', error.message || error)
      const fallbackUrl = `https://nhentai.net/g/${id}`
      if (ctx.isInteraction) {
        await ctx.editReply({ content: fallbackUrl })
      } else {
        if (statusMessage) {
          await statusMessage.edit(fallbackUrl)
        } else {
          await ctx.reply(fallbackUrl)
        }
      }
    }
  }

  private async getWnacgURL(ctx: CommandContext, id: string): Promise<void> {
    if (!id) {
      const prefix = ctx.isInteraction ? '/' : '!'
      ctx.reply(`格式錯誤，正確格式為：${prefix}wnacg [車號]`)
      return
    }
    if (ctx.channel && 'nsfw' in ctx.channel && !ctx.channel.nsfw) {
      ctx.reply('請至開車頻道使用此指令')
      return
    }
    if (!/^\d+$/.test(id)) {
      ctx.reply('格式錯誤，車號必須為數字')
      return
    }

    let statusMessage: any = null
    if (ctx.isInteraction) {
      await ctx.reply('🔍 正在讀取本本資訊，請稍候...')
    } else {
      statusMessage = await ctx.reply('🔍 正在讀取本本資訊，請稍候...')
    }

    try {
      const url = `https://www.wnacg.com/photos-index-aid-${id}.html`
      const metadata = await fetchWnacgMetadata(url)
      if (metadata) {
        const embed = createEmbed(metadata)
        if (ctx.isInteraction) {
          await ctx.editReply({ content: '', embeds: [embed] })
        } else {
          if (statusMessage) {
            await statusMessage.edit({ content: '', embeds: [embed] })
          } else {
            await ctx.reply({ embeds: [embed] })
          }
        }
      } else {
        if (ctx.isInteraction) {
          await ctx.editReply({ content: url })
        } else {
          if (statusMessage) {
            await statusMessage.edit(url)
          } else {
            await ctx.reply(url)
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to send wnacg embed:', error.message || error)
      const url = `https://www.wnacg.com/photos-index-aid-${id}.html`
      if (ctx.isInteraction) {
        await ctx.editReply({ content: url })
      } else {
        if (statusMessage) {
          await statusMessage.edit(url)
        } else {
          await ctx.reply(url)
        }
      }
    }
  }
}

export const runNsfwCommand = (message: Message): Promise<void> | void => {
  const content = message.content.substring(1)
  const commands = content.split(' ')
  const args = commands.slice(1)
  return new NsfwCommand().execute(message, args)
}

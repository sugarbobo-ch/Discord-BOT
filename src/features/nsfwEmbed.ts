import { Message, EmbedBuilder } from 'discord.js'
import axios from 'axios'

interface EmbedMetadata {
  title: string
  url: string
  coverUrl: string
  author: string
  category?: string
  tags: string[]
  siteName: string
  color: number
}

// 支援的網址正則表達式
const EHENTAI_REGEX = /https?:\/\/(?:e-hentai|exhentai)\.org\/g\/(\d+)\/([a-z0-9]+)\/?/i
const WACG_REGEX =
  /https?:\/\/(?:www\.)?wnacg\.(?:com|org|net)\/(?:photos-index-aid-|albums-index-id-|photos-slide-aid-|photos-view-id-)(\d+)(?:\.html)?/i
const COMIC18_REGEX =
  /https?:\/\/(?:www\.)?(?:18comic\.(?:vip|org|art|ink)|jmcomic\.(?:me|co)|jm-comic\d*\.(?:art|group))\/(?:album|photo)\/(\d+)\/?/i

/**
 * 取得 E-Hentai / ExHentai 的 Metadata
 */
const fetchEhentaiMetadata = async (url: string): Promise<EmbedMetadata | null> => {
  // 重置 regex index 以確保匹配正確
  const regex = new RegExp(EHENTAI_REGEX.source, 'i')
  const match = regex.exec(url)
  if (!match) return null

  const gid = parseInt(match[1])
  const token = match[2]
  const isEx = url.toLowerCase().includes('exhentai')

  try {
    const response = await axios.post(
      'https://api.e-hentai.org/api.php',
      {
        method: 'gdata',
        gidlist: [[gid, token]],
        namespace: 1
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    )

    const data = response.data
    if (data && data.gmetadata && data.gmetadata[0] && !data.gmetadata[0].error) {
      const meta = data.gmetadata[0]
      return {
        title: meta.title_jpn || meta.title,
        url: url,
        coverUrl: meta.thumb,
        author: meta.uploader,
        category: meta.category,
        tags: meta.tags || [],
        siteName: isEx ? 'ExHentai' : 'E-Hentai',
        color: isEx ? 0xf44336 : 0x4caf50
      }
    }
  } catch (error: any) {
    console.error(`[fetchEhentaiMetadata] Error fetching ${url}:`, error.message || error)
  }
  return null
}

/**
 * 取得 Wnacg 的 Metadata
 */
const fetchWnacgMetadata = async (url: string): Promise<EmbedMetadata | null> => {
  const regex = new RegExp(WACG_REGEX.source, 'i')
  const match = regex.exec(url)
  if (!match) return null

  const id = match[1]
  // 統一導向主作品頁面進行抓取
  const urlObj = new URL(url)
  const targetUrl = `${urlObj.protocol}//${urlObj.host}/photos-index-aid-${id}.html`

  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 10000
    })

    const html = res.data
    const titleMatch = html.match(/<h2>([^<]+)<\/h2>/i) || html.match(/<title>([^<]+)<\/title>/i)
    let title = titleMatch ? titleMatch[1].trim() : '紳士漫畫'
    title = title.replace(/\s*-\s*紳士漫畫.*$/, '').trim()

    const imgMatch = html.match(/<div class="asTBcell uwthumb">[^]*?<img[^>]+src="([^"]+)"/i)
    let coverUrl = imgMatch ? imgMatch[1] : ''
    if (coverUrl.startsWith('////')) {
      coverUrl = 'https://' + coverUrl.slice(4)
    } else if (coverUrl.startsWith('//')) {
      coverUrl = 'https://' + coverUrl.slice(2)
    } else if (coverUrl.startsWith('/')) {
      coverUrl = 'https://www.wnacg.com' + coverUrl
    }

    const uploaderMatch = html.match(/<div class="asTBcell uwuinfo">[^]*?<p>([^<]+)<\/p>/i)
    const uploader = uploaderMatch ? uploaderMatch[1].trim() : ''

    const artistMatch = title.match(/^\[([^\]]+)\]/)
    const artist = artistMatch ? artistMatch[1].trim() : ''

    const categoryMatch = html.match(/<label>分類：([^<]+)<\/label>/i)
    const category = categoryMatch ? categoryMatch[1].trim() : ''

    const tagRegex = /<a[^>]+class="tagshow"[^>]*>([^<]+)<\/a>/gi
    let tagMatch
    const tags: string[] = []
    while ((tagMatch = tagRegex.exec(html)) !== null) {
      tags.push(tagMatch[1].trim())
    }

    return {
      title,
      url,
      coverUrl,
      author: artist || uploader || '未知',
      category,
      tags,
      siteName: 'Wnacg 紳士漫畫',
      color: 0x2196f3
    }
  } catch (error: any) {
    console.error(`[fetchWnacgMetadata] Error fetching ${url}:`, error.message || error)
  }
  return null
}

/**
 * 取得 18Comic 的 Metadata
 */
const fetch18ComicMetadata = async (url: string): Promise<EmbedMetadata | null> => {
  const regex = new RegExp(COMIC18_REGEX.source, 'i')
  const match = regex.exec(url)
  if (!match) return null

  const id = match[1]
  const isPhoto = url.toLowerCase().includes('/photo/')

  const urlObj = new URL(url)
  const postedDomain = `${urlObj.protocol}//${urlObj.host}`

  // 嘗試的鏡像域名清單
  const domains = Array.from(
    new Set([
      postedDomain,
      'https://18comic.vip',
      'https://18comic.ink',
      'https://jmcomic.me',
      'https://18comic.org'
    ])
  )

  let html = ''
  let successUrl = ''

  for (const domain of domains) {
    try {
      const targetUrl = `${domain}/${isPhoto ? 'photo' : 'album'}/${id}`
      const res = await axios.get(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeout: 6000
      })

      if (res.status === 200 && !res.data.includes('Just a moment...')) {
        html = res.data
        successUrl = targetUrl
        break
      }
    } catch (err: any) {
      // 繼續嘗試下一個域名
    }
  }

  if (!html) {
    console.error(`[fetch18ComicMetadata] Failed to fetch ${url} on all domains.`)
    return null
  }

  try {
    const titleMatch =
      html.match(/<meta property="og:title" content="([^"]+)"/i) ||
      html.match(/<title>([^<]+)<\/title>/i)
    let title = titleMatch ? titleMatch[1].trim() : '禁漫天堂'
    title = title.replace(/\s*-\s*禁漫天堂.*$/, '').trim()

    const imgMatch =
      html.match(/<meta property="og:image" content="([^"]+)"/i) ||
      html.match(/<div class="thumb-overlay">[^]*?<img[^>]+src="([^"]+)"/i)
    let coverUrl = imgMatch ? imgMatch[1] : ''

    const authorMatch =
      html.match(/itemprop="author"[^>]*><a[^>]*>([^<]+)<\/a>/i) ||
      html.match(/作者：[^]*?<a[^>]*>([^<]+)<\/a>/i)
    const author = authorMatch ? authorMatch[1].trim() : ''

    const tagRegex = /<a[^>]+href="\/search\/photos\?search_query=[^"]+"[^>]*>([^<]+)<\/a>/gi
    let tagMatch
    const tags: string[] = []
    while ((tagMatch = tagRegex.exec(html)) !== null) {
      const t = tagMatch[1].trim()
      if (t && t !== '返回' && t !== '首頁') {
        tags.push(t)
      }
    }

    return {
      title,
      url,
      coverUrl,
      author: author || '未知',
      tags,
      siteName: '18Comic 禁漫天堂',
      color: 0xff9800
    }
  } catch (error: any) {
    console.error(`[fetch18ComicMetadata] Error parsing ${url}:`, error.message || error)
  }
  return null
}

/**
 * 建立 Discord Embed
 */
const createEmbed = (meta: EmbedMetadata): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setTitle(meta.title)
    .setURL(meta.url)
    .setColor(meta.color)
    .setAuthor({ name: meta.siteName })
    .setTimestamp()

  if (meta.coverUrl) {
    embed.setImage(meta.coverUrl)
  }

  if (meta.author) {
    embed.addFields({ name: '作者/漢化', value: meta.author, inline: true })
  }

  if (meta.category) {
    embed.addFields({ name: '分類', value: meta.category, inline: true })
  }

  if (meta.tags && meta.tags.length > 0) {
    // 如果是 E-Hentai，對標籤進行更細緻的分類顯示
    if (meta.siteName.includes('Hentai')) {
      const artistTags = meta.tags.filter(t => t.startsWith('artist:')).map(t => t.substring(7))
      const groupTags = meta.tags.filter(t => t.startsWith('group:')).map(t => t.substring(6))
      const femaleTags = meta.tags.filter(t => t.startsWith('female:')).map(t => t.substring(7))
      const maleTags = meta.tags.filter(t => t.startsWith('male:')).map(t => t.substring(5))
      const miscTags = meta.tags.filter(t => !t.includes(':'))

      if (artistTags.length > 0) {
        embed.addFields({ name: '畫師 (Artist)', value: artistTags.join(', '), inline: true })
      }
      if (groupTags.length > 0) {
        embed.addFields({ name: '社團 (Group)', value: groupTags.join(', '), inline: true })
      }
      if (maleTags.length > 0) {
        embed.addFields({ name: '男性屬性', value: maleTags.join(', '), inline: false })
      }
      if (femaleTags.length > 0) {
        embed.addFields({ name: '女性屬性', value: femaleTags.join(', '), inline: false })
      }
      if (miscTags.length > 0) {
        embed.addFields({
          name: '其他標籤',
          value: miscTags.slice(0, 15).join(', '),
          inline: false
        })
      }
    } else {
      // 一般標籤顯示，長度限制
      embed.addFields({ name: '標籤', value: meta.tags.slice(0, 20).join(', '), inline: false })
    }
  }

  return embed
}

/**
 * 主要檢查與加入預覽的函式
 */
export const checkAndAddNsfwEmbed = (message: Message, delayMs: number = 3000): void => {
  const content = message.content
  if (!content) return

  // 1. 檢查是否包含目標網址
  const hasEh = EHENTAI_REGEX.test(content)
  const hasWn = WACG_REGEX.test(content)
  const hasComic = COMIC18_REGEX.test(content)

  if (!hasEh && !hasWn && !hasComic) return

  // 2. 檢查是否為 NSFW 頻道
  const isNsfw =
    message.channel.isTextBased() && 'nsfw' in message.channel && (message.channel as any).nsfw
  if (!isNsfw) return

  // 延遲執行以等待 Discord 原生 embed 載入
  setTimeout(async () => {
    try {
      // 重新獲取最新訊息以確認 embed 狀態
      const fetchedMsg = await message.channel.messages.fetch(message.id)

      // 提取所有匹配的連結
      const urls: string[] = []
      let match

      // 重新掃描所有網址 (Regex 狀態重置)
      const ehRegex = new RegExp(EHENTAI_REGEX.source, 'gi')
      while ((match = ehRegex.exec(content)) !== null) {
        urls.push(match[0])
      }

      const wnRegex = new RegExp(WACG_REGEX.source, 'gi')
      while ((match = wnRegex.exec(content)) !== null) {
        urls.push(match[0])
      }

      const comicRegex = new RegExp(COMIC18_REGEX.source, 'gi')
      while ((match = comicRegex.exec(content)) !== null) {
        urls.push(match[0])
      }

      // 對於每個網址，若 Discord 沒有為其產生包含縮圖的 embed，則發送自訂預覽
      const processedIds = new Set<string>()

      for (const url of urls) {
        let id = ''
        let isEhUrl = false
        let isWnUrl = false
        let isComicUrl = false

        let matchArray = new RegExp(EHENTAI_REGEX.source, 'i').exec(url)
        if (matchArray) {
          id = matchArray[1]
          isEhUrl = true
        } else {
          matchArray = new RegExp(WACG_REGEX.source, 'i').exec(url)
          if (matchArray) {
            id = matchArray[1]
            isWnUrl = true
          } else {
            matchArray = new RegExp(COMIC18_REGEX.source, 'i').exec(url)
            if (matchArray) {
              id = matchArray[1]
              isComicUrl = true
            }
          }
        }

        if (!id) continue

        // 避免在同一個訊息中重複處理相同 ID 的作品
        if (processedIds.has(id)) {
          continue
        }
        processedIds.add(id)

        const hasEmbedWithThumb = fetchedMsg.embeds.some(
          emb => emb.thumbnail && emb.url && emb.url.includes(id)
        )
        if (hasEmbedWithThumb) {
          continue
        }

        let metadata: EmbedMetadata | null = null

        if (isEhUrl) {
          metadata = await fetchEhentaiMetadata(url)
        } else if (isWnUrl) {
          metadata = await fetchWnacgMetadata(url)
        } else if (isComicUrl) {
          metadata = await fetch18ComicMetadata(url)
        }

        if (metadata) {
          const embed = createEmbed(metadata)
          await (message.channel as any).send({ embeds: [embed] })
        }
      }
    } catch (error: any) {
      console.error('Error in checkAndAddNsfwEmbed:', error.message || error)
    }
  }, delayMs)
}

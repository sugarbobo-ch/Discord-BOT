import { Message, PermissionFlagsBits } from 'discord.js'
import { getForbiddenWords } from '../utils/db'

// Tracker for cross-channel suspicious posts
// userId -> { posts: { channelId: string; messageId: string }[], firstPostTime: number }
interface SuspiciousPost {
  channelId: string
  messageId: string
}

export const spamTracker = new Map<string, { posts: SuspiciousPost[]; firstPostTime: number }>()

/**
 * 檢查是否為可疑/釣魚網址
 */
export function isSuspiciousLink(content: string): boolean {
  const urlRegex = /https?:\/\/[^\s]+/gi
  const urls = content.match(urlRegex)
  if (!urls) return false

  const suspiciousKeywords = ['gift', 'nitro', 'claim', 'airdrop', 'free', 'steam', 'csgo', 'trade']
  const suspiciousTlds = ['.ru', '.xyz', '.club', '.gift', '.info', '.top', '.free', '.gq', '.cf', '.ml', '.ga']

  for (const urlStr of urls) {
    try {
      // Clean query parameters to avoid bypasses, then parse URL
      const cleanUrlStr = urlStr.split('?')[0]
      const url = new URL(cleanUrlStr.toLowerCase())
      const hostname = url.hostname

      // Skip official trusted domains
      const trustedDomains = [
        'discord.com',
        'discord.gg',
        'discord.media',
        'discordapp.com',
        'discordapp.net',
        'steampowered.com',
        'steamcommunity.com'
      ]
      if (trustedDomains.some(d => hostname === d || hostname.endsWith('.' + d))) {
        continue
      }

      // Check for typosquatting / lookalike domains
      if (hostname.includes('discord') || hostname.includes('steam') || hostname.includes('nitro')) {
        return true
      }

      // Check for suspicious TLDs or keywords in hostname or pathname
      const hasSuspiciousTld = suspiciousTlds.some(tld => hostname.endsWith(tld))
      const hasSuspiciousKeyword = suspiciousKeywords.some(keyword => hostname.includes(keyword) || url.pathname.includes(keyword))
      
      if (hasSuspiciousTld || hasSuspiciousKeyword) {
        return true
      }
    } catch {
      // Invalid URL syntax, fallback checks
      const lowerStr = urlStr.toLowerCase()
      if (lowerStr.includes('discord') || lowerStr.includes('steam') || lowerStr.includes('nitro') || lowerStr.includes('gift')) {
        return true
      }
    }
  }
  return false
}

/**
 * 核心 AutoMod 掃描常式
 * @returns 回傳 true 代表該訊息已觸發 AutoMod 處置，調用端應終止後續處理
 */
export async function handleAutoMod(message: Message): Promise<boolean> {
  if (!message.guild) return false
  const serverId = message.guild.id

  // 1. 禁用詞語檢查
  const forbiddenWords = getForbiddenWords(serverId)
  const matchedWord = forbiddenWords.find(word => message.content.includes(word))

  if (matchedWord) {
    const member = message.member
    // 管理員與擁有管理伺服器權限者豁免
    if (member && !member.permissions.has(PermissionFlagsBits.Administrator) && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      try {
        if (member.moderatable) {
          // 禁言 60 秒
          await member.timeout(60 * 1000, `AutoMod: 使用禁用詞語 "${matchedWord}"`)
          const warning = await message.reply(`❌ 偵測到禁用詞語，您已被禁言 60 秒。`)
          setTimeout(() => warning.delete().catch(() => {}), 3000)
        }
        if (message.deletable) {
          await message.delete().catch(() => {})
        }
        return true
      } catch (err) {
        console.error('Failed to moderate member for forbidden word:', err)
      }
    }
  }

  // 2. @everyone / @here + 釣魚連結 + 跨頻道發送檢查
  const mentionsEveryone = message.mentions.everyone || message.content.includes('@everyone') || message.content.includes('@here')
  if (mentionsEveryone && isSuspiciousLink(message.content)) {
    const member = message.member
    // 管理員與擁有管理伺服器權限者豁免
    if (member && !member.permissions.has(PermissionFlagsBits.Administrator) && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      const userId = message.author.id
      const channelId = message.channel.id
      const now = Date.now()

      let record = spamTracker.get(userId)
      if (!record || (now - record.firstPostTime > 60000)) {
        record = { posts: [{ channelId, messageId: message.id }], firstPostTime: now }
        spamTracker.set(userId, record)
      } else {
        record.posts.push({ channelId, messageId: message.id })
      }

      const distinctChannels = new Set(record.posts.map(p => p.channelId))
      if (distinctChannels.size >= 2) {
        try {
          if (member.bannable) {
            // 封鎖用戶
            await member.ban({ reason: 'AutoMod: 短時間內跨頻道發送 @everyone 釣魚連結' })
            await message.channel.send(`🚨 用戶 ${message.author.tag} 因短時間內跨頻道發送 @everyone 釣魚連結，已被系統封鎖 (Ban)。`)

            // 刪除所有記錄到的該用戶的垃圾釣魚訊息
            for (const post of record.posts) {
              try {
                const chan = await message.client.channels.fetch(post.channelId)
                if (chan && 'messages' in chan) {
                  const msg = await (chan as any).messages.fetch(post.messageId)
                  if (msg && msg.deletable) {
                    await msg.delete().catch(() => {})
                  }
                }
              } catch (fetchMsgErr) {
                // 忽略單一訊息的獲取或刪除失敗
              }
            }
            spamTracker.delete(userId)
            return true
          }
        } catch (banErr) {
          console.error('Failed to ban phishing spammer:', banErr)
        }
      } else {
        // 還未跨多個頻道，但先刪除該可疑訊息防患未然
        if (message.deletable) {
          await message.delete().catch(() => {})
        }
        return true
      }
    }
  }

  return false
}

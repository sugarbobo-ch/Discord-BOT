import { Message } from 'discord.js'

/**
 * 統一正規化訊息內容，將全形驚嘆號與全形空白轉換為半形
 */
export const normalizeMessageContent = (content: string): string => {
  if (!content) return content
  const firstChar = content.charAt(0)
  if (firstChar === '！' || firstChar === '!' || firstChar === '/') {
    let normalized = content
    if (firstChar === '！') {
      normalized = '!' + normalized.substring(1)
    }
    return normalized.replace(/　/g, ' ')
  }
  return content
}

export const checkPrefix = (message: Message): boolean => {
  const firstChar = message.content.charAt(0)
  return (
    (firstChar === '!' || firstChar === '！' || firstChar === '/') && message.content.length !== 1
  )
}

export const checkMentions = (message: Message | string): boolean => {
  const text = typeof message === 'string' ? message : message.content
  if (typeof text !== 'string') return false
  return /<@([^<>]{1,})>/g.test(text)
}

export const checkEmoji = (message: Message | string): boolean => {
  const text = typeof message === 'string' ? message : message.content
  if (typeof text !== 'string') return false
  return text.charAt(0) === '<' && text.charAt(1) === ':' && text.length !== 1
}

export const getCommandName = (message: Message | string): string => {
  if (checkEmoji(message)) {
    return typeof message === 'string' ? message : message.content
  }
  if (checkMentions(message)) {
    const text = typeof message === 'string' ? message : message.content
    if (typeof text === 'string' && text.charAt(0) === '<') {
      return typeof message === 'string' ? message : message.content
    }
  }
  const content = typeof message === 'string' ? message : message.content.substring(1)
  const commands = content.split(' ')
  return commands[0].toLowerCase()
}

import { Message } from 'discord.js'

export const checkPrefix = (message: Message): boolean => {
  console.log(
    message.content,
    (message.content.charAt(0) === '!' || message.content.charAt(0) === '！') &&
      message.content.length !== 1
  )
  return (
    (message.content.charAt(0) === '!' || message.content.charAt(0) === '！') &&
    message.content.length !== 1
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

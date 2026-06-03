import { Message } from 'discord.js'
import { runNsfwCommand } from '../commands/nsfw'

export const getPixivURL = (message: Message): void => {
  if (message.content.substring(1).split(' ')[0].toLowerCase() === 'pixiv') {
    runNsfwCommand(message)
  }
}

export const getSourceURL = (message: Message): Promise<void> | void => {
  if (message.content.substring(1).split(' ')[0].toLowerCase() === '搜圖') {
    return runNsfwCommand(message)
  }
}

export const getHentaiURL = (message: Message): void => {
  const cmd = message.content.substring(1).split(' ')[0].toLowerCase()
  if (cmd === '神的語言' || cmd === 'nhentai' || cmd === 'god') {
    runNsfwCommand(message)
  }
}

export const getWnacgURL = (message: Message): void => {
  if (message.content.substring(1).split(' ')[0].toLowerCase() === 'wnacg') {
    runNsfwCommand(message)
  }
}

export const isHashPrefix = (message: Message): boolean => {
  return message.content.charAt(0) === '#'
}

export const sendHentaiURL = (message: Message): void => {
  if (message.content.length === 7) {
    const content = message.content.substring(1)
    const reg = /^\d+$/
    if (reg.test(content)) {
      message.content = `!god ${content}`
      getHentaiURL(message)
    }
  }
}

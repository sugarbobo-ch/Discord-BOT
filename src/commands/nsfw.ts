import { Message } from 'discord.js'
import { Command } from './command.interface'

export class NsfwCommand implements Command {
  public names = ['pixiv', '搜圖', '神的語言', 'nhentai', 'god', 'wnacg']

  public execute(message: Message, args: string[]): void {
    const cmd = message.content.substring(1).split(' ')[0].toLowerCase()
    switch (cmd) {
      case 'pixiv':
        this.getPixivURL(message, args)
        break
      case '搜圖':
        this.getSourceURL(message, args)
        break
      case '神的語言':
      case 'nhentai':
      case 'god':
        this.getHentaiURL(message, args)
        break
      case 'wnacg':
        this.getWnacgURL(message, args)
        break
    }
  }

  private getPixivURL(message: Message, args: string[]): void {
    if (args.length === 1) {
      (message.channel as any).send(`https://www.pixiv.net/artworks/${args[0]}`)
    }
  }

  private getSourceURL(message: Message, args: string[]): void {
    if (args.length === 1) {
      (message.channel as any).send(`https://saucenao.com/search.php?db=999&url=${args[0]}`)
    }
  }

  private getHentaiURL(message: Message, args: string[]): void {
    if (args.length === 1) {
      (message.channel as any).send(`https://nhentai.net/g/${args[0]}`)
    }
  }

  private getWnacgURL(message: Message, args: string[]): void {
    if (args.length === 1) {
      if (message.channel.isTextBased() && 'nsfw' in message.channel && !message.channel.nsfw) {
        (message.channel as any).send('請至開車頻道使用此指令')
        return
      }
      (message.channel as any).send(`https://www.wnacg.com/photos-index-aid-${args[0]}.html`)
    }
  }
}

export const runNsfwCommand = (message: Message): void => {
  const content = message.content.substring(1)
  const commands = content.split(' ')
  const args = commands.slice(1)
  new NsfwCommand().execute(message, args)
}

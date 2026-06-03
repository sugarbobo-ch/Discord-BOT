import { Message } from 'discord.js'
import { Command } from './command.interface'
import * as messageCtrl from '../features/message'

export class CustomCommand implements Command {
  public names = [
    'custom',
    'add',
    'remove',
    'edit',
    'list',
    'help',
    'addimg',
    'delimg',
    'send',
    'reset',
    '大全'
  ]

  public async execute(message: Message, args: string[]): Promise<void> {
    const cmd = args[0]?.toLowerCase()

    const keywords = [
      'add',
      'remove',
      'edit',
      'list',
      'help',
      'addimg',
      'delimg',
      'send',
      'reset',
      '大全'
    ]

    if (keywords.includes(cmd)) {
      await messageCtrl.editCommand(message, cmd)
    } else {
      messageCtrl.checkCommand(message, cmd)
      await messageCtrl.getImageCommand(message, cmd)
      await messageCtrl.getMediaCommand(message, cmd)
    }
  }
}

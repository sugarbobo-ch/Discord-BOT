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
    'addimg',
    'delimg',
    'send',
    'reset',
    '大全'
  ]

  public async execute(message: Message, args: string[]): Promise<void> {
    const commandName = messageCtrl.getCommandName(message)
    const isCustomKeyword =
      commandName === 'custom' && args[0] && this.names.includes(args[0].toLowerCase())
    const action = isCustomKeyword ? args[0].toLowerCase() : commandName

    const keywords = this.names.filter(name => name !== 'custom')

    if (keywords.includes(action)) {
      await messageCtrl.editCommand(message, action)
    } else {
      const customCmdName = commandName === 'custom' ? args[0]?.toLowerCase() : action
      if (customCmdName) {
        messageCtrl.checkCommand(message, customCmdName)
        await messageCtrl.getImageCommand(message, customCmdName)
        await messageCtrl.getMediaCommand(message, customCmdName)
      }
    }
  }
}

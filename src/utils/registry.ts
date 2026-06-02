import { Message } from 'discord.js'
import { Command } from '../commands/command.interface'
import { getCommandName } from './command'

export class CommandRegistry {
  private commands = new Map<string, Command>()

  public register(command: Command): void {
    command.names.forEach(name => {
      this.commands.set(name.toLowerCase(), command)
    })
  }

  public get(name: string): Command | undefined {
    return this.commands.get(name.toLowerCase())
  }

  public async execute(message: Message): Promise<void> {
    const commandName = getCommandName(message)
    const command = this.commands.get(commandName)

    const content = message.content.substring(1)
    const args = content.split(' ').slice(1)

    if (command) {
      await command.execute(message, args)
    } else {
      const customCommand = this.commands.get('custom')
      if (customCommand) {
        await customCommand.execute(message, [commandName, ...args])
      }
    }
  }
}

export const commandRegistry = new CommandRegistry()

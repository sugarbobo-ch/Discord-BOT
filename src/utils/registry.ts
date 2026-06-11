import { 
  Message, 
  ChatInputCommandInteraction, 
  ButtonInteraction, 
  ApplicationCommandDataResolvable,
  MessageFlags
} from 'discord.js'
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

  public getSlashCommandsData(): ApplicationCommandDataResolvable[] {
    const data: ApplicationCommandDataResolvable[] = []
    const seenNames = new Set<string>()
    for (const command of this.commands.values()) {
      if (command.slashData) {
        const list = Array.isArray(command.slashData) ? command.slashData : [command.slashData]
        for (const item of list) {
          const name = (item as any).name
          if (name && !seenNames.has(name)) {
            seenNames.add(name)
            data.push(item)
          }
        }
      }
    }
    return data
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

  public async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const commandName = interaction.commandName.toLowerCase()
    const command = this.commands.get(commandName)
    if (command && command.executeSlash) {
      await command.executeSlash(interaction)
    } else {
      await interaction.reply({ content: '❌ 未支援的斜線指令', flags: MessageFlags.Ephemeral })
    }
  }

  public async executeButton(interaction: ButtonInteraction): Promise<void> {
    for (const command of this.commands.values()) {
      if (command.executeButton && command.buttonIds?.includes(interaction.customId)) {
        await command.executeButton(interaction)
        return
      }
    }
  }
}

export const commandRegistry = new CommandRegistry()


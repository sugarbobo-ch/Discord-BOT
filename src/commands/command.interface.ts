import { 
  Message, 
  ChatInputCommandInteraction, 
  ButtonInteraction, 
  ApplicationCommandDataResolvable 
} from 'discord.js'

export interface Command {
  names: string[]
  execute(message: Message, args: string[]): Promise<void> | void
  slashData?: ApplicationCommandDataResolvable | ApplicationCommandDataResolvable[]
  executeSlash?(interaction: ChatInputCommandInteraction): Promise<void> | void
  buttonIds?: string[]
  executeButton?(interaction: ButtonInteraction): Promise<void> | void
}


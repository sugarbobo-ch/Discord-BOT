import { Message } from 'discord.js'

export interface Command {
  names: string[]
  execute(message: Message, args: string[]): Promise<void> | void
}

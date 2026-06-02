import { Message } from 'discord.js'
import { runRollCallCommand } from '../commands/rollcall'

export const getRollCallCommand = (message: Message): void => {
  runRollCallCommand(message)
}

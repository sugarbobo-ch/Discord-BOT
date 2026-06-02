import { Message } from 'discord.js'
import { runLotteryCommand } from '../commands/lottery'

export function processLotteryCommands(message: Message): void {
  runLotteryCommand(message)
}

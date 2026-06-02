import { Message } from 'discord.js'
import { userKeep } from '../commands/user'
import { getCommandName } from '../utils/command'

export const keep = (message: Message): void => {
  if (getCommandName(message) === 'keep') {
    userKeep(message)
  }
}

export const getKeepsList = (message: Message): void => {
  if (getCommandName(message) === 'keeplist') {
    userKeep(message)
  }
}

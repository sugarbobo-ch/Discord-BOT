import { Message } from 'discord.js'

interface MessageRecord {
  text: string
  createdAt: Date
}

const serverMessagesDict: Record<string, Record<string, MessageRecord[]>> = {}

const getRepeatedMessageArray = (messageQueue: MessageRecord[], text: string): MessageRecord[] => {
  return messageQueue.filter(v => v.text === text)
}

export const sendRepeatedMessage = (message: Message): void => {
  if (!message.guild) return
  const serverId = message.guild.id
  const channelId = message.channel.id
  const text = message.content
  if (text.length === 0) {
    return
  }

  if (!serverMessagesDict[serverId]) {
    serverMessagesDict[serverId] = {}
  }
  if (!serverMessagesDict[serverId][channelId]) {
    serverMessagesDict[serverId][channelId] = []
  }

  const messageQueue = serverMessagesDict[serverId][channelId]
  if (messageQueue.length >= 30) {
    messageQueue.shift()
  }
  messageQueue.push({ text, createdAt: message.createdAt })

  const repeatedMessageArray = getRepeatedMessageArray(messageQueue, text)
  if (repeatedMessageArray.length >= 5) {
    const timeDiff =
      repeatedMessageArray[repeatedMessageArray.length - 1].createdAt.getTime() -
      repeatedMessageArray[0].createdAt.getTime()
    if (timeDiff > 600000) {
      const index = messageQueue.findIndex(o => o.text === text)
      if (index > -1) {
        messageQueue.splice(index, 1)
      }
      return
    }
    (message.channel as any).send(text)
    serverMessagesDict[serverId][channelId] = messageQueue.filter(v => v.text !== text)
  }
}

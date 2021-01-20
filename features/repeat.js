const serverMessagesDict = {}

const getRepeatedMessageArray = (messageQueue, text) => {
  return messageQueue.filter((v) => (v.text === text))
}

module.exports = {
  sendRepeatedMessage (message) {
    const serverId = message.guild.id
    const channelId = message.channel
    const text = message.content
    if (text.length === 0) { return }
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
      if (repeatedMessageArray[repeatedMessageArray.length - 1].createdAt -
        repeatedMessageArray[0].createdAt > 600000) {
        messageQueue.find((o, i) => {
          if (o.text === text) {
            messageQueue.splice(i, 1)
            return true
          }
          return false
        })
        return
      }
      message.channel.send(text)
      serverMessagesDict[serverId][channelId] = messageQueue.filter((v) => (v.text !== text))
    }
  }

}

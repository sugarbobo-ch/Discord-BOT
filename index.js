const { Client } = require('discord.js')
const auth = require('./auth.json')
const messageCtrl = require('./features/message.js')
const nsfwCtrl = require('./features/nsfw.js')
const clientManager = require('./utils/client.js')
const client = new Client()

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
  clientManager.setClient(client)
  messageCtrl.readCommandDict()
})

client.login(auth.token)

client.on('message', message => {
  const messageAttachment = message.attachments.values().next().value
  if (messageAttachment !== undefined) {
    console.log(`[${message.channel.name}] ${message.author.username}: ${message.content + '\n' + messageAttachment.url}`)
  } else {
    console.log(`[${message.channel.name}] ${message.author.username}: ${message.content}`)
  }
  var result = messageCtrl.checkPrefix(message)
  if (!result) {
    result = messageCtrl.checkMention(message)
    if (!result) { return }
  }
  if (messageCtrl.isNormalCommand(message)) {
    messageCtrl.checkCommand(message)
    messageCtrl.getImageCommand(message)
    messageCtrl.getMediaCommand(message)
    nsfwCtrl.getPixivURL(message)
    nsfwCtrl.getHentaiURL(message)
    nsfwCtrl.getWnacgURL(message)
  } else {
    messageCtrl.editCommand(message)
  }
})

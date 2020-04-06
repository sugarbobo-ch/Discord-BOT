const { Client } = require('discord.js')
const auth = require('./config/auth.json')
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
  if (message.channel.id !== auth.backupChannelId) {
    var log = ''
    if (messageAttachment !== undefined) {
      log = `[${message.createdAt}] ${message.guild.name}: ${message.channel.name} - ${message.author.username}: ${message.content + '\n' + messageAttachment.url}`
    } else {
      log = `[${message.createdAt}] ${message.guild.name}: ${message.channel.name} - ${message.author.username}: ${message.content}`
    }
    console.log(log)
    clientManager.client.channels.get(auth.backupChannelId).send(log)
  }
  if (message.author.bot || message.author.id === client.user.id) { return }

  var result = messageCtrl.checkPrefix(message)
  if (!result) {
    result = messageCtrl.checkMention(message)
    if (!result) { return }
  }
  const command = messageCtrl.isNormalCommand(message)
  if (command.isNormalCommand) {
    messageCtrl.checkCommand(message, command.name)
    messageCtrl.getImageCommand(message, command.name)
    messageCtrl.getMediaCommand(message, command.name)
    nsfwCtrl.getSourceURL(message)
    nsfwCtrl.getPixivURL(message)
    nsfwCtrl.getHentaiURL(message)
    nsfwCtrl.getWnacgURL(message)
  } else {
    messageCtrl.editCommand(message, command.name)
  }
})

client.on('error', console.error)

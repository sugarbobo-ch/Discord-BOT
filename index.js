const { Client } = require('discord.js')
const auth = require('./config/auth.json')
const messageCtrl = require('./features/message.js')
const nsfwCtrl = require('./features/nsfw.js')
const userCtrl = require('./features/user.js')
const repeatCtrl = require('./features/repeat.js')
const rollCallCtrl = require('./features/rollCall.js')
const lotteryCtrl = require('./features/lottery.js')
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
    let log = ''
    if (messageAttachment !== undefined) {
      log = `[${message.createdAt}] ${message.guild !== null ? message.guild.name : '無名稱'}: ${message.channel.name} - ${message.author.username}: ${message.content + '\n' + messageAttachment.url}`
    } else {
      log = `[${message.createdAt}] ${message.guild !== null ? message.guild.name : '無名稱'}: ${message.channel.name} - ${message.author.username}: ${message.content}`
    }
    console.log(log)
    if (messageCtrl.checkMentions(message)) {
      const mentionRegExp = /<@([^<>]{1,})>/g
      while (mentionRegExp.test(log)) {
        log = log.replace(mentionRegExp, 'mention')
      }
    }
    if (message.guild && message.guild.id === '683378066730647643') { clientManager.client.channels.get(auth.backupChannelId).send(log) }
  }
  if (message.author.bot || message.author.id === client.user.id) { return }

  var result = messageCtrl.checkPrefix(message)
  if (!result) {
    result = messageCtrl.checkMentions(message) || messageCtrl.checkEmoji(message)
    repeatCtrl.sendRepeatedMessage(message)

    if (nsfwCtrl.isHashPrefix(message)) {
      nsfwCtrl.sendHentaiURL(message)
    }

    if (message.content.includes('因該')) {
      message.channel.send('抓到了! 是錯字! "應"該吶!')
      /*
      if (Date.now() % 2 === 0) {
        message.reply('抓到了! 是錯字! "應"該吶!')
      } else {
        message.reply(`你是我自上次重啟第${count}個智障把「應」打成「因」的，打對字對您來說可能比確診還難。`)
      }
      */
    }
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
    nsfwCtrl.detectNsfwImage(message)
    userCtrl.keep(message)
    userCtrl.getKeepsList(message)
    rollCallCtrl.getRollCallCommand(message)
    lotteryCtrl.processLotteryCommands(message)
  } else {
    messageCtrl.editCommand(message, command.name)
  }
})

client.on('error', console.error)

const { Client } = require('discord.js')
const auth = require('./auth.json')
const messageCtrl = require('./features/message.js')
const client = new Client()

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
  messageCtrl.readCommandDict()
})

client.login(auth.token)

client.on('message', (message) => {
  const result = messageCtrl.checkPrefix(message)
  if (!result) return
  if (messageCtrl.isNormalCommand(message)) {
    messageCtrl.checkCommand(message)
    messageCtrl.getImageCommand(message)
  } else {
    messageCtrl.editCommand(message)
  }
})

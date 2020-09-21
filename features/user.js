const { RichEmbed } = require('discord.js')

const getCommandName = message => {
  const content = message.content.substr(1)
  const commands = content.split(' ')
  return commands[0].toLowerCase()
}

var keepDict = []

module.exports = {
  keep: (message) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    if (commands.length === 2) {
      if (getCommandName(message) === 'keep') {
        if (keepDict[message.author.id] === undefined) {
          keepDict[message.author.id] = [commands[1]]
        } else {
          keepDict[message.author.id].unshift(commands[1])
          if (keepDict[message.author.id].length > 10) {
            keepDict[message.author.id].pop()
          }
        }
        message.reply('已儲存，注意可撥BOT重啟後會自動清除')
      }
    }
  },
  getKeepsList: (message) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    if (commands.length === 1) {
      if (getCommandName(message) === 'keeplist') {
        if (keepDict[message.author.id] === undefined) {
          keepDict[message.author.id] = []
          message.channel.send('尚未儲存任何訊息')
        }
        const embed = new RichEmbed()
          .setTitle('Keep 列表')
          .setDescription(`以下是 ${message.author.username} 目前儲存的訊息 (最多10筆，超過後從最舊開始刪除)：`)
        for (var i in keepDict[message.author.id]) {
          embed.addField((parseInt(i) + 1) + '.', keepDict[message.author.id][i])
        }
        message.channel.send(embed)
      }
    }
  }
}

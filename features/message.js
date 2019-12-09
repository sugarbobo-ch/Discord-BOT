const { Attachment, RichEmbed } = require('discord.js')
const path = require('../config/path.json')
const fileManager = require('../utils/file.js')
const keywords = ['add', 'remove', 'edit', 'list', 'help', 'addimg']
var responseDict = []

const saveCommandFile = () => {
  fileManager.writeFileSync(path.messagesCommandPath, responseDict)
}

module.exports = {
  readCommandDict: () => {
    responseDict = fileManager.readFileSync(path.messagesCommandPath)
  },
  checkPrefix: message => {
    return (
      (message.content.charAt(0) === '!' ||
        message.content.charAt(0) === '！') &&
      message.content.length !== 1
    )
  },
  checkMention: message => {
    console.log(message.content)
    return (
      (message.content.charAt(0) === '<' &&
        message.content.charAt(1) === '@' &&
        message.content.charAt(2) === '!') &&
      message.content.length !== 1
    )
  },
  getCommandName: message => {
    if (module.exports.checkMention(message)) { return message }
    const content = message.content.substr(1)
    const commands = content.split(' ')
    return commands[0].toLowerCase()
  },
  isNormalCommand: message => {
    return !keywords.includes(module.exports.getCommandName(message))
  },
  editCommand: message => {
    const content = message.content.substr(1)
    var commands = content.split(' ')
    if (commands.length >= 3) {
      if (
        module.exports.getCommandName(message) === 'add' ||
        module.exports.getCommandName(message) === 'edit'
      ) {
        var command = commands[1].toLowerCase()
        // remove add/edit
        commands.shift()
        // remove command
        commands.shift()
        if (command in responseDict) {
          message.reply(`${command} 指令已經更新`)
        } else {
          responseDict[command] = commands[2]
          message.reply(`${command} 指令已經加到列表中`)
        }
        var str = ''
        for (var i in commands) {
          if (i !== 0) { str += ' ' }
          str += commands[i]
        }
        responseDict[command] = str
        saveCommandFile()
      } else if (module.exports.getCommandName(message) === 'addimg') {
        module.exports.addImageCommand(message)
      }
    } else if (commands.length === 2) {
      if (module.exports.getCommandName(message) === 'remove') {
        const command = commands[1].toLowerCase()
        if (command in responseDict) {
          delete responseDict[command]
          message.reply(`${command} 指令已經刪除`)
          saveCommandFile()
        } else {
          message.reply(`${command} 指令未在清單內`)
        }
      }
    } else if (commands.length === 1) {
      if (
        module.exports.getCommandName(message) === 'list' ||
        module.exports.getCommandName(message) === 'help'
      ) {
        module.exports.displayAvailableCommands(message)
      }
    }
  },
  checkCommand: message => {
    if (responseDict === undefined || responseDict === null) {
      module.exports.readCommandDict()
    }
    const command = module.exports.getCommandName(message)
    if (command in keywords) {
      return
    }
    if (command in responseDict) {
      if (responseDict[command] === '隨機圖片') {
        return
      }
      message.channel.send(responseDict[command])
    }
  },
  displayAvailableCommands: message => {
    const embed = new RichEmbed()
      .setTitle('指令列表')
      .setDescription('以下是可以使用的指令 (記得加空白，BOT沒反應代表格式錯誤或是BOT掛了)：')
    embed.addField('!add 指令名稱 BOT回覆內容', '新增指令')
    embed.addField(
      '!add 指令名稱 隨機圖片',
      '新增特定指令的隨機圖片，先新增"!add 指令名稱 隨機圖片"指令後，再用 "!addimg 指令 圖片網址" 來增加圖片，圖片網址結尾必須是圖片檔，不要有?width=1202&height=677之類的訊息'
    )
    embed.addField('!edit 指令名稱 BOT回覆內容', '編輯指令')
    embed.addField('!remove 指令名稱', '移除指令')
    embed.addField('!addimg 指令名稱 網址', '新增特定指令的隨機圖片，先新增"!add 指令名稱 隨機圖片"指令後，再用 "!addimg 指令 圖片網址" 來增加圖片，圖片網址結尾必須是圖片檔，不要有?width=1202&height=677之類的訊息')
    embed.addField(
      '!god 神的語言',
      '!nhentai, !神的語言 都可以開車，但會偵測是否是老司機頻道'
    )
    embed.addField('!pixiv', '請給我色圖')
    var keyString = ''
    for (var key in responseDict) {
      keyString += key + ' '
    }
    embed.addField('一般指令：', keyString)
    message.channel.send(embed)
  },
  addImageCommand: message => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    fileManager.downloadFile(
      commands[2],
      commands[1],
      result => {
        message.reply('圖片新增成功')
      }
    )
  },
  getImageCommand: message => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    if (module.exports.getCommandName(message) in responseDict) {
      const folderName = commands[0].toLowerCase()
      if (responseDict[folderName] === '隨機圖片') {
        const dir = 'assets/images/' + folderName + '/'
        if (fileManager.checkFileDirectoryIsExist(dir)) {
          const file = fileManager.getRandomFile(folderName)
          if (file === null) {
            message.reply('發生錯誤，請確定該指令是設定在隨機圖片且有加入圖片')
            return
          }
          const attachment = new Attachment(file)
          // Send the attachment in the message channel with a content
          message.channel.send(attachment)
        }
      }
    }
  }
}

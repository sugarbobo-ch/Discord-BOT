const {
  Attachment,
  RichEmbed
} = require('discord.js')
const path = require('../config/path.json')
const fileManager = require('../utils/file.js')
const keywords = ['add', 'remove', 'edit', 'list', 'help', 'addimg']
var responseDict = []

const getCommandName = (message) => {
  const content = message.content.substr(1)
  const commands = content.split(' ')
  return commands[0].toLowerCase()
}

const saveCommandFile = () => {
  fileManager.writeFileSync(path.messagesCommandPath, responseDict)
}

module.exports = {
  readCommandDict: () => {
    responseDict = fileManager.readFileSync(path.messagesCommandPath)
  },
  checkPrefix: (message) => {
    return (message.content.charAt(0) === '!' || message.content.charAt(0) === '！')
  },
  isNormalCommand: (message) => {
    return !keywords.includes(getCommandName(message))
  },
  editCommand: (message) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    if (commands.length === 3) {
      if (getCommandName(message) === 'add' || getCommandName(message) === 'edit') {
        if (commands[1] in responseDict) {
          message.reply(`${commands[1]} 指令已經更新`)
        } else {
          responseDict[commands[1]] = commands[2]
          message.reply(`${commands[1]} 指令已經加到列表中`)
        }
        responseDict[commands[1]] = commands[2]
        saveCommandFile()
      } else if (getCommandName(message) === 'addimg') {
        module.exports.addImageCommand(message)
      }
    } else if (commands.length === 2) {
      if (getCommandName(message) === 'remove') {
        if (commands[1] in responseDict) {
          delete responseDict[commands[1]]
          message.reply(`${commands[1]} 指令已經刪除`)
          saveCommandFile()
        } else {
          message.reply(`${commands[1]} 指令未在清單內`)
        }
      }
    } else if (commands.length === 1) {
      if (getCommandName(message) === 'list' || getCommandName(message) === 'help') {
        module.exports.displayAvailableCommands(message)
      }
    }
  },
  checkCommand: (message) => {
    if (responseDict === undefined || responseDict === null) {
      module.exports.readCommandDict()
    }
    const command = getCommandName(message)
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
  displayAvailableCommands: (message) => {
    const embed = new RichEmbed()
      .setTitle('指令列表')
      .setDescription('以下是可以使用的指令：')
    embed.addField('!add [指令名稱] [BOT回覆內容]', '新增指令')
    embed.addField('!add [資料夾] "隨機圖片"', '新增特定指令的隨機圖片，一定要先新增資料夾才可以加圖片，之後再用 !addimg [資料夾] [網址] 來增加圖片')
    embed.addField('!edit [指令名稱] [BOT回覆內容]', '編輯指令')
    embed.addField('!remove [指令名稱]', '移除指令')
    embed.addField('!addimg [資料夾] [網址]', '在特定的資料夾下新增圖片')
    for (var key in responseDict) {
      embed.addField('!' + key, responseDict[key])
    }

    message.channel.send(embed)
  },
  addImageCommand: (message) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    fileManager.downloadFile(commands[2], 'assets/images/' + commands[1] + '/',
      (result) => {
        message.reply('圖片新增成功')
      })
  },
  getImageCommand: (message) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    if (getCommandName(message) in responseDict) {
      const folderName = commands[0].toLowerCase()
      if (responseDict[folderName] === '隨機圖片') {
        const dir = 'assets/images/' + folderName + '/'
        if (fileManager.checkFileDirectoryIsExist(dir)) {
          const file = fileManager.getRandomFile(dir)
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

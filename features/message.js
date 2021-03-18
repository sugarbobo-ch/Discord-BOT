const { Attachment, RichEmbed } = require('discord.js')
const path = require('../config/path.json')
const auth = require('../config/auth.json')
const fileManager = require('../utils/file.js')
const clientManager = require('../utils/client.js')
const keywords = ['add', 'remove', 'edit', 'list', 'help', 'addimg', 'delimg', 'send', 'reset']

var responseDict = []
var serversList = []

const saveCommandFile = (server) => {
  fileManager.writeFileSync('./config/servers/' + server + '.json', responseDict[server])
}

const saveServersListFile = () => {
  fileManager.writeFileSync(path.serversListPath, serversList)
}

module.exports = {
  readCommandDict: () => {
    serversList = fileManager.readFileSync(path.serversListPath)
    serversList.forEach(server => {
      responseDict[server] = fileManager.readFileSync(`./config/servers/${server}.json`)
    })
    console.log(serversList)
  },
  checkPrefix: message => {
    return (
      (message.content.charAt(0) === '!' ||
        message.content.charAt(0) === '！') &&
      message.content.length !== 1
    )
  },
  checkMentions: message => {
    const text = message.content === undefined ? message : message.content
    if (typeof (text) !== 'string') return false
    return /<@([^<>]{1,})>/g.test(text)
  },
  checkEmoji: message => {
    const text = message.content === undefined ? message : message.content
    if (typeof (text) !== 'string') return false
    return (
      text.charAt(0) === '<' &&
      text.charAt(1) === ':' &&
      text.length !== 1
    )
  },
  getCommandName: message => {
    if (module.exports.checkEmoji(message)) { return message }
    if (module.exports.checkMentions(message)) {
      const text = message.content === undefined ? message : message.content
      if (typeof (text) === 'string' && text.charAt(0) === '<') {
        return message
      }
    }
    const content = message.content.substr(1)
    const commands = content.split(' ')
    return commands[0].toLowerCase()
  },
  isNormalCommand: message => {
    const commandName = module.exports.getCommandName(message)
    return { isNormalCommand: !keywords.includes(commandName), name: commandName }
  },
  editCommand: (message, command) => {
    const content = message.content.substr(1)
    const server = message.guild.id
    var commands = content.split(' ')
    if (!serversList.includes(server)) {
      serversList.push(server)
      responseDict[server] = {}
      saveServersListFile()
    }
    if (command === undefined || command === null) {
      command = module.exports.getCommandName(message)
    }
    if (commands.length >= 3) {
      const action = command
      console.log(1)
      if (action === 'add' || action === 'edit') {
        command = (module.exports.checkMentions(commands[1]) || module.exports.checkEmoji(commands[1])) ? commands[1] : commands[1].toLowerCase().trimStart()
        if (command.length === 0) {
          message.reply('格式錯誤，請確認空白位置和數量正確')
          return
        }
        if (command in responseDict[server]) {
          if (action === 'add') {
            if (responseDict[server][command] === '隨機圖片') {
              message.reply(`${command} 指令目前是設定回覆隨機圖片，若要增加圖片到這個指令請使用 !addimg，若要把隨機圖片變成指定回覆文字訊息(或是單張圖片網址)請使用 !edit`)
              return
            }
          }
        }
        responseDict[server][command] = content.replace(/^([^ ]+ ){2}/, '')
        saveCommandFile(server)
        if (action === 'add') { message.reply(`${command} 指令已經新增到列表中，內容： ${responseDict[server][command]}`) } else { message.reply(`${command} 指令已經更新，內容： ${responseDict[server][command]}`) }
      } else if (command === 'addimg') {
        module.exports.addImageCommand(message)
      } else if (command === 'send') {
        module.exports.sendChannelMessage(message)
      } else if (command === 'delimg') {
        module.exports.removeImageFile(message)
      }
    } else if (commands.length === 2) {
      if (command === 'remove') {
        const command = (module.exports.checkMentions(commands[1]) || module.exports.checkEmoji(commands[1])) ? commands[1] : commands[1].toLowerCase()
        if (command in responseDict[server]) {
          delete responseDict[server][command]
          message.reply(`${command} 指令已經刪除`)
          saveCommandFile(server)
        } else {
          message.reply(`${command} 指令未在清單內`)
        }
      } else if (command === 'reset' && commands[1] === 'server') {
        module.exports.resetServer(server)
      }
    } else if (commands.length === 1) {
      if (command === 'list' || command === 'help') {
        module.exports.displayAvailableCommands(message)
      }
    }
  },
  resetServer: (server) => {
    if (!serversList.includes(server)) {
      serversList.push(server)
      responseDict[server] = {}
      saveServersListFile()
    }
  },
  checkCommand: (message, command) => {
    const server = message.guild.id
    if (responseDict === undefined || responseDict === null) {
      module.exports.readCommandDict()
    }
    if (command === undefined || command === null) {
      command = module.exports.getCommandName(message)
    }
    if (command in keywords) {
      return
    }
    if (responseDict[server] === undefined) {
      message.channel.send('此伺服器重置後尚未進行設定，請先使用!reset server')
      var log = `[${message.channel.name}] ${message.guild} - ${message.author.username}: ${message.content}`
      clientManager.client.channels.get(auth.backupChannelId).send('<@251533592470093824> ' + log)
      return
    }
    if (command in responseDict[server]) {
      if (responseDict[server][command] === '隨機圖片' || responseDict[server][command] === '隨機媒體') {
        return
      }
      if (responseDict[server][command].includes('{}')) {
        const content = message.content.substr(1)
        const commandLineArray = content.split(' ')
        commandLineArray.shift()
        var plainText = responseDict[server][command]
        commandLineArray.forEach(element => {
          plainText = plainText.replace('{}', element)
        })
        const regex = RegExp(/{}/g)
        const regex2 = RegExp(/%7B%7D/g)
        if (commandLineArray.length > 0 && (regex.test(plainText) || regex2.test(plainText))) {
          console.log(1123)
          plainText = plainText.replace(regex, commandLineArray[0])
          plainText = plainText.replace(regex2, commandLineArray[0])
        }
        message.channel.send(`${plainText}`)
      } else { message.channel.send(responseDict[server][command]) }
    }
  },
  displayAvailableCommands: message => {
    const embed = new RichEmbed()
      .setTitle('指令列表')
      .setDescription('以下是可以使用的指令 (記得加空白，BOT沒反應代表格式錯誤或是BOT掛了)，[]代表請用自己的文字替代整個單字：')

    embed.addField('!add [指令名稱] [BOT回覆內容]', '新增指令')
    embed.addField(
      '!add [指令名稱] 隨機圖片',
      '新增特定指令的隨機圖片，先新增"!add 指令名稱 隨機圖片"指令後，再用 "!addimg 指令 圖片網址" 來增加圖片，圖片網址結尾必須是圖片檔，不要有?width=1202&height=677之類的訊息'
    )
    embed.addField('!edit [指令名稱] [BOT回覆內容]', '編輯指令')
    embed.addField('!remove [指令名稱]', '移除指令')
    embed.addField('!addimg [指令名稱] [網址]', '新增特定指令的隨機圖片，先新增"!add 指令名稱 隨機圖片"指令後，再用 "!addimg 指令 圖片網址" 來增加圖片，圖片網址結尾必須是圖片檔，不要有?width=1202&height=677之類的訊息')
    embed.addField('!delimg [指令名稱/資料夾名稱] [檔案名稱含副檔名]', '移除資料夾內的檔案')
    embed.addField(
      '!god [神的語言]',
      '!nhentai, !神的語言 都可以開車，但會偵測是否是老司機頻道'
    )
    embed.addField('!pixiv [作品ID]', '請給我色圖')
    embed.addField('!wnacg [車號]', '開車')
    embed.addField('!搜圖 [圖片網址]', '搜尋圖片')
    embed.addField('!keep [文字訊息]', '暫存文字訊息，最多10筆，超過後從最舊開始刪除，重開BOT後也會消失')
    embed.addField('!keeplist', '顯示使用者目前儲存的訊息')
    embed.addField('特殊字元 {}', '在一般回覆訊息內加入 {} 可以使用變數功能，例如："!add 搜尋 https://www.google.com/search?q={}" << (這個符號是 {})，使用: !搜尋 Discord BOT會回覆 https://www.google.com/search?q=Discord')
    /*
    var keyString = ''
    var keyFlag = false
    var keyOverflowFlag = false
    var keyList = []
    for (var key in responseDict[message.guild.id]) {
      keyFlag = true
      keyList.unshift(key)
      keyString = key + ' ' + keyString
      if (keyString.length >= 960) {
        keyOverflowFlag = true
        keyString = keyString.substring(0, keyString.length - keyList[keyList.length - 1].length - 1)
        keyList.shift()
      }
    }
    if (keyOverflowFlag) {
      keyString += '...'
    }
    embed.addField('一般指令：', keyFlag ? keyString : '無指令') */
    message.channel.send(embed)
  },
  addImageCommand: async (message, command) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    await fileManager.downloadFile(
      commands[2],
      commands[1],
      error => {
        console.log(error)
      }
    )
    message.reply('圖片新增成功')
  },
  getImageCommand: (message, command) => {
    const content = message.content.substr(1)
    const server = message.guild.id
    const commands = content.split(' ')
    if (command === undefined || command === null) {
      command = module.exports.getCommandName(message)
    }
    if (responseDict[server] === undefined) {
      message.channel.send('此伺服器重置後尚未進行設定，請先使用!reset server')
      var log = `[${message.channel.name}] ${message.guild} - ${message.author.username}: ${message.content}`
      clientManager.client.channels.get(auth.backupChannelId).send('<@251533592470093824> ' + log)
      return
    }
    if (command in responseDict[server]) {
      const folderName = commands[0].toLowerCase()
      if (responseDict[server][folderName] === '隨機圖片') {
        const dir = 'assets/images/' + folderName + '/'
        if (fileManager.checkFileDirectoryIsExist(dir)) {
          const file = fileManager.getRandomFile('images', folderName)
          if (file === null) {
            message.reply('發生錯誤，該指令尚未加入圖片')
            return
          }
          const attachment = new Attachment(file)
          // Send the attachment in the message channel with a content
          message.channel.send(attachment)
        } else { message.reply('發生錯誤，請確定該指令是設定在隨機圖片且有加入圖片') }
      }
    }
  },
  getMediaCommand: (message, command) => {
    const content = message.content.substr(1)
    const server = message.guild.id
    const commands = content.split(' ')
    if (command === undefined || command === null) {
      command = module.exports.getCommandName(message)
    }
    if (responseDict[server] === undefined) {
      message.channel.send('此伺服器重置後尚未進行設定，請聯絡：可可撥#9487')
      var log = `[${message.channel.name}] ${message.guild} - ${message.author.username}: ${message.content}`
      clientManager.client.channels.get(auth.backupChannelId).send('<@251533592470093824> ' + log)
      return
    }
    if (command in responseDict[server]) {
      const folderName = commands[0].toLowerCase()
      if (responseDict[server][folderName] === '隨機媒體') {
        const dir = 'assets/media/' + folderName + '/'
        if (fileManager.checkFileDirectoryIsExist(dir)) {
          const file = fileManager.getRandomFile('media', folderName)
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
  },
  sendChannelMessage: message => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    clientManager.client.channels.get(commands[1]).send(content.replace(/^([^ ]+ ){2}/, ''))
  },
  removeImageFile: async message => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    const folderName = commands[1].toLowerCase()
    const dir = 'assets/images/' + folderName + '/'
    const targetStr = commands[2]
    const n = targetStr.lastIndexOf('/')
    const filePath = targetStr.substring(n + 1)
    try {
      if (fileManager.checkFileDirectoryIsExist(dir)) {
        await fileManager.removeFile(`${dir}/${filePath}`)
        message.reply('圖片刪除成功')
      } else { message.reply(`圖片指令名稱錯誤，找不到 ${commands[1]} 資料夾`) }
    } catch (error) {
      console.log(error)
      message.reply(error.message)
    }
  }
}

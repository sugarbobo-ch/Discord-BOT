const { RichEmbed } = require('discord.js')
const moment = require('moment')
const serverRollcallDict = {}

function getRollCallCommand (message) {
  const content = message.content.substr(1)
  const commands = content.split(' ')
  switch (commands[0]) {
    case '點名':
      addRollCallMember(message)
      break
    case '開始點名':
      checkRollCall(message, true)
      break
    case '點名清單':
      checkRollCall(message, false)
      break
    case '結束點名':
      endRollCall(message)
      break
    default:
      break
  }
}

function checkRollCall (message, forceReset) {
  const serverId = message.guild.id
  const content = message.content.substr(1)
  const commands = content.split(' ')

  if (serverRollcallDict[serverId] === undefined) {
    const title = commands.length === 2 ? commands[1] : ''
    serverRollcallDict[serverId] = {
      title,
      rollCallList: [],
      isOpen: true,
      votesForCloseRoll: 0
    }
    message.reply(`已建立${title}點名清單，滿3人使用 !結束點名 指令即可停止點名`)
  } else {
    const rollCall = serverRollcallDict[serverId]
    if (!forceReset) {
      const title = rollCall.title.length > 0 ? rollCall.title + ' ' : ''
      const setCount = rollCall.rollCallList.length / 10
      for (var i = 0; i < setCount; i++) {
        const embed = new RichEmbed()
          .setTitle(`${title}點名清單`)
          .setDescription('目前已點名的人，請注意是否有代點名的狀況出現：')
        for (const member of rollCall.rollCallList.slice(i * 10, (i + 1) * 10)) {
          embed.addField(member.time, `${member.author} 點名：${member.text}`)
        }
        message.channel.send(embed)
      }
    } else {
      if (rollCall.isOpen) {
        message.reply('請先投票關閉點名後才可以開始新的點名')
        return
      }
      const title = commands.length === 2 ? commands[1] : ''
      serverRollcallDict[serverId] = {
        title,
        rollCallList: [],
        isOpen: true,
        votesForCloseRoll: 0
      }
      message.reply(`已建立${title}點名清單，滿3人使用 !結束點名 指令即可停止點名`)
    }
  }
}

function addRollCallMember (message) {
  const serverId = message.guild.id
  const content = message.content.substr(1)
  const commands = content.split(' ')

  if (serverRollcallDict[serverId] === undefined) {
    message.reply('此伺服器尚未建立點名清單，請使用 !開始點名 [標題] 來建立點名清單')
  } else {
    const rollCall = serverRollcallDict[serverId]
    if (!rollCall.isOpen) {
      message.reply('已經關閉點名，下次請早')
      return
    }

    const text = commands.length === 2 ? commands[1] : message.author
    rollCall.rollCallList.push({
      time: moment().format('HH:mm:ss'),
      text,
      author: message.author
    })
    message.reply(`您已完成點名：${text}`)
  }
}

function endRollCall (message) {
  const serverId = message.guild.id

  if (serverRollcallDict[serverId] === undefined) {
    message.reply('此伺服器尚未建立點名清單，請使用 !開始點名 [標題] 來建立點名清單')
  } else {
    const rollCall = serverRollcallDict[serverId]
    if (!rollCall.isOpen || rollCall.votesForCloseRoll >= 3) {
      message.reply('目前點名狀態已經關閉')
      return
    }
    rollCall.votesForCloseRoll += 1
    if (rollCall.votesForCloseRoll === 3) {
      rollCall.isOpen = false
      message.reply(`投票：結束${rollCall.title}點名 (3/3)，關閉${rollCall.title}點名`)
    } else {
      message.reply(`投票：結束${rollCall.title}點名 (${rollCall.votesForCloseRoll}/3)`)
    }
  }
}

module.exports = { getRollCallCommand }

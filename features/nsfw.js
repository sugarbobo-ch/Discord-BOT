const getCommandName = message => {
  const content = message.content.substr(1)
  const commands = content.split(' ')
  return commands[0].toLowerCase()
}

module.exports = {
  getPixivURL: (message) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    if (commands.length === 2) {
      if (getCommandName(message) === 'pixiv') {
        message.channel.send(`https://www.pixiv.net/artworks/${commands[1]}`)
      }
    }
  },
  getHentaiURL: (message) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    if (commands.length === 2) {
      if (getCommandName(message) === '神的語言' || getCommandName(message) === 'nhentai' || getCommandName(message) === 'god') {
        if (!message.channel.nsfw) {
          message.channel.send('請至開車頻道使用此指令')
          return
        }
        message.channel.send(`https://nhentai.net/g/${commands[1]}`)
      }
    }
  },
  getWnacgURL: (message) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    if (commands.length === 2) {
      if (getCommandName(message) === 'wnacg') {
        if (!message.channel.nsfw) {
          message.channel.send('請至開車頻道使用此指令')
          return
        }
        message.channel.send(`https://www.wnacg.com/photos-index-aid-${commands[1]}.html`)
      }
    }
  }
}

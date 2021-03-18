const axios = require('axios') // you can use any http client
const tf = require('@tensorflow/tfjs-node')
const nsfw = require('nsfwjs')
const fileManager = require('../utils/file.js')
const { RichEmbed } = require('discord.js')

let model
async function loadModel () {
  model = await nsfw.load()
}
loadModel()

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
  getSourceURL: (message) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    if (commands.length === 2) {
      if (getCommandName(message) === '搜圖') {
        message.channel.send(`https://saucenao.com/search.php?db=999&url=${commands[1]}`)
      }
    }
  },
  getHentaiURL: (message) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    if (commands.length === 2) {
      if (getCommandName(message) === '神的語言' || getCommandName(message) === 'nhentai' || getCommandName(message) === 'god') {
        /*
        if (!message.channel.nsfw) {
          message.channel.send('請至開車頻道使用此指令')
          return
        } */
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
  },
  isHashPrefix: (message) => {
    return message.content.charAt(0) === '#'
  },
  sendHentaiURL: (message) => {
    if (message.content.length === 7) {
      const content = message.content.substr(1)
      const reg = /^\d+$/
      if (reg.test(content)) {
        message.content = `!god ${content}`
        module.exports.getHentaiURL(message)
      }
    }
  },
  detectNsfwImage: async (message) => {
    const content = message.content.substr(1)
    const commands = content.split(' ')
    const url = commands[1]
    if (commands.length === 2) {
      if (getCommandName(message) === 'nsfw') {
        let pic
        try {
          pic = await axios.get(url, {
            responseType: 'arraybuffer'
          })
        } catch (error) {
          message.channel.send('請輸入正確且有效的網址')
          return
        }

        if (!model) {
          model = await nsfw.load() // To load a local model, nsfw.load('file://./path/to/model/')
        }

        if (!fileManager.isImage) {
          message.channel.send('圖片不符合可支援的格式，請使用jpg、png或gif')
        }
        let predictResult = 'Unknown'
        try {
          const image = await tf.node.decodeImage(pic.data, 3)
          let predictions
          if (fileManager.isGif(url)) {
            const fileDest = await fileManager.downloadFile(
              url,
              'testGif',
              (error) => {
                console.log(error)
              }
            )
            console.log('fileDest', fileDest)
            const buffer = fileManager.readBufferSyncFromFile(fileDest)
            predictions = await model.classifyGif(buffer)
            const result = {}
            const average = arr => arr.reduce((p, c) => p + c, 0) / arr.length
            for (const framePredictions of predictions) {
              for (const probabilityElement of framePredictions) {
                console.log(probabilityElement)
                if (result[probabilityElement.className] === undefined) {
                  result[probabilityElement.className] = []
                }
                result[probabilityElement.className].push(probabilityElement.probability)
              }
            }
            predictions = []
            for (const [className, total] of Object.entries(result)) {
              predictions.push({ className, probability: average(total) })
            }
          } else {
            predictions = await model.classify(image)
            console.log(predictions)
          }

          predictResult = predictions.reduce((a, b) => a.probability > b.probability ? a : b)
          image.dispose()
          const embed = new RichEmbed()
            .setTitle('圖片分析結果')
            .setURL(url)
            .setThumbnail(url)
            .setDescription(`以下是圖片分析結果，判斷此圖片最可能是：${predictResult.className}`)
          for (const { className, probability } of predictions) {
            embed.addField(className, probability.toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 6 }))
          }
          message.channel.send(embed)
        } catch (error) {
          console.log(error)
          message.channel.send(error.message)
        }
      }
    }
  }
}

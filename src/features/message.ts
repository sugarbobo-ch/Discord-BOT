import { Message, AttachmentBuilder, EmbedBuilder, TextChannel } from 'discord.js'
import * as fileManager from '../utils/file'
import { clientManager } from '../utils/client'
import { checkPrefix, checkMentions, checkEmoji, getCommandName, normalizeMessageContent } from '../utils/command'
import { getDb } from '../utils/db'
import { checkImageNSFW } from '../utils/gemini'
import path from 'path'
import fs from 'fs'

import { commandRegistry } from '../utils/registry'

export { checkPrefix, checkMentions, checkEmoji, getCommandName, normalizeMessageContent }

const keywords = [
  'add',
  'remove',
  'edit',
  'list',
  'help',
  'addimg',
  'delimg',
  'send',
  'reset',
  '大全',
  '記憶',
  'memory',
  '我的記憶'
]

const responseDict: Record<string, Record<string, string>> = {}
let serversList: string[] = []

export const readCommandDict = async (): Promise<void> => {
  try {
    const db = getDb()

    // 清空現有的快取
    for (const key in responseDict) {
      delete responseDict[key]
    }

    // 載入所有伺服器清單
    const servers = db.prepare('SELECT server_id FROM servers').all() as any[]
    serversList = servers.map(row => {
      responseDict[row.server_id] = {}
      return row.server_id
    })

    // 載入所有自訂指令
    const cmds = db.prepare('SELECT server_id, name, response FROM commands').all() as any[]
    cmds.forEach(cmd => {
      if (!responseDict[cmd.server_id]) {
        responseDict[cmd.server_id] = {}
      }
      responseDict[cmd.server_id][cmd.name] = cmd.response
    })
    console.log('Loaded servers from SQLite:', serversList)
  } catch (error) {
    console.error('Failed to read command dict from SQLite:', error)
  }
}

export const isNormalCommand = (message: Message): { isNormalCommand: boolean; name: string } => {
  const commandName = getCommandName(message)
  return { isNormalCommand: !keywords.includes(commandName), name: commandName }
}

export const editCommand = async (message: Message, command?: string): Promise<void> => {
  if (!message.guild) return
  const content = message.content.substring(1)
  const server = message.guild.id
  const commands = content.split(' ')
  const db = getDb()

  if (!serversList.includes(server)) {
    serversList.push(server)
    responseDict[server] = {}
    db.prepare('INSERT OR IGNORE INTO servers (server_id) VALUES (?)').run(server)
  } else if (!responseDict[server]) {
    responseDict[server] = {}
  }

  if (command === undefined || command === null) {
    command = getCommandName(message)
  }

  const action = command

  if (action === 'add' || action === 'edit') {
    if (commands.length < 3) {
      message.reply(`格式錯誤，正確格式為：!${action} [指令名稱] [BOT回覆內容]`)
      return
    }
    const targetCmd =
      checkMentions(commands[1]) || checkEmoji(commands[1])
        ? commands[1]
        : commands[1].toLowerCase().trimStart()
    if (targetCmd.length === 0) {
      message.reply('格式錯誤，請確認空白位置和數量正確')
      return
    }
    if (commandRegistry.get(targetCmd)) {
      message.reply(`⛔ 格式錯誤，"${targetCmd}" 是系統保留指令或關鍵字，不可使用此名稱。`)
      return
    }
    if (targetCmd in responseDict[server]) {
      if (action === 'add') {
        if (responseDict[server][targetCmd] === '隨機圖片') {
          message.reply(
            `${targetCmd} 指令目前是設定回覆隨機圖片，若要增加圖片到這個指令請使用 !addimg，若要把隨機圖片變成指定回覆文字訊息(或是單張圖片網址)請使用 !edit`
          )
          return
        }
      }
    }
    responseDict[server][targetCmd] = content.replace(/^([^ ]+ ){2}/, '')
    db.prepare(
      'INSERT OR REPLACE INTO commands (server_id, name, response) VALUES (?, ?, ?)'
    ).run(server, targetCmd, responseDict[server][targetCmd])

    if (action === 'add') {
      message.reply(`${targetCmd} 指令已經新增到列表中，內容： ${responseDict[server][targetCmd]}`)
    } else {
      message.reply(`${targetCmd} 指令已經更新，內容： ${responseDict[server][targetCmd]}`)
    }
  } else if (action === 'addimg') {
    if (commands.length < 3) {
      message.reply('格式錯誤，正確格式為：!addimg [指令名稱] [圖片網址]')
      return
    }
    await addImageCommand(message)
  } else if (action === 'delimg') {
    if (commands.length < 3) {
      message.reply('格式錯誤，正確格式為：!delimg [指令名稱/資料夾名稱] [檔案名稱含副檔名]')
      return
    }
    await removeImageFile(message)
  } else if (action === 'send') {
    if (commands.length < 3) {
      message.reply('格式錯誤，正確格式為：!send [頻道ID] [訊息內容]')
      return
    }
    sendChannelMessage(message)
  } else if (action === 'remove') {
    if (commands.length !== 2) {
      message.reply('格式錯誤，正確格式為：!remove [指令名稱]')
      return
    }
    const targetCmd =
      checkMentions(commands[1]) || checkEmoji(commands[1])
        ? commands[1]
        : commands[1].toLowerCase()
    if (targetCmd in responseDict[server]) {
      delete responseDict[server][targetCmd]
      db.prepare('DELETE FROM commands WHERE server_id = ? AND name = ?').run(server, targetCmd)
      message.reply(`${targetCmd} 指令已經刪除`)
    } else {
      message.reply(`${targetCmd} 指令未在清單內`)
    }
  } else if (action === 'reset') {
    if (commands.length !== 2 || commands[1] !== 'server') {
      message.reply('格式錯誤，正確格式為：!reset server')
      return
    }
    await resetServer(server)
  } else if (action === '大全') {
    if (commands.length !== 2) {
      message.reply('格式錯誤，正確格式為：!大全 [關鍵字]')
      return
    }
    searchAllCommands(message)
  } else if (action === 'list' || action === 'help') {
    displayAvailableCommands(message)
  }
}

export const resetServer = async (server: string): Promise<void> => {
  const db = getDb()
  if (!serversList.includes(server)) {
    serversList.push(server)
    responseDict[server] = {}
    db.prepare('INSERT OR IGNORE INTO servers (server_id) VALUES (?)').run(server)
  } else {
    responseDict[server] = {}
    db.prepare('DELETE FROM commands WHERE server_id = ?').run(server)
  }
}

export const checkCommand = (message: Message, command?: string): void => {
  if (!message.guild) return
  const server = message.guild.id
  if (
    responseDict === undefined ||
    responseDict === null ||
    Object.keys(responseDict).length === 0
  ) {
    // 異步讀取，但此處是為了防呆，應該已在 ready 事件中載入完成
    readCommandDict()
  }
  if (command === undefined || command === null) {
    command = getCommandName(message)
  }
  if (keywords.includes(command)) {
    return
  }
  if (responseDict[server] === undefined) {
    return
  }

  if (command in responseDict[server]) {
    if (
      responseDict[server][command] === '隨機圖片' ||
      responseDict[server][command] === '隨機媒體'
    ) {
      return
    }
    if (responseDict[server][command].includes('{}')) {
      const content = message.content.substring(1)
      const commandLineArray = content.split(' ')
      commandLineArray.shift()
      let plainText = responseDict[server][command]
      commandLineArray.forEach(element => {
        plainText = plainText.replace('{}', element)
      })
      const regex = RegExp(/{}/g)
      const regex2 = RegExp(/%7B%7D/g)
      if (commandLineArray.length > 0 && (regex.test(plainText) || regex2.test(plainText))) {
        plainText = plainText.replace(regex, commandLineArray[0])
        plainText = plainText.replace(regex2, commandLineArray[0])
      }
      ;(message.channel as any).send(`${plainText}`)
    } else {
      ;(message.channel as any).send(responseDict[server][command])
    }
  }
}

export const displayAvailableCommands = (message: Message): void => {
  const embed = new EmbedBuilder()
    .setTitle('指令列表')
    .setDescription(
      '以下是可以使用的指令 (記得加空白，BOT沒反應代表格式錯誤或是BOT掛了)，[]代表請用自己的文字替代整個單字：'
    )
    .addFields(
      { name: '!add [指令名稱] [BOT回覆內容]', value: '新增指令' },
      {
        name: '!add [指令名稱] 隨機圖片',
        value:
          '新增特定指令的隨機圖片，先新增"!add 指令名稱 隨機圖片"指令後，再用 "!addimg 指令 圖片網址" 來增加圖片，圖片網址結尾必須是圖片檔，不要有?width=1202&height=677之類的訊息'
      },
      { name: '!edit [指令名稱] [BOT回覆內容]', value: '編輯指令' },
      { name: '!remove [指令名稱]', value: '移除指令' },
      {
        name: '!addimg [指令名稱] [網址]',
        value:
          '新增特定指令的隨機圖片，先新增"!add 指令名稱 隨機圖片"指令後，再用 "!addimg 指令 圖片網址" 來增加圖片，圖片網址結尾必須是圖片檔，不要有?width=1202&height=677之類的訊息'
      },
      { name: '!delimg [指令名稱/資料夾名稱] [檔案名稱含副檔名]', value: '移除資料夾內的檔案' },
      {
        name: '!god [神的語言]',
        value: '!nhentai, !神的語言 都可以開車，但會偵測是否是老司機頻道'
      },
      { name: '!pixiv [作品ID]', value: '請給我色圖' },
      { name: '!wnacg [車號]', value: '開車' },
      { name: '!搜圖 [圖片網址]', value: '搜尋圖片' },
      {
        name: '!keep [文字訊息]',
        value: '暫存文字訊息，最多10筆，超過後從最舊開始刪除，重開BOT後也會消失'
      },
      { name: '!keeplist', value: '顯示使用者目前儲存的訊息' },
      { name: '!開始點名 !點名 !點名清單 !結束點名', value: '點名所有的功能' },
      { name: '!抽獎指令', value: '顯示抽獎功能之所有指令及介紹' },
      {
        name: '特殊字元 {}',
        value:
          '在一般回覆訊息內加入 {} 可以使用變數功能，例如："!add 搜尋 https://www.google.com/search?q={}" << (這個符號是 {})，使用: !搜尋 Discord BOT會回覆 https://www.google.com/search?q=Discord'
      }
    )
  ;(message.channel as any).send({ embeds: [embed] })
}

export const addImageCommand = async (message: Message): Promise<void> => {
  const content = message.content.substring(1)
  const commands = content.split(' ')
  if (commands.length < 3) {
    message.reply('格式錯誤，正確格式為：!addimg [指令名稱] [圖片網址]')
    return
  }

  const folderName = commands[1]
  const imageUrl = commands[2]

  try {
    message.reply('正在下載並分析圖片安全性...')
    const fileDest = await fileManager.downloadFile(imageUrl, folderName, error => {
      console.log(error)
    })

    // 檢查頻道是否不是 NSFW 頻道
    const isNsfwChannel =
      message.channel.isTextBased() && 'nsfw' in message.channel && (message.channel as any).nsfw

    if (!isNsfwChannel) {
      const buffer = await fs.promises.readFile(fileDest)
      const mimeType = imageUrl.toLowerCase().endsWith('.png')
        ? 'image/png'
        : imageUrl.toLowerCase().endsWith('.gif')
          ? 'image/gif'
          : 'image/jpeg'

      const nsfwResult = await checkImageNSFW(buffer, mimeType)
      if (nsfwResult.nsfw) {
        // 刪除剛下載的檔案並自 index 清除
        await fileManager.removeFile(
          'assets/images/' + folderName,
          path.basename(fileDest),
          folderName
        )
        message.reply(`⛔ 圖片檢測為 NSFW 內容，已被拒絕！原因：${nsfwResult.reason}`)
        return
      }
    }

    message.reply('圖片新增成功')
  } catch (error: any) {
    console.error(error)
    message.reply(`圖片新增失敗: ${error.message || error}`)
  }
}

export const getImageCommand = async (message: Message, command?: string): Promise<void> => {
  if (!message.guild) return
  const content = message.content.substring(1)
  const server = message.guild.id
  const commands = content.split(' ')
  if (command === undefined || command === null) {
    command = getCommandName(message)
  }
  if (responseDict[server] === undefined) {
    return
  }

  if (command in responseDict[server]) {
    const folderName = commands[0].toLowerCase()
    if (responseDict[server][folderName] === '隨機圖片') {
      const dir = 'assets/images/' + folderName + '/'
      if (fileManager.checkFileDirectoryIsExist(dir)) {
        const file = await fileManager.getRandomFile('images', folderName)
        if (file === null) {
          message.reply('發生錯誤，該指令尚未加入圖片')
          return
        }
        console.time('Attachment constructor')
        const attachment = new AttachmentBuilder(file)
        console.timeEnd('Attachment constructor')
        ;(message.channel as any).send({ files: [attachment] })
      } else {
        message.reply('發生錯誤，請確定該指令是設定在隨機圖片且有加入圖片')
      }
    }
  }
}

export const getMediaCommand = async (message: Message, command?: string): Promise<void> => {
  if (!message.guild) return
  const content = message.content.substring(1)
  const server = message.guild.id
  const commands = content.split(' ')
  if (command === undefined || command === null) {
    command = getCommandName(message)
  }
  if (responseDict[server] === undefined) {
    return
  }

  if (command in responseDict[server]) {
    const folderName = commands[0].toLowerCase()
    if (responseDict[server][folderName] === '隨機媒體') {
      const dir = 'assets/media/' + folderName + '/'
      if (fileManager.checkFileDirectoryIsExist(dir)) {
        const file = await fileManager.getRandomFile('media', folderName)
        if (file === null) {
          message.reply('發生錯誤，請確定該指令是設定在隨機圖片且有加入圖片')
          return
        }
        const attachment = new AttachmentBuilder(file)
        ;(message.channel as any).send({ files: [attachment] })
      }
    }
  }
}

export const sendChannelMessage = (message: Message): void => {
  const content = message.content.substring(1)
  const commands = content.split(' ')
  const client = clientManager.client
  if (!client) return

  const channel = client.channels.cache.get(commands[1])
  if (channel && channel.isTextBased()) {
    ;(channel as TextChannel).send(content.replace(/^([^ ]+ ){2}/, ''))
  }
}

export const removeImageFile = async (message: Message): Promise<void> => {
  const content = message.content.substring(1)
  const commands = content.split(' ')
  const folderName = commands[1].toLowerCase()
  const dir = 'assets/images/' + folderName + '/'
  const targetStr = commands[2]
  const n = targetStr.lastIndexOf('/')
  const filePath = targetStr.substring(n + 1)
  try {
    if (fileManager.checkFileDirectoryIsExist(dir)) {
      await fileManager.removeFile(dir, filePath, folderName)
      message.reply('圖片刪除成功')
    } else {
      message.reply(`圖片指令名稱錯誤，找不到 ${commands[1]} 資料夾`)
    }
  } catch (error: any) {
    console.log(error)
    message.reply(error.message || '圖片刪除失敗')
  }
}

export const searchAllCommands = (message: Message): void => {
  if (!message.guild) return
  const content = message.content.substring(1)
  const commands = content.split(' ')
  const server = message.guild.id
  let str = ''
  let count = 0
  let totalCommandsCount = 0

  if (!responseDict[server]) return

  for (const [key] of Object.entries(responseDict[server])) {
    if (key.includes(commands[1].toLowerCase())) {
      count += 1
      totalCommandsCount += 1
      const tempStr = str + key
      if (tempStr.length > 1950) {
        ;(message.channel as any).send(tempStr)
        str = ''
        continue
      }
      if (count === 5) {
        str += key + '\n'
        count = 0
      } else {
        str += key + '\t'
      }
    }
  }
  if (str.length > 0) {
    if (count === 0) {
      str += `\n共 ${totalCommandsCount} 個指令\n`
    } else {
      str += `\n\n共 ${totalCommandsCount} 個指令\n`
    }
    ;(message.channel as any).send(str)
  } else {
    ;(message.channel as any).send('查無結果')
  }
}

export const isCustomCommandResponse = (message: Message): boolean => {
  if (!message.guild) return false
  const server = message.guild.id
  if (!responseDict[server]) return false
  const content = message.content
  return Object.values(responseDict[server]).some(resp => resp === content)
}

/**
 * 判斷是否應跳過 dialogue (Gemini chatbot) 觸發
 */
export const shouldSkipDialogueTrigger = (message: Message, repliedMsg: Message | null): boolean => {
  // 1. 偵測使用者當前訊息或被回覆的訊息是否包含 fixvx 相關的網址
  const fixvxRegex = /fixvx\.com|vxtwitter\.com|fxtwitter\.com/i
  if (fixvxRegex.test(message.content)) {
    return true
  }
  if (repliedMsg && fixvxRegex.test(repliedMsg.content)) {
    return true
  }

  // 2. 偵測使用者當前訊息或被回覆的訊息是否為漫畫/R18連結
  const comicPatterns = [
    /e-hentai\.org/i,
    /exhentai\.org/i,
    /wnacg\.(com|org|net)/i,
    /18comic\.(vip|org|art|ink)/i,
    /jmcomic\.(me|co)/i,
    /jm-comic\d*\.(art|group)/i,
    /happymh\.com/i,
    /pixiv\.net/i,
    /saucenao\.com/i,
    /nhentai\.net/i
  ]
  if (comicPatterns.some(pattern => pattern.test(message.content))) {
    return true
  }

  // 3. 檢查被回覆的訊息是否為指令、斜線指令、或指令回應
  if (repliedMsg) {
    // A. 偵測是否為指令 (以 !, ！, /, # 開頭)
    const trimmed = repliedMsg.content.trim()
    const firstChar = trimmed.charAt(0)
    if (firstChar === '!' || firstChar === '！' || firstChar === '/' || firstChar === '#') {
      return true
    }

    // B. 偵測是否為斜線指令的回應 (由 Discord API 標記 of interaction)
    if (repliedMsg.interaction) {
      return true
    }

    // C. 偵測是否為自訂指令的回應
    if (isCustomCommandResponse(repliedMsg)) {
      return true
    }

    // D. 偵測是否為機器人的內建指令回應內容
    const commandOutputPatterns = [
      /點名清單|投票：|結束點名|點名狀態/i,
      /抽獎清單|抽獎指令|開獎|已結束.*抽獎/i,
      /機器人伺服器設定/i,
      /指令列表|以下是可以使用的指令/i,
      /長期記憶|我的記憶|記憶功能|記憶已設定/i,
      /股票|走勢圖|股票歷史/i,
      /抓到了! 是錯字!|打成「因」的/i
    ]
    if (commandOutputPatterns.some(pattern => pattern.test(repliedMsg.content))) {
      return true
    }

    // E. 偵測是否為漫畫/R18 連結或 embed 內容
    if (comicPatterns.some(pattern => pattern.test(repliedMsg.content))) {
      return true
    }

    // 檢查被回覆訊息的 Embeds (例如漫畫預覽、Saucenao 搜尋結果)
    if (repliedMsg.embeds && repliedMsg.embeds.length > 0) {
      for (const embed of repliedMsg.embeds) {
        const title = embed.title || ''
        const author = embed.author?.name || ''
        const footer = embed.footer?.text || ''
        const description = embed.description || ''
        const url = embed.url || ''

        const isComicText = /紳士漫畫|禁漫天堂|嗨皮漫畫|E-Hentai|ExHentai|Saucenao|搜尋結果|相似度|畫師|社團/i
        if (
          comicPatterns.some(pattern => pattern.test(url)) ||
          isComicText.test(title) ||
          isComicText.test(author) ||
          isComicText.test(footer) ||
          isComicText.test(description)
        ) {
          return true
        }
      }
    }
  }

  return false
}



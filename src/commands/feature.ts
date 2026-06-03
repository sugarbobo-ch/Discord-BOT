import { Message, EmbedBuilder } from 'discord.js'
import { Command } from './command.interface'

export class FeatureCommand implements Command {
  public names = ['功能', 'features']

  public execute(message: Message, args: string[]): void {
    const embed = new EmbedBuilder()
      .setTitle('🤖 波波 (Bobo) 機器人功能介紹')
      .setDescription(
        '我是波波，一個多功能又帶點幽默的 Discord 機器人助手！以下是我的主要功能介紹與可用指令列表：'
      )
      .setColor(0x3498db) // 質感藍色
      .addFields(
        {
          name: '💬 AI 聊天助理 (Gemini 驅動)',
          value:
            '• `!bobo [內容]` 或直接 Tag/Mention 機器人與我聊天。\n' +
            '• 支援上傳圖片或提供圖片網址讓我解讀。\n' +
            '• 自動參考聊天室對話，且講話風格隨性自然！\n' +
            '• 在聊天中輸入股票代號（例如：`2330`、`AAPL`），會自動抓取即時股價並分析！'
        },
        {
          name: '⚙️ 伺服器自訂指令',
          value:
            '• `!add [指令] [內容]`：新增自訂文字回應。\n' +
            '• `!add [指令] 隨機圖片`：再搭配 `!addimg [指令] [網址]` 新增隨機圖片池。\n' +
            '• `!edit [指令] [內容]`：編輯自訂指令。\n' +
            '• `!remove [指令]`：移除自訂指令。\n' +
            '• `!list`：列出可用自訂指令。\n' +
            '• `!大全 [關鍵字]`：查詢關鍵字自訂指令。'
        },
        {
          name: '📋 記住功能 (Keep)',
          value:
            '• `!keep [文字]`：儲存一筆暫存訊息（每人最多 10 筆，重啟後會清除）。\n' +
            '• `!keeplist`：列出你目前暫存的所有內容。'
        },
        {
          name: '🎲 點名系統',
          value:
            '• `!開始點名 [標題]`：發起一個新點名清單。\n' +
            '• `!點名 [名字]`：完成點名（預設點名名字為自己）。\n' +
            '• `!點名清單`：顯示當前已點名名單。\n' +
            '• `!結束點名`：投票結束點名（需滿3人投票）。'
        },
        {
          name: '🎟️ 抽獎系統',
          value:
            '• `!開始抽獎 [標題] [時間(分)]`：建立抽獎活動（預設時間為 5 分鐘）。\n' +
            '• `!抽獎`：參加目前頻道的抽獎活動。\n' +
            '• `!抽獎名單`：查看目前抽獎清單與截止時間。\n' +
            '• `!開獎 [中獎人數]`：舉辦人開獎（選填中獎人數，預設為1人）。\n' +
            '• `!結束抽獎`：舉辦人結束並刪除該抽獎活動。\n' +
            '• `!強制結束抽獎`：強制刪除該頻道的抽獎活動。\n' +
            '• `!抽獎指令`：顯示抽獎功能詳細說明。'
        },
        {
          name: '🔞 紳士功能 (NSFW)',
          value:
            '• `!pixiv [Pixiv ID]`：產生該作品的 pixiv 連結。\n' +
            '• `!搜圖`：以圖片網址、上傳圖片或回覆圖片進行搜圖（使用 Saucenao）。\n' +
            '• `!nhentai [車牌]` / `!神的語言 [車牌]` / `!god [車牌]`：產生 nhentai 本本連結。\n' +
            '• `#[6位數車牌]`：例如在聊天輸入 `#123456`，會自動搜尋並產生本本連結。\n' +
            '• `!wnacg [車牌]`：在開車頻道產生 wnacg 連結。'
        },
        {
          name: '🔧 推特/X.com 自動置換與設定',
          value:
            '• 自動偵測 `x.com` 連結，置換為 `fixvx.com` 以修復預覽。\n' +
            '• `!設定` / `!setting` 或斜線指令 `/設定`：開啟/關閉推特自動置換功能（管理員專用）。\n' +
            '• `!功能` / `!features` 或斜線指令 `/功能`：顯示本功能介紹與指令列表。'
        },
        {
          name: '✍️ 錯字糾正大師',
          value: '• 聊天中如果出現「因該」、「以經」、「部會」、「絕得」、「在一次」等錯字，我會毫不留情地進行嘲諷！'
        }
      )
      .setFooter({ text: '使用指令時記得在名稱與參數之間加上空白喔！' })
      .setTimestamp()

    message.reply({ embeds: [embed] })
  }
}

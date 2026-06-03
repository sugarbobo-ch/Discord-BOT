import { Message, EmbedBuilder } from 'discord.js'
import { Command } from './command.interface'

export class FeatureCommand implements Command {
  public names = ['功能', 'features']

  public execute(message: Message, args: string[]): void {
    const embed = new EmbedBuilder()
      .setTitle('🤖 波波 (Bobo) 機器人功能介紹')
      .setDescription('我是波波，一個多功能又帶點幽默的 Discord 機器人助手！以下是我的主要功能介紹：')
      .setColor(0x3498db) // 質感藍色
      .addFields(
        {
          name: '💬 AI 聊天助理 (Gemini 驅動)',
          value:
            '• 直接 Tag/Mention 機器人，或者使用 `!bobo [內容]` 與我聊天。\n' +
            '• 支援上傳圖片或提供圖片網址讓我解讀。\n' +
            '• 我會自動參考聊天室的最近對話，講話風格隨性自然！\n' +
            '• 在聊天中輸入股票代號（例如：`2330`、`AAPL`），我會自動抓取即時股價並為你分析！'
        },
        {
          name: '⚙️ 伺服器自訂指令',
          value:
            '• `!add [指令] [內容]`：新增自訂文字回應。\n' +
            '• `!add [指令] 隨機圖片`：再搭配 `!addimg [指令] [網址]` 新增隨機圖片池。\n' +
            '• `!edit [指令] [內容]` / `!remove [指令]`：編輯或移除指令。\n' +
            '• `!list` / `!大全 [關鍵字]`：列出可用指令或查詢關鍵字。'
        },
        {
          name: '🔧 推特/X.com 連結自動修正',
          value:
            '• 自動偵測 `x.com` 連結，若 Discord 沒產生預覽，3秒後會自動置換為 `fixvx.com`。\n' +
            '• 管理員可以使用 `/設定` 或 `!設定` 指令，點擊按鈕來開啟或關閉此功能。'
        },
        {
          name: '📋 記住功能 (Keep)',
          value:
            '• `!keep [文字]`：儲存一筆暫存訊息（每人最多 10 筆，重啟後會清除）。\n' +
            '• `!keeplist`：列出你目前暫存的所有內容。'
        },
        {
          name: '🎲 點名與抽獎',
          value:
            '• `!開始點名` / `!點名` / `!結束點名`：進行點名統計。\n' +
            '• 使用 `!抽獎指令` 可以查看完整的抽獎系統使用方法。'
        },
        {
          name: '✍️ 錯字糾正大師',
          value: '• 聊天中如果出現「因該」、「以經」、「部會」等錯字，我會毫不留情地進行嘲諷！'
        }
      )
      .setFooter({ text: '使用指令時記得在名稱與參數之間加上空白喔！' })
      .setTimestamp()

    message.reply({ embeds: [embed] })
  }
}

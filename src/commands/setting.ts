import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, PermissionFlagsBits } from 'discord.js'
import { Command } from './command.interface'
import { getTwitterSetting } from '../utils/db'

export class SettingCommand implements Command {
  public names = ['設定', 'setting']

  public async execute(message: Message, args: string[]): Promise<void> {
    if (!message.guild) {
      await message.reply('❌ 此設定只能在伺服器（群組）中使用。')
      return
    }

    // 檢查使用者權限 (管理伺服器或管理員權限)
    const member = message.member
    if (
      !member ||
      (!member.permissions.has(PermissionFlagsBits.ManageGuild) &&
        !member.permissions.has(PermissionFlagsBits.Administrator))
    ) {
      await message.reply('❌ 只有管理員或擁有「管理伺服器」權限的使用者才能使用此指令。')
      return
    }

    const serverId = message.guild.id
    const isTwitterEnabled = getTwitterSetting(serverId)

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('settings_twitter_enable')
        .setLabel('開啟自動置換')
        .setStyle(isTwitterEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('settings_twitter_disable')
        .setLabel('關閉自動置換')
        .setStyle(isTwitterEnabled ? ButtonStyle.Secondary : ButtonStyle.Danger)
    )

    await message.reply({
      content: `🔧 **機器人伺服器設定**\n目前設定項目：**偵測 x.com 自動置換 fixvx.com**\n目前狀態：${isTwitterEnabled ? '🟢 已開啟' : '🔴 已關閉'}\n請點擊下方按鈕以切換設定：`,
      components: [row]
    })
  }
}

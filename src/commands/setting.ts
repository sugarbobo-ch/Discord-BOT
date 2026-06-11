import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageFlags
} from 'discord.js'
import { Command } from './command.interface'
import { getTwitterSetting, setTwitterSetting } from '../utils/db'

export class SettingCommand implements Command {
  public names = ['設定', 'setting']

  public slashData = {
    name: '設定',
    description: '設定機器人功能 (例如 x.com 自動置換)'
  }

  public buttonIds = ['settings_twitter_enable', 'settings_twitter_disable']

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

  public async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ 此設定只能在伺服器中使用。', flags: MessageFlags.Ephemeral })
      return
    }

    // 檢查使用者權限 (管理伺服器或管理員權限)
    const permissions = interaction.memberPermissions
    if (
      !permissions ||
      (!permissions.has(PermissionFlagsBits.ManageGuild) &&
        !permissions.has(PermissionFlagsBits.Administrator))
    ) {
      await interaction.reply({
        content: '❌ 只有管理員或擁有「管理伺服器」權限的使用者才能使用此指令。',
        flags: MessageFlags.Ephemeral
      })
      return
    }

    const isTwitterEnabled = getTwitterSetting(interaction.guildId)

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

    await interaction.reply({
      content: `🔧 **機器人伺服器設定**\n目前設定項目：**偵測 x.com 自動置換 fixvx.com**\n目前狀態：${isTwitterEnabled ? '🟢 已開啟' : '🔴 已關閉'}\n請點擊下方按鈕以切換設定：`,
      components: [row]
    })
  }

  public async executeButton(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) {
      await interaction.reply({ content: '❌ 此設定只能在伺服器中使用。', flags: MessageFlags.Ephemeral })
      return
    }

    // 限制只有擁有「管理伺服器」或「管理員」權限的成員可以操作設定
    const permissions = interaction.memberPermissions
    if (
      !permissions ||
      (!permissions.has(PermissionFlagsBits.ManageGuild) &&
        !permissions.has(PermissionFlagsBits.Administrator))
    ) {
      await interaction.reply({
        content: '❌ 你沒有權限更改此設定 (需要管理伺服器權限)。',
        flags: MessageFlags.Ephemeral
      })
      return
    }

    const enable = interaction.customId === 'settings_twitter_enable'
    setTwitterSetting(guildId, enable)

    const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('settings_twitter_enable')
        .setLabel('開啟自動置換')
        .setStyle(enable ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('settings_twitter_disable')
        .setLabel('關閉自動置換')
        .setStyle(enable ? ButtonStyle.Secondary : ButtonStyle.Danger)
    )

    await interaction.update({
      content: `🔧 **機器人伺服器設定**\n目前設定項目：**偵測 x.com 自動置換 fixvx.com**\n目前狀態：${enable ? '🟢 已開啟' : '🔴 已關閉'}\n請點擊下方按鈕以切換設定：`,
      components: [newRow]
    })
  }
}

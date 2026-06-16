import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageFlags,
  EmbedBuilder
} from 'discord.js'
import { Command } from './command.interface'
import { getTwitterSetting, setTwitterSetting, getNsfwSetting, setNsfwSetting } from '../utils/db'

export class SettingCommand implements Command {
  public names = ['設定', 'setting']

  public slashData = {
    name: '設定',
    description: '設定機器人功能 (例如 x.com 置換、NSFW 本子自動預覽與連結跳轉)'
  }

  public buttonIds = ['settings_twitter_toggle', 'settings_nsfw_toggle']

  private createSettingsPayload(serverId: string) {
    const isTwitterEnabled = getTwitterSetting(serverId)
    const isNsfwEnabled = getNsfwSetting(serverId)

    const embed = new EmbedBuilder()
      .setTitle('🔧 機器人伺服器功能設定')
      .setDescription('管理員可透過下方按鈕即時切換伺服器功能開關。')
      .setColor(0x5865f2) // Discord Blurple
      .addFields(
        {
          name: '1️⃣ 偵測 x.com 自動置換',
          value: `目前狀態：${isTwitterEnabled ? '🟢 **已開啟**' : '🔴 **已關閉**'}\n*偵測推特連結並自動置換為 fixvx.com 以便在 Discord 內正常預覽。*`,
          inline: false
        },
        {
          name: '2️⃣ NSFW 本子自動預覽 (Embed)',
          value: `目前狀態：${isNsfwEnabled ? '🟢 **已開啟**' : '🔴 **已關閉**'}\n*在開車頻道自動解析本本網址與車號並生成包含畫師、社團、標籤與點擊跳轉連結的卡片；非開車頻道則僅貼出原始網址。*`,
          inline: false
        }
      )
      .setFooter({ text: '點擊下方按鈕以切換設定 • 僅限管理員操作' })
      .setTimestamp()

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('settings_twitter_toggle')
        .setLabel(`推特置換：${isTwitterEnabled ? '已開啟' : '已關閉'}`)
        .setStyle(isTwitterEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
        .setEmoji('✖️'),
      new ButtonBuilder()
        .setCustomId('settings_nsfw_toggle')
        .setLabel(`本子預覽：${isNsfwEnabled ? '已開啟' : '已關閉'}`)
        .setStyle(isNsfwEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
        .setEmoji('🔞')
    )

    return { embeds: [embed], components: [row] }
  }

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

    const payload = this.createSettingsPayload(message.guild.id)
    await message.reply(payload)
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

    const payload = this.createSettingsPayload(interaction.guildId)
    await interaction.reply(payload)
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

    if (interaction.customId === 'settings_twitter_toggle') {
      const current = getTwitterSetting(guildId)
      setTwitterSetting(guildId, !current)
    } else if (interaction.customId === 'settings_nsfw_toggle') {
      const current = getNsfwSetting(guildId)
      setNsfwSetting(guildId, !current)
    }

    const payload = this.createSettingsPayload(guildId)
    await interaction.update(payload)
  }
}

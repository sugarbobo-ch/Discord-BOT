import {
  Message,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  MessageFlags
} from 'discord.js'
import { Command } from './command.interface'
import { CommandContext } from '../utils/context'
import { addForbiddenWord, removeForbiddenWord, getForbiddenWords } from '../utils/db'

export class AutoModCommand implements Command {
  public names = ['automod', '禁用詞']

  public slashData = {
    name: 'automod',
    description: '管理此伺服器的自動模組 (AutoMod) 禁用詞語設定',
    options: [
      {
        name: '新增',
        description: '新增禁用詞語 (僅限管理員)',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: '詞語',
            description: '要禁用的詞語內容',
            type: 3, // STRING
            required: true
          }
        ]
      },
      {
        name: '移除',
        description: '移除禁用詞語 (僅限管理員)',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: '詞語',
            description: '要移除的禁用詞語內容',
            type: 3, // STRING
            required: true
          }
        ]
      },
      {
        name: '列表',
        description: '列出此伺服器目前所有的禁用詞語',
        type: 1 // SUB_COMMAND
      }
    ]
  }

  public async execute(message: Message, args: string[]): Promise<void> {
    const ctx = new CommandContext(message)
    const permissions = ctx.member?.permissions
    if (
      !permissions ||
      (!permissions.has(PermissionFlagsBits.ManageGuild) &&
        !permissions.has(PermissionFlagsBits.Administrator))
    ) {
      await ctx.reply('❌ 只有管理員或擁有「管理伺服器」權限的使用者才能設定禁用詞語。')
      return
    }

    const action = args[0]
    if (action === '新增') {
      const word = args.slice(1).join(' ').trim()
      if (!word) {
        await ctx.reply('❌ 請提供要禁用的詞語。格式：!automod 新增 [詞語]')
        return
      }
      addForbiddenWord(ctx.guildId!, word)
      await ctx.reply(`✅ 已成功新增禁用詞語：\`${word}\``)
    } else if (action === '移除') {
      const word = args.slice(1).join(' ').trim()
      if (!word) {
        await ctx.reply('❌ 請提供要移除的禁用詞語。格式：!automod 移除 [詞語]')
        return
      }
      removeForbiddenWord(ctx.guildId!, word)
      await ctx.reply(`✅ 已成功移除禁用詞語：\`${word}\``)
    } else if (action === '列表') {
      const words = getForbiddenWords(ctx.guildId!)
      if (words.length === 0) {
        await ctx.reply('ℹ️ 目前此伺服器尚未設定任何禁用詞語。')
      } else {
        await ctx.reply(`📋 目前的禁用詞語列表：\n${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}`)
      }
    } else {
      await ctx.reply('ℹ️ 未知的操作。格式：\n• `!automod 新增 [詞語]`\n• `!automod 移除 [詞語]`\n• `!automod 列表`')
    }
  }

  public async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const ctx = new CommandContext(interaction)
    const permissions = interaction.memberPermissions
    if (
      !permissions ||
      (!permissions.has(PermissionFlagsBits.ManageGuild) &&
        !permissions.has(PermissionFlagsBits.Administrator))
    ) {
      await interaction.reply({
        content: '❌ 只有管理員或擁有「管理伺服器」權限的使用者才能設定禁用詞語。',
        flags: MessageFlags.Ephemeral
      })
      return
    }

    const subcommand = interaction.options.getSubcommand()
    if (subcommand === '新增') {
      const word = interaction.options.getString('詞語', true).trim()
      addForbiddenWord(ctx.guildId!, word)
      await interaction.reply({
        content: `✅ 已成功新增禁用詞語：\`${word}\``,
        flags: MessageFlags.Ephemeral
      })
    } else if (subcommand === '移除') {
      const word = interaction.options.getString('詞語', true).trim()
      removeForbiddenWord(ctx.guildId!, word)
      await interaction.reply({
        content: `✅ 已成功移除禁用詞語：\`${word}\``,
        flags: MessageFlags.Ephemeral
      })
    } else if (subcommand === '列表') {
      const words = getForbiddenWords(ctx.guildId!)
      if (words.length === 0) {
        await interaction.reply({
          content: 'ℹ️ 目前此伺服器尚未設定 any 禁用詞語。',
          flags: MessageFlags.Ephemeral
        })
      } else {
        await interaction.reply({
          content: `📋 目前的禁用詞語列表：\n${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}`,
          flags: MessageFlags.Ephemeral
        })
      }
    }
  }
}

import { 
  Message, 
  ChatInputCommandInteraction, 
  Guild, 
  TextBasedChannel, 
  User, 
  GuildMember
} from 'discord.js'

export class CommandContext {
  public message: Message | null = null
  public interaction: ChatInputCommandInteraction | null = null

  constructor(target: Message | ChatInputCommandInteraction) {
    if ('commandName' in target) {
      this.interaction = target as ChatInputCommandInteraction
    } else {
      this.message = target as Message
    }
  }

  get isInteraction(): boolean {
    return this.interaction !== null
  }

  get guild(): Guild | null {
    return this.interaction ? this.interaction.guild : this.message ? this.message.guild : null
  }

  get guildId(): string | null {
    if (this.interaction) return this.interaction.guildId
    if (this.message) return this.message.guildId || this.message.guild?.id || null
    return null
  }

  get channel(): TextBasedChannel | null {
    return this.interaction ? this.interaction.channel : this.message ? this.message.channel : null
  }

  get user(): User {
    return this.interaction ? this.interaction.user : this.message!.author
  }

  get member(): GuildMember | null {
    return (this.interaction ? this.interaction.member : this.message?.member) as GuildMember | null
  }

  async reply(options: any): Promise<any> {
    if (this.interaction) {
      if (this.interaction.replied) {
        return await this.interaction.followUp(options)
      }
      if (this.interaction.deferred) {
        return await this.interaction.editReply(options)
      }
      return await this.interaction.reply(options)
    } else {
      if (this.message) {
        if (typeof this.message.reply === 'function') {
          return await this.message.reply(options)
        } else if (this.message.channel && typeof (this.message.channel as any).send === 'function') {
          return await (this.message.channel as any).send(options)
        }
      }
      return null
    }
  }

  async editReply(options: any): Promise<any> {
    if (this.interaction) {
      return await this.interaction.editReply(options)
    } else {
      return null
    }
  }

  async channelSend(options: any): Promise<any> {
    const chan = this.channel
    if (chan && 'send' in chan && typeof (chan as any).send === 'function') {
      return await (chan as any).send(options)
    }
    return null
  }
}

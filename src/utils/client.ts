import { Client } from 'discord.js'

class ClientManager {
  public client: Client | null = null
  public setClient(client: Client): void {
    this.client = client
  }
}

export const clientManager = new ClientManager()

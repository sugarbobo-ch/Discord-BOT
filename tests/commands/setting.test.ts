import { describe, test, expect, vi, beforeEach } from 'vitest'
import { SettingCommand } from '../../src/commands/setting'
import { getTwitterSetting, getNsfwSetting } from '../../src/utils/db'

vi.mock('../../src/utils/db', () => ({
  getTwitterSetting: vi.fn().mockReturnValue(true),
  getNsfwSetting: vi.fn().mockReturnValue(false),
  setTwitterSetting: vi.fn(),
  setNsfwSetting: vi.fn()
}))

describe('SettingCommand Tests', () => {
  let settingCommand: SettingCommand
  let mockMessage: any

  beforeEach(() => {
    vi.clearAllMocks()
    settingCommand = new SettingCommand()
    mockMessage = {
      guild: {
        id: 'test_guild_123'
      },
      member: {
        permissions: {
          has: vi.fn().mockReturnValue(true)
        }
      },
      reply: vi.fn().mockResolvedValue({})
    }
  })

  test('should generate settings payload with EmbedBuilder successfully without throwing', async () => {
    await settingCommand.execute(mockMessage, [])

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '🔧 機器人伺服器功能設定',
              color: 5793266 // 0x5865f2
            })
          })
        ]),
        components: expect.arrayContaining([
          expect.any(Object)
        ])
      })
    )
  })
})

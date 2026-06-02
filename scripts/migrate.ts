import fs from 'fs'
import path from 'path'
import { getDb } from '../src/utils/db'

async function migrate() {
  console.log('Starting migration to SQLite...')
  const db = getDb()

  const configDir = path.join(process.cwd(), 'config')
  const serversListPath = path.join(configDir, 'servers.json')

  if (!fs.existsSync(serversListPath)) {
    console.log('No servers.json found. Skipping migration.')
    return
  }

  try {
    const serversContent = fs.readFileSync(serversListPath, 'utf8')
    const serversList: string[] = JSON.parse(serversContent)

    if (!Array.isArray(serversList)) {
      console.error('Invalid servers.json format. Expected array of strings.')
      return
    }

    const insertServer = db.prepare('INSERT OR IGNORE INTO servers (server_id) VALUES (?)')
    const insertCommand = db.prepare(
      'INSERT OR REPLACE INTO commands (server_id, name, response) VALUES (?, ?, ?)'
    )

    for (const serverId of serversList) {
      console.log(`Migrating server: ${serverId}`)
      insertServer.run(serverId)

      const serverJsonPath = path.join(configDir, 'servers', `${serverId}.json`)
      if (fs.existsSync(serverJsonPath)) {
        const cmdContent = fs.readFileSync(serverJsonPath, 'utf8')
        try {
          const cmdDict: Record<string, string> = JSON.parse(cmdContent)
          let count = 0
          for (const [name, response] of Object.entries(cmdDict)) {
            insertCommand.run(serverId, name, response)
            count++
          }
          console.log(`  Successfully migrated ${count} commands.`)
        } catch (err: any) {
          console.error(`  Error parsing commands JSON for server ${serverId}:`, err.message)
        }
      } else {
        console.log(`  No commands file found for server ${serverId}.`)
      }
    }

    console.log('Migration to SQLite completed successfully!')
  } catch (error: any) {
    console.error('Migration failed:', error.message)
  } finally {
    process.exit(0)
  }
}

migrate()

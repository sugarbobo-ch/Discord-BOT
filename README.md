# Discord-BOT
A customize Discord BOT for adding commands and random images 

## Setup
It is recommended to use Node.js 16 or newer (fully compatible with Node 18, 20, 22).

### Installation
Due to `ignore-scripts=true` in `\.npmrc`, you must install with `--ignore-scripts=false` to compile the native SQLite module:
```bash
npm install --legacy-peer-deps --ignore-scripts=false
```

### Setup Files
1. `config/auth.json`
```json
{
  "token": "<YOUR_TOKEN>",
  "backupChannelId": "<MESSAGE_BACKUP_CHANNELID>",
  "geminiApiKey": "<YOUR_GEMINI_API_KEY>",
  "chatMemoryLimit": 10
}
```

2. **Database Setup / Migration**
- **New setup**: The SQLite database will be initialized automatically in `config/bobo.db` upon starting.
- **Migration (upgrading from old JSON storage)**: Put your old `config/servers.json` and `config/servers/*.json` in place, then run:
```bash
npm run migrate
```

### Deploy
```bash
npm run build
npm start
```

## Usage
To prevent someone from sharing the BOT link without consent, use `!reset server` for the first time invite BOT to your server.

Use `!` as command prefix.

There are several features in this BOT:
1. **Customize commands**, including using `{}` as parameter in response message: `!add {command} {responseMessage}`, `!edit {command} {responseMessage}`, `!remove {command}`. And `@` can be a command response if you mention someone.
2. **Random images/media pick**: `!add {folderName} 隨機圖片`, `!addimg {folderName} {imageUrl}`, `!{folderName}`, `!delimg {folderName} {imageUrl}`.
3. **Repeat message**: 5 times same messages in same channel BOT will repeat it.
4. **Rollcall**: `!開始點名`, `!點名`, `!結束點名`, `!點名清單`.
5. **Lottery**: `!開始抽獎 {name} {minutes}`, `!抽獎`, `!開獎`, `!開非洲獎`, `!結束抽獎`...
6. **NSFW, links, image detected**: `#228922`, `!god 228922`, `!nsfw {url}`, `!神的語言`.
7. **Gemini AI Chat (`!bobo`)**: Chat with Bobo, a humorous, friendly bot assistant with built-in channel-based chat memory. The newer messages are given higher weights (up to 1.00) and relative timestamps to contextualize the dialogue. Includes rate limits (5s) and prompt injection safety.
8. **NSFW Image Check via Gemini**: In non-NSFW channels, `!addimg` automatically triggers Gemini Multimodal check. If the image is NSFW, it gets rejected and deleted.
9. **AI Typo Roast**: Detects common typos like `"因該"`, `"以經"`, `"部會"`, `"絕得"`, `"在一次"` and uses Gemini to roast the user in a humorous way.
10. **Auto-fix Twitter/X.com links**: When an `x.com` link is posted, the bot waits 3 seconds. If no preview embed is generated, it automatically sends a corrected link using `fixvx.com` to the same channel.


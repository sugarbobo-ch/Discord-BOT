# Discord-BOT
A custom Discord BOT for adding custom commands, random images, AI chat, stock analysis, and NSFW features.

## Setup
It is recommended to use **Node.js 22.5.0 or newer** (fully compatible with Node 23) as the bot relies on the built-in native `node:sqlite` module.

### Installation
Simply install dependencies using npm:
```bash
npm install --legacy-peer-deps
```

### Setup Files
1. **`config/auth.json`**
Initialize your bot credentials in `config/auth.json`. You can configure a single Gemini API key or set up multiple keys for automatic rate limit rotation and fallback:
```json
{
  "token": "<YOUR_TOKEN>",
  "backupChannelId": "<MESSAGE_BACKUP_CHANNELID>",
  "geminiApiKey": "<YOUR_PRIMARY_GEMINI_API_KEY>",
  "geminiApiKeyNew": "<YOUR_SECONDARY_GEMINI_API_KEY>",
  "geminiApiKeys": [
    "<ADDITIONAL_GEMINI_API_KEY_1>",
    "<ADDITIONAL_GEMINI_API_KEY_2>"
  ],
  "chatMemoryLimit": 10
}
```
*Tip: You can also define Gemini API keys via environment variables using `GEMINI_API_KEY` or `GEMINI_API_KEYS` (comma-separated).*

2. **Database Setup / Migration**
- **New setup**: The SQLite database will be initialized automatically in `config/bobo.db` upon starting.
- **Migration (upgrading from old JSON storage)**: Place your old `config/servers.json` and `config/servers/*.json` in place, then run:
```bash
npm run migrate
```

### Deploy
Build the TypeScript code and start the bot:
```bash
npm run build
npm start
```
For development mode with hot-reloading:
```bash
npm run dev
```

## Usage
To prevent unauthorized bot usage when inviting it to your server, run `!reset server` the first time you invite the bot.

Use `!` or `！` as the command prefix.

### Available Features:
1. **Custom Commands**: Member-added commands stored in SQLite. Features parameter interpolation (`{}`): `!add {command} {responseMessage}`, `!edit {command} {responseMessage}`, `!remove {command}`. Supports mentioning users using `@`.
2. **Random Image/Media Pools**: Create random image pools: `!add {folderName} 隨機圖片` (creates folder in `assets/images/{folderName}`), `!addimg {folderName} {imageUrl}`, `!{folderName}` (triggers random image), `!delimg {folderName} {filename}`.
3. **Repeat message**: Repeats message if the same message is sent 5 times consecutively within 10 minutes in a channel.
4. **Roll Call (點名)**: Group roll call commands: `!開始點名`, `!點名 [備註]`, `!結束點名` (requires 3 votes to end), `!點名清單`.
5. **Lottery (抽獎)**: Event giveaways: `!開始抽獎 {標題} {時間(分鐘)}`, `!抽獎`, `!開獎 {中獎人數}`, `!結束抽獎`, `!強制結束抽獎`.
6. **NSFW Media Scraper Embeds**: Automatically fetches metadata and builds rich embeds in NSFW channels for links from:
   - **E-Hentai / ExHentai** (via official JSON API)
   - **Wnacg 紳士漫畫** (HTML scraper)
   - **18Comic 禁漫天堂** (automatically cycles mirror domains to bypass DNS blocks)
   - **Happymh 嗨皮漫畫** (bypasses 403 Forbidden blocks using a Google Translate proxy)
7. **Gemini AI Chat (`!bobo`)**: Driven by Google's `gemma-4-31b-it` model. Supports multimodal input (images + text), channel-based chat history context memory (time-decay weighted), automatic LaTeX formula formatting to plain Markdown, user context separation, and safety filters.
8. **Gemini Key Rotation**: Automatically cycles between multiple Gemini API keys. In case of `429 Resource Exhausted`, `403`, or `401` errors, the key goes on a 5-minute cooldown and falls back to other available keys.
9. **Real-time Stock Analysis**: Integrates `yahoo-finance2`.
   - **AI Integration**: When a user mentions a stock ticker (e.g. `2330.TW`, `AAPL`) or common nicknames (e.g. `發哥`, `西瓜`, `公公`) in AI chat, real-time market metrics are queried and injected into Gemini's system instructions. The AI switches to an investment analyst persona.
   - **Direct Query Command**: Use `!stock [ticker/name]` (e.g., `!stock 2330`, `!stock 美光`, `!stock 華通`) to directly fetch the current price, percentage change, day high/low, volume, and automatic K-line chart (last 30 days) from Yahoo Finance.
10. **NSFW Image Check via Gemini**: In non-NSFW channels, `!addimg` automatically triggers a Gemini Multimodal safety check. NSFW images are rejected and deleted automatically.
11. **AI Typo Roast**: Detects common typos (`"因該"`, `"以經"`, `"部會"`, `"絕得"`, `"在一次"`) and uses Gemini to roast the user in a humorous way.
12. **Auto-fix Twitter/X.com links**: Replaces `x.com` links with `fixvx.com` if Discord fails to generate an embed preview within 3 seconds. Can be enabled/disabled per-server via the `!設定` command or `/設定` slash command.
13. **Features Guide Command**: Use `!功能` / `!features` or the `/功能` slash command to display a beautifully structured list of all available features and commands.

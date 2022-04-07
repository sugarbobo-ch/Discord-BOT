# Discord-BOT
A customize Discord BOT for adding commands and random images 

## Setup
It's recommanded to use Node.js 14.

### Installation
```
yarn install
```

### Setup json files
1. `config/auth.json`
```
{
  "token": <YOUR_TOKEN>,
  "backuphannelId": <MESSAGE_BACKUP_CHANNELID>
}
```
2. `config/servers.json`

```
["<SERVER_ID_1>", "SERVER_ID_2"]
```

### Deploy
```
yarn start
```

## Usage
To prevent someone from sharing the BOT link without consent, use `!reset server` for the first time invite BOT to your server.

Use `!` as command prefix.

There are serveral features in this BOT:
1. Customize commands, including using `{}` as parameter in response message: `!add {command} {responseMessage}`, `!edit {command} {responseMessage}`, `!remove  {command}`. And `@` can be a command response if you mention someone
2. Ramdom images/media pick: `!add {folderName} 隨機圖片`, `!addimg {folderName} {imageUrl}`, `!{folderName}`, `!delimg {folderName} {imageUrl}`
3. Repeat messeage: 5 times same messages in same chaneel BOT will reapeat it.
4. Rollcall: `!開始點名`, `!點名`, `!結束點名`, `!點名清單`
5. Lottery: `!開始抽獎 {name} {minutes}`, `!抽獎`, `!開獎`, `!開非洲獎`, `!結束抽獎`...
6. NSFW, links, image detected...: `#228922`, `!god 228922`, `!nsfw {url}`, `!神的語言`

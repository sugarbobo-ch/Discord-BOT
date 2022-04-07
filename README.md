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

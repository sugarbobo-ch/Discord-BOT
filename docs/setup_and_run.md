# 🚀 BoboBot 本地安裝與運行指南 (不使用 Docker)

本文件引導您如何在本地環境（Windows / macOS / Linux）手動配置與運行 BoboBot，**不使用 Docker**。

---

## 1. 📋 準備環境與相容性說明

由於已將本地 TensorFlow 等原生編譯依賴移除，本專案的環境要求極為寬鬆：

* **Node.js 版本**: 建議使用最新的 **Node.js LTS 版本**（如 Node 18, Node 20 或 Node 22 均可相容）。不再受到舊 Node 14 版本的相容性拘束。

---

## 2. ⚙️ 配置檔案與資料夾結構

在啟動專案前，必須建立好以下設定檔。

### 步驟 A. 檢查或建立必要的目錄
確保專案根目錄下存在以下資料夾：
* `config/servers/`
* `assets/images/`
* `assets/media/`

### 步驟 B. 配置 `config/auth.json`
在 `config/` 資料夾下建立 `auth.json`，並填入以下內容：
```json
{
  "token": "你的_DISCORD_BOT_TOKEN",
  "backupChannelId": "你的_備份頻道_ID"
}
```
* **token**: 前往 [Discord Developer Portal](https://discord.com/developers/applications) 建立您的 Bot，並複製 Token。
* **backupChannelId**: 用於備份日誌的文字頻道 ID。

### 步驟 C. 配置 `config/servers.json`
在 `config/` 資料夾下建立 `servers.json`，並填入一個空陣列（讓機器人在加入新伺服器時有地方儲存 ID）：
```json
[]
```

---

## 3. 📦 安裝依賴與運行

### 步驟 1. 安裝套件
使用 yarn 或 npm 安裝專案依賴：
```bash
# 使用 yarn 安裝
yarn install

# 或者使用 npm 安裝
npm install
```

### 步驟 2. 開啟 Discord Bot 的 Privileged Intents
在 Discord Developer Portal 中，找到您的應用程式，並至 **Bot** 頁面：
1. 開啟 **PRESENCE INTENT**
2. 開啟 **SERVER MEMBERS INTENT**
3. 開啟 **MESSAGE CONTENT INTENT** (⚠️ **極重要**：因為本專案使用 `!` prefix，必須啟用此 Intent 機器人才能讀取訊息內容)。
4. 儲存設定。

### 步驟 3. 啟動機器人

* **開發模式** (使用 `nodemon` 自動偵測程式碼變更重啟)：
  ```bash
  npm run dev
  # 或
  yarn dev
  ```

* **生產/運行模式**：
  ```bash
  npm start
  # 或
  yarn start
  ```

### 步驟 4. 執行單元測試 (Unit Tests)

本專案使用 **Vitest** 作為單元測試框架，可進行本地純邏輯驗證（無需 Discord 伺服器連線）：

* **執行單次測試**（用於部署前或 CI 驗證）：
  ```bash
  npm test
  # 或
  yarn test
  ```

* **執行持續監聽測試**（開發重構時，自動偵測變更並重測）：
  ```bash
  npm run test:watch
  # 或
  yarn test:watch
  ```

---

## 🛠️ 常見問題排查 (Troubleshooting)

### Q1. 機器人啟動了，但輸入 `!` 指令沒有任何反應？
* **原因**：Discord Bot 的 **Message Content Intent** 未啟用，或者 Bot 沒有在該頻道的「讀取訊息歷史」與「發送訊息」權限。
* **解決方法**：
  1. 檢查 Discord Developer Portal 中的 Message Content Intent 是否為啟用狀態。
  2. 檢查機器人在伺服器中的角色權限，確保其擁有該頻道的發言與讀取權限。

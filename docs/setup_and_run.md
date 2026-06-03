# 🚀 BoboBot 本地安裝與運行指南 (不使用 Docker)

本文件引導您如何在本地環境（Windows / macOS / Linux）手動配置與運行 BoboBot，**不使用 Docker**。

---

## 1. 📋 準備環境與相容性說明

由於本專案已遷移至原生 `node:sqlite` 模組，對環境與 Node 版本有以下硬性要求：

* **Node.js 版本**: 必須使用 **Node.js 22.5.0 或更新版本**（支援內建的 `DatabaseSync`）。不相容於低於 Node 22.5 的舊版本。
* **原生模組編譯**: 不再需要安裝任何外部 C++ 編譯器或 Python 環境來編譯 SQLite，因為專案改為調用 Node.js 核心內建的 SQLite 支援。

---

## 2. ⚙️ 配置檔案與資料夾結構

在啟動專案前，必須建立好以下設定檔。

### 步驟 A. 檢查或建立必要的目錄
確保專案根目錄下存在以下資料夾（啟動時若無會自動建立）：
* `config/`
* `assets/images/`
* `assets/media/`

### 步驟 B. 配置 `config/auth.json`
在 `config/` 資料夾下建立 `auth.json`，並填入以下內容：
```json
{
  "token": "你的_DISCORD_BOT_TOKEN",
  "backupChannelId": "你的_備份頻道_ID",
  "geminiApiKey": "你的_主要_GEMINI_API_KEY",
  "geminiApiKeyNew": "你的_次要_GEMINI_API_KEY_可選",
  "geminiApiKeys": [
    "可選_額外_GEMINI_API_KEY_1",
    "可選_額外_GEMINI_API_KEY_2"
  ],
  "chatMemoryLimit": 10
}
```
* **token**: 前往 [Discord Developer Portal](https://discord.com/developers/applications) 建立您的 Bot，並複製 Token。
* **backupChannelId**: 用於備份日誌的文字頻道 ID。
* **geminiApiKey / geminiApiKeyNew / geminiApiKeys**: 填入前往 Google AI Studio 申請的 Gemini API Key。支援設置單一或多個 Key 作為負載均衡與限流自動輪詢 (Key Rotation)。您也可以使用環境變數 `GEMINI_API_KEY` 或 `GEMINI_API_KEYS` (逗號分隔) 來傳遞 API Key。
* **chatMemoryLimit**: 設定 AI 聊天讀取的頻道歷史訊息數量上限，預設為 `10`。

### 步驟 C. 建立/遷移 SQLite 資料庫
本專案已使用內建的 `node:sqlite` 作為儲存媒介。

* **如果是全新的部署**：啟動 Bot 時會自動在 `config/bobo.db` 建立 SQLite 資料表，不需手動處理。
* **如果是從舊版 JSON 升級**：請確保您的舊 `config/servers.json` 與 `config/servers/*.json` 檔案在 `config/` 資料夾下，並在依賴安裝完成後執行遷移指令：
  ```bash
  npm run migrate
  ```

---

## 3. 📦 安裝依賴與運行

### 步驟 1. 安裝套件
由於不需要編譯外部 SQLite 模組，不需要再使用特殊的 `--ignore-scripts=false` 參數。直接進行標準安裝即可：

* **使用 npm 安裝 (推薦)**：
  ```bash
  npm install --legacy-peer-deps
  ```

* **使用 yarn 安裝**：
  ```bash
  yarn install
  ```

### 步驟 2. 開啟 Discord Bot 的 Privileged Intents
在 Discord Developer Portal 中，找到您的應用程式，並至 **Bot** 頁面：
1. 開啟 **PRESENCE INTENT**
2. 開啟 **SERVER MEMBERS INTENT**
3. 開啟 **MESSAGE CONTENT INTENT** (⚠️ **極重要**：因為本專案使用 `!` 前綴，必須啟用此 Intent 機器人才能讀取訊息內容)。
4. 儲存設定。

### 步驟 3. 啟動機器人

* **開發模式** (使用 `tsx watch` 自動偵測 TypeScript 程式碼變更並重啟)：
  ```bash
  npm run dev
  # 或
  yarn dev
  ```

* **生產/運行模式**：
  ```bash
  npm run build
  npm start
  ```

### 步驟 4. 執行單元測試 (Unit Tests)

本專案使用 **Vitest** 作為單元測試框架，可進行本地純邏輯驗證：

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

### Q1. 機器人啟動時拋出 `Failed to load native node:sqlite` 或 `DatabaseSync` 找不到的錯誤？
* **原因**：您目前運行的 Node.js 版本低於 `22.5.0`。
* **解決方法**：請升級您的 Node.js 環境。您可以在終端機輸入 `node -v` 確認版本，並至 [Node.js 官網](https://nodejs.org/) 下載安裝最新的 Node.js 22 (LTS) 或者是 Node.js 23。

### Q2. 機器人啟動了，但輸入 `!` 指令沒有任何反應？
* **原因**：Discord Bot 的 **Message Content Intent** 未啟用，或者 Bot 沒有在該頻道的「讀取訊息歷史」與「發送訊息」權限。
* **解決方法**：
  1. 檢查 Discord Developer Portal 中的 Message Content Intent 是否為啟用狀態。
  2. 檢查機器人在伺服器中的角色權限，確保其擁有該頻道的發言與讀取權限。

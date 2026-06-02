# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# 複製 package 檔案並安裝所有依賴（含 devDependencies）
COPY package.json package-lock.json ./
RUN npm ci

# 複製原始碼並編譯 TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npx tsc

# ---- Production Stage ----
FROM node:22-alpine

WORKDIR /app

# 只安裝 production 依賴
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 從 build stage 複製編譯後的 JS
COPY --from=builder /app/dist ./dist

# config 和 assets 目錄透過 volume 掛載，這裡只建立目錄結構
RUN mkdir -p config assets/images assets/media

# node:sqlite 是實驗功能，需要此 flag
ENV NODE_OPTIONS="--experimental-sqlite"

CMD ["node", "dist/src/index.js"]

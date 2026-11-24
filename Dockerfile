# FlipDoc 轻翻 · 生产级镜像（含 Node 24 + LibreOffice + 免费开源中文字体）
# 适用于 Railway / Hugging Face Spaces / Zeabur / Fly.io / 任意国内云服务器

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/sync-pdf-assets.mjs && npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app

# 安装轻量 LibreOffice（用于 Word/PPTX 高保真还原）与思源/文泉驿中文字体
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-impress \
    libreoffice-common \
    fonts-noto-cjk \
    fonts-wqy-zenhei \
    ca-certificates \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV FLIPDOC_DATA_DIR=/app/data

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /app/data/uploads

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["npm", "run", "start"]

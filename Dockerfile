# syntax=docker/dockerfile:1
#
# 基础镜像：node:jod-alpine（Node.js 22 "Jod" LTS + Alpine Linux）
# 需要锁死到某个具体镜像时，换成带 digest 的写法：
#   FROM node:jod-alpine@sha256:2c752226d477b4a886378baa95b9af252be59301b725fdb0b7e15208131505a8

# ---------- 构建阶段：全量依赖 + 构建前端 ----------
FROM node:jod-alpine AS build

WORKDIR /app
# corepack 按 package.json 的 packageManager 字段拉取对应版本的 pnpm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ---------- 运行阶段：只留生产依赖 + 构建产物 ----------
FROM node:jod-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm

# vue / vite / naive-ui 等只在构建期需要，运行期只有 express
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY server ./server
COPY shared ./shared
COPY --from=build /app/web/dist ./web/dist

# db.json 与 .session-secret 都写在数据目录，以非 root 的 node 用户运行
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3456
CMD ["node", "server/index.js"]

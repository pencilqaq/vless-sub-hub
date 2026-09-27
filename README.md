# VLESS 订阅中心（vless-sub-hub）

> 自建 VLESS(WS+TLS+Cloudflare CDN) 优选 IP 订阅生成与分享服务 · Node + Vue3 + Naive UI

把 3x-ui 导出的 VLESS(WS + TLS + Cloudflare CDN) 链接，按你测速得到的多个优选 IP 批量生成节点，
并作为可公开分享的订阅地址提供给各类客户端（v2rayN / Shadowrocket / Clash / mihomo / sing-box 等）。

- 前端：Vue 3 + Naive UI + Vite
- 后端：Node.js + Express（ESM）
- 存储：本地 JSON 文件（`data/db.json`），无需数据库
- 认证：登录后才能管理订阅；订阅分享地址是随机长令牌，可随时重置

## 功能

1. 多订阅管理：新建 / 编辑 / 删除 / 启用停用，数量不限
2. IP 批量替换：只改地址与端口，`sni`、`host`、`path`、`fp`、`encryption` 等参数原样保留
3. 地址行写法：`IP`、`IP:端口`、`[IPv6]:端口`、`域名:端口`，也可以直接粘贴网址（如 `https://speed.example.com:8443/ws`，自动取主机与端口，并去掉路径、查询串与 `user@` 前缀）；行尾可用 `#`、空格、逗号或 `|` 加备注；相同“主机:端口”自动去重
4. 额外端口组合：一个 IP 可自动展开成多个端口（如 `443,2053,2087,8443`）
5. 节点名模板：模板输出即最终节点名，会覆盖链接里 `#` 后的原备注（客户端显示的就是它）；默认 `{ip}-{port}`，可用占位符 `{name}`(原备注) `{remark}`(IP 行备注) `{ip}` `{port}` `{index}` `{domain}`
6. 参数批量替换：一次修改所有生成链接的查询参数（如 `sni`、`host`、`path`、`fp`、`alpn`），每行 `key=value`，值留空表示删除该参数；也可一键填入原链接参数再改
7. Clash 分流：可输出含策略组与规则的**完整 config**，内置基础分流、Loyalsoldier/clash-rules、blackmatrix7/ios_rule_script 三种预设，并支持追加自定义规则
6. 实时预览：编辑时立刻看到生成结果、警告与节点数
7. 订阅分享：每个订阅一个独立地址 `https://你的域名/sub/<token>`，可重置、可停用，带二维码与拉取次数统计
8. 输出格式：Base64 通用订阅、明文链接、Clash/mihomo YAML、sing-box outbounds JSON
9. 自动识别客户端：按 User-Agent 判断（Clash 返回 YAML，sing-box 返回 JSON，其它返回 Base64），也可用 `?format=` 强制指定

## 目录结构

```
vless-sub-hub/
├─ server/                 Node 后端
│  ├─ index.js             入口与全部 HTTP 路由
│  ├─ config.js            .env 读取与配置校验
│  ├─ auth.js              scrypt 口令、会话令牌、限流、CSRF/IP 校验
│  ├─ store.js             JSON 数据存储（原子写入）
│  └─ hash-password.js     生成 APP_PASSWORD_HASH 的小工具
├─ shared/
│  └─ vless.js             VLESS 链接生成核心（前后端共用）
├─ web/                    Vue 3 + Naive UI 前端
│  ├─ index.html
│  ├─ vite.config.js
│  └─ src/
│     ├─ main.js  App.vue  router.js  api.js  session.js  clipboard.js  styles.css
│     ├─ views/LoginView.vue  views/DashboardView.vue
│     └─ components/SubscriptionEditModal.vue  components/ShareModal.vue
├─ data/                   运行后生成（db.json、.session-secret），请勿提交
├─ .env.example
└─ package.json
```

## 快速开始

要求 Node.js 18.17 以上，使用 pnpm 管理依赖（首次使用先执行 `corepack enable pnpm`，或 `npm i -g pnpm`）。

```bash
pnpm install
cp .env.example .env            # Windows: copy .env.example .env
pnpm run hash "你的登录密码"      # 复制输出的 APP_PASSWORD_HASH 填进 .env
pnpm run build                   # 构建前端到 web/dist
pnpm start                       # 启动，默认 http://localhost:3000
```

开发模式（一个终端，前后端同时启动）：

```bash
pnpm run dev                     # 同时启动前后端（端口取自 .env，代理自动跟随）
```

## Clash 分流规则

> 规则集的目标策略组可以是自建策略组，也可以直接用内置策略 `DIRECT` / `REJECT` / `PASS`（这三个名称不允许再被创建为策略组）。
> 采用「策略组 + 规则集」模式：策略组（proxy-groups）与规则集（rule-providers / 内联规则）都在「规则管理」页面维护，
> 每个规则集指定目标策略组，订阅里选择引用哪些策略组与规则集；内置预设通过「导入预设规则集」变成可编辑的规则集。

在订阅编辑弹窗的「Clash / mihomo 订阅」里选择输出方式：

- **仅 proxies 片段**：只输出 `proxies:`，自己维护 config 时用
- **完整配置**：输出可直接使用的 config，含 8 个策略组（🚀 节点选择 / ♻️ 自动选择 / 📺 媒体 / 🤖 AI / 📱 社交 / 🎯 全球直连 / 🛑 广告拦截 / 🐟 漏网之鱼）与分流规则

分流规则预设：

| 预设 | 说明 |
| --- | --- |
| 基础分流 | 内置规则（私有地址与 CN 直连、常见广告域名拦截、其余走代理），不依赖外部文件 |
| Loyalsoldier/clash-rules | 通过 jsdelivr 拉取 reject/private/direct/proxy/gfw/lancidr 等规则集 |
| blackmatrix7/ios_rule_script | 分类最细，含 Netflix/YouTube/OpenAI/Telegram 等 19 个分类，路由到 📺 媒体 / 🤖 AI / 📱 社交 等策略组 |
| 仅自定义规则 | 只用你自己写的规则 |

自定义规则每行一条，会插入在最终的 `MATCH` 之前，例如：

```
DOMAIN-SUFFIX,example.com,🚀 节点选择
IP-CIDR,1.2.3.0/24,🎯 全球直连,no-resolve
```

> 两个外部预设需要客户端能访问 `cdn.jsdelivr.net`；拉取失败会在客户端报 `rule-providers` 加载错误，此时改用"基础分流"或自定义规则即可。

## 规则管理（自定义规则集）

「规则管理」页面可以维护多个规则集，供任意订阅引用：

- **远程链接**：填一个 mihomo rule-provider 的 URL，选择 `behavior`（classical / domain / ipcidr）与更新间隔；生成配置时写入 `rule-providers`，并用 `RULE-SET` 引用。页面上的「测试链接」会让服务端实际拉取一次，确认可达并给出行数与示例。
- **自己创建**：直接在页面里写规则，每行一条；只写两段（如 `DOMAIN-SUFFIX,example.com`）会自动补上该规则集的目标策略组，写全的（`...,DIRECT`）原样保留。

在订阅编辑页的「引用规则集」里多选即可，顺序即优先级，且**先于**预设规则生效。

规则管理页右上角支持 **导出配置 / 导入配置**（JSON）：导出只包含策略组与规则集，不含订阅与分享令牌；
导入时可选"跳过同名项"或"覆盖同名项"，导出文件也可以直接手写或分享给朋友。

安全方面：服务端拉取链接时会拒绝内网/本机地址（自建规则镜像可在 `.env` 设置 `ALLOW_PRIVATE_RULE_URLS=true` 放开），并限制 15 秒超时与 5MB 体积。

### 生产部署

```bash
pnpm install        # 与构建在同一台机器时
pnpm build          # 生成 web/dist（必须，否则 3456 只会提示"前端尚未构建"）
pnpm start          # 只监听 SERVER_PORT，单进程同时提供页面 / API / 订阅
```

> `vue` / `naive-ui` / `vue-router` / `qrcode` 只在**构建期**使用，已放在 `devDependencies`；运行时后端只需要 `express`。
> 想精简服务器依赖可以用：构建机上 `pnpm install && pnpm build`，服务器上 `pnpm install --prod && pnpm start`。
> 注意 `pnpm verify` 系列自检需要 devDependencies（内部会调用 Vite 构建），不要在 `--prod` 环境里跑。

## 端口配置

在 `.env` 中分别设置前后端端口：

```ini
WEB_PORT=5173   # 前端端口，开发模式必填
SERVER_PORT=           # 后端端口；留空时自动使用 WEB_PORT + 1
```

- `pnpm dev` 启动前会校验：缺少 `WEB_PORT` 或端口非法会直接报错并说明原因。
- `SERVER_PORT` 留空（或删除该行）时后端端口 = `WEB_PORT + 1`，前端 `/api`、`/sub` 代理会自动指向它，不会写死 3000。
- 生产模式 `pnpm start` 只需要 `SERVER_PORT`；若都没设置则回退到 3000。

## 订阅地址格式

每个订阅在「分享」里都有独立地址：

```
https://你的域名/sub/<token>              # 默认：Base64 通用订阅
https://你的域名/sub/<token>?format=links   # 明文 VLESS 链接，每行一条
https://你的域名/sub/<token>?format=clash   # Clash / mihomo 的 proxies 片段
https://你的域名/sub/<token>?format=singbox # sing-box 的 outbounds 片段
```

地址中的 `<token>` 是 24 位随机串，重置后旧地址立即失效；把订阅开关关掉则返回 403。
`PUBLIC_BASE_URL` 建议设置为对外的正式地址，否则分享链接会按请求头推断。

## 安全方案（关于"账号密码放环境变量"）

把密码直接写在 `.env` 里能用，但一旦服务器被读文件、备份泄漏或误提交仓库，密码就是明文。
本项目默认采用下面这套做法，兼顾安全和易用：

1. 口令哈希：`.env` 里放 `APP_PASSWORD_HASH`（scrypt + 随机盐，单次派生 64 字节），
   服务端启动时用 `crypto.timingSafeEqual` 做恒定时间比较，明文密码不落盘。
   生成方式：`pnpm run hash "你的密码"`（不带参数则随机生成一个强密码）。
2. 会话令牌：登录成功后下发 HMAC-SHA256 签名的令牌，Cookie 带 `HttpOnly`、`SameSite=Lax`，
   通过 HTTPS 时再加上 `Secure`；密钥优先取 `SESSION_SECRET`，未配置则自动生成并保存到
   `data/.session-secret`（权限 0600）。修改 `SESSION_VERSION` 可一键踢掉所有登录态。
3. 登录限流：同一 IP + 用户名连续失败 5 次锁定 10 分钟，避免暴力破解。
4. CSRF 防护：非 GET 请求若带 `Origin`，必须与本站或 `PUBLIC_BASE_URL` 同源。
5. 可选 IP 白名单：`ALLOWED_IPS=1.2.3.4,10.0.0.0/8`，只允许这些来源调用管理接口。
6. 订阅地址与后台分离：`/sub/<token>` 无需登录即可拉取（这是分享的本质），但令牌可随时重置、
   可停用，并且只暴露生成后的节点，不泄露你的服务器信息。

想更进一步，推荐（按性价比排序）：

- 管理后台只走 HTTPS，并放在反代之后开启 `TRUST_PROXY=true`、`COOKIE_SECURE=true`
- 用 openresty / nginx 给 `/`（管理端）再加一层 `auth_basic` 或 IP 白名单，只让 `/sub` 公开
- 用 Cloudflare Access / Tailscale 之类把管理端限制在自己设备上
- 需要双因素时，可在 `server/auth.js` 的登录校验后追加一个 TOTP 校验（30 行左右，用内置 crypto 即可）

## 反向代理示例（openresty / nginx）

```nginx
server {
    listen 443 ssl http2;
    server_name sub.example.com;

    ssl_certificate     /path/fullchain.pem;
    ssl_certificate_key /path/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/login` | 登录，成功下发会话 Cookie |
| POST | `/api/logout` | 退出 |
| GET | `/api/session` | 查询登录状态 |
| GET | `/api/subscriptions` | 订阅列表（含生成统计） |
| POST | `/api/subscriptions` | 新建订阅 |
| PUT | `/api/subscriptions/:id` | 更新订阅 |
| DELETE | `/api/subscriptions/:id` | 删除订阅 |
| POST | `/api/subscriptions/:id/rotate` | 重置分享令牌 |
| POST | `/api/preview` | 即时预览生成的链接 |
| GET | `/api/subscriptions/:id/export?format=` | 导出指定格式 |
| GET | `/sub/:token` | 公开订阅（按 UA 或 `?format=` 输出） |

## 数据与备份

所有订阅保存在 `data/db.json`，原子写入；会话密钥在 `data/.session-secret`。
备份直接复制 `data/` 目录即可，注意该目录不要提交到公开仓库。

## 常见问题

- 生成的节点连不上：先确认原链接里有 `sni` 与 `host`（本方案两者都必须是你的域名）；
  编辑页会直接给出警告。另外确认端口在 Cloudflare 的 HTTPS 允许范围内（443/2053/2087/2096/8443）。
- 分享地址是 `http://内网IP` 之类：设置 `PUBLIC_BASE_URL=https://sub.example.com`。
- 登录后立刻掉线：检查 `COOKIE_SECURE=true` 时是否用 HTTPS 访问。
- 前端打不开：生产模式需要先 `pnpm run build`，否则 `pnpm start` 只会提示未构建。
- 开发模式报 `http proxy error / ECONNREFUSED 127.0.0.1:3000`：说明后端没起来。开发代理会自动读取 `.env`：`WEB_PORT` 为前端端口（必填），`SERVER_PORT` 为后端端口（留空则取 `WEB_PORT + 1`）；若提示 `EADDRINUSE`，说明该端口已被别的进程占用，换一个 `SERVER_PORT` 或先停掉占用进程。

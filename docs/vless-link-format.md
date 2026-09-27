# VLESS 分享链接（`vless://`）格式说明

> VLESS URI 不是 IETF 标准，而是 Xray-core / v2rayN / Shadowrocket / Clash.Meta 等客户端通用的**事实标准**：
> 把 Xray 的一段 outbound 配置压成一行 URI。不同客户端在冷门参数上会有差异，下面按主流实现整理。

## 1. 整体结构

```
vless://<uuid>@<host>:<port>?<参数>=<值>&<参数>=<值>...#<备注>
└──┬───┘└──┬──┘└──┬─┘└─┬──┘└──────────┬─────────────┘└──┬──┘
  协议   用户ID   地址   端口         查询参数          备注（URL 编码）
```

简化文法：

```
vless-uri = "vless://" uuid "@" host [":" port] ["?" query] ["#" fragment]
host      = domain / IPv4 / "[" IPv6 "]"
query     = param *( "&" param )
param     = key "=" value
```

规则要点：

- `port` 没有默认值，实际链接里一般显式写 `443`。
- IPv6 必须加中括号：`vless://uuid@[2606:4700::1]:443?...`。
- `#` 之后是节点备注（fragment），可以是任意字符串，只决定客户端里显示的节点名，不参与连接；本项目生成链接时会用"节点名模板"重新生成它，模板里不写 `{name}` 就不会带上原备注。
- 参数顺序无关；值里的 `&`、`#`、`/`、空格等必须 URL 编码（例如 `/ws` → `%2Fws`）。
- UUID 是 VLESS 的“用户 ID”。Xray 也允许 ≤30 字节的任意字符串，但分享链接里基本都是 UUID。
- `encryption=none` 表示 VLESS 本身不加密（这是 VLESS 的设计：靠 UUID + 传输层 TLS 保证安全）。Xray 服务端对应 `"decryption": "none"`。

## 2. 公共查询参数

| 参数 | 含义 | 常见取值 |
| --- | --- | --- |
| `type` | 传输层协议 | `tcp`(默认) `ws` `grpc` `http` `quic` `kcp` `xhttp` `httpupgrade` |
| `security` | 传输安全 | `none` `tls` `reality`（`xtls` 为旧写法） |
| `sni` | TLS SNI / 证书域名 | 你的域名，例如 `sub.example.com` |
| `fp` | uTLS 客户端指纹 | `chrome` `firefox` `safari` `ios` `android` `edge` `random` `randomized` |
| `alpn` | TLS ALPN，逗号分隔 | `h2,http/1.1` |
| `flow` | XTLS 流控，仅 TCP+TLS/REALITY 用 | `xtls-rprx-vision`（旧：`xtls-rprx-direct`） |
| `encryption` | VLESS 加密方式，固定 | `none` |
| `allowInsecure` | 跳过证书校验（不安全） | `1` / `true` |
| `packetEncoding` | 数据包编码 | `none` `packet` |
| `headerType` | TCP/KCP 的伪装头 | `none` `http` |

## 3. 按传输层细分的参数

### WebSocket（`type=ws`）

| 参数 | 说明 |
| --- | --- |
| `host` | WS 握手的 `Host` 头，CDN 场景必须是你的域名 |
| `path` | WS 路径，URL 编码后的形式，如 `%2Fws` |
| `ed` / `eh` | 部分客户端的 early data 长度 / header 名（非必填） |

### HTTP/2（`type=http`）

| 参数 | 说明 |
| --- | --- |
| `host` | `Host` 头 |
| `path` | HTTP/2 路径（常配合 `alpn=h2,http/1.1`） |

### gRPC（`type=grpc`）

| 参数 | 说明 |
| --- | --- |
| `serviceName` | gRPC 服务名，例如 `grpcsvc` |
| `mode` | `gun`（默认）/ `multi` |

### TCP + HTTP 伪装（`type=tcp&headerType=http`）

| 参数 | 说明 |
| --- | --- |
| `headerType` | `http` 时启用 HTTP 伪装 |
| `host` | 伪装的 Host |
| `path` | 伪装的路径 |

### mKCP / QUIC（`type=kcp` / `type=quic`）

| 参数 | 说明 |
| --- | --- |
| `headerType` | `none` `srtp` `utp` `wechat-video` `dtls` `wireguard` |
| `seed` | KCP 混淆种子 |
| `quicSecurity` / `key` | QUIC 加密方式与密钥 |
| `mode` | KCP/QUIC 传输模式 |

### XHTTP / HTTPUpgrade（`type=xhttp` / `type=httpupgrade`）

| 参数 | 说明 |
| --- | --- |
| `host` / `path` | 与 WS 类似 |
| `mode` | XHTTP 常见 `auto` `packet-up` `stream-up` `stream-one` |

### REALITY（`security=reality`）

| 参数 | 说明 |
| --- | --- |
| `pbk` | REALITY 公钥（服务端生成的 PublicKey） |
| `sid` | shortId（十六进制） |
| `spx` | spiderX 路径，常为 `/` |
| `sni` | 伪装的目标域名（必填） |
| `fp` | 建议 `chrome` |

> 新版本 Xray 还会追加一些校验字段；遇到不认识的参数时，客户端通常会忽略而不是报错。

## 4. 本项目的场景：WS + TLS + Cloudflare CDN

### 3x-ui 给出的原始链接（地址是域名）

```
vless://b831381d-6324-4d53-ad4f-8cda48b30811@sub.example.com:443?type=ws&security=tls&sni=sub.example.com&host=sub.example.com&path=%2Fws&fp=chrome&encryption=none#香港节点
```

### 替换成 Cloudflare 优选 IP 后（本项目生成的结果）

```
vless://b831381d-6324-4d53-ad4f-8cda48b30811@104.16.0.1:443?type=ws&security=tls&sni=sub.example.com&host=sub.example.com&path=%2Fws&fp=chrome&encryption=none#香港节点-104.16.0.1-443
```

**只有地址（和端口）变了**，`sni`、`host`、`path`、`fp`、`encryption` 一律保持原样 —— 这正是能连通的关键：

- 客户端直连优选 IP，TCP 到的是 Cloudflare 边缘节点；
- TLS 的 SNI 仍是你的域名 → CF 才知道该回源到哪个站点；
- WS 握手的 `Host` 也是你的域名 → 回源时 openresty 才能按域名路由；
- 到源站后由 openresty/nginx 终止 TLS，再转发给本机监听的 3x-ui。

### 对应的 Xray 入站配置（源站侧，供对照）

```json
{
  "inbounds": [
    {
      "listen": "127.0.0.1",
      "port": 10000,
      "protocol": "vless",
      "settings": {
        "clients": [{ "id": "b831381d-6324-4d53-ad4f-8cda48b30811", "flow": "" }],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "ws",
        "security": "none",
        "wsSettings": {
          "path": "/ws",
          "headers": { "Host": "sub.example.com" }
        }
      }
    }
  ]
}
```

注意这里 `security` 是 `none`：源站的 TLS 由 openresty 承担，客户端链接里的 `security=tls` 描述的是"客户端 ↔ Cloudflare ↔ openresty"这一段。

## 5. 客户端如何消费这些链接

| 形式 | 说明 |
| --- | --- |
| 单条链接 | 直接导入，节点名取 `#` 后面的备注 |
| Base64 订阅 | 多行链接拼接后整体 Base64，放到一个 URL 上供客户端定期拉取 |
| Clash / mihomo | 转成 `proxies:` 里的 YAML 条目 |
| sing-box | 转成 `outbounds` 里的 JSON 条目 |

本项目四种形式都支持：`/sub/<token>` 默认返回 Base64，`?format=links|clash|singbox` 可指定，Clash/sing-box 客户端也能靠 User-Agent 自动识别。

## 6. 校验清单（连不上时按这个顺序排查）

1. `host` 缺失或写成 IP → WS 握手带着 IP 去请求，CDN 返回 404/520。
2. `sni` 缺失或写成 IP → TLS 握手失败或证书不匹配。
3. `path` 没做 URL 编码（写成 `/ws` 而不是 `%2Fws`）→ 部分客户端解析出错。
4. 端口不在 Cloudflare 允许的 HTTPS 端口（443 / 2053 / 2087 / 2096 / 8443）→ 直接连不上。
5. UUID 与 3x-ui 里的客户端不一致 → VLESS 认证失败。
6. `security=none` 却填了 443 → 实际是明文，容易被中间人。
7. 用了 `allowInsecure=1` → 跳过证书校验，存在中间人风险，不建议。
8. 备注里含空格、`#`、`&` 等字符但没编码 → 链接被截断，节点名显示异常。

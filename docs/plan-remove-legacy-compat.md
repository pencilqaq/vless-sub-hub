# 方案：移除历史兼容层（demo 阶段）

> 背景：项目目前是 demo 开发，不需要保留任何旧版本兼容。本文档列出要删除的兼容分支、明确保留的容错逻辑、
> 执行步骤与验收标准；执行完成后在文末追加"执行记录"。

## 1. 原则

- 每个概念只保留**唯一**的字段名 / 配置名 / 代码路径，不再维护别名与旧渲染分支。
- 「容错」不等于「版本兼容」：防止手改 `data/db.json`、缺字段、目标策略组被删导致崩溃的兜底逻辑**保留**。
- 不涉及数据迁移：`data/db.json` 里的历史字段（如 `clashPreset`）可以留着，代码会忽略它。

## 2. 要移除的范围

### A. 端口变量只保留 `SERVER_PORT`

| 文件 | 现状 | 目标 |
| --- | --- | --- |
| `server/config.js` | `BACKEND_PORT_KEYS = ['SERVER_PORT','SEVER_PORT','PORT']` + 两个 warn + `portKey` 字段 | 只读 `SERVER_PORT`，非法值仅告警并回退 `WEB_PORT + 1` |
| `scripts/dev.mjs` | 同样的三键回退、拼写/旧名提示、`delete childEnv.PORT/SEVER_PORT` | 只读 `SERVER_PORT`，去掉相关提示与清理 |
| `web/vite.config.js` | `pickBackend()` 遍历三个 key | 只读 `SERVER_PORT` |
| `.env.example` / `README.md` | 说明"旧名 PORT 与拼写 SEVER_PORT 仍兼容" | 删除旧名说明 |

### B. 只允许 `APP_PASSWORD_HASH`（移除明文密码通道）

| 文件 | 现状 | 目标 |
| --- | --- | --- |
| `server/config.js` | `passwordPlain` / `allowPlain` 字段与两条校验分支 | 删除字段，`validateConfig` 只校验 `APP_PASSWORD_HASH` 是否存在与格式 |
| `server/auth.js` | 明文比对分支（`config.passwordPlain && config.allowPlain`） | 只保留 scrypt 校验 |
| `server/index.js` | 启动时"正在使用明文 APP_PASSWORD"警告 | 删除 |
| `.env.example` | `# APP_PASSWORD=change-me`、`ALLOW_PLAIN_PASSWORD=true` | 删除 |
| `scripts/smoke-test.mjs`、`scripts/verify-auth.mjs` | 用明文密码启动被测服务 | 改为运行期调用 `hashPassword()` 生成哈希后注入 `APP_PASSWORD_HASH` |

### C. 删除旧 `clashPreset` 渲染路径

| 文件 | 现状 | 目标 |
| --- | --- | --- |
| `shared/clash-config.js` | `VALID_PRESETS`、`buildRules()`、`buildRuleProviders()`、"兼容模式"注释 | 全部删除；规则只来自「管理的规则集 + 自定义规则」 |
| `server/index.js` | `sanitizeBody` / `toView` / `renderFormat` 里读写 `clashPreset` | 删除该字段与传参 |
| `web/src/components/SubscriptionEditModal.vue` | 表单仍有 `clashPreset` 字段（含已无用的 `presetOptions`） | 删除 |
| `README.md` | "旧的内置预设仍兼容…" | 改为只描述规则集模式 |

> `CLASH_PRESET_IMPORTS` 与预设模板数据**保留**——它们是「导入预设规则集」功能的原料，不是兼容代码。

## 3. 明确保留（不是版本兼容）

- `toView` / `sanitize*` 中的 `Array.isArray(x) ? x : []`、`sub.clashMode || 'fragment'` 等缺字段默认值。
- `toClashConfig` 在 `groups` 为空时回退到 `CLASH_BUILTIN_GROUPS`（避免策略组被删光后生成空配置）。
- 规则集目标策略组不存在时回退到默认策略组并在配置顶部写注释。
- `paramOverrides`、`nameTemplate`、`ALLOW_PRIVATE_RULE_URLS`、`CLASH_TARGET_GROUPS` 等功能性逻辑。
- 内置策略 `DIRECT` / `REJECT` / `PASS` 始终视为有效目标，且禁止创建同名策略组。

## 4. 执行步骤

1. 按 A、B、C 三组修改源码与文档（一次性完成）。
2. 新增 `scripts/verify-ports.mjs`，覆盖端口规则：`WEB_PORT` 必填、`SERVER_PORT` 留空 = `WEB_PORT + 1`、显式值生效；并在 `package.json` 注册 `verify:ports`。
3. 更新自检脚本，使认证测试不再依赖明文密码。
4. 运行全部检查：`pnpm verify:ports`、`pnpm verify`、`pnpm verify:auth`。
5. 全仓库检索残留：`SEVER_PORT`、`ALLOW_PLAIN_PASSWORD`、`passwordPlain`、`clashPreset`、`VALID_PRESETS`。
6. 用真实 `.env`（`WEB_PORT=5173`、`SERVER_PORT=3456`）确认解析结果不变。
7. 在本文档追加"执行记录"。

## 5. 验收标准

1. `pnpm verify` 33 项、`pnpm verify:auth` 9 项、`pnpm verify:ports` 全部通过。
2. 全仓库检索第 4 步列出的关键字，源码与文档中均无残留（`git grep` 结果为空）。
3. 认证流程在**没有任何明文密码配置**的情况下正常工作（错误密码 401、正确密码 200）。
4. 生成 Clash 完整配置时不依赖 `clashPreset`，规则来源只有规则集与自定义规则。
5. `git status` 显示改动仅涉及上述文件与新增脚本。

## 6. 回滚

- 执行前仓库处于初始提交 `f683586`，工作区干净；如需回滚执行 `git checkout -- .`（或 `git reset --hard f683586`）。
- 本次改动不触碰 `data/db.json`，因此不需要数据层面的回滚。

## 7. 执行记录

### 7.1 执行记录（2026-09-28）

- **范围**：A / B / C 三组全部完成——端口只认 `SERVER_PORT`；只允许 `APP_PASSWORD_HASH`；删除 `clashPreset` 渲染路径与相关字段。
- **新增**：`scripts/verify-ports.mjs`，并在 `package.json` 注册 `pnpm verify:ports`。
- **同步更新**：`scripts/smoke-test.mjs`（改为运行期 `hashPassword()` 生成哈希启动被测服务）、`scripts/verify-auth.mjs`（移除明文相关环境变量）、`.env.example`、`README.md`。
- **自检结果**：
  - `pnpm verify:ports` → 10/10 通过（WEB_PORT 必填；留空 = WEB_PORT + 1；显式值优先；旧名 `PORT`/`SEVER_PORT` 确认被忽略；单独启动 `server/index.js` 同一规则）
  - `pnpm verify` → 33/33 通过（含前端构建与订阅输出全流程）
  - `pnpm verify:auth` → 9/9 通过（scrypt 哈希登录、Cookie 属性、错误密码拒绝、未配置凭据拒绝启动）
- **残留复核**：源码与配置中已无 `SEVER_PORT` / `ALLOW_PLAIN_PASSWORD` / `passwordPlain` / `clashPreset` / `VALID_PRESETS` / `buildRuleProviders`。
  例外（有意保留）：本文档自身的描述、`scripts/verify-ports.mjs` 中"旧名被忽略"的测试用例、`web/dist` 构建产物。
- **未触碰**：`data/db.json`（历史字段 `clashPreset` 仍留在文件里，代码已忽略；如需彻底清掉可重新保存一次订阅或手工删除该字段）。

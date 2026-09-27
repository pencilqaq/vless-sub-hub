import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(here, '..');
loadDotEnvFile(path.join(rootDir, '.env'));
function loadDotEnvFile(file) {
  if (!fs.existsSync(file)) return;
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    console.warn('[config] 读取 .env 失败：' + err.message);
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, "").trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
function boolEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}
function numEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
export const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch (err) {
  console.warn('[config] 无法创建数据目录 ' + dataDir + '：' + err.message);
}
const BACKEND_PORT_KEYS = ['SERVER_PORT', 'SEVER_PORT', 'PORT'];
function resolveBackendPort() {
  for (const key of BACKEND_PORT_KEYS) {
    if (process.env[key] === undefined) continue;
    const raw = String(process.env[key]).trim();
    if (!raw) return { key, value: 0 };
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 1 && value <= 65535) return { key, value };
    console.warn('[config] ' + key + ' 不是合法端口：' + raw);
    return { key, value: 0 };
  }
  return { key: '', value: 0 };
}
const backendPortEnv = resolveBackendPort();
if (backendPortEnv.key === 'SEVER_PORT') console.warn('[config] 检测到 SEVER_PORT，疑似拼写错误，建议改为 SERVER_PORT。');
if (backendPortEnv.key === 'PORT') console.warn('[config] PORT 已更名为 SERVER_PORT，建议更新 .env（当前仍兼容）。');
const envWebPort = numEnv('WEB_PORT', 0);
export const config = {
  port: backendPortEnv.value || (envWebPort ? envWebPort + 1 : 3000),
  portFromWebPort: !backendPortEnv.value && envWebPort > 0,
  portKey: backendPortEnv.key,
  webPort: envWebPort,
  host: process.env.HOST || '0.0.0.0',
  username: process.env.APP_USERNAME || 'admin',
  passwordHash: String(process.env.APP_PASSWORD_HASH || '').trim(),
  passwordPlain: String(process.env.APP_PASSWORD || ''),
  allowPlain: boolEnv('ALLOW_PLAIN_PASSWORD', true),
  sessionTtlMs: numEnv('SESSION_TTL_HOURS', 168) * 3600 * 1000,
  sessionVersion: String(process.env.SESSION_VERSION || '1'),
  cookieSecure: boolEnv('COOKIE_SECURE', false),
  trustProxy: String(process.env.TRUST_PROXY || '').trim(),
  publicBaseUrl: String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  allowedIps: String(process.env.ALLOWED_IPS || '').split(',').map((x) => x.trim()).filter(Boolean),
  allowPrivateRuleUrls: boolEnv('ALLOW_PRIVATE_RULE_URLS', false),
  webDist: path.join(rootDir, 'web', 'dist'),
  dataDir
};
let cachedSecret = null;
export function getSessionSecret() {
  if (cachedSecret) return cachedSecret;
  const fromEnv = String(process.env.SESSION_SECRET || '');
  if (fromEnv.length >= 16) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  if (fromEnv) console.warn('[warn] SESSION_SECRET 太短（建议 32 位以上随机字符串），已忽略。');
  const secretFile = path.join(dataDir, '.session-secret');
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing.length >= 16) {
        cachedSecret = existing;
        return cachedSecret;
      }
    }
    const generated = crypto.randomBytes(48).toString('base64url');
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    console.warn('[warn] 未设置 SESSION_SECRET，已自动生成并保存到 ' + secretFile);
    cachedSecret = generated;
    return cachedSecret;
  } catch (err) {
    const generated = crypto.randomBytes(48).toString('base64url');
    console.warn('[warn] 无法写入会话密钥文件（' + err.message + '），本次使用临时密钥，重启后需要重新登录。');
    cachedSecret = generated;
    return cachedSecret;
  }
}
export function validateConfig() {
  const problems = [];
  if (!config.passwordHash && !config.passwordPlain) {
    problems.push('未配置登录密码：请在 .env 中设置 APP_PASSWORD_HASH（推荐）或 APP_PASSWORD。');
  }
  if (config.passwordHash && !/^scrypt\$\d+\$\d+\$\d+\$/.test(config.passwordHash)) {
    problems.push('APP_PASSWORD_HASH 格式不正确，请执行 pnpm run hash "你的密码" 重新生成。');
  }
  if (!config.passwordHash && config.passwordPlain && !config.allowPlain) {
    problems.push('ALLOW_PLAIN_PASSWORD=false 时不能使用明文 APP_PASSWORD，请改用 APP_PASSWORD_HASH。');
  }
  return problems;
}

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
function readPort(name) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return 0;
  const value = Number(raw);
  if (Number.isFinite(value) && value >= 1 && value <= 65535) return value;
  console.warn('[config] ' + name + ' 不是合法端口：' + raw);
  return 0;
}
const envWebPort = numEnv('WEB_PORT', 0);
const explicitServerPort = readPort('SERVER_PORT');
export const config = {
  port: explicitServerPort || (envWebPort ? envWebPort + 1 : 3000),
  portFromWebPort: !explicitServerPort && envWebPort > 0,
  webPort: envWebPort,
  host: process.env.HOST || '0.0.0.0',
  username: process.env.APP_USERNAME || 'admin',
  passwordHash: String(process.env.APP_PASSWORD_HASH || '').trim(),
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
  if (!config.passwordHash) {
    problems.push('未配置登录密码：请执行 pnpm hash "你的密码" 生成后把 APP_PASSWORD_HASH 写入 .env。');
  }
  if (config.passwordHash && !/^scrypt\$\d+\$\d+\$\d+\$/.test(config.passwordHash)) {
    problems.push('APP_PASSWORD_HASH 格式不正确，请执行 pnpm run hash "你的密码" 重新生成。');
  }
  return problems;
}

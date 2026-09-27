import crypto from 'node:crypto';
import { config, getSessionSecret } from './config.js';
const COOKIE_NAME = 'vsh_session';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const MAX_MEM = 128 * 1024 * 1024;
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;
const attempts = new Map();
const cleaner = setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of attempts) {
    if (now - rec.last > WINDOW_MS) attempts.delete(key);
  }
}, 5 * 60 * 1000);
if (cleaner && typeof cleaner.unref === 'function') cleaner.unref();
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, KEY_LEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAX_MEM
  });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), derived.toString('base64')].join('$');
}
export function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch (err) {
    return false;
  }
  if (!salt.length || !expected.length) return false;
  let actual;
  try {
    actual = crypto.scryptSync(String(password), salt, expected.length, { N, r, p, maxmem: MAX_MEM });
  } catch (err) {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function safeEqualString(a, b) {
  const da = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const db = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(da, db);
}
export function verifyCredentials(username, password) {
  const userOk = safeEqualString(String(username == null ? '' : username), config.username);
  const passOk = config.passwordHash ? verifyPassword(password, config.passwordHash) : false;
  return userOk && passOk;
}
export function createToken() {
  const now = Date.now();
  const payload = {
    u: config.username,
    iat: now,
    exp: now + config.sessionTtlMs,
    v: config.sessionVersion
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  return body + '.' + sig;
}
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx < 1) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  if (!safeEqualString(sig, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (err) {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (Number(payload.exp) < Date.now()) return null;
  if (String(payload.v) !== String(config.sessionVersion)) return null;
  if (payload.u !== config.username) return null;
  return payload;
}
export function parseCookies(header) {
  const out = {};
  const raw = String(header || '');
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}
export function setSessionCookie(res, token) {
  const parts = [
    COOKIE_NAME + '=' + token,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + Math.floor(config.sessionTtlMs / 1000)
  ];
  if (config.cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
export function clearSessionCookie(res) {
  const parts = [COOKIE_NAME + '=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (config.cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
export function currentUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const payload = verifyToken(cookies[COOKIE_NAME]);
  return payload ? payload.u : null;
}
export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: '未登录或登录已过期' });
  req.user = user;
  next();
}
export function csrfGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch (err) {
    return res.status(403).json({ error: '请求来源不合法' });
  }
  const targets = [];
  if (req.headers.host) targets.push(String(req.headers.host));
  if (config.publicBaseUrl) {
    try {
      targets.push(new URL(config.publicBaseUrl).host);
    } catch (err) { /* 忽略无效配置 */ }
  }
  if (targets.includes(originHost)) return next();
  return res.status(403).json({ error: '跨站请求已被拒绝' });
}
function normalizeIp(ip) {
  let value = String(ip || '').trim();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  return value;
}
function ipToLong(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = out * 256 + n;
  }
  return out >>> 0;
}
function matchRule(ip, rule) {
  if (!rule) return false;
  if (!rule.includes('/')) return ip === rule;
  const [network, bitsRaw] = rule.split('/');
  const bits = Number(bitsRaw);
  const a = ipToLong(ip);
  const b = ipToLong(network);
  if (a == null || b == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}
export function clientIp(req) {
  return normalizeIp(req.ip || (req.socket && req.socket.remoteAddress) || '');
}
export function ipGuard(req, res, next) {
  if (!config.allowedIps.length) return next();
  const ip = clientIp(req);
  if (config.allowedIps.some((rule) => matchRule(ip, rule))) return next();
  return res.status(403).json({ error: '当前 IP 不在允许访问的范围内' });
}
export function attemptKey(req, username) {
  return clientIp(req) + '|' + String(username || '').toLowerCase();
}
export function isBlocked(key) {
  const rec = attempts.get(key);
  if (!rec || !rec.lockedUntil) return { blocked: false, retryAfter: 0 };
  const now = Date.now();
  if (rec.lockedUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  return { blocked: false, retryAfter: 0 };
}
export function recordFailure(key) {
  const now = Date.now();
  const rec = attempts.get(key) || { count: 0, first: now, last: now, lockedUntil: 0 };
  if (now - rec.first > WINDOW_MS) {
    rec.count = 0;
    rec.first = now;
  }
  rec.count += 1;
  rec.last = now;
  if (rec.count >= MAX_FAILURES) {
    rec.lockedUntil = now + LOCK_MS;
    rec.count = 0;
    rec.first = now;
  }
  attempts.set(key, rec);
}
export function recordSuccess(key) {
  attempts.delete(key);
}

/*
 * 验证安全推荐路径：APP_PASSWORD_HASH（scrypt）+ 未配置凭据时拒绝启动
 * 运行方式：node scripts/verify-auth.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log('  [PASS] ' + name);
  } else {
    fail += 1;
    console.log('  [FAIL] ' + name + (detail ? ' :: ' + detail : ''));
  }
}
const plainPassword = 'verify-password-123';
console.log('\n== 1. 生成 scrypt 哈希 ==');
const hashRun = spawnSync(process.execPath, ['server/hash-password.js', plainPassword], { cwd: root, encoding: 'utf8' });
const hash = (hashRun.stdout.match(/APP_PASSWORD_HASH=(\S+)/) || [])[1] || '';
check('hash-password.js 输出哈希', hash.startsWith('scrypt$'), hash.slice(0, 40));
check('哈希中不含明文密码', !!hash && !hash.includes(plainPassword));
check('哈希格式为 scrypt$N$r$p$salt$hash', hash.split('$').length === 6);
console.log('\n== 2. 使用哈希启动并登录 ==');
const dataDir = path.join(os.tmpdir(), 'vsh-hash-' + Date.now());
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: Object.assign({}, process.env, {
    SERVER_PORT: '3998',
    HOST: '127.0.0.1',
    APP_USERNAME: 'hashuser',
    APP_PASSWORD: '',
    APP_PASSWORD_HASH: hash,
    ALLOW_PLAIN_PASSWORD: 'false',
    SESSION_SECRET: 'verify-auth-secret-0123456789-abcdefghijklmnop',
    DATA_DIR: dataDir,
    TRUST_PROXY: ''
  }),
  stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
server.stdout.on('data', (c) => { log += c.toString(); });
server.stderr.on('data', (c) => { log += c.toString(); });
const base = 'http://127.0.0.1:3998';
async function waitHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + '/api/health');
      if (res.ok) return true;
    } catch (err) { /* 等待重试 */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}
try {
  const healthy = await waitHealth();
  check('使用哈希时服务正常启动', healthy, log.slice(-300));
  if (healthy) {
    const good = await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'hashuser', password: plainPassword })
    });
    check('正确密码通过 scrypt 校验', good.status === 200, 'status=' + good.status);
    const cookie = (good.headers.get('set-cookie') || '').split(';')[0];
    check('下发的 Cookie 带 HttpOnly 与 SameSite', /HttpOnly/.test(good.headers.get('set-cookie') || '') && /SameSite=Lax/.test(good.headers.get('set-cookie') || ''), cookie.slice(0, 20));
    const bad = await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'hashuser', password: 'not-the-password' })
    });
    check('错误密码被拒绝', bad.status === 401, 'status=' + bad.status);
  }
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (err) { /* 忽略 */ }
}
console.log('\n== 3. 未配置凭据时必须拒绝启动 ==');
const noCredData = path.join(os.tmpdir(), 'vsh-nocred-' + Date.now());
const noCred = spawnSync(process.execPath, ['server/index.js'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 20000,
  env: Object.assign({}, process.env, {
    SERVER_PORT: '3997',
    HOST: '127.0.0.1',
    APP_USERNAME: 'admin',
    APP_PASSWORD: '',
    APP_PASSWORD_HASH: '',
    DATA_DIR: noCredData
  })
});
const noCredOutput = (noCred.stdout || '') + (noCred.stderr || '');
check('未配置密码时以非 0 退出', noCred.status !== 0, 'status=' + noCred.status);
check('给出明确的配置错误提示', noCredOutput.includes('配置错误'), noCredOutput.slice(0, 160));
try { fs.rmSync(noCredData, { recursive: true, force: true }); } catch (err) { /* 忽略 */ }
console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail === 0 ? 0 : 1);

/*
 * 端口规则自检：
 *   WEB_PORT     前端端口，必填（缺失直接报错）
 *   SERVER_PORT  后端端口，留空 = WEB_PORT + 1；显式值优先；不再接受任何别名
 * 运行方式：pnpm verify:ports
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log('  [PASS] ' + name);
  } else {
    fail += 1;
    console.log('  [FAIL] ' + name + (detail ? ' :: ' + detail : ''));
  }
};
const BASE_ENV = Object.assign({}, process.env, {
  APP_USERNAME: 'porttester',
  APP_PASSWORD_HASH: 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
  DATA_DIR: path.join(root, 'data', 'port-check')
});
function cleanEnv(overrides) {
  const env = Object.assign({}, BASE_ENV);
  for (const key of ['WEB_PORT', 'SERVER_PORT', 'PORT', 'SEVER_PORT', 'BACKEND_PORT', 'BACKEND_URL']) delete env[key];
  for (const [key, value] of Object.entries(overrides || {})) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}
async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch (err) { /* 继续等待 */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}
const killTree = (child) => {
  if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
};
console.log('\n== 1. WEB_PORT 必填 ==');
const missing = spawnSync(process.execPath, ['scripts/dev.mjs'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 20000,
  env: cleanEnv({ WEB_PORT: '', SERVER_PORT: '' })
});
const missingOut = (missing.stdout || '') + (missing.stderr || '');
check('缺少 WEB_PORT 时拒绝启动', missing.status !== 0, 'status=' + missing.status);
check('提示里包含 WEB_PORT', missingOut.includes('WEB_PORT'), missingOut.trim().slice(0, 120));
console.log('\n== 2. SERVER_PORT 留空 => WEB_PORT + 1（且忽略旧名 PORT）==');
const dev = spawn(process.execPath, ['scripts/dev.mjs'], {
  cwd: root,
  env: cleanEnv({ WEB_PORT: '5181', SERVER_PORT: ' ', PORT: '5199', SEVER_PORT: '5198' }),
  stdio: ['ignore', 'pipe', 'pipe']
});
let devLog = '';
dev.stdout.on('data', (chunk) => { devLog += chunk.toString(); });
dev.stderr.on('data', (chunk) => { devLog += chunk.toString(); });
try {
  const backend = await waitFor('http://127.0.0.1:5182/api/health', 25000);
  check('后端监听 5182（= 5181 + 1）', backend !== null && backend.includes('"ok"'));
  const frontend = await waitFor('http://localhost:5181/', 40000);
  check('前端监听 5181', frontend !== null && frontend.includes('id="app"'));
  const proxied = await waitFor('http://localhost:5181/api/health', 15000);
  check('Vite 代理指向 5182', proxied !== null && proxied.includes('"ok"'));
  check('横幅标注端口来源', devLog.includes('未设置 SERVER_PORT'));
  check('旧名 PORT/SEVER_PORT 不再被读取', !devLog.includes('5199') && !devLog.includes('5198'));
} finally {
  killTree(dev);
  await new Promise((resolve) => setTimeout(resolve, 1200));
}
console.log('\n== 3. 显式 SERVER_PORT 优先 ==');
const dev2 = spawn(process.execPath, ['scripts/dev.mjs'], {
  cwd: root,
  env: cleanEnv({ WEB_PORT: '5183', SERVER_PORT: '5186', PORT: '5199' }),
  stdio: ['ignore', 'pipe', 'pipe']
});
try {
  const backend = await waitFor('http://127.0.0.1:5186/api/health', 25000);
  check('后端监听 5186（SERVER_PORT）', backend !== null && backend.includes('"ok"'));
} finally {
  killTree(dev2);
  await new Promise((resolve) => setTimeout(resolve, 1200));
}
console.log('\n== 4. 单独启动 server/index.js 同一规则 ==');
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: cleanEnv({ WEB_PORT: '5188', SERVER_PORT: '' }),
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });
try {
  const health = await waitFor('http://127.0.0.1:5189/api/health', 20000);
  check('server 监听 5189（= 5188 + 1）', health !== null && health.includes('"ok"'));
  check('启动日志标注端口来源', serverLog.includes('按 WEB_PORT + 1 推导'), serverLog.slice(0, 160));
} finally {
  killTree(server);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  try {
    fs.rmSync(path.join(root, 'data', 'port-check'), { recursive: true, force: true });
  } catch (err) { /* 忽略 */ }
}
console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail === 0 ? 0 : 1);

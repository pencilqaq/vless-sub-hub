/*
 * 端到端冒烟测试：
 * 1) 构建前端  2) 启动服务  3) 验证登录鉴权、订阅 CRUD、各种订阅输出格式
 * 运行方式：node scripts/smoke-test.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3999;
const BASE = 'http://127.0.0.1:' + PORT;
const DEMO_LINK = 'vless://11111111-2222-3333-4444-555555555555@cdn.example.com:443?type=ws&security=tls&sni=cdn.example.com&host=cdn.example.com&path=%2Fws&fp=chrome#测试节点';
const IP_TEXT = ['1.2.3.4', '1.2.3.5:2053', '[2606:4700::6810:85e5]:443', '104.16.0.1 # 备注A', '1.2.3.4'].join('\n');
const dataDir = path.join(os.tmpdir(), 'vless-sub-hub-smoke-' + Date.now());
let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log('  [PASS] ' + name);
  } else {
    failed += 1;
    console.log('  [FAIL] ' + name + (detail ? ' :: ' + detail : ''));
  }
}
function section(title) {
  console.log('\n== ' + title + ' ==');
}
async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + '/api/health');
      if (res.ok) return true;
    } catch (err) {
      /* 服务还没起来，继续等待 */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}
function cookieFrom(res) {
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}
function runBuild() {
  const managers = process.platform === 'win32' ? ['pnpm.cmd', 'npm.cmd'] : ['pnpm', 'npm'];
  let last = { status: 1 };
  for (const manager of managers) {
    const result = spawnSync(manager, ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
    last = result;
    if (result.status === 0) return result;
    console.log('  [warn] ' + manager + ' 构建失败，尝试下一个包管理器');
  }
  return last;
}
section('1. 前端构建');
const build = runBuild();
check('pnpm run build 成功', build.status === 0, 'exit=' + build.status);
const indexHtml = path.join(root, 'web', 'dist', 'index.html');
check('web/dist/index.html 已生成', fs.existsSync(indexHtml));
section('2. 启动服务');
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: Object.assign({}, process.env, {
    SERVER_PORT: String(PORT),
    HOST: '127.0.0.1',
    APP_USERNAME: 'tester',
    APP_PASSWORD: 'test-password-123',
    APP_PASSWORD_HASH: '',
    ALLOW_PLAIN_PASSWORD: 'true',
    SESSION_SECRET: 'smoke-test-secret-0123456789-abcdefghijklmnop',
    SESSION_TTL_HOURS: '1',
    DATA_DIR: dataDir,
    TRUST_PROXY: '',
    PUBLIC_BASE_URL: ''
  }),
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });
let exitCode = 0;
try {
  const healthy = await waitForHealth(15000);
  check('服务已就绪 /api/health', healthy, serverLog.slice(-400));
  if (!healthy) throw new Error('服务启动失败');
  section('3. 登录与鉴权');
  const wrong = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'tester', password: 'wrong-password' })
  });
  check('错误密码返回 401', wrong.status === 401, 'status=' + wrong.status);
  const noAuth = await fetch(BASE + '/api/subscriptions');
  check('未登录访问管理接口返回 401', noAuth.status === 401, 'status=' + noAuth.status);
  const login = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'tester', password: 'test-password-123' })
  });
  check('正确密码登录成功', login.status === 200, 'status=' + login.status);
  const cookie = cookieFrom(login);
  check('下发会话 Cookie', /^vsh_session=/.test(cookie), cookie.slice(0, 24));
  const authHeaders = { 'Content-Type': 'application/json', Cookie: cookie };
  const session = await fetch(BASE + '/api/session', { headers: { Cookie: cookie } });
  const sessionData = await session.json();
  check('/api/session 返回已登录', sessionData.authenticated === true, JSON.stringify(sessionData));
  section('4. 订阅 CRUD 与生成');
  const created = await fetch(BASE + '/api/subscriptions', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: '冒烟订阅', baseLink: DEMO_LINK, ipText: IP_TEXT, extraPorts: '', nameTemplate: '{name}-{ip}-{port}' })
  });
  const sub = await created.json();
  check('创建订阅返回 201', created.status === 201, 'status=' + created.status + ' ' + JSON.stringify(sub).slice(0, 200));
  check('节点数量为 4（含去重与 IPv6）', sub.linkCount === 4, 'linkCount=' + sub.linkCount);
  check('解析出源域名', sub.baseHost === 'cdn.example.com', 'baseHost=' + sub.baseHost);
  check('分享地址包含 /sub/', typeof sub.shareUrl === 'string' && sub.shareUrl.includes('/sub/'), sub.shareUrl);
  const list = await fetch(BASE + '/api/subscriptions', { headers: { Cookie: cookie } });
  const listData = await list.json();
  check('列表接口返回 1 条订阅', listData.items && listData.items.length === 1, 'items=' + (listData.items || []).length);
  const preview = await fetch(BASE + '/api/preview', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'x', baseLink: DEMO_LINK, ipText: IP_TEXT, nameTemplate: '{name}-{ip}-{port}' })
  });
  const previewData = await preview.json();
  check('预览接口返回 4 条链接', previewData.linkCount === 4, 'linkCount=' + previewData.linkCount);
  section('5. 公开订阅输出');
  const token = sub.shareToken;
  const base64Res = await fetch(BASE + '/sub/' + token);
  const base64Text = await base64Res.text();
  const decoded = Buffer.from(base64Text, 'base64').toString('utf8');
  check('默认输出可解码的 Base64 订阅', base64Res.status === 200 && decoded.startsWith('vless://'), 'status=' + base64Res.status);
  const lines = decoded.trim().split('\n');
  check('Base64 中包含 4 条链接', lines.length === 4, 'lines=' + lines.length);
  check('第一条链接替换为优选 IP', lines[0].startsWith('vless://11111111-2222-3333-4444-555555555555@1.2.3.4:443?'), lines[0].slice(0, 90));
  check('保留 sni 参数', lines[0].includes('sni=cdn.example.com'));
  check('保留 host 与 path 参数', lines[0].includes('host=cdn.example.com') && lines[0].includes('path=%2Fws'));
  check('包含 IPv6 节点且带方括号', decoded.includes('@[2606:4700::6810:85e5]:443?'));
  check('IP 行端口优先（2053）', decoded.includes('@1.2.3.5:2053?'));
  check('重复 IP 已去重', decoded.split('\n').filter((line) => line.includes('@1.2.3.4:443?')).length === 1);
  const linksRes = await fetch(BASE + '/sub/' + token + '?format=links');
  const linksText = await linksRes.text();
  check('?format=links 返回明文列表', linksText.split('\n').filter(Boolean).length === 4);
  const clashRes = await fetch(BASE + '/sub/' + token + '?format=clash');
  const clashText = await clashRes.text();
  check('Clash 输出包含 proxies 与 servername', clashText.includes('proxies:') && clashText.includes('servername: "cdn.example.com"'), clashText.slice(0, 120));
  const sbRes = await fetch(BASE + '/sub/' + token + '?format=singbox');
  const sbData = JSON.parse(await sbRes.text());
  check('sing-box 输出结构正确', sbData.outbounds && sbData.outbounds.length === 4 && sbData.outbounds[0].server === '1.2.3.4');
  check('sing-box 保留 ws 路径与 Host', sbData.outbounds[0].transport.path === '/ws' && sbData.outbounds[0].transport.headers.Host === 'cdn.example.com');
  const uaRes = await fetch(BASE + '/sub/' + token, { headers: { 'User-Agent': 'clash-verge/1.7.0' } });
  const uaText = await uaRes.text();
  check('按 User-Agent 自动识别 Clash', uaText.includes('proxies:'));
  section('6. 令牌重置与停用');
  const rotated = await fetch(BASE + '/api/subscriptions/' + sub.id + '/rotate', { method: 'POST', headers: authHeaders });
  const rotatedData = await rotated.json();
  check('重置令牌成功', rotated.status === 200 && rotatedData.shareToken !== token);
  const oldToken = await fetch(BASE + '/sub/' + token);
  check('旧令牌立即失效（404）', oldToken.status === 404, 'status=' + oldToken.status);
  const disabled = await fetch(BASE + '/api/subscriptions/' + sub.id, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify(JSON.parse(JSON.stringify({ name: '冒烟订阅', baseLink: DEMO_LINK, ipText: IP_TEXT, enabled: false })))
  });
  check('停用订阅成功', disabled.status === 200);
  const blockedRes = await fetch(BASE + '/sub/' + rotatedData.shareToken);
  check('停用后订阅地址返回 403', blockedRes.status === 403, 'status=' + blockedRes.status);
  const removed = await fetch(BASE + '/api/subscriptions/' + sub.id, { method: 'DELETE', headers: { Cookie: cookie } });
  check('删除订阅成功', removed.status === 200);
  const logout = await fetch(BASE + '/api/logout', { method: 'POST', headers: authHeaders });
  check('退出登录成功', logout.status === 200);
} catch (err) {
  failed += 1;
  exitCode = 1;
  console.error('\n[异常] ' + err.message);
  if (serverLog) console.error('--- 服务端日志 ---\n' + serverLog.slice(-1500));
} finally {
  server.kill();
  await new Promise((resolve) => setTimeout(resolve, 600));
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch (err) {
    /* 忽略清理失败 */
  }
}
console.log('\n========================================');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
console.log('========================================\n');
process.exit(failed === 0 ? exitCode : 1);

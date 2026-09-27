/*
 * 开发模式：一条命令同时启动后端与 Vite 前端。
 * 用法：pnpm dev
 * 端口规则（.env）：
 *   WEB_PORT     前端端口，必填
 *   SERVER_PORT  后端端口，留空时自动取 WEB_PORT + 1
 *                （旧名 PORT 与拼写 SEVER_PORT 仍兼容，但会提示改名）
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const viteConfig = path.join(root, 'web', 'vite.config.js');
if (!fs.existsSync(viteBin)) {
  console.error('\n未找到 vite，请先执行：pnpm install\n');
  process.exit(1);
}
function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
const fileEnv = loadEnvFile(path.join(root, '.env'));
function pick(envValue, fileValue) {
  const raw = envValue !== undefined ? envValue : fileValue;
  return String(raw == null ? '' : raw).trim();
}
function isPort(value) {
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535;
}
const BACKEND_KEYS = ['SERVER_PORT', 'SEVER_PORT', 'PORT'];
function pickBackendPort(envObj, fileObj) {
  for (const key of BACKEND_KEYS) {
    if (envObj[key] !== undefined) return { key, value: pick(envObj[key], undefined) };
  }
  for (const key of BACKEND_KEYS) {
    if (fileObj[key] !== undefined) return { key, value: pick(undefined, fileObj[key]) };
  }
  return { key: '', value: '' };
}
const rawWebPort = pick(process.env.WEB_PORT, fileEnv.WEB_PORT);
if (!rawWebPort) {
  console.error('');
  console.error('[配置错误] 前端端口未设置：请在 .env 中填写 WEB_PORT，例如 WEB_PORT=5173');
  console.error('后端端口 SERVER_PORT 可以留空，留空时会自动使用 WEB_PORT + 1。');
  console.error('');
  process.exit(1);
}
if (!isPort(rawWebPort)) {
  console.error('\n[配置错误] WEB_PORT 不是合法端口：' + rawWebPort + '（应为 1-65535）\n');
  process.exit(1);
}
const webPort = Number(rawWebPort);
const backendPick = pickBackendPort(process.env, fileEnv);
if (backendPick.key === 'SEVER_PORT') {
  console.warn('[warn] 检测到 SEVER_PORT，疑似拼写错误，建议改为 SERVER_PORT。');
}
if (backendPick.key === 'PORT') {
  console.warn('[warn] PORT 已更名为 SERVER_PORT，建议更新 .env（当前仍兼容）。');
}
if (backendPick.key === 'SERVER_PORT' && (process.env.PORT !== undefined || fileEnv.PORT !== undefined)) {
  console.warn('[warn] 同时存在 SERVER_PORT 与 PORT，已忽略 PORT。');
}
if (backendPick.value && !isPort(backendPick.value)) {
  console.error('\n[配置错误] ' + backendPick.key + ' 不是合法端口：' + backendPick.value + '（留空表示使用 WEB_PORT + 1）\n');
  process.exit(1);
}
const backendPort = backendPick.value ? Number(backendPick.value) : webPort + 1;
if (backendPort === webPort) {
  console.error('\n[配置错误] 后端端口不能与前端端口相同（都是 ' + webPort + '）\n');
  process.exit(1);
}
const backendHost = String(pick(process.env.HOST, fileEnv.HOST) || '0.0.0.0');
const backendUrl = 'http://127.0.0.1:' + backendPort;
const childEnv = Object.assign({}, fileEnv, process.env, {
  SERVER_PORT: String(backendPort),
  BACKEND_PORT: String(backendPort),
  BACKEND_URL: backendUrl,
  WEB_PORT: String(webPort)
});
delete childEnv.PORT;
delete childEnv.SEVER_PORT;
const children = [];
let shuttingDown = false;
const HINTS = [
  {
    match: /EADDRINUSE/,
    once: false,
    text:
      '后端端口 ' + backendPort + ' 已被占用：可能已有一个实例在运行。' +
      '请先停掉它，或修改 .env 里的 SERVER_PORT 后重新执行 pnpm dev。'
  },
  {
    match: /\[配置错误\]/,
    once: false,
    text:
      '后端未通过配置检查：请在 .env 中设置 APP_PASSWORD_HASH' +
      '（执行 pnpm hash "你的密码" 生成）。'
  }
];
function spawnChild(label, args, color) {
  const child = spawn(process.execPath, args, { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  child.__tail = '';
  children.push(child);
  const prefix = color + '[' + label + ']' + '\x1b[0m ';
  const forward = (stream, target) => {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      child.__tail = (child.__tail + chunk).slice(-4000);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) target.write(prefix + line + '\n');
      if (label === 'server') {
        for (const hint of HINTS) {
          if (!hint.once && hint.match.test(child.__tail)) {
            hint.once = true;
            console.log('\n' + color + '[dev]' + '\x1b[0m ' + hint.text + '\n');
          }
        }
      }
    });
    stream.on('end', () => {
      if (buffer) target.write(prefix + buffer + '\n');
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on('error', (err) => {
    console.error(prefix + '启动失败：' + err.message);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? '信号 ' + signal : '退出码 ' + code;
    console.log(prefix + '进程已退出（' + reason + '），正在停止其它进程…');
    if (label === 'server' && code !== 0) {
      console.log(prefix + '提示：后端未运行，前端对 /api 的请求会报 ECONNREFUSED。');
    }
    shutdown(code == null ? 1 : code);
  });
  return child;
}
function killTree(child) {
  if (!child || child.exitCode != null || child.killed) return;
  if (process.platform === 'win32' && child.pid) {
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch (err) {
      /* 退回普通 kill */
    }
  }
  try {
    child.kill('SIGTERM');
  } catch (err) {
    /* 忽略 */
  }
}
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killTree(child);
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
console.log('');
console.log('启动开发环境：');
console.log('  前端  http://localhost:' + webPort + '  （WEB_PORT）');
const backendLabel = backendPick.value
  ? '  （' + backendPick.key + '）'
  : '  （未设置 SERVER_PORT，按 WEB_PORT + 1 推导）';
console.log('  后端  http://localhost:' + backendPort + backendLabel + (backendHost === '0.0.0.0' ? '' : '，监听 ' + backendHost));
console.log('  Vite 代理：/api、/sub → ' + backendUrl);
console.log('按 Ctrl+C 可同时停止两个进程。');
console.log('');
spawnChild('server', ['--watch', 'server/index.js'], '\x1b[36m');
spawnChild('web', [viteBin, '--config', viteConfig], '\x1b[35m');

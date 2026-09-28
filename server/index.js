import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, validateConfig, dataDir } from './config.js';
import * as store from './store.js';
import * as auth from './auth.js';
import {
  generateSubscription,
  toBase64,
  toClashYaml,
  toSingboxJson,
  detectFormat,
  MAX_ENTRIES
} from '../shared/vless.js';
import { toClashConfig, CLASH_BUILTIN_GROUPS, CLASH_PRESET_IMPORTS } from '../shared/clash-config.js';
const problems = validateConfig();
if (problems.length) {
  console.error('\n[配置错误] 服务无法启动：');
  for (const item of problems) console.error('  - ' + item);
  console.error('\n请复制 .env.example 为 .env 并按要求填写后重试。\n');
  process.exit(1);
}
if (store.listProxyGroups().length === 0) {
  const seeded = store.ensureBuiltinGroups(CLASH_BUILTIN_GROUPS);
  if (seeded.created) console.log('[init] 已初始化 ' + seeded.created + ' 个默认策略组');
}
const app = express();
app.disable('x-powered-by');
if (config.trustProxy && config.trustProxy !== 'false') {
  const value = config.trustProxy === 'true' ? true : config.trustProxy;
  try {
    app.set('trust proxy', value);
  } catch (err) {
    console.warn('[warn] TRUST_PROXY 配置无效：' + err.message);
  }
}
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});
app.use('/api', auth.csrfGuard, auth.ipGuard);
function sanitizeBody(body) {
  const source = body || {};
  const name = String(source.name || '').trim().slice(0, 80) || '未命名订阅';
  return {
    name,
    baseLink: String(source.baseLink || '').trim().slice(0, 4000),
    ipText: String(source.ipText || '').slice(0, 400000),
    extraPorts: String(source.extraPorts || '').slice(0, 200),
    nameTemplate: String(source.nameTemplate || '').slice(0, 200),
    paramOverrides: String(source.paramOverrides || '').slice(0, 4000),
    clashMode: String(source.clashMode || 'fragment') === 'full' ? 'full' : 'fragment',
    clashCustomRules: String(source.clashCustomRules || '').slice(0, 8000),
    clashMixedPort: String(source.clashMixedPort || '7890').slice(0, 10),
    clashRuleSetIds: Array.isArray(source.clashRuleSetIds)
      ? source.clashRuleSetIds.map((id) => String(id)).slice(0, 50)
      : [],
    clashGroupIds: Array.isArray(source.clashGroupIds) ? source.clashGroupIds.map((id) => String(id)).slice(0, 100) : [],
    clashFinalGroup: String(source.clashFinalGroup || '').slice(0, 40),
    useLinePort: source.useLinePort !== false,
    dedupe: source.dedupe !== false,
    enabled: source.enabled !== false
  };
}
function buildShareUrl(req, token) {
  if (config.publicBaseUrl) return config.publicBaseUrl + '/sub/' + token;
  const proto = req.protocol || 'http';
  return proto + '://' + req.get('host') + '/sub/' + token;
}
function toView(sub, req) {
  const result = generateSubscription(sub);
  return {
    id: sub.id,
    name: sub.name,
    enabled: sub.enabled !== false,
    baseLink: sub.baseLink,
    ipText: sub.ipText,
    extraPorts: sub.extraPorts || '',
    nameTemplate: sub.nameTemplate || '',
    paramOverrides: sub.paramOverrides || '',
    clashMode: sub.clashMode || 'fragment',
    clashCustomRules: sub.clashCustomRules || '',
    clashMixedPort: sub.clashMixedPort || '7890',
    clashRuleSetIds: Array.isArray(sub.clashRuleSetIds) ? sub.clashRuleSetIds : [],
    clashGroupIds: Array.isArray(sub.clashGroupIds) ? sub.clashGroupIds : [],
    clashFinalGroup: sub.clashFinalGroup || '',
    useLinePort: sub.useLinePort !== false,
    dedupe: sub.dedupe !== false,
    shareToken: sub.shareToken,
    shareUrl: buildShareUrl(req, sub.shareToken),
    hits: sub.hits || 0,
    lastAccessAt: sub.lastAccessAt || null,
    createdAt: sub.createdAt || null,
    updatedAt: sub.updatedAt || null,
    baseHost: result.parsed ? result.parsed.host : '',
    ipCount: result.entries ? result.entries.length : 0,
    linkCount: result.links ? result.links.length : 0,
    error: result.error || '',
    warnings: result.warnings || []
  };
}
function renderFormat(sub, result, format) {
  const value = String(format || '').toLowerCase();
  const urls = result.links.map((item) => item.url);
  if (value === 'clash' || value === 'yaml' || value === 'mihomo') {
    const full = String((sub && sub.clashMode) || 'fragment') === 'full';
    const body = full
      ? toClashConfig(result.parsed, result.links, {
          customRules: (sub && sub.clashCustomRules) || '',
          ruleSets: resolveRuleSets(sub),
          groups: resolveGroups(sub),
          finalGroup: (sub && sub.clashFinalGroup) || '',
          mixedPort: (sub && sub.clashMixedPort) || 7890
        })
      : toClashYaml(result.parsed, result.links);
    return { body, type: 'text/yaml; charset=utf-8' };
  }
  if (value === 'singbox' || value === 'sing-box' || value === 'json') {
    return { body: toSingboxJson(result.parsed, result.links), type: 'application/json; charset=utf-8' };
  }
  if (value === 'links' || value === 'plain' || value === 'text') {
    return { body: urls.join('\n') + '\n', type: 'text/plain; charset=utf-8' };
  }
  return { body: toBase64(urls.join('\n')), type: 'text/plain; charset=utf-8' };
}
app.post('/api/login', (req, res) => {
  const username = String((req.body && req.body.username) || '');
  const password = String((req.body && req.body.password) || '');
  const key = auth.attemptKey(req, username);
  const blocked = auth.isBlocked(key);
  if (blocked.blocked) {
    return res.status(429).json({ error: '尝试次数过多，请 ' + blocked.retryAfter + ' 秒后再试' });
  }
  if (!auth.verifyCredentials(username, password)) {
    auth.recordFailure(key);
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  auth.recordSuccess(key);
  auth.setSessionCookie(res, auth.createToken());
  res.json({ authenticated: true, username: config.username });
});
app.post('/api/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});
app.get('/api/session', (req, res) => {
  if (auth.currentUser(req)) {
    return res.json({ authenticated: true, username: config.username });
  }
  res.json({ authenticated: false });
});
function toRuleSetView(item) {
  return {
    id: item.id,
    key: item.key,
    name: item.name,
    type: item.type,
    group: item.group,
    behavior: item.behavior,
    url: item.url,
    interval: item.interval,
    content: item.content,
    description: item.description,
    enabled: item.enabled !== false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}
function resolveGroupName(name) {
  const wanted = String(name || '').trim();
  const groups = store.listProxyGroups();
  if (wanted && groups.some((item) => item.name === wanted)) return wanted;
  if (wanted && ['DIRECT', 'REJECT', 'PASS'].includes(wanted)) return wanted;
  if (groups.some((item) => item.name === '🚀 节点选择')) return '🚀 节点选择';
  if (groups.length) return groups[0].name;
  return wanted || '🚀 节点选择';
}
function toProxyGroupView(item) {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    url: item.url,
    interval: item.interval,
    tolerance: item.tolerance,
    members: Array.isArray(item.members) ? item.members : [],
    enabled: item.enabled !== false,
    order: item.order || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}
function isReservedGroupName(name) {
  return ['DIRECT', 'REJECT', 'PASS'].includes(String(name || '').trim().toUpperCase());
}
function sanitizeProxyGroup(body) {
  const source = body || {};
  const typeRaw = String(source.type || 'select');
  const interval = Number(source.interval);
  const tolerance = Number(source.tolerance);
  return {
    name: String(source.name || '').trim().slice(0, 40) || '未命名策略组',
    type: ['select', 'url-test', 'fallback', 'load-balance'].includes(typeRaw) ? typeRaw : 'select',
    url: String(source.url || '').trim().slice(0, 300) || 'https://www.gstatic.com/generate_204',
    interval: Number.isFinite(interval) && interval >= 30 && interval <= 86400 ? Math.floor(interval) : 300,
    tolerance: Number.isFinite(tolerance) && tolerance >= 0 && tolerance <= 5000 ? Math.floor(tolerance) : 50,
    members: Array.isArray(source.members) ? source.members.map((item) => String(item)).slice(0, 60) : [],
    enabled: source.enabled !== false
  };
}
function resolveGroups(sub) {
  const all = store.listProxyGroups().filter((item) => item.enabled !== false);
  const ids = Array.isArray(sub && sub.clashGroupIds) ? sub.clashGroupIds : [];
  const picked = ids.length ? all.filter((item) => ids.includes(item.id)) : all;
  return picked.map((item) => ({
    name: item.name,
    type: item.type,
    url: item.url,
    interval: item.interval,
    tolerance: item.tolerance,
    members: Array.isArray(item.members) ? item.members.slice() : []
  }));
}
function sanitizeRuleSet(body) {
  const source = body || {};
  const type = String(source.type || 'url') === 'inline' ? 'inline' : 'url';
  const behaviorRaw = String(source.behavior || 'classical');
  const groupRaw = String(source.group || '');
  const interval = Number(source.interval);
  return {
    name: String(source.name || '').trim().slice(0, 60) || '未命名规则集',
    type,
    group: resolveGroupName(groupRaw),
    behavior: ['domain', 'ipcidr', 'classical'].includes(behaviorRaw) ? behaviorRaw : 'classical',
    url: String(source.url || '').trim().slice(0, 800),
    interval: Number.isFinite(interval) && interval >= 60 && interval <= 604800 ? Math.floor(interval) : 86400,
    content: String(source.content || '').slice(0, 200000),
    description: String(source.description || '').slice(0, 200),
    enabled: source.enabled !== false
  };
}
function resolveRuleSets(sub) {
  const ids = Array.isArray(sub && sub.clashRuleSetIds) ? sub.clashRuleSetIds : [];
  if (!ids.length) return [];
  const all = store.listRuleSets();
  return ids
    .map((id) => all.find((item) => item.id === id))
    .filter((item) => item && item.enabled !== false)
    .map((item) => ({
      key: item.key,
      type: item.type,
      behavior: item.behavior,
      url: item.url,
      interval: item.interval,
      content: item.content,
      group: item.group,
      name: item.name
    }));
}
app.get('/api/config/export', auth.requireAuth, (req, res) => {
  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    note: '仅包含策略组与规则集；订阅与分享令牌不会导出',
    proxyGroups: store.listProxyGroups().map(toProxyGroupView),
    ruleSets: store.listRuleSets().map(toRuleSetView)
  });
});
app.post('/api/config/import', auth.requireAuth, (req, res) => {
  const body = req.body || {};
  const mode = body.mode === 'overwrite' ? 'overwrite' : 'skip';
  const payload = body.data && typeof body.data === 'object' ? body.data : body;
  const groupInput = Array.isArray(payload.proxyGroups) ? payload.proxyGroups.slice(0, 500) : [];
  const ruleInput = Array.isArray(payload.ruleSets) ? payload.ruleSets.slice(0, 2000) : [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  for (const raw of groupInput) {
    if (!raw || !String(raw.name || '').trim()) {
      invalid += 1;
      continue;
    }
    const data = sanitizeProxyGroup(raw);
    if (isReservedGroupName(data.name)) {
      invalid += 1;
      continue;
    }
    const existing = store.listProxyGroups().find((item) => item.name === data.name);
    if (existing) {
      if (mode === 'overwrite') {
        store.updateProxyGroup(existing.id, data);
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    store.createProxyGroup(data);
    created += 1;
  }
  for (const raw of ruleInput) {
    if (!raw || !String(raw.name || '').trim()) {
      invalid += 1;
      continue;
    }
    const data = sanitizeRuleSet(raw);
    if ((data.type === 'url' && !data.url) || (data.type === 'inline' && !data.content.trim())) {
      invalid += 1;
      continue;
    }
    const existing = store.listRuleSets().find((item) => item.name === data.name);
    if (existing) {
      if (mode === 'overwrite') {
        store.updateRuleSet(existing.id, data);
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    store.createRuleSet(data);
    created += 1;
  }
  res.json({
    mode,
    created,
    updated,
    skipped,
    invalid,
    proxyGroups: store.listProxyGroups().length,
    ruleSets: store.listRuleSets().length
  });
});
app.get('/api/proxy-groups', auth.requireAuth, (req, res) => {
  res.json({ items: store.listProxyGroups().map(toProxyGroupView) });
});
app.post('/api/proxy-groups', auth.requireAuth, (req, res) => {
  const data = sanitizeProxyGroup(req.body);
  if (isReservedGroupName(data.name)) {
    return res.status(400).json({ error: 'DIRECT / REJECT / PASS 是内置策略，不能用作策略组名称' });
  }
  if (store.listProxyGroups().some((item) => item.name === data.name)) {
    return res.status(400).json({ error: '策略组名称已存在：' + data.name });
  }
  res.status(201).json(toProxyGroupView(store.createProxyGroup(data)));
});
app.put('/api/proxy-groups/:id', auth.requireAuth, (req, res) => {
  const existing = store.getProxyGroup(req.params.id);
  if (!existing) return res.status(404).json({ error: '策略组不存在' });
  const data = sanitizeProxyGroup(Object.assign({}, existing, req.body || {}));
  if (isReservedGroupName(data.name)) {
    return res.status(400).json({ error: 'DIRECT / REJECT / PASS 是内置策略，不能用作策略组名称' });
  }
  if (store.listProxyGroups().some((item) => item.id !== existing.id && item.name === data.name)) {
    return res.status(400).json({ error: '策略组名称已存在：' + data.name });
  }
  res.json(toProxyGroupView(store.updateProxyGroup(req.params.id, data)));
});
app.delete('/api/proxy-groups/:id', auth.requireAuth, (req, res) => {
  if (!store.removeProxyGroup(req.params.id)) return res.status(404).json({ error: '策略组不存在' });
  res.json({ ok: true });
});
app.post('/api/proxy-groups/reset', auth.requireAuth, (req, res) => {
  const seeded = store.ensureBuiltinGroups(CLASH_BUILTIN_GROUPS);
  res.json({ items: store.listProxyGroups().map(toProxyGroupView), created: seeded.created });
});
app.post('/api/rule-sets/import-preset', auth.requireAuth, (req, res) => {
  const preset = String((req.body && req.body.preset) || '');
  const definition = CLASH_PRESET_IMPORTS[preset];
  if (!definition) return res.status(400).json({ error: '不支持的预设：' + preset });
  const existing = new Set(store.listRuleSets().map((item) => item.name));
  const created = [];
  for (const item of definition.ruleSets) {
    if (existing.has(item.name)) continue;
    created.push(store.createRuleSet(sanitizeRuleSet(Object.assign({}, item, { group: resolveGroupName(item.group) }))));
  }
  res.json({
    items: created.map(toRuleSetView),
    skipped: definition.ruleSets.length - created.length
  });
});
app.get('/api/rule-sets', auth.requireAuth, (req, res) => {
  res.json({ items: store.listRuleSets().map(toRuleSetView) });
});
app.post('/api/rule-sets', auth.requireAuth, (req, res) => {
  const data = sanitizeRuleSet(req.body);
  if (data.type === 'url' && !data.url) return res.status(400).json({ error: '请填写规则文件链接' });
  if (data.type === 'inline' && !data.content.trim()) return res.status(400).json({ error: '请填写规则内容' });
  res.status(201).json(toRuleSetView(store.createRuleSet(data)));
});
app.put('/api/rule-sets/:id', auth.requireAuth, (req, res) => {
  const existing = store.getRuleSet(req.params.id);
  if (!existing) return res.status(404).json({ error: '规则集不存在' });
  const data = sanitizeRuleSet(Object.assign({}, existing, req.body || {}));
  res.json(toRuleSetView(store.updateRuleSet(req.params.id, data)));
});
app.delete('/api/rule-sets/:id', auth.requireAuth, (req, res) => {
  if (!store.removeRuleSet(req.params.id)) return res.status(404).json({ error: '规则集不存在' });
  res.json({ ok: true });
});
app.get('/api/subscriptions', auth.requireAuth, (req, res) => {
  res.json({ items: store.list().map((item) => toView(item, req)) });
});
app.post('/api/subscriptions', auth.requireAuth, (req, res) => {
  const data = sanitizeBody(req.body);
  if (!data.baseLink) return res.status(400).json({ error: '请填写原始 VLESS 链接' });
  const created = store.create(data);
  res.status(201).json(toView(created, req));
});
app.put('/api/subscriptions/:id', auth.requireAuth, (req, res) => {
  const existing = store.get(req.params.id);
  if (!existing) return res.status(404).json({ error: '订阅不存在' });
  const data = sanitizeBody(Object.assign({}, existing, req.body || {}));
  if (!data.baseLink) return res.status(400).json({ error: '请填写原始 VLESS 链接' });
  const updated = store.update(req.params.id, data);
  res.json(toView(updated, req));
});
app.delete('/api/subscriptions/:id', auth.requireAuth, (req, res) => {
  if (!store.remove(req.params.id)) return res.status(404).json({ error: '订阅不存在' });
  res.json({ ok: true });
});
app.post('/api/subscriptions/:id/rotate', auth.requireAuth, (req, res) => {
  const updated = store.rotateToken(req.params.id);
  if (!updated) return res.status(404).json({ error: '订阅不存在' });
  res.json(toView(updated, req));
});
app.post('/api/preview', auth.requireAuth, (req, res) => {
  const data = sanitizeBody(req.body);
  const result = generateSubscription(data);
  res.json({
    error: result.error || '',
    warnings: result.warnings || [],
    linkCount: result.links ? result.links.length : 0,
    limit: MAX_ENTRIES,
    parsed: result.parsed
      ? {
          host: result.parsed.host,
          port: result.parsed.port,
          sni: result.parsed.sni,
          hostHeader: result.parsed.hostHeader,
          path: result.parsed.path,
          net: result.parsed.net,
          security: result.parsed.security
        }
      : null,
    links: (result.links || []).slice(0, 10)
  });
});
app.get('/api/subscriptions/:id/export', auth.requireAuth, (req, res) => {
  const sub = store.get(req.params.id);
  if (!sub) return res.status(404).type('text/plain; charset=utf-8').send('订阅不存在');
  const result = generateSubscription(sub);
  if (result.error || !result.links.length) {
    return res.status(400).type('text/plain; charset=utf-8').send('生成失败：' + (result.error || '没有可用节点'));
  }
  const output = renderFormat(sub, result, req.query.format);
  res.setHeader('Cache-Control', 'no-store');
  res.type(output.type).send(output.body);
});
app.get('/sub/:token', (req, res) => {
  const sub = store.findByToken(req.params.token);
  if (!sub) return res.status(404).type('text/plain; charset=utf-8').send('订阅不存在或地址已失效');
  if (sub.enabled === false) return res.status(403).type('text/plain; charset=utf-8').send('该订阅已被停用');
  const result = generateSubscription(sub);
  if (result.error || !result.links.length) {
    return res.status(500).type('text/plain; charset=utf-8').send('订阅内容生成失败：' + (result.error || '没有可用节点'));
  }
  const format = String(req.query.format || detectFormat(req.headers['user-agent'])).toLowerCase();
  const output = renderFormat(sub, result, format);
  store.recordHit(sub.id);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Profile-Update-Interval', '12');
  res.type(output.type).send(output.body);
});
app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在' });
});
const indexHtml = path.join(config.webDist, 'index.html');
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false }));
}
app.get('*', (req, res) => {
  if (req.path.startsWith('/sub/')) {
    return res.status(404).type('text/plain; charset=utf-8').send('订阅不存在或地址已失效');
  }
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
  return res
    .status(503)
    .type('text/plain; charset=utf-8')
    .send('前端尚未构建：请先执行 pnpm install 与 pnpm run build，或使用 pnpm run dev:web 做本地开发。');
});
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法的 JSON' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: '服务器内部错误' });
});
const server = app.listen(config.port, config.host, () => {
  const lines = [];
  lines.push('VLESS 订阅中心已启动');
  lines.push(
    '  本机地址: http://localhost:' + config.port + (config.portFromWebPort ? '（未设置 PORT，按 WEB_PORT + 1 推导）' : '')
  );
  lines.push('  监听地址: ' + config.host + ':' + config.port);
  lines.push('  数据目录: ' + dataDir);
  if (!fs.existsSync(indexHtml)) {
    lines.push('  [提示] 前端尚未构建：生产模式请执行 pnpm run build');
  }
  if (!config.cookieSecure) {
    lines.push('  [提示] COOKIE_SECURE=false：若通过 HTTPS 对外提供服务，建议设为 true');
  }
  if (!config.publicBaseUrl) {
    lines.push('  [提示] 未设置 PUBLIC_BASE_URL，分享地址将按请求头自动推断');
  }
  console.log('\n' + lines.join('\n') + '\n');
});
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error('\n[启动失败] 端口 ' + config.port + ' 已被占用：可能已经有一个实例在运行。');
    console.error('修改 .env 中的 SERVER_PORT，或先停止占用该端口的进程后重试。\n');
    process.exit(1);
  }
  console.error('[启动失败]', err);
  process.exit(1);
});
function shutdown(signal) {
  console.log('\n收到 ' + signal + '，正在退出…');
  const done = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1200);
  };
  setTimeout(done, 900);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

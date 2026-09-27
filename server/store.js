import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from './config.js';
const DB_FILE = path.join(dataDir, 'db.json');
let db = { subscriptions: [], ruleSets: [], proxyGroups: [] };
let saveTimer = null;
load();
function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (parsed && Array.isArray(parsed.subscriptions)) {
      db = {
        subscriptions: parsed.subscriptions,
        ruleSets: Array.isArray(parsed.ruleSets) ? parsed.ruleSets : [],
        proxyGroups: Array.isArray(parsed.proxyGroups) ? parsed.proxyGroups : []
      };
    }
    if (!Array.isArray(db.ruleSets)) db.ruleSets = [];
    if (!Array.isArray(db.proxyGroups)) db.proxyGroups = [];
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[store] 读取数据文件失败：' + err.message);
  }
}
function persistNow() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('[store] 写入数据文件失败：' + err.message);
  }
}
function persistSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, 800);
  if (saveTimer && typeof saveTimer.unref === 'function') saveTimer.unref();
}
function newToken() {
  return crypto.randomBytes(18).toString('base64url');
}
export function list() {
  return db.subscriptions
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
export function get(id) {
  return db.subscriptions.find((item) => item.id === id) || null;
}
export function findByToken(token) {
  const value = String(token || '');
  if (!value) return null;
  return db.subscriptions.find((item) => item.shareToken === value) || null;
}
export function create(data) {
  const now = new Date().toISOString();
  const sub = {
    id: crypto.randomUUID(),
    shareToken: newToken(),
    hits: 0,
    lastAccessAt: null,
    createdAt: now,
    updatedAt: now,
    ...data
  };
  db.subscriptions.push(sub);
  persistNow();
  return sub;
}
export function update(id, data) {
  const sub = get(id);
  if (!sub) return null;
  Object.assign(sub, data, { updatedAt: new Date().toISOString() });
  persistNow();
  return sub;
}
export function remove(id) {
  const index = db.subscriptions.findIndex((item) => item.id === id);
  if (index < 0) return false;
  db.subscriptions.splice(index, 1);
  persistNow();
  return true;
}
export function rotateToken(id) {
  const sub = get(id);
  if (!sub) return null;
  sub.shareToken = newToken();
  sub.updatedAt = new Date().toISOString();
  persistNow();
  return sub;
}
export function recordHit(id) {
  const sub = get(id);
  if (!sub) return;
  sub.hits = (sub.hits || 0) + 1;
  sub.lastAccessAt = new Date().toISOString();
  persistSoon();
}
export function listRuleSets() {
  return db.ruleSets.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
}
export function getRuleSet(id) {
  return db.ruleSets.find((item) => item.id === id) || null;
}
export function createRuleSet(data) {
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    key: 'rs_' + crypto.randomBytes(4).toString('hex'),
    createdAt: now,
    updatedAt: now,
    ...data
  };
  db.ruleSets.push(item);
  persistNow();
  return item;
}
export function updateRuleSet(id, data) {
  const item = getRuleSet(id);
  if (!item) return null;
  Object.assign(item, data, { updatedAt: new Date().toISOString() });
  persistNow();
  return item;
}
export function removeRuleSet(id) {
  const index = db.ruleSets.findIndex((item) => item.id === id);
  if (index < 0) return false;
  db.ruleSets.splice(index, 1);
  persistNow();
  return true;
}
export function listProxyGroups() {
  return db.proxyGroups.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}
export function getProxyGroup(id) {
  return db.proxyGroups.find((item) => item.id === id) || null;
}
export function createProxyGroup(data) {
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    order: db.proxyGroups.length,
    createdAt: now,
    updatedAt: now,
    ...data
  };
  db.proxyGroups.push(item);
  persistNow();
  return item;
}
export function updateProxyGroup(id, data) {
  const item = getProxyGroup(id);
  if (!item) return null;
  Object.assign(item, data, { updatedAt: new Date().toISOString() });
  persistNow();
  return item;
}
export function removeProxyGroup(id) {
  const index = db.proxyGroups.findIndex((item) => item.id === id);
  if (index < 0) return false;
  db.proxyGroups.splice(index, 1);
  persistNow();
  return true;
}
export function ensureBuiltinGroups(builtin) {
  const names = new Set(db.proxyGroups.map((item) => item.name));
  const created = [];
  for (const group of Array.isArray(builtin) ? builtin : []) {
    if (!group || names.has(group.name)) continue;
    const now = new Date().toISOString();
    const item = {
      id: crypto.randomUUID(),
      name: group.name,
      type: group.type,
      url: group.url || 'https://www.gstatic.com/generate_204',
      interval: group.interval || 300,
      tolerance: group.tolerance == null ? 50 : group.tolerance,
      members: Array.isArray(group.members) ? group.members.slice() : [],
      enabled: true,
      order: db.proxyGroups.length,
      createdAt: now,
      updatedAt: now
    };
    db.proxyGroups.push(item);
    created.push(item);
  }
  if (created.length) persistNow();
  return { created: created.length, items: listProxyGroups() };
}

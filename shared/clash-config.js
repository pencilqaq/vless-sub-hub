/*
 * Clash / mihomo 完整配置生成：策略组 + 规则集 模式
 * - 策略组（proxy-groups）由管理页面维护，规则集（rule-providers/内联规则）各自指向某个策略组
 * - 本文件只负责把「策略组定义 + 规则集定义 + 节点列表」组装成一份完整 config
 */
import { toClashYaml } from './vless.js';
const jsonStr = (value) => JSON.stringify(String(value == null ? '' : value));
export const SPECIAL_PROXIES = ['DIRECT', 'REJECT', 'PASS'];
export const NODES_PLACEHOLDER = '__nodes__';
export const CLASH_GROUP_TYPES = ['select', 'url-test', 'fallback', 'load-balance'];
export const CLASH_BUILTIN_GROUPS = [
  { name: '🚀 节点选择', type: 'select', members: ['♻️ 自动选择', '🎯 全球直连', NODES_PLACEHOLDER] },
  {
    name: '♻️ 自动选择',
    type: 'url-test',
    url: 'https://www.gstatic.com/generate_204',
    interval: 300,
    tolerance: 50,
    members: [NODES_PLACEHOLDER]
  },
  { name: '📺 媒体', type: 'select', members: ['🚀 节点选择', '♻️ 自动选择', '🎯 全球直连', NODES_PLACEHOLDER] },
  { name: '🤖 AI', type: 'select', members: ['🚀 节点选择', '♻️ 自动选择', '🎯 全球直连', NODES_PLACEHOLDER] },
  { name: '📱 社交', type: 'select', members: ['🚀 节点选择', '♻️ 自动选择', '🎯 全球直连', NODES_PLACEHOLDER] },
  { name: '🎯 全球直连', type: 'select', members: ['DIRECT'] },
  { name: '🛑 广告拦截', type: 'select', members: ['REJECT', 'DIRECT'] },
  { name: '🐟 漏网之鱼', type: 'select', members: ['🚀 节点选择', 'DIRECT', NODES_PLACEHOLDER] }
];
const CLASH_BASIC_RULES = [
  'DOMAIN-SUFFIX,doubleclick.net,🛑 广告拦截',
  'DOMAIN-SUFFIX,googlesyndication.com,🛑 广告拦截',
  'DOMAIN-SUFFIX,googleadservices.com,🛑 广告拦截',
  'IP-CIDR,127.0.0.0/8,🎯 全球直连,no-resolve',
  'IP-CIDR,10.0.0.0/8,🎯 全球直连,no-resolve',
  'IP-CIDR,172.16.0.0/12,🎯 全球直连,no-resolve',
  'IP-CIDR,192.168.0.0/16,🎯 全球直连,no-resolve',
  'IP-CIDR,100.64.0.0/10,🎯 全球直连,no-resolve',
  'DOMAIN-SUFFIX,cn,🎯 全球直连',
  'DOMAIN-KEYWORD,-cn,🎯 全球直连',
  'GEOIP,CN,🎯 全球直连'
];
const LOYALSOILDIER_BASE = 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/';
const CLASH_LOYAL_PROVIDERS = [
  { key: 'reject', file: 'reject.txt', behavior: 'domain', group: '🛑 广告拦截' },
  { key: 'private', file: 'private.txt', behavior: 'domain', group: '🎯 全球直连' },
  { key: 'icloud', file: 'icloud.txt', behavior: 'domain', group: '🎯 全球直连' },
  { key: 'apple', file: 'apple.txt', behavior: 'domain', group: '🎯 全球直连' },
  { key: 'google', file: 'google.txt', behavior: 'domain', group: '🚀 节点选择' },
  { key: 'proxy', file: 'proxy.txt', behavior: 'domain', group: '🚀 节点选择' },
  { key: 'direct', file: 'direct.txt', behavior: 'domain', group: '🎯 全球直连' },
  { key: 'gfw', file: 'gfw.txt', behavior: 'domain', group: '🚀 节点选择' },
  { key: 'applications', file: 'applications.txt', behavior: 'domain', group: '🎯 全球直连' },
  { key: 'lancidr', file: 'lancidr.txt', behavior: 'ipcidr', group: '🎯 全球直连' }
];
const BM7_BASE = 'https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/';
const CLASH_BM7_PROVIDERS = [
  ['Advertising', '🛑 广告拦截'],
  ['Private', '🎯 全球直连'],
  ['Lan', '🎯 全球直连'],
  ['Apple', '🎯 全球直连'],
  ['Microsoft', '🚀 节点选择'],
  ['Google', '🚀 节点选择'],
  ['GitHub', '🚀 节点选择'],
  ['OpenAI', '🤖 AI'],
  ['Netflix', '📺 媒体'],
  ['YouTube', '📺 媒体'],
  ['Spotify', '📺 媒体'],
  ['Disney', '📺 媒体'],
  ['Telegram', '📱 社交'],
  ['Twitter', '📱 社交'],
  ['Facebook', '📱 社交'],
  ['Steam', '🎯 全球直连'],
  ['Bilibili', '🎯 全球直连'],
  ['ChinaMax', '🎯 全球直连'],
  ['Global', '🚀 节点选择']
];
/* 预设不再直接参与渲染，只作为"一键导入为规则集"的模板 */
export const CLASH_PRESET_IMPORTS = {
  basic: {
    label: '基础分流（内置规则，无需外网）',
    ruleSets: [
      {
        name: '基础分流（内置）',
        type: 'inline',
        group: '🎯 全球直连',
        content: CLASH_BASIC_RULES.join('\n'),
        description: '私有地址与 CN 直连、常见广告域名拦截'
      }
    ]
  },
  loyalsoldier: {
    label: 'Loyalsoldier/clash-rules',
    ruleSets: CLASH_LOYAL_PROVIDERS.map((item) => ({
      name: 'Loyalsoldier: ' + item.key,
      type: 'url',
      behavior: item.behavior,
      url: LOYALSOILDIER_BASE + item.file,
      interval: 86400,
      group: item.group,
      description: '来自 Loyalsoldier/clash-rules'
    }))
  },
  blackmatrix7: {
    label: 'blackmatrix7/ios_rule_script',
    ruleSets: CLASH_BM7_PROVIDERS.map(([key, group]) => ({
      name: 'blackmatrix7: ' + key,
      type: 'url',
      behavior: 'classical',
      url: BM7_BASE + key + '/' + key + '.yaml',
      interval: 86400,
      group,
      description: '来自 blackmatrix7/ios_rule_script'
    }))
  }
};
export function normalizeRuleLines(content, group) {
  const out = [];
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(',').map((item) => item.trim());
    if (parts.length === 2 && group) out.push(parts[0] + ',' + parts[1] + ',' + group);
    else if (parts.length === 3 && group && parts[2].toLowerCase() === 'no-resolve') {
      out.push(parts[0] + ',' + parts[1] + ',' + group + ',no-resolve');
    } else out.push(parts.join(','));
  }
  return out;
}
export function buildManagedRules(ruleSets) {
  const rules = [];
  for (const item of Array.isArray(ruleSets) ? ruleSets : []) {
    if (!item) continue;
    if (item.type === 'url') rules.push('RULE-SET,' + item.key + ',' + (item.group || ''));
    else rules.push(...normalizeRuleLines(item.content, item.group));
  }
  return rules;
}
export function buildManagedProviders(ruleSets) {
  const out = [];
  for (const item of Array.isArray(ruleSets) ? ruleSets : []) {
    if (!item || item.type !== 'url' || !item.url) continue;
    out.push({
      key: item.key,
      behavior: ['domain', 'ipcidr', 'classical'].includes(item.behavior) ? item.behavior : 'classical',
      url: item.url,
      interval: Number(item.interval) > 0 ? Number(item.interval) : 86400
    });
  }
  return out;
}
export function pickFinalGroup(groups, wanted) {
  const names = groups.map((item) => item.name);
  const target = String(wanted || '').trim();
  if (target && (names.includes(target) || SPECIAL_PROXIES.includes(target))) return target;
  if (names.includes('🐟 漏网之鱼')) return '🐟 漏网之鱼';
  return names[0] || 'DIRECT';
}
export function toClashConfig(parsed, links, options) {
  const opt = options || {};
  const rawPort = Number(opt.mixedPort);
  const mixedPort = Number.isFinite(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 7890;
  const nodeNames = links.map((item) => item.name);
  const sourceGroups = Array.isArray(opt.groups) && opt.groups.length ? opt.groups : CLASH_BUILTIN_GROUPS;
  const groups = sourceGroups.map((item, index) => ({
    name: String(item.name || '组 ' + (index + 1)),
    type: CLASH_GROUP_TYPES.includes(item.type) ? item.type : 'select',
    url: item.url || 'https://www.gstatic.com/generate_204',
    interval: Number(item.interval) > 0 ? Number(item.interval) : 300,
    tolerance: Number(item.tolerance) >= 0 ? Number(item.tolerance) : 50,
    members: Array.isArray(item.members) && item.members.length ? item.members.slice() : [NODES_PLACEHOLDER]
  }));
  const groupNames = groups.map((item) => item.name);
  const knownTargets = new Set(groupNames.concat(SPECIAL_PROXIES));
  const finalGroup = pickFinalGroup(groups, opt.finalGroup);
  const notes = [];
  const lines = [];
  lines.push('# 由 vless-sub-hub 生成的完整 Clash / mihomo 配置（策略组 + 规则集模式）');
  lines.push('# 策略组数量：' + groups.length + '；节点数量：' + links.length + '；默认策略组（MATCH）：' + finalGroup);
  lines.push('mixed-port: ' + mixedPort);
  lines.push('allow-lan: false');
  lines.push('bind-address: "*"');
  lines.push('mode: rule');
  lines.push('log-level: info');
  lines.push('ipv6: false');
  lines.push('external-controller: 127.0.0.1:9090');
  lines.push('unified-delay: true');
  lines.push('tcp-concurrent: true');
  lines.push('profile:');
  lines.push('  store-selected: true');
  lines.push('  store-fake-ip: true');
  lines.push('dns:');
  lines.push('  enable: true');
  lines.push('  ipv6: false');
  lines.push('  enhanced-mode: fake-ip');
  lines.push('  fake-ip-range: 198.18.0.1/16');
  lines.push('  nameserver:');
  lines.push('    - "223.5.5.5"');
  lines.push('    - "119.29.29.29"');
  lines.push('    - "https://doh.pub/dns-query"');
  lines.push('  fallback:');
  lines.push('    - "https://1.1.1.1/dns-query"');
  lines.push('    - "https://dns.google/dns-query"');
  lines.push('');
  lines.push(toClashYaml(parsed, links).trimEnd());
  lines.push('');
  lines.push('proxy-groups:');
  for (const group of groups) {
    lines.push('  - name: ' + jsonStr(group.name));
    lines.push('    type: ' + group.type);
    if (group.type !== 'select') {
      lines.push('    url: ' + jsonStr(group.url));
      lines.push('    interval: ' + group.interval);
    }
    if (group.type === 'url-test' || group.type === 'fallback') {
      lines.push('    tolerance: ' + group.tolerance);
    }
    const members = [];
    const missing = [];
    for (const raw of group.members) {
      const name = String(raw);
      if (name === NODES_PLACEHOLDER) {
        for (const node of nodeNames) if (!members.includes(node)) members.push(node);
      } else if (SPECIAL_PROXIES.includes(name) || groupNames.includes(name)) {
        if (!members.includes(name)) members.push(name);
      } else {
        missing.push(name);
      }
    }
    if (missing.length) notes.push('策略组「' + group.name + '」引用了不存在的成员：' + missing.join('、') + '（已忽略）');
    if (!members.length) members.push('DIRECT');
    lines.push('    proxies: [' + members.map(jsonStr).join(', ') + ']');
  }
  lines.push('');
  lines.push('rules:');
  const ruleTexts = [];
  for (const item of Array.isArray(opt.ruleSets) ? opt.ruleSets : []) {
    if (!item) continue;
    if (item.type === 'url') ruleTexts.push('RULE-SET,' + item.key + ',' + (item.group || finalGroup));
    else ruleTexts.push(...normalizeRuleLines(item.content, item.group));
  }
  for (const rule of normalizeRuleLines(opt.customRules, '')) ruleTexts.push(rule);
  for (const rule of ruleTexts) {
    const parts = rule.split(',');
    if (parts.length >= 3 && !knownTargets.has(parts[2])) {
      notes.push('规则「' + rule + '」的目标「' + parts[2] + '」不在本次策略组里，已改用 ' + finalGroup);
      parts[2] = finalGroup;
      lines.push('  - ' + jsonStr(parts.join(',')));
    } else {
      lines.push('  - ' + jsonStr(rule));
    }
  }
  lines.push('  - ' + jsonStr('MATCH,' + finalGroup));
  const providers = buildManagedProviders(opt.ruleSets);
  if (providers.length) {
    lines.push('');
    lines.push('rule-providers:');
    for (const provider of providers) {
      lines.push('  ' + provider.key + ':');
      lines.push('    type: http');
      lines.push('    behavior: ' + provider.behavior);
      lines.push('    url: ' + jsonStr(provider.url));
      lines.push('    path: ./ruleset/' + provider.key + '.yaml');
      lines.push('    interval: ' + (Number(provider.interval) > 0 ? Number(provider.interval) : 86400));
    }
  }
  if (notes.length) {
    const header = lines.slice(0, 3).concat(notes.map((note) => '# 注意：' + note)).concat(lines.slice(3));
    return header.join('\n') + '\n';
  }
  return lines.join('\n') + '\n';
}

/*
 * 规则行以文本形式存储（Clash / mihomo 原生格式），界面上按三段式编辑：
 * 匹配方式 / 匹配内容 / 命中后走哪个策略组。
 * 这里同时给服务端（远程规则预览）和前端（规则编辑器）复用。
 */
export const RULE_MODIFIERS = ['no-resolve'];
export const RULE_TYPES = [
  { value: 'DOMAIN', label: 'DOMAIN · 精确域名', hint: 'example.com' },
  { value: 'DOMAIN-SUFFIX', label: 'DOMAIN-SUFFIX · 域名后缀', hint: 'example.com' },
  { value: 'DOMAIN-KEYWORD', label: 'DOMAIN-KEYWORD · 域名关键字', hint: 'google' },
  { value: 'DOMAIN-REGEX', label: 'DOMAIN-REGEX · 域名正则', hint: '^ads?\\.' },
  { value: 'GEOSITE', label: 'GEOSITE · GeoSite 分类', hint: 'openai' },
  { value: 'GEOIP', label: 'GEOIP · 国家/地区', hint: 'CN', noResolve: true },
  { value: 'IP-CIDR', label: 'IP-CIDR · IPv4 网段', hint: '1.2.3.0/24', noResolve: true },
  { value: 'IP-CIDR6', label: 'IP-CIDR6 · IPv6 网段', hint: '2001:db8::/32', noResolve: true },
  { value: 'SRC-IP-CIDR', label: 'SRC-IP-CIDR · 来源网段', hint: '192.168.0.0/16', noResolve: true },
  { value: 'IP-ASN', label: 'IP-ASN · AS 编号', hint: '15169', noResolve: true },
  { value: 'DST-PORT', label: 'DST-PORT · 目标端口', hint: '443' },
  { value: 'SRC-PORT', label: 'SRC-PORT · 来源端口', hint: '1024-65535' },
  { value: 'PROCESS-NAME', label: 'PROCESS-NAME · 进程名', hint: 'Telegram.exe' },
  { value: 'PROCESS-PATH', label: 'PROCESS-PATH · 进程路径', hint: '/usr/bin/telegram' },
  { value: 'RULE-SET', label: 'RULE-SET · 引用规则集', hint: 'provider-key' },
  { value: 'MATCH', label: 'MATCH · 兜底（全部命中）', hint: '无需填写内容' }
];
const RULE_TYPE_MAP = new Map(RULE_TYPES.map((item) => [item.value, item]));
export function ruleTypeMeta(type) {
  return RULE_TYPE_MAP.get(String(type || '').trim().toUpperCase()) || null;
}
export function isKnownRuleType(type) {
  return Boolean(ruleTypeMeta(type));
}
export function supportsNoResolve(type) {
  const meta = ruleTypeMeta(type);
  return Boolean(meta && meta.noResolve);
}
function normalizeType(type) {
  const raw = String(type || '').trim();
  const upper = raw.toUpperCase();
  return RULE_TYPE_MAP.has(upper) ? upper : raw;
}
function isModifier(value) {
  return RULE_MODIFIERS.includes(String(value || '').trim().toLowerCase());
}

/*
 * 文本 -> 行对象 { type, value, target, extra }
 * - 只写两段（TYPE,value）时 target 为空，表示"用规则集的目标策略组"
 * - 第三段是 no-resolve 之类的修饰符时也视为未指定目标
 * - 形态复杂/未知的规则（AND/OR/NOT 等）把第一段之后的原文整段放进 value，保证往返不丢内容
 */
export function parseRuleLines(content) {
  const rows = [];
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(',').map((item) => item.trim());
    const type = normalizeType(parts.shift());
    if (!type) continue;
    if (type.toUpperCase() === 'MATCH') {
      rows.push({ type: 'MATCH', value: '', target: parts.join(',').trim(), extra: [] });
      continue;
    }
    const extra = [];
    while (parts.length > 1 && isModifier(parts[parts.length - 1])) extra.unshift(parts.pop().toLowerCase());
    if (!parts.length) continue;
    if (parts.length === 1) {
      rows.push({ type, value: parts[0], target: '', extra });
      continue;
    }
    if (parts.length === 2) {
      rows.push({ type, value: parts[0], target: parts[1], extra });
      continue;
    }
    const tail = parts.join(',');
    rows.push({ type, value: extra.length ? tail + ',' + extra.join(',') : tail, target: '', extra: [] });
  }
  return rows;
}

export function formatRuleLines(rows) {
  const lines = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const type = normalizeType(row.type);
    if (!type) continue;
    const value = String(row.value == null ? '' : row.value).trim();
    const target = String(row.target == null ? '' : row.target).trim();
    if (type.toUpperCase() === 'MATCH') {
      if (target) lines.push('MATCH,' + target);
      continue;
    }
    if (!value) continue;
    const parts = [type, value];
    if (target) parts.push(target);
    for (const extra of Array.isArray(row.extra) ? row.extra : []) {
      const modifier = String(extra || '').trim().toLowerCase();
      if (modifier) parts.push(modifier);
    }
    lines.push(parts.join(','));
  }
  return lines.join('\n');
}

export function countRuleLines(content) {
  return parseRuleLines(content).length;
}


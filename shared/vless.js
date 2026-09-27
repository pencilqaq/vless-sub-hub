/*
 * VLESS(WS+TLS+CDN) 链接生成核心逻辑（前后端共用）
 * 浏览器端用于实时预览，Node 端用于生成订阅内容。
 * 纯 ESM，唯一的环境差异点是 Base64 编码，已做兼容。
 */
/**
 * 节点名模板：模板输出就是最终节点名，客户端里显示的就是它，
 * 不会再自动拼接 vless:// 链接中 # 后面的原备注。
 * 只有模板里显式写了 {name} 才会引用原备注，{remark} 引用 IP 行备注。
 */
export const DEFAULT_NAME_TEMPLATE = '{ip}-{port}';
export const MAX_ENTRIES = 5000;
export function splitHostPort(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return { host: '', port: '' };
  if (s.charAt(0) === '[') {
    const end = s.indexOf(']');
    if (end < 0) return { host: s, port: '' };
    const rest = s.slice(end + 1);
    const m = /^:(\d{1,5})$/.exec(rest);
    return { host: s.slice(1, end), port: m ? m[1] : '' };
  }
  const colons = (s.match(/:/g) || []).length;
  if (colons === 1) {
    const i = s.indexOf(':');
    return { host: s.slice(0, i), port: s.slice(i + 1) };
  }
  return { host: s, port: '' };
}
export function parseVless(rawInput) {
  const raw = String(rawInput == null ? '' : rawInput).replace(/[\r\n\t]+/g, ' ').trim();
  if (!raw) throw new Error('请先填写 3x-ui 提供的 VLESS 链接');
  const scheme = /^vless:\/\//i.exec(raw);
  if (!scheme) throw new Error('链接必须以 vless:// 开头');
  let rest = raw.slice(scheme[0].length);
  let frag = '';
  const h = rest.indexOf('#');
  if (h >= 0) { frag = rest.slice(h + 1); rest = rest.slice(0, h); }
  let query = '';
  const q = rest.indexOf('?');
  if (q >= 0) { query = rest.slice(q + 1); rest = rest.slice(0, q); }
  const at = rest.lastIndexOf('@');
  if (at < 0) throw new Error('链接缺少 “UUID@地址” 结构');
  const uuid = rest.slice(0, at).trim();
  if (!uuid) throw new Error('未找到 UUID');
  const hp = splitHostPort(rest.slice(at + 1));
  if (!hp.host) throw new Error('未找到服务器地址');
  if (hp.port && !/^\d{1,5}$/.test(hp.port)) throw new Error('端口格式不正确：' + hp.port);
  const params = new URLSearchParams(query);
  const security = (params.get('security') || '').toLowerCase();
  const net = (params.get('type') || 'tcp').toLowerCase();
  let fragText = frag;
  try { fragText = decodeURIComponent(frag); } catch (e) { fragText = frag; }
  return {
    raw, uuid, host: hp.host, port: hp.port, query, params, frag: fragText,
    security, net,
    sni: params.get('sni') || '',
    hostHeader: params.get('host') || '',
    path: params.get('path') || ''
  };
}
export function tlsEnabled(parsed) {
  if (!parsed.security) return true;
  return parsed.security !== 'none';
}
export function formatHost(host) {
  const s = String(host).trim();
  if (s.indexOf(':') >= 0 && s.charAt(0) !== '[') return '[' + s + ']';
  return s;
}
export function buildVless(parsed, host, port, name) {
  const authority = formatHost(host) + (port ? ':' + port : '');
  const qs = parsed.query ? '?' + parsed.query : '';
  const frag = name ? '#' + encodeURIComponent(name) : '';
  return 'vless://' + parsed.uuid + '@' + authority + qs + frag;
}
export function isIPv4(s) {
  const parts = String(s).split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    if (Number(p) > 255) return false;
  }
  return true;
}
export function isIPv6(s) {
  return String(s).indexOf(':') >= 0 && /^[0-9a-fA-F:.]+$/.test(String(s));
}
export function isHostname(s) {
  return /^(?=.{1,253}$)([a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(String(s));
}
export function parseIpLine(rawLine) {
  let s = String(rawLine == null ? '' : rawLine).trim();
  if (!s) return { empty: true };
  if (s.charAt(0) === '#' || s.indexOf('//') === 0) return { comment: true };
  let remark = '';
  const hash = s.indexOf('#');
  if (hash > 0) { remark = s.slice(hash + 1).trim(); s = s.slice(0, hash).trim(); }
  if (!remark) {
    const m = /^(\S+)[\s,|]+(.+)$/.exec(s);
    if (m) {
      const tail = m[2].trim();
      if (/^\d{1,5}$/.test(tail) && Number(tail) >= 1 && Number(tail) <= 65535 && m[1].indexOf(':') < 0) {
        s = m[1] + ':' + tail;
      } else {
        s = m[1];
        remark = tail;
      }
    }
  }
  s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  const atIndex = s.lastIndexOf('@');
  if (atIndex >= 0) s = s.slice(atIndex + 1);
  if (s.charAt(0) === '[') {
    const close = s.indexOf(']');
    if (close > 0) s = s.slice(0, close + 1) + s.slice(close + 1).split(/[\/?#]/)[0];
  } else {
    s = s.split(/[\/?#]/)[0];
  }
  s = s.replace(/\/+$/, '').trim();
  if (!s) return null;
  const hp = splitHostPort(s);
  let host = (hp.host || '').trim().replace(/\.$/, '');
  const port = (hp.port || '').trim();
  if (!host) return null;
  if (host.charAt(0) === '[' && host.charAt(host.length - 1) === ']') host = host.slice(1, -1);
  if (!isIPv4(host) && !isIPv6(host) && !isHostname(host)) return null;
  if (port) {
    if (!/^\d{1,5}$/.test(port)) return null;
    if (Number(port) < 1 || Number(port) > 65535) return null;
  }
  return { host, port, remark };
}
export function renderName(template, ctx) {
  let out = String(template == null ? '' : template).trim() || DEFAULT_NAME_TEMPLATE;
  const map = {
    '{name}': ctx.name || '',
    '{remark}': ctx.remark || '',
    '{ip}': ctx.ip || '',
    '{port}': ctx.port == null ? '' : String(ctx.port),
    '{index}': String(ctx.index),
    '{domain}': ctx.domain || ''
  };
  for (const key of Object.keys(map)) out = out.split(key).join(map[key]);
  out = out.replace(/\s+/g, ' ').trim();
  out = out.replace(/^[\s\-_|,.，、]+/, '').replace(/[\s\-_|,.，、]+$/, '');
  out = out.replace(/-{2,}/g, '-').replace(/\s+-\s*/g, '-').replace(/-\s+/g, '-');
  return out || ctx.ip || 'node';
}
export function parseExtraPorts(text) {
  return String(text || '')
    .split(/[,\s，、]+/)
    .map((x) => x.trim())
    .filter((x) => /^\d{1,5}$/.test(x) && Number(x) >= 1 && Number(x) <= 65535);
}
export const KNOWN_PARAM_KEYS = new Set([
  'encryption', 'type', 'security', 'sni', 'host', 'path', 'fp', 'alpn', 'flow',
  'headerType', 'serviceName', 'mode', 'ed', 'eh', 'seed', 'quicSecurity', 'key',
  'allowInsecure', 'packetEncoding', 'pbk', 'sid', 'spx', 'pqv', 'mldsa65Verify'
]);
/**
 * 解析"参数批量替换"文本：每行一个 key=value（也支持用 & 分隔）。
 * 值留空表示删除该参数；以 # 开头的行是注释。
 */
export function parseParamOverrides(text) {
  const out = [];
  for (const rawLine of String(text || '').split(/[\r\n&]+/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) continue;
    out.push({ key, value });
  }
  return out;
}
/**
 * 把替换规则应用到已解析的链接上（原地修改），
 * 同时同步 query / params / sni / host / path / net / security 等派生字段。
 */
export function applyParamOverrides(parsed, overrides) {
  if (!parsed || !overrides || !overrides.length) return parsed;
  const params = new URLSearchParams(parsed.query || '');
  for (const item of overrides) {
    if (item.value === '') params.delete(item.key);
    else params.set(item.key, item.value);
  }
  parsed.query = params.toString();
  parsed.params = params;
  parsed.security = (params.get('security') || '').toLowerCase();
  parsed.net = (params.get('type') || 'tcp').toLowerCase();
  parsed.sni = params.get('sni') || '';
  parsed.hostHeader = params.get('host') || '';
  parsed.path = params.get('path') || '';
  return parsed;
}
export function normalizeOptions(sub) {
  const s = sub || {};
  return {
    baseLink: String(s.baseLink || '').trim(),
    ipText: String(s.ipText || ''),
    extraPorts: s.extraPorts || '',
    nameTemplate: s.nameTemplate || DEFAULT_NAME_TEMPLATE,
    paramOverrides: String(s.paramOverrides || ''),
    clashMode: s.clashMode === 'full' ? 'full' : 'fragment',
    clashPreset: s.clashPreset || 'basic',
    clashCustomRules: String(s.clashCustomRules || ''),
    clashMixedPort: String(s.clashMixedPort || '7890'),
    useLinePort: s.useLinePort !== false,
    dedupe: s.dedupe !== false
  };
}
export function parseIpList(text, options) {
  const opt = options || {};
  const useLinePort = opt.useLinePort !== false;
  const dedupe = opt.dedupe !== false;
  const extraPorts = Array.isArray(opt.extraPorts) ? opt.extraPorts : [];
  const fallbackPort = opt.fallbackPort ? String(opt.fallbackPort) : '';
  const limit = Number(opt.limit) > 0 ? Number(opt.limit) : MAX_ENTRIES;
  const lines = String(text || '').split(/\r?\n/);
  const entries = [];
  const badLines = [];
  const seen = new Set();
  let duplicates = 0;
  let truncated = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const item = parseIpLine(line);
    if (!item) { badLines.push(line.trim()); continue; }
    if (item.empty || item.comment) continue;
    let ports;
    if (item.port && useLinePort) ports = [item.port];
    else if (extraPorts.length) ports = extraPorts;
    else ports = [item.port || fallbackPort];
    for (const rawPort of ports) {
      const port = rawPort ? String(rawPort) : '';
      const key = item.host.toLowerCase() + ':' + port;
      if (dedupe && seen.has(key)) { duplicates += 1; continue; }
      seen.add(key);
      if (entries.length >= limit) { truncated += 1; continue; }
      entries.push({ host: item.host, port, remark: item.remark });
    }
  }
  return { entries, badLines, duplicates, truncated };
}
export function generateSubscription(sub) {
  const opt = normalizeOptions(sub);
  const warnings = [];
  if (!opt.baseLink) {
    return { error: '缺少原始 VLESS 链接', warnings, entries: [], links: [], parsed: null };
  }
  let parsed;
  try {
    parsed = parseVless(opt.baseLink);
  } catch (err) {
    return { error: err.message, warnings, entries: [], links: [], parsed: null };
  }
  const overrideList = parseParamOverrides(opt.paramOverrides);
  if (overrideList.length) {
    applyParamOverrides(parsed, overrideList);
    const unknown = overrideList.filter((item) => !KNOWN_PARAM_KEYS.has(item.key)).map((item) => item.key);
    if (unknown.length) {
      warnings.push('以下参数不是常见的 VLESS 参数，仍会原样写入链接：' + unknown.join(', '));
    }
  }
  const tls = tlsEnabled(parsed);
  const fallbackPort = parsed.port || (tls ? '443' : '80');
  if (!parsed.port) warnings.push('原始链接没有端口，已按 ' + fallbackPort + ' 处理。');
  if (parsed.security === 'none') warnings.push('原始链接 security=none，本方案通常应为 security=tls，请确认链接是否正确。');
  if (!parsed.security) warnings.push('原始链接没有 security 参数，已按 TLS 处理，请确认链接是否正确。');
  if (tls && !parsed.sni && !parsed.hostHeader) warnings.push('链接里没有 sni 也没有 host，Cloudflare 无法判断回源域名，生成结果可能连不上。');
  if (parsed.net === 'ws' && !parsed.hostHeader) warnings.push('链接里没有 host 参数：WS 握手的 Host 头会变成 IP，CDN 可能返回 404/520，建议在 3x-ui 中补上域名后再导出。');
  if (parsed.net !== 'ws') warnings.push('原始链接的网络类型是 ' + parsed.net + '，本方案常用 ws，参数已原样保留。');
  if (parsed.security === 'reality') warnings.push('检测到 reality：Clash / sing-box 导出未包含 reality 公钥等字段，需要自行补充。');
  const extraPorts = parseExtraPorts(opt.extraPorts);
  const list = parseIpList(opt.ipText, {
    useLinePort: opt.useLinePort,
    extraPorts,
    dedupe: opt.dedupe,
    fallbackPort
  });
  if (list.badLines.length) {
    warnings.push('有 ' + list.badLines.length + ' 行无法识别已跳过：' + list.badLines.slice(0, 3).join(' / ') + (list.badLines.length > 3 ? ' …' : ''));
  }
  if (list.duplicates) warnings.push('按 IP:端口 去重，跳过 ' + list.duplicates + ' 条重复项。');
  if (list.truncated) warnings.push('条目过多，已截断，最多生成 ' + MAX_ENTRIES + ' 条。');
  if (!list.entries.length) warnings.push('没有解析到可用 IP，请补充 IP 列表。');
  const links = list.entries.map((entry, i) => {
    const name = renderName(opt.nameTemplate, {
      name: parsed.frag,
      remark: entry.remark,
      ip: entry.host,
      port: entry.port,
      index: i + 1,
      domain: parsed.host
    });
    return {
      index: i + 1,
      name,
      host: entry.host,
      port: entry.port,
      url: buildVless(parsed, entry.host, entry.port, name)
    };
  });
  if (links.length > 1) {
    const uniqueNames = new Set(links.map((item) => item.name));
    if (uniqueNames.size === 1) {
      warnings.push('所有节点名称相同（模板里没有 {ip}/{index} 等占位符），客户端里无法区分，建议加上 {ip} 或 {index}。');
    } else if (uniqueNames.size < links.length) {
      warnings.push('有 ' + (links.length - uniqueNames.size) + ' 个节点名称重复，建议在模板中加入 {ip} 或 {index} 区分。');
    }
  }
  return { parsed, entries: list.entries, links, warnings, error: '' };
}
function jsonStr(v) {
  return JSON.stringify(String(v == null ? '' : v));
}
export function toClashYaml(parsed, links) {
  const tls = tlsEnabled(parsed);
  const lines = ['proxies:'];
  for (const link of links) {
    lines.push('  - name: ' + jsonStr(link.name));
    lines.push('    type: vless');
    lines.push('    server: ' + jsonStr(link.host));
    lines.push('    port: ' + (link.port || 443));
    lines.push('    uuid: ' + jsonStr(parsed.uuid));
    lines.push('    udp: true');
    lines.push('    tls: ' + (tls ? 'true' : 'false'));
    if (tls) {
      const sni = parsed.params.get('sni') || parsed.hostHeader || parsed.host;
      lines.push('    servername: ' + jsonStr(sni));
      if (parsed.params.get('fp')) lines.push('    client-fingerprint: ' + jsonStr(parsed.params.get('fp')));
      if (parsed.params.get('alpn')) {
        lines.push('    alpn:');
        for (const a of parsed.params.get('alpn').split(',')) {
          if (a.trim()) lines.push('      - ' + jsonStr(a.trim()));
        }
      }
    }
    if (parsed.net === 'ws') {
      lines.push('    network: ws');
      lines.push('    ws-opts:');
      lines.push('      path: ' + jsonStr(parsed.path || '/'));
      if (parsed.hostHeader) {
        lines.push('      headers:');
        lines.push('        Host: ' + jsonStr(parsed.hostHeader));
      }
    } else if (parsed.net === 'grpc') {
      lines.push('    network: grpc');
      lines.push('    grpc-opts:');
      lines.push('      grpc-service-name: ' + jsonStr(parsed.params.get('serviceName') || parsed.path || ''));
    } else {
      lines.push('    network: ' + parsed.net);
      if (parsed.params.get('flow')) lines.push('    flow: ' + jsonStr(parsed.params.get('flow')));
    }
  }
  return lines.join('\n') + '\n';
}
export function toSingboxJson(parsed, links) {
  const tls = tlsEnabled(parsed);
  const outbounds = links.map((link) => {
    const o = {
      type: 'vless',
      tag: link.name,
      server: link.host,
      server_port: Number(link.port) || 443,
      uuid: parsed.uuid
    };
    if (parsed.params.get('flow')) o.flow = parsed.params.get('flow');
    if (tls) {
      o.tls = { enabled: true };
      const sni = parsed.params.get('sni') || parsed.hostHeader || parsed.host;
      if (sni) o.tls.server_name = sni;
      if (parsed.params.get('fp')) o.tls.utls = { enabled: true, fingerprint: parsed.params.get('fp') };
      if (parsed.params.get('alpn')) {
        o.tls.alpn = parsed.params.get('alpn').split(',').map((a) => a.trim()).filter(Boolean);
      }
    }
    if (parsed.net === 'ws') {
      o.transport = { type: 'ws', path: parsed.path || '/' };
      if (parsed.hostHeader) o.transport.headers = { Host: parsed.hostHeader };
    } else if (parsed.net === 'grpc') {
      o.transport = { type: 'grpc', service_name: parsed.params.get('serviceName') || parsed.path || '' };
    } else if (parsed.net !== 'tcp') {
      o.transport = { type: parsed.net };
    }
    return o;
  });
  return JSON.stringify({ outbounds }, null, 2) + '\n';
}
export function toBase64(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(String(str), 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(String(str));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function detectFormat(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (ua.includes('clash') || ua.includes('mihomo') || ua.includes('stash') || ua.includes('verge')) return 'clash';
  if (ua.includes('sing-box') || ua.includes('singbox')) return 'singbox';
  return 'base64';
}

async function request(method, url, body) {
  const options = {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json' }
  };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    const error = new Error('无法连接服务器，请确认后端已启动');
    error.status = 0;
    throw error;
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const error = new Error((data && (data.error || data.message)) || '请求失败（' + res.status + '）');
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}
export const api = {
  session() {
    return request('GET', '/api/session');
  },
  login(username, password) {
    return request('POST', '/api/login', { username, password });
  },
  logout() {
    return request('POST', '/api/logout', {});
  },
  list() {
    return request('GET', '/api/subscriptions');
  },
  create(payload) {
    return request('POST', '/api/subscriptions', payload);
  },
  update(id, payload) {
    return request('PUT', '/api/subscriptions/' + encodeURIComponent(id), payload);
  },
  remove(id) {
    return request('DELETE', '/api/subscriptions/' + encodeURIComponent(id));
  },
  rotate(id) {
    return request('POST', '/api/subscriptions/' + encodeURIComponent(id) + '/rotate', {});
  },
  preview(payload) {
    return request('POST', '/api/preview', payload);
  },
  exportConfig() {
    return request('GET', '/api/config/export');
  },
  importConfig(payload) {
    return request('POST', '/api/config/import', payload);
  },
  proxyGroups() {
    return request('GET', '/api/proxy-groups');
  },
  createProxyGroup(payload) {
    return request('POST', '/api/proxy-groups', payload);
  },
  updateProxyGroup(id, payload) {
    return request('PUT', '/api/proxy-groups/' + encodeURIComponent(id), payload);
  },
  removeProxyGroup(id) {
    return request('DELETE', '/api/proxy-groups/' + encodeURIComponent(id));
  },
  resetProxyGroups() {
    return request('POST', '/api/proxy-groups/reset', {});
  },
  importRulePreset(preset) {
    return request('POST', '/api/rule-sets/import-preset', { preset });
  },
  ruleSets() {
    return request('GET', '/api/rule-sets');
  },
  createRuleSet(payload) {
    return request('POST', '/api/rule-sets', payload);
  },
  updateRuleSet(id, payload) {
    return request('PUT', '/api/rule-sets/' + encodeURIComponent(id), payload);
  },
  removeRuleSet(id) {
    return request('DELETE', '/api/rule-sets/' + encodeURIComponent(id));
  },
  async exportText(id, format) {
    const res = await fetch('/api/subscriptions/' + encodeURIComponent(id) + '/export?format=' + encodeURIComponent(format), {
      credentials: 'include'
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || '导出失败');
    }
    return res.text();
  }
};

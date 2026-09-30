/*
 * 多设备同步：把学习进度存进你自己 GitHub 账号下的一个私密 Gist。
 * 只需要一个只勾选了 gist 权限的 token；token 只保存在当前浏览器。
 */
window.GistSync = (() => {
  'use strict';
  const API = 'https://api.github.com';
  const FILE = 'speakup-progress.json';
  const KEY = 'speakup.sync';

  function config() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function saveConfig(c) { localStorage.setItem(KEY, JSON.stringify(c)); }
  const ready = () => { const c = config(); return !!(c.token && c.gistId); };

  async function req(method, path, token, body) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch (e) {
      throw new Error('连不上 GitHub，稍后会自动重试');
    }
    if (res.status === 401) throw new Error('GitHub token 无效或已过期');
    if (res.status === 403) throw new Error('token 没有 gist 权限，或请求太频繁');
    if (res.status === 404) throw new Error('找不到同步用的 Gist（可能被删了），请重新连接');
    if (!res.ok) throw new Error(`GitHub 出错（${res.status}）`);
    return res.status === 204 ? null : res.json();
  }

  /** 在账号下找已有的进度 Gist（第二台设备只需要填同一个 token） */
  async function find(token) {
    for (let page = 1; page <= 5; page++) {
      const list = await req('GET', `/gists?per_page=100&page=${page}`, token);
      const hit = list.find(g => g.files && g.files[FILE]);
      if (hit) return hit.id;
      if (list.length < 100) break;
    }
    return null;
  }

  async function create(token, data) {
    const g = await req('POST', '/gists', token, {
      description: 'SpeakUp 英语精进 · 学习进度（自动同步，请勿手动修改）',
      public: false,
      files: { [FILE]: { content: JSON.stringify(data) } },
    });
    return g.id;
  }

  async function read(token, id) {
    const g = await req('GET', `/gists/${id}`, token);
    const f = g.files && g.files[FILE];
    if (!f) return null;
    let text = f.content;
    if (f.truncated) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
    return JSON.parse(text);
  }

  function write(token, id, data) {
    return req('PATCH', `/gists/${id}`, token, { files: { [FILE]: { content: JSON.stringify(data) } } });
  }

  return { FILE, config, saveConfig, ready, find, create, read, write };
})();

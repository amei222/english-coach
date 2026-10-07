/* SpeakUp · 英语精进 —— 主程序（目标：雅思 G 类 5.5 + 打工度假） */
(() => {
  'use strict';

  const STORE = 'speakup.v2';
  const CHATS = 'speakup.chats';
  const DRILLS = 'speakup.drills';     // 口语练习（含回答全文，只存本机）
  const WDRAFT = 'speakup.wdraft';     // 写作草稿
  const WLOG = 'speakup.wlog';         // 写作批改记录（只存本机）
  const MATURE = 21;                   // 复习间隔 ≥ 21 天视为已掌握
  const SLOW = 0.6;
  const MONO_SECONDS = 60;             // 没有 AI 时：Part 2 独白至少说 1 分钟
  const PART2_LIMIT = 120;             // Part 2 最多说 2 分钟
  const PREP_SECONDS = 60;             // Part 2 准备 1 分钟

  // ================= 工具 =================
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); };
  const dayIndex = k => Math.round(parseDay(k).getTime() / 86400000);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const uniq = a => [...new Set(a)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmtSecs = s => `${Math.floor((s || 0) / 60)}:${pad(Math.floor((s || 0) % 60))}`;
  const wordCount = t => (String(t || '').match(/[A-Za-z0-9'’-]+/g) || []).length;
  const loadJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };

  function seededShuffle(arr, seed) {
    const a = arr.slice();
    let s = seed >>> 0;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function roundRobin(lists) {
    const out = [];
    const max = Math.max(0, ...lists.map(l => l.length));
    for (let i = 0; i < max; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
    return out;
  }

  // 比对用：统一大小写、引号、连字符；连在一起的数字合并（$4.50 = 4.50）；0–20 的数字转成单词
  const NUMS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
  const isNum = t => /^\d+$/.test(t);
  function norm(s) {
    const out = [];
    String(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9'\s-]/g, ' ').replace(/-/g, ' ')
      .split(/\s+/).map(t => t.replace(/^'+|'+$/g, '')).filter(Boolean)
      .forEach(t => { if (isNum(t) && out.length && isNum(out[out.length - 1])) out[out.length - 1] += t; else out.push(t); });
    return out.map(t => (isNum(t) && +t <= 20 ? NUMS[+t] : t));
  }

  function wordsHtml(text, okFn, badCls) {
    return String(text).split(/\s+/).filter(Boolean)
      .map((w, i) => `<span class="${okFn(w, i) ? 'hit' : badCls}">${esc(w)}</span>`).join(' ');
  }

  // 逐词最长公共子序列比对（听写、跟读）。电话号码这类分开写的数字也合在一起比
  function diffWords(target, input) {
    const tok = s => {
      const words = String(s).split(/\s+/).filter(Boolean), flat = [], owner = [];
      words.forEach((w, i) => norm(w).forEach(t => {
        const p = flat.length - 1;
        if (p >= 0 && isNum(t) && isNum(flat[p]) && owner[p][owner[p].length - 1] === i - 1) { flat[p] += t; owner[p].push(i); }
        else { flat.push(t); owner.push([i]); }
      }));
      return { words, flat, owner };
    };
    const A = tok(target), B = tok(input);
    const n = A.flat.length, m = B.flat.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A.flat[i] === B.flat[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const aHit = new Array(n).fill(false), bHit = new Array(m).fill(false);
    for (let i = 0, j = 0; i < n && j < m;) {
      if (A.flat[i] === B.flat[j]) { aHit[i] = bHit[j] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    const ok = (T, hits) => T.words.map((_, wi) => T.owner.every((os, k) => !os.includes(wi) || hits[k]));
    const aOk = ok(A, aHit), bOk = ok(B, bHit);
    return {
      score: n ? aHit.filter(Boolean).length / n : 0,
      targetHtml: wordsHtml(target, (w, i) => aOk[i], 'miss'),
      inputHtml: wordsHtml(input, (w, i) => bOk[i], 'extra'),
    };
  }

  // ================= 内容 =================
  const TAGS = {
    travel: { icon: '🧳', name: '旅行生活' }, job: { icon: '💼', name: '打工求职' }, ielts: { icon: '📝', name: '雅思' },
    daily: { icon: '💬', name: '日常' }, vocab: { icon: '📚', name: '核心词汇' }, my: { icon: '⭐', name: '我的收藏' },
  };
  const DECK_PREFIX = { travel: 'tr', job: 'jb', ielts: 'ie', daily: 'd' };
  const tagChip = t => TAGS[t] ? `<span class="chip">${TAGS[t].icon} ${TAGS[t].name}</span>` : '';
  const indexByTag = (arr, pos) => { const g = {}; arr.forEach((x, i) => (g[x[pos]] = g[x[pos]] || []).push(i)); return g; };
  const LISTEN_ORDER = roundRobin(['ielts', 'travel', 'ielts', 'job', 'daily'].map((t, k, all) => {
    const idx = indexByTag(LISTEN, 1)[t] || [];
    if (t !== 'ielts') return idx;
    const first = all.indexOf('ielts') === k;            // 雅思题拆成两半，出现频率更高
    return idx.filter((_, j) => (j % 2 === 0) === first);
  }));
  const SC_ORDER = roundRobin(['travel', 'job'].map(t => SCENARIOS.filter(s => s.tag === t).map(s => s.id)))
    .concat(SCENARIOS.filter(s => s.tag === 'daily').map(s => s.id));
  const SC = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));
  const KIND_NAME = { p1: 'Part 1', p2: 'Part 2', p3: 'Part 3', mock: '全真模考' };

  // ================= 状态 =================
  const DEFAULT = () => ({
    v: 3,
    settings: {
      t: 0, newPerDay: 8, listenPerDay: 5, chatGoal: 6,
      decks: { travel: true, job: true, ielts: true, daily: true, vocab: true },
      voice: '', rate: 0.95, autoSpeak: true, aiVoice: true, autoSend: true,
      examDate: '', target: 5.5,
    },
    cards: {}, custom: [],
    ptr: { listen: 0, scenario: 0, topic: 0, p1: 0, p2: 0 },
    retry: { listen: [] },
    ielts: { tests: [], speak: [], write: [] },
    today: null, history: {}, updatedAt: 0,
  });

  function normalize(s) {
    const d = DEFAULT();
    if (!s || typeof s !== 'object') return d;
    const st = s.settings || {};
    return {
      ...d, ...s,
      settings: { ...d.settings, ...st, decks: { ...d.settings.decks, ...(st.decks || {}) } },
      ptr: { ...d.ptr, ...s.ptr }, retry: { ...d.retry, ...s.retry },
      ielts: { ...d.ielts, ...(s.ielts || {}) },
      cards: s.cards || {}, custom: Array.isArray(s.custom) ? s.custom : [], history: s.history || {},
    };
  }
  // 旧版本（游戏/外企内容）升级：删掉旧语块进度，打卡记录和收藏保留
  function migrate(s) {
    if ((s.v || 2) >= 3) return s;
    for (const k of Object.keys(s.cards)) if (/^[gwt]:/.test(k)) delete s.cards[k];
    s.settings.decks = { ...DEFAULT().settings.decks };
    s.ptr = { ...DEFAULT().ptr };
    s.retry = { listen: [] };
    s.today = null;
    s.v = 3;
    s.settings.t = Date.now();
    return s;
  }
  function load() { try { return migrate(normalize(JSON.parse(localStorage.getItem(STORE)))); } catch (e) { return DEFAULT(); } }

  let S = load();
  function save(opts = {}) {
    S.updatedAt = Date.now();
    localStorage.setItem(STORE, JSON.stringify(S));
    if (opts.sync !== false) schedulePush();
  }

  // 两台设备的进度合并：逐项取较新的，打卡和成绩记录取并集
  function mergeRecords(a = [], b = []) {
    const m = new Map();
    for (const r of [...a, ...b]) { const o = m.get(r.id); if (!o || (r.del && !o.del)) m.set(r.id, r); }
    return [...m.values()].sort((x, y) => (x.at || 0) - (y.at || 0));
  }
  function merge(a, b) {
    a = migrate(normalize(a)); b = migrate(normalize(b));
    const [nw, old] = (a.updatedAt || 0) >= (b.updatedAt || 0) ? [a, b] : [b, a];
    const out = JSON.parse(JSON.stringify(nw));
    for (const [k, c] of Object.entries(old.cards)) { const o = out.cards[k]; if (!o || (c.t || 0) > (o.t || 0)) out.cards[k] = c; }
    for (const [k, h] of Object.entries(old.history)) {
      const o = out.history[k];
      out.history[k] = o ? { acts: Math.max(o.acts || 0, h.acts || 0), complete: !!(o.complete || h.complete) } : h;
    }
    const cm = new Map(out.custom.map(c => [c.en, c]));
    for (const c of old.custom) { const o = cm.get(c.en); if (!o || (c.t || 0) > (o.t || 0)) cm.set(c.en, c); }
    out.custom = [...cm.values()];
    if ((old.settings.t || 0) > (out.settings.t || 0)) out.settings = old.settings;
    for (const k of Object.keys(out.ptr)) out.ptr[k] = Math.max(out.ptr[k] || 0, old.ptr[k] || 0);
    for (const k of ['tests', 'speak', 'write']) out.ielts[k] = mergeRecords(out.ielts[k], old.ielts[k]);
    if (old.today && (!out.today || old.today.date > out.today.date)) out.today = old.today;
    else if (old.today && out.today && old.today.date === out.today.date) {
      const t = out.today, o = old.today;
      for (const f of ['newCount', 'reviewCount', 'bonus', 'chatTurns']) t[f] = Math.max(t[f] || 0, o[f] || 0);
      t.monologue = !!(t.monologue || o.monologue);
      if (t.speak && o.speak) t.speak.done = !!(t.speak.done || o.speak.done);
      t.items.listen = uniq([...t.items.listen, ...o.items.listen]);
      t.done.listen = uniq([...t.done.listen, ...o.done.listen]);
    }
    out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
    return out;
  }

  // ================= 同步 =================
  let syncStatus = { state: 'off', msg: '' };
  let pushTimer = null, dirty = false;

  function setSync(state, msg = '') {
    syncStatus = { state, msg };
    const el = $('#sync-dot');
    if (!el) return;
    const map = { off: ['', ''], idle: ['🟢', '已同步'], busy: ['🔄', '同步中…'], error: ['⚠️', msg || '同步失败'] };
    const [icon, text] = map[state] || map.off;
    el.textContent = icon;
    el.title = text;
    el.hidden = state === 'off';
    const st = $('#sync-status');
    if (st) st.textContent = state === 'error' ? `⚠️ ${msg}` : text;
  }
  function schedulePush() {
    if (!GistSync.ready()) return;
    dirty = true;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 3000);
  }
  async function push() {
    if (!GistSync.ready() || !dirty) return;
    const c = GistSync.config();
    dirty = false;
    setSync('busy');
    try { await GistSync.write(c.token, c.gistId, S); setSync('idle'); }
    catch (e) { dirty = true; setSync('error', e.message); }
  }
  async function pull() {
    if (!GistSync.ready()) return;
    const c = GistSync.config();
    setSync('busy');
    try {
      const remote = await GistSync.read(c.token, c.gistId);
      const before = JSON.stringify(S);
      if (remote) {
        const merged = merge(S, remote);
        S = merged;
        localStorage.setItem(STORE, JSON.stringify(S));
        if (JSON.stringify(S) !== before) { buildDeck(); vq = []; render(); }
        if (JSON.stringify(merged) !== JSON.stringify(normalize(remote))) { dirty = true; await push(); }
      } else { dirty = true; await push(); }
      if (syncStatus.state === 'busy') setSync('idle');
    } catch (e) { setSync('error', e.message); }
  }
  async function connectSync(token) {
    setSync('busy');
    const id = await GistSync.find(token);
    if (id) {
      GistSync.saveConfig({ token, gistId: id });
      await pull();
      flash('已连接，并合并了云端进度');
    } else {
      const newId = await GistSync.create(token, S);
      GistSync.saveConfig({ token, gistId: newId });
      setSync('idle');
      flash('已开启同步。其它设备填同一个 token 就能同步');
    }
  }

  // ================= 语块卡组 =================
  let DECK = [], CARD = {}, NEWQ = [];
  function buildDeck() {
    const cat = {};
    for (const k of Object.keys(DECK_PREFIX))
      cat[k] = CHUNKS[k].map(c => ({ key: DECK_PREFIX[k] + ':' + c[0], deck: k, en: c[0], zh: c[1], ex: c[2], exZh: c[3] }));
    cat.vocab = seededShuffle(WORDS.map(w => ({ key: 'v:' + w[0], deck: 'vocab', en: w[0], ipa: w[1], zh: w[2], colloc: w[3], ex: w[4], exZh: w[5] })), 20260929);
    cat.my = S.custom.filter(c => !c.del).map(c => ({ key: 'my:' + c.en, deck: 'my', en: c.en, zh: c.zh, ex: c.ex || '', exZh: c.exZh || '' }));
    DECK = [].concat(cat.my, cat.travel, cat.job, cat.ielts, cat.daily, cat.vocab);
    CARD = Object.fromEntries(DECK.map(c => [c.key, c]));
    const on = S.settings.decks;
    NEWQ = [...cat.my, ...roundRobin(['travel', 'ielts', 'job', 'daily', 'vocab'].filter(k => on[k]).map(k => cat[k]))].map(c => c.key);
  }

  function schedule(prev, g) { // g: 0 忘了 1 模糊 2 记得 3 太简单
    const c = prev ? { ...prev } : { reps: 0, interval: 0, ease: 2.5, lapses: 0 };
    if (g === 0) {
      if (prev && prev.reps > 0) c.lapses++;
      c.reps = 0; c.interval = 0; c.ease = Math.max(1.3, c.ease - 0.2);
      return c;
    }
    if (g === 1) { c.interval = c.reps === 0 ? 1 : Math.max(c.interval + 1, Math.round(c.interval * 1.2)); c.ease = Math.max(1.3, c.ease - 0.15); }
    else if (g === 2) c.interval = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.round(c.interval * c.ease);
    else { c.interval = c.reps === 0 ? 4 : Math.max(c.interval + 1, Math.round(c.interval * c.ease * 1.3)); c.ease += 0.15; }
    c.reps++;
    return c;
  }
  const dueKeys = () => Object.keys(S.cards).filter(k => CARD[k] && S.cards[k].due <= S.today.date)
    .sort((a, b) => S.cards[a].due.localeCompare(S.cards[b].due));
  const newLeft = () => Math.max(0, S.settings.newPerDay + (S.today.bonus || 0) - S.today.newCount);
  const newKeys = limit => { const out = []; for (const k of NEWQ) { if (out.length >= limit) break; if (!S.cards[k]) out.push(k); } return out; };
  const chunksRemaining = () => dueKeys().length + newKeys(newLeft()).length;
  const cardStatus = k => { const c = S.cards[k]; return !c ? ['new', '未学'] : c.interval >= MATURE ? ['mature', '已掌握'] : ['learning', '学习中']; };

  // ================= 每日任务 =================
  function pickItems(n, exclude = []) {
    const out = [];
    const taken = i => out.includes(i) || exclude.includes(i);
    for (const i of S.retry.listen) { if (out.length >= n) break; if (i < LISTEN.length && !taken(i)) out.push(i); }
    for (let guard = 0; out.length < n && guard < LISTEN_ORDER.length; guard++) {
      const i = LISTEN_ORDER[S.ptr.listen % LISTEN_ORDER.length];
      S.ptr.listen = (S.ptr.listen + 1) % LISTEN_ORDER.length;
      if (!taken(i)) out.push(i);
    }
    return out;
  }

  function ensureToday() {
    const k = dayKey();
    if (S.today && S.today.date === k) return false;
    const st = S.settings;
    S.today = {
      date: k, newCount: 0, reviewCount: 0, bonus: 0,
      goal: { listen: st.listenPerDay, chat: st.chatGoal },
      items: { listen: pickItems(st.listenPerDay) },
      done: { listen: [] },
      scenario: SC_ORDER[S.ptr.scenario % SC_ORDER.length],
      topic: S.ptr.topic % IELTS.P2.length,
      speak: { kind: ['p1', 'p2', 'p3'][dayIndex(k) % 3], p1: S.ptr.p1, p2: S.ptr.p2, p3: S.ptr.p2 + 8, done: false },
      chatTurns: 0, monologue: false,
    };
    S.ptr.scenario = (S.ptr.scenario + 1) % SC_ORDER.length;
    S.ptr.topic = (S.ptr.topic + 1) % IELTS.P2.length;
    S.ptr.p1 = (S.ptr.p1 + 1) % IELTS.P1.length;
    S.ptr.p2 = (S.ptr.p2 + 1) % IELTS.P2.length;
    save();
    return true;
  }

  const TASKS = [
    { id: 'chunks', icon: '🧠', name: '语块记忆', desc: '旅行、打工、雅思表达，按遗忘曲线复习' },
    { id: 'listen', icon: '🎧', name: '听力', desc: '雅思拼写数字听写 + 跟读' },
    { id: 'speak', icon: '🎤', name: '雅思口语', desc: 'Part 1/2/3 每天轮换，AI 估分', view: 'ielts' },
    { id: 'chat', icon: '🤖', name: 'AI 陪练', desc: '打工度假真实场景对话' },
  ];
  const taskView = id => (TASKS.find(t => t.id === id) || {}).view || id;
  function taskState(id) {
    const t = S.today;
    if (id === 'chunks') {
      const left = chunksRemaining(), did = t.newCount + t.reviewCount;
      return { done: left === 0, left, pct: did + left ? did / (did + left) : 1,
        text: left === 0 ? `已完成 · 新学 ${t.newCount} · 复习 ${t.reviewCount}` : `新语块 ${newKeys(newLeft()).length} · 待复习 ${dueKeys().length}` };
    }
    if (id === 'speak') {
      const done = !!t.speak.done;
      return { done, left: done ? 0 : 1, pct: done ? 1 : 0, text: done ? '已完成' : `今天练 ${KIND_NAME[t.speak.kind]}` };
    }
    if (id === 'chat') {
      if (!AI.ready()) return { done: !!t.monologue, left: t.monologue ? 0 : 1, pct: t.monologue ? 1 : 0, text: t.monologue ? '已完成 1 分钟独白' : '未设置 AI：先做 1 分钟独白' };
      const n = t.chatTurns || 0, goal = t.goal.chat;
      return { done: n >= goal, left: Math.max(0, goal - n), pct: Math.min(1, n / goal), text: `${Math.min(n, goal)} / ${goal} 句对话` };
    }
    const n = t.done.listen.length, goal = t.goal.listen;
    return { done: n >= goal, left: Math.max(0, goal - n), pct: Math.min(1, n / goal), text: `${Math.min(n, goal)} / ${goal} 句` };
  }
  const allDone = () => TASKS.every(t => taskState(t.id).done);
  const nextTask = () => (TASKS.find(t => !taskState(t.id).done) || { id: 'home' }).id;

  function logActivity() {
    const h = S.history[S.today.date] || (S.history[S.today.date] = { acts: 0, complete: false });
    h.acts++;
    if (!h.complete && allDone()) { h.complete = true; setTimeout(celebrate, 400); }
    save();
  }
  function streak() {
    let k = S.today.date;
    if (!S.history[k]?.complete) k = addDays(k, -1);
    let n = 0;
    while (S.history[k]?.complete) { n++; k = addDays(k, -1); }
    return n;
  }
  function longestStreak() {
    let best = 0, cur = 0, prev = null;
    for (const k of Object.keys(S.history).filter(k => S.history[k].complete).sort()) {
      cur = prev && addDays(prev, 1) === k ? cur + 1 : 1; best = Math.max(best, cur); prev = k;
    }
    return best;
  }

  // ================= 雅思：分数 =================
  const ieltsRound = x => { const f = Math.floor(x), r = x - f; return r < 0.25 ? f : r < 0.75 ? f + 0.5 : f + 1; };
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  const fmtBand = b => (b == null || isNaN(b) ? '—' : Number(b).toFixed(1));
  function rawToBand(kind, raw) {
    for (const [min, band] of IELTS.BANDS[kind]) if (raw >= min) return band;
    return 2;
  }
  function predicted() {
    const I = S.ielts;
    const live = arr => (arr || []).filter(r => !r.del);
    const recent = (arr, n, f) => { const a = live(arr).slice(-n).map(f); return a.length ? ieltsRound(avg(a)) : null; };
    const L = recent(I.tests.filter(t => t.kind === 'listening'), 3, t => t.band);
    const R = recent(I.tests.filter(t => t.kind === 'readingGT'), 3, t => t.band);
    const W = recent(I.write, 3, w => w.overall);
    const Sp = recent(I.speak, 5, s => s.overall);
    const vals = [L, R, W, Sp].filter(v => v != null);
    return { L, R, W, S: Sp, overall: vals.length === 4 ? ieltsRound(avg(vals)) : null, partial: vals.length ? ieltsRound(avg(vals)) : null, count: vals.length };
  }
  const daysLeft = () => (S.settings.examDate ? Math.round((parseDay(S.settings.examDate) - parseDay(S.today.date)) / 86400000) : null);
  function phase() {
    const d = daysLeft();
    if (d == null) return null;
    if (d < 0) return { name: '考完了', tip: '把听力阅读成绩记到下面。差一点没到的话，可以考虑只重考一科（One Skill Retake），申请签证前先确认对方是否接受。' };
    if (d <= 45) return { name: '冲刺期', tip: '每周 2 次口语全真模考 + 2 套剑雅听力阅读限时；写作每周 2 篇，按批改把同一篇改到满意。' };
    if (d <= 120) return { name: '专项期', tip: '口语重点练 Part 2/3；写作每周 2 篇（小作文 + 大作文）；剑雅听力、阅读每周各做 1 套并记录成绩。' };
    return { name: '基础期', tip: '每天完成 4 项打底：语块积累表达、听写练耳朵、口语先把 Part 1 说顺；每周写 1 篇小作文。' };
  }
  const DEFAULT_PLAN = '半年计划：前 2 个月打基础（每天 4 项 + 每周 1 篇小作文）→ 中间 2 个月专项（口语 Part 2/3、每周 2 篇作文、每周剑雅听力阅读各 1 套）→ 最后 1–2 个月冲刺（每周全真模考 + 限时套题）。报名后把考试日期填上，会按阶段提醒你。';

  // ================= 视图状态 =================
  const VIEWS = ['home', 'chunks', 'listen', 'ielts', 'chat', 'me'];
  let view = VIEWS.includes(location.hash.slice(1).split('/')[0]) ? location.hash.slice(1).split('/')[0] : 'home';
  let ieltsTab = 'today';
  const ui = { listen: {} };
  let vq = [], vRevealed = false, chunkMode = 'study', chunkSearch = '', chunkFilter = 'all', chunkHeard = null, lastSpoken = null;
  let mic = null;                 // 正在说话的目标 {kind, i, phase, t0}
  let shadow = null;              // 正在跟读录音
  let chatDraft = '', chatBusy = false, chatError = '', showScenarios = false;
  let mono = null, monoResult = null;
  let drillBusy = false, drillError = '';
  let wBusy = false, wError = '';
  let aiTesting = false, asrTesting = false;
  let installPrompt = null;
  let drills = loadJSON(DRILLS, {});
  let wd = { task: 2, i1: 0, i2: 0, text: '', custom: '', useCustom: false, started: 0, result: null, ...loadJSON(WDRAFT, {}) };

  Speech.configure(() => ({ voice: S.settings.voice, rate: S.settings.rate }));

  function go(v, anchor) {
    if (v === 'speak') { v = 'ielts'; ieltsTab = 'today'; }
    view = v;
    if (v === 'chunks') chunkMode = 'study';
    try { history.replaceState(null, '', '#' + v); } catch (e) { /* file:// */ }
    stopMic();
    render();
    if (anchor) { const el = document.getElementById(anchor); if (el) { el.scrollIntoView({ block: 'start' }); return; } }
    window.scrollTo(0, 0);
  }

  function render() {
    if (ensureToday()) { vq = []; ui.listen = {}; }
    const fn = { home: viewHome, chunks: viewChunks, listen: viewListen, ielts: viewIelts, chat: viewChat, me: viewMe }[view];
    $('#app').innerHTML = fn();
    updateNav();
    afterRender();
  }

  function updateNav() {
    document.querySelectorAll('#nav button').forEach(b => {
      const id = b.dataset.view;
      b.classList.toggle('active', id === view);
      const badge = b.querySelector('.badge');
      const task = TASKS.find(t => (t.view || t.id) === id);
      if (!task) { badge.hidden = true; return; }
      const st = taskState(task.id);
      badge.hidden = false;
      badge.className = 'badge' + (st.done ? ' ok' : '');
      badge.textContent = st.done ? '✓' : st.left;
    });
  }

  let lastQuestion = null;
  function afterRender() {
    if (view === 'chunks' && chunkMode === 'study' && vq[0] && lastSpoken !== vq[0]) {
      lastSpoken = vq[0];
      const c = CARD[vq[0]], st = S.cards[vq[0]];
      const producing = c.deck !== 'vocab' && st && st.reps >= 1;
      if (S.settings.autoSpeak && !producing) Speech.speak(c.en);
    }
    if (view === 'chat') { const box = $('#chat-log'); if (box) box.scrollTop = box.scrollHeight; }
    // 雅思口语：每道新题像考官一样读一遍
    if (view === 'ielts' && (ieltsTab === 'today' || ieltsTab === 'mock')) {
      const dr = currentDrill();
      const st = dr && !dr.finished ? dr.steps[dr.idx] : null;
      const key = st ? `${dr.key}#${dr.idx}` : null;
      if (st && key !== lastQuestion && !mic) {
        lastQuestion = key;
        if (S.settings.aiVoice) Speech.speak(st.part === 2 ? 'Here is your topic. You have one minute to prepare.' : st.q);
      }
    }
  }

  // ================= 首页 =================
  const TIPS = [
    '开口比完美更重要。说错了 AI 会帮你改，不说永远学不会。',
    '每天 25 分钟，比周末突击 3 小时有效得多——关键是“每天”。',
    '雅思听力 Section 1 的分最好拿：拼写、数字、日期每天练几句，考试时就不慌。',
    '雅思口语 Part 1 别只答一句：回答 + 原因 + 一个小例子，2–3 句刚好。',
    'Part 2 准备时只记关键词，别写句子；说的时候按“是什么 → 细节 → 感受”的顺序展开。',
    '想不起某个词时，用简单的词绕过去，考官更看重你能不能一直说下去。',
    'G 类小作文先看清对象：写给朋友用口语，写给老板或公司用正式语气。',
    '大作文最怕跑题：动笔前花 3 分钟列提纲，每段一个观点 + 一个例子。',
    '用《剑桥雅思》做完一套听力或阅读，把成绩记到「雅思 → 成绩与计划」里，看预估分怎么涨。',
    '背语块时一定要读出声，大脑记住的是“说出来的感觉”。',
    '到了国外，第一周最常用的就是：入境、青旅、电话卡、银行卡、找工作——这些场景先在 AI 陪练里练熟。',
    '听不懂的时候，大方说 Sorry, could you say that again? ——当地人自己也天天这么说。',
  ];

  function heatmap(weeks) {
    const today = S.today.date;
    const dow = (parseDay(today).getDay() + 6) % 7;
    const start = addDays(today, -(weeks - 1) * 7 - dow);
    let cols = '';
    for (let w = 0; w < weeks; w++) {
      let cells = '';
      for (let d = 0; d < 7; d++) {
        const k = addDays(start, w * 7 + d);
        if (k > today) { cells += '<i class="cell future"></i>'; continue; }
        const h = S.history[k];
        const lv = !h ? 0 : h.complete ? 4 : h.acts >= 15 ? 2 : 1;
        const tip = k + (h ? (h.complete ? ' · 已打卡' : ` · 练习 ${h.acts} 次`) : ' · 未学习');
        cells += `<i class="cell l${lv}${k === today ? ' today' : ''}" title="${tip}"></i>`;
      }
      cols += `<div class="hm-col">${cells}</div>`;
    }
    return `<div class="heatmap">${cols}</div>
      <div class="legend"><span>未学习</span><i class="cell l0"></i><i class="cell l1"></i><i class="cell l2"></i><i class="cell l4"></i><span>完成打卡</span></div>`;
  }

  function viewHome() {
    const now = new Date(), hr = now.getHours();
    const greet = hr < 5 ? '夜深了' : hr < 11 ? '早上好' : hr < 13 ? '中午好' : hr < 18 ? '下午好' : '晚上好';
    const idx = dayIndex(S.today.date);
    const q = QUOTES[idx % QUOTES.length];
    const done = allDone(), st = streak();
    const p = predicted(), dl = daysLeft();
    const ielts = `<button class="banner goal" data-go="ielts">
        <b>🎯 雅思 G 类目标 ${(+S.settings.target).toFixed(1)}${dl != null && dl >= 0 ? ` · 距考试 ${dl} 天` : ''}</b>
        <span>预估总分 ${fmtBand(p.overall ?? p.partial)}${p.count < 4 ? `（已有 ${p.count}/4 项数据）` : ''}${phase() ? ` · ${phase().name}` : ''}</span><i>去看看 →</i></button>`;
    const banners = [
      !AI.ready() && `<button class="banner" data-go="me" data-anchor="sec-ai"><b>🤖 设置 AI</b><span>填一个 API Key，口语估分、写作批改、AI 陪练就都能用了。</span><i>去设置 →</i></button>`,
      !GistSync.ready() && `<button class="banner" data-go="me" data-anchor="sec-sync"><b>🔄 开启手机电脑同步</b><span>手机上练的，电脑上也能看到，打卡不断。</span><i>去设置 →</i></button>`,
    ].filter(Boolean).join('');
    const tasks = TASKS.map(t => {
      const s = taskState(t.id);
      return `<button class="task ${s.done ? 'done' : ''}" data-go="${t.id}">
        <div class="task-icon">${t.icon}</div>
        <div class="task-body">
          <div class="task-name">${t.name}${s.done ? '<span class="check">✓</span>' : ''}</div>
          <div class="task-desc">${t.desc}</div>
          <div class="bar"><i style="width:${Math.round(s.pct * 100)}%"></i></div>
          <div class="task-meta">${s.text}</div>
        </div>
      </button>`;
    }).join('');
    return `
      <section class="hero">
        <div>
          <h1>${greet} 👋</h1>
          <p class="muted">${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]} · ${done ? '<b class="ok-text">今日已打卡 🎉</b>' : '完成 4 项练习就能打卡'}</p>
        </div>
        <div class="streak ${st ? 'on' : ''}"><span class="fire">🔥</span><div><b>${st}</b><small>天连续</small></div></div>
      </section>
      ${ielts}
      <section class="card quote">
        <div class="quote-en">“${esc(q[0])}” <button class="icon-btn" data-say="${esc(q[0])}" title="朗读">🔊</button></div>
        <div class="quote-cn">${esc(q[1])}</div>
      </section>
      ${banners}
      <h3 class="section-title">今日练习 <small class="muted">约 25 分钟</small></h3>
      <section class="tasks">${tasks}</section>
      ${done ? '' : `<div class="center"><button class="btn big" data-go="${nextTask()}">开始练习 →</button></div>`}
      <section class="card"><h3 class="card-title">打卡日历 <small class="muted">近 16 周</small></h3>${heatmap(16)}</section>
      <section class="card tip">💡 ${esc(TIPS[idx % TIPS.length])}</section>`;
  }

  // ================= 语块 =================
  const intervalText = d => d <= 0 ? '稍后再来' : d === 1 ? '明天' : d < 30 ? `${d}天后` : d < 365 ? `${Math.round(d / 30)}个月后` : `${(d / 365).toFixed(1)}年后`;
  const chunkCore = en => norm(en).filter(t => !['sb', 'sth', 'someone', 'something'].includes(t));

  function refillQueue() {
    const due = dueKeys(), fresh = newKeys(newLeft());
    const want = new Set([...due, ...fresh]);
    vq = vq.filter(k => want.has(k));
    const have = new Set(vq);
    const d = due.filter(k => !have.has(k)), f = fresh.filter(k => !have.has(k));
    let i = 0, j = 0;
    while (i < d.length || j < f.length) {
      if (i < d.length) vq.push(d[i++]);
      if (i < d.length) vq.push(d[i++]);
      if (j < f.length) vq.push(f[j++]);
    }
  }

  function rateCard(g) {
    const key = vq[0];
    if (!key || !vRevealed) return;
    const prev = S.cards[key];
    const c = schedule(prev, g);
    c.due = g === 0 ? S.today.date : addDays(S.today.date, c.interval);
    c.t = Date.now();
    if (!prev) { c.first = S.today.date; S.today.newCount++; } else S.today.reviewCount++;
    S.cards[key] = c;
    vq.shift();
    if (g === 0) vq.push(key);
    vRevealed = false; chunkHeard = null;
    logActivity();
    render();
  }

  function highlight(ex, card) {
    const html = esc(ex);
    const core = card.en.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\.\.\.|…/g, ' ').split('/')[0].trim();
    if (!core || core.length < 2) return html;
    const words = core.split(/\s+/).filter(w => !['sb', 'sth', "sb's"].includes(w.toLowerCase())).map(w => w.replace(/[^A-Za-z']/g, '')).filter(Boolean);
    if (!words.length) return html;
    const stem = w => (w.length > 4 ? w.replace(/(e|y|s)$/i, '') : w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b(${words.map(stem).join('[a-z\']*\\s+')}[a-z']*)`, 'i');
    return html.replace(re, '<mark>$1</mark>');
  }

  function viewChunks() {
    if (chunkMode === 'list') return viewChunkList();
    refillQueue();
    const nl = newKeys(newLeft()).length, due = dueKeys().length;
    const head = `<div class="page-head">
      <div><h2>语块记忆</h2><p class="muted">新语块 <b>${nl}</b> · 待复习 <b>${due}</b> · 今日已练 ${S.today.newCount + S.today.reviewCount} 次</p></div>
      <button class="btn ghost" data-act="chunk-list">📚 语块库</button></div>`;
    if (!vq.length) {
      const more = newKeys(1).length
        ? '<button class="btn" data-act="more-new">再学 5 个</button>'
        : '<span class="muted">开启的类别都学完了，可以到「我的」里开启更多类别，或收藏新的表达。</span>';
      return head + `<div class="card empty"><div class="big-emoji">🎉</div><h3>今天的语块完成了！</h3>
        <p class="muted">系统已经按遗忘曲线排好复习时间，明天记得回来。</p>
        <div class="row center">${more}<button class="btn ghost" data-go="${nextTask()}">${allDone() ? '回到今日' : '下一项 →'}</button></div></div>`;
    }
    const c = CARD[vq[0]], st = S.cards[c.key];
    const isNew = !st;
    const producing = c.deck !== 'vocab' && st && st.reps >= 1;
    const rateBtns = [['忘了', 'again'], ['模糊', 'hard'], ['记得', 'good'], ['太简单', 'easy']].map(([label, cls], g) =>
      `<button class="rate-btn ${cls}" data-rate="${g}"><b>${label}</b><small>${intervalText(g === 0 ? 0 : schedule(st, g).interval)}</small><kbd>${g + 1}</kbd></button>`).join('');
    const tags = `<div class="flash-tags"><span class="tag ${isNew ? 'tag-new' : 'tag-review'}">${isNew ? '新语块' : producing ? '说出来' : '复习'}</span>${tagChip(c.deck)}</div>`;
    const heard = chunkHeard != null ? (() => {
      const core = chunkCore(c.en), got = new Set(norm(chunkHeard));
      const hit = core.length ? core.filter(t => got.has(t)).length / core.length : 0;
      return `<div class="heard ${hit >= 0.8 ? 'good' : ''}">🎤 你说的：${esc(chunkHeard || '（没听清）')} ${hit >= 0.8 ? '✅' : ''}</div>`;
    })() : '';
    const answer = `
      <div class="answer">
        ${producing ? `<div class="word">${esc(c.en)} <button class="icon-btn" data-say="${esc(c.en)}">🔊</button></div>` : `<div class="meaning">${esc(c.zh)}</div>`}
        ${c.colloc ? `<div class="colloc"><span class="label">搭配</span>${esc(c.colloc)}</div>` : ''}
        ${c.ex ? `<div class="example"><div class="en">${highlight(c.ex, c)} <button class="icon-btn sm" data-say="${esc(c.ex)}">🔊</button></div>${c.exZh ? `<div class="cn">${esc(c.exZh)}</div>` : ''}</div>` : ''}
      </div>
      ${heard}
      <div class="rate">${rateBtns}</div>`;
    const front = producing
      ? `<div class="prompt-zh">${esc(c.zh)}</div>
         ${c.exZh ? `<div class="muted">例：${esc(c.exZh)}</div>` : ''}
         ${!vRevealed ? `<p class="hint">用英语把这个表达说出来（可以大声说，也可以点麦克风）</p>
           <div class="row center">${micBtn('chunk', 0, false)}<button class="btn big" data-act="reveal-card">看答案 <kbd>空格</kbd></button></div>${mic && mic.kind === 'chunk' ? `<div class="heard" id="heard-live">${esc(chunkHeard || '')}</div>` : heard}` : ''}`
      : `<div class="word">${esc(c.en)}</div>
         <div class="ipa">${esc(c.ipa || '')} <button class="icon-btn" data-say="${esc(c.en)}" title="朗读 (R)">🔊</button></div>
         ${!vRevealed ? `<button class="btn big" data-act="reveal-card">看意思 <kbd>空格</kbd></button>
           <p class="hint">${isNew ? '跟着读两遍，猜猜它的意思' : '先回忆意思，再看答案'}</p>` : ''}`;
    return head + `<div class="card flashcard">${tags}${front}${vRevealed ? answer : ''}</div>
      <p class="kbd-hint">快捷键：空格 看答案 · 1–4 评分 · R 重听</p>`;
  }

  function viewChunkList() {
    const q = chunkSearch.trim().toLowerCase();
    const counts = { new: 0, learning: 0, mature: 0 };
    DECK.forEach(c => counts[cardStatus(c.key)[0]]++);
    const decks = ['all', 'travel', 'job', 'ielts', 'daily', 'vocab', 'my'];
    const filters = decks.map(d => `<button class="chip-btn ${chunkFilter === d ? 'on' : ''}" data-act="chunk-filter" data-deck="${d}">${d === 'all' ? '全部' : TAGS[d].icon + ' ' + TAGS[d].name}</button>`).join('');
    const list = DECK.filter(c => (chunkFilter === 'all' || c.deck === chunkFilter) && (!q || c.en.toLowerCase().includes(q) || c.zh.includes(q)));
    const rows = list.slice(0, 400).map(c => {
      const [cls, text] = cardStatus(c.key);
      const card = S.cards[c.key];
      const due = card ? `<small class="muted">${card.due <= S.today.date ? '今天复习' : card.due.slice(5)}</small>` : '';
      const del = c.deck === 'my' ? `<button class="icon-btn sm" data-act="del-custom" data-en="${esc(c.en)}" title="删除">🗑</button>` : '';
      return `<tr><td><b>${esc(c.en)}</b> <button class="icon-btn sm" data-say="${esc(c.en)}">🔊</button></td><td>${esc(c.zh)}</td><td><span class="pill ${cls}">${text}</span> ${due}${del}</td></tr>`;
    }).join('');
    return `<div class="page-head">
        <div><h2>语块库</h2><p class="muted">共 ${DECK.length} 个 · 未学 ${counts.new} · 学习中 ${counts.learning} · 已掌握 ${counts.mature}</p></div>
        <button class="btn ghost" data-act="chunk-study">← 回去练习</button></div>
      <div class="card">
        <h3 class="card-title">⭐ 收藏一个表达</h3>
        <p class="muted small">看剧、看视频、做剑雅时遇到的好表达，加进来就会排进每天的新语块（优先）。</p>
        <div class="add-form">
          <input id="cw-en" placeholder="英文，如 No worries" autocomplete="off">
          <input id="cw-zh" placeholder="中文意思，如 没事/不客气" autocomplete="off">
          <input id="cw-ex" placeholder="例句（可选）" autocomplete="off">
          <button class="btn" data-act="add-custom">收藏</button>
        </div>
      </div>
      <div class="card">
        <div class="chips">${filters}</div>
        <input id="chunk-search" class="search" placeholder="🔍 搜索英文或中文" value="${esc(chunkSearch)}" autocomplete="off">
        <div class="table-wrap"><table class="wordlist"><tbody>${rows || '<tr><td class="muted">没有找到</td></tr>'}</tbody></table></div>
      </div>`;
  }

  function addCustom(en, zh, ex = '', exZh = '') {
    en = String(en || '').trim(); zh = String(zh || '').trim();
    if (!en || !zh) { flash('英文和中文都要填'); return false; }
    const exist = S.custom.find(c => c.en.toLowerCase() === en.toLowerCase());
    if (exist && !exist.del) { flash('已经收藏过了'); return false; }
    S.custom = S.custom.filter(c => c.en.toLowerCase() !== en.toLowerCase());
    S.custom.push({ en, zh, ex, exZh, added: S.today.date, t: Date.now() });
    save(); buildDeck(); vq = [];
    flash(`⭐ 已收藏「${en}」，会优先出现在新语块里`);
    return true;
  }

  // ================= 麦克风 =================
  // 按钮状态：准备中（还不能说）→ 在听（可以说，带音量条）→ 识别中
  function micBtn(kind, i, big = false) {
    const on = mic && mic.kind === kind && mic.i === i;
    const cls = `btn ${big ? 'big' : ''}`;
    if (!on) return `<button class="${cls} ghost" data-act="mic" data-kind="${kind}" data-i="${i}">🎤 说</button>`;
    if (mic.phase === 'starting') return `<button class="${cls} ghost wait" data-act="mic" data-kind="${kind}" data-i="${i}">⏳ 准备中…先别说</button>`;
    if (mic.phase === 'transcribing') return `<button class="${cls} ghost" disabled>✍️ 识别中…</button>`;
    return `<button class="${cls} rec" data-act="mic" data-kind="${kind}" data-i="${i}"><span class="lvl"><i></i></span>⏹ 说完了</button>`;
  }
  function stopMic() { if (mic) Speech.stopCapture(); }

  let emptyInRow = 0;   // 连续几次没识别到内容
  function startMic(kind, i) {
    if (mic) {                                      // 再点一次 = 说完了
      if (mic.phase !== 'transcribing') Speech.stopCapture();
      return;
    }
    const dr = kind === 'drill' ? currentDrill() : null;
    const step = dr ? dr.steps[dr.idx] : null;
    const base = step ? step.answer.trim() : '';   // 口语题：接着上一次的回答往后说
    mic = { kind, i, phase: 'starting', t0: 0 };
    const setText = t => {
      if (kind === 'chat') { chatDraft = t; const el = $('#chat-input'); if (el) el.value = t; }
      else if (kind === 'chunk') { chunkHeard = t; const el = $('#heard-live'); if (el) el.textContent = t; }
      else if (kind === 'drill' && step) {
        step.answer = base && t ? `${base} ${t}` : base || t;
        const el = document.querySelector('[data-input="drill"]'); if (el) el.value = step.answer;
      }
    };
    Speech.capture({
      continuous: kind !== 'chunk',
      autoStop: kind === 'chunk' ? 1500 : 0,
      onState: ph => {
        if (!mic) return;
        mic.phase = ph;
        if ((ph === 'listening' || ph === 'recording') && !mic.t0) mic.t0 = Date.now();
        render();
      },
      onLevel: lv => { const el = document.querySelector('.btn.rec .lvl i'); if (el) el.style.transform = `scaleY(${Math.min(1, 0.15 + lv * 2.5)})`; },
      onText: setText,
      onError: m => flash(m),
      onEnd: final => {
        const m = mic;
        mic = null;
        if (final) emptyInRow = 0;
        else if (++emptyInRow >= 2 && !Speech.cloudReady()) { emptyInRow = 0; flash('识别不稳定？到「我的 → 语音识别」开启 SenseVoice，更准也免费'); }
        if (kind === 'chunk') { chunkHeard = final; vRevealed = true; render(); return; }
        if (kind === 'drill' && step) {
          if (m && m.t0) step.secs = (step.secs || 0) + (Date.now() - m.t0) / 1000;
          if (final) { setText(final); step.via = 'voice'; }
          storeDrill(dr);
          render();
          return;
        }
        if (final) setText(final);
        if (kind === 'chat' && S.settings.autoSend && final) { chatSend(final); return; }
        render();
      },
    });
  }

  // 计时器：Part 2 准备倒计时、答题计时（Part 2 到 2 分钟自动停）
  setInterval(() => {
    if (view !== 'ielts') return;
    const dr = currentDrill();
    if (!dr || dr.finished) return;
    const st = dr.steps[dr.idx];
    const prepEl = $('#prep-left');
    if (prepEl && st.prepEnds) {
      const left = Math.max(0, Math.ceil((st.prepEnds - Date.now()) / 1000));
      prepEl.textContent = fmtSecs(left);
      if (left <= 0) { st.prepDone = true; storeDrill(dr); Speech.speak('All right. Please begin speaking now.'); render(); }
    }
    const tEl = $('#drill-timer');
    if (tEl) {
      const live = mic && mic.kind === 'drill' && mic.t0 ? (Date.now() - mic.t0) / 1000 : 0;
      const total = (st.secs || 0) + live;
      tEl.textContent = fmtSecs(total) + (st.part === 2 ? ' / 2:00' : '');
      if (st.part === 2 && live && total >= PART2_LIMIT) { flash('2 分钟到了'); Speech.stopCapture(); }
    }
  }, 250);

  // ================= 听力 =================
  const speakText = i => LISTEN[i][2] || LISTEN[i][0];

  function listenCard(i, n) {
    const [sentence, tag] = LISTEN[i];
    const u = ui.listen[i] || (ui.listen[i] = {});
    const done = S.today.done.listen.includes(i);
    const controls = `<div class="ex-num">${n + 1}</div><div class="ex-top">${tagChip(tag)}</div>
      <div class="row"><button class="btn" data-act="play" data-i="${i}">🔊 播放</button><button class="btn ghost" data-act="play-slow" data-i="${i}">🐢 慢速</button>
      <span class="muted small" id="plays-${i}">${u.plays ? `已听 ${u.plays} 次` : ''}</span></div>`;
    let step1;
    if (u.result) {
      step1 = `<div class="score ${u.result.score >= 1 ? 'perfect' : u.result.score >= 0.8 ? 'good' : ''}">${u.result.score >= 1 ? '💯 听写全对！' : `听写正确率 ${Math.round(u.result.score * 100)}%`}</div>
        <div class="diff"><span class="label">原句</span>${u.result.targetHtml}</div>
        <div class="diff"><span class="label">你写的</span>${u.result.inputHtml || '<i class="muted">（空）</i>'}</div>`;
    } else if (done && !u.redo) {
      step1 = `<div class="diff"><span class="label">原句</span>${esc(sentence)}</div>`;
    } else {
      return controls + `<input class="dict-input" data-input="listen" data-i="${i}" value="${esc(u.input || '')}" placeholder="① 听写：听到什么写什么，回车检查 · ↑ 重播" autocomplete="off" spellcheck="false">
        <button class="btn" data-act="check" data-i="${i}">检查</button>`;
    }
    const sh = u.shadow;
    const recording = shadow && shadow.i === i;
    const step2 = `<div class="shadow">
        <div class="shadow-title">② 跟读：先听一遍，再模仿语调和节奏说出来</div>
        <div class="row">${recording ? (shadow.playing ? '<span class="muted small">🔊 先听一遍原音…</span>' : shadow.finishing ? '<span class="muted small">✍️ 识别中…</span>' : `<button class="btn rec" data-act="shadow" data-i="${i}">⏹ 说完了</button><span class="muted small">正在录音，跟着说…</span>`)
          : `<button class="btn ghost" data-act="shadow" data-i="${i}">🎙 ${sh ? '再跟读一次' : '开始跟读'}</button>`}
          ${u.result || done ? `<button class="btn ghost sm" data-act="redo" data-i="${i}">重新听写</button>` : ''}</div>
        ${sh ? `<div class="shadow-result">
          ${sh.url ? `<div class="row"><span class="label">你的录音</span><audio controls src="${sh.url}"></audio><button class="icon-btn" data-say="${esc(speakText(i))}" title="听原音">🔊 原音</button></div>` : ''}
          ${sh.heard != null ? `<div class="diff"><span class="label">识别到</span>${sh.diff ? sh.diff.inputHtml : esc(sh.heard)} <b class="${sh.diff && sh.diff.score >= 0.8 ? 'ok-text' : ''}">${sh.diff ? Math.round(sh.diff.score * 100) + '%' : ''}</b></div>` : ''}
        </div>` : ''}
      </div>`;
    return controls + step1 + step2;
  }

  function exerciseFooter() {
    if (!taskState('listen').done) return '';
    return `<div class="card empty small"><p>✅ 今日听力已完成！</p>
      <div class="row center"><button class="btn ghost" data-act="extra">再来 1 句</button><button class="btn" data-go="${nextTask()}">${allDone() ? '回到今日' : '下一项 →'}</button></div></div>`;
  }

  function viewListen() {
    return `<div class="page-head"><div><h2>听力</h2><p class="muted">每句两步：先听写练耳朵，再跟读练嘴巴。人名地址按听到的拼写，数字直接写阿拉伯数字；大小写和标点不影响得分。</p></div>
      <div class="counter">${taskState('listen').text}</div></div>
      ${S.today.items.listen.map((i, n) => `<div class="card ex" id="listen-${i}">${listenCard(i, n)}</div>`).join('')}
      ${exerciseFooter()}`;
  }

  function markListen(i, good) {
    const r = S.retry.listen, pos = r.indexOf(i);
    if (good && pos >= 0) r.splice(pos, 1);
    if (!good && pos < 0) r.push(i);
    if (!S.today.done.listen.includes(i)) S.today.done.listen.push(i);
    logActivity();
  }

  function playListen(i, rate) {
    const u = ui.listen[i] || (ui.listen[i] = {});
    u.plays = (u.plays || 0) + 1;
    Speech.speak(speakText(i), rate);
    const p = document.getElementById(`plays-${i}`);
    if (p) p.textContent = `已听 ${u.plays} 次`;
    const inp = document.querySelector(`#listen-${i} .dict-input`);
    if (inp) inp.focus();
  }

  function checkListen(i) {
    const u = ui.listen[i] || (ui.listen[i] = {});
    const input = (u.input || '').trim();
    if (!input && !confirm('还没写内容，确定直接看原句吗？')) return;
    u.result = diffWords(LISTEN[i][0], input);
    u.redo = false;
    markListen(i, u.result.score >= 1);
    render();
  }

  async function toggleShadow(i) {
    const u = ui.listen[i] || (ui.listen[i] = {});
    if (shadow && shadow.i === i) {                  // 结束跟读
      if (shadow.playing) return;
      const s = shadow;
      s.finishing = true;
      render();
      const rec = s.rec ? await s.rec.stop().catch(() => null) : null;
      if (s.live) {                                  // 浏览器识别：等它把最后一段交回来
        await new Promise(res => { s.onDone = res; Speech.stopCapture(); setTimeout(res, 2500); });
      } else if (rec && Speech.cloudReady()) {       // SenseVoice：直接识别刚才的录音
        try { s.heard = await Speech.transcribe(rec.blob); } catch (e) { flash(e.message); }
      }
      shadow = null;
      u.shadow = { url: rec ? rec.url : '', heard: s.heard ?? null };
      if (s.heard != null) u.shadow.diff = diffWords(speakText(i), s.heard);
      render();
      return;
    }
    if (shadow) return;
    stopMic();
    const s = { i, rec: null, heard: null, playing: true, live: false };
    shadow = s;
    render();
    await Speech.speak(speakText(i));                // 先放一遍原音
    s.playing = false;
    if (shadow !== s) return;
    if (Speech.hasRecorder) { try { s.rec = await Speech.record(); } catch (e) { flash('无法录音：' + (e.message || '没有麦克风权限')); } }
    if (!Speech.cloudReady() && Speech.hasASR) {
      s.live = true;
      Speech.capture({ continuous: true, onText: t => { s.heard = t; }, onEnd: t => { if (t) s.heard = t; if (s.onDone) s.onDone(); }, onError: m => m && flash(m) });
    }
    if (!s.rec && !s.live) { shadow = null; flash('这个浏览器不支持录音和语音识别，可以对着原音大声跟读'); }
    render();
  }

  // ================= 雅思：口语练习 =================
  function storeDrill(dr) {
    drills[dr.key] = dr;
    const keys = Object.keys(drills).sort();
    while (keys.length > 12) delete drills[keys.shift()];
    try { localStorage.setItem(DRILLS, JSON.stringify(drills)); } catch (e) { /* 存不下就只留在内存里 */ }
  }
  function newDrill(kind, key) {
    const sp = S.today.speak, P1 = IELTS.P1, P2 = IELTS.P2;
    let label, steps;
    if (kind === 'p1') { const [topic, qs] = P1[sp.p1 % P1.length]; label = `Part 1 · ${topic}`; steps = qs.slice(0, 3).map(q => ({ part: 1, q })); }
    else if (kind === 'p2') { const card = P2[sp.p2 % P2.length]; label = 'Part 2 · 话题卡'; steps = [{ part: 2, q: card.title, card }]; }
    else if (kind === 'p3') { const card = P2[sp.p3 % P2.length]; label = 'Part 3 · 深入讨论'; steps = card.p3.map(q => ({ part: 3, q })); }
    else {
      const [topic, qs] = P1[(sp.p1 + 7) % P1.length], card = P2[(sp.p2 + 5) % P2.length];
      label = `全真模考 · ${topic}`;
      steps = [...qs.map(q => ({ part: 1, q })), { part: 2, q: card.title, card }, ...card.p3.map(q => ({ part: 3, q }))];
    }
    return { key, kind, label, steps: steps.map(s => ({ ...s, answer: '', via: '', secs: 0 })), idx: 0, result: null, finished: false };
  }
  function getDrill(kind) {
    const key = `${S.today.date}|${kind}`;
    if (!drills[key]) drills[key] = newDrill(kind, key);
    return drills[key];
  }
  const currentDrill = () => (ieltsTab === 'mock' ? getDrill('mock') : ieltsTab === 'today' ? getDrill(S.today.speak.kind) : null);

  function viewDrill(dr) {
    if (dr.finished) return drillResult(dr);
    const st = dr.steps[dr.idx];
    const last = dr.idx === dr.steps.length - 1;
    const part2 = st.part === 2;
    if (part2 && !st.prepDone && !st.prepEnds) { st.prepEnds = Date.now() + PREP_SECONDS * 1000; storeDrill(dr); }
    const preparing = part2 && !st.prepDone;
    const question = part2
      ? `<div class="cue"><b>${esc(st.card.title)}</b><div class="muted small">You should say:</div><ul>${st.card.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul><div>${esc(st.card.why)}</div></div>`
      : `<div class="prompt-en">${esc(st.q)} <button class="icon-btn" data-say="${esc(st.q)}" title="再听一遍">🔊</button></div>`;
    const prepHtml = preparing ? `<div class="prep">
        <div class="timer big" id="prep-left">${fmtSecs(Math.max(0, Math.ceil((st.prepEnds - Date.now()) / 1000)))}</div>
        <p class="muted small center">准备 1 分钟：在下面记几个关键词（考场上也可以记笔记），时间到会自动开始答题。</p>
        <textarea data-input="notes" rows="3" placeholder="关键词笔记，比如：where / who / what / why…">${esc(st.notes || '')}</textarea>
        <div class="row center"><button class="btn" data-act="prep-skip">准备好了，开始说</button></div></div>` : '';
    const hint = part2 ? '尽量说满 1.5–2 分钟，按提示的几点依次展开' : st.part === 1 ? '回答 + 原因 + 小例子，2–3 句就好' : '给出观点、理由和例子，3–4 句';
    const answerHtml = preparing ? '' : `
      ${part2 && st.notes ? `<div class="why">📝 你的笔记：${esc(st.notes)}</div>` : ''}
      <textarea data-input="drill" rows="${part2 ? 7 : 3}" placeholder="点 🎤 用英语回答（也可以打字）…">${esc(st.answer)}</textarea>
      <div class="row">${micBtn('drill', dr.idx)}<span class="timer" id="drill-timer">${fmtSecs(st.secs)}${part2 ? ' / 2:00' : ''}</span><span class="muted small">${hint}</span></div>`;
    const nav = `<div class="row between drill-nav">${dr.idx > 0 ? '<button class="btn ghost" data-act="drill-prev">← 上一题</button>' : '<span></span>'}
      ${last ? `<button class="btn" data-act="drill-submit" ${drillBusy || preparing ? 'disabled' : ''}>${drillBusy ? 'AI 评分中…' : AI.ready() ? '提交评分' : '完成'}</button>`
        : `<button class="btn" data-act="drill-next" ${preparing ? 'disabled' : ''}>下一题 →</button>`}</div>`;
    return `<div class="card drill">
      <div class="row between"><b>${esc(dr.label)}</b><span class="muted small">第 ${dr.idx + 1} / ${dr.steps.length} 题 · <span class="chip">Part ${st.part}</span></span></div>
      ${question}${prepHtml}${answerHtml}
      ${drillError ? `<div class="error">${esc(drillError)}</div>` : ''}
      ${nav}</div>`;
  }

  function bandsHtml(list) {
    return `<div class="bands">${list.map(([name, b, main]) => `<div class="band ${main ? 'main' : ''}"><b>${fmtBand(b)}</b><span>${name}</span></div>`).join('')}</div>`;
  }

  function drillResult(dr) {
    const r = dr.result;
    const items = dr.steps.map((s, k) => {
      const it = r && r.items && r.items[k];
      return `<div class="qa">
        <div class="q"><span class="chip">Part ${s.part}</span> ${esc(s.part === 2 ? s.card.title : s.q)}</div>
        <div class="yours"><span class="label">你的回答 · ${fmtSecs(s.secs)}</span>${esc(s.answer || '（未作答）')}</div>
        ${it ? `<div class="better-block"><span class="label">6.5 分参考</span>${esc(it.better)} <button class="icon-btn sm" data-say="${esc(it.better)}">🔊</button></div>
          <div class="why">💡 ${esc(it.tips_zh)}</div>` : ''}
      </div>`;
    }).join('');
    const chunks = r && r.chunks && r.chunks.length ? `<h4>可以记下来的表达（⭐ 收藏后会进语块复习）</h4>${r.chunks.map(c => `<div class="fix-row"><b>${esc(c.en)}</b> — ${esc(c.zh)} <button class="icon-btn sm" data-say="${esc(c.en)}">🔊</button><button class="icon-btn sm" data-act="star" data-en="${esc(c.en)}" data-zh="${esc(c.zh)}">⭐</button></div>`).join('')}` : '';
    return `<div class="card">
      <h3 class="card-title">📋 ${esc(dr.label)} · 结果</h3>
      ${r ? `${bandsHtml([['口语估分', r.overall, true], ['流利连贯', r.fc], ['词汇', r.lr], ['语法', r.gra]])}
        <p class="muted small">估分仅供参考：AI 只能看到识别出的文字，听不到声音，所以不含发音分。</p>
        <p>${esc(r.summary_zh)}</p>${r.pron_note_zh ? `<div class="why">🗣️ ${esc(r.pron_note_zh)}</div>` : ''}`
        : '<p class="muted">设置 AI 后可以自动估分，并给出每题的 6.5 分参考回答。</p>'}
      ${items}${chunks}
      <div class="row"><button class="btn ghost" data-act="drill-retry">同样的题再练一次</button>${dr.kind !== 'mock' && !allDone() ? `<button class="btn" data-go="${nextTask()}">下一项 →</button>` : ''}</div>
    </div>`;
  }

  async function drillSubmit() {
    const dr = currentDrill();
    if (!dr) return;
    const st = dr.steps[dr.idx];
    if (!st.answer.trim()) { flash('先回答这道题（可以说也可以打字）'); return; }
    if (mic) Speech.stopCapture();
    dr.steps.forEach(s => { if (!s.via) s.via = 'typed'; });
    if (AI.ready()) {
      drillBusy = true; drillError = ''; render();
      try {
        dr.result = await AI.speakScore(dr.steps, KIND_NAME[dr.kind]);
        S.ielts.speak.push({ id: uid(), at: Date.now(), d: S.today.date, kind: dr.kind, overall: dr.result.overall, fc: dr.result.fc, lr: dr.result.lr, gra: dr.result.gra });
      } catch (e) { drillError = e.message; drillBusy = false; render(); return; }
      drillBusy = false;
    }
    dr.finished = true;
    storeDrill(dr);
    if (dr.key.startsWith(S.today.date)) S.today.speak.done = true;
    logActivity();
    render();
    window.scrollTo(0, 0);
  }

  // ================= 雅思：写作 =================
  function storeWd() { try { localStorage.setItem(WDRAFT, JSON.stringify(wd)); } catch (e) { /* ignore */ } }
  function writePrompt() {
    if (wd.useCustom) return { title: '自定义题目', text: wd.custom, html: '' };
    if (wd.task === 1) {
      const w = IELTS.W1[wd.i1 % IELTS.W1.length];
      return {
        title: 'Task 1 · 书信（至少 150 词，建议 20 分钟）',
        text: `${w.prompt} Write a letter. In your letter: ${w.bullets.join('; ')}. Write at least 150 words. You do NOT need to write any addresses. Begin your letter as follows: ${w.to}`,
        html: `<p>${esc(w.prompt)} Write a letter. In your letter:</p><ul>${w.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
          <p class="muted small">Write at least 150 words. You do NOT need to write any addresses.</p><p>Begin your letter as follows: <b>${esc(w.to)}</b></p>`,
      };
    }
    const q = IELTS.W2[wd.i2 % IELTS.W2.length];
    const text = `${q} Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.`;
    return { title: 'Task 2 · 议论文（至少 250 词，建议 40 分钟）', text, html: `<p>${esc(q)}</p><p class="muted small">Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.</p>` };
  }

  function viewWrite() {
    const p = writePrompt();
    const r = wd.result;
    const min = wd.task === 1 ? 150 : 250, target = wd.task === 1 ? 20 : 40;
    const log = loadJSON(WLOG, []).slice(-5).reverse();
    const prompt = wd.useCustom
      ? `<textarea data-input="wcustom" rows="3" placeholder="把题目粘贴到这里（比如剑雅真题的题目）">${esc(wd.custom)}</textarea>`
      : `<div class="prompt-box">${p.html}</div>`;
    const result = r ? `<div class="card">
        <h3 class="card-title">📋 批改结果</h3>
        ${bandsHtml([['写作估分', r.overall, true], [wd.task === 1 ? '任务完成' : '任务回应', r.ta], ['连贯衔接', r.cc], ['词汇', r.lr], ['语法', r.gra]])}
        <p>${esc(r.summary_zh)}</p>
        ${r.corrections.length ? `<h4>重点改错</h4>${r.corrections.map(c => `<div class="fix-row"><div class="muted">✗ ${esc(c.original)}</div><div>✓ <b>${esc(c.better)}</b></div><div class="muted small">${esc(c.why_zh)}</div></div>`).join('')}` : ''}
        <details open><summary>6.5 分改写版（和你的原文逐段对照）</summary><div class="improved">${esc(r.improved)}</div></details>
        <div class="why">👉 下一步：${esc(r.next_step_zh)}</div>
        <div class="row"><button class="btn" data-act="w-next">写下一篇</button><button class="btn ghost" data-act="w-revise">在原文上修改，再交一次</button></div>
      </div>` : '';
    return `<div class="card">
        <div class="row between"><div class="row tight">
          <button class="chip-btn ${wd.task === 1 && !wd.useCustom ? 'on' : ''}" data-act="w-task" data-task="1">小作文 · 书信</button>
          <button class="chip-btn ${wd.task === 2 && !wd.useCustom ? 'on' : ''}" data-act="w-task" data-task="2">大作文 · 议论文</button>
          <button class="chip-btn ${wd.useCustom ? 'on' : ''}" data-act="w-custom">用自己的题目</button></div>
          ${wd.useCustom ? '' : '<button class="btn ghost sm" data-act="w-another">换一题</button>'}</div>
        <h3 class="card-title" style="margin-top:12px">${esc(p.title)}</h3>
        ${prompt}
        <textarea class="write-area" data-input="write" placeholder="在这里写…（建议先花 3 分钟列提纲）" spellcheck="false" ${r ? 'readonly' : ''}>${esc(wd.text)}</textarea>
        <div class="wstat"><span>字数 <b id="wc">${wordCount(wd.text)}</b> / ${min}</span><span>用时 <b id="wtime">${wd.started ? fmtSecs((Date.now() - wd.started) / 1000) : '0:00'}</b>（建议 ${target} 分钟）</span>
          ${!r ? `<button class="btn" data-act="w-submit" ${wBusy ? 'disabled' : ''}>${wBusy ? 'AI 批改中…' : '提交批改'}</button>` : ''}</div>
        ${wError ? `<div class="error">${esc(wError)}</div>` : ''}
        ${!AI.ready() ? '<p class="muted small">⚠️ 批改需要先在「我的 → AI 设置」填 API Key。</p>' : ''}
      </div>
      ${result}
      ${log.length ? `<div class="card"><h3 class="card-title">最近的批改</h3>${log.map(l => `<details class="wlog"><summary>${l.d} · Task ${l.task} · <b>${fmtBand(l.result.overall)}</b> 分 · ${l.words} 词</summary>
        <p class="muted small">${esc(l.prompt)}</p><div class="improved">${esc(l.text)}</div><p>${esc(l.result.summary_zh)}</p></details>`).join('')}</div>` : ''}`;
  }

  async function writeSubmit() {
    const text = wd.text.trim();
    const p = writePrompt();
    if (!AI.ready()) { flash('先在「我的 → AI 设置」填 API Key'); return; }
    if (!p.text.trim()) { flash('先填题目'); return; }
    if (wordCount(text) < 40) { flash('写得太少了，至少写 40 个词再提交'); return; }
    wBusy = true; wError = ''; render();
    try {
      const r = await AI.writeScore(wd.task, p.text, text);
      wd.result = r;
      storeWd();
      const rec = { id: uid(), at: Date.now(), d: S.today.date, task: wd.task, overall: r.overall };
      S.ielts.write.push(rec);
      const log = loadJSON(WLOG, []);
      log.push({ ...rec, prompt: p.text, text, words: wordCount(text), result: r });
      try { localStorage.setItem(WLOG, JSON.stringify(log.slice(-20))); } catch (e) { /* ignore */ }
      logActivity();
    } catch (e) { wError = e.message; }
    wBusy = false;
    render();
  }

  // ================= 雅思：成绩与计划 =================
  function viewScore() {
    const p = predicted(), ph = phase(), dl = daysLeft();
    const tests = S.ielts.tests.filter(t => !t.del).slice(-10).reverse().map(t => `<tr><td>${t.d}</td><td>${t.kind === 'listening' ? '听力' : '阅读（G 类）'}</td><td>${t.raw} / 40</td><td><b>${fmtBand(t.band)}</b></td><td><button class="icon-btn sm" data-act="del-test" data-id="${t.id}" title="删除">🗑</button></td></tr>`).join('');
    const missing = [p.L == null && '听力', p.R == null && '阅读', p.W == null && '写作', p.S == null && '口语'].filter(Boolean);
    return `<div class="card">
        <h3 class="card-title">📈 预估总分 <small class="muted">四项平均，按雅思规则取整</small></h3>
        ${bandsHtml([['总分', p.overall ?? p.partial, true], ['听力', p.L], ['阅读', p.R], ['写作', p.W], ['口语', p.S]])}
        <p class="muted small">听力、阅读来自你记录的剑雅成绩（最近 3 次平均）；写作、口语来自 AI 估分（最近几次平均，口语不含发音）。${missing.length ? `还缺：${missing.join('、')}，补齐后总分才准。` : ''}</p>
        ${p.overall != null ? `<div class="why">${p.overall >= +S.settings.target ? '🎉 预估已经达到目标，保持住！' : `距离目标 ${(+S.settings.target).toFixed(1)} 还差 ${(+S.settings.target - p.overall).toFixed(1)} 分，先补最低的那一项。`}</div>` : ''}
      </div>
      <div class="card">
        <h3 class="card-title">📝 记录剑雅听力 / 阅读成绩</h3>
        <p class="muted small">用《剑桥雅思》真题限时做一套，把答对的题数（满分 40）填进来，自动换算分数。阅读请做 G 类（General Training）。</p>
        <div class="add-form score-form"><select id="t-kind"><option value="listening">听力</option><option value="readingGT">阅读（G 类）</option></select>
          <input id="t-raw" type="number" min="0" max="40" placeholder="答对几题（0–40）"><button class="btn" data-act="add-test">记录</button></div>
        ${tests ? `<div class="table-wrap"><table class="wordlist"><tbody>${tests}</tbody></table></div>` : ''}
      </div>
      <div class="card">
        <h3 class="card-title">🎯 考试与计划</h3>
        <label class="setting"><span>考试日期<small class="muted">报名后填上，会显示倒计时和阶段建议</small></span><input type="date" data-setting="examDate" value="${esc(S.settings.examDate || '')}"></label>
        <label class="setting"><span>目标总分<small class="muted">新西兰打工度假要求 5.5，澳洲要求平均 4.5</small></span><select data-setting="target">${[4.5, 5, 5.5, 6, 6.5, 7].map(b => `<option value="${b}" ${+S.settings.target === b ? 'selected' : ''}>${b.toFixed(1)}</option>`).join('')}</select></label>
        <div class="why">${ph ? `<b>${ph.name}${dl >= 0 ? `（还有 ${dl} 天）` : ''}：</b>${esc(ph.tip)}` : esc(DEFAULT_PLAN)}</div>
        <p class="muted small">提醒：两国都接受雅思 G 类，必须在考点考（不认可在家考）。新西兰要求成绩不超过 2 年，澳洲要求申请前 12 个月内的成绩。政策会变，申请前以移民局官网为准。</p>
      </div>`;
  }

  function viewIelts() {
    const p = predicted(), dl = daysLeft();
    const tabs = [['today', '🎤 今日口语'], ['mock', '📋 口语模考'], ['write', '✍️ 写作批改'], ['score', '📈 成绩与计划']]
      .map(([k, n]) => `<button class="tab ${ieltsTab === k ? 'on' : ''}" data-act="ielts-tab" data-tab="${k}">${n}</button>`).join('');
    const head = `<div class="page-head"><div><h2>雅思 G 类 · 目标 ${(+S.settings.target).toFixed(1)}</h2>
      <p class="muted">${dl != null ? (dl >= 0 ? `距离考试 <b>${dl}</b> 天` : '考试日期已过') : '还没填考试日期'} · 预估总分 <b>${fmtBand(p.overall ?? p.partial)}</b>${p.count < 4 ? `（${p.count}/4 项有数据）` : ''}</p></div>
      ${ieltsTab === 'today' ? `<div class="counter">${taskState('speak').done ? '✓ 今日口语已完成' : ''}</div>` : ''}</div>
      <div class="tabs">${tabs}</div>`;
    if (ieltsTab === 'today') {
      const kinds = ['p1', 'p2', 'p3'].map(k => `<button class="chip-btn ${S.today.speak.kind === k ? 'on' : ''}" data-act="speak-kind" data-kind="${k}">${KIND_NAME[k]}</button>`).join('');
      return head + `<div class="row tight" style="margin-bottom:12px"><span class="muted small">今天练：</span>${kinds}<span class="muted small">（每天自动轮换，也可以自己换）</span></div>` + viewDrill(getDrill(S.today.speak.kind));
    }
    if (ieltsTab === 'mock') {
      return head + `<p class="muted small">完整流程：Part 1 四题 → Part 2（准备 1 分钟、说 2 分钟）→ Part 3 三题，大约 12 分钟。冲刺期每周做 1–2 次。</p>` + viewDrill(getDrill('mock'));
    }
    return head + (ieltsTab === 'write' ? viewWrite() : viewScore());
  }

  // ================= AI 陪练 =================
  function loadChats() { try { return JSON.parse(localStorage.getItem(CHATS)) || {}; } catch (e) { return {}; } }
  function storeChat(chat) {
    const all = loadChats();
    all[`${S.today.date}|${chat.scenarioId}`] = chat;
    const keys = Object.keys(all).sort();
    while (keys.length > 20) delete all[keys.shift()];
    try { localStorage.setItem(CHATS, JSON.stringify(all)); }
    catch (e) { for (const k of keys.slice(0, 10)) delete all[k]; localStorage.setItem(CHATS, JSON.stringify(all)); }
  }
  function currentChat() {
    const sc = SC[S.today.scenario] || SCENARIOS[0];
    const key = `${S.today.date}|${sc.id}`;
    return loadChats()[key] || AI.startChat(sc);
  }

  async function chatSend(text) {
    text = String(text || '').trim();
    if (!text || chatBusy) return;
    const chat = currentChat();
    chat.view.push({ role: 'me', text });
    chatDraft = ''; chatBusy = true; chatError = '';
    storeChat(chat);
    render();
    try {
      const d = await AI.chatTurn(chat, text);
      const me = chat.view[chat.view.length - 1];
      const c = d.correction || {};
      if (c.needed && c.better) me.fix = { better: c.better, zh: c.better_zh || '', why: c.explain_zh || '' };
      chat.view.push({ role: 'ai', text: d.reply, hint: d.hint_zh || '' });
      chat.userTurns++;
      S.today.chatTurns = (S.today.chatTurns || 0) + 1;
      storeChat(chat);
      logActivity();
      if (S.settings.aiVoice) Speech.speak(d.reply);
    } catch (e) {
      chat.view.pop();
      storeChat(chat);
      chatDraft = text;
      chatError = e.message;
    }
    chatBusy = false;
    render();
  }

  async function chatReview() {
    const chat = currentChat();
    chatBusy = true; chatError = ''; render();
    try { chat.review = await AI.review(chat, SC[chat.scenarioId]); storeChat(chat); }
    catch (e) { chatError = e.message; }
    chatBusy = false;
    render();
  }

  function viewChat() {
    if (!AI.ready()) return viewMonologue();
    const sc = SC[S.today.scenario] || SCENARIOS[0];
    const chat = currentChat();
    const list = showScenarios ? `<div class="sc-grid">${SCENARIOS.map(s => `<button class="sc-item ${s.id === sc.id ? 'on' : ''}" data-act="pick-scenario" data-id="${s.id}">${TAGS[s.tag].icon} <b>${esc(s.title)}</b><small>${esc(s.zh)}</small></button>`).join('')}</div>` : '';
    const msgs = chat.view.map((m, idx) => {
      if (m.role === 'ai') return `<div class="msg ai"><div class="bubble">${esc(m.text)} <button class="icon-btn sm" data-say="${esc(m.text)}">🔊</button></div>
        ${m.hint && idx === chat.view.length - 1 ? `<div class="hint-chip">💡 ${esc(m.hint)}</div>` : ''}</div>`;
      return `<div class="msg me"><div class="bubble">${esc(m.text)}</div>
        ${m.fix ? `<div class="fix"><div>✏️ <b>${esc(m.fix.better)}</b> <button class="icon-btn sm" data-say="${esc(m.fix.better)}">🔊</button>
          ${m.fix.zh ? `<button class="icon-btn sm" data-act="star" data-en="${esc(m.fix.better)}" data-zh="${esc(m.fix.zh)}" title="收藏到语块">⭐</button>` : ''}</div>
          ${m.fix.why ? `<div class="muted small">${esc(m.fix.why)}</div>` : ''}</div>` : ''}</div>`;
    }).join('');
    const rv = chat.review;
    const review = rv ? `<div class="card review">
        <h3 class="card-title">📋 本次点评 <span class="stars">${'★'.repeat(rv.score)}${'☆'.repeat(5 - rv.score)}</span></h3>
        <p>${esc(rv.summary_zh)}</p>
        ${rv.fixes.length ? `<h4>值得改的句子</h4>${rv.fixes.map(f => `<div class="fix-row"><div class="muted">✗ ${esc(f.you)}</div><div>✓ <b>${esc(f.better)}</b> <button class="icon-btn sm" data-say="${esc(f.better)}">🔊</button></div><div class="muted small">${esc(f.why_zh)}</div></div>`).join('')}` : ''}
        ${rv.chunks.length ? `<h4>值得记住的语块（点 ⭐ 收藏，明天开始复习）</h4>${rv.chunks.map(c => `<div class="fix-row"><b>${esc(c.en)}</b> — ${esc(c.zh)} <button class="icon-btn sm" data-say="${esc(c.en)}">🔊</button><button class="icon-btn sm" data-act="star" data-en="${esc(c.en)}" data-zh="${esc(c.zh)}">⭐</button></div>`).join('')}` : ''}
        <div class="row"><button class="btn ghost" data-act="chat-restart">再聊一次</button><button class="btn ghost" data-act="toggle-scenarios">换个场景</button></div>
      </div>` : '';
    const st = taskState('chat');
    return `<div class="page-head"><div><h2>AI 陪练</h2><p class="muted">今天目标：说 ${S.today.goal.chat} 句 · 已说 ${S.today.chatTurns || 0} 句</p></div>
        <div class="counter">${st.done ? '✓ 已完成' : st.text}</div></div>
      <div class="card scenario">
        <div class="row between"><div>${tagChip(sc.tag)} <b class="sc-title">${esc(sc.title)}</b></div>
          <div class="row tight"><button class="btn ghost sm" data-act="toggle-scenarios">${showScenarios ? '收起' : '换场景'}</button><button class="btn ghost sm" data-act="chat-restart">重来</button></div></div>
        <p class="muted">${esc(sc.zh)}</p>
        <p>🎯 ${esc(sc.goal)}</p>
        ${list}
      </div>
      <div class="chat-log" id="chat-log">${msgs}
        ${chatBusy ? '<div class="msg ai"><div class="bubble typing"><i></i><i></i><i></i></div></div>' : ''}
      </div>
      ${chatError ? `<div class="error">${esc(chatError)}</div>` : ''}
      ${review}
      <div class="chat-bar">
        <textarea id="chat-input" rows="2" placeholder="用英语回复…（点 🎤 说话，回车发送；不会说的词直接打中文）">${esc(chatDraft)}</textarea>
        <div class="chat-actions">
          ${micBtn('chat', 0)}
          <button class="btn" data-act="chat-send" ${chatBusy ? 'disabled' : ''}>发送</button>
        </div>
      </div>
      <div class="row chat-opts">
        <label class="toggle"><input type="checkbox" data-setting="aiVoice" ${S.settings.aiVoice ? 'checked' : ''}> 自动朗读 AI 回复</label>
        <label class="toggle"><input type="checkbox" data-setting="autoSend" ${S.settings.autoSend ? 'checked' : ''}> 说完自动发送</label>
        ${chat.userTurns >= 3 && !rv ? `<button class="btn ghost sm" data-act="chat-review" ${chatBusy ? 'disabled' : ''}>结束并点评</button>` : ''}
      </div>`;
  }

  // 没有 AI 时：用雅思 Part 2 话题卡做 1 分钟独白
  function viewMonologue() {
    const card = IELTS.P2[S.today.topic % IELTS.P2.length];
    const r = monoResult;
    return `<div class="page-head"><div><h2>AI 陪练</h2><p class="muted">还没设置 AI。设置后就能和 AI 用英语对话、句句纠错。</p></div></div>
      <button class="banner" data-go="me" data-anchor="sec-ai"><b>🤖 两分钟设置 AI 陪练</b><span>推荐 DeepSeek：国内直连，每天练一次一个月几块钱。</span><i>去设置 →</i></button>
      <div class="card">
        <h3 class="card-title">今天先做：1 分钟英语独白（雅思 Part 2）</h3>
        <div class="cue"><b>${esc(card.title)}</b> <button class="icon-btn sm" data-say="${esc(card.title)}">🔊</button><div class="muted small">You should say:</div><ul>${card.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul><div>${esc(card.why)}</div></div>
        <p class="muted small">对着麦克风说至少 1 分钟，说完回放听听自己的发音。卡住了也别停，用简单的词绕过去。</p>
        <div class="row">${mono ? '<button class="btn rec" data-act="mono">⏹ 说完了</button><span class="muted small">录音中…</span>' : `<button class="btn" data-act="mono">🎙 ${r ? '再录一次' : '开始录音'}</button>`}</div>
        ${r ? `<div class="row"><audio controls src="${r.url}"></audio><span class="${r.seconds >= MONO_SECONDS ? 'ok-text' : 'muted'}">${Math.round(r.seconds)} 秒${r.seconds >= MONO_SECONDS ? ' ✓' : `（再多说一点，目标 ${MONO_SECONDS} 秒）`}</span></div>` : ''}
        ${S.today.monologue ? '<div class="done-mark">✓ 今日已完成</div>' : ''}
      </div>`;
  }

  async function toggleMono() {
    if (mono) {
      const m = mono; mono = null;
      monoResult = await m.stop();
      if (monoResult.seconds >= MONO_SECONDS && !S.today.monologue) { S.today.monologue = true; logActivity(); }
      render();
      return;
    }
    try { mono = await Speech.record(); } catch (e) { flash('无法录音：' + (e.message || '没有麦克风权限')); return; }
    render();
  }

  // ================= 我的 =================
  function viewMe() {
    const learned = Object.keys(S.cards).filter(k => CARD[k]).length;
    const mature = Object.keys(S.cards).filter(k => CARD[k] && S.cards[k].interval >= MATURE).length;
    const days = Object.values(S.history).filter(h => h.complete).length;
    const s = S.settings;
    const ai = AI.config(), P = AI.PROVIDERS[ai.provider];
    const sync = GistSync.config();
    const asr = Speech.asrConfig();
    const num = (key, label, min, max, note = '') => `<label class="setting"><span>${label}${note ? `<small class="muted">${note}</small>` : ''}</span><input type="number" data-setting="${key}" value="${s[key]}" min="${min}" max="${max}"></label>`;
    const decks = ['travel', 'job', 'ielts', 'daily', 'vocab'].map(d => `<label class="toggle"><input type="checkbox" data-deck-toggle="${d}" ${s.decks[d] ? 'checked' : ''}> ${TAGS[d].icon} ${TAGS[d].name}</label>`).join('');
    const voiceOpts = ['<option value="">自动选择（推荐）</option>', ...Speech.voices().map(v => `<option value="${esc(v.name)}" ${v.name === s.voice ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`)].join('');
    const appUrl = location.href.split('#')[0];
    return `<div class="page-head"><div><h2>我的</h2><p class="muted">坚持比强度更重要。</p></div></div>
      <section class="stats">
        <div class="stat"><b>${streak()}</b><span>连续打卡</span></div>
        <div class="stat"><b>${longestStreak()}</b><span>最长连续</span></div>
        <div class="stat"><b>${days}</b><span>累计打卡</span></div>
        <div class="stat"><b>${learned}</b><span>已学语块</span></div>
        <div class="stat"><b>${mature}</b><span>已掌握</span></div>
        <div class="stat"><b>${dueKeys().length}</b><span>今天待复习</span></div>
      </section>
      <section class="card"><h3 class="card-title">打卡日历 <small class="muted">近半年</small></h3>${heatmap(26)}</section>

      <section class="card" id="sec-ai">
        <h3 class="card-title">🤖 AI 设置 ${AI.ready() ? '<span class="pill mature">已设置</span>' : '<span class="pill new">未设置</span>'}</h3>
        <label class="setting"><span>服务商</span><select id="ai-provider">${Object.entries(AI.PROVIDERS).map(([k, p]) => `<option value="${k}" ${k === ai.provider ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <p class="muted small">${esc(P.note)}</p>
        <label class="setting"><span>API Key${P.keyUrl ? `<small><a href="${P.keyUrl}" target="_blank" rel="noopener">去官网创建 Key →</a></small>` : ''}</span><input id="ai-key" type="password" value="${esc(ai.apiKey)}" placeholder="sk-..." autocomplete="off"></label>
        <label class="setting"><span>模型</span><input id="ai-model" value="${esc(ai.model)}" placeholder="${esc(P.model || '模型名')}" autocomplete="off"></label>
        ${ai.provider === 'custom' ? `<label class="setting"><span>接口地址<small class="muted">例如 https://dashscope.aliyuncs.com/compatible-mode/v1</small></span><input id="ai-base" value="${esc(ai.baseUrl)}" placeholder="https://..." autocomplete="off"></label>` : ''}
        <div class="row"><button class="btn" data-act="ai-save">保存</button><button class="btn ghost" data-act="ai-test" ${aiTesting ? 'disabled' : ''}>${aiTesting ? '测试中…' : '测试连接'}</button></div>
        <p class="muted small">🔒 Key 只保存在这台设备的浏览器里，不会同步，也不会发给除服务商以外的任何地方。每台设备需要各填一次。</p>
      </section>

      <section class="card" id="sec-asr">
        <h3 class="card-title">🎤 语音识别 ${Speech.cloudReady() ? '<span class="pill mature">SenseVoice</span>' : '<span class="pill new">浏览器自带</span>'}</h3>
        <label class="setting"><span>识别引擎</span><select id="asr-engine">
          <option value="browser" ${asr.engine !== 'sensevoice' ? 'selected' : ''}>浏览器自带（实时出字，口音容易识别错）</option>
          <option value="sensevoice" ${asr.engine === 'sensevoice' ? 'selected' : ''}>硅基流动 SenseVoice（推荐：更准、免费、国内直连）</option>
        </select></label>
        ${asr.engine === 'sensevoice' ? `
          <ol class="steps">
            <li>打开 <a href="${Speech.SENSEVOICE.keyUrl}" target="_blank" rel="noopener">硅基流动 API 密钥页面</a>，用手机号登录，点「新建 API 密钥」。</li>
            <li>把密钥（sk- 开头）粘贴到下面，点「保存」，再点「测试」。SenseVoice 模型免费，不用充值。</li>
          </ol>
          <label class="setting"><span>硅基流动 Key</span><input id="asr-key" type="password" value="${esc(asr.key)}" placeholder="sk-..." autocomplete="off"></label>
          <div class="row"><button class="btn" data-act="asr-save">保存</button><button class="btn ghost" data-act="asr-test" ${asrTesting ? 'disabled' : ''}>${asrTesting ? '测试中…' : '测试'}</button></div>
          <p class="muted small">用法：点 🎤 → 按钮变红、出现音量条后开口 → 说完点「说完了」→ 一两秒后出文字。Key 只保存在这台设备。</p>`
        : `<p class="muted small">点 🎤 后等按钮变红再开口；说完点「说完了」；识别错的词可以直接改。${Speech.hasASR ? '' : '<b>这个浏览器不支持自带识别，请切换到 SenseVoice。</b>'}</p>`}
        <p class="muted small">浏览器自带识别：${Speech.hasASR ? '✅ 支持' : '❌ 不支持'} · 录音：${Speech.hasRecorder ? '✅ 支持' : '❌ 不支持'}</p>
      </section>

      <section class="card" id="sec-sync">
        <h3 class="card-title">🔄 多设备同步 <span id="sync-status" class="muted small">${GistSync.ready() ? (syncStatus.state === 'error' ? '⚠️ ' + esc(syncStatus.msg) : syncStatus.state === 'busy' ? '同步中…' : '已同步') : '未开启'}</span></h3>
        ${GistSync.ready() ? `
          <p class="muted small">进度保存在你 GitHub 账号的私密 Gist 里，打开页面和练习时自动同步。</p>
          <label class="setting"><span>同步 ID<small class="muted">电脑提醒「练完就不提醒」要用到它</small></span><code class="copyable">${esc(sync.gistId)}</code></label>
          <div class="row"><button class="btn ghost" data-act="copy" data-text="${esc(sync.gistId)}">复制同步 ID</button><button class="btn ghost" data-act="sync-now">立即同步</button><button class="btn danger" data-act="sync-off">在这台设备上断开</button></div>`
        : `
          <ol class="steps">
            <li>打开 <a href="https://github.com/settings/tokens/new?scopes=gist&description=SpeakUp%20sync" target="_blank" rel="noopener">GitHub 创建 token 页面</a>（已自动只勾选 <b>gist</b> 权限），有效期选 No expiration，点 Generate token。</li>
            <li>把生成的 token（ghp_ 开头）粘贴到下面，点「开启同步」。</li>
            <li>手机上打开同一个网址，同样填这个 token，进度就会自动合并。</li>
          </ol>
          <div class="add-form two"><input id="sync-token" type="password" placeholder="ghp_..." autocomplete="off"><button class="btn" data-act="sync-connect">开启同步</button></div>`}
      </section>

      <section class="card" id="sec-remind">
        <h3 class="card-title">⏰ 每日提醒</h3>
        <p><b>手机：</b>把提醒加进手机日历，每天到点响铃。</p>
        <div class="add-form two"><input id="remind-time" type="time" value="20:00"><button class="btn" data-act="ics">下载日历提醒</button></div>
        <p class="muted small">iPhone：用 Safari 打开本页下载，会直接弹出“添加到日历”。安卓：下载后用手机自带日历打开；如果导入不了，就在「时钟」里设一个每天的闹钟，备注 SpeakUp。</p>
        <p><b>电脑：</b>Windows 已设置每天 20:00 弹通知（运行 <code>reminder\\提醒设置.bat</code> 可以改时间）。开启同步后，在 bat 菜单里填上同步 ID，今天练完就不会再提醒，没练完 22:00 会再催一次。</p>
      </section>

      <section class="card" id="sec-install">
        <h3 class="card-title">📱 装到手机桌面</h3>
        ${installPrompt ? '<div class="row"><button class="btn" data-act="install">安装到桌面</button></div>' : ''}
        <p class="muted small">iPhone：Safari 打开 → 分享按钮 → 添加到主屏幕。安卓：Chrome / Edge 打开 → 右上角菜单 → 添加到主屏幕（或“安装应用”）。装好后像 App 一样全屏打开。</p>
        <div class="row"><code class="copyable">${esc(appUrl)}</code><button class="btn ghost sm" data-act="copy" data-text="${esc(appUrl)}">复制网址</button></div>
      </section>

      <section class="card">
        <h3 class="card-title">⚙️ 每日练习量</h3>
        ${num('newPerDay', '每天新语块', 1, 40, '立即生效')}
        ${num('listenPerDay', '听力句数', 1, 15, '明天生效')}
        ${num('chatGoal', 'AI 对话句数', 2, 30, '明天生效')}
        <div class="setting"><span>新语块来自<small class="muted">核心词汇对雅思阅读和写作有帮助</small></span><div class="chips">${decks}</div></div>
      </section>

      <section class="card">
        <h3 class="card-title">🔊 朗读</h3>
        ${Speech.hasTTS ? `
        <label class="setting"><span>发音人<small class="muted">Edge 里带 Natural 的最自然；英音、澳音也可以选来适应口音</small></span><select data-setting="voice">${voiceOpts}</select></label>
        <label class="setting"><span>语速 <b id="rate-val">${s.rate.toFixed(2)}</b></span><input type="range" data-setting="rate" min="0.5" max="1.3" step="0.05" value="${s.rate}"></label>
        <label class="setting"><span>语块自动发音</span><input type="checkbox" data-setting="autoSpeak" ${s.autoSpeak ? 'checked' : ''}></label>
        <div class="row"><button class="btn ghost" data-say="Hi, I'm calling about the job ad. Is the position still open?">试听</button></div>`
        : '<p class="muted">这个浏览器不支持朗读，建议用 Edge、Chrome 或 Safari。</p>'}
      </section>

      <section class="card">
        <h3 class="card-title">💾 数据</h3>
        <div class="row">
          <button class="btn ghost" data-act="export">导出备份</button>
          <label class="btn ghost">导入备份<input type="file" id="import-file" accept=".json,application/json" hidden></label>
          <button class="btn danger" data-act="reset">清空所有进度</button>
        </div>
      </section>`;
  }

  function downloadIcs(time) {
    const [h, m] = (time || '20:00').split(':').map(Number);
    const d = new Date();
    const url = location.href.split('#')[0];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SpeakUp//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:speakup-daily-${Date.now()}@speakup`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`,
      'DURATION:PT25M', 'RRULE:FREQ=DAILY',
      'SUMMARY:📘 SpeakUp 练英语（25 分钟）',
      `DESCRIPTION:今天的英语练习：${url}`,
      `URL:${url}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:该练英语啦', 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n');
    downloadFile('speakup-reminder.ics', ics, 'text/calendar');
  }

  function downloadFile(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ================= 反馈 =================
  let flashTimer = null;
  function flash(msg) {
    const el = $('#flash');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function celebrate() {
    const n = streak();
    const msg = n >= 100 ? '100 天！英语已经是你生活的一部分了。'
      : n >= 30 ? '一个月了！回头看看第一天，你已经走了很远。'
      : n >= 21 ? '21 天，习惯已经养成。接下来只要保持。'
      : n >= 7 ? '整整一周！开口越来越自然了吧？'
      : n >= 3 ? '连续三天，开始进入状态了。'
      : 'Well begun is half done. 好的开始是成功的一半。';
    const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
    const confetti = Array.from({ length: 60 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.8}s;animation-duration:${2 + Math.random() * 1.5}s"></i>`).join('');
    const el = document.createElement('div');
    el.className = 'celebrate';
    el.innerHTML = `<div class="confetti">${confetti}</div><div class="celebrate-box"><div class="big-emoji">🎉</div><h2>今日打卡完成！</h2><p>已连续坚持 <b>${n}</b> 天</p><p class="muted">${esc(msg)}</p><button class="btn big" data-act="close-celebrate">好的</button></div>`;
    document.body.appendChild(el);
  }

  // ================= 事件 =================
  async function onAction(t) {
    const d = t.dataset, i = +d.i;
    switch (d.act) {
      case 'mic': return startMic(d.kind, i);
      // 语块
      case 'reveal-card': vRevealed = true; return render();
      case 'more-new': S.today.bonus = (S.today.bonus || 0) + 5; save(); return render();
      case 'chunk-list': chunkMode = 'list'; render(); return window.scrollTo(0, 0);
      case 'chunk-study': chunkMode = 'study'; render(); return window.scrollTo(0, 0);
      case 'chunk-filter': chunkFilter = d.deck; return render();
      case 'add-custom': if (addCustom($('#cw-en').value, $('#cw-zh').value, $('#cw-ex').value)) render(); return;
      case 'star': addCustom(d.en, d.zh); return;
      case 'del-custom': {
        if (!confirm(`删除收藏「${d.en}」？`)) return;
        const c = S.custom.find(x => x.en === d.en);
        if (c) { c.del = true; c.t = Date.now(); }
        delete S.cards['my:' + d.en];
        save(); buildDeck(); return render();
      }
      // 听力
      case 'play': return playListen(i);
      case 'play-slow': return playListen(i, SLOW);
      case 'check': return checkListen(i);
      case 'redo': { const u = ui.listen[i] || (ui.listen[i] = {}); u.result = null; u.input = ''; u.redo = true; return render(); }
      case 'shadow': return toggleShadow(i);
      case 'extra': {
        const more = pickItems(1, S.today.items.listen);
        if (!more.length) { flash('今天的句子都练过了'); return; }
        S.today.items.listen.push(...more); save(); return render();
      }
      // 雅思
      case 'ielts-tab': ieltsTab = d.tab; stopMic(); drillError = ''; wError = ''; render(); return window.scrollTo(0, 0);
      case 'speak-kind': stopMic(); S.today.speak.kind = d.kind; save(); return render();
      case 'prep-skip': { const dr = currentDrill(); const st = dr.steps[dr.idx]; st.prepDone = true; storeDrill(dr); Speech.speak('All right. Please begin speaking now.'); return render(); }
      case 'drill-next': case 'drill-prev': {
        const dr = currentDrill();
        if (d.act === 'drill-next' && !dr.steps[dr.idx].answer.trim()) { flash('先回答这道题（可以说也可以打字）'); return; }
        stopMic();
        dr.idx = clamp(dr.idx + (d.act === 'drill-next' ? 1 : -1), 0, dr.steps.length - 1);
        storeDrill(dr);
        return render();
      }
      case 'drill-submit': return drillSubmit();
      case 'drill-retry': {
        const dr = currentDrill();
        const fresh = { ...dr, idx: 0, result: null, finished: false, steps: dr.steps.map(s => ({ part: s.part, q: s.q, card: s.card, answer: '', via: '', secs: 0 })) };
        lastQuestion = null;
        storeDrill(fresh);
        return render();
      }
      case 'w-task': wd.task = +d.task; wd.useCustom = false; storeWd(); return render();
      case 'w-custom': wd.useCustom = true; storeWd(); return render();
      case 'w-another': if (wd.task === 1) wd.i1++; else wd.i2++; wd.result = null; storeWd(); return render();
      case 'w-submit': return writeSubmit();
      case 'w-next': if (wd.task === 1) wd.i1++; else wd.i2++; wd.text = ''; wd.result = null; wd.started = 0; wd.useCustom = false; storeWd(); render(); return window.scrollTo(0, 0);
      case 'w-revise': wd.result = null; storeWd(); return render();
      case 'add-test': {
        const kind = $('#t-kind').value, raw = Math.round(+$('#t-raw').value);
        if (!(raw >= 0 && raw <= 40) || $('#t-raw').value === '') { flash('填 0–40 之间的答对题数'); return; }
        const band = rawToBand(kind, raw);
        S.ielts.tests.push({ id: uid(), at: Date.now(), d: S.today.date, kind, raw, band });
        save();
        flash(`已记录：${kind === 'listening' ? '听力' : '阅读'} ${raw}/40 ≈ ${fmtBand(band)} 分`);
        return render();
      }
      case 'del-test': {
        const rec = S.ielts.tests.find(x => x.id === d.id);
        if (rec && confirm('删除这条成绩？')) { rec.del = true; save(); render(); }
        return;
      }
      // AI 陪练
      case 'chat-send': return chatSend($('#chat-input').value);
      case 'chat-review': return chatReview();
      case 'chat-restart': {
        const sc = SC[S.today.scenario] || SCENARIOS[0];
        storeChat(AI.startChat(sc)); chatError = ''; chatDraft = '';
        return render();
      }
      case 'toggle-scenarios': showScenarios = !showScenarios; return render();
      case 'pick-scenario': S.today.scenario = d.id; showScenarios = false; chatError = ''; save(); return render();
      case 'mono': return toggleMono();
      // 我的
      case 'ai-save': {
        const provider = $('#ai-provider').value;
        AI.saveConfig({ provider, apiKey: $('#ai-key').value.trim(), model: $('#ai-model').value.trim() || AI.PROVIDERS[provider].model, baseUrl: $('#ai-base') ? $('#ai-base').value.trim() : '' });
        flash(AI.ready() ? '已保存，可以点「测试连接」确认一下' : '已保存（还缺 Key 或模型）');
        return render();
      }
      case 'ai-test': {
        aiTesting = true; render();
        try { await AI.test(); flash('✅ 连接成功，口语估分、写作批改和 AI 陪练都能用了'); } catch (e) { flash('❌ ' + e.message); }
        aiTesting = false; return render();
      }
      case 'asr-save': {
        const key = $('#asr-key').value.trim();
        Speech.saveAsrConfig({ ...Speech.asrConfig(), engine: 'sensevoice', key });
        flash(key ? '已保存，点「测试」确认一下' : '还没填 Key');
        return render();
      }
      case 'asr-test': {
        const key = $('#asr-key').value.trim();
        if (!key) { flash('先粘贴硅基流动的 Key'); return; }
        asrTesting = true; render();
        try { await Speech.testCloud(key); Speech.saveAsrConfig({ ...Speech.asrConfig(), engine: 'sensevoice', key }); flash('✅ SenseVoice 可以用了，去练习试试'); }
        catch (e) { flash('❌ ' + e.message); }
        asrTesting = false; return render();
      }
      case 'sync-connect': {
        const token = $('#sync-token').value.trim();
        if (!token) { flash('先粘贴 token'); return; }
        t.disabled = true;
        try { await connectSync(token); } catch (e) { setSync('off'); flash('❌ ' + e.message); }
        return render();
      }
      case 'sync-now': dirty = true; await pull(); await push(); flash(syncStatus.state === 'error' ? '❌ ' + syncStatus.msg : '✅ 已同步'); return;
      case 'sync-off':
        if (!confirm('在这台设备上断开同步？（云端进度不会删除）')) return;
        GistSync.saveConfig({}); setSync('off'); return render();
      case 'copy':
        try { await navigator.clipboard.writeText(d.text); flash('已复制'); } catch (e) { prompt('复制下面的内容：', d.text); }
        return;
      case 'ics': return downloadIcs($('#remind-time').value);
      case 'install': if (installPrompt) { installPrompt.prompt(); installPrompt = null; } return;
      case 'export': return downloadFile(`speakup-backup-${S.today.date}.json`, JSON.stringify(S, null, 1), 'application/json');
      case 'reset':
        if (confirm('确定清空所有学习进度吗？（建议先导出备份）') && confirm('再确认一次：真的清空？')) {
          for (const k of [STORE, CHATS, DRILLS, WDRAFT, WLOG]) localStorage.removeItem(k);
          S = load(); drills = {}; wd = { task: 2, i1: 0, i2: 0, text: '', custom: '', useCustom: false, started: 0, result: null };
          buildDeck(); vq = []; ensureToday(); save(); render(); flash('已清空');
        }
        return;
      case 'close-celebrate': t.closest('.celebrate').remove(); return render();
    }
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-view],[data-go],[data-say],[data-rate],[data-act]');
    if (!t || t.disabled) return;
    if (t.dataset.view) return go(t.dataset.view);
    if (t.dataset.go) return go(t.dataset.go, t.dataset.anchor);
    if (t.dataset.say) return Speech.speak(t.dataset.say);
    if (t.dataset.rate) return rateCard(+t.dataset.rate);
    onAction(t);
  });

  document.addEventListener('input', e => {
    const t = e.target, kind = t.dataset.input;
    if (kind === 'listen') { (ui.listen[t.dataset.i] = ui.listen[t.dataset.i] || {}).input = t.value; }
    else if (kind === 'drill' || kind === 'notes') {
      const dr = currentDrill(); if (!dr) return;
      const st = dr.steps[dr.idx];
      if (kind === 'drill') { st.answer = t.value; if (!st.via) st.via = 'typed'; } else st.notes = t.value;
      storeDrill(dr);
    } else if (kind === 'write') {
      wd.text = t.value;
      if (!wd.started) wd.started = Date.now();
      storeWd();
      const wc = $('#wc'); if (wc) wc.textContent = wordCount(t.value);
    } else if (kind === 'wcustom') { wd.custom = t.value; storeWd(); }
    else if (t.id === 'chat-input') chatDraft = t.value;
    else if (t.id === 'chunk-search') {
      chunkSearch = t.value;
      const pos = t.selectionStart;
      render();
      const s = $('#chunk-search'); s.focus(); s.setSelectionRange(pos, pos);
    } else if (t.dataset.setting === 'rate') $('#rate-val').textContent = (+t.value).toFixed(2);
  });

  // 写作计时
  setInterval(() => { const el = $('#wtime'); if (el && wd.started && !wd.result) el.textContent = fmtSecs((Date.now() - wd.started) / 1000); }, 1000);

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'import-file' && t.files[0]) return importData(t.files[0]);
    if (t.id === 'asr-engine') { Speech.saveAsrConfig({ ...Speech.asrConfig(), engine: t.value }); return render(); }
    if (t.id === 'ai-provider') {
      const p = t.value, cur = AI.config();
      AI.saveConfig({ provider: p, apiKey: p === cur.provider ? cur.apiKey : '', model: AI.PROVIDERS[p].model, baseUrl: AI.PROVIDERS[p].base || '' });
      return render();
    }
    if (t.dataset.deckToggle) {
      S.settings.decks[t.dataset.deckToggle] = t.checked;
      S.settings.t = Date.now(); save(); buildDeck(); vq = [];
      return flash('已保存');
    }
    const k = t.dataset.setting;
    if (!k) return;
    if (t.type === 'checkbox') S.settings[k] = t.checked;
    else if (t.type === 'number') S.settings[k] = clamp(Math.round(+t.value) || 1, +t.min, +t.max);
    else if (t.type === 'range') S.settings[k] = +t.value;
    else if (k === 'target') S.settings[k] = +t.value;
    else S.settings[k] = t.value;
    S.settings.t = Date.now();
    save();
    if (k === 'newPerDay') vq = [];
    if (k === 'examDate' || k === 'target') render();
    flash('已保存');
  });

  document.addEventListener('keydown', e => {
    const t = e.target, d = t.dataset || {};
    if (d.input === 'listen') {
      if (e.key === 'Enter') { e.preventDefault(); checkListen(+d.i); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); playListen(+d.i); }
      return;
    }
    if (t.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); chatSend(t.value); return; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
      if (t.id && t.id.startsWith('cw-') && e.key === 'Enter' && addCustom($('#cw-en').value, $('#cw-zh').value, $('#cw-ex').value)) render();
      return;
    }
    if (document.querySelector('.celebrate')) return;
    if (view === 'chunks' && chunkMode === 'study' && vq.length) {
      if ((e.key === ' ' || e.key === 'Enter') && !vRevealed) { e.preventDefault(); vRevealed = true; render(); }
      else if (vRevealed && /^[1-4]$/.test(e.key)) rateCard(+e.key - 1);
      else if (e.key === 'r' || e.key === 'R') Speech.speak(CARD[vq[0]].en);
    }
  });

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data.cards !== 'object' || typeof data.history !== 'object') throw new Error('bad');
        if (!confirm('导入会和当前进度合并，确定吗？')) return;
        S = merge(S, data); save(); buildDeck(); vq = []; render();
        flash('导入成功');
      } catch (e) { flash('文件格式不对，导入失败'); }
    };
    reader.readAsText(file);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (dirty) push(); return; }
    if (S.today.date !== dayKey()) render();
    pull();
  });
  window.addEventListener('storage', e => { if (e.key === STORE) { S = load(); buildDeck(); vq = []; render(); } });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

  // ================= 启动 =================
  buildDeck();
  if (!S.today || S.v !== 3) save();
  render();
  if (GistSync.ready()) { setSync('idle'); pull(); }
})();

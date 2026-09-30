/* SpeakUp · 英语精进 —— 主程序 */
(() => {
  'use strict';

  const STORE = 'speakup.v2';
  const CHATS = 'speakup.chats';
  const MATURE = 21;          // 复习间隔 ≥ 21 天视为已掌握
  const SLOW = 0.6;
  const MONO_SECONDS = 30;    // 独白至少说 30 秒

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

  // 比对用：统一大小写、引号、连字符，0–20 的数字转成单词
  const NUMS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
  const norm = s => String(s).toLowerCase()
    .replace(/[’‘`]/g, "'").replace(/[^a-z0-9'\s-]/g, ' ').replace(/-/g, ' ')
    .split(/\s+/).map(t => t.replace(/^'+|'+$/g, '')).filter(Boolean)
    .map(t => (/^\d+$/.test(t) && +t <= 20 ? NUMS[+t] : t));

  function wordsHtml(text, okFn, badCls) {
    return String(text).split(/\s+/).filter(Boolean)
      .map((w, i) => `<span class="${okFn(w, i) ? 'hit' : badCls}">${esc(w)}</span>`).join(' ');
  }

  // 逐词最长公共子序列比对（听写、跟读）
  function diffWords(target, input) {
    const tok = s => {
      const words = String(s).split(/\s+/).filter(Boolean), flat = [], owner = [];
      words.forEach((w, i) => norm(w).forEach(t => { flat.push(t); owner.push(i); }));
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
    const ok = (T, hits) => T.words.map((_, wi) => T.owner.every((o, k) => o !== wi || hits[k]));
    const aOk = ok(A, aHit), bOk = ok(B, bHit);
    return {
      score: n ? aHit.filter(Boolean).length / n : 0,
      targetHtml: wordsHtml(target, (w, i) => aOk[i], 'miss'),
      inputHtml: wordsHtml(input, (w, i) => bOk[i], 'extra'),
    };
  }

  // ================= 内容 =================
  const TAGS = {
    game: { icon: '🎮', name: '游戏' }, work: { icon: '💼', name: '职场' }, tech: { icon: '🔧', name: '技术' },
    daily: { icon: '💬', name: '日常' }, vocab: { icon: '📚', name: '核心词汇' }, my: { icon: '⭐', name: '我的收藏' },
  };
  const tagChip = t => TAGS[t] ? `<span class="chip">${TAGS[t].icon} ${TAGS[t].name}</span>` : '';
  const indexByTag = (arr, pos) => { const g = {}; arr.forEach((x, i) => (g[x[pos]] = g[x[pos]] || []).push(i)); return g; };
  const MIX = ['game', 'work', 'daily', 'tech'];
  const SAY_ORDER = roundRobin(MIX.map(t => indexByTag(SAY, 2)[t] || []));
  const LISTEN_ORDER = roundRobin(MIX.map(t => indexByTag(LISTEN, 1)[t] || []));
  const SC_ORDER = roundRobin(['game', 'work', 'daily'].map(t => SCENARIOS.filter(s => s.tag === t).map(s => s.id)));
  const SC = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));

  // ================= 状态 =================
  const DEFAULT = () => ({
    v: 2,
    settings: {
      t: 0, newPerDay: 8, sayPerDay: 5, listenPerDay: 4, chatGoal: 6,
      decks: { game: true, work: true, tech: true, daily: true, vocab: false },
      voice: '', rate: 0.95, autoSpeak: true, aiVoice: true, autoSend: true,
    },
    cards: {}, custom: [],
    ptr: { say: 0, listen: 0, scenario: 0, topic: 0 },
    retry: { say: [], listen: [] },
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
      cards: s.cards || {}, custom: Array.isArray(s.custom) ? s.custom : [], history: s.history || {},
    };
  }
  function load() { try { return normalize(JSON.parse(localStorage.getItem(STORE))); } catch (e) { return DEFAULT(); } }

  let S = load();
  function save(opts = {}) {
    S.updatedAt = Date.now();
    localStorage.setItem(STORE, JSON.stringify(S));
    if (opts.sync !== false) schedulePush();
  }

  // 两台设备的进度合并：逐项取较新的，打卡记录取并集
  function merge(a, b) {
    a = normalize(a); b = normalize(b);
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
    if (old.today && (!out.today || old.today.date > out.today.date)) out.today = old.today;
    else if (old.today && out.today && old.today.date === out.today.date) {
      const t = out.today, o = old.today;
      for (const f of ['newCount', 'reviewCount', 'bonus', 'chatTurns']) t[f] = Math.max(t[f] || 0, o[f] || 0);
      t.monologue = !!(t.monologue || o.monologue);
      for (const cat of ['say', 'listen']) {
        t.items[cat] = uniq([...t.items[cat], ...o.items[cat]]);
        t.done[cat] = uniq([...t.done[cat], ...o.done[cat]]);
      }
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
    for (const k of ['game', 'work', 'tech', 'daily'])
      cat[k] = CHUNKS[k].map(c => ({ key: k[0] + ':' + c[0], deck: k, en: c[0], zh: c[1], ex: c[2], exZh: c[3] }));
    cat.vocab = seededShuffle(WORDS.map(w => ({ key: 'v:' + w[0], deck: 'vocab', en: w[0], ipa: w[1], zh: w[2], colloc: w[3], ex: w[4], exZh: w[5] })), 20260929);
    cat.my = S.custom.filter(c => !c.del).map(c => ({ key: 'my:' + c.en, deck: 'my', en: c.en, zh: c.zh, ex: c.ex || '', exZh: c.exZh || '' }));
    DECK = [].concat(cat.my, cat.game, cat.work, cat.tech, cat.daily, cat.vocab);
    CARD = Object.fromEntries(DECK.map(c => [c.key, c]));
    const on = S.settings.decks;
    NEWQ = [...cat.my, ...roundRobin(['game', 'work', 'daily', 'tech', 'vocab'].filter(k => on[k]).map(k => cat[k]))].map(c => c.key);
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
  function pickItems(cat, n, exclude = []) {
    const order = cat === 'say' ? SAY_ORDER : LISTEN_ORDER;
    const out = [];
    const taken = i => out.includes(i) || exclude.includes(i);
    for (const i of S.retry[cat]) { if (out.length >= n) break; if (i < order.length && !taken(i)) out.push(i); }
    for (let guard = 0; out.length < n && guard < order.length; guard++) {
      const i = order[S.ptr[cat] % order.length];
      S.ptr[cat] = (S.ptr[cat] + 1) % order.length;
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
      goal: { say: st.sayPerDay, listen: st.listenPerDay, chat: st.chatGoal },
      items: { say: pickItems('say', st.sayPerDay), listen: pickItems('listen', st.listenPerDay) },
      done: { say: [], listen: [] },
      scenario: SC_ORDER[S.ptr.scenario % SC_ORDER.length],
      topic: S.ptr.topic % TOPICS.length,
      chatTurns: 0, monologue: false,
    };
    S.ptr.scenario = (S.ptr.scenario + 1) % SC_ORDER.length;
    S.ptr.topic = (S.ptr.topic + 1) % TOPICS.length;
    save();
    return true;
  }

  const TASKS = [
    { id: 'chunks', icon: '🧠', name: '语块记忆', desc: '整块记表达，按遗忘曲线复习' },
    { id: 'say', icon: '🗣️', name: '说出来', desc: '看中文情境，用英语说出来' },
    { id: 'listen', icon: '🎧', name: '听说训练', desc: '先听写，再跟读' },
    { id: 'chat', icon: '🤖', name: 'AI 陪练', desc: '真实场景对话，句句纠错' },
  ];
  function taskState(id) {
    const t = S.today;
    if (id === 'chunks') {
      const left = chunksRemaining(), did = t.newCount + t.reviewCount;
      return { done: left === 0, left, pct: did + left ? did / (did + left) : 1,
        text: left === 0 ? `已完成 · 新学 ${t.newCount} · 复习 ${t.reviewCount}` : `新语块 ${newKeys(newLeft()).length} · 待复习 ${dueKeys().length}` };
    }
    if (id === 'chat') {
      if (!AI.ready()) return { done: !!t.monologue, left: t.monologue ? 0 : 1, pct: t.monologue ? 1 : 0, text: t.monologue ? '已完成 1 分钟独白' : '未设置 AI：先做 1 分钟独白' };
      const n = t.chatTurns || 0, goal = t.goal.chat;
      return { done: n >= goal, left: Math.max(0, goal - n), pct: Math.min(1, n / goal), text: `${Math.min(n, goal)} / ${goal} 句对话` };
    }
    const n = t.done[id].length, goal = t.goal[id];
    return { done: n >= goal, left: Math.max(0, goal - n), pct: Math.min(1, n / goal), text: `${Math.min(n, goal)} / ${goal} 题` };
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

  // ================= 视图状态 =================
  const VIEWS = ['home', 'chunks', 'say', 'listen', 'chat', 'me'];
  let view = VIEWS.includes(location.hash.slice(1).split('/')[0]) ? location.hash.slice(1).split('/')[0] : 'home';
  const ui = { say: {}, listen: {} };
  let vq = [], vRevealed = false, chunkMode = 'study', chunkSearch = '', chunkFilter = 'all', chunkHeard = null, lastSpoken = null;
  let mic = null;                 // 正在听写的目标 {kind, i}
  let shadow = null;              // 正在跟读录音 {i, rec}
  let chatDraft = '', chatBusy = false, chatError = '', showScenarios = false;
  let mono = null, monoResult = null;
  let aiTesting = false, asrTesting = false;
  let installPrompt = null;

  Speech.configure(() => ({ voice: S.settings.voice, rate: S.settings.rate }));

  function go(v, anchor) {
    view = v;
    if (v === 'chunks') chunkMode = 'study';
    try { history.replaceState(null, '', '#' + v); } catch (e) { /* file:// */ }
    stopMic();
    render();
    if (anchor) { const el = document.getElementById(anchor); if (el) { el.scrollIntoView({ block: 'start' }); return; } }
    window.scrollTo(0, 0);
  }

  function render() {
    if (ensureToday()) { vq = []; ui.say = {}; ui.listen = {}; }
    const fn = { home: viewHome, chunks: viewChunks, say: viewSay, listen: viewListen, chat: viewChat, me: viewMe }[view];
    $('#app').innerHTML = fn();
    updateNav();
    afterRender();
  }

  function updateNav() {
    document.querySelectorAll('#nav button').forEach(b => {
      const id = b.dataset.view;
      b.classList.toggle('active', id === view);
      const badge = b.querySelector('.badge');
      const task = TASKS.find(t => t.id === id);
      if (!task) { badge.hidden = true; return; }
      const st = taskState(id);
      badge.hidden = false;
      badge.className = 'badge' + (st.done ? ' ok' : '');
      badge.textContent = st.done ? '✓' : st.left;
    });
  }

  function afterRender() {
    if (view === 'chunks' && chunkMode === 'study' && vq[0] && lastSpoken !== vq[0]) {
      lastSpoken = vq[0];
      const c = CARD[vq[0]], st = S.cards[vq[0]];
      const producing = c.deck !== 'vocab' && st && st.reps >= 1;
      if (S.settings.autoSpeak && !producing) Speech.speak(c.en);
    }
    if (view === 'chat') { const box = $('#chat-log'); if (box) box.scrollTop = box.scrollHeight; }
  }

  // ================= 首页 =================
  const TIPS = [
    '开口比完美更重要。说错了 AI 会帮你改，不说永远学不会。',
    '每天 15 分钟，比周末突击 2 小时有效得多——关键是“每天”。',
    '打游戏时先从报点开始：数量 + 位置，比如 “Two on B”。短，但队友最需要。',
    '背语块时一定要读出声，大脑记住的是“说出来的感觉”。',
    '跟读时模仿的是语调和节奏，不只是单词。录下来听一遍，差别一下就出来了。',
    '想不起英文说法时，先用简单的词绕过去：不会说“勘误表”，就说 the list of known chip bugs。',
    '外企面试最常问的就是 Tell me about yourself，把 30 秒自我介绍练到脱口而出。',
    '看比赛直播或主播时，留意他们怎么报点、怎么吐槽——这些都是最地道的游戏英语。',
    '把手机系统语言改成英文，每天被动接触英语。',
    '别在脑子里先写中文再翻译，直接想“一个外国队友此刻会怎么说”。',
    'AI 陪练结束后点“结束并点评”，把错得最多的句子收藏进语块，第二天就会考你。',
    '听不懂的时候，大方说 Sorry, say again? ——母语者自己也天天这么说。',
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
    const banners = [
      !AI.ready() && `<button class="banner" data-go="me" data-anchor="sec-ai"><b>🤖 设置 AI 陪练</b><span>填一个 API Key，就能用英语和 AI 对话、每句话都帮你纠错。</span><i>去设置 →</i></button>`,
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
      <section class="card quote">
        <div class="quote-en">“${esc(q[0])}” <button class="icon-btn" data-say="${esc(q[0])}" title="朗读">🔊</button></div>
        <div class="quote-cn">${esc(q[1])}</div>
      </section>
      ${banners}
      <h3 class="section-title">今日练习 <small class="muted">约 15–20 分钟</small></h3>
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
    const decks = ['all', 'game', 'work', 'tech', 'daily', 'vocab', 'my'];
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
        <p class="muted small">打游戏、看视频、开会时听到的好表达，加进来就会排进每天的新语块（优先）。</p>
        <div class="add-form">
          <input id="cw-en" placeholder="英文，如 That's a wrap" autocomplete="off">
          <input id="cw-zh" placeholder="中文意思，如 今天就到这" autocomplete="off">
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
    mic = { kind, i, phase: 'starting' };
    const setText = t => {
      if (kind === 'say') { const u = ui.say[i] = ui.say[i] || {}; u.input = t; u.via = 'voice'; const el = document.querySelector(`[data-input="say"][data-i="${i}"]`); if (el) el.value = t; }
      else if (kind === 'chat') { chatDraft = t; const el = $('#chat-input'); if (el) el.value = t; }
      else if (kind === 'chunk') { chunkHeard = t; const el = $('#heard-live'); if (el) el.textContent = t; }
    };
    Speech.capture({
      continuous: kind !== 'chunk',
      autoStop: kind === 'chunk' ? 1500 : 0,
      onState: phase => { if (mic) { mic.phase = phase; render(); } },
      onLevel: lv => { const el = document.querySelector('.btn.rec .lvl i'); if (el) el.style.transform = `scaleY(${Math.min(1, 0.15 + lv * 2.5)})`; },
      onText: setText,
      onError: m => flash(m),
      onEnd: final => {
        mic = null;
        if (final) emptyInRow = 0;
        else if (++emptyInRow >= 2 && !Speech.cloudReady()) { emptyInRow = 0; flash('识别不稳定？到「我的 → 语音识别」开启 SenseVoice，更准也免费'); }
        if (kind === 'chunk') { chunkHeard = final; vRevealed = true; render(); return; }
        if (final) setText(final);
        if (kind === 'chat' && S.settings.autoSend && final) { chatSend(final); return; }
        render();
      },
    });
  }

  // ================= 说出来 =================
  function sayCard(i, n) {
    const [zh, ref, tag, tip] = SAY[i];
    const u = ui.say[i] || (ui.say[i] = {});
    const done = S.today.done.say.includes(i);
    const head = `<div class="ex-num">${n + 1}</div><div class="ex-top">${tagChip(tag)}</div><div class="prompt-zh">${esc(zh)}</div>`;
    const refHtml = `<div class="ref"><span class="label">参考说法</span>${ref.split(' / ').map(s => `<div class="ref-line">${u.input && !u.result?.ai ? wordsHtml(s, w => norm(w).every(t => new Set(norm(u.input)).has(t)), 'plain') : esc(s)} <button class="icon-btn sm" data-say="${esc(s)}">🔊</button></div>`).join('')}</div>`;
    if (!u.result && !(done && !u.again)) {
      return head + `
        <textarea data-input="say" data-i="${i}" rows="2" placeholder="用英语说出来（点 🎤）或者直接打字…">${esc(u.input || '')}</textarea>
        <div class="row">${micBtn('say', i)}<button class="btn" data-act="say-submit" data-i="${i}" ${u.loading ? 'disabled' : ''}>${u.loading ? 'AI 批改中…' : AI.ready() ? '提交给 AI 批改' : '对照参考答案'}</button></div>
        ${u.via === 'voice' && u.input && !(mic && mic.kind === 'say' && mic.i === i) ? '<p class="muted small">识别有错的词可以直接在上面改，再提交。</p>' : ''}
        ${u.error ? `<div class="error">${esc(u.error)} <button class="btn ghost sm" data-act="say-ref" data-i="${i}">直接看参考答案</button></div>` : ''}`;
    }
    const r = u.result;
    const verdict = r && r.ai ? { great: ['great', '👍 很地道'], ok: ['ok', '🙂 能听懂，还可以更自然'], miss: ['miss', '🤔 意思没说对'] }[r.ai.verdict] || ['ok', ''] : null;
    return head + `
      ${u.input ? `<div class="yours"><span class="label">你说的</span>${esc(u.input)}</div>` : ''}
      ${verdict ? `<div class="verdict ${verdict[0]}">${verdict[1]}</div>
        ${r.ai.verdict !== 'great' ? `<div class="right">✏️ ${esc(r.ai.better)} <button class="icon-btn sm" data-say="${esc(r.ai.better)}">🔊</button></div>` : ''}
        <div class="why">💬 ${esc(r.ai.explain_zh)}</div>` : ''}
      ${refHtml}
      ${tip ? `<div class="why">💡 ${esc(tip)}</div>` : ''}
      ${done ? `<div class="row"><span class="done-mark">✓ 已完成</span><button class="btn ghost sm" data-act="say-again" data-i="${i}">再说一次</button></div>`
        : `<div class="row"><button class="btn ghost" data-act="say-grade" data-i="${i}" data-g="1">说对了</button><button class="btn" data-act="say-grade" data-i="${i}" data-g="0">没说好，之后再练</button></div>`}`;
  }

  async function saySubmit(i) {
    const u = ui.say[i] || (ui.say[i] = {});
    const input = (u.input || '').trim();
    if (!AI.ready()) { u.result = { ai: null }; u.again = false; render(); return; }
    if (!input) { flash('先说一句或写一句再提交'); return; }
    u.loading = true; u.error = ''; render();
    try {
      const r = await AI.grade(SAY[i][0], SAY[i][1], input, u.via === 'voice' ? 'voice' : 'typed');
      u.result = { ai: r }; u.again = false;
      markDone('say', i, r.verdict === 'great');
    } catch (e) { u.error = e.message; }
    u.loading = false;
    render();
  }

  function markDone(cat, i, good) {
    const r = S.retry[cat], pos = r.indexOf(i);
    if (good && pos >= 0) r.splice(pos, 1);
    if (!good && pos < 0) r.push(i);
    if (!S.today.done[cat].includes(i)) S.today.done[cat].push(i);
    logActivity();
  }

  function exerciseFooter(cat, title) {
    if (!taskState(cat).done) return '';
    return `<div class="card empty small"><p>✅ 今日「${title}」已完成！</p>
      <div class="row center"><button class="btn ghost" data-act="extra" data-cat="${cat}">再来 1 题</button><button class="btn" data-go="${nextTask()}">${allDone() ? '回到今日' : '下一项 →'}</button></div></div>`;
  }

  function viewSay() {
    const t = S.today;
    return `<div class="page-head"><div><h2>说出来</h2><p class="muted">看到中文情境，直接用英语说。${AI.ready() ? 'AI 会判断你的说法在真实场景里行不行，并给出更地道的版本。' : '说完对照参考答案（设置 AI 后可以自动批改）。'}</p></div>
      <div class="counter">${taskState('say').text}</div></div>
      ${t.items.say.map((i, n) => `<div class="card ex" id="say-${i}">${sayCard(i, n)}</div>`).join('')}
      ${exerciseFooter('say', '说出来')}`;
  }

  // ================= 听说 =================
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
          ${sh.url ? `<div class="row"><span class="label">你的录音</span><audio controls src="${sh.url}"></audio><button class="icon-btn" data-say="${esc(sentence)}" title="听原音">🔊 原音</button></div>` : ''}
          ${sh.heard != null ? `<div class="diff"><span class="label">识别到</span>${sh.diff ? sh.diff.inputHtml : esc(sh.heard)} <b class="${sh.diff && sh.diff.score >= 0.8 ? 'ok-text' : ''}">${sh.diff ? Math.round(sh.diff.score * 100) + '%' : ''}</b></div>` : ''}
        </div>` : ''}
      </div>`;
    return controls + step1 + step2;
  }

  function viewListen() {
    return `<div class="page-head"><div><h2>听说训练</h2><p class="muted">每句两步：先听写练耳朵，再跟读练嘴巴。大小写和标点不影响得分。</p></div>
      <div class="counter">${taskState('listen').text}</div></div>
      ${S.today.items.listen.map((i, n) => `<div class="card ex" id="listen-${i}">${listenCard(i, n)}</div>`).join('')}
      ${exerciseFooter('listen', '听说训练')}`;
  }

  function playListen(i, rate) {
    const u = ui.listen[i] || (ui.listen[i] = {});
    u.plays = (u.plays || 0) + 1;
    Speech.speak(LISTEN[i][0], rate);
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
    markDone('listen', i, u.result.score >= 1);
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
      if (s.heard != null) u.shadow.diff = diffWords(LISTEN[i][0], s.heard);
      render();
      return;
    }
    if (shadow) return;
    stopMic();
    const s = { i, rec: null, heard: null, playing: true, live: false };
    shadow = s;
    render();
    await Speech.speak(LISTEN[i][0]);                // 先放一遍原音
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

  function viewMonologue() {
    const [topic, zh, chunks] = TOPICS[S.today.topic % TOPICS.length];
    const r = monoResult;
    return `<div class="page-head"><div><h2>AI 陪练</h2><p class="muted">还没设置 AI。设置后就能和 AI 用英语对话、句句纠错。</p></div></div>
      <button class="banner" data-go="me" data-anchor="sec-ai"><b>🤖 两分钟设置 AI 陪练</b><span>推荐 DeepSeek：国内直连，每天练一次一个月几块钱。</span><i>去设置 →</i></button>
      <div class="card">
        <h3 class="card-title">今天先做：1 分钟英语独白</h3>
        <p class="prompt-zh">${esc(topic)} <button class="icon-btn sm" data-say="${esc(topic)}">🔊</button></p>
        <p class="muted">${esc(zh)}</p>
        <div class="why">🧩 可以用上：${esc(chunks)}</div>
        <p class="muted small">对着麦克风说至少 ${MONO_SECONDS} 秒，说完回放听听自己的发音。卡住了也别停，用简单的词绕过去。</p>
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
    const decks = ['game', 'work', 'tech', 'daily', 'vocab'].map(d => `<label class="toggle"><input type="checkbox" data-deck-toggle="${d}" ${s.decks[d] ? 'checked' : ''}> ${TAGS[d].icon} ${TAGS[d].name}</label>`).join('');
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
        ${num('sayPerDay', '说出来', 1, 15, '明天生效')}
        ${num('listenPerDay', '听说训练', 1, 15, '明天生效')}
        ${num('chatGoal', 'AI 对话句数', 2, 30, '明天生效')}
        <div class="setting"><span>新语块来自<small class="muted">核心词汇偏阅读，适合读技术文档</small></span><div class="chips">${decks}</div></div>
      </section>

      <section class="card">
        <h3 class="card-title">🔊 朗读</h3>
        ${Speech.hasTTS ? `
        <label class="setting"><span>发音人<small class="muted">Edge 里带 Natural 的最自然</small></span><select data-setting="voice">${voiceOpts}</select></label>
        <label class="setting"><span>语速 <b id="rate-val">${s.rate.toFixed(2)}</b></span><input type="range" data-setting="rate" min="0.5" max="1.3" step="0.05" value="${s.rate}"></label>
        <label class="setting"><span>语块自动发音</span><input type="checkbox" data-setting="autoSpeak" ${s.autoSpeak ? 'checked' : ''}></label>
        <div class="row"><button class="btn ghost" data-say="Nice shot! Let's rotate to B and play for the retake.">试听</button></div>`
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
      'DURATION:PT15M', 'RRULE:FREQ=DAILY',
      'SUMMARY:📘 SpeakUp 练英语（15 分钟）',
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
      // 说出来
      case 'say-submit': return saySubmit(i);
      case 'say-ref': { const u = ui.say[i] || (ui.say[i] = {}); u.result = { ai: null }; u.error = ''; return render(); }
      case 'say-grade': markDone('say', i, d.g === '1'); return render();
      case 'say-again': { const u = ui.say[i] || (ui.say[i] = {}); u.result = null; u.again = true; u.input = ''; u.via = ''; return render(); }
      // 听说
      case 'play': return playListen(i);
      case 'play-slow': return playListen(i, SLOW);
      case 'check': return checkListen(i);
      case 'redo': { const u = ui.listen[i] || (ui.listen[i] = {}); u.result = null; u.input = ''; u.redo = true; return render(); }
      case 'shadow': return toggleShadow(i);
      case 'extra': {
        const more = pickItems(d.cat, 1, S.today.items[d.cat]);
        if (!more.length) { flash('这一类今天都练过了'); return; }
        S.today.items[d.cat].push(...more); save(); return render();
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
        try { await AI.test(); flash('✅ 连接成功，可以开始 AI 陪练了'); } catch (e) { flash('❌ ' + e.message); }
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
          localStorage.removeItem(STORE); localStorage.removeItem(CHATS);
          S = load(); buildDeck(); vq = []; ensureToday(); save(); render(); flash('已清空');
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
    const t = e.target;
    if (t.dataset.input) { const box = ui[t.dataset.input]; (box[t.dataset.i] = box[t.dataset.i] || {}).input = t.value; }
    else if (t.id === 'chat-input') chatDraft = t.value;
    else if (t.id === 'chunk-search') {
      chunkSearch = t.value;
      const pos = t.selectionStart;
      render();
      const s = $('#chunk-search'); s.focus(); s.setSelectionRange(pos, pos);
    } else if (t.dataset.setting === 'rate') $('#rate-val').textContent = (+t.value).toFixed(2);
  });

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
    else S.settings[k] = t.value;
    S.settings.t = Date.now();
    save();
    if (k === 'newPerDay') vq = [];
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
    if (d.input === 'say' && e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); saySubmit(+d.i); return; }
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
  render();
  if (GistSync.ready()) { setSync('idle'); pull(); }
})();

// 端到端测试：在 jsdom 里加载真实页面，模拟用户点击；AI 与 GitHub 接口用本地假服务代替。
// 运行：node build/test/e2e.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SCRIPTS = ['data/chunks.js', 'data/words.js', 'data/practice.js', 'js/speech.js', 'js/ai.js', 'js/sync.js', 'js/app.js'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failures++; };

// ---------- 假服务 ----------
const gists = {};          // 模拟 GitHub Gist
const calls = [];
let claudeReplies = 0;
let siliconText = '<|en|><|NEUTRAL|>Two on B, one behind the car.';
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

async function fakeFetch(url, init = {}) {
  url = String(url);
  const method = (init.method || 'GET').toUpperCase();
  let raw = init.body;
  if (raw && typeof raw.append === 'function' && typeof raw.get === 'function') {
    const form = { model: raw.get('model'), file: raw.get('file') };
    calls.push({ url, method, body: form, headers: init.headers });
    if (url.startsWith('https://api.siliconflow.cn/v1/audio/transcriptions')) {
      if (new Headers(init.headers).get('authorization') !== 'Bearer sk-sf-good') return json({ code: 20015, message: 'Invalid token' }, 401);
      return json({ text: siliconText });
    }
    throw new Error('unexpected form upload ' + url);
  }
  if (raw && typeof raw !== 'string') raw = typeof raw.getReader === 'function' ? await new Response(raw).text() : Buffer.from(raw).toString('utf8');
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch (e) { console.log('  DEBUG unparsable body for', url, typeof init.body, String(raw).slice(0, 80)); throw e; }
  calls.push({ url, method, body, headers: init.headers });
  if (url.startsWith('https://api.deepseek.com')) {
    const sys = body.messages[0].content;
    let content;
    if (sys.includes('reviewing a practice conversation')) content = { score: 4, summary_zh: '整体不错，敢开口。', fixes: [{ you: 'i go B', better: "I'm going B.", why_zh: '要用进行时' }], chunks: [{ en: 'Good call', zh: '报得好' }] };
    else if (sys.includes('situation described in Chinese')) content = { verdict: 'ok', better: 'Two on B, one behind the car.', explain_zh: '报点更短更好' };
    else content = { reply: 'Nice! What gun do you usually use?', correction: { needed: true, better: 'I usually play the AK.', better_zh: '我一般用 AK。', explain_zh: '习惯用一般现在时' }, hint_zh: '可以说你喜欢的枪：I love the AWP.' };
    return json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  }
  if (url.startsWith('https://api.anthropic.com')) {
    if (new Headers(init.headers).get('x-api-key') === 'sk-ant-nocredit') return json({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' }, request_id: 'req_x' }, 400);
    claudeReplies++;
    return json({
      id: 'msg_' + claudeReplies, type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_details: null,
      content: [{ type: 'thinking', thinking: '', signature: 'sig-' + claudeReplies }, { type: 'text', text: JSON.stringify({ reply: `Claude reply ${claudeReplies}`, correction: { needed: false, better: '', better_zh: '', explain_zh: '' }, hint_zh: '' }) }],
      usage: { input_tokens: 100, output_tokens: 30 },
    });
  }
  if (url.startsWith('https://api.github.com')) {
    const u = new URL(url);
    if (u.pathname === '/gists' && method === 'GET') return json(Object.values(gists).map(g => ({ id: g.id, files: { [Object.keys(g.files)[0]]: {} } })));
    if (u.pathname === '/gists' && method === 'POST') { const id = 'g' + (Object.keys(gists).length + 1); gists[id] = { id, files: body.files }; return json({ id }, 201); }
    const m = u.pathname.match(/^\/gists\/(\w+)$/);
    if (m && gists[m[1]]) {
      if (method === 'PATCH') { Object.assign(gists[m[1]].files, body.files); return json({ id: m[1] }); }
      return json(gists[m[1]]);
    }
    return json({ message: 'Not Found' }, 404);
  }
  throw new Error('unexpected fetch ' + url);
}

// ---------- 打开一个“设备” ----------
function openDevice(storage) {
  const html = read('index.html').replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://learner.github.io/english-coach/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  Object.assign(w, { fetch: fakeFetch, Response, Headers, Request, ReadableStream, TextEncoder, TextDecoder });
  w.confirm = () => true;
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  w.speechSynthesis = { speak(u) { setTimeout(() => u.onend && u.onend(), 0); }, cancel() {}, getVoices: () => [{ name: 'Aria Natural', lang: 'en-US' }], addEventListener() {} };
  w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  w.nextSpeech = '';
  w.asrMode = 'normal';     // normal | interim-only | drop-then-continue
  w.asrStarts = 0;
  w.webkitSpeechRecognition = class {
    start() {
      const n = ++w.asrStarts;
      setTimeout(() => {
        this.onstart && this.onstart();
        const emit = (t, fin) => { const r = [{ transcript: t }]; r.isFinal = fin; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); };
        if (w.asrMode === 'interim-only') emit(w.nextSpeech, false);            // 用户按停止时还没确认
        else if (w.asrMode === 'drop-then-continue') {
          if (w.asrStarts === w.asrFirst) { emit("I can't reproduce", true); setTimeout(() => this.onend && this.onend(), 5); }   // 停顿后浏览器自己结束
          else emit('the bug on my board', true);
        } else emit(w.nextSpeech, true);
        if (!this.continuous) this.onend && this.onend();
      }, 0);
    }
    stop() { setTimeout(() => this.onend && this.onend(), 0); }
  };
  Object.defineProperty(w.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  w.MediaRecorder = class {
    constructor() { this.mimeType = 'audio/webm'; }
    start() {}
    stop() { setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: new w.Blob(['x'], { type: 'audio/webm' }) }); this.onstop && this.onstop(); }, 0); }
  };
  w.URL.createObjectURL = () => 'blob:test';
  for (const f of SCRIPTS) w.eval(read(f));
  const $ = s => w.document.querySelector(s);
  const $$ = s => [...w.document.querySelectorAll(s)];
  const click = el => { if (!el) throw new Error('element not found'); el.click(); };
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const change = (el, v) => { if (typeof v === 'boolean') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const key = (k, target) => (target || w.document.body).dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  const nav = v => click($(`#nav button[data-view="${v}"]`));
  const text = () => $('#app').textContent;
  const state = () => JSON.parse(w.localStorage.getItem('speakup.v2'));
  return { dom, w, $, $$, click, type, change, key, nav, text, state };
}

(async () => {
  console.log('\n[设备 1：电脑]');
  const A = openDevice();
  ok(A.text().includes('今日练习') && A.$$('.task').length === 4, '首页显示 4 项练习');
  ok(A.$$('.banner').length === 2, '首页提示设置 AI 和同步');

  // 语块
  A.nav('chunks');
  ok(A.text().includes('新语块 8'), '语块：今天 8 个新语块');
  let n = 0, forgot = false;
  while (!A.text().includes('今天的语块完成了') && n < 40) {
    A.key(' ');
    if (!forgot) { A.key('1'); forgot = true; } else A.key('3');
    n++;
  }
  ok(n === 9, `语块：${n} 次评分后完成（8 新 + 1 次忘记重来）`);
  const keys = Object.keys(A.state().cards);
  ok(keys.length === 8 && ['g:', 'w:', 'd:', 't:'].every(p => keys.some(k => k.startsWith(p))), '新语块在游戏/职场/日常/技术之间轮换');

  // 说出来（未设置 AI）
  A.nav('say');
  const sayIds = A.$$('[data-input="say"]').map(e => e.dataset.i);
  ok(sayIds.length === 5, '说出来：5 道题');
  for (const [k, i] of sayIds.entries()) {
    A.type(A.$(`[data-input="say"][data-i="${i}"]`), 'Two on B');
    A.click(A.$(`[data-act="say-submit"][data-i="${i}"]`));
    ok(k > 0 || A.text().includes('参考说法'), '说出来：没设置 AI 时显示参考说法');
    A.click(A.$(`[data-act="say-grade"][data-i="${i}"][data-g="${k === 0 ? 0 : 1}"]`));
  }
  ok(A.text().includes('今日「说出来」已完成'), '说出来：完成');

  // 听说
  A.nav('listen');
  const lIds = A.$$('[data-input="listen"]').map(e => +e.dataset.i);
  const LISTEN = A.w.LISTEN;
  lIds.forEach((i, k) => {
    const input = A.$(`[data-input="listen"][data-i="${i}"]`);
    A.type(input, k === 0 ? LISTEN[i][0].toUpperCase().replace(/[.,?!]/g, '') : LISTEN[i][0].split(' ').slice(0, -2).join(' ') + ' blah');
    A.click(A.$(`[data-act="check"][data-i="${i}"]`));
    if (k === 0) ok(A.text().includes('听写全对'), '听写：忽略大小写和标点');
    if (k === 1) ok(A.$('.miss') && A.$('.extra'), '听写：标出漏写和多写的词');
  });
  ok(A.text().includes('今日「听说训练」已完成') && A.text().includes('跟读'), '听说：完成，并出现跟读步骤');

  // AI 陪练：先设置 DeepSeek
  A.nav('chat');
  ok(A.text().includes('1 分钟英语独白'), 'AI 陪练：未设置 AI 时给出独白练习');
  A.nav('me');
  A.change(A.$('#ai-provider'), 'deepseek');
  A.$('#ai-key').value = 'sk-test';
  A.click(A.$('[data-act="ai-save"]'));
  ok(A.w.AI.ready(), 'AI 设置：保存 DeepSeek key');
  A.click(A.$('[data-act="ai-test"]'));
  await sleep(20);
  ok(A.$('#flash').textContent.includes('连接成功'), 'AI 设置：测试连接成功');

  A.nav('chat');
  ok(A.$('.msg.ai') && A.text().includes('🎯'), 'AI 陪练：显示场景和开场白');
  for (let t = 0; t < 6; t++) {
    A.type(A.$('#chat-input'), t === 0 ? 'i usually play AK' : 'I think we go B');
    A.click(A.$('[data-act="chat-send"]'));
    await sleep(20);
  }
  const lastCall = calls.filter(c => c.url.includes('deepseek')).pop();
  ok(lastCall.body.response_format.type === 'json_object' && lastCall.body.messages.length === 1 + 2 + 11, 'AI 陪练：每轮都带着完整对话历史');
  ok(A.$$('.msg.me').length === 6 && A.$('.fix') && A.$('.fix').textContent.includes('I usually play the AK.'), 'AI 陪练：每句话下面有更地道的说法');
  ok(A.$('.hint-chip'), 'AI 陪练：给出下一句提示');

  // 语音输入 + 说完自动发送
  A.w.nextSpeech = 'let us rotate';
  A.click(A.$('[data-act="mic"][data-kind="chat"]'));
  await sleep(5);
  A.click(A.$('[data-act="mic"][data-kind="chat"]'));
  await sleep(40);
  ok(A.$$('.msg.me').length === 7 && A.$$('.msg.me').pop().textContent.includes('let us rotate'), 'AI 陪练：语音识别后自动发送');

  await sleep(500);
  ok(A.state().history[A.state().today.date].complete === true, '4 项全部完成 → 今日打卡');
  ok(!!A.w.document.querySelector('.celebrate'), '打卡庆祝弹窗');
  A.click(A.$('[data-act="close-celebrate"]'));

  // 点评 + 收藏
  A.click(A.$('[data-act="chat-review"]'));
  await sleep(20);
  ok(A.text().includes('本次点评') && A.text().includes('Good call'), 'AI 点评：显示值得改的句子和语块');
  A.click(A.$('.review [data-act="star"]'));
  ok(A.state().custom.some(c => c.en === 'Good call'), 'AI 点评：一键收藏语块');

  // 说出来 + AI 批改
  A.click(A.$('[data-act="extra"]') || A.$('body'));
  A.nav('say');
  A.click(A.$('[data-act="extra"][data-cat="say"]'));
  const extra = A.$$('[data-input="say"]').pop();
  A.type(extra, 'two people B');
  A.click(A.$(`[data-act="say-submit"][data-i="${extra.dataset.i}"]`));
  await sleep(20);
  ok(A.text().includes('能听懂，还可以更自然') && A.text().includes('报点更短更好'), '说出来：AI 批改显示结果和解释');

  // 语音识别：三种“读不到”的情况
  console.log('\n[语音识别]');
  const sayMic = () => A.$$('[data-act="mic"][data-kind="say"]').pop();
  const sayBox = () => A.$$('[data-input="say"]').pop();
  A.click(A.$('[data-act="extra"][data-cat="say"]'));
  A.w.nextSpeech = 'two on B';
  A.click(sayMic());
  ok(sayMic().textContent.includes('准备中'), '点麦克风后先显示“准备中…先别说”');
  await sleep(10);
  ok(A.$('.btn.rec .lvl') && sayMic().textContent.includes('说完了'), '开始听之后按钮变红，带音量条');
  A.click(sayMic()); await sleep(20);
  ok(sayBox().value === 'two on B', '正常识别：文字填进输入框');
  A.click(A.$(`[data-act="say-submit"][data-i="${sayBox().dataset.i}"]`)); await sleep(20);
  ok(calls.filter(c => c.url.includes('deepseek')).pop().body.messages[1].content.includes('spoken aloud'), '批改时告诉 AI 这句是语音识别的');

  A.click(A.$('[data-act="extra"][data-cat="say"]'));
  A.w.asrMode = 'interim-only'; A.w.nextSpeech = 'he is low one shot';
  A.click(sayMic()); await sleep(10); A.click(sayMic()); await sleep(20);
  ok(sayBox().value === 'he is low one shot', '按“说完了”时最后一段没确认，也不会被吃掉');

  A.click(A.$('[data-act="extra"][data-cat="say"]'));
  A.w.asrMode = 'drop-then-continue'; A.w.asrFirst = A.w.asrStarts + 1;
  A.click(sayMic()); await sleep(40);
  ok(sayMic() && sayMic().textContent.includes('说完了'), '说话停顿、浏览器自己停了之后会自动接着听');
  A.click(sayMic()); await sleep(20);
  ok(sayBox().value === "I can't reproduce the bug on my board", '停顿前后两段话都保留：' + sayBox().value);
  A.w.asrMode = 'normal';

  // SenseVoice
  A.nav('me');
  A.change(A.$('#asr-engine'), 'sensevoice');
  A.$('#asr-key').value = 'sk-sf-bad';
  A.click(A.$('[data-act="asr-test"]')); await sleep(30);
  ok(A.$('#flash').textContent.includes('Key 无效'), 'SenseVoice：Key 错误时提示');
  A.$('#asr-key').value = 'sk-sf-good';
  A.click(A.$('[data-act="asr-test"]')); await sleep(30);
  ok(A.$('#flash').textContent.includes('可以用了') && A.w.Speech.cloudReady(), 'SenseVoice：测试通过并启用');
  A.nav('say');
  A.click(A.$('[data-act="extra"][data-cat="say"]'));
  A.click(sayMic()); await sleep(10);
  ok(sayMic().textContent.includes('说完了'), 'SenseVoice：录音中');
  A.click(sayMic()); await sleep(30);
  const up = calls.filter(c => c.url.includes('siliconflow')).pop();
  ok(up.body.model === 'FunAudioLLM/SenseVoiceSmall' && up.body.file, 'SenseVoice：上传录音，模型正确');
  ok(sayBox().value === 'Two on B, one behind the car.', 'SenseVoice：识别结果去掉了标签，填进输入框');
  A.w.Speech.saveAsrConfig({ engine: 'browser', key: 'sk-sf-good' });

  // 同步：设备 1 开启
  A.nav('me');
  A.$('#sync-token').value = 'ghp_test';
  A.click(A.$('[data-act="sync-connect"]'));
  await sleep(50);
  ok(Object.keys(gists).length === 1 && A.w.GistSync.ready(), '同步：创建私密 Gist');
  const synced = JSON.parse(gists.g1.files['speakup-progress.json'].content);
  ok(Object.keys(synced.cards).length === 8 && !JSON.stringify(synced).includes('sk-test'), '同步：上传进度，且不包含 API Key');

  console.log('\n[设备 2：手机]');
  const B = openDevice();
  B.nav('chunks');
  B.click(B.$('[data-act="chunk-list"]'));
  B.$('#cw-en').value = 'Heads up'; B.$('#cw-zh').value = '小心/注意'; B.click(B.$('[data-act="add-custom"]'));
  B.click(B.$('[data-act="chunk-study"]'));
  B.key(' '); B.key('3');           // 手机上先学一个自己收藏的
  B.nav('me');
  B.$('#sync-token').value = 'ghp_test';
  B.click(B.$('[data-act="sync-connect"]'));
  await sleep(80);
  const bs = B.state();
  ok(Object.keys(bs.cards).length === 9 && bs.cards['my:Heads up'], `同步：两台设备的语块合并（${Object.keys(bs.cards).length}）`);
  ok(bs.history[bs.today.date].complete === true, '同步：手机上也显示今天已打卡');
  ok(bs.custom.some(c => c.en === 'Good call'), '同步：收藏的语块也同步过来了');
  ok(!B.w.AI.ready(), '同步：API Key 不会同步（每台设备单独设置）');
  await sleep(3200);
  const final = JSON.parse(gists.g1.files['speakup-progress.json'].content);
  ok(Object.keys(final.cards).length === 9, '同步：合并结果写回云端');

  console.log('\n[第二天]');
  const store = JSON.parse(A.w.localStorage.getItem('speakup.v2'));
  const shift = k => { const [y, m, d] = k.split('-').map(Number); const t = new Date(y, m - 1, d - 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  store.today.date = shift(store.today.date);
  store.history = Object.fromEntries(Object.entries(store.history).map(([k, v]) => [shift(k), v]));
  for (const c of Object.values(store.cards)) { c.due = shift(c.due); c.first = shift(c.first); }
  const retrySay = store.retry.say[0];
  const C = openDevice({ 'speakup.v2': JSON.stringify(store) });
  const cs = C.state();
  ok(cs.today.date !== store.today.date, '新的一天自动生成新任务');
  ok(C.text().includes('1天连续') || C.$('.streak b').textContent === '1', '连续打卡天数延续');
  C.nav('chunks');
  ok(/待复习 <b>8<\/b>/.test(C.$('#app').innerHTML), '昨天的语块今天到期复习');
  ok(C.text().includes('说出来') && C.$('.prompt-zh'), '复习时看中文、说英文');
  ok(cs.today.items.say[0] === retrySay, '昨天没说好的题今天优先出现');

  console.log('\n[Claude]');
  const D = openDevice();
  D.w.eval(read('vendor/claude.js'));
  D.w.AI.saveConfig({ provider: 'claude', apiKey: 'sk-ant-test', model: 'claude-opus-5-5' });
  D.nav('chat');
  for (let t = 0; t < 2; t++) { D.type(D.$('#chat-input'), 'hello there'); D.click(D.$('[data-act="chat-send"]')); await sleep(30); }
  const cc = calls.filter(c => c.url.includes('anthropic'));
  if (cc.length < 2) console.log('  DEBUG anthropic calls:', cc.length, '| page:', D.text().slice(-300));
  const second = cc[1].body;
  const replayed = second.messages[3];
  ok(cc.length === 2 && second.model === 'claude-opus-5-5' && second.fallbacks === 'default' && second.output_config.format.type === 'json_schema', 'Claude：模型、fallback、结构化输出');
  ok(replayed.role === 'assistant' && replayed.content[0].type === 'thinking' && replayed.content[0].signature === 'sig-1', 'Claude：上一轮回复（含 thinking 块）原样发回');
  ok(cc[0].body.system === second.system, 'Claude：整段对话的 system 提示词保持不变');
  ok(D.text().includes('Claude reply 2'), 'Claude：回复显示在对话里');

  D.w.AI.saveConfig({ provider: 'claude', apiKey: 'sk-ant-nocredit', model: 'claude-opus-5-5' });
  D.nav('me');
  D.click(D.$('[data-act="ai-test"]'));
  await sleep(50);
  const toast = D.$('#flash').textContent;
  ok(toast.includes('余额不足') && !toast.includes('{'), 'Claude：余额不足时显示中文提示 → ' + toast.slice(0, 30));

  console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

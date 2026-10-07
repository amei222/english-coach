// 端到端测试：在 jsdom 里加载真实页面，模拟用户点击；AI、GitHub、语音识别都用本地假服务代替。
// 运行：node build/test/e2e.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SCRIPTS = ['data/chunks.js', 'data/words.js', 'data/practice.js', 'data/ielts.js', 'js/speech.js', 'js/ai.js', 'js/sync.js', 'js/app.js'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0, passes = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (cond) passes++; else failures++; };

// ---------- 假服务 ----------
const gists = {};
const calls = [];
let claudeReplies = 0;
const siliconText = '<|en|><|NEUTRAL|>I would say my hometown is quite small.';
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

function fakeDeepSeek(body) {
  const sys = body.messages[0].content;
  const user = body.messages[body.messages.length - 1].content;
  let content;
  if (sys.includes('reviewing a practice conversation')) content = { score: 4, summary_zh: '整体不错，敢开口。', fixes: [{ you: 'i go there', better: "I'm going there.", why_zh: '要用进行时' }], chunks: [{ en: 'Are bills included?', zh: '包水电网吗？' }] };
  else if (sys.includes('IELTS Speaking examiner')) {
    const n = (user.match(/^Q\d+ /gm) || []).length;
    content = { fc: 5.5, lr: 5, gra: 5, overall: 5.5, summary_zh: '能说下去，但句子偏短。', pron_note_zh: '', items: Array.from({ length: n }, (_, k) => ({ q: 'Q' + (k + 1), better: 'A natural band 6.5 answer.', tips_zh: '多给一个例子' })), chunks: [{ en: 'broaden my horizons', zh: '开阔眼界' }] };
  } else if (sys.includes('IELTS Writing examiner')) content = { ta: 5.5, cc: 6, lr: 5.5, gra: 5, overall: 5.5, summary_zh: '结构清楚，语法错误较多。', corrections: [{ original: 'peoples', better: 'people', why_zh: 'people 本身是复数' }], improved: 'An improved essay at band 6.5.', next_step_zh: '练习复合句' };
  else if (sys.includes('situation described in Chinese')) content = { verdict: 'great', better: 'Hello!', explain_zh: '很好' };
  else content = { reply: 'Sounds good. How long are you planning to stay?', correction: { needed: true, better: "I'm staying for a year.", better_zh: '我待一年。', explain_zh: '用进行时表示计划' }, hint_zh: '可以说你的计划：I want to work on a farm.' };
  return json({ choices: [{ message: { content: JSON.stringify(content) } }] });
}

async function fakeFetch(url, init = {}) {
  url = String(url);
  const method = (init.method || 'GET').toUpperCase();
  let raw = init.body;
  if (raw && typeof raw.append === 'function' && typeof raw.get === 'function') {
    calls.push({ url, method, body: { model: raw.get('model'), file: raw.get('file') }, headers: init.headers });
    if (url.startsWith('https://api.siliconflow.cn/v1/audio/transcriptions')) {
      if (new Headers(init.headers).get('authorization') !== 'Bearer sk-sf-good') return json({ code: 20015, message: 'Invalid token' }, 401);
      return json({ text: siliconText });
    }
    throw new Error('unexpected form upload ' + url);
  }
  if (raw && typeof raw !== 'string') raw = typeof raw.getReader === 'function' ? await new Response(raw).text() : Buffer.from(raw).toString('utf8');
  const body = raw ? JSON.parse(raw) : null;
  calls.push({ url, method, body, headers: init.headers });
  if (url.startsWith('https://api.deepseek.com')) return fakeDeepSeek(body);
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
  w.spoken = [];
  w.speechSynthesis = { speak(u) { w.spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 0); }, cancel() {}, getVoices: () => [{ name: 'Aria Natural', lang: 'en-US' }], addEventListener() {} };
  w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  w.nextSpeech = '';
  w.asrMode = 'normal';     // normal | interim-only | drop-then-continue
  w.asrStarts = 0;
  w.webkitSpeechRecognition = class {
    start() {
      ++w.asrStarts;
      setTimeout(() => {
        this.onstart && this.onstart();
        const emit = (t, fin) => { const r = [{ transcript: t }]; r.isFinal = fin; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); };
        if (w.asrMode === 'interim-only') emit(w.nextSpeech, false);
        else if (w.asrMode === 'drop-then-continue') {
          if (w.asrStarts === w.asrFirst) { emit('I think young people', true); setTimeout(() => this.onend && this.onend(), 5); }
          else emit('should travel more', true);
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
  const type = (el, v) => { if (!el) throw new Error('input not found'); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const change = (el, v) => { if (typeof v === 'boolean') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const key = (k, target) => (target || w.document.body).dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  const nav = v => click($(`#nav button[data-view="${v}"]`));
  const act = (a, extra = '') => click($(`[data-act="${a}"]${extra}`));
  const text = () => $('#app').textContent;
  const state = () => JSON.parse(w.localStorage.getItem('speakup.v2'));
  const drillBox = () => $('[data-input="drill"]');
  return { dom, w, $, $$, click, type, change, key, nav, act, text, state, drillBox };
}

// 把当前口语练习一路答完（打字）
async function answerDrill(D, answer = 'I think it is quite interesting because I like it a lot.') {
  for (let guard = 0; guard < 12; guard++) {
    if (D.$('[data-act="prep-skip"]')) D.act('prep-skip');
    D.type(D.drillBox(), answer);
    if (D.$('[data-act="drill-next"]')) D.act('drill-next');
    else { D.act('drill-submit'); await sleep(30); return; }
  }
}

(async () => {
  console.log('\n[首页]');
  const A = openDevice();
  ok(A.$$('.task-name').map(e => e.textContent.replace('✓', '')).join() === '语块记忆,听力,雅思口语,AI 陪练', '首页 4 项：语块 / 听力 / 雅思口语 / AI 陪练');
  ok(A.$('.banner.goal') && A.text().includes('雅思 G 类目标 5.5'), '首页显示雅思目标');
  ok(A.$$('#nav button').map(b => b.dataset.view).join() === 'home,chunks,listen,ielts,chat,me', '导航：今日 语块 听力 雅思 AI陪练 我的');

  console.log('\n[语块]');
  A.nav('chunks');
  ok(A.text().includes('新语块 8'), '今天 8 个新语块');
  let n = 0;
  while (!A.text().includes('今天的语块完成了') && n < 40) { A.key(' '); A.key('3'); n++; }
  const keys = Object.keys(A.state().cards);
  ok(n === 8 && ['tr:', 'ie:', 'jb:', 'd:', 'v:'].every(p => keys.some(k => k.startsWith(p))), '新语块在旅行/雅思/打工/日常/词汇之间轮换');
  ok(!keys.some(k => /^[gwt]:/.test(k)), '没有游戏/外企/技术语块');

  console.log('\n[听力]');
  A.nav('listen');
  const lIds = A.$$('[data-input="listen"]').map(e => +e.dataset.i);
  ok(lIds.length === 5, '今天 5 句');
  A.click(A.$(`[data-act="play"][data-i="${lIds[0]}"]`));
  ok(A.w.spoken.pop().includes('W, H, I, T'), '拼写题会把字母一个个读出来');
  const LISTEN = A.w.LISTEN;
  lIds.forEach(i => { A.type(A.$(`[data-input="listen"][data-i="${i}"]`), LISTEN[i][0].toLowerCase()); A.click(A.$(`[data-act="check"][data-i="${i}"]`)); });
  ok(A.$$('.score.perfect').length === 5 && A.text().includes('今日听力已完成'), '5 句听写全对 → 听力完成');
  for (let k = 0; k < 3; k++) A.act('extra');
  const added = A.$$('[data-input="listen"]').map(e => +e.dataset.i);
  const answers = { 'The rent is $185 a week.': 'the rent is 185 a week', 'The phone number is 021 384 5567.': 'The phone number is 0213845567' };
  let numberCases = 0;
  for (const i of added) {
    const want = answers[LISTEN[i][0]];
    if (!want) continue;
    numberCases++;
    A.type(A.$(`[data-input="listen"][data-i="${i}"]`), want);
    A.click(A.$(`[data-act="check"][data-i="${i}"]`));
    ok(A.$(`#listen-${i} .score.perfect`), `数字写法不同也算对：「${want}」`);
  }
  ok(numberCases === 2, '加练里出现了价格和电话号码题');

  console.log('\n[雅思口语：没设置 AI]');
  A.nav('ielts');
  ok(A.$$('.tab').length === 4 && A.text().includes('今日口语'), '雅思页有 4 个标签');
  A.act('speak-kind', '[data-kind="p1"]');
  ok(A.text().includes('Part 1') && A.text().includes('第 1 / 3 题'), 'Part 1 一组 3 题');
  ok(A.w.spoken.pop().endsWith('?'), '题目会像考官一样读出来');
  A.act('drill-next');
  ok(A.$('#flash').textContent.includes('先回答'), '没回答不能跳到下一题');
  await answerDrill(A);
  ok(A.text().includes('设置 AI 后可以自动估分') && A.state().today.speak.done, '没有 AI 也能完成今日口语');

  console.log('\n[AI 设置 + 陪练]');
  A.nav('chat');
  ok(A.$('.cue') && A.text().includes('1 分钟英语独白'), '没设置 AI 时：用 Part 2 话题卡做独白');
  A.nav('me');
  A.change(A.$('#ai-provider'), 'deepseek');
  A.$('#ai-key').value = 'sk-test';
  A.act('ai-save');
  A.act('ai-test'); await sleep(20);
  ok(A.w.AI.ready() && A.$('#flash').textContent.includes('连接成功'), 'DeepSeek 设置并测试成功');
  A.nav('chat');
  ok(A.text().includes('🎯') && A.w.SCENARIOS.every(s => s.tag !== 'game'), '陪练场景是打工度假场景');
  for (let t = 0; t < 6; t++) { A.type(A.$('#chat-input'), 'I want to stay for one year'); A.act('chat-send'); await sleep(20); }
  ok(A.$$('.msg.me').length === 6 && A.$('.fix'), '6 句对话，每句有纠正');
  const sysPrompt = calls.filter(c => c.url.includes('deepseek')).pop().body.messages[0].content;
  ok(sysPrompt.includes('IELTS') && sysPrompt.includes('working holiday') && !/CS2|embedded/.test(sysPrompt), 'AI 知道你的目标是雅思 + 打工度假');
  await sleep(500);
  ok(A.state().history[A.state().today.date].complete === true && A.w.document.querySelector('.celebrate'), '4 项完成 → 打卡');
  A.act('close-celebrate');

  console.log('\n[雅思口语：AI 评分]');
  A.nav('ielts');
  A.act('speak-kind', '[data-kind="p2"]');
  ok(A.$('.cue') && A.$('#prep-left') && A.$('[data-act="drill-submit"]').disabled, 'Part 2：先显示话题卡和 1 分钟准备倒计时');
  A.type(A.$('[data-input="notes"]'), 'Queenstown / friends / bungee');
  A.act('prep-skip');
  ok(A.drillBox() && A.text().includes('Queenstown'), '跳过准备后开始答题，笔记还在');
  A.type(A.drillBox(), 'I am going to talk about a trip to Queenstown with my friends. '.repeat(5));
  A.act('drill-submit'); await sleep(30);
  ok(A.$$('.band').length === 4 && A.text().includes('5.5') && A.text().includes('6.5 分参考'), '显示估分、四项分数和 6.5 分参考回答');
  const spReq = calls.filter(c => c.url.includes('deepseek')).pop().body.messages[1].content;
  ok(spReq.includes('Cue card') && spReq.includes('You should say'), '评分时把话题卡发给 AI');
  A.click(A.$('[data-act="star"]'));
  ok(A.state().custom.some(c => c.en === 'broaden my horizons'), '评分里的表达可以一键收藏');

  // 语音回答：三种“读不到”的情况都不丢字
  A.act('drill-retry');
  A.act('speak-kind', '[data-kind="p3"]');
  const drillMic = () => A.$('[data-act="mic"][data-kind="drill"]');
  A.w.asrMode = 'interim-only'; A.w.nextSpeech = 'in my opinion people travel to relax';
  A.click(drillMic());
  ok(drillMic().textContent.includes('准备中'), '点麦克风先显示“准备中…先别说”');
  await sleep(10);
  ok(A.$('.btn.rec .lvl'), '开始听之后按钮变红，带音量条');
  A.click(drillMic()); await sleep(20);
  ok(A.drillBox().value === 'in my opinion people travel to relax', '按“说完了”时最后一段没确认也不丢');
  const stored = JSON.parse(A.w.localStorage.getItem('speakup.drills'));
  const cur = Object.values(stored).find(d => d.kind === 'p3');
  ok(cur.steps[0].via === 'voice' && cur.steps[0].secs > 0, '记录了语音作答和说话时长');
  A.act('drill-next');
  A.w.asrMode = 'drop-then-continue'; A.w.asrFirst = A.w.asrStarts + 1;
  A.click(drillMic()); await sleep(40);
  ok(drillMic().textContent.includes('说完了'), '停顿后浏览器自己停了，会自动接着听');
  A.click(drillMic()); await sleep(20);
  ok(A.drillBox().value === 'I think young people should travel more', '停顿前后两段都保留');
  A.w.asrMode = 'normal';

  console.log('\n[SenseVoice]');
  A.nav('me');
  A.change(A.$('#asr-engine'), 'sensevoice');
  A.$('#asr-key').value = 'sk-sf-bad'; A.act('asr-test'); await sleep(30);
  ok(A.$('#flash').textContent.includes('Key 无效'), 'Key 错误时提示');
  A.$('#asr-key').value = 'sk-sf-good'; A.act('asr-test'); await sleep(30);
  ok(A.w.Speech.cloudReady(), '测试通过并启用');
  A.nav('ielts');
  A.act('drill-next');
  A.click(drillMic()); await sleep(10); A.click(drillMic()); await sleep(40);
  ok(A.drillBox().value === 'I would say my hometown is quite small.', '录音上传识别，去掉了标签');
  ok(calls.filter(c => c.url.includes('siliconflow')).pop().body.model === 'FunAudioLLM/SenseVoiceSmall', '用的是 SenseVoiceSmall 模型');
  A.w.Speech.saveAsrConfig({ engine: 'browser', key: 'sk-sf-good' });

  console.log('\n[全真模考]');
  A.act('ielts-tab', '[data-tab="mock"]');
  ok(A.text().includes('第 1 / 8 题'), '模考 8 题：Part 1 四题 + Part 2 + Part 3 三题');
  await answerDrill(A);
  ok(A.text().includes('全真模考') && A.$$('.qa').length === 8, '模考结束显示每题的反馈');

  console.log('\n[写作批改]');
  A.act('ielts-tab', '[data-tab="write"]');
  ok(A.text().includes('Task 2') && A.text().includes('Write at least 250 words'), '默认是大作文题');
  A.type(A.$('[data-input="write"]'), 'Some peoples think young people should travel. '.repeat(12));
  ok(A.$('#wc').textContent === '84', '实时字数统计');
  A.act('w-submit'); await sleep(30);
  ok(A.text().includes('写作估分') && A.text().includes('peoples') && A.text().includes('6.5 分改写版'), '批改：四项分数、改错、改写版');
  ok(JSON.parse(A.w.localStorage.getItem('speakup.wlog')).length === 1, '批改记录保存在本机');
  A.act('w-task', '[data-task="1"]');
  ok(A.text().includes('Begin your letter as follows'), '小作文是书信题');

  console.log('\n[成绩与计划]');
  A.act('ielts-tab', '[data-tab="score"]');
  A.change(A.$('#t-kind'), 'listening'); A.$('#t-raw').value = '30'; A.act('add-test');
  A.change(A.$('#t-kind'), 'readingGT'); A.$('#t-raw').value = '27'; A.act('add-test');
  const bands = A.state().ielts.tests.map(t => t.band).join();
  ok(bands === '7,5.5', '原始分换算：听力 30/40 = 7.0，G 类阅读 27/40 = 5.5');
  ok(A.$('.band.main b').textContent === '6.0', '预估总分 = (7 + 5.5 + 5.5 + 5.5) / 4 = 5.875 → 按雅思规则取整为 6.0');
  A.change(A.$('[data-setting="examDate"]'), '2027-04-10');
  ok(A.text().includes('基础期') && A.text().includes('距离考试'), '填了考试日期显示倒计时和阶段建议');

  console.log('\n[同步]');
  A.nav('me');
  A.$('#sync-token').value = 'ghp_test'; A.act('sync-connect'); await sleep(50);
  const synced = JSON.parse(gists.g1.files['speakup-progress.json'].content);
  ok(synced.ielts.tests.length === 2 && synced.ielts.write.length === 1 && !JSON.stringify(synced).includes('sk-test'), '雅思成绩一起同步，API Key 不上传');
  const B = openDevice();
  B.nav('me');
  B.$('#sync-token').value = 'ghp_test'; B.act('sync-connect'); await sleep(80);
  ok(B.state().ielts.speak.length === 2 && B.state().history[B.state().today.date].complete, '手机上能看到口语估分记录和今天的打卡');
  B.nav('ielts'); B.act('ielts-tab', '[data-tab="score"]');
  ok(B.$('.band.main b').textContent === '6.0', '手机上的预估总分一致');

  console.log('\n[从旧版本升级]');
  const today = A.state().today.date;
  const old = {
    v: 2, settings: { t: 1, newPerDay: 8, decks: { game: true, work: true, tech: true, daily: true, vocab: false } },
    cards: { 'g:One on B': { reps: 1, interval: 1, ease: 2.5, due: today, t: 1 }, 'w:ASAP': { reps: 1, interval: 1, ease: 2.5, due: today, t: 1 }, 'd:No way!': { reps: 2, interval: 3, ease: 2.5, due: today, t: 1 } },
    custom: [{ en: 'Heads up', zh: '小心', t: 1 }], ptr: { say: 3, listen: 4 }, retry: { say: [1], listen: [2] },
    today: { date: today, items: { say: [1], listen: [2] }, done: { say: [], listen: [] } }, history: { '2026-10-01': { acts: 9, complete: true } }, updatedAt: 1,
  };
  const C = openDevice({ 'speakup.v2': JSON.stringify(old) });
  const cs = C.state();
  ok(cs.v === 3 && !cs.cards['g:One on B'] && !cs.cards['w:ASAP'], '游戏和外企语块进度已删除');
  ok(cs.cards['d:No way!'] && cs.custom.length === 1 && cs.history['2026-10-01'].complete, '日常语块、收藏和打卡记录都保留');
  ok(cs.today.speak && !cs.today.items.say && cs.settings.decks.ielts, '今天的任务换成新结构');

  console.log('\n[第二天]');
  const store = A.state();
  const shift = k => { const [y, m, d] = k.split('-').map(Number); const t = new Date(y, m - 1, d - 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  store.today.date = shift(store.today.date);
  store.history = Object.fromEntries(Object.entries(store.history).map(([k, v]) => [shift(k), v]));
  for (const c of Object.values(store.cards)) { c.due = shift(c.due); c.first = shift(c.first); }
  const D2 = openDevice({ 'speakup.v2': JSON.stringify(store) });
  ok(D2.state().today.date !== store.today.date && D2.state().today.speak.done === false, '新的一天：新任务，口语重新计');
  ok(D2.$('.streak b').textContent === '1', '连续打卡天数延续');
  D2.nav('chunks');
  ok(/待复习 <b>8<\/b>/.test(D2.$('#app').innerHTML) && D2.$('.prompt-zh'), '昨天的语块今天复习，看中文说英文');

  console.log('\n[Claude]');
  const E = openDevice();
  E.w.eval(read('vendor/claude.js'));
  E.w.AI.saveConfig({ provider: 'claude', apiKey: 'sk-ant-test', model: 'claude-opus-5-5' });
  E.nav('chat');
  for (let t = 0; t < 2; t++) { E.type(E.$('#chat-input'), 'hello there'); E.act('chat-send'); await sleep(30); }
  const cc = calls.filter(c => c.url.includes('anthropic'));
  const second = cc[1].body;
  ok(second.model === 'claude-opus-5-5' && second.fallbacks === 'default' && second.output_config.format.type === 'json_schema', 'Claude：模型、fallback、结构化输出');
  ok(second.messages[3].content[0].type === 'thinking' && second.messages[3].content[0].signature === 'sig-1', 'Claude：上一轮回复（含 thinking 块）原样发回');
  E.nav('ielts'); E.act('speak-kind', '[data-kind="p1"]');
  claudeReplies = 100;
  E.w.AI.saveConfig({ provider: 'claude', apiKey: 'sk-ant-nocredit', model: 'claude-opus-5-5' });
  E.nav('me'); E.act('ai-test'); await sleep(50);
  ok(E.$('#flash').textContent.includes('余额不足'), 'Claude：余额不足时显示中文提示');

  console.log(failures ? `\n${failures} 项失败（${passes} 项通过）` : `\n全部通过（${passes} 项）`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

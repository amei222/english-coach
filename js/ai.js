/* AI 陪练与批改。API Key 只保存在当前浏览器，不会同步、不会上传到别处。 */
window.AI = (() => {
  'use strict';
  const KEY = 'speakup.ai';

  const PROVIDERS = {
    deepseek: {
      name: 'DeepSeek', base: 'https://api.deepseek.com', model: 'deepseek-chat',
      keyUrl: 'https://platform.deepseek.com/api_keys',
      note: '国内直连，手机不用梯子也能用；费用很低，每天练一次一个月大约几块钱。',
    },
    claude: {
      name: 'Claude（Anthropic）', model: 'claude-opus-5-5',
      keyUrl: 'https://console.anthropic.com/settings/keys',
      note: '纠错和对话质量最好；需要能访问国外网络。默认用 Claude Opus 5.5，每天练一次一个月大约几美元。',
    },
    custom: {
      name: '其他（OpenAI 兼容接口）', base: '', model: '',
      note: '通义千问、硅基流动等都提供 OpenAI 兼容接口，填上接口地址和模型名即可。',
    },
  };

  function config() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* ignore */ }
    const p = PROVIDERS[c.provider] ? c.provider : 'deepseek';
    return { provider: p, apiKey: c.apiKey || '', model: c.model || PROVIDERS[p].model, baseUrl: c.baseUrl || PROVIDERS[p].base || '' };
  }
  function saveConfig(c) { localStorage.setItem(KEY, JSON.stringify(c)); }
  function ready() {
    const c = config();
    return !!(c.apiKey && c.model && (c.provider !== 'custom' || c.baseUrl));
  }

  // ---------- 输出格式 ----------
  const str = { type: 'string' };
  const obj = (props) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });

  const TUTOR_SCHEMA = obj({
    reply: str,
    correction: obj({ needed: { type: 'boolean' }, better: str, better_zh: str, explain_zh: str }),
    hint_zh: str,
  });
  const GRADE_SCHEMA = obj({
    verdict: { type: 'string', enum: ['great', 'ok', 'miss'] },
    better: str,
    explain_zh: str,
  });
  const REVIEW_SCHEMA = obj({
    score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    summary_zh: str,
    fixes: { type: 'array', items: obj({ you: str, better: str, why_zh: str }) },
    chunks: { type: 'array', items: obj({ en: str, zh: str }) },
  });

  // OpenAI 兼容接口没有 JSON Schema 约束，把格式写进提示词
  const FORMAT_HINTS = {
    tutor: 'Respond with a json object exactly like: {"reply": "...", "correction": {"needed": true, "better": "...", "better_zh": "...", "explain_zh": "..."}, "hint_zh": "..."}',
    grade: 'Respond with a json object exactly like: {"verdict": "great" | "ok" | "miss", "better": "...", "explain_zh": "..."}',
    review: 'Respond with a json object exactly like: {"score": 1-5, "summary_zh": "...", "fixes": [{"you": "...", "better": "...", "why_zh": "..."}], "chunks": [{"en": "...", "zh": "..."}]}',
  };
  const SCHEMAS = { tutor: TUTOR_SCHEMA, grade: GRADE_SCHEMA, review: REVIEW_SCHEMA };

  const LEARNER = 'The learner is Chinese. Their English is around CET-4 / B1: they read reasonably well but freeze when speaking. Their goals: chat naturally with foreign players in FPS games (CS2, Valorant, Apex), and later work at an international company as an embedded software engineer.';

  function tutorSystem(sc) {
    return `You are an English conversation partner. ${LEARNER}

## Role-play
You are playing: ${sc.persona}
Situation: ${sc.opener ? `the conversation has just started with your line "${sc.opener}"` : 'a casual conversation'}.
The learner's goal: ${sc.goal}

Stay in character and keep the conversation going:
- Talk like a real person in this situation: short turns (usually 1–3 sentences), everyday words, contractions, and slang that fits the context. Don't lecture.
- Usually end your turn with a question or something the learner can react to.
- If the learner seems stuck or writes very little, make it easier: ask a simpler question or offer two choices.
- The learner's messages may come from speech recognition: ignore capitalization, punctuation and obvious recognition glitches.

## Coaching (outside the role-play, in the separate fields)
- correction: if the learner's last message has a mistake or sounds unnatural, set needed=true, put a natural version of their whole message in "better" (keep their meaning and as much of their wording as already works), a Simplified Chinese translation of it in "better_zh", and the single most useful point in "explain_zh" (Simplified Chinese, 1–2 short sentences). If it's already natural for this context, set needed=false and leave the three strings empty. Don't correct things that are normal in casual speech or game chat.
- If the learner writes Chinese (or mixes Chinese in), they didn't know how to say it: put the English in "better" (needed=true) and reply in character as if they had said it in English.
- hint_zh: a short suggestion in Simplified Chinese of what they could say next, including an English example, e.g. 「可以问他常用什么枪：What gun do you usually play?」
- reply: your in-character line, English only.

Latency-sensitive; begin your answer immediately.`;
  }

  const GRADE_SYSTEM = `You are an English speaking coach. ${LEARNER}

The learner gets a situation described in Chinese and tries to say it in English. Judge whether their English would work in that real situation: would a native speaker understand it, and does it sound natural? Small grammar slips that don't hurt understanding are fine in casual contexts (games, chat). Ignore capitalization and punctuation; the answer may come from speech recognition. The reference answer is only one possibility — other natural answers are equally good.

Fields:
- verdict: "great" (natural — a native speaker might say it), "ok" (understandable, but unnatural or with a noticeable error), or "miss" (wrong meaning or hard to understand).
- better: the most natural way to say what the learner meant, keeping their wording where it already works. For "great", return their sentence with only typos fixed.
- explain_zh: 1–2 short sentences in Simplified Chinese on the most important fix — or what was good, for "great".`;

  const REVIEW_SYSTEM = `You are an English speaking coach reviewing a practice conversation. ${LEARNER}

Fields:
- score: 1–5 for how well the learner communicated in this conversation (fluency and naturalness matter more than perfect grammar).
- summary_zh: 2–3 encouraging, specific sentences in Simplified Chinese: what went well, and the one habit to work on next.
- fixes: up to 5 of the learner's most useful-to-fix sentences — "you" is what they wrote, "better" is a natural version, "why_zh" a short reason in Simplified Chinese. Skip trivial typos.
- chunks: up to 5 reusable expressions from this conversation (or ones the learner needed) worth memorizing, as {en, zh}.`;

  // ---------- 调用 ----------
  let claudeLoading = null;
  function loadClaude() {
    if (window.ClaudeAdapter) return Promise.resolve();
    if (!claudeLoading) {
      claudeLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/claude.js';
        s.onload = resolve;
        s.onerror = () => { claudeLoading = null; reject(new Error('Claude 组件加载失败，请检查网络后重试')); };
        document.head.appendChild(s);
      });
    }
    return claudeLoading;
  }

  function parseJson(text) {
    const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(t); } catch (e) {
      const m = t.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch (e2) { /* fall through */ } }
    }
    throw new Error('AI 返回的格式不对，请重试');
  }

  async function openaiCompatible(c, kind, system, messages) {
    const url = c.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
        body: JSON.stringify({
          model: c.model,
          messages: [{ role: 'system', content: `${system}\n\n${FORMAT_HINTS[kind]}` }, ...messages.map(toOpenAI)],
          response_format: { type: 'json_object' },
          max_tokens: 2000,
        }),
      });
    } catch (e) {
      throw new Error(`连不上 ${PROVIDERS[c.provider].name} 的服务器，请检查网络`);
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch (e) { /* ignore */ }
      const msg = res.status === 401 ? 'API Key 无效，请到「我的 → AI 设置」检查'
        : res.status === 402 ? '账户余额不足，请到服务商后台充值'
        : res.status === 429 ? '请求太频繁或额度不足，稍后再试'
        : res.status === 404 ? '接口地址或模型名不对'
        : `AI 服务出错（${res.status}）`;
      throw new Error(detail ? `${msg}：${detail}` : msg);
    }
    const body = await res.json();
    const text = body.choices?.[0]?.message?.content;
    return { data: parseJson(text), assistant: { role: 'assistant', content: text } };
  }

  // 对话历史在两种接口间切换时，只保留文字
  function toOpenAI(m) {
    if (typeof m.content === 'string') return m;
    const text = m.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    return { role: m.role, content: text };
  }

  async function call(kind, system, messages, effort = 'low') {
    const c = config();
    if (!ready()) throw new Error('还没设置 AI：到「我的 → AI 设置」填入 API Key');
    if (c.provider === 'claude') {
      await loadClaude();
      try {
        const r = await window.ClaudeAdapter.structuredTurn({ apiKey: c.apiKey, model: c.model, system, messages, schema: SCHEMAS[kind], effort });
        return { data: r.data, assistant: { role: 'assistant', content: r.content } };
      } catch (e) {
        throw new Error(e.zh ? e.message : `Claude 调用失败：${e.message}`);
      }
    }
    return openaiCompatible(c, kind, system, messages);
  }

  // ---------- 对外功能 ----------
  /** 新对话：系统提示词在整段对话中保持不变 */
  function startChat(sc) {
    const opener = { reply: sc.opener, correction: { needed: false, better: '', better_zh: '', explain_zh: '' }, hint_zh: '' };
    return {
      scenarioId: sc.id,
      provider: config().provider,
      system: tutorSystem(sc),
      api: [
        { role: 'user', content: '(Start the role-play. The learner is listening.)' },
        { role: 'assistant', content: JSON.stringify(opener) },
      ],
      view: [{ role: 'ai', text: sc.opener, hint: '' }],
      userTurns: 0,
      review: null,
    };
  }

  /** 发送学习者的一句话，返回 AI 回复（会原样把历史发回去） */
  async function chatTurn(chat, text) {
    const c = config();
    if (chat.provider !== c.provider) chat.api = chat.api.map(m => (c.provider === 'claude' ? toOpenAI(m) : m));
    chat.provider = c.provider;
    const messages = [...chat.api, { role: 'user', content: text }];
    const r = await call('tutor', chat.system, messages, 'low');
    chat.api = [...messages, r.assistant];
    return r.data;
  }

  function grade(situationZh, reference, answer) {
    const content = `Situation (Chinese): ${situationZh}\nReference answer: ${reference}\nLearner's answer: ${answer}`;
    return call('grade', GRADE_SYSTEM, [{ role: 'user', content }], 'low').then(r => r.data);
  }

  function review(chat, sc) {
    const lines = chat.view.filter(m => m.role === 'ai' || m.role === 'me')
      .map(m => (m.role === 'ai' ? `Partner: ${m.text}` : `Learner: ${m.text}`)).join('\n');
    const content = `Scenario: ${sc.title} — ${sc.goal}\n\nConversation:\n${lines}`;
    return call('review', REVIEW_SYSTEM, [{ role: 'user', content }], 'medium').then(r => r.data);
  }

  async function test() {
    const r = await grade('打招呼', 'Hi!', 'Hello!');
    if (!r || !r.verdict) throw new Error('返回内容不完整');
    return r;
  }

  return { PROVIDERS, config, saveConfig, ready, startChat, chatTurn, grade, review, test, loadClaude };
})();

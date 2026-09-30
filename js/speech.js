/* 语音：朗读（TTS）、语音识别（ASR）、录音。全部用浏览器自带能力，不花钱。 */
window.Speech = (() => {
  'use strict';
  const hasTTS = 'speechSynthesis' in window;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasASR = !!Recognition;
  const hasRecorder = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  let voices = [];
  let prefs = () => ({ voice: '', rate: 0.95 });

  function loadVoices() {
    if (hasTTS) voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
    return voices;
  }
  function pickVoice() {
    if (!voices.length) loadVoices();
    const want = prefs().voice;
    return voices.find(v => v.name === want)
      || voices.find(v => /natural/i.test(v.name) && /en[-_]US/i.test(v.lang))
      || voices.find(v => /en[-_]US/i.test(v.lang))
      || voices[0];
  }

  /** 朗读，返回朗读结束时 resolve 的 Promise */
  function speak(text, rate) {
    return new Promise(resolve => {
      if (!hasTTS || !text) return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/\s\/\s/g, '. ').replace(/\.\.\./g, ' '));
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = rate ?? prefs().rate;
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }
  const stopSpeaking = () => hasTTS && speechSynthesis.cancel();

  // ---------- 语音识别 ----------
  const ASR_ERRORS = {
    'not-allowed': '麦克风权限被拒绝了，请在浏览器地址栏左侧允许使用麦克风',
    'service-not-allowed': '浏览器不允许语音识别，可以改用输入法的语音输入',
    'network': '语音识别服务连不上（Chrome 需要能访问 Google）。可以换 Edge / Safari，或者用输入法自带的语音输入',
    'no-speech': '没听到声音，再试一次',
    'audio-capture': '找不到麦克风',
    'language-not-supported': '当前浏览器不支持英文语音识别',
    'unsupported': '这个浏览器不支持语音识别。可以用输入法的语音输入（讯飞、搜狗、微信键盘都能识别英文）',
  };
  const asrError = code => code === 'aborted' ? '' : (ASR_ERRORS[code] || `语音识别出错（${code}）`);

  let active = null;
  /**
   * 开始识别。continuous=true 时一直听到 stop() 为止（适合长句/对话）。
   * 回调：onText(实时文字) onEnd(最终文字) onError(中文错误信息)
   */
  function listen({ continuous = false, onText, onEnd, onError } = {}) {
    if (!hasASR) { onError && onError(asrError('unsupported')); onEnd && onEnd(''); return null; }
    stopListening();
    stopSpeaking();
    const r = new Recognition();
    r.lang = 'en-US';
    r.interimResults = true;
    r.continuous = continuous;
    r.maxAlternatives = 1;
    let finalText = '';
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += (finalText ? ' ' : '') + t.trim();
        else interim += t;
      }
      onText && onText((finalText + ' ' + interim).trim());
    };
    r.onerror = e => { const m = asrError(e.error); if (m && onError) onError(m); };
    r.onend = () => { if (active === r) active = null; onEnd && onEnd(finalText.trim()); };
    try { r.start(); } catch (e) { onError && onError('语音识别启动失败，请再点一次'); return null; }
    active = r;
    return r;
  }
  function stopListening() { if (active) { try { active.stop(); } catch (e) { /* 已停止 */ } } }
  const isListening = () => !!active;

  // ---------- 录音（跟读回放） ----------
  async function record() {
    if (!hasRecorder) throw new Error('这个浏览器不支持录音');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    const started = Date.now();
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.start();
    return {
      stop: () => new Promise(resolve => {
        rec.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          resolve({ url: URL.createObjectURL(blob), seconds: (Date.now() - started) / 1000 });
        };
        rec.stop();
      }),
    };
  }

  if (hasTTS) {
    loadVoices();
    speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }

  return {
    hasTTS, hasASR, hasRecorder,
    configure(fn) { prefs = fn; },
    voices: () => (voices.length ? voices : loadVoices()),
    speak, stopSpeaking, listen, stopListening, isListening, record,
  };
})();

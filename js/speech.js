/*
 * 语音：朗读（TTS）、语音识别（ASR）、录音。
 * 识别引擎两种：
 *   browser    浏览器自带（免费、实时出字；对口音较敏感，Chrome 在国内需要翻墙）
 *   sensevoice 硅基流动 SenseVoice（免费、国内直连、对中国口音更友好；录完再识别）
 */
window.Speech = (() => {
  'use strict';
  const hasTTS = 'speechSynthesis' in window;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasASR = !!Recognition;
  const hasRecorder = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  // ---------- 朗读 ----------
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

  // ---------- 识别引擎设置（Key 只存本机） ----------
  const ASR_KEY = 'speakup.asr';
  const SENSEVOICE = {
    url: 'https://api.siliconflow.cn/v1/audio/transcriptions',
    model: 'FunAudioLLM/SenseVoiceSmall',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
  };
  function asrConfig() {
    try { return { engine: 'browser', key: '', ...(JSON.parse(localStorage.getItem(ASR_KEY)) || {}) }; }
    catch (e) { return { engine: 'browser', key: '' }; }
  }
  const saveAsrConfig = c => localStorage.setItem(ASR_KEY, JSON.stringify(c));
  const cloudReady = () => { const c = asrConfig(); return c.engine === 'sensevoice' && !!c.key && hasRecorder; };
  const canCapture = () => cloudReady() || hasASR;

  const ASR_ERRORS = {
    'not-allowed': '麦克风权限被拒绝了，请在浏览器地址栏左侧允许使用麦克风',
    'service-not-allowed': '浏览器不允许语音识别，可以到「我的 → 语音识别」换成 SenseVoice',
    'network': '浏览器的语音识别服务连不上（Chrome 需要能访问 Google）。建议到「我的 → 语音识别」换成 SenseVoice（国内直连、免费）',
    'audio-capture': '找不到麦克风',
    'language-not-supported': '当前浏览器不支持英文语音识别',
    'unsupported': '这个浏览器不支持语音识别。可以到「我的 → 语音识别」开启 SenseVoice，或者用输入法的语音输入',
  };
  const asrError = code => ASR_ERRORS[code] || `语音识别出错（${code}）`;

  let session = null;   // 当前正在进行的识别

  // ---------- 引擎一：浏览器自带 ----------
  function browserSession(o) {
    if (!hasASR) { o.onError && o.onError(asrError('unsupported')); o.onEnd && o.onEnd(''); return null; }
    let finalText = '', interim = '', stopped = false, done = false, fatal = false, restarts = 0, rec = null;
    const started = Date.now();
    const join = (a, b) => (a && b ? `${a} ${b}` : a || b);
    const finish = () => {
      if (done) return;
      done = true;
      if (session === ctl) session = null;
      o.onEnd && o.onEnd(join(finalText, interim).trim());
    };
    function startOne() {
      const r = new Recognition();
      rec = r;
      r.lang = 'en-US';
      r.interimResults = true;
      r.continuous = !!o.continuous;
      r.maxAlternatives = 1;
      r.onstart = () => o.onState && o.onState('listening');
      r.onresult = e => {
        let im = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript.trim();
          if (e.results[i].isFinal) finalText = join(finalText, t);
          else im = join(im, t);
        }
        interim = im;
        o.onText && o.onText(join(finalText, interim));
      };
      r.onerror = e => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;   // 停顿不算错误，交给 onend 续上
        fatal = true;
        o.onError && o.onError(asrError(e.error));
      };
      r.onend = () => {
        // 按“说完了”时还没确认的最后一段，也算进结果里
        if (interim) { finalText = join(finalText, interim); interim = ''; }
        // 浏览器在停顿后会自己结束：用户没按停止就接着听
        if (o.continuous && !stopped && !fatal && restarts < 30 && Date.now() - started < 180000) {
          restarts++;
          try { startOne(); return; } catch (e) { /* 续不上就结束 */ }
        }
        finish();
      };
      r.start();
    }
    const ctl = { stop() { stopped = true; try { rec.stop(); } catch (e) { finish(); } } };
    o.onState && o.onState('starting');
    try { startOne(); } catch (e) { o.onError && o.onError('语音识别启动失败，请再点一次'); finish(); return null; }
    return ctl;
  }

  // ---------- 引擎二：录音 + SenseVoice ----------
  function cloudSession(o) {
    let inner = null, stopRequested = false, ended = false;
    const end = text => { if (ended) return; ended = true; if (session === ctl) session = null; o.onEnd && o.onEnd(text); };
    const ctl = { stop() { stopRequested = true; if (inner) inner(); } };
    o.onState && o.onState('starting');
    (async () => {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
      catch (e) { o.onError && o.onError(asrError('not-allowed')); return end(''); }
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);
      // 音量条 + 静音检测
      let ac = null, analyser = null, raf = 0, anySound = false, spoke = false, lastLoud = Date.now();
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ac = new AC();
        analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        ac.createMediaStreamSource(stream).connect(analyser);
      } catch (e) { analyser = null; }
      const started = Date.now();
      const buf = new Uint8Array(1024);
      const tick = () => {
        if (analyser) {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
          const level = peak / 128;
          o.onLevel && o.onLevel(level);
          if (level > 0.02) anySound = true;
          if (level > 0.08) { spoke = true; lastLoud = Date.now(); }
          if (o.autoStop && spoke && Date.now() - lastLoud > o.autoStop) return inner();
        }
        if (Date.now() - started > 90000) return inner();   // 最长 90 秒
        raf = requestAnimationFrame(tick);
      };
      inner = () => {
        inner = () => {};
        cancelAnimationFrame(raf);
        rec.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          if (ac) ac.close().catch(() => {});
          if (analyser && !anySound) { o.onError && o.onError('没收到声音，检查一下麦克风是不是静音了'); return end(''); }
          o.onState && o.onState('transcribing');
          try { end(await transcribe(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))); }
          catch (e) { o.onError && o.onError(e.message); end(''); }
        };
        try { rec.stop(); } catch (e) { end(''); }
      };
      rec.start();
      o.onState && o.onState('recording');
      if (stopRequested) inner(); else tick();
    })();
    return ctl;
  }

  // 统一转成 16kHz 单声道 WAV：各家浏览器录出来的格式不同（webm / mp4），转一下最稳
  async function toWav16k(blob) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC || !Offline) throw new Error('no audio api');
    const ac = new AC();
    let decoded;
    try { decoded = await ac.decodeAudioData(await blob.arrayBuffer()); } finally { ac.close().catch(() => {}); }
    const rate = 16000;
    const off = new Offline(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    return encodeWav((await off.startRendering()).getChannelData(0), rate);
  }
  function encodeWav(pcm, rate) {
    const v = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data');
    v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([v.buffer], { type: 'audio/wav' });
  }

  async function transcribe(blob, key) {
    key = key || asrConfig().key;
    let file = blob, name;
    try { file = await toWav16k(blob); name = 'speech.wav'; }
    catch (e) { name = /wav/.test(blob.type) ? 'speech.wav' : /mp4|aac|m4a/.test(blob.type) ? 'speech.m4a' : /ogg/.test(blob.type) ? 'speech.ogg' : 'speech.webm'; }
    const fd = new FormData();
    fd.append('file', file, name);
    fd.append('model', SENSEVOICE.model);
    let res;
    try { res = await fetch(SENSEVOICE.url, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd }); }
    catch (e) { throw new Error('连不上硅基流动服务器，请检查网络'); }
    if (!res.ok) {
      let msg = '';
      try { const j = await res.json(); msg = j.message || (j.error && j.error.message) || ''; } catch (e) { /* ignore */ }
      throw new Error(res.status === 401 ? '硅基流动 Key 无效，请到「我的 → 语音识别」检查' : `语音识别出错（${res.status}）${msg ? '：' + msg : ''}`);
    }
    const j = await res.json();
    return String(j.text || '').replace(/<\|[^|>]*\|>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * 开始说话。按引擎自动选择。
   * o: { continuous, autoStop(ms, 仅录音引擎), onState('starting'|'listening'|'recording'|'transcribing'),
   *      onText(实时文字, 仅浏览器引擎), onLevel(0–1), onEnd(最终文字), onError(中文提示) }
   */
  function capture(o = {}) {
    stopCapture();
    stopSpeaking();
    session = cloudReady() ? cloudSession(o) : browserSession(o);
    return session;
  }
  function stopCapture() { if (session) session.stop(); }
  const isCapturing = () => !!session;

  // ---------- 录音（跟读、独白） ----------
  async function record() {
    if (!hasRecorder) throw new Error('这个浏览器不支持录音');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    const started = Date.now();
    rec.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);
    rec.start();
    return {
      stop: () => new Promise(resolve => {
        rec.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          resolve({ blob, url: URL.createObjectURL(blob), seconds: (Date.now() - started) / 1000 });
        };
        rec.stop();
      }),
    };
  }

  /** 测试 SenseVoice Key：发 0.3 秒静音过去，能正常返回就说明可用 */
  function testCloud(key) {
    return transcribe(encodeWav(new Float32Array(4800), 16000), key);
  }

  if (hasTTS) {
    loadVoices();
    if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }

  return {
    hasTTS, hasASR, hasRecorder, SENSEVOICE,
    configure(fn) { prefs = fn; },
    voices: () => (voices.length ? voices : loadVoices()),
    speak, stopSpeaking,
    asrConfig, saveAsrConfig, cloudReady, canCapture,
    capture, stopCapture, isCapturing, transcribe, testCloud, record,
  };
})();

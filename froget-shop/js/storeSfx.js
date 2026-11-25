/* =========================================================
   商店主視覺音效（細胞分裂動畫）
   全部用 Web Audio 即時合成，不用另外放音效檔；最後撐破時再加一聲青蛙叫（frogSound.js）。
   用法：
     const sfx = createStoreSfx();
     sfx.play('split');      // 依名稱播放（名稱見下面 SOUNDS）
     sfx.unlocked            // 瀏覽器是否已允許出聲（要先點一下頁面）
     sfx.unlock()            // 在點擊事件裡呼叫，打開聲音
   ========================================================= */
export function createStoreSfx() {
  const VOLUME = 0.5;   // 整體音量（0～1）
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, noiseBuf = null;

  function ensure() {
    if (ctx || !AC) return ctx;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = VOLUME; master.connect(ctx.destination);
    // 白噪音（嘩、啵的質感用）
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // ---------- 基本音色 ----------
  // 滑音：頻率從 f0 滑到 f1，音量快速起、慢慢收
  function glide(f0, f1, dur, { type = 'sine', gain = 0.5, at = 0, attack = 0.008 } = {}) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  // 噪音：經過濾波，做出「嘩」「噗」
  function noise(dur, { freq = 1200, q = 1, type = 'bandpass', gain = 0.3, at = 0, sweepTo = null } = {}) {
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }
  // 鈴聲：基音＋泛音，慢慢消失
  function bell(freq, { gain = 0.25, at = 0, dur = 1.2 } = {}) {
    glide(freq, freq, dur, { gain, at, attack: 0.004 });
    glide(freq * 2.01, freq * 2.01, dur * 0.6, { gain: gain * 0.35, at, attack: 0.004 });
    glide(freq * 3.02, freq * 3.02, dur * 0.35, { gain: gain * 0.15, at, attack: 0.004 });
  }

  // ---------- 每個分鏡的音效 ----------
  const SOUNDS = {
    // 01 大青蛙泡泡登場：軟軟的「啵～」往上飄
    appear() { glide(180, 620, 0.35, { gain: 0.45 }); glide(360, 1240, 0.25, { gain: 0.12, at: 0.03 }); noise(0.18, { freq: 900, q: 2, gain: 0.08 }); },
    // 02 小泡泡排隊：一串很輕的小氣泡
    line() { for (let i = 0; i < 6; i++) glide(700 + i * 90, 1100 + i * 90, 0.09, { gain: 0.12, at: i * 0.05 }); },
    // 03 拉長＋縮腰：橡皮被拉開的「咿～」
    stretch() { glide(220, 430, 0.75, { type: 'triangle', gain: 0.22, attack: 0.05 }); noise(0.7, { freq: 400, q: 6, gain: 0.05, sweepTo: 900 }); },
    // 05 斷開：濕濕的「啵嚕」
    split() { glide(520, 120, 0.28, { gain: 0.55 }); noise(0.22, { freq: 1800, q: 1.5, gain: 0.18, sweepTo: 400 }); glide(900, 300, 0.12, { gain: 0.15, at: 0.05 }); },
    // 07～09 融合：一次比一次高、一次比一次亮
    merge1() { glide(330, 660, 0.16, { gain: 0.35 }); glide(660, 990, 0.12, { gain: 0.1, at: 0.04 }); },
    merge2() { glide(440, 880, 0.15, { gain: 0.38 }); glide(880, 1320, 0.12, { gain: 0.12, at: 0.04 }); },
    merge3() { glide(587, 1175, 0.14, { gain: 0.4 }); glide(1175, 1760, 0.12, { gain: 0.14, at: 0.04 }); },
    // 10 商品入口出現：叮咚
    labels() { bell(1047, { gain: 0.16 }); bell(1568, { gain: 0.14, at: 0.12 }); },
    // 11 撐破細胞壁：「啪」一聲＋水花＋一聲青蛙叫
    burst() {
      glide(160, 45, 0.4, { gain: 0.6 });
      noise(0.5, { freq: 2600, q: 0.8, gain: 0.35, sweepTo: 600 });
      for (let i = 0; i < 7; i++) glide(1400 + Math.random() * 1600, 2200 + Math.random() * 1800, 0.07, { gain: 0.06, at: 0.08 + i * 0.045 });
      setTimeout(() => window.playFrogSound && window.playFrogSound(), 180);
    },
  };

  const api = {
    get unlocked() { return !!ctx && ctx.state === 'running'; },
    // 在使用者點擊／按鍵時呼叫：瀏覽器這時才允許出聲
    unlock() { if (!ensure()) return Promise.resolve(); return ctx.resume(); },
    play(name) {
      if (reduce || !SOUNDS[name] || !ensure() || ctx.state !== 'running') return;
      try { SOUNDS[name](); } catch (e) {}
    },
  };
  // 頁面上任何一次點擊、按鍵、觸控，就順便把聲音打開
  ['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.addEventListener(t, () => api.unlock(), { passive: true }));
  return api;
}

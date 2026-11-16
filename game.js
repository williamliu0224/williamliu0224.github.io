/* =========================================================
   賞巴掌 — MediaPipe Hand Landmarker

   流程：
   1. 一開始：坐在電腦前的青蛙（只有遊戲剛開始會出現）
   2. 揮手但被躲掉：往左揮 → dodgeLeft、往右揮 → dodgeRight，
      連續揮空 → 舉牌子「打我啊笨蛋」（taunt）；短暫顯示後回到目前的樣子
   3. 賞到第一巴掌：蓄力顫抖 → 轟！變身成長脖子青蛙（super），之後整場都維持這個樣子
   4. 變身後每次打中：頭被打到、脖子拉長、頭整顆脹大並晃動，同時青蛙叫一聲
   5. 連擊越高：頭越來越大、脖子越來越長；連擊中斷就縮回原本的大小
   ========================================================= */

/* ---------- 可以自己調的參數 ---------- */
const CONFIG = {
  // MediaPipe 的左右手標籤以鏡像畫面為準；我們餵的是原始畫面，所以預設要交換。
  // 如果舉左手卻顯示右手，改成 false。
  SWAP_HANDEDNESS: true,

  // 躲掉的圖看哪個：
  //   "hand"   = 看是哪隻手（左手 → dodgeLeft，右手 → dodgeRight）
  //   "motion" = 看手實際揮的方向
  IMAGE_BY: "hand",

  SWING_SPEED: 1400,       // 揮動速度門檻（舞台像素/秒），越小越敏感
  HORIZONTAL_RATIO: 1.6,   // 橫向速度必須是縱向的幾倍以上，才算「橫著揮」
  SWING_COOLDOWN: 380,     // 同一隻手兩次揮動的最短間隔（毫秒）
  HIT_PADDING: 40,         // 主角判定範圍外擴（像素），越大越好打
  // 揮空只在「揮在主角附近」時才算（外擴多少像素）；離很遠的揮動不算。設 0 就不會判揮空
  MISS_ZONE_PADDING: 160,

  DODGE_CHANCE: 0.2,       // 還沒變身時，打中也有這個機率被青蛙躲掉（0 = 不會躲）
  TAUNT_STREAK: 2,         // 連續幾次沒打到，就出現「打我啊笨蛋」
  TAUNT_HOLD_MS: 1500,     // 「打我啊笨蛋」顯示多久

  START_COUNTDOWN: 5,
  FINAL_COUNTDOWN: 10,
  GAME_SECONDS: 60,
  HERO_RESET_MS: 600,      // 躲掉的圖顯示多久後回到初始
  COMBO_WINDOW_MS: 2200,   // 打中後多久內沒再打中，連擊就歸零
  BASE_POINTS: 10,

  // 連擊越高，變身後的「頭」越來越大、脖子越來越長
  GROW_MAX_COMBO: 20,      // 連擊到這個數字後不再變大
  HEAD_PER_COMBO: 0.06,    // 每 1 連擊，頭放大多少（20 連擊 ≈ 2.2 倍）
  NECK_PER_COMBO: 0.012,   // 每 1 連擊，脖子平常多長多少
  GROW_PER_COMBO: 0.003,   // 每 1 連擊，整隻青蛙多放大多少
  SWAY_REACH: 0.7,         // 頭被打到時橫向甩出去的幅度，越大甩越遠

  TILT_STRENGTH: 1,        // 主角轉向手的 3D 效果（0 = 關閉）

  EFFECTS: { shake: true, flash: true, particles: true, popText: true, sound: true },

  // 被打到時爆出來的小圖（像爆金幣一樣，大大小小、會掉落彈跳）
  COINS: [
    "images/coin_eye_pink.png",    "images/coin_eye_light.png",
    "images/coin_heart_light.png", "images/coin_muscle_light.png",
    "images/coin_heart_pink.png",  "images/coin_muscle_pink.png"
  ],
  COIN_SIZE: 1,            // 圖案大小倍率（想更大就加大，例如 1.3）
  COIN_FORWARD: 1,         // 往前（朝你）飛的力道，0 = 不往前飛，越大越猛
  COIN_DEPTH: 200,         // 3D 景深，數字越小，飛近時放大得越快
  COIN_GRAVITY: 120,       // 重力，越大掉得越快
  COIN_COUNT: 7,           // 基本數量（連擊越高、數量越多）
  COIN_BOUNCES: 2,         // 沒飛太遠的圖案，落地後彈幾次

  IMAGES: {
    idle:       "images/idle.png",         // 最一開始的狀態
    dodgeLeft:  "images/dodge_left.png",   // 左手揮，被躲掉
    dodgeRight: "images/dodge_right.png",  // 右手揮，被躲掉
    taunt:      "images/taunt.png",        // 連續沒打到（打我啊笨蛋）
    super:      "images/super.png"         // 被賞巴掌後變身的長脖子青蛙
  },
  // 圖片不存在時的替代 emoji
  EMOJI: { idle: "🐸", dodgeLeft: "😏", dodgeRight: "😏", taunt: "😜", super: "🤪" },

  // 長脖子那張圖的分段（以圖高度的比例）：頭 | 脖子（會被拉長）| 身體
  SUPER: { NECK_TOP: 0.25, NECK_BOTTOM: 0.60, NECK_CX: 0.43, BASE_HEIGHT_U: 30 },

  // 想用自己的音效（例如你家青蛙真正的叫聲），放進 sounds/ 即可；沒有檔案會自動用合成音效
  SOUND_FILES: { hit: "sounds/hit.mp3", miss: "sounds/miss.mp3", croak: "sounds/croak.mp3" }
};

/* ---------- 連擊階段：數字越高特效越誇張 ---------- */
const TIERS = [
  { min: 0,  k: 0.6, texts: ["啪！"] },
  { min: 3,  k: 1.0, texts: ["連擊！", "漂亮！"] },
  { min: 5,  k: 1.6, texts: ["太猛了！", "啪啪啪！"] },
  { min: 10, k: 2.4, texts: ["瘋狂！！", "停不下來！"] },
  { min: 20, k: 3.2, texts: ["神之巴掌！！！"] }
];
const MILESTONES = [3, 5, 10, 15, 20, 30, 40, 50];

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const stage = $("stage"), video = $("video"), canvas = $("overlay");
const ctx = canvas.getContext("2d");
const hero = $("hero"), heroShadow = $("heroShadow"), heroInner = $("heroInner"),
      heroImg = $("heroImg"), heroEmoji = $("heroEmoji");
const superCanvas = $("superCanvas"), sctx = superCanvas.getContext("2d");
const coinCanvas = $("coins"), cctx = coinCanvas.getContext("2d");
const fx = $("fx"), flash = $("flash"), banner = $("banner"), countdownEl = $("countdown");
const scoreEl = $("score"), timeEl = $("time");
const comboBox = $("comboBox"), comboNum = $("comboNum"), comboMult = $("comboMult"), comboBar = $("comboBar").firstElementChild;
const messageEl = $("message"), messageTx = $("messageText"), startBtn = $("startBtn");

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 遊戲狀態 ---------- */
let handLandmarker = null;
let running = false;
let score = 0, hits = 0;
let combo = 0, maxCombo = 0, missStreak = 0;
let transformed = false;                       // 這一局是不是已經變身過（變身後就不會再變回初始）
let busyUntil = 0;                             // 變身演出中，這段時間內的揮動不算
let timeLeft = CONFIG.GAME_SECONDS;
let countdownTimer = null, comboTimer = null, heroTimer = null;
let lastVideoTime = -1;

const history = { left: [], right: [] };
const smooth  = { left: { vx: 0, vy: 0 }, right: { vx: 0, vy: 0 } };
const lastSwing = { left: 0, right: 0 };
const HAND_COLOR = { left: "#fb6291", right: "#c8fa6e" };   // 左手粉紅、右手萊姆綠
let trails = [];

const tierOf = c => TIERS.reduce((t, x, i) => (c >= x.min ? i : t), 0);
const multOf = c => (c >= 20 ? 4 : c >= 10 ? 3 : c >= 5 ? 2 : 1);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const comboSteps = () => Math.min(combo, CONFIG.GROW_MAX_COMBO);

/* =========================================================
   圖片（缺圖時改用 emoji）
   ========================================================= */
const imgs = {}, hasImage = {};
Object.entries(CONFIG.IMAGES).forEach(([name, src]) => {
  const img = new Image();
  img.onload = () => {
    hasImage[name] = true;
    imgs[name] = img;
    if (name === "super") setupSuperCanvas(img);
    setHero(currentHero, false);
  };
  img.onerror = () => {
    hasImage[name] = false;
    console.warn(`找不到圖片：${src}（請確認 images 資料夾和 index.html 放在同一層，檔名要一模一樣）`);
  };
  img.src = src;
});

function setupSuperCanvas(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  superCanvas.width = W * 5;                   // 左右各留兩個身寬，頭甩出去、放大時才不會被切掉
  superCanvas.height = H * 2;                  // 上面留空間給拉長的脖子
  const hu = CONFIG.SUPER.BASE_HEIGHT_U;
  superCanvas.style.width = `calc(var(--u) * ${hu * 5 * W / H})`;
  superCanvas.style.height = `calc(var(--u) * ${hu * 2})`;
}

let currentHero = "idle";
// 平常停留的樣子：還沒變身是初始，變身後就一直是長脖子
const restState = () => (transformed ? "super" : "idle");

// hold：幾毫秒後回到平常的樣子；false = 一直維持
function setHero(name, hold = CONFIG.HERO_RESET_MS) {
  const prev = currentHero;
  currentHero = name;
  const isSuper = name === "super" && hasImage.super;
  superCanvas.hidden = !isSuper;

  if (isSuper) {
    heroImg.hidden = true;
    heroEmoji.hidden = true;
    // 從「躲掉」的樣子變回長脖子時，脖子和頭彈回來
    if (prev !== "super" && transformed) {
      sp.s = 0.5; sp.sV = 0; sp.sway = 0; sp.swayV = 0; sp.hs = 0.7; sp.hsV = 0;
    }
  } else if (hasImage[name]) {
    heroImg.src = CONFIG.IMAGES[name];
    heroImg.hidden = false;
    heroEmoji.hidden = true;
  } else {
    heroEmoji.textContent = CONFIG.EMOJI[name];
    heroEmoji.hidden = false;
    heroImg.hidden = true;
  }

  clearTimeout(heroTimer);
  if (hold && name !== restState()) {
    heroTimer = setTimeout(() => setHero(restState(), false), hold);
  }
}

/* =========================================================
   長脖子青蛙：脖子拉長 + 頭晃動（彈簧物理）
   ========================================================= */
const sp = { sway: 0, swayV: 0, s: 1, sV: 0, hs: 1, hsV: 0, grow: 1, bigUntil: 0 };
let headPos = null;                            // 頭的位置（畫布座標），給特效定位用
let lastFrame = 0;

function drawSuper() {
  const img = imgs.super;
  if (!img) return;
  const W = img.naturalWidth, H = img.naturalHeight, ch = superCanvas.height;
  const { NECK_TOP, NECK_BOTTOM, NECK_CX } = CONFIG.SUPER;
  const neckTop = Math.round(H * NECK_TOP), neckBot = Math.round(H * NECK_BOTTOM);
  const headH = neckTop, neckH = neckBot - neckTop, bodyH = H - neckBot;
  const s = sp.s, hs = sp.hs;
  const X0 = W * 2;                                        // 身體放在畫布正中間
  const headDrawH = headH * hs;                            // 頭放大後的高度
  const total = headDrawH + neckH * s + bodyH;
  const y0 = ch - total;                                   // 頭頂的位置（底部固定在畫布底）
  const swayPx = sp.sway * W * CONFIG.SWAY_REACH;
  const cx = NECK_CX * W;

  sctx.clearRect(0, 0, superCanvas.width, ch);

  // 身體：不動
  sctx.drawImage(img, 0, neckBot, W, bodyH, X0, ch - bodyH, W, bodyH);

  // 脖子：一段一段畫，往頭的方向偏移越多，就變成彎曲的樣子
  const step = 2;
  for (let r = 0; r < neckH; r += step) {
    const h = Math.min(step, neckH - r);
    const t = r / neckH;                                   // 0 = 靠頭，1 = 靠身體
    const off = swayPx * Math.pow(1 - t, 2);
    sctx.drawImage(img, 0, neckTop + r, W, h, X0 + off, y0 + headDrawH + r * s, W, h * s + 1);
  }

  // 頭：以脖子頂端為軸心轉動，並依連擊放大
  sctx.save();
  sctx.translate(X0 + cx + swayPx, y0 + headDrawH);
  sctx.rotate(sp.sway * 0.45);
  sctx.scale(hs, hs);
  sctx.drawImage(img, 0, 0, W, headH, -cx, -headH, W, headH);
  sctx.restore();

  headPos = { x: X0 + cx + swayPx, y: y0 + headDrawH * 0.55 };
}

function heroFrame(ts) {
  requestAnimationFrame(heroFrame);
  const dt = Math.min((ts - lastFrame) / 1000, 0.033);
  lastFrame = ts;
  if (currentHero !== "super" || !hasImage.super || superCanvas.hidden) return;

  const steps = comboSteps();
  const neckTarget = 1 + steps * CONFIG.NECK_PER_COMBO;
  const headTarget = 1 + steps * CONFIG.HEAD_PER_COMBO;
  const sMax = ts < sp.bigUntil ? 2.2 : 1.7;               // 變身那一下允許拉得更長

  sp.swayV += (-130 * sp.sway - 4.5 * sp.swayV) * dt;        // 頭左右晃，慢慢停下來
  sp.sway += sp.swayV * dt;
  sp.sV += (-120 * (sp.s - neckTarget) - 6 * sp.sV) * dt;  // 脖子拉長後彈回
  sp.s += sp.sV * dt;
  sp.hsV += (-140 * (sp.hs - headTarget) - 6.5 * sp.hsV) * dt;   // 頭被打到「脹」一下再彈回
  sp.hs += sp.hsV * dt;
  sp.sway = clamp(sp.sway, -1.8, 1.8);
  sp.s = clamp(sp.s, 0.05, sMax);
  sp.hs = clamp(sp.hs, 0.1, 2.6);

  const growTarget = 1 + steps * CONFIG.GROW_PER_COMBO;
  sp.grow += (growTarget - sp.grow) * Math.min(dt * 8, 1);
  superCanvas.style.transform = `translateX(-50%) scale(${sp.grow.toFixed(3)})`;

  drawSuper();
}
requestAnimationFrame(heroFrame);

/* =========================================================
   聲音：優先用 sounds/ 的檔案，沒有就用 Web Audio 合成
   ========================================================= */
let ac = null, noiseBuf = null;
const custom = {};
Object.entries(CONFIG.SOUND_FILES).forEach(([name, src]) => {
  const a = new Audio();
  a.addEventListener("canplaythrough", () => { custom[name] = a; }, { once: true });
  a.addEventListener("error", () => { custom[name] = null; });
  a.src = src;
});

function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === "suspended") ac.resume();
}

function synthNoise(t, dur, freqFrom, freqTo, vol, q = 0.9) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = q;
  bp.frequency.setValueAtTime(freqFrom, t);
  bp.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function synthTone(t, freq, dur, vol, type = "triangle", freqEnd = null) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// 合成的蛙鳴：低頻鋸齒波 + 快速開關的音量 = 「呱呱」的顫音
function synthCroak(t, pitch = 1, vol = 0.35, syllables = 2) {
  for (let n = 0; n < syllables; n++) {
    const st = t + n * 0.2, dur = 0.17;
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime((230 - n * 25) * pitch, st);
    o.frequency.exponentialRampToValueAtTime((120 - n * 10) * pitch, st + dur);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(700, st);
    bp.frequency.exponentialRampToValueAtTime(1300, st + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, st);
    const pulses = 6, pd = dur / pulses;
    for (let i = 0; i < pulses; i++) {
      const pt = st + i * pd;
      g.gain.setValueAtTime(0.0001, pt);
      g.gain.linearRampToValueAtTime(vol, pt + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, pt + pd * 0.95);
    }
    o.connect(bp).connect(g).connect(ac.destination);
    o.start(st);
    o.stop(st + dur + 0.05);
  }
}

function playSound(name, tier = 0) {
  if (!CONFIG.EFFECTS.sound) return;

  // 有放自己的音效檔就優先用
  const key = name === "croakBig" ? "croak" : name;
  if (["hit", "miss", "croak", "croakBig"].includes(name) && custom[key]) {
    const a = custom[key].cloneNode();
    a.playbackRate = name === "hit" ? 1 + tier * 0.06
                   : name === "croakBig" ? 0.75
                   : name === "croak" ? 0.95 + Math.random() * 0.25 + tier * 0.03
                   : 1;
    a.play().catch(() => {});
    return;
  }
  if (!ac) return;
  const t = ac.currentTime;

  if (name === "hit") {
    synthNoise(t, 0.16, 2200 + tier * 500, 900, 0.9, 0.8);
    synthTone(t, 190 + tier * 35, 0.15, 0.8, "sine", 60);
  } else if (name === "miss") {
    synthNoise(t, 0.26, 3200, 500, 0.22, 1.4);
  } else if (name === "milestone") {
    const base = 523 * Math.pow(1.06, tier);
    [1, 1.26, 1.5, 2].forEach((m, i) => synthTone(t + i * 0.07, base * m, 0.18, 0.28, "triangle"));
  } else if (name === "croak") {
    synthCroak(t, (0.9 + Math.random() * 0.3) * Math.pow(1.03, tier), 0.32, 2);     // 被打到的叫聲
  } else if (name === "croakBig") {
    synthCroak(t, 0.7, 0.4, 3);                                                     // 變身時的大叫
  } else if (name === "charge") {
    synthTone(t, 110, 0.43, 0.2, "sawtooth", 900);                                  // 蓄力：音調一路往上
    synthNoise(t, 0.43, 400, 4000, 0.12, 1.2);
  } else if (name === "boom") {
    synthTone(t, 110, 0.55, 0.9, "sine", 28);                                       // 轟！
    synthNoise(t, 0.5, 1800, 120, 0.7, 0.6);
  } else if (name === "transform") {
    synthTone(t, 150, 0.45, 0.22, "sawtooth", 1400);                 // 往上衝的變身音
    [523, 659, 784, 1047, 1319].forEach((f, i) => synthTone(t + 0.32 + i * 0.06, f, 0.2, 0.25, "triangle"));
  } else if (name === "tick") {
    synthTone(t, 660 * Math.pow(1.06, tier), 0.09, 0.3, "square");
  } else if (name === "go") {
    synthTone(t, 880, 0.35, 0.3, "square");
    synthTone(t + 0.08, 1320, 0.3, 0.25, "triangle");
  } else if (name === "break") {
    synthTone(t, 330, 0.3, 0.25, "sawtooth", 110);
  }
}

/* =========================================================
   特效
   ========================================================= */
function stageSize() { return { w: stage.clientWidth, h: stage.clientHeight }; }

// 特效的出現位置：變身後在頭上，否則在主角中間
function fxOrigin() {
  const sr = stage.getBoundingClientRect();
  if (currentHero === "super" && headPos && !superCanvas.hidden) {
    const r = superCanvas.getBoundingClientRect();
    return {
      x: r.left - sr.left + (headPos.x / superCanvas.width) * r.width,
      y: r.top - sr.top + (headPos.y / superCanvas.height) * r.height
    };
  }
  const hr = hero.getBoundingClientRect();
  return { x: hr.left - sr.left + hr.width / 2, y: hr.top - sr.top + hr.height / 2 };
}

function shake(k) {
  if (!CONFIG.EFFECTS.shake || reduceMotion) return;
  const amp = 5 * k;
  const frames = [{ transform: "translate(0,0)" }];
  for (let i = 0; i < 6; i++) {
    const f = 1 - i / 6;
    frames.push({ transform: `translate(${rand(-amp, amp) * f}px, ${rand(-amp, amp) * f}px)` });
  }
  frames.push({ transform: "translate(0,0)" });
  stage.animate(frames, { duration: 140 + 40 * k, easing: "linear" });
}

function doFlash(k, tier) {
  if (!CONFIG.EFFECTS.flash || reduceMotion) return;
  flash.style.background = tier >= 3 ? "#ffbdd1" : "#ecffca";
  flash.animate([{ opacity: Math.min(0.15 + 0.15 * k, 0.8) }, { opacity: 0 }], { duration: 220 });
}

/* ---------- 爆金幣：眼睛、愛心、肌肉的小圖噴出來，大大小小，落地彈跳 ---------- */
const coinImgs = [];
CONFIG.COINS.forEach(src => {
  const img = new Image();
  img.onload = () => coinImgs.push(img);
  img.onerror = () => console.warn(`找不到圖片：${src}`);
  img.src = src;
});

let coins = [], coinRAF = 0, lastCoinT = 0;

function coinBurst(k, dir, n) {
  const { x, y } = fxOrigin();
  const { w: W, h: H } = stageSize();
  const u = W / 100;
  if (reduceMotion) n = Math.ceil(n / 3);

  for (let i = 0; i < n; i++) {
    const img = pick(coinImgs);
    const r = Math.random();
    // 大小：有大有中有小（比之前更大）
    const size = (r < 0.25 ? rand(14, 20) : r < 0.7 ? rand(8, 12) : rand(4, 6)) * CONFIG.COIN_SIZE;
    const w = size * u, h = w * img.naturalHeight / img.naturalWidth;
    coins.push({
      img, w, h,
      X: x - W / 2, Y: y - H / 2, Z: 0,                      // 3D 座標：以畫面中心為原點，Z 越大越靠近你
      vx: rand(-28, 28) * u * (0.7 + 0.3 * k) + dir * rand(5, 24) * u,
      vy: -rand(30, 70) * u * (0.65 + 0.35 * Math.min(k, 2.5)),
      vz: rand(40, 150) * u * CONFIG.COIN_FORWARD,           // 往前飛
      rot: rand(-0.6, 0.6), vr: rand(-6, 6),
      flip: rand(0, 6.28), fs: rand(8, 16),                  // 像硬幣一樣翻面
      tumble: rand(0, 6.28), ts: rand(3, 8),                 // 前後翻滾
      bounces: 0, age: 0, life: rand(1.6, 2.3)
    });
  }
  if (!coinRAF) { lastCoinT = performance.now(); coinRAF = requestAnimationFrame(coinTick); }
}

function coinTick(now) {
  const dt = Math.min((now - lastCoinT) / 1000, 0.033);
  lastCoinT = now;
  const { w: W, h: H } = stageSize();
  if (coinCanvas.width !== W || coinCanvas.height !== H) { coinCanvas.width = W; coinCanvas.height = H; }
  cctx.clearRect(0, 0, W, H);

  const u = W / 100, g = CONFIG.COIN_GRAVITY * u, floor = H - 2.5 * u;
  const D = CONFIG.COIN_DEPTH * u;                           // 相機到青蛙的距離
  const zMax = D * 0.7;                                      // 飛到這麼近就淡出
  const cx = W / 2, cy = H / 2;

  coins = coins.filter(c => c.age < c.life && c.Z < zMax);

  // 遠的先畫，近的後畫，這樣近的會蓋在前面
  coins.sort((a, b) => a.Z - b.Z);

  coins.forEach(c => {
    c.age += dt;
    c.vy += g * dt;
    c.X += c.vx * dt;
    c.Y += c.vy * dt;
    c.Z += c.vz * dt;
    c.rot += c.vr * dt;
    c.flip += c.fs * dt;
    c.tumble += c.ts * dt;

    const s = D / (D - c.Z);                                 // 透視：越近越大
    let sx = cx + c.X * s, sy = cy + c.Y * s;

    // 沒怎麼往前飛的，掉到地上會彈起來
    if (s < 1.4 && c.vy > 0 && sy + c.h * s / 2 > floor && c.bounces < CONFIG.COIN_BOUNCES) {
      c.Y = (floor - c.h * s / 2 - cy) / s;
      sy = floor - c.h * s / 2;
      c.vy = -c.vy * 0.55;
      c.vx *= 0.8;
      c.vr *= 0.7;
      c.bounces++;
    }

    const cosF = Math.cos(c.flip);
    const flipX = (cosF < 0 ? -1 : 1) * Math.max(Math.abs(cosF), 0.15);
    const flipY = Math.max(Math.abs(Math.cos(c.tumble)), 0.35);
    const alpha = clamp((c.life - c.age) / 0.4, 0, 1) * clamp((zMax - c.Z) / (D * 0.15), 0, 1);

    cctx.save();
    cctx.globalAlpha = alpha;
    cctx.translate(sx, sy);
    cctx.rotate(c.rot);
    cctx.scale(flipX * s, flipY * s);
    cctx.drawImage(c.img, -c.w / 2, -c.h / 2, c.w, c.h);
    cctx.restore();
  });

  if (coins.length) coinRAF = requestAnimationFrame(coinTick);
  else { coinRAF = 0; cctx.clearRect(0, 0, W, H); }
}

function burst(k, tier, dir) {
  if (!CONFIG.EFFECTS.particles) return;
  if (coinImgs.length) coinBurst(k, dir, Math.round(CONFIG.COIN_COUNT * k) + 3);
  else starBurst(k, tier, dir);                                 // 小圖還沒載入時，先用星星
}

function starBurst(k, tier, dir) {
  const { x, y } = fxOrigin();
  const shapes = ["★", "✦", "●", "◆", "✸"];
  const colors = tier >= 3
    ? ["#fb6291", "#ffbdd1", "#c8fa6e"]
    : ["#c8fa6e", "#ecffca", "#ffbdd1", "#fb6291"];
  const n = Math.round(8 * k);
  const u = stageSize().w / 100;

  for (let i = 0; i < n; i++) {
    const el = document.createElement("span");
    el.className = "particle";
    el.textContent = pick(shapes);
    el.style.color = pick(colors);
    el.style.fontSize = `${rand(2, 4.5) * (0.8 + k * 0.2) * u}px`;
    fx.appendChild(el);

    const angle = rand(-Math.PI * 0.8, Math.PI * 0.8);
    const dist = rand(8, 20) * u * (0.6 + k * 0.35);
    const dx = Math.cos(angle) * dist * dir + dir * 4 * u;
    const dy = Math.sin(angle) * dist - 3 * u;
    const rot = rand(-360, 360);

    el.animate(
      [
        { transform: `translate(${x}px, ${y}px) scale(0.3) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${x + dx}px, ${y + dy}px) scale(1) rotate(${rot}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${x + dx * 1.1}px, ${y + dy + 6 * u}px) scale(0.6) rotate(${rot * 1.2}deg)`, opacity: 0 }
      ],
      { duration: rand(500, 900), easing: "cubic-bezier(.2,.8,.3,1)" }
    ).onfinish = () => el.remove();
  }
}

function popText(k, tier, dir) {
  if (!CONFIG.EFFECTS.popText) return;
  const { x, y } = fxOrigin();
  const u = stageSize().w / 100;
  const el = document.createElement("div");
  el.className = "pop-text";
  el.textContent = pick(TIERS[tier].texts);
  el.style.fontSize = `${(3.5 + k * 1.6) * u}px`;
  fx.appendChild(el);

  const w = el.offsetWidth;
  const tx = clamp(x - w / 2 + dir * 8 * u, u, stageSize().w - w - u);
  const ty = Math.max(y - 12 * u, 2 * u);
  const tilt = rand(-12, 12);

  el.animate(
    [
      { transform: `translate(${tx}px, ${ty}px) scale(0.2) rotate(${tilt}deg)`, opacity: 0 },
      { transform: `translate(${tx}px, ${ty - 2 * u}px) scale(1.25) rotate(${tilt}deg)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${tx}px, ${ty - 5 * u}px) scale(1) rotate(${tilt}deg)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${tx}px, ${ty - 9 * u}px) scale(1) rotate(${tilt}deg)`, opacity: 0 }
    ],
    { duration: 800, easing: "ease-out" }
  ).onfinish = () => el.remove();
}

function showBanner(text) {
  banner.textContent = text;
  if (reduceMotion) { banner.style.opacity = 1; setTimeout(() => (banner.style.opacity = 0), 800); return; }
  banner.animate(
    [
      { opacity: 0, transform: "translate(-50%, -50%) scale(2.4) rotate(-6deg)" },
      { opacity: 1, transform: "translate(-50%, -50%) scale(1) rotate(0deg)", offset: 0.2 },
      { opacity: 1, transform: "translate(-50%, -50%) scale(1.05) rotate(0deg)", offset: 0.75 },
      { opacity: 0, transform: "translate(-50%, -60%) scale(1) rotate(0deg)" }
    ],
    { duration: 1000, easing: "ease-out" }
  );
}

// 變身時，腳下炸開一圈衝擊波
function shockwave() {
  if (!CONFIG.EFFECTS.particles || reduceMotion) return;
  const sr = stage.getBoundingClientRect(), hr = hero.getBoundingClientRect();
  const u = stageSize().w / 100;
  const x = hr.left - sr.left + hr.width / 2, y = hr.bottom - sr.top - u;
  [0, 110, 220].forEach(delay => {
    const el = document.createElement("div");
    el.className = "shockwave";
    fx.appendChild(el);
    el.animate(
      [
        { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(0.2)`, opacity: 1 },
        { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(1.3)`, opacity: 0 }
      ],
      { duration: 700, delay, easing: "ease-out", fill: "backwards" }
    ).onfinish = () => el.remove();
  });
}

// 變身用的大特效 ---------------------------------------------
function megaFlash() {
  if (!CONFIG.EFFECTS.flash || reduceMotion) return;
  flash.style.background = "#ffffff";
  flash.animate([{ opacity: 1 }, { opacity: 0.25, offset: 0.25 }, { opacity: 0.85, offset: 0.4 }, { opacity: 0 }],
                { duration: 800, easing: "ease-out" });
}

function megaShake() {
  if (!CONFIG.EFFECTS.shake || reduceMotion) return;
  const amp = 14, frames = [{ transform: "translate(0,0) scale(1)" }];
  for (let i = 0; i < 12; i++) {
    const f = 1 - i / 12;
    frames.push({ transform: `translate(${rand(-amp, amp) * f}px, ${rand(-amp, amp) * f}px) scale(${1 + 0.07 * f})` });
  }
  frames.push({ transform: "translate(0,0) scale(1)" });
  stage.animate(frames, { duration: 700, easing: "linear" });
}

// 放射狀的光芒
function rays() {
  if (!CONFIG.EFFECTS.particles || reduceMotion) return;
  const el = document.createElement("div");
  el.className = "rays";
  fx.appendChild(el);
  el.animate(
    [
      { opacity: 0, transform: "scale(0.3) rotate(0deg)" },
      { opacity: 1, transform: "scale(1) rotate(25deg)", offset: 0.25 },
      { opacity: 0, transform: "scale(1.8) rotate(80deg)" }
    ],
    { duration: 1000, easing: "ease-out" }
  ).onfinish = () => el.remove();
}

// 被躲掉：青蛙往揮的反方向閃開
function dodgeHero(motionDir) {
  if (reduceMotion) return;
  const u = stageSize().w / 100;
  const P = `perspective(${u * 90}px)`;
  const d = -motionDir * 5 * u;
  heroInner.animate(
    [
      { transform: `${P} translate(0,0) rotateY(0deg) rotate(0deg)` },
      { transform: `${P} translate(${d}px, ${-1 * u}px) rotateY(${-motionDir * 40}deg) rotate(${-motionDir * 8}deg)`, offset: 0.35 },
      { transform: `${P} translate(0,0) rotateY(0deg) rotate(0deg)` }
    ],
    { duration: 420, easing: "ease-out" }
  );
}

/* =========================================================
   變身、被打、變回來
   ========================================================= */
// 第一巴掌：先蓄力顫抖，再「轟」地變身
function startTransform(dir, k) {
  busyUntil = performance.now() + (reduceMotion ? 200 : 1150);
  playSound("charge");

  if (!reduceMotion) {
    const u = stageSize().w / 100;
    const frames = [];
    for (let i = 0; i < 14; i++) {                         // 越抖越兇、越來越亮
      frames.push({
        transform: `translate(${(i % 2 ? 1 : -1) * rand(0.5, 1.5) * u}px, ${rand(-0.6, 0.6) * u}px) scale(${1 + i * 0.02})`,
        filter: `brightness(${1 + i * 0.18}) saturate(${1 + i * 0.1})`
      });
    }
    heroInner.animate(frames, { duration: 430, easing: "linear" });
  }
  setTimeout(() => boom(dir), reduceMotion ? 0 : 430);
}

function boom(dir) {
  transformed = true;
  setHero("super", false);

  // 脖子和頭從縮起來的狀態「砰」地噴出去，拉得比平常長很多，再彈回來
  sp.s = 0.2; sp.sV = 18;
  sp.hs = 0.2; sp.hsV = 16;
  sp.sway = dir * 1.4; sp.swayV = 0;
  sp.grow = 0.5;
  sp.bigUntil = performance.now() + 900;
  headPos = null;
  drawSuper();

  if (!reduceMotion) {
    const u = stageSize().w / 100;
    const P = `perspective(${u * 90}px)`;
    heroInner.animate(
      [
        { transform: `${P} rotateY(-1080deg) scale(0.1)`, filter: "brightness(4) saturate(0.1)" },
        { transform: `${P} rotateY(-180deg) scale(0.9)`, filter: "brightness(2.5) saturate(0.6)", offset: 0.4 },
        { transform: `${P} rotateY(0deg) scale(1.4)`, filter: "brightness(1.8) saturate(1.4)", offset: 0.7 },
        { transform: `${P} rotateY(0deg) scale(1)`, filter: "brightness(1) saturate(1)" }
      ],
      { duration: 1100, easing: "cubic-bezier(.2,.9,.3,1.1)" }
    );
  }

  megaFlash();
  megaShake();
  rays();
  shockwave();
  burst(4, 4, dir);
  burst(3, 3, -dir);
  showBanner("變身！！！");
  playSound("boom");
  playSound("transform");
  playSound("croakBig");
}

function superHit(dir, k) {
  // 頭被打到：往被打的方向甩出去，脖子拉長、頭脹大一下，之後彈簧般晃動
  sp.swayV += dir * (14 + 5 * k);              // 頭用力甩出去
  sp.sV += 7 + 3 * k;                          // 脖子拉得更長
  sp.hsV += 6 + 2.5 * k;
  if (!reduceMotion) {
    heroShadow.animate(
      [{ transform: "translateX(-50%) scale(1)" },
       { transform: "translateX(-50%) scale(0.8)", offset: 0.3 },
       { transform: "translateX(-50%) scale(1)" }],
      { duration: 500, easing: "ease-out" }
    );
  }
}

/* =========================================================
   連擊系統
   ========================================================= */
function updateComboUI(bump) {
  const tier = tierOf(combo);
  stage.dataset.tier = combo >= 2 ? tier : 0;
  comboNum.textContent = combo;
  comboMult.textContent = `x${multOf(combo)}`;
  comboBox.classList.toggle("hidden", combo < 2);

  if (bump && combo >= 2) {
    comboBox.classList.remove("bump");
    void comboBox.offsetWidth;
    comboBox.classList.add("bump");
  }
}

function restartComboTimer() {
  clearTimeout(comboTimer);
  comboBar.getAnimations().forEach(a => a.cancel());
  comboBar.animate(
    [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
    { duration: CONFIG.COMBO_WINDOW_MS, easing: "linear", fill: "forwards" }
  );
  comboTimer = setTimeout(() => breakCombo(false), CONFIG.COMBO_WINDOW_MS);
}

function breakCombo(byMiss) {
  clearTimeout(comboTimer);
  if (combo >= 3 && byMiss) playSound("break");
  combo = 0;
  updateComboUI(false);

}

function registerHit(dir) {
  combo++;
  hits++;
  missStreak = 0;
  maxCombo = Math.max(maxCombo, combo);
  score += CONFIG.BASE_POINTS * multOf(combo);
  scoreEl.textContent = score;

  const tier = tierOf(combo);
  const firstSlap = !transformed;
  const k = firstSlap ? Math.max(TIERS[tier].k, 1.6) : TIERS[tier].k;

  updateComboUI(true);
  restartComboTimer();

  if (firstSlap) {
    startTransform(dir, k);                    // 第一巴掌：蓄力 → 轟！變身
  } else {
    if (currentHero !== "super") setHero("super", false);   // 正在躲的時候被打到，馬上變回來
    superHit(dir, k);                          // 之後：頭被打到，脖子拉長、頭脹大、晃動
  }

  playSound("hit", tier);
  setTimeout(() => playSound("croak", tier), 70);             // 被打到的叫聲
  shake(k);
  doFlash(k, tier);
  burst(k, tier, dir);
  popText(k, tier, dir);

  if (MILESTONES.includes(combo)) {
    setTimeout(() => showBanner(`${combo} 連擊！`), firstSlap ? 900 : 0);
    setTimeout(() => playSound("milestone", tier), 120);
  }
}

function registerMiss(imgSide, motionDir) {
  breakCombo(true);
  missStreak++;
  if (missStreak >= CONFIG.TAUNT_STREAK) {
    setHero("taunt", CONFIG.TAUNT_HOLD_MS);                       // 連續沒打到：打我啊笨蛋
  } else {
    setHero(imgSide === "right" ? "dodgeRight" : "dodgeLeft");    // 被躲掉
  }
  dodgeHero(motionDir);
  playSound("miss");
}

/* =========================================================
   揮動與打擊判定
   ========================================================= */
function heroRect(p = CONFIG.HIT_PADDING) {
  const sr = stage.getBoundingClientRect(), r = hero.getBoundingClientRect();
  const box = { x1: r.left - sr.left - p, x2: r.right - sr.left + p, y1: r.top - sr.top - p, y2: r.bottom - sr.top + p };

  // 變身後頭會長高，打頭也算打中
  if (currentHero === "super" && headPos && !superCanvas.hidden) {
    const o = fxOrigin(), u = stageSize().w / 100, hr = 9 * u * sp.grow * Math.max(sp.hs, 1);
    box.x1 = Math.min(box.x1, o.x - hr - p);
    box.x2 = Math.max(box.x2, o.x + hr + p);
    box.y1 = Math.min(box.y1, o.y - hr - p);
  }
  return box;
}

function pathHitsHero(start, end, pad = CONFIG.HIT_PADDING) {
  const r = heroRect(pad);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) return true;
  }
  return false;
}

function onSwing(side, start, end, vx) {
  if (performance.now() < busyUntil) return false;          // 變身演出中
  const motionDir = vx > 0 ? 1 : -1;
  const imgSide = CONFIG.IMAGE_BY === "motion" ? (motionDir > 0 ? "right" : "left") : side;
  const dir = imgSide === "right" ? 1 : -1;                 // 頭被打飛的方向

  const rawHit = pathHitsHero(start, end);
  const near = rawHit || (CONFIG.MISS_ZONE_PADDING > 0 && pathHitsHero(start, end, CONFIG.MISS_ZONE_PADDING));
  // 還沒變身時，青蛙有機會躲掉
  const dodged = rawHit && !transformed && Math.random() < CONFIG.DODGE_CHANCE;
  const hit = rawHit && !dodged;

  trails.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y, t0: performance.now(), color: HAND_COLOR[side], hit });
  if (!near) return false;

  if (hit) registerHit(dir);
  else registerMiss(imgSide, motionDir);
  return true;
}

/* =========================================================
   偵測迴圈
   ========================================================= */
function palmCenter(lm) {
  const ids = [0, 5, 9, 13, 17];
  let x = 0, y = 0;
  ids.forEach(i => { x += lm[i].x; y += lm[i].y; });
  return { x: x / ids.length, y: y / ids.length };
}

function drawTrails(now) {
  trails = trails.filter(t => now - t.t0 < 350);
  trails.forEach(t => {
    const a = 1 - (now - t.t0) / 350;
    ctx.save();
    ctx.globalAlpha = a * (t.hit ? 0.9 : 0.5);
    ctx.strokeStyle = t.hit ? t.color : "#edebeb";
    ctx.lineWidth = (t.hit ? 26 : 14) * a;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
    ctx.restore();
  });
}

function loop() {
  requestAnimationFrame(loop);
  if (!handLandmarker || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const { w: W, h: H } = stageSize();
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.clearRect(0, 0, W, H);

  const now = performance.now();
  drawTrails(now);

  const result = handLandmarker.detectForVideo(video, now);
  const handedness = result.handedness || result.handednesses || [];
  const seen = { left: false, right: false };
  let handXSum = 0, handCount = 0;

  result.landmarks.forEach((lm, i) => {
    const label = handedness[i]?.[0]?.categoryName || "Right";
    let side = label === "Left" ? "left" : "right";
    if (CONFIG.SWAP_HANDEDNESS) side = side === "left" ? "right" : "left";
    seen[side] = true;

    const c = palmCenter(lm);
    const cur = { x: (1 - c.x) * W, y: c.y * H, t: now };
    const hist = history[side];
    const prev = hist[hist.length - 1];
    handXSum += cur.x; handCount++;

    let swinging = false;
    if (prev) {
      const dt = Math.max((now - prev.t) / 1000, 0.001);
      const vx = (cur.x - prev.x) / dt, vy = (cur.y - prev.y) / dt;
      const s = smooth[side];
      s.vx = s.vx * 0.4 + vx * 0.6;
      s.vy = s.vy * 0.4 + vy * 0.6;

      swinging = Math.abs(s.vx) > CONFIG.SWING_SPEED &&
                 Math.abs(s.vx) > Math.abs(s.vy) * CONFIG.HORIZONTAL_RATIO;

      if (running && swinging && now - lastSwing[side] > CONFIG.SWING_COOLDOWN) {
        if (onSwing(side, hist[0], cur, s.vx)) lastSwing[side] = now;
      }
    }
    hist.push(cur);
    if (hist.length > 5) hist.shift();

    ctx.beginPath();
    ctx.arc(cur.x, cur.y, swinging ? 44 : 28, 0, Math.PI * 2);
    ctx.fillStyle = HAND_COLOR[side] + (swinging ? "cc" : "77");
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ecffca";
    ctx.stroke();
    ctx.fillStyle = "#3b1d2a";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(side === "left" ? "左" : "右", cur.x, cur.y + 8);
  });

  ["left", "right"].forEach(s => {
    if (!seen[s]) { history[s] = []; smooth[s] = { vx: 0, vy: 0 }; }
  });

  updateTilt(handCount ? handXSum / handCount : null, W);
}

// 主角像 3D 物件一樣轉向手的方向，邊緣的「厚度」也跟著換邊
let tilt = 0;
function updateTilt(handX, W) {
  if (reduceMotion || !CONFIG.TILT_STRENGTH) return;
  const target = handX === null ? 0
    : clamp(((handX - W / 2) / W) * 60 * CONFIG.TILT_STRENGTH, -22, 22);
  tilt += (target - tilt) * 0.25;
  const u = W / 100;
  hero.style.setProperty("--ry", `${tilt.toFixed(2)}deg`);
  hero.style.setProperty("--ex", `${(-tilt / 22 * 0.55 * u).toFixed(2)}px`);
}

/* =========================================================
   倒數
   ========================================================= */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function showCount(text, mode) {
  countdownEl.dataset.mode = mode;
  countdownEl.textContent = text;
  if (reduceMotion) {
    countdownEl.style.opacity = 1;
    setTimeout(() => (countdownEl.style.opacity = 0), 700);
    return;
  }
  countdownEl.animate(
    [
      { opacity: 0, transform: "translate(-50%, -50%) scale(2.2)" },
      { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.25 },
      { opacity: mode === "final" ? 0.85 : 1, transform: "translate(-50%, -50%) scale(0.95)", offset: 0.75 },
      { opacity: 0, transform: "translate(-50%, -50%) scale(0.7)" }
    ],
    { duration: 950, easing: "ease-out" }
  );
}

async function runStartCountdown() {
  for (let n = CONFIG.START_COUNTDOWN; n >= 1; n--) {
    showCount(n, "start");
    playSound("tick", 0);
    await sleep(1000);
  }
  showCount("開始！", "start");
  playSound("go");
}

/* =========================================================
   初始化、開始與結束
   ========================================================= */
async function initTracking() {
  const { HandLandmarker, FilesetResolver } = await import(VISION_URL);
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  handLandmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: "user" },
    audio: false
  });
  video.srcObject = stream;
  await new Promise(res => (video.onloadeddata = res));
  loop();
}

async function startGame() {
  unlockAudio();
  startBtn.disabled = true;
  startBtn.textContent = "載入中…";

  try {
    if (!handLandmarker) await initTracking();
  } catch (err) {
    console.error(err);
    messageTx.textContent = "無法啟動鏡頭或手部偵測，請允許鏡頭權限，並用 localhost 或 https 開啟。";
    startBtn.disabled = false;
    startBtn.textContent = "再試一次";
    return;
  }

  score = 0; hits = 0; combo = 0; maxCombo = 0; missStreak = 0;
  transformed = false;
  busyUntil = 0;
  Object.assign(sp, { sway: 0, swayV: 0, s: 1, sV: 0, hs: 1, hsV: 0, grow: 1, bigUntil: 0 });
  timeLeft = CONFIG.GAME_SECONDS;
  scoreEl.textContent = 0;
  timeEl.textContent = timeLeft;
  updateComboUI(false);
  setHero("idle", false);

  messageEl.hidden = true;
  timeEl.parentElement.classList.remove("urgent");

  await runStartCountdown();
  running = true;

  countdownTimer = setInterval(() => {
    timeLeft--;
    timeEl.textContent = timeLeft;

    if (timeLeft > 0 && timeLeft <= CONFIG.FINAL_COUNTDOWN) {
      timeEl.parentElement.classList.add("urgent");
      showCount(timeLeft, "final");
      playSound("tick", CONFIG.FINAL_COUNTDOWN - timeLeft);
    }
    if (timeLeft <= 0) endGame();
  }, 1000);
}

function endGame() {
  running = false;
  timeEl.parentElement.classList.remove("urgent");
  clearInterval(countdownTimer);
  breakCombo(false);
  setHero("idle", false);

  messageTx.innerHTML =
    `時間到！<br>得分 <strong>${score}</strong>　打中 <strong>${hits}</strong> 次　最高連擊 <strong>${maxCombo}</strong>`;
  startBtn.disabled = false;
  startBtn.textContent = "再玩一次";
  messageEl.hidden = false;
}

/* ---------- 啟動 ---------- */
setHero("idle", false);
startBtn.addEventListener("click", startGame);

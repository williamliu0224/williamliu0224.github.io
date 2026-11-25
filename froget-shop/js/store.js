// ===== 商店頁（store.html）=====
// 主視覺：青蛙細胞分裂（3D，js/storeHero.js）；最後兩個商品入口淡入
// 本檔以 ES module 載入（store.html 用 type="module"），才能匯入 3D 模組

import { createStoreHero } from "./storeHero.js";
import { createStoreSfx } from "./storeSfx.js";

const sfx = createStoreSfx();   // 細胞分裂的音效（Web Audio 合成）

const canvas = document.getElementById("store-hero-canvas");
const replayBtn = document.getElementById("hero-replay");
const BOUNCE_MS = 450;   // 點泡泡後先讓它彈一下、叫一聲，再換頁（毫秒）
let goTimer = null;

const hero = createStoreHero({
  canvas,
  labels: {
    a: document.getElementById("hero-label-a"), // 青蛙貼布入口
    b: document.getElementById("hero-label-b"), // 不累不累丸入口
  },
  textureUrl: "img/store-pouch-texture.jpg",
  // 動畫跑到每個分鏡點時播對應音效（登場、排隊、拉長、斷開、三次融合、入口出現、撐破）
  onCue: (name) => sfx.play(name),
  // 點青蛙泡泡：彈一下、播青蛙音效（frogSound.js 提供），彈完就走進那個商品頁
  // a＝左邊貼布泡泡 → 貼布頁；b＝右邊藥丸泡泡 → 藥丸頁（網址跟下面「看商品 →」按鈕同一個）
  onBubble: (side) => {
    if (window.playFrogSound) window.playFrogSound();
    const link = document.querySelector(`#hero-label-${side} .hero-label-link`);
    if (!link) return;
    clearTimeout(goTimer);
    goTimer = setTimeout(() => link.click(), BOUNCE_MS);   // 等於按下「看商品 →」
  },
});

// 動畫播完（約 5.6 秒）後顯示「再看一次」
const DURATION_MS = 5800;
let replayTimer = null;
function showReplayLater() {
  clearTimeout(replayTimer);
  replayBtn.classList.remove("is-shown");
  replayTimer = setTimeout(() => replayBtn.classList.add("is-shown"), DURATION_MS);
}

if (hero) {
  // 第一次看到主視覺才開始計時（動畫也是那時才開始播）
  const io = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        showReplayLater();
        io.disconnect();
      }
    },
    { threshold: 0.3 },
  );
  io.observe(canvas);

  replayBtn.addEventListener("click", () => {
    hero.replay();
    showReplayLater();
  });
} else {
  // 瀏覽器不支援 WebGL：直接顯示商品入口
  document.querySelectorAll(".hero-label").forEach((el, i) => {
    el.style.opacity = 1;
    el.style.pointerEvents = "auto";
    el.style.left = i === 0 ? "30%" : "70%";
    el.style.top = "50%";
    el.style.transform = "translate(-50%, -50%)";
  });
}

// ===== 購物車件數（跟貼布頁、藥丸頁、購物車頁共用 localStorage「froget-cart」）=====
const cartCount = document.getElementById("cart-count");
function syncCartCount() {
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("froget-cart") || "[]"); } catch (e) {}
  if (cartCount) cartCount.textContent = cart.reduce((a, it) => a + (it.qty || 0), 0);
}
syncCartCount();
window.addEventListener("pageshow", syncCartCount);   // 從商品頁按「上一頁」回來也會更新
window.addEventListener("storage", (ev) => { if (ev.key === "froget-cart") syncCartCount(); });

// ===== 聲音開關：瀏覽器規定要先點一下頁面才能出聲 =====
// 還沒點過時，左下角顯示「🔊 開啟聲音」；按下去會打開聲音並從頭播一次動畫
const soundBtn = document.getElementById("hero-sound");
if (soundBtn && hero) {
  const sync = () => soundBtn.classList.toggle("is-shown", !sfx.unlocked);
  setTimeout(sync, 300);
  soundBtn.addEventListener("click", () => {
    sfx.unlock().then(() => {
      sync();
      hero.replay();
      if (typeof showReplayLater === "function") showReplayLater();
    });
  });
  ["pointerdown", "keydown", "touchstart"].forEach((t) =>
    window.addEventListener(t, () => setTimeout(sync, 50), { passive: true }),
  );
}

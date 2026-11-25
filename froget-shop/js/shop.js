// ===== 青蛙貼布產品頁（patch.html）互動 =====
// 各 frame 的互動與動畫依序加入：
// 00 商店首頁、01 貼布飛入、02 開場、03 運作原理、04 規格數字、05 貼布構造、06 購買
// 本檔以 ES module 載入（patch.html 用 type="module"），才能匯入 3D 模組

import { createPouchEntrance } from "./pouchEntrance.js";
import { createLayersFx } from "./layersFx.js";
import { createScreenPatch } from "./screenPatch.js";

// 使用者是否開啟「減少動態效果」
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

// ===== 01 貼布飛入 =====
// 1. 01 區塊頂端碰到畫面頂端時，整段動畫自動播放（飛入→撕開→開袋→貼布彈出→Q 彈）
// 2. 播放期間鎖住捲動，要看完才能往下
// 3. 貼布 Q 彈完，解除鎖定，頁面以彈性效果自動捲到 02
// 4. 01 是頁面開場：一進來（停在頁首）就自動播放
// 往回捲到頁首時重設，再往下捲會整段重播
const FLYIN = {
  zoom: 1.6, // 袋子大小倍率（1＝參考檔預設大小）
  rearmRatio: 0.1, // 01 頂端往下離開畫面頂端超過畫面高的 10% 時重設（可重播）
  jumpDelay: 200, // Q 彈結束後等多久開始捲到 02（毫秒）
  jumpMs: 1400, // 捲到 02 的時間（毫秒）
  overshoot: 0.15, // 彈性：第一次衝過頭的比例（15%）
  bounces: 2.5, // 彈性：擺盪圈數（約回彈兩次）
  safetyMs: 2000, // 保險：動畫總長再多等這麼久仍沒結束就強制解鎖（毫秒）
};

const flyinSection = document.getElementById("flyin");
let flyinAutoDone = null; // 自動播放結束時呼叫（由下方流程設定）
const pouch = createPouchEntrance(document.getElementById("flyin-canvas"), {
  zoom: FLYIN.zoom,
  onComplete: () => {
    if (flyinAutoDone) flyinAutoDone();
  },
});

// 01 區塊頂端在整頁中的位置
const flyinTop = () =>
  flyinSection.getBoundingClientRect().top + window.scrollY;
// 導覽列高度（01 緊接在導覽列下面）
const navHeight = () => document.querySelector(".nav")?.offsetHeight || 0;

// ----- 彈性捲動：捲到指定位置，先衝過頭再回彈 -----
// 曲線：1 − e^(−a·k)·cos(b·k)，b 決定擺盪圈數，a 由 overshoot 反推
const bounceB = FLYIN.bounces * Math.PI;
const bounceA = (Math.log(1 / FLYIN.overshoot) * bounceB) / Math.PI;
const easeBounce = (k) =>
  k >= 1 ? 1 : 1 - Math.exp(-bounceA * k) * Math.cos(bounceB * k);

let bounceRaf = 0; // 目前的彈性捲動（0＝沒有）
function cancelBounceScroll() {
  if (bounceRaf) cancelAnimationFrame(bounceRaf);
  bounceRaf = 0;
}
function bounceScrollTo(targetY, ms) {
  cancelBounceScroll();
  const startY = window.scrollY;
  const dist = targetY - startY;
  const start = performance.now();
  function step(now) {
    const k = Math.min(1, (now - start) / ms);
    window.scrollTo({
      top: startY + dist * easeBounce(k),
      behavior: "instant",
    });
    bounceRaf = k < 1 ? requestAnimationFrame(step) : 0;
  }
  bounceRaf = requestAnimationFrame(step);
}
// 使用者自己捲動或按鍵時，立刻取消自動捲動，把控制權還給使用者
["wheel", "touchstart", "keydown", "mousedown"].forEach((type) =>
  window.addEventListener(type, cancelBounceScroll, { passive: true }),
);

// ----- 捲動鎖定：動畫播放中不能捲動 -----
let scrollLocked = false;
let lockY = 0; // 鎖定時停留的位置
const SCROLL_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
  "Spacebar",
];
function blockScroll(ev) {
  if (!scrollLocked) return;
  if (ev.type === "keydown" && !SCROLL_KEYS.includes(ev.key)) return;
  ev.preventDefault();
}
["wheel", "touchmove", "keydown"].forEach((type) =>
  window.addEventListener(type, blockScroll, { passive: false }),
);
// 拖曳捲軸等無法攔截的捲動：直接拉回鎖定位置
window.addEventListener("scroll", () => {
  if (scrollLocked && Math.abs(window.scrollY - lockY) > 1) {
    window.scrollTo({ top: lockY, behavior: "instant" });
  }
});
function lockScroll(y) {
  lockY = y;
  scrollLocked = true;
  window.scrollTo({ top: y, behavior: "instant" });
}
function unlockScroll() {
  scrollLocked = false;
}

if (!reduceMotion) {
  // idle＝等待觸發；playing＝自動播放中（鎖捲動）；done＝播完（已捲到 02 或停在後面）
  let state = "idle";
  let jumpTimer = null;
  let safetyTimer = null;
  let qSoundPlayed = false; // 這一輪的 Q 彈音效播過了沒

  // 播完（貼布 Q 彈完）→ 解鎖，稍等一下彈性捲到 02
  flyinAutoDone = () => {
    if (state !== "playing") return;
    state = "done";
    clearTimeout(safetyTimer);
    unlockScroll();
    clearTimeout(jumpTimer);
    if (window.__releaseTopHold) window.__releaseTopHold(); // 放開「停在頁首」，讓頁面可以自動捲到 02
    jumpTimer = setTimeout(() => {
      const introTop =
        document.getElementById("intro").getBoundingClientRect().top +
        window.scrollY;
      bounceScrollTo(introTop, FLYIN.jumpMs);
    }, FLYIN.jumpDelay);
  };

  // 開始播放：貼齊 01 頂端、鎖捲動、從頭播
  function startFlyin(lockAt = flyinTop()) {
    state = "playing";
    qSoundPlayed = false;
    cancelBounceScroll();
    lockScroll(lockAt);
    pouch.seek(0);
    pouch.play();
    // 保險：萬一動畫沒有正常結束，時間到就強制解鎖
    clearTimeout(safetyTimer);
    safetyTimer = setTimeout(
      () => {
        if (state !== "playing") return;
        state = "done";
        unlockScroll();
      },
      pouch.duration * 1000 + FLYIN.safetyMs,
    );
    requestAnimationFrame(watchQBounce);
  }

  // 播放中：貼布抽到頂、開始 Q 彈的瞬間播青蛙音效（每輪只播一次）
  function watchQBounce() {
    if (state !== "playing") return;
    if (!qSoundPlayed && pouch.time >= pouch.timeline.patchEnd) {
      qSoundPlayed = true;
      window.playFrogSound?.();
    }
    requestAnimationFrame(watchQBounce);
  }

  // 進頁面自動播放一次：只要停在頁首就播（載入時頁面可能先被捲回上次的位置、再被拉回頂端，所以不能只看載入那一瞬間）
  let autoStarted = false;
  let leftFlyin = false; // 播完後是否真的捲離過開場

  // 依捲動位置決定觸發或重設
  function checkFlyin() {
    if (state === "playing") return;
    if (!autoStarted && window.scrollY < 2) {
      autoStarted = true;
      state = "idle";
      startFlyin(window.scrollY);
      return;
    }
    const top = flyinSection.getBoundingClientRect().top;
    if (state === "done" && window.scrollY > window.innerHeight * 0.5) leftFlyin = true; // 真的捲離開場了
    if (state === "idle" && top <= 0 && top > -window.innerHeight) {
      // 01 頂端碰到畫面頂端（往下捲進來）→ 開始播放
      startFlyin();
    } else if (
      state === "done" &&
      leftFlyin && // 要先真的捲離開場、再回到頁首才重設（播完到自動下捲之間、自動下捲途中都不算）
      !bounceRaf &&
      window.scrollY < 2
    ) {
      leftFlyin = false;
      // 往回捲到頁首 → 重設成起始畫面，再往下捲會重播
      state = "idle";
      clearTimeout(jumpTimer);
      cancelBounceScroll();
      pouch.seek(0);
    }
  }

  // 模型載入後才開始監聽（避免模型還沒好就鎖住捲動）
  pouch.ready.then(() => {
    pouch.seek(0);   // 一律從開場第一格開始，停在頁首就會自動播（見 checkFlyin）
    checkFlyin();
    window.addEventListener("scroll", checkFlyin, { passive: true });
  });
}
// 減少動態時，pouchEntrance 模組會自己停在最後畫面，也不會鎖捲動或自動捲動

// ===== 02 開場：3D 袋子停在左欄商品圖位置，原地緩慢擺動；右欄文字依序滑入 =====
// 按住袋子左右拖曳可以 360 度旋轉，放開後帶慣性轉一下，再慢慢轉回正面
const INTRO = {
  zoom: 1.8, // 3D 袋子的繪製倍率（要比商品圖大，縮小貼齊時才清晰）
  spinPerPx: 0.012, // 拖曳每 1px 轉多少（弧度；約 520px 轉一圈）
  spinFriction: 3, // 放開後慣性減速的快慢（越大停得越快）
  spinReturn: 0.06, // 慣性停下後轉回正面的速度（0~1，每格追上的比例）
  stagger: 0.12, // 文字依序出現的間隔（秒）
  triggerRatio: 0.6, // 區塊露出畫面多少比例時文字開始滑入
  timeoutMs: 8000, // 模型太久沒載入就改顯示靜態圖
};

const introSection = document.getElementById("intro");
const introImg = document.getElementById("intro-img");
const introCanvas = document.getElementById("intro-canvas");
const introReveals = introSection.querySelectorAll(".intro-reveal");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 右欄文字依序滑入（animate＝false 時直接顯示）
function revealIntroText(animate) {
  introReveals.forEach((el, i) => {
    el.style.transitionDelay = animate ? `${i * INTRO.stagger}s` : "0s";
    el.classList.add("is-revealed");
  });
}

if (reduceMotion) {
  // 減少動態：不使用 3D，直接顯示商品圖與文字
  revealIntroText(false);
} else {
  introSection.classList.add("is-3d");

  let placed = false; // 3D 袋子是否已對齊商品圖
  const pouch2 = createPouchEntrance(introCanvas, { zoom: INTRO.zoom });

  // 計算讓袋子對齊商品圖的位移與縮放，套用在 3D 畫布上
  function placeAtImage() {
    const pouchRect = pouch2.getScreenRect({ upright: 1, sway: false }); // 轉正後的袋子外框
    if (!pouchRect) return;
    const box = introSection.getBoundingClientRect(); // 畫布未變形時與區塊同位置
    const img = introImg.getBoundingClientRect();
    const scale = img.height / pouchRect.height;
    const cx = pouchRect.x + pouchRect.width / 2;
    const cy = pouchRect.y + pouchRect.height / 2;
    const tx = img.left - box.left + img.width / 2 - cx;
    const ty = img.top - box.top + img.height / 2 - cy;
    introCanvas.style.transformOrigin = `${cx}px ${cy}px`;
    introCanvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  // 載入失敗或太慢：改顯示靜態商品圖
  function fallbackToStatic() {
    introSection.classList.remove("is-3d", "is-ready");
    revealIntroText(false);
    pouch2.dispose();
  }

  // 模型載入後：袋子停在飛入結束的姿勢並轉正，貼齊商品圖，開始緩慢擺動
  Promise.race([
    pouch2.ready.then(() => true),
    wait(INTRO.timeoutMs).then(() => false),
  ]).then((ok) => {
    if (!ok) {
      fallbackToStatic();
      return;
    }
    pouch2.seek(pouch2.timeline.flyEnd); // 不播飛入，直接用最後姿勢
    pouch2.setUpright(1);
    placeAtImage();
    placed = true;
    pouch2.setSway(true);
    introSection.classList.add("is-ready"); // 顯示 3D 畫布
    enableIntroSpin();
  });

  // ----- 拖曳旋轉：在商品圖範圍按住左右拖，袋子跟著轉（可轉 360 度）-----
  const introVisual = introImg.parentElement; // 商品圖外框（3D 畫布不接收滑鼠，改由這裡接）
  function enableIntroSpin() {
    let angle = 0; // 目前旋轉角度（弧度，不限範圍）
    let velocity = 0; // 放開時的轉速（弧度／秒）
    let dragging = false;
    let lastX = 0;
    let lastT = 0;
    let running = false;

    introVisual.classList.add("is-spinnable");
    introVisual.addEventListener("pointerdown", (ev) => {
      dragging = true;
      lastX = ev.clientX;
      lastT = performance.now();
      velocity = 0;
      introVisual.setPointerCapture(ev.pointerId); // 拖出外框也繼續跟著轉
      introVisual.classList.add("is-spinning");
      ev.preventDefault(); // 避免選到文字或拖動圖片
    });
    introVisual.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      const now = performance.now();
      const delta = (ev.clientX - lastX) * INTRO.spinPerPx;
      angle += delta;
      // 轉速取最近幾次移動的平滑值，放開時用來做慣性
      velocity =
        velocity * 0.6 + (delta / Math.max(1, now - lastT)) * 1000 * 0.4;
      lastX = ev.clientX;
      lastT = now;
      pouch2.setTilt(angle, 0);
    });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      introVisual.classList.remove("is-spinning");
      if (performance.now() - lastT > 80) velocity = 0; // 停住一下才放開：不帶慣性
      startSpin();
    };
    introVisual.addEventListener("pointerup", release);
    introVisual.addEventListener("pointercancel", release);

    // 放開後：先帶慣性轉，速度變慢後轉回最近的正面（整數圈），不會倒轉好幾圈
    function startSpin() {
      if (running) return;
      running = true;
      let prev = performance.now();
      requestAnimationFrame(function step(now) {
        if (dragging) {
          running = false;
          return;
        }
        const dt = Math.min(0.05, (now - prev) / 1000);
        prev = now;
        if (Math.abs(velocity) > 0.3) {
          angle += velocity * dt;
          velocity *= Math.exp(-INTRO.spinFriction * dt);
        } else {
          velocity = 0;
          const front = Math.round(angle / (Math.PI * 2)) * Math.PI * 2;
          angle += (front - angle) * INTRO.spinReturn;
          if (Math.abs(front - angle) < 0.001) {
            angle = 0; // 回到正面，歸零
            pouch2.setTilt(0, 0);
            running = false;
            return;
          }
        }
        pouch2.setTilt(angle, 0);
        requestAnimationFrame(step);
      });
    }
  }

  // 區塊露出足夠比例時，右欄文字依序滑入（只播一次）
  const introObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      const seen = entry.intersectionRect.height;
      const need =
        Math.min(entry.boundingClientRect.height, window.innerHeight) *
        INTRO.triggerRatio;
      if (seen < need) return;
      introObserver.disconnect();
      revealIntroText(true);
    },
    { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
  );
  introObserver.observe(introSection);

  // 視窗大小改變：袋子重新對齊商品圖
  // 延後兩格，等 3D 模組先依新尺寸更新鏡頭再量測
  window.addEventListener("resize", () => {
    if (!placed) return;
    requestAnimationFrame(() => requestAnimationFrame(() => placeAtImage()));
  });
}

// ===== 04 規格數字：四張卡依序從右側滑入（數字直接顯示，不跳動） =====
const SPECS = {
  stagger: 120, // 每張卡間隔（毫秒）；滑入時間 0.9 秒寫在 CSS
  triggerRatio: 0.8, // 區塊露出多少比例時開始（幾乎整頁進入畫面）
};

const specsSection = document.getElementById("specs");
const specCards = specsSection.querySelectorAll(".spec-card");

if (!reduceMotion) {
  // 進場前：卡片移到畫面右側外
  specsSection.classList.add("is-anim");
  specCards.forEach((card, i) => {
    card.style.transitionDelay = `${i * SPECS.stagger}ms`;
  });

  // 區塊露出足夠比例時播放（只播一次）
  const specsObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      const seen = entry.intersectionRect.height;
      const need =
        Math.min(entry.boundingClientRect.height, window.innerHeight) *
        SPECS.triggerRatio;
      if (seen < need) return;
      specsObserver.disconnect();
      // 每張卡滑到定位後：清掉滑入延遲，標記 is-settled，才開放滑鼠移入的彈跳效果
      specCards.forEach((card) => {
        card.addEventListener(
          "transitionend",
          (ev) => {
            if (ev.propertyName !== "transform") return;
            card.style.transitionDelay = "";
            card.classList.add("is-settled");
          },
          { once: true },
        );
      });
      specsSection.classList.add("is-in"); // 卡片滑入
    },
    // 每 5% 檢查一次，確保露出比例到達時能觸發
    { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
  );
  specsObserver.observe(specsSection);
}
// 減少動態時：卡片直接顯示最終狀態

// ===== 05 貼布構造：區塊頂端碰到畫面頂端時鎖住捲動，自動播完四層分解＋五大程序；說明卡依程序淡入 =====
// 播完後五種特效同時循環、五張說明卡全部顯示，解除鎖定（只播一次）
const LAYERS = {
  speed: 1, // 自動播放倍速（1＝原速，完整動畫約 10.2 秒；數字越大越快）
  safetyMs: 3000, // 保險：動畫總長再多等這麼久仍沒結束就強制解鎖（毫秒）
  staggerRatio: 0.5, // 每張說明卡比上一張往下錯開「上一張卡高 × 這個比例」（0.5＝同側卡片剛好上下貼齊）
  sameSideGap: 36, // 同側卡片（例如左側的 05 與 03）之間的間距（px）
};

const layersSection = document.getElementById("layers");
const layerLabels = layersSection.querySelectorAll(".layer-label");
const layersFx = createLayersFx(document.getElementById("layers-canvas"));

// 依目前程序更新說明卡：目前那張完全顯示、播過的半透明、還沒到的隱藏
// 自動播放中，鏡頭同時推近目前程序的區域（0＝分解階段維持全景）
// 動畫播完後改由懸停／點擊控制；手機版與減少動態時不推近
function setLayerStage(stage) {
  layerLabels.forEach((el) => {
    const n = Number(el.dataset.stage);
    el.classList.toggle("is-current", n === stage);
    el.classList.toggle("is-past", n < stage);
  });
  const isMobile = window.matchMedia("(max-width: 767px)").matches;
  if (
    !reduceMotion &&
    !isMobile &&
    !layersSection.classList.contains("is-finale")
  ) {
    layersFx.focus(stage);
  }
  // 有說明卡跳出（layer-pop 彈跳）時同時播青蛙音效；播完後的總覽不播
  if (stage > 0 && !layersSection.classList.contains("is-finale")) {
    window.playFrogSound?.();
  }
}
layersFx.onStage(setLayerStage);

// 說明卡錯開排列：第一張（05）在標題下方 56px（CSS），
// 之後每張卡的頂端比上一張往下錯開「上一張卡高 × staggerRatio ＋ sameSideGap / 2」
// 同側卡片隔兩步，所以同側之間剛好多出 sameSideGap 的間距
// 卡片自然會接在上一張底部，所以 margin-top＝錯開距離 − 上一張高度（負值＝往上重疊）
// 手機版（一次只顯示一張）不需要錯開
const layersMobile = window.matchMedia("(max-width: 767px)");
function layoutLayerLabels() {
  layerLabels.forEach((el, i) => {
    if (i === 0 || layersMobile.matches) {
      el.style.marginTop = "";
      return;
    }
    const prevHeight = layerLabels[i - 1].offsetHeight;
    const step = prevHeight * LAYERS.staggerRatio + LAYERS.sameSideGap / 2; // 往下錯開的距離
    el.style.marginTop = `${step - prevHeight}px`;
  });
}
layoutLayerLabels();
// 卡片高度改變（視窗縮放、字型載入）時重新計算
const layerLabelsObserver = new ResizeObserver(() => layoutLayerLabels());
layerLabels.forEach((el) => layerLabelsObserver.observe(el));
layersMobile.addEventListener("change", layoutLayerLabels);

// 動畫播完：五種特效同時循環，五張說明卡全部 50%，並開放懸停／點擊推近
function showLayersFinale() {
  layersFx.focus(0); // 鏡頭拉回全景
  layersFx.setFinale(true);
  layersSection.classList.add("is-finale");
  enableLayerFocus();
}

// ----- 說明卡懸停／點擊：鏡頭推近對應區域（該區寬度 75vw），其他區淡化 -----
// 懸停：移入推近、移出縮回；點擊：鎖定推近，再點同一張或點空白處才縮回
// 手機版不使用（一次只顯示一張卡）
let layerHover = 0; // 滑鼠目前懸停的卡（0＝沒有）
let layerLocked = 0; // 點擊鎖定的卡（0＝沒有）

// 依懸停／鎖定狀態更新鏡頭與卡片外觀（懸停優先）
function updateLayerFocus() {
  const n = layersMobile.matches ? 0 : layerHover || layerLocked;
  layersFx.focus(n);
  layerLabels.forEach((el) => {
    el.classList.toggle("is-focus", Number(el.dataset.stage) === n);
  });
}

function enableLayerFocus() {
  layerLabels.forEach((el) => {
    const n = Number(el.dataset.stage);
    const box = el.querySelector(".layer-box");
    box.addEventListener("mouseenter", () => {
      layerHover = n;
      updateLayerFocus();
    });
    box.addEventListener("mouseleave", () => {
      layerHover = 0;
      updateLayerFocus();
    });
    box.addEventListener("click", (ev) => {
      ev.stopPropagation(); // 避免被下面的「點空白處」取消
      layerLocked = layerLocked === n ? 0 : n;
      updateLayerFocus();
    });
  });
  // 點卡片以外的地方：取消鎖定
  document.addEventListener("click", () => {
    if (!layerLocked) return;
    layerLocked = 0;
    updateLayerFocus();
  });
  // 切換到手機版時回到全景
  layersMobile.addEventListener("change", updateLayerFocus);
}

if (reduceMotion) {
  // 減少動態：直接顯示最終畫面，五張卡全部顯示
  layersFx.setProgress(1);
  showLayersFinale();
  layersSection.classList.add("show-all");
} else {
  // 區塊頂端碰到畫面頂端（往下捲進來）→ 貼齊、鎖住捲動、自動播完整段動畫（只播一次）
  let layersStarted = false;
  let layersSafety = null;

  // 播完：顯示總覽、解鎖（停在 05，由使用者自己往下捲）
  function finishLayers() {
    clearTimeout(layersSafety);
    showLayersFinale();
    unlockScroll();
  }

  function checkLayersTrigger() {
    if (layersStarted) return;
    const top = layersSection.getBoundingClientRect().top;
    if (top > 0) return;
    layersStarted = true;
    window.removeEventListener("scroll", checkLayersTrigger);
    if (top <= -window.innerHeight) {
      // 重新整理時已經停在 05 下方：直接顯示總覽，不鎖捲動
      layersFx.setProgress(1);
      showLayersFinale();
      return;
    }
    cancelBounceScroll();
    lockScroll(layersSection.getBoundingClientRect().top + window.scrollY);
    layersFx.play(LAYERS.speed).then(finishLayers);
    // 保險：萬一動畫沒有正常結束，時間到就強制解鎖
    layersSafety = setTimeout(
      unlockScroll,
      (10.2 / LAYERS.speed) * 1000 + LAYERS.safetyMs,
    );
  }
  window.addEventListener("scroll", checkLayersTrigger, { passive: true });
  checkLayersTrigger(); // 重新整理時若已經捲到這裡，直接觸發
}

// ===== 06 購買：3D 袋子 360 度自轉（滑鼠可帶動）；數量加減；加入購物車／願望清單 =====
const BUY = {
  zoom: 1.6, // 袋子在商品框中的大小倍率
  tiltX: 0.35, // 滑鼠左右移動時最大傾斜（弧度）
  tiltY: 0.2, // 滑鼠上下移動時最大傾斜（弧度）
  smooth: 0.1, // 傾斜跟上滑鼠的速度（0~1）
  minQty: 1,
  maxQty: 99,
  addedMs: 1500, // 「已加入 ✓」顯示多久
};

// ----- 3D 袋子：停在飛入結束的姿勢並轉正，放在商品框正中央 -----
const buyVisual = document.getElementById("buy-visual");
const buyPouch = createPouchEntrance(document.getElementById("buy-canvas"), {
  zoom: BUY.zoom,
});
buyPouch.ready.then(() => {
  buyPouch.seek(buyPouch.timeline.flyEnd);
  buyPouch.setUpright(1);
});

// 購買區袋子：一直慢慢 360 度自轉（看得到背面）；滑鼠在框上左右移動可以多轉一點、上下移動會前後傾
if (!reduceMotion) {
  const BUY_SPIN = 0.6; // 自轉速度（弧度／秒；約 10 秒轉一圈）
  let tiltTarget = { x: 0, y: 0 }; // 滑鼠帶來的額外角度
  let tiltNow = { x: 0, y: 0 };
  let yaw = 0;
  let buyInView = false;
  let last = performance.now();

  buyVisual.addEventListener("pointermove", (ev) => {
    const rect = buyVisual.getBoundingClientRect();
    const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((ev.clientY - rect.top) / rect.height) * 2 - 1;
    tiltTarget = { x: nx * BUY.tiltX, y: ny * BUY.tiltY };
  });
  buyVisual.addEventListener("pointerleave", () => {
    tiltTarget = { x: 0, y: 0 };
  });

  // 只在購買區出現在畫面上時轉，省效能
  new IntersectionObserver((es) => {
    buyInView = es[0].isIntersecting;
    last = performance.now();
  }).observe(buyVisual);

  function spinBuy(now) {
    requestAnimationFrame(spinBuy);
    if (!buyInView) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    yaw += dt * BUY_SPIN;
    tiltNow.x += (tiltTarget.x - tiltNow.x) * BUY.smooth;
    tiltNow.y += (tiltTarget.y - tiltNow.y) * BUY.smooth;
    buyPouch.setTilt(yaw + tiltNow.x, tiltNow.y);
  }
  buyPouch.ready.then(() => requestAnimationFrame(spinBuy));
}

// ----- 數量加減（1~99）-----
const qtyMinus = document.getElementById("qty-minus");
const qtyPlus = document.getElementById("qty-plus");
const qtyValue = document.getElementById("qty-value");
let qty = BUY.minQty;

function renderQty() {
  qtyValue.textContent = qty;
  qtyMinus.disabled = qty <= BUY.minQty;
  qtyPlus.disabled = qty >= BUY.maxQty;
}
qtyMinus.addEventListener("click", () => {
  qty = Math.max(BUY.minQty, qty - 1);
  renderQty();
});
qtyPlus.addEventListener("click", () => {
  qty = Math.min(BUY.maxQty, qty + 1);
  renderQty();
});
renderQty();

// ----- 加入購物車：商品存進瀏覽器（和不累不累丸頁、購物車頁 cart.html 共用同一份），
//       導覽列數量更新，按鈕短暫顯示「已加入 ✓」 -----
const addCartBtn = document.getElementById("add-cart");
const cartCount = document.getElementById("cart-count");
const CART_KEY = "froget-cart";
const PATCH_ITEM = { product: "patch", name: "青蛙貼布", spec: "一盒 10 片", price: 999 };
const readCart = () => {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch (e) {
    return [];
  }
};
const writeCart = (c) => {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(c));
  } catch (e) {}
};
const syncCartCount = () => {
  cartCount.textContent = readCart().reduce((a, it) => a + it.qty, 0);
};
syncCartCount();
window.addEventListener("pageshow", syncCartCount); // 從購物車頁按上一頁回來時更新
window.addEventListener("storage", (ev) => {
  if (ev.key === CART_KEY) syncCartCount();
});
let addedTimer = null;

addCartBtn.addEventListener("click", () => {
  const cart = readCart();
  const id = "patch|" + PATCH_ITEM.spec;
  const hit = cart.find((it) => it.id === id);
  if (hit) hit.qty = Math.min(99, hit.qty + qty);
  else cart.push({ id, ...PATCH_ITEM, qty });
  writeCart(cart);
  syncCartCount();
  addCartBtn.textContent = "已加入 ✓";
  clearTimeout(addedTimer);
  addedTimer = setTimeout(() => {
    addCartBtn.textContent = "加入購物車";
  }, BUY.addedMs);
});

// ----- 加入願望清單：切換加入／取消 -----
const addWishBtn = document.getElementById("add-wish");
addWishBtn.addEventListener("click", () => {
  const added = addWishBtn.getAttribute("aria-pressed") !== "true";
  addWishBtn.setAttribute("aria-pressed", String(added));
  addWishBtn.textContent = added ? "已加入願望清單 ♥" : "加入願望清單";
});

// ===== 貼布盒：右下角的貼布可以拖出來貼在畫面任何地方（screenPatch.js，霓虹光環版） =====
// 捲到 04「產品說明」時貼布盒才彈出，之後一直留著（原本的 03 區塊已刪除）
// 貼上時（Q 彈＋霓虹光環）同時播青蛙音效
const SCREEN_PATCH = {
  showRatio: 0.6, // 04 區塊頂端進到畫面高度 60% 的位置時，貼布盒出現
};

const screenPatch = createScreenPatch({ trayVisible: false });
screenPatch.onStick(() => window.playFrogSound?.());
screenPatch.onTrayBounce(() => window.playFrogSound?.()); // 召回的貼布回到袋子、袋子彈一下時也播

const howSection = document.getElementById("specs");
function checkTrayShow() {
  if (
    howSection.getBoundingClientRect().top >
    window.innerHeight * SCREEN_PATCH.showRatio
  )
    return;
  screenPatch.setTrayVisible(true);
  window.removeEventListener("scroll", checkTrayShow); // 出現後就不再收起來
}
// 載入後前 3 秒頁面可能被瀏覽器捲回上次位置再拉回頂端，等穩定後才開始判斷
setTimeout(() => {
  window.addEventListener("scroll", checkTrayShow, { passive: true });
  checkTrayShow();
}, 3200);

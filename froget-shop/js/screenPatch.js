// ===== 青蛙貼布：貼在網頁畫面的任何地方 =====
// 用法：
//   import { createScreenPatch } from './screenPatch.js';
//   const sp = createScreenPatch();                    // 整個網頁最上層會多一層透明 3D 畫布
//   sp.onStick((x, y) => { ... });                    // （可選）貼上時要做的事
//   sp.setTrayVisible(true / false);                  // （可選）顯示／隱藏貼布盒
// 操作：右下角是撕開的包裝袋，露出一點貼布；按住往上拖＝把貼布從袋子抽出來，
//      抽出後放到畫面任何地方＝貼上（啪一下 Q 彈＋綠色光波）；
//      貼好的可以再拖去別的地方；拖回貼布盒＝收回。
// 只有點到貼布時才會攔截滑鼠，其他時候照常操作網頁。
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { makeFourLayerPatch } from "./patch.js";

export function createScreenPatch(opt = {}) {
  // ---------- 可調參數 ----------
  const P = {
    count: 6, // 貼布盒裡有幾片
    width: 110, // 貼布在畫面上的寬度（像素），高度依比例 1.4 倍
    trayRight: 28, // 貼布盒整組（袋子＋膠囊）距離畫面右邊（像素）
    trayBottom: 24, // 貼布盒整組距離畫面下緣（像素）
    badgeGap: 8, // 袋子與下方膠囊的間距（像素）
    waveColor: "200, 250, 110", // 發光顏色 #c8fa6e（R, G, B）
    waveTime: 1100, // 光波擴散時間（毫秒）
    waveRadius: 200, // 光波最大半徑（像素，從貼布中心算）
    waveStyle: "neon", // 光感樣式：'neon' 霓虹光環／'light' 照亮網頁／'sparkle' 光環＋光點
    zIndex: 9999,
    clarity: { white: 0.07, green: 0.13, blue: 0.12, bump: 0.45 }, // 各層不透明度（越小越透明）
    trayVisible: true,
    modelUrl: "img/3d/frog_pouch.glb", // 包裝袋模型
    pouchHeight: 140, // 包裝袋在畫面上的高度（像素）
    peek: 0.095, // 貼布露出袋口的長度（公尺，模型單位）；0.095＝01 動畫最後一幀，貼布完全抽出        // 一開始是否顯示貼布盒（false＝之後用 setTrayVisible(true) 再出現）
    ...opt,
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- 全畫面透明畫布（不擋滑鼠）----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  Object.assign(renderer.domElement.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: P.zIndex,
  });
  document.body.appendChild(renderer.domElement);
  // 光波用一般的 HTML 圓圈做，放在畫布下面一層
  const waveLayer = document.createElement("div");
  Object.assign(waveLayer.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: P.zIndex - 1,
    overflow: "hidden",
  });
  document.body.appendChild(waveLayer);
  // 貼布盒剩幾片的小標籤
  const badge = document.createElement("div");
  // 外觀由網站 CSS 的 .patch-tray-badge 決定（字級、顏色、圓角用 style.css 的變數）
  // 這裡只設定位置：靠右對齊（離畫面右邊 trayRight）、貼齊畫面下緣 trayBottom
  badge.className = "patch-tray-badge";
  Object.assign(badge.style, {
    position: "fixed",
    right: P.trayRight + "px",
    bottom: P.trayBottom + "px",
    pointerEvents: "none",
    zIndex: P.zIndex + 1,
    transition: "opacity .3s",
  });
  document.body.appendChild(badge);

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(
    new RoomEnvironment(),
    0.04,
  ).texture;
  scene.environmentIntensity = 0.9;
  const key = new THREE.DirectionalLight("#ffffff", 1.4);
  key.position.set(0.3, 0.6, 1);
  scene.add(key, new THREE.HemisphereLight("#ffffff", "#e9d3dc", 0.6));
  // 正交相機用「像素」當單位：畫面座標 (x, y) ＝ 3D 座標 (x, -y)
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  camera.position.z = 1000;
  function resize() {
    Object.assign(camera, {
      left: 0,
      right: innerWidth,
      top: 0,
      bottom: -innerHeight,
    });
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    dirty = true;
  }
  let dirty = true;
  resize();
  addEventListener("resize", resize);
  addEventListener(
    "scroll",
    () => {
      dirty = true;
    },
    { passive: true },
  );

  // ---------- 貼布盒：撕開的包裝袋（易撕條已撕掉、袋口張開）----------
  const POUCH_H = 0.225; // 袋子模型高度（公尺）
  const PULL_OUT = 0.095; // 貼布完全抽出袋口的距離（公尺，同登場動畫）
  const pouchPx = P.pouchHeight / POUCH_H; // 袋子模型 1 公尺 → 畫面像素
  const pouchBox = new THREE.Box3(
    new THREE.Vector3(-0.07, -POUCH_H / 2, 0),
    new THREE.Vector3(0.07, POUCH_H / 2, 0),
  ); // 袋子外框（載入後實際量）
  const pouchRig = new THREE.Group();
  pouchRig.visible = false;
  scene.add(pouchRig);
  let pouchReady = false,
    patchHolder = null;
  const patchHome = new THREE.Vector3(); // 貼布在袋子裡的位置（模型座標）
  new GLTFLoader().load(
    P.modelUrl,
    (gltf) => {
      const g = gltf.scene;
      g.position.y = -POUCH_H / 2; // 以袋子中心為原點
      g.traverse((o) => {
        if (o.isMesh && o.morphTargetInfluences) o.morphTargetInfluences[0] = 1;
      }); // 袋口張開
      g.getObjectByName("Tear_Strip").visible = false; // 易撕條已經撕掉
      const p1 = g.getObjectByName("Patch_1");
      for (const n of ["Patch_1", "Patch_2", "Patch_3", "Patch_4"])
        g.getObjectByName(n).visible = false; // 讓出位置給可抽出的貼布
      patchHolder = p1.parent;
      patchHome.set(p1.position.x, p1.position.y, 0.0009);
      g.updateWorldMatrix(true, true);
      pouchBox.setFromObject(g); // 量袋子實際外框（模型單位，以袋子中心為原點；放進 pouchRig 前量，避免受縮放影響）
      pouchRig.add(g);
      pouchReady = true;
      refreshTray();
    },
    undefined,
    (err) => console.error("[screenPatch] 包裝袋模型載入失敗：", err),
  );

  // ---------- 貼布 ----------
  const scale = P.width / 0.1; // 貼布模型寬 0.1 公尺 → 換算成像素
  const PW = P.width,
    PH = P.width * 1.4;
  const patches = []; // 每片：{ rig, patch, state, doc, screen, ... }
  let remaining = P.count,
    topZ = 10;
  let trayShown = P.trayVisible; // 貼布盒目前是否顯示
  let trayAppear = trayShown ? 1 : 0; // 貼布盒出現的進度 0~1（彈出動畫用）
  // 袋子中心在畫面上的位置：整組（袋子＋間距＋膠囊）離畫面右邊 trayRight、下緣 trayBottom
  const trayPos = () =>
    new THREE.Vector2(
      // 用 clientWidth／clientHeight（不含捲軸），跟 CSS 的 right／bottom 同一個基準，袋子才會和膠囊對齊
      document.documentElement.clientWidth -
        P.trayRight -
        pouchBox.max.x * pouchPx, // 袋子右邊緣對齊 trayRight
      document.documentElement.clientHeight -
        P.trayBottom -
        badge.offsetHeight -
        P.badgeGap +
        pouchBox.min.y * pouchPx,
    );

  function makeOne() {
    // 在袋子裡、拖曳中：跟 01 動畫一樣的不透明四層貼布；貼上後才變透明（makeClear）
    const patch = makeFourLayerPatch(THREE, RoundedBoxGeometry, {
      transparentBackground: true,
    });
    const rig = new THREE.Group();
    rig.add(patch.group);
    patch.group.scale.setScalar(scale);
    // 放進包裝袋裡（用模型座標，縮放抵消成模型原本大小），露出一點在袋口
    rig.scale.setScalar(1 / scale);
    patchHolder.add(rig);
    const o = {
      rig,
      patch,
      state: "tray",
      screen: trayPos(),
      doc: new THREE.Vector2(),
      rotZ: -0.12,
      t: 0,
      from: new THREE.Vector2(),
      fromRot: 0,
      squash: 99,
      glow: 99,
      z: 5,
      pull: 0,
      pullTilt: 0,
      grow: 99,
      growFrom: 1.08,
    };
    patches.push(o);
    return o;
  }
  // 讓貼布變得很透明，看得到背後的網頁畫面（貼上時呼叫）
  function makeClear(o) {
    const m = o.patch.materials;
    Object.assign(m.white, {
      opacity: P.clarity.white,
      transparent: true,
      roughness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    });
    Object.assign(m.green, { opacity: P.clarity.green, transparent: true });
    Object.assign(m.blue, {
      opacity: P.clarity.blue,
      transparent: true,
      depthWrite: false,
    });
    Object.assign(m.bump, { opacity: P.clarity.bump, transparent: true });
    for (const k of ["white", "green", "blue", "bump"]) m[k].needsUpdate = true;
  }
  function refreshTray() {
    const inTray = patches.find((o) => o.state === "tray");
    if (!inTray && remaining > 0 && pouchReady) makeOne(); // 袋子載入後才放貼布
    badge.textContent = remaining > 0 ? `貼布 × ${remaining}` : "貼布用完了";
    badge.style.opacity = trayShown ? "1" : "0";
    dirty = true;
  }
  refreshTray();

  // ---------- 綠色光波（三種光感樣式）----------
  // 每個效果都是一個 HTML 元素，由動畫迴圈逐格更新（不依賴 CSS 動畫，各瀏覽器都穩定）
  const fx = [];
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  function addFx(el, delay, dur, fn) {
    el.style.position = "absolute";
    el.style.willChange = "transform, opacity";
    el.style.opacity = "0";
    waveLayer.appendChild(el);
    fx.push({ el, start: performance.now() + delay, dur, fn });
  }
  function circle(x, y, r, css) {
    const d = document.createElement("div");
    Object.assign(
      d.style,
      {
        left: x - r + "px",
        top: y - r + "px",
        width: 2 * r + "px",
        height: 2 * r + "px",
        borderRadius: "50%",
      },
      css,
    );
    return d;
  }
  // 從中心放大、慢慢變淡
  const grow =
    (s0, s1, fade = 1) =>
    (el, k) => {
      el.style.transform = `scale(${s0 + (s1 - s0) * easeOut(k)})`;
      el.style.opacity = String(Math.max(0, 1 - Math.pow(k, fade)));
    };
  // 環狀漸層：在半徑 r% 的位置有一圈亮帶
  const ringGrad = (c, core, a) =>
    `radial-gradient(circle, rgba(${c},0) 55%, rgba(${c},${0.25 * a}) 63%, rgba(${c},${0.85 * a}) 69%, ${core} 70.5%, rgba(${c},${0.6 * a}) 72%, rgba(${c},0) 80%)`;

  function wave(x, y) {
    if (reduce) return;
    const R = P.waveRadius,
      c = P.waveColor,
      T = P.waveTime;
    if (P.waveStyle === "neon") {
      // 樣式 A：霓虹光環——白熱核心＋外圍柔光，用「濾色」疊在網頁上，看起來真的會發光
      for (const [delay, a] of [
        [0, 1],
        [150, 0.7],
      ]) {
        const glow = circle(x, y, R, {
          background: ringGrad(c, `rgba(${c},${a})`, a),
          filter: "blur(6px)",
          mixBlendMode: "screen",
        });
        const core = circle(x, y, R, {
          background: ringGrad(c, `rgba(236,255,200,${a})`, a * 0.9),
          mixBlendMode: "screen",
        });
        addFx(glow, delay, T, grow(0.05, 1, 1.4));
        addFx(core, delay, T, grow(0.05, 1, 1.4));
      }
      addFx(
        circle(x, y, 70, {
          background: `radial-gradient(circle, rgba(236,255,200,.95), rgba(${c},.55) 35%, rgba(${c},0) 70%)`,
          mixBlendMode: "screen",
        }),
        0,
        520,
        grow(0.4, 1.5, 0.8),
      );
    } else if (P.waveStyle === "light") {
      // 樣式 B：照亮網頁——光圈掃過的地方，底下的網頁內容真的變亮、帶一點綠
      for (const [delay, a] of [
        [0, 1],
        [170, 0.6],
      ]) {
        const lit = circle(x, y, R, {
          backdropFilter: `brightness(${1 + 0.45 * a}) saturate(${1 + 0.6 * a})`,
          webkitBackdropFilter: `brightness(${1 + 0.45 * a}) saturate(${1 + 0.6 * a})`,
          maskImage:
            "radial-gradient(circle, transparent 50%, #000 66%, #000 72%, transparent 82%)",
          webkitMaskImage:
            "radial-gradient(circle, transparent 50%, #000 66%, #000 72%, transparent 82%)",
          background: `radial-gradient(circle, rgba(${c},0) 55%, rgba(${c},${0.22 * a}) 68%, rgba(${c},${0.4 * a}) 71%, rgba(${c},0) 80%)`,
        });
        addFx(lit, delay, T * 1.15, grow(0.05, 1, 1.6));
      }
      addFx(
        circle(x, y, 85, {
          backdropFilter: "brightness(1.5) saturate(1.5)",
          webkitBackdropFilter: "brightness(1.5) saturate(1.5)",
          background: `radial-gradient(circle, rgba(${c},.35), rgba(${c},0) 70%)`,
          maskImage: "radial-gradient(circle, #000 30%, transparent 70%)",
          webkitMaskImage: "radial-gradient(circle, #000 30%, transparent 70%)",
        }),
        0,
        650,
        grow(0.4, 1.3, 0.8),
      );
    } else {
      // 樣式 C：光環＋光點——一圈光環，同時噴出一顆顆發亮的小光點，貼布周圍也有光暈
      addFx(
        circle(x, y, R, {
          background: ringGrad(c, `rgba(236,255,200,.9)`, 0.8),
          mixBlendMode: "screen",
        }),
        0,
        T,
        grow(0.05, 1, 1.4),
      );
      const n = 16;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4,
          dist = R * (0.45 + Math.random() * 0.55);
        const size = 4 + Math.random() * 7;
        const dot = circle(x, y, size, {
          background: `radial-gradient(circle, rgba(240,255,215,1) 0 18%, rgba(${c},.9) 35%, rgba(${c},0) 70%)`,
          mixBlendMode: "screen",
        });
        addFx(
          dot,
          Math.random() * 120,
          T * (0.8 + Math.random() * 0.4),
          (el, k) => {
            const e = easeOut(k);
            el.style.transform = `translate(${Math.cos(ang) * dist * e}px, ${Math.sin(ang) * dist * e}px) scale(${1.4 - k})`;
            el.style.opacity = String(
              k < 0.1 ? k * 10 : 1 - Math.pow((k - 0.1) / 0.9, 2),
            );
          },
        );
      }
      addFx(
        circle(x, y, 100, {
          background: `radial-gradient(circle, rgba(${c},.55), rgba(${c},.2) 45%, rgba(${c},0) 70%)`,
          mixBlendMode: "screen",
        }),
        0,
        900,
        (el, k) => {
          el.style.transform = `scale(${0.6 + 0.5 * easeOut(k)})`;
          el.style.opacity = String((1 - k) * (0.75 + 0.25 * Math.sin(k * 18)));
        },
      );
    }
  }
  function updateWaves() {
    const now = performance.now();
    for (let i = fx.length - 1; i >= 0; i--) {
      const w = fx[i],
        k = (now - w.start) / w.dur;
      if (k < 0) continue;
      if (k >= 1) {
        w.el.remove();
        fx.splice(i, 1);
        continue;
      }
      w.fn(w.el, k);
    }
    return fx.length > 0;
  }

  // 把袋子裡的貼布拿出來，改用畫面座標（保持目前看到的位置與大小）
  function takeOut(o) {
    o.rig.parent.updateWorldMatrix(true, false); // 確保袋子目前的姿勢已經算好
    scene.attach(o.rig);
    o.screen.set(o.rig.position.x, -o.rig.position.y);
    o.z = ++topZ;
    o.growFrom = o.rig.scale.x;
    o.grow = 0; // 從袋中大小長大成正常大小
  }

  // ---------- 滑鼠／手指（只有點到貼布或袋子才攔截）----------
  const ray = new THREE.Raycaster(),
    ndc = new THREE.Vector2();
  let drag = null,
    pid = null;
  const grabOff = new THREE.Vector2(),
    last = new THREE.Vector2(),
    vel = new THREE.Vector2();
  let lastT = 0,
    savedCursor = null;
  const pullStart = new THREE.Vector2(); // 開始抽貼布時的指標位置
  function pick(ev) {
    ndc.set(
      (ev.clientX / innerWidth) * 2 - 1,
      -(ev.clientY / innerHeight) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    let best = null,
      bestZ = -Infinity;
    for (const o of patches) {
      if (o.state === "return") continue;
      if (o.state === "tray" && !trayShown) continue; // 貼布盒隱藏時不能拿
      if (ray.intersectObject(o.rig, true).length && o.z > bestZ) {
        best = o;
        bestZ = o.z;
      }
    }
    // 點到包裝袋本身＝抓住露出來的那片貼布
    if (
      !best &&
      trayShown &&
      pouchReady &&
      ray.intersectObject(pouchRig, true).length
    ) {
      best = patches.find((o) => o.state === "tray") || null;
    }
    return best;
  }
  // 指標是否點在包裝袋上
  function hitPouch(ev) {
    if (!trayShown || !pouchReady) return false;
    ndc.set(
      (ev.clientX / innerWidth) * 2 - 1,
      -(ev.clientY / innerHeight) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(pouchRig, true).length > 0;
  }
  // 袋子空了、畫面上有貼著的貼布時，才能點袋子召回
  const canRecall = () =>
    !patches.some((o) => o.state === "tray") &&
    patches.some((o) => o.state === "stuck");
  // 召回：所有貼著的貼布依序飛回袋子（間隔 0.08 秒），全部到齊後袋子彈一下
  let recallPending = false;
  function recallAll() {
    let i = 0;
    for (const o of patches) {
      if (o.state !== "stuck") continue;
      o.state = "return";
      o.from.copy(o.screen);
      o.fromRot = o.rotZ;
      o.t = -0.08 * i++; // 負的時間＝等一下再出發
      o.flyTime = 0.6; // 從遠處飛回來，比拖回袋子慢一點
    }
    recallPending = true;
  }
  let pouchBounce = 99; // 袋子彈跳經過的時間（秒）
  function setCursor(c) {
    if (c && savedCursor === null) savedCursor = document.body.style.cursor;
    document.body.style.cursor = c || savedCursor || "";
    if (!c) savedCursor = null;
  }
  addEventListener(
    "pointerdown",
    (ev) => {
      const o = pick(ev);
      if (!o) {
        // 貼布用完時點袋子：貼在畫面上的全部飛回來
        if (canRecall() && hitPouch(ev)) {
          ev.preventDefault();
          ev.stopPropagation();
          recallAll();
        }
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      drag = o;
      pid = ev.pointerId;
      if (o.state === "tray") {
        // 袋子裡的貼布：先進入「抽出中」，往上拖到底才會離開袋子
        o.state = "pull";
        pullStart.set(ev.clientX, ev.clientY + o.pull * pouchPx); // 接續目前已抽出的長度
        setCursor("grabbing");
        return;
      }
      o.state = "drag";
      o.z = ++topZ;
      grabOff.set(ev.clientX - o.screen.x, ev.clientY - o.screen.y);
      last.set(ev.clientX, ev.clientY);
      vel.set(0, 0);
      lastT = performance.now();
      setCursor("grabbing");
    },
    { capture: true },
  );
  addEventListener(
    "pointermove",
    (ev) => {
      if (drag && ev.pointerId === pid && drag.state === "pull") {
        // 抽出中：往上拖多少，貼布就從袋口滑出多少；左右拖會讓貼布微微歪一邊
        const o = drag,
          max = PULL_OUT - P.peek;
        o.pull = Math.min(
          max,
          Math.max(0, (pullStart.y - ev.clientY) / pouchPx),
        );
        o.pullTilt = Math.max(
          -0.25,
          Math.min(0.25, -(ev.clientX - pullStart.x) * 0.004),
        );
        dirty = true;
        ev.preventDefault();
        if (o.pull >= max) {
          // 完全抽出：離開袋子，改成跟著指標拖曳；袋子裡補上下一片
          remaining--;
          takeOut(o);
          o.state = "drag";
          o.rotZ = o.pullTilt;
          grabOff.set(ev.clientX - o.screen.x, ev.clientY - o.screen.y);
          last.set(ev.clientX, ev.clientY);
          vel.set(0, 0);
          lastT = performance.now();
          refreshTray();
        }
        return;
      }
      if (drag && ev.pointerId === pid) {
        drag.screen.set(ev.clientX - grabOff.x, ev.clientY - grabOff.y);
        const now = performance.now(),
          dt = Math.max(1, now - lastT);
        vel.lerp(
          new THREE.Vector2(
            (ev.clientX - last.x) / dt,
            (ev.clientY - last.y) / dt,
          ),
          0.3,
        );
        last.set(ev.clientX, ev.clientY);
        lastT = now;
        dirty = true;
        ev.preventDefault();
        return;
      }
      setCursor(
        pick(ev) ? "grab" : canRecall() && hitPouch(ev) ? "pointer" : null,
      );
    },
    { capture: true },
  );
  const up = (ev) => {
    if (!drag || ev.pointerId !== pid) return;
    const o = drag;
    drag = null;
    pid = null;
    setCursor("grab");
    if (o.state === "pull") {
      o.state = "tray";
      return;
    } // 還沒抽出就放開：滑回袋子裡
    const tp = trayPos();
    if (o.screen.distanceTo(tp) < 70) {
      // 丟回貼布盒＝收回
      o.state = "return";
      o.t = 0;
      o.from.copy(o.screen);
      o.fromRot = o.rotZ;
      return;
    }
    // 貼上：記下在「網頁」上的位置（捲動時會跟著內容走）
    o.state = "stuck";
    o.doc.set(o.screen.x + scrollX, o.screen.y + scrollY);
    o.rotZ = (Math.random() - 0.5) * 0.5;
    o.squash = 0;
    o.glow = 0;
    makeClear(o);
    wave(o.screen.x, o.screen.y);
    stickCbs.forEach((cb) => cb(o.screen.x, o.screen.y));
  };
  addEventListener("pointerup", up, { capture: true });
  addEventListener("pointercancel", up, { capture: true });
  // 拖曳中不要選到網頁文字
  addEventListener(
    "selectstart",
    (ev) => {
      if (drag) ev.preventDefault();
    },
    { capture: true },
  );

  // ---------- 每格更新 ----------
  const ss = (v) => {
    v = Math.min(1, Math.max(0, v));
    return v * v * (3 - 2 * v);
  };
  // 略微衝過頭再回來的曲線（貼布盒彈出用）
  const outBack = (v) => {
    v = Math.min(1, Math.max(0, v));
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2);
  };
  const HOT = new THREE.Color("#c8fa6e").multiplyScalar(1.25),
    tmpC = new THREE.Color(); // 凸起發光色 #c8fa6e
  const clock = new THREE.Clock();
  let time = 0;
  function update(dt) {
    let busy = !!drag;
    // 包裝袋：出現時由小彈到原本大小，平常輕輕晃
    if (pouchReady) {
      if (trayShown && trayAppear < 1)
        trayAppear = Math.min(1, trayAppear + dt / 0.5);
      const tp = trayPos();
      pouchRig.visible = trayShown;
      pouchRig.position.set(tp.x, -tp.y, 5);
      const sway = reduce ? 0 : 1;
      // 姿勢同 01 動畫最後一幀（正立、不歪），只加輕微晃動
      pouchRig.rotation.set(
        0,
        Math.sin(time * 1.1) * 0.25 * sway,
        Math.sin(time * 1.6) * 0.03 * sway,
      );
      pouchRig.scale.setScalar(pouchPx * (reduce ? 1 : outBack(trayAppear)));
      // 召回的貼布全部回到袋子 → 袋子 Q 彈一下
      if (recallPending && !patches.some((o) => o.state === "return")) {
        recallPending = false;
        pouchBounce = 0;
        bounceCbs.forEach((cb) => cb());
      }
      if (pouchBounce < 1 && !reduce) {
        pouchBounce += dt;
        const w = Math.exp(-pouchBounce * 6) * Math.sin(pouchBounce * 24);
        pouchRig.scale.x *= 1 + w * 0.12;
        pouchRig.scale.y *= 1 - w * 0.1;
      }
      if (trayShown) busy = true;
    }
    for (const o of [...patches]) {
      const r = o.rig;
      if (o.state === "tray" || o.state === "pull") {
        // 在袋子裡：露出 peek，再加上抽出的距離；放開沒抽出時慢慢滑回去
        if (o.state === "tray") {
          o.pull += (0 - o.pull) * Math.min(1, dt * 12);
          o.pullTilt += (0 - o.pullTilt) * Math.min(1, dt * 12);
        }
        r.position.set(patchHome.x, patchHome.y + P.peek + o.pull, patchHome.z);
        const room = PULL_OUT - P.peek; // 還能再抽出的長度（貼布已全露出時為 0）
        r.rotation.set(0, 0, room > 0 ? o.pullTilt * (o.pull / room) : 0);
        o.screen.copy(trayPos());
        busy = true;
        continue; // 位置跟著袋子，不用畫面座標
      } else if (o.state === "drag") {
        // 拖曳時依速度傾斜，有被手抓著的感覺；剛抽出時由袋中大小長大
        r.rotation.set(vel.y * 0.35, vel.x * 0.35, o.rotZ - vel.x * 0.12);
        o.grow += dt;
        r.scale.setScalar(
          o.growFrom + (1.08 - o.growFrom) * outBack(Math.min(1, o.grow / 0.3)),
        );
        vel.multiplyScalar(0.9);
      } else if (o.state === "return") {
        o.t += dt;
        const k = ss(o.t / (o.flyTime || 0.35));
        o.screen.lerpVectors(o.from, trayPos(), k);
        r.rotation.set(0, 0, o.fromRot * (1 - k));
        r.scale.setScalar(1 + (pouchPx / scale - 1) * k); // 縮回袋中大小
        busy = true;
        if (k >= 1) {
          // 收回盒子
          scene.remove(r);
          patches.splice(patches.indexOf(o), 1);
          remaining++;
          refreshTray();
        }
      } else if (o.state === "stuck") {
        o.screen.set(o.doc.x - scrollX, o.doc.y - scrollY);
        o.squash += dt;
        const w = reduce
          ? 0
          : Math.exp(-o.squash * 5) * Math.sin(o.squash * 26);
        r.scale.set(
          1 + w * 0.1,
          1 - w * 0.08,
          Math.max(0.3, 1 - Math.exp(-o.squash * 9) * 0.7),
        );
        r.rotation.set(0, 0, o.rotZ);
        if (o.squash < 1.6) busy = true;
      }
      r.position.set(o.screen.x, -o.screen.y, o.z);
      // 貼上時凸起由下往上亮一次
      if (o.glow < 1.6) {
        o.glow += dt;
        busy = true;
        const g = Math.sin(Math.min(1, o.glow / 1.2) * Math.PI);
        o.patch.spots.forEach(([, y], i) => {
          const front = (o.glow / 1.2) * 1.3 - (y / o.patch.size.H + 0.5);
          tmpC
            .copy(o.patch.BUMP_BASE)
            .lerp(HOT, Math.max(0, Math.min(1, front * 4)) * g);
          o.patch.bumps.setColorAt(i, tmpC);
        });
        o.patch.bumps.instanceColor.needsUpdate = true;
      }
    }
    return busy;
  }
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    time += dt;
    const busy = update(dt);
    updateWaves();
    if (busy || dirty) {
      renderer.render(scene, camera);
      dirty = false;
    } // 沒有東西在動時不重畫，省電
  });

  // ---------- 對外功能 ----------
  const stickCbs = [];
  const bounceCbs = [];
  return {
    params: P,
    onStick(cb) {
      stickCbs.push(cb);
    },
    // 召回的貼布全部回到袋子、袋子彈一下時要做的事
    onTrayBounce(cb) {
      bounceCbs.push(cb);
    },
    // 只播一次光波（例如預覽樣式用）
    previewWave(x = innerWidth / 2, y = innerHeight / 2) {
      wave(x, y);
    },
    // 顯示／隱藏右下角的貼布盒（已經貼上的貼布不受影響）
    setTrayVisible(v) {
      trayShown = !!v;
      if (!trayShown) trayAppear = 0;
      refreshTray();
    },
    // 全部撕下來放回盒子
    peelAll() {
      for (const o of patches)
        if (o.state === "stuck") {
          o.state = "return";
          o.t = 0;
          o.from.copy(o.screen);
          o.fromRot = o.rotZ;
        }
    },
    // 程式直接貼一片到畫面上的 (x, y)，例如做引導動畫
    stickAt(x, y) {
      const o = patches.find((p) => p.state === "tray");
      if (!o) return;
      takeOut(o);
      o.rig.scale.setScalar(1);
      o.rig.rotation.set(0, 0, 0);
      remaining--;
      o.state = "stuck";
      o.z = ++topZ;
      o.screen.set(x, y);
      o.doc.set(x + scrollX, y + scrollY);
      o.rotZ = (Math.random() - 0.5) * 0.5;
      o.squash = 0;
      o.glow = 0;
      makeClear(o);
      wave(x, y);
      refreshTray();
    },
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
      waveLayer.remove();
      badge.remove();
    },
  };
}

/* =========================================================
   商店頁主視覺：青蛙細胞分裂＋原子融合（three.js r170，ES module）
   - 大細胞、小泡泡都是「加厚液態玻璃青蛙頭」（js/frogHeadGlass.js），本體透明、反射光用網站標準色
   - a 原子＝小青蛙泡泡包著青蛙貼布夾鏈袋（js/storePouch.js）
   - b 原子＝小青蛙泡泡包著不累不累丸膠囊（js/storeCapsule.js，外殼完整＋少量糖果）
   - 各 8 顆：8 → 4 → 2 → 1 兩兩融合（漸進加速），最後商品原子變大撐破細胞壁
   - 結尾：兩個商品入口淡入；點青蛙泡泡會彈一下，接著進到那個商品頁
   時間軸（秒）寫在 SHOTS；外觀參數寫在 P；畫面大小寫在 VW；都可以直接改
   用法：
     import { createStoreHero } from './storeHero.js';
     createStoreHero({ canvas, labels: { a: 貼布入口元素, b: 藥丸入口元素 }, textureUrl: 'img/store-pouch-texture.jpg' });
   ========================================================= */
import * as THREE from 'three';
import { createFrogHeadGlass, FROG_HEAD_PARAMS } from './frogHeadGlass.js';
import { createCapsuleKit } from './storeCapsule.js';
import { createPouchKit } from './storePouch.js';

export function createStoreHero(opts) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 可以調的參數 ----------
  // ---------- 畫面上的大小（用 vw：畫布寬度的百分比）----------
  const VW = {
    cell: 60,      // 分裂前大青蛙的寬
    after: 36,     // 分裂後每顆青蛙的寬
    gap: 8,        // 分裂後兩顆中間的空隙
    maxH: 0.85,    // 畫面太矮時：大青蛙最多佔畫面高度的幾成（超過就整體縮小）
  };
  const CELL_AFTER = 2.9;                                  // 分裂後細胞的寬（場景單位，裡面原子的排列是照這個調的）
  const WORLD_W = CELL_AFTER / (VW.after / 100);           // 畫布全寬＝幾個場景單位
  const P = {
    cellWidth: WORLD_W * VW.cell / 100,                    // 一開始大細胞的寬（＝60vw）
    cellAfter: CELL_AFTER,                                 // 分裂後每顆細胞的寬（＝36vw）
    cellFinalX: WORLD_W * (VW.after + VW.gap) / 2 / 100,   // 分裂後兩顆細胞停在 ±這個 x（中間空 8vw）
    stretch: 1.25,         // 分邊時大細胞往左右拉長幾倍
    float: 1,              // 原子飄動的幅度（0＝不飄）
    scatterSpread: 1.38,   // 開場原子散開的範圍（倍數；大細胞變大，散開範圍跟著大）
    pinch: 0.93,           // 縮腰最細時，中間剩幾成（1＝完全斷開）
    atomWidth: 0.6,        // 小泡泡的寬（融合前；原本 0.15，現在 4 倍）
    grow: 1.4,             // 每融合一次，泡泡放大幾倍
    burstSize: 1.5,        // 撐破時商品原子要長到多大（細胞寬的倍數）
    candy: [3, 4, 6, 8],   // 膠囊裡的糖果數：融合前 → 第 1、2、3 次融合後
    // 透明無色的玻璃（覆蓋 frogHeadGlass 的螢光綠）
    glass: { tint: '#ffffff', bodyA: 0.05, edgeA: 0.5, glow: 0, backDark: 0.95, diffuse: 0.2, env: 0.6,
             rimCol: '#ffffff', rimPow: 2.6, rimStr: 1.1, irid: 1, spec: 1.4, sway: 0,
             refl: 0.8, swirl: 0.9, swirlSpeed: 0.18,
             // 反射光、旋光用網站標準色（泡泡本體維持透明）：綠 → 桃紅 → 淡粉 → 藍 → 回到綠
             palette: ['#c8fa6e', '#ff5391', '#ffbad1', '#00daff'],
             paletteW: [1.2, 1.0, 0.35, 0.3] },   // 綠、粉為主，藍只出現一小段   // refl＝液態玻璃反射、swirl＝旋光、swirlSpeed＝旋光轉速
  };

  // 分鏡時間軸（秒）：跟分鏡圖一致
  const SHOTS = [
    ['01', '登場', 0.0, 1.0], ['02', '排成一列', 1.0, 2.4], ['03', '分邊＋拉長＋縮腰（同時）', 2.4, 4.0],
    ['05', '斷開', 4.0, 4.8], ['06', '漂開', 4.8, 5.8],
    // 融合漸進加速：8→4 慢、4→2 快一點、2→1 最快
    ['07', '融合 8 → 4', 5.8, 7.0], ['08', '融合 4 → 2', 7.0, 7.8], ['09', '融合 2 → 1', 7.8, 8.3],
    ['10', '商品入口', 8.3, 9.7], ['11', '撐破細胞壁', 9.7, 11.1],
  ];
  const T = Object.fromEntries(SHOTS.map(([n, , a, b]) => [n, [a, b]]));
  T['04'] = T['03'];                 // 拉長和縮腰同一段時間一起發生
  // 音效時間點（分鏡秒數）：名稱對應 storeSfx.js 裡的音效
  const mid = ([a, b]) => (a + b) / 2;
  const CUES = [
    ['appear', 0.02], ['line', T['02'][0]], ['stretch', T['03'][0]], ['split', T['05'][0]],
    ['merge1', mid(T['07'])], ['merge2', mid(T['08'])], ['merge3', mid(T['09'])],
    ['labels', T['10'][0]], ['burst', T['11'][0] + 0.8],
  ];
  const END = 11.1;                  // 分鏡秒數（實際播放會快 SPEED 倍）
  const SPEED = 2;                   // 整體播放速度：2 倍快（實際約 5.8 秒）

  // ---------- 小工具 ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, [a, b]) => clamp((t - a) / (b - a), 0, 1);              // 這一段的進度 0～1
  const eIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);   // ease-in-out
  const eOut = (u) => 1 - Math.pow(1 - u, 3);
  const eIn = (u) => u * u * u;
  const eBack = (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };   // 微微超過再回來
  const bounce = (dt, amp) => (dt < 0 || dt > 1.4 ? 0 : -amp * Math.sin(2 * Math.PI * 2.6 * dt) * Math.exp(-3.2 * dt)); // 壓扁→回彈
  function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

  // ---------- three.js ----------
  const canvas = opts.canvas;
  // 顏色照原本調好的樣子（不做色彩空間轉換，跟獨立預覽版的 r128 一樣）
  THREE.ColorManagement.enabled = false;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { if (opts.onError) opts.onError(e); return null; }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);                                  // 透明背景，用網站自己的背景
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, -0.2, 9.6);

  // ---------- 材料 ----------
  const capKit = createCapsuleKit(THREE);
  const pouchKit = createPouchKit(THREE, opts.textureUrl || 'img/store-pouch-texture.jpg');

  // 青蛙玻璃：建一次，其他用 clone（共用幾何和材質，比較省）
  function makeFrog(width, order) {
    const f = createFrogHeadGlass(THREE, Object.assign({}, P.glass, { width, renderOrder: order, segments: order < 5 ? [144, 100] : [72, 50] }));
    return f;
  }
  // 大細胞：後半顆先畫、前層最後畫，原子夾在中間
  function cellParts(f) {
    const inner = f.group.children[0];
    return { inner, back: inner.children[0], pearls: [inner.children[1], inner.children[2]], mouth: inner.children[3], front: inner.children[4] };
  }
  function setCellOrder(f) {
    const c = cellParts(f);
    c.back.renderOrder = 1; c.front.renderOrder = 200; c.mouth.renderOrder = 200.5;
  }

  // 主細胞（會拉長、縮腰）
  const main = makeFrog(P.cellWidth, 1); setCellOrder(main); scene.add(main.group);
  // 分裂後的兩顆
  const cellL = makeFrog(P.cellAfter, 1); setCellOrder(cellL); scene.add(cellL.group);
  const cellR = { group: cellL.group.clone() }; scene.add(cellR.group);

  // 主細胞變形用：記住原本的頂點
  const mp = cellParts(main);
  const headGeo = mp.back.geometry, mouthGeo = mp.mouth.geometry;
  const basePos = Float32Array.from(headGeo.attributes.position.array);
  const baseNrm = Float32Array.from(headGeo.attributes.normal.array);
  const mouthBase = Float32Array.from(mouthGeo.attributes.position.array);
  const pearlBase = mp.pearls.map((p) => p.position.clone());
  let lastDeform = '';
  // 往左右拉長 sx 倍、中間縮腰 pinch（0～1）：頂點和法線一起算（法線用變形的反轉置矩陣）
  function deformMain(sx, pinch) {
    const key = sx.toFixed(4) + '_' + pinch.toFixed(4);
    if (key === lastDeform) return; lastDeform = key;
    const YC = 0.12, SIG = 0.36 * sx;
    const map = (x, y, z, out) => {
      const X = x * sx, g = Math.exp(-(X / SIG) * (X / SIG)), s = 1 - pinch * g;
      out[0] = X; out[1] = YC + s * (y - YC); out[2] = s * z;
      return [s, pinch * g * 2 * X / (SIG * SIG)];       // s 和 ds/dX
    };
    const p = headGeo.attributes.position.array, n = headGeo.attributes.normal.array, o = [0, 0, 0];
    for (let i = 0; i < p.length; i += 3) {
      const x = basePos[i], y = basePos[i + 1], z = basePos[i + 2];
      const [s, ds] = map(x, y, z, o);
      p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2];
      const a = ds * sx * (y - YC), b = ds * sx * z;
      const nx = baseNrm[i], ny = baseNrm[i + 1], nz = baseNrm[i + 2], ss = Math.max(s, 0.05);
      let qx = nx / sx - (a * ny + b * nz) / (sx * ss), qy = ny / ss, qz = nz / ss;
      const l = Math.hypot(qx, qy, qz) || 1; n[i] = qx / l; n[i + 1] = qy / l; n[i + 2] = qz / l;
    }
    headGeo.attributes.position.needsUpdate = true; headGeo.attributes.normal.needsUpdate = true;
    headGeo.computeBoundingSphere();
    const m = mouthGeo.attributes.position.array;
    for (let i = 0; i < m.length; i += 3) { map(mouthBase[i], mouthBase[i + 1], mouthBase[i + 2], o); m[i] = o[0]; m[i + 1] = o[1]; m[i + 2] = o[2]; }
    mouthGeo.attributes.position.needsUpdate = true;
    mp.pearls.forEach((pe, k) => { const b0 = pearlBase[k]; map(b0.x, b0.y, b0.z, o); pe.position.set(o[0], o[1], o[2]); });
  }

  // 小泡泡（原子）：玻璃前層畫在內容物後面
  const atomProto = makeFrog(1, 10);
  // 膠囊裡的「04 靈感濃縮核」：萊姆綠液態玻璃青蛙頭（跟不累不累丸頁同一顆：寬 0.6×0.75，待在下殼中央）
  // 用 frogHeadGlass 的預設參數＝原本的螢光綠玻璃；畫順序排在下殼玻璃前面，才是隔著玻璃看到牠
  const coreProto = createFrogHeadGlass(THREE, { width: 0.45, renderOrder: 21, sway: 0, segments: [72, 50] });
  // 最後的大藥丸：青蛙核心放大、顏色加濃（跟上殼差不多綠，一眼就看得到）
  const CORE_BIG = { width: 0.6, tint: '#b6f04f', bodyA: 0.95, edgeA: 1, glow: 0.25, backDark: 0.95, diffuse: 0.45, env: 0.45, rimCol: '#eaffc0', rimStr: 1.1 };
  const coreBigProto = createFrogHeadGlass(THREE, Object.assign({ renderOrder: 21, sway: 0, segments: [96, 70] }, CORE_BIG));
  const _coreQ = new THREE.Quaternion(), _coreQ2 = new THREE.Quaternion(), _coreE = new THREE.Euler();
  { const c = cellParts(atomProto); c.back.renderOrder = 10; c.front.renderOrder = 60; c.mouth.renderOrder = 60.5; }
  function makeAtom(kind, level) {
    const g = new THREE.Group();
    const glass = atomProto.group.clone();
    g.add(glass);
    let content;
    if (kind === 'a') {
      content = pouchKit.make(); content.scale.setScalar(0.62);            // 袋子高 0.62（泡泡寬 1）
      content.rotation.set(0.05, -0.35, 0.12);
    } else {
      content = capKit.make(P.candy[level]); capKit.offsetOrder(content, 20);
      const big = level === 3;
      const core = (big ? coreBigProto : coreProto).group.clone(); core.position.set(0, -0.8, 0);
      core.userData.fwd = big ? 0.2 : 0.3;                 // 往鏡頭靠多少（大顆的核心比較大，靠少一點才不會穿出下殼）
      core.userData.y = -0.8;                              // 在下殼裡的高度
      content.add(core); content.userData.core = core;
      // 大藥丸：拿掉正好擋在青蛙核心正前方的那顆糖果（第 6 顆，位置在下殼前側）
      if (big) {
        const beads = content.children[1] ? content.children[1].children : [];
        const front = beads.find((b) => b.userData.home && Math.abs(b.userData.home.x - 0.11) < 0.01 && Math.abs(b.userData.home.z - 0.35) < 0.01);
        if (front) front.parent.remove(front);
      }
      content.scale.setScalar(0.27); content.rotation.set(0.25, 0.3, Math.PI / 2 - 0.35);   // 橫躺、微微斜
    }
    content.position.set(0, -0.03, 0.02);
    g.add(content);
    g.userData = { kind, level, content, spin: Math.random() * 6 };
    g.visible = false;
    scene.add(g);
    return g;
  }

  // 每一邊（a 在左、b 在右）的原子：8 + 4 + 2 + 1
  const SIDES = { a: { cell: cellL.group, dir: -1 }, b: { cell: cellR.group, dir: 1 } };
  const atoms = { a: [[], [], [], []], b: [[], [], [], []] };
  ['a', 'b'].forEach((k) => [8, 4, 2, 1].forEach((n, L) => { for (let i = 0; i < n; i++) atoms[k][L].push(makeAtom(k, L)); }));

  // ---------- 排列 ----------
  const W0 = P.atomWidth, WL = (L) => W0 * Math.pow(P.grow, L);
  // 各階段相對細胞中心的位置
  const LAYOUT = [
    (i) => [((i % 2) - 0.5) * 0.66, (1.5 - Math.floor(i / 2)) * 0.54 - 0.05],   // 8 顆：2 欄 × 4 排（同一排兩顆是一對）
    (i) => [((i % 2) - 0.5) * 0.92, (0.5 - Math.floor(i / 2)) * 0.82 - 0.05],   // 4 顆：2 × 2
    (i) => [(i - 0.5) * 1.22, -0.05],                                           // 2 顆：左右
    () => [0, 0],                                                        // 1 顆
  ];
  // 4×4 方陣的格子（小泡泡變大後，16 顆用方陣才放得下）
  const GX = 0.66, GY = 0.54;
  const grid = (c, r) => [(c - 1.5) * GX, (1.5 - r) * GY - 0.05];
  // 開場時散在細胞裡的位置（a、b 打亂混在一起，每格稍微歪一點）
  const scatter = { a: [], b: [] };
  { const r = rng(7), cells = [];
    for (let i = 0; i < 16; i++) cells.push(i);
    for (let i = 15; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    cells.forEach((g, i) => {
      const [x, y] = grid(g % 4, Math.floor(g / 4));
      const edge = (g % 4 === 0 || g % 4 === 3) && (g < 4 || g >= 12);           // 四個角往內收，才不會碰到細胞壁
      const sp = P.scatterSpread * (edge ? 0.86 : 1);
      scatter[i % 2 ? 'b' : 'a'].push([x * sp + (r() - 0.5) * 0.14, y * sp + (r() - 0.5) * 0.12]);
    }); }
  // 排隊分組：左兩欄是貼布、右兩欄是藥丸（同一排是一對）
  const lineUp = (k, i) => grid((k === 'a' ? 0 : 2) + (i % 2), Math.floor(i / 2));

  // ---------- 疊在畫面上的東西：商品入口（HTML，由頁面傳進來）----------
  const labels = opts.labels;

  // 撐破細胞壁的水珠
  const dropMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uA: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float F = pow(1.-max(dot(normalize(vN),normalize(vV)),0.),2.2); vec3 c = mix(vec3(0.92,0.96,1.),vec3(1.),F); gl_FragColor = vec4(c, (0.08+0.85*F)*uA); }',
  });
  const dropGeo = new THREE.SphereGeometry(1, 20, 14);
  const drops = [];
  ['a', 'b'].forEach((k) => {
    const r = rng(k === 'a' ? 3 : 9);
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat.clone()); m.renderOrder = 210; m.visible = false; scene.add(m);
      const ang = r() * Math.PI * 2, el = (r() - 0.5) * 1.2;
      m.userData = { side: k, dir: new THREE.Vector3(Math.cos(ang) * Math.cos(el), Math.sin(ang) * Math.cos(el) * 0.85, Math.sin(el)), size: 0.05 + r() * 0.09, speed: 1.6 + r() * 2 };
      drops.push(m);
    }
  });

  // ---------- 每一格：依時間 t 擺好所有東西 ----------
  let t = 0, playing = false, speed = 1, prevT = 0, lastNow = performance.now();
  const mouse = { x: 0, y: 0 };
  const clickBounce = { a: -9, b: -9 };   // 最後畫面：點青蛙泡泡的時間（秒），用來算彈一下
  const CLICK_AMP = 0.22;                 // 點一下彈的力道
  let hoverSide = null;

  function cellCenter(k, t) {
    // 分裂後兩顆細胞的位置：斷開時在原本兩半的位置，然後漂到最後的位置
    const half = P.cellWidth * P.stretch / 4 * 1.05;
    const u = eIO(seg(t, T['06']));
    return [SIDES[k].dir * lerp(half, P.cellFinalX, u), lerp(0, 0.05, u)];
  }

  function place(t, now) {
    // 鏡頭：分裂前大細胞比較大，鏡頭稍微往上；漂開時慢慢回到原位（留空間給下面的商品文字）
    camera.position.y = lerp(0.25, -0.2, eIO(seg(t, T['06'])));
    camera.updateMatrixWorld();
    const tSplit = T['05'][0];
    const split = t >= tSplit;
    // 開場彈出
    const pop = reduceMotion ? 1 : lerp(0.6, 1, eBack(seg(t, [0, 0.9])));
    // 主細胞：拉長、縮腰
    const sx = lerp(1, 1.05, eIO(seg(t, T['02']))) * lerp(1, P.stretch / 1.05, eIO(seg(t, T['03'])));
    const pinch = P.pinch * eIO(seg(t, T['04']));                       // 跟拉長同時、同樣的節奏
    main.group.visible = !split;
    if (!split) {
      deformMain(sx, pinch);
      main.group.scale.setScalar(pop);
      main.group.position.set(0, 0.05 * Math.sin(now * 1.1), 0);
    }
    // 分裂後的兩顆：斷開瞬間壓扁回彈，之後漂浮；撐破時消失
    const tBurst = T['11'][0] + 0.8;
    ['a', 'b'].forEach((k) => {
      const g = SIDES[k].cell;
      g.visible = split && t < tBurst;
      if (!g.visible) return;
      const [cx, cy] = cellCenter(k, t);
      let v = bounce((t - tSplit) / SPEED, 0.32);                                    // 回彈用真實秒數，不跟著加速
      const tLast = (T['09'][0] + T['09'][1]) / 2;                                    // 最後一次融合的瞬間
      if (t > tLast) v += bounce((t - tLast) / SPEED, 0.12);                           // 最後一次融合也震一下
      v += bounce(now - clickBounce[k], CLICK_AMP);                                     // 點一下：壓扁再彈
      // 撐破前：被裡面的原子頂到微微變大、抖動
      const press = seg(t, [T['11'][0], tBurst]);
      const swell = 1 + 0.1 * eIn(press) + 0.015 * Math.sin(now * 40) * press;
      g.position.set(cx, cy + 0.04 * Math.sin(now * 1.2 + (k === 'a' ? 0 : 1.6)), 0);
      g.scale.set(swell * (1 - v * 0.55), swell * (1 + v), swell * (1 - v * 0.55));
      // 結尾：轉頭看滑鼠
      const look = seg(t, T['10']);
      g.rotation.y = lerp(g.rotation.y, look * (mouse.x - g.position.x / 4) * 0.35, 0.08);
      g.rotation.x = lerp(g.rotation.x, look * -mouse.y * 0.18, 0.08);
    });

    // ---- 原子 ----
    ['a', 'b'].forEach((k) => {
      const lv = atoms[k];
      lv.forEach((arr) => arr.forEach((m) => (m.visible = false)));
      const mergeWin = [T['07'], T['08'], T['09']];
      // 目前在哪一層、這一層的進度
      let L = 0; mergeWin.forEach((w, i) => { if (t >= w[0] + (w[1] - w[0]) * 0.5) L = i + 1; });
      const center = split ? cellCenter(k, t) : [0, 0];
      const cellG = split ? SIDES[k].cell : main.group;
      // 細胞的左右／上下縮放（壓扁回彈時兩個不一樣）：原子的排列和原子本身都跟著一起壓扁，才不會擠出細胞壁
      const csx = split ? cellG.scale.x : pop, csy = split ? cellG.scale.y : pop;
      if (split && cellG.visible) { center[0] = cellG.position.x; center[1] = cellG.position.y; }

      if (!split) {
        // 01～04：主細胞裡（散開 → 排一列 → 左右分邊）
        lv[0].forEach((m, i) => {
          const s0 = scatter[k][i], l1 = lineUp(k, i), l2 = LAYOUT[0](i);
          const sideX = SIDES[k].dir * P.cellWidth * P.stretch / 4 * 1.05;
          const u1 = eIO(seg(t, T['02'])), u2 = eIO(seg(t, T['03']));
          let x = lerp(lerp(s0[0], l1[0], u1), sideX + l2[0], u2);
          let y = lerp(lerp(s0[1], l1[1], u1), l2[1], u2);
          // 開場：慢慢漂
          // 開場：各自在原位附近慢慢飄（排隊時漸漸收小）
          const fl = P.float * lerp(1, 0.25, u1), sp = m.userData.spin;
          x += fl * 0.09 * Math.sin(now * 0.55 + sp * 2.1); y += fl * 0.08 * Math.sin(now * 0.7 + sp * 1.7 + 1);
          // 縮腰：靠近中間的被擠一下
          // 縮腰：跟大細胞同一個變形（越靠近腰，上下越被擠扁），原子位置和原子本身一起壓
          const kS = P.cellWidth / (FROG_HEAD_PARAMS.headW / 100), yc = kS * 0.0588;
          const gx = x / kS / (0.36 * sx), sq = 1 - pinch * Math.exp(-gx * gx);
          y = yc + sq * (y - yc);
          m.position.set(x * pop, y * pop + main.group.position.y, (0.05 * Math.sin(i * 1.7) + fl * 0.12 * Math.sin(now * 0.45 + sp * 1.3)) * sq);
          m.scale.set(W0 * pop, W0 * pop * sq, W0 * pop * sq);
          m.visible = true;
        });
      } else {
        // 05～11：各自的細胞裡；融合
        const w = mergeWin[Math.min(L, 2)];
        const inMerge = L < 3 && t >= mergeWin[L][0];
        if (inMerge) {
          // 這一層兩兩靠近（前半段）
          const u = seg(t, [mergeWin[L][0], mergeWin[L][0] + (mergeWin[L][1] - mergeWin[L][0]) * 0.5]);
          lv[L].forEach((m, i) => {
            const p = LAYOUT[L](i), q = LAYOUT[L](i ^ 1), mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
            const e = eIn(u);
            m.position.set(center[0] + lerp(p[0], mid[0], e) * csx, center[1] + lerp(p[1], mid[1], e) * csy, 0);
            const ws = WL(L) * lerp(1, 0.92, e);
            m.scale.set(ws * csx, ws * csy, ws * csx);
            m.visible = true;
          });
        } else {
          // 剛合成的這一層：從兩顆的中點冒出來（微微超過再回來），再移到自己的位置
          const born = L > 0 ? mergeWin[L - 1][0] + (mergeWin[L - 1][1] - mergeWin[L - 1][0]) * 0.5 : -1;
          const u = L > 0 ? seg(t, [born, born + (mergeWin[L - 1][1] - mergeWin[L - 1][0]) * 0.45]) : 1;   // 冒出來的速度跟著這次融合的速度
          lv[L].forEach((m, j) => {
            const tgt = LAYOUT[L](j);
            let from = tgt;
            if (L > 0) { const a = LAYOUT[L - 1](2 * j), b = LAYOUT[L - 1](2 * j + 1); from = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
            const e = eIO(u);
            let s = WL(L) * lerp(0.75, 1, eBack(u));
            // 11：商品原子變大撐破細胞壁
            if (L === 3) {
              const g = eIO(seg(t, [T['11'][0], tBurst]));
              s = lerp(s, P.cellAfter * P.burstSize * 0.62, g);
              s *= 1 + bounce((t - tBurst) / SPEED, 0.18);
            }
            m.position.set(center[0] + lerp(from[0], tgt[0], e) * csx, center[1] + lerp(from[1], tgt[1], e) * csy, 0);
            if (t > tBurst) {
              // 撐破後只剩商品泡泡：點一下就上下壓扁再彈回來（果凍感）
              const cb = L === 3 ? bounce(now - clickBounce[k], CLICK_AMP) : 0;
              m.scale.set(s * (1 - cb * 0.55), s * (1 + cb), s * (1 - cb * 0.55));
            } else m.scale.set(s * csx, s * csy, s * csx);
            m.visible = true;
          });
        }
      }
      // 小泡泡裡的貼布／膠囊慢慢轉
      // 每顆輕輕自轉（整顆泡泡微微擺頭＋裡面的貼布／膠囊慢慢轉）；分裂後幅度小一點
      const famp = P.float * (split ? 0.35 : lerp(1, 0.35, eIO(seg(t, T['02']))));
      lv.forEach((arr) => arr.forEach((m) => {
        if (!m.visible) return;
        const sp = m.userData.spin, c = m.userData.content;
        m.rotation.set(famp * 0.12 * Math.sin(now * 0.5 + sp), famp * 0.3 * Math.sin(now * 0.4 + sp * 1.3), famp * 0.16 * Math.sin(now * 0.6 + sp * 0.7));
        c.rotation.y = (m.userData.kind === 'a' ? -0.35 : 0.3) + 0.35 * Math.sin(now * 0.7 + sp);
        // 膠囊裡的青蛙核心：臉一直朝向鏡頭，輕輕左右擺頭（跟不累不累丸頁一樣）
        if (c.userData.core) {
          m.updateMatrixWorld(true);
          c.getWorldQuaternion(_coreQ).invert();
          _coreQ2.setFromEuler(_coreE.set(0, Math.sin(now * 2 + sp) * 0.35, Math.sin(now * 1.6 + sp) * 0.08));
          c.userData.core.quaternion.copy(_coreQ).multiply(_coreQ2);
          // 往鏡頭方向靠一點（還在下殼玻璃裡），才不會被斜躺的膠囊裡的糖果擋住
          c.userData.core.position.set(0, 0, c.userData.core.userData.fwd).applyQuaternion(_coreQ);
          c.userData.core.position.y += c.userData.core.userData.y;
        }
        if (split) { m.position.x += famp * 0.03 * Math.sin(now * 0.8 + sp * 2); m.position.y += famp * 0.03 * Math.sin(now * 0.9 + sp); }
      }));
    });

    // ---- 撐破的水珠 ----
    const bt = t - tBurst;
    drops.forEach((d) => {
      d.visible = bt >= 0 && bt < 1.1;
      if (!d.visible) return;
      const [cx, cy] = cellCenter(d.userData.side, t), R = P.cellAfter * 0.55;
      const dist = R + d.userData.speed * eOut(clamp(bt / 1.1, 0, 1)) * 0.9;
      d.position.set(cx + d.userData.dir.x * dist, cy + d.userData.dir.y * dist - 0.6 * bt * bt, d.userData.dir.z * dist);
      d.scale.setScalar(d.userData.size * (1 - 0.4 * bt));
      d.material.uniforms.uA.value = 1 - clamp(bt / 1.1, 0, 1);
    });

    // ---- 閃光 ----
    // （閃白光已拿掉）

    // ---- 商品入口（10 開始淡入，之後一直在）----
    const lab = eOut(seg(t, [T['10'][0], T['10'][0] + 0.7]));
    ['a', 'b'].forEach((k) => {
      const el = labels[k];
      el.style.opacity = lab;
      el.style.pointerEvents = lab > 0.9 ? 'auto' : 'none';
      const [cx] = cellCenter(k, t);
      const v = new THREE.Vector3(cx, -P.cellAfter * 0.5, 0).project(camera);
      el.style.left = `${(v.x + 1) / 2 * 100}%`;
      el.style.top = `${(1 - v.y) / 2 * 100}%`;
      el.style.transform = `translate(-50%, ${lerp(16, 0, lab)}px)`;
    });

    prevT = t;
  }

  // ---------- 畫面大小 ----------
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 直式畫面時鏡頭拉遠，左右兩顆才放得下
    // 寬度照 vw：畫布全寬剛好是 WORLD_W；畫面太矮時改用高度決定（大青蛙最多佔 VW.maxH 的高度）
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const zW = WORLD_W / (2 * tanH * camera.aspect);
    const cellH = P.cellWidth * (FROG_HEAD_PARAMS.headH / 2 + FROG_HEAD_PARAMS.eyeY + FROG_HEAD_PARAMS.bumpR) / FROG_HEAD_PARAMS.headW;
    const zH = cellH / VW.maxH / (2 * tanH);
    camera.position.z = Math.max(zW, zH);
    camera.updateProjectionMatrix();
    capKit.syncOutlines(renderer);
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  // ---------- 互動：滑鼠看、移到球上 Q 彈 ----------
  // 滑鼠／手指在哪一顆青蛙泡泡上（用畫布的位置算，放進網站裡也準）
  function sideAt(clientX, clientY) {
    if (t < T['10'][0]) return null;
    const rect = canvas.getBoundingClientRect();
    let over = null;
    ['a', 'b'].forEach((k) => {
      const [cx, cy] = cellCenter(k, t), v = new THREE.Vector3(cx, cy, 0).project(camera);
      const px = rect.left + (v.x + 1) / 2 * rect.width, py = rect.top + (1 - v.y) / 2 * rect.height;
      const R = Math.max(P.cellAfter, P.cellAfter * P.burstSize * 0.62) / 2 * 0.9;
      const r = new THREE.Vector3(cx + R, cy, 0).project(camera);
      if (Math.hypot(clientX - px, clientY - py) < Math.abs((r.x - v.x) / 2 * rect.width)) over = k;
    });
    return over;
  }
  addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1); mouse.y = clamp(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    hoverSide = sideAt(e.clientX, e.clientY);
    canvas.style.cursor = hoverSide ? 'pointer' : '';
  });
  // 點青蛙泡泡：彈一下，然後由 store.js 帶到那個商品頁（左＝貼布、右＝藥丸）
  canvas.addEventListener('pointerdown', (e) => {
    const k = sideAt(e.clientX, e.clientY);
    if (k) { clickBounce[k] = performance.now() / 1000; if (opts.onBubble) opts.onBubble(k); }
  });

  // ---------- 動畫迴圈（畫面外就停）----------
  // 第一次出現在畫面上才開始播（只播一次）；減少動態時直接停在結尾
  let visible = false, started = false;
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible && !started) { started = true; playing = !reduceMotion; lastNow = performance.now(); }
  }, { threshold: 0.3 }).observe(canvas);
  if (reduceMotion) t = END;
  function frame() {
    requestAnimationFrame(frame);
    const nowMs = performance.now(), dt = Math.min((nowMs - lastNow) / 1000, 1 / 20); lastNow = nowMs;
    if (!visible) return;
    const tBefore = t;
    if (playing) { t = Math.min(END, t + dt * speed * SPEED); if (t >= END) playing = false; }
    // 音效時間點：這一格剛好跨過哪個分鏡點，就通知外面播對應的聲音
    if (opts.onCue && t > tBefore) CUES.forEach(([name, at]) => { if (tBefore < at && at <= t) opts.onCue(name); });
    const now = nowMs / 1000;
    capKit.update(now);
    [main, cellL, atomProto].forEach((f) => f.update(now));                       // 旋光隨時間轉（sway 是 0，不會擺頭）
    place(t, now);
    renderer.render(scene, camera);
  }
  frame();
  return {
    replay() { t = 0; prevT = 0; playing = true; started = true; },   // 從頭再播一次
    seek(s) { t = s; prevT = s; playing = false; },                    // 跳到某一秒（分鏡秒數，檢查用）
    P, SHOTS,
  };
}

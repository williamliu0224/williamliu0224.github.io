// ===== 四層貼布：分解＋五大程序特效模組 =====
// 由 docs/frog-3d/reference/layers-scroll-fx-transparent.html 拆出，拿掉所有 UI 與 3D 層名標籤。
// 五大程序：1 深層吸收 → 2 疼痛搜集 → 3 射線轉換 → 4 能量匯集 → 5 定向發射
//
// 使用方式（頁面需先用 importmap 指定 three 的路徑）：
//   import { createLayersFx } from './js/layersFx.js';
//   const fx = createLayersFx(document.getElementById('容器'));
//   fx.setProgress(p);      // 直接指定進度 0~1（0＝組合、1＝光柱射出）
//   fx.play(speed);         // 從目前進度自動播到 1，回傳 Promise（播完時完成）
//   fx.setFinale(true);     // 最終狀態：五種特效同時持續循環
//   fx.focus(n);            // 鏡頭推近第 n 區（1~5，0＝回到全景），其他區淡到 30%
//   fx.onStage((n) => {});  // 進入每個程序時呼叫，n：0＝分解、1~5＝五大程序
//   fx.dispose();           // 移除畫布並釋放資源

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeFourLayerPatch } from './patch.js';

// ---------- 時間軸（故事時間，秒，取自說明檔「規格二」）----------
const S = {
  explode: [0, 1.2],
  absorb: [1.2, 3.4],
  collect: [3.0, 5.6],
  convert: [5.3, 7.4],
  gather: [7.1, 8.9],
  emit: [8.6, 10.8],
  close: [11.2, 12.4],
  scrollEnd: 10.2, // 捲到底停在光柱射出的畫面（進度 p × 10.2）
};
// 各程序開始時的進度 p：0 分解、1 深層吸收、2 疼痛搜集、3 射線轉換、4 能量匯集、5 定向發射
const STAGE_START = [0, 0.12, 0.29, 0.52, 0.7, 0.84];
const GAP = 0.045; // 分解後各層間距

// ---------- 小工具 ----------
const ss = (v) => { v = Math.min(1, Math.max(0, v)); return v * v * (3 - 2 * v); };
const span = (t, [a, b]) => (t - a) / (b - a); // 0~1
const env = (t, [a, b], fin = 0.35, fout = 0.4) => ss((t - a) / fin) * (1 - ss((t - (b - fout)) / fout)); // 淡入淡出包絡
// 背景改白色後物件太淡，整體加深：線條、分子、能量光束的顏色（原本 #5fd8f0 / #ffffff / #d2f981 / #eefbd2）
const CYAN = '#1fb2d8', WHITE = '#8ad8ec', LIME = '#a6dc3c', PALE = '#d2ef9a';
// 貼布各層加深：顏色（白層改成淡灰藍、綠層更綠、電路層帶藍）與不透明度
const DEEPEN = {
  whiteColor: '#d3dee5', greenColor: '#a3dc3e', blueTint: '#bfe3f2',
  opacity: { white: 0.8, green: 0.72, bump: 0.95, blue: 0.92 },
};

export function createLayersFx(container, options = {}) {
  const P = { mouseTilt: true, ...options }; // mouseTilt：滑鼠移動時貼布微微傾斜
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const disposables = []; // 需要釋放的貼圖

  // ---------- 基本場景（畫布透明，讓網站背景透出）----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene(); // 不設定 scene.background
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.9;
  const key = new THREE.DirectionalLight('#ffffff', 1.5);
  key.position.set(0.2, 1, 0.4);
  scene.add(key);
  scene.add(new THREE.HemisphereLight('#ffffff', '#f3b3c8', 0.5));

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);

  // 四層貼布（透明背景模式），平躺、正面朝上
  const patch = makeFourLayerPatch(THREE, RoundedBoxGeometry, { transparentBackground: true });
  const holder = new THREE.Group();
  patch.group.rotation.set(-Math.PI / 2, 0, 0);
  holder.add(patch.group);
  scene.add(holder);
  const Lyr = patch.layers;

  // 白色外層與底層原本共用材質，底層另外複製一份，才能分別淡化
  const whiteBottom = patch.materials.white.clone();
  Lyr.w2.children[0].material = whiteBottom;
  // 各層材質的原始不透明度（淡化時以此為基準）
  const BASE_OPACITY = { ...DEEPEN.opacity };
  patch.materials.white.color.set(DEEPEN.whiteColor);
  whiteBottom.color.set(DEEPEN.whiteColor);
  patch.materials.green.color.set(DEEPEN.greenColor);
  patch.materials.blue.color.set(DEEPEN.blueTint);

  // ---------- 鏡頭推近設定 ----------
  const FOCUS = {
    widthRatio: 0.75, // 放大後該區域寬度佔畫面寬度的比例（75vw）
    duration: 0.6,    // 推近／拉遠時間（秒）
    dimTo: 0.3,       // 其他區域淡化到的不透明度
  };

  // 全景鏡頭位置與注視點（窄畫面時鏡頭拉遠）
  const homePos = new THREE.Vector3(), homeLook = new THREE.Vector3(0, 0.01, 0);
  // 目前鏡頭位置與注視點（推近時平滑移動）
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(0, 0.01, 0);

  // 依容器尺寸更新畫布與鏡頭
  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    const narrow = camera.aspect < 0.9, d = narrow ? 0.9 : 0.62;
    homePos.set(0, d * 0.55, d * 0.84);
    if (focusN === 0 && focusK >= 1) { camPos.copy(homePos); camLook.copy(homeLook); }
    camera.position.copy(camPos.lengthSq() ? camPos : homePos);
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
  }

  // ---------- 共用：會流動的發光管線材質 ----------
  function flowMat(a, b, speed = 1, band = 0.65, bands = 3) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uGrow: { value: 0 }, uOpacity: { value: 0 }, uSpeed: { value: speed },
        uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uI: { value: band }, uN: { value: bands } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform float uTime,uGrow,uOpacity,uSpeed,uI,uN; uniform vec3 uA,uB; varying vec2 vUv;
        void main(){
          float s = vUv.x; if (s > uGrow) discard;
          float f = fract(s * uN - uTime * uSpeed);
          float band = smoothstep(.35, .5, f) * (1. - smoothstep(.5, .65, f));
          vec3 col = mix(mix(uA, uB, s), vec3(1.), band * uI);
          gl_FragColor = vec4(col, uOpacity);
          #include <colorspace_fragment>
        }`,
    });
  }
  const flat = (hex) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, depthWrite: false });
  // 用 canvas 畫小圖當貼圖
  function spriteTex(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    disposables.push(t);
    return t;
  }

  // ---------- 1 深層吸收：下方 9 條線匯入白色底層 ----------
  const absorb = new THREE.Group();
  Lyr.w2.add(absorb); // 跟著白色底層移動（局部座標 -Z＝往下）
  const arrows = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const ex = Math.cos(a) * 0.03 + (i % 3 - 1) * 0.012, ey = Math.sin(a) * 0.05;
    const sx = Math.cos(a) * 0.15, sy = Math.sin(a) * 0.12;
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(sx, sy, -0.2), new THREE.Vector3(sx * 0.9, sy * 0.9, -0.09),
      new THREE.Vector3(ex, ey, -0.07), new THREE.Vector3(ex, ey, -0.006));
    const mat = flowMat(CYAN, WHITE, 0.9, 0.65, 2.5);
    absorb.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.0016, 8), mat)); // 只用線，不加箭頭
    arrows.push({ mat, delay: (i % 4) * 0.12 });
  }

  // ---------- 2 疼痛搜集：F 粒子 ----------
  const fTex = spriteTex((x) => {
    x.fillStyle = '#ffffff'; x.strokeStyle = CYAN; x.lineWidth = 8;
    x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = CYAN; x.font = '500 70px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('F', 64, 68);
  });
  const collect = new THREE.Group();
  patch.group.add(collect);
  const particles = [];
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // 固定亂數種子
  for (let i = 0; i < 26; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fTex, transparent: true, depthWrite: false }));
    sp.scale.setScalar(0.013);
    const g = new THREE.Group();
    g.add(sp);
    collect.add(g);
    particles.push({ g, x: (rnd() - 0.5) * 0.13, y: (rnd() - 0.5) * 0.15, ph: rnd() * 6.28, d: rnd() * 0.5 });
  }

  // ---------- 3 射線轉換：兩組分子＋中間電光 ----------
  const convert = new THREE.Group();
  patch.group.add(convert);
  const OUTLINE = new THREE.MeshBasicMaterial({ color: CYAN, side: THREE.BackSide });
  function molecule(colors) {
    const m = new THREE.Group();
    const pts = [new THREE.Vector3(-0.011, 0, 0), new THREE.Vector3(0, 0.008, 0.004), new THREE.Vector3(0.011, -0.002, 0)];
    for (let i = 0; i < 2; i++) {
      const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      const mid = a.clone().add(b).multiplyScalar(0.5);
      for (const [r, mat] of [[0.0021, OUTLINE], [0.0016, new THREE.MeshBasicMaterial({ color: '#ffffff' })]]) {
        const bond = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
        bond.position.copy(mid); bond.quaternion.copy(q); m.add(bond);
      }
    }
    pts.forEach((p, i) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0058, 28, 20), new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
      const line = new THREE.Mesh(new THREE.SphereGeometry(0.0058 * 1.14, 28, 20), OUTLINE);
      ball.position.copy(p); line.position.copy(p); m.add(ball, line);
    });
    m.userData.ends = pts;
    return m;
  }
  const molA = molecule([LIME, PALE, LIME]), molB = molecule([PALE, LIME, PALE]);
  molA.position.set(-0.058, 0.012, 0); molB.position.set(0.058, -0.008, 0);
  molA.scale.setScalar(1.7); molB.scale.setScalar(1.7);
  convert.add(molA, molB);
  // 分子用到的材質改成可半透明，淡化時使用
  const molMats = new Set();
  [molA, molB].forEach((m) => m.traverse((o) => { if (o.material) molMats.add(o.material); }));
  molMats.forEach((mat) => { mat.transparent = true; });
  const boltMat = flat(CYAN);
  let bolt = null, boltTimer = -1;
  // 重新產生一道隨機折線的閃電
  function rebuildBolt() {
    if (bolt) { convert.remove(bolt); bolt.geometry.dispose(); }
    const a = molA.localToWorld(molA.userData.ends[2].clone()), b = molB.localToWorld(molB.userData.ends[0].clone());
    convert.worldToLocal(a); convert.worldToLocal(b);
    const pts = [a];
    const n = 13, side = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3(0, 0, 1)).normalize();
    for (let i = 1; i < n; i++) {
      const p = a.clone().lerp(b, i / n);
      p.addScaledVector(side, (i % 2 ? 1 : -1) * (0.006 + Math.random() * 0.008));
      p.z += (Math.random() - 0.5) * 0.004;
      pts.push(p);
    }
    pts.push(b);
    bolt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05), 90, 0.0009, 6), boltMat);
    convert.add(bolt);
  }

  // ---------- 5 定向發射：四條分岔線匯成光柱 ----------
  const emit = new THREE.Group();
  Lyr.w1.add(emit); // 跟著白色外層（局部 +Z＝往上）
  const branches = [];
  [[-0.042, -0.03], [-0.018, 0.035], [0.018, -0.035], [0.042, 0.03]].forEach(([x, y]) => {
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(x, y, 0.003), new THREE.Vector3(x, y, 0.035),
      new THREE.Vector3(x * 0.15, y * 0.15, 0.03), new THREE.Vector3(0, 0, 0.055));
    const mat = flowMat(WHITE, CYAN, 1.3, 0.6, 2);
    emit.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 50, 0.0016, 8), mat));
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.0024, 14, 10), flat(WHITE));
    foot.position.set(x, y, 0.003);
    emit.add(foot);
    branches.push({ mat, foot });
  });
  const beamCurve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0.055), new THREE.Vector3(0, 0, 0.36));
  const beamMat = flowMat(CYAN, WHITE, 2.2, 0.6, 4);
  emit.add(new THREE.Mesh(new THREE.TubeGeometry(beamCurve, 80, 0.0026, 12), beamMat));
  const beamCore = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 20, 14), flat(CYAN));
  beamCore.position.set(0, 0, 0.055);
  emit.add(beamCore);

  // ---------- 依故事時間 t 更新整個場景（clock＝持續流動用的時間）----------
  const tmpC = new THREE.Color(), HOT = new THREE.Color('#fbffe8');
  // fk：最終全特效的程度（0＝一般、1＝五種特效全部顯示），淡入用
  // dim：五個區域各自的不透明度倍率（推近某區時其他區淡化）
  function apply(t, clock, fk = 0, dim = [1, 1, 1, 1, 1, 1]) {
    // 各層材質依區域淡化：1 底層、3 藍層、4 綠層與凸點、5 外層
    whiteBottom.opacity = BASE_OPACITY.white * dim[1];
    patch.materials.blue.opacity = BASE_OPACITY.blue * dim[3];
    patch.materials.green.opacity = BASE_OPACITY.green * dim[4];
    patch.materials.bump.opacity = BASE_OPACITY.bump * dim[4];
    patch.materials.white.opacity = BASE_OPACITY.white * dim[5];
    molMats.forEach((mat) => { mat.opacity = dim[3]; });

    // 分解／收合
    const e = ss(span(t, S.explode)) * (1 - ss(span(t, S.close)));
    patch.setExplode(e, GAP);
    ['w1', 'g', 'b', 'w2'].forEach((k, i) => { Lyr[k].position.z += Math.sin(clock * 1.3 + i * 0.9) * 0.0022 * e; }); // 各層輕微浮動

    // 1 深層吸收
    const ka = Math.max(env(t, S.absorb, 0.2, 0.5), fk), ga = span(t, S.absorb);
    arrows.forEach((ar) => {
      ar.mat.uniforms.uGrow.value = Math.max(ss((ga - ar.delay) / 0.4), fk);
      ar.mat.uniforms.uOpacity.value = ka * dim[1];
      ar.mat.uniforms.uTime.value = clock;
    });
    absorb.visible = ka > 0.001;

    // 2 疼痛搜集：從底層升起 → 在兩層間漂浮 → 聚到中心 → 被藍層吸收
    const kc = span(t, S.collect), zW2 = Lyr.w2.position.z, zB = Lyr.b.position.z;
    collect.visible = (kc > 0 && kc < 1) || fk > 0;
    particles.forEach((p) => {
      // 收束（聚到中心）與消失加速 2 倍：時間長度與粒子之間的錯開都減半
      let rise = ss((kc - p.d * 0.25) / 0.25),
        gath = ss((kc - 0.55 - p.d * 0.05) / 0.125),
        gone = ss((kc - 0.665 - p.d * 0.04) / 0.07);
      if (fk > 0) { rise = 1; gath = 0; gone = 1 - fk; } // 最終狀態：粒子停在兩層之間持續漂浮
      const wx = Math.sin(clock * 1.7 + p.ph) * 0.004, wy = Math.cos(clock * 1.3 + p.ph * 1.3) * 0.004;
      const midZ = zW2 + (zB - zW2) * (0.35 + 0.25 * Math.sin(p.ph));
      const x = (p.x + wx) * (1 - gath), y = (p.y + wy) * (1 - gath);
      const z = THREE.MathUtils.lerp(zW2, midZ, rise) + (zB - midZ) * gath;
      p.g.position.set(x, y, z);
      p.g.scale.setScalar(Math.max(0.001, rise * (1 - gone)));
      p.g.children[0].material.opacity = dim[2] * (1 - gone); // 消失時同時淡出
    });

    // 3 射線轉換：分子各自自轉，整組繞貼布法線公轉，中間閃電
    const kv = Math.max(env(t, S.convert, 0.4, 0.45), fk);
    convert.visible = kv > 0.001;
    convert.position.z = (zB + Lyr.g.position.z) / 2;
    convert.scale.setScalar(Math.max(0.001, ss(kv * 1.4)));
    molA.rotation.set(clock * 0.9, clock * 0.6, 0);
    molB.rotation.set(-clock * 0.7, clock * 0.8, 0.5);
    convert.rotation.z = clock * 0.9;
    if (convert.visible && (bolt === null || clock - boltTimer > 0.16)) { boltTimer = clock; rebuildBolt(); }
    const boltOn = (span(t, S.convert) > 0.2 && span(t, S.convert) < 0.92) || fk > 0.5;
    boltMat.opacity = boltOn ? kv * dim[3] : 0;

    // 4 能量匯集：綠層凸起由下往上依序變亮
    const kg = span(t, S.gather), fade = 1 - ss((t - (S.gather[1] - 0.4)) / 0.6);
    const H = patch.size.H;
    patch.spots.forEach(([, y], i) => {
      const yn = (y + H / 2) / H;               // 0＝下緣、1＝上緣
      const front = kg * 1.25 - yn;             // 亮起的波前
      let k = kg > 0 ? ss(front * 4) * fade : 0;
      // 最終狀態：亮光由下往上一波波循環
      if (fk > 0) k = Math.max(k, fk * (0.55 + 0.45 * Math.sin(clock * 3 - yn * 6)));
      tmpC.copy(patch.BUMP_BASE).lerp(HOT, k);
      patch.bumps.setColorAt(i, tmpC);
    });
    patch.bumps.instanceColor.needsUpdate = true;

    // 5 定向發射：分岔線匯到中心，往上射出光柱
    const ke = Math.max(env(t, S.emit, 0.25, 0.6), fk), ge = span(t, S.emit);
    emit.visible = ke > 0.001;
    branches.forEach((b, i) => {
      b.mat.uniforms.uGrow.value = Math.max(ss((ge - i * 0.05) / 0.35), fk);
      b.mat.uniforms.uOpacity.value = ke * dim[5];
      b.mat.uniforms.uTime.value = clock;
      b.foot.material.opacity = ke * dim[5];
    });
    const gb = Math.max(ss((ge - 0.35) / 0.3), fk);
    beamMat.uniforms.uGrow.value = gb; beamMat.uniforms.uOpacity.value = ke * dim[5]; beamMat.uniforms.uTime.value = clock;
    beamCore.visible = gb > 0.01;
    beamCore.material.opacity = ke * dim[5];
    beamCore.scale.setScalar(1 + Math.sin(clock * 6) * 0.08);
  }

  // ---------- 進度與程序 ----------
  let progress = 0;
  let stage = 0;
  const stageCallbacks = [];

  // 依進度算出目前程序編號
  function stageAt(p) {
    let n = 0;
    STAGE_START.forEach((start, i) => { if (p >= start) n = i; });
    return n;
  }

  // 依目前進度檢查程序，改變時通知
  function updateStage() {
    const n = stageAt(progress);
    if (n !== stage) {
      stage = n;
      stageCallbacks.forEach((cb) => cb(stage));
    }
  }

  // 直接指定進度 0~1（會停止自動播放）
  function setProgress(p) {
    playing = false;
    progress = Math.min(1, Math.max(0, p));
    updateStage();
  }

  // ---------- 自動播放 ----------
  let playing = false;
  let playSpeed = 1;
  let playResolve = null;

  // 從目前進度自動播到 1（speed＝播放倍速），播完時 Promise 完成
  function play(speed = 1) {
    playSpeed = speed;
    playing = true;
    return new Promise((resolve) => { playResolve = resolve; });
  }

  // ---------- 最終全特效 ----------
  let finale = false; // 是否進入最終狀態
  let finaleK = 0;    // 0~1，進入最終狀態時慢慢淡入
  function setFinale(on) { finale = !!on; }

  // ---------- 鏡頭推近某區 ----------
  // 區域：1 底層＋吸收線、2 F 粒子、3 藍層＋分子閃電、4 綠層凸點、5 外層＋光柱
  let focusN = 0; // 目前推近的區域（0＝全景）
  let focusK = 1; // 推近／拉遠的過場進度 0~1
  const fromPos = new THREE.Vector3(), fromLook = new THREE.Vector3(); // 過場起點
  const dimNow = [1, 1, 1, 1, 1, 1]; // 各區目前的不透明度倍率（索引 1~5）

  // 推近第 n 區（0＝回到全景）
  function focus(n) {
    n = Math.max(0, Math.min(5, n | 0));
    if (n === focusN) return;
    focusN = n;
    fromPos.copy(camPos.lengthSq() ? camPos : homePos);
    fromLook.copy(camLook);
    focusK = reduceMotion ? 1 : 0;
  }

  // 第 n 區在貼布局部座標的中心高度（z，往上為正）
  function regionZ(n) {
    const z = (k) => Lyr[k].position.z;
    if (n === 1) return z('w2') - 0.02;            // 底層略往下，包含吸收線
    if (n === 2) return (z('w2') + z('b')) / 2;    // 底層與藍層之間
    if (n === 3) return (z('b') + z('g')) / 2;     // 藍層與綠層之間（分子）
    if (n === 4) return z('g');
    return z('w1') + 0.02;                         // 外層略往上，包含光柱底部
  }

  // 計算推近第 n 區時的鏡頭位置與注視點：該區寬度＝畫面寬度 × widthRatio
  const _c = new THREE.Vector3(), _v = new THREE.Vector3();
  const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function focusTarget(n, outPos, outLook) {
    const z = regionZ(n);
    patch.group.localToWorld(_c.set(0, 0, z));
    _dir.subVectors(homeLook, homePos).normalize(); // 維持全景時的視角方向
    _right.crossVectors(_dir, UP).normalize();
    // 貼布四個角投影到畫面水平方向，取得該區在畫面上的寬度
    const { W, H } = patch.size;
    let min = Infinity, max = -Infinity;
    for (const [x, y] of [[-W / 2, -H / 2], [W / 2, -H / 2], [-W / 2, H / 2], [W / 2, H / 2]]) {
      patch.group.localToWorld(_v.set(x, y, z));
      const s = _v.dot(_right);
      min = Math.min(min, s);
      max = Math.max(max, s);
    }
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = (max - min) / (FOCUS.widthRatio * 2 * tanHalf * camera.aspect);
    outLook.copy(_c);
    outPos.copy(_c).addScaledVector(_dir, -dist);
  }
  const _tp = new THREE.Vector3(), _tl = new THREE.Vector3();

  // 註冊程序改變的通知，註冊時會先回報一次目前程序
  function onStage(cb) {
    stageCallbacks.push(cb);
    cb(stage);
  }

  // ---------- 滑鼠微傾 ----------
  const mouse = new THREE.Vector2();
  function onPointerMove(ev) {
    mouse.set(ev.clientX / window.innerWidth - 0.5, ev.clientY / window.innerHeight - 0.5);
  }
  if (P.mouseTilt && !reduceMotion) window.addEventListener('pointermove', onPointerMove);

  // ---------- 畫面外暫停渲染 ----------
  const io = new IntersectionObserver((entries) => {
    const visible = entries[0].isIntersecting;
    renderer.setAnimationLoop(visible ? loop : null);
    if (visible) clk.getDelta(); // 回到畫面時重設計時，避免跳格
  });
  io.observe(container);

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();

  // ---------- 主迴圈 ----------
  const clk = new THREE.Clock();
  let clock = 0;
  function loop() {
    const dt = Math.min(clk.getDelta(), 0.05);
    if (!reduceMotion) clock += dt; // 減少動態：特效不流動

    // 自動播放：進度依時間前進（故事時間 scrollEnd 秒 ÷ 倍速）
    if (playing) {
      progress += (dt * playSpeed) / S.scrollEnd;
      if (progress >= 1) {
        progress = 1;
        playing = false;
        if (playResolve) { playResolve(); playResolve = null; }
      }
      updateStage();
    }

    // 最終全特效：約 0.8 秒淡入（減少動態時直接到位）
    const target = finale ? 1 : 0;
    finaleK = reduceMotion ? target : finaleK + Math.sign(target - finaleK) * Math.min(Math.abs(target - finaleK), dt / 0.8);

    // 推近時其他區淡化到 dimTo，選中的區與全景時維持 1
    for (let r = 1; r <= 5; r++) {
      const goal = focusN === 0 || r === focusN ? 1 : FOCUS.dimTo;
      const step = dt / FOCUS.duration;
      dimNow[r] = reduceMotion ? goal : dimNow[r] + Math.sign(goal - dimNow[r]) * Math.min(Math.abs(goal - dimNow[r]), step);
    }

    holder.rotation.set(0.1 + mouse.y * 0.12, -0.62 + mouse.x * 0.25 + Math.sin(clock * 0.35) * 0.05, 0.08);
    holder.updateMatrixWorld(true);
    apply(progress * S.scrollEnd, clock, ss(finaleK), dimNow);

    // 鏡頭：在全景與推近位置之間平滑移動（0.6 秒）
    if (focusK < 1) focusK = Math.min(1, focusK + dt / FOCUS.duration);
    if (focusN > 0) focusTarget(focusN, _tp, _tl);
    else { _tp.copy(homePos); _tl.copy(homeLook); }
    const e = ss(focusK);
    camPos.lerpVectors(fromPos, _tp, e);
    camLook.lerpVectors(fromLook, _tl, e);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(loop);

  // ---------- 釋放資源 ----------
  function dispose() {
    renderer.setAnimationLoop(null);
    io.disconnect();
    ro.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((mat) => mat.dispose());
      }
    });
    disposables.forEach((t) => t.dispose());
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    setProgress,
    play,
    setFinale,
    focus,
    onStage,
    dispose,
    get progress() { return progress; },
    get stage() { return stage; },
  };
}

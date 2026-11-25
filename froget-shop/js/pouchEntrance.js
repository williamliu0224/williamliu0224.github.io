// ===== 青蛙貼布夾鏈袋：登場動畫模組 =====
// 由 docs/frog-3d/reference/entrance-animation.html 拆出，拿掉所有調整面板與 UI。
// 流程：右下角飛入（翻轉 3 圈）→ 撕開易撕條、捲起彈掉 → 轉正 → 袋口張開 → 抽出四層貼布 → Q 彈
//
// 使用方式（頁面需先用 importmap 指定 three 的路徑）：
//   import { createPouchEntrance } from './js/pouchEntrance.js';
//   const pouch = createPouchEntrance(document.getElementById('容器'));
//   pouch.play();          // 播完整段
//   pouch.playFlyIn();     // 只播飛入段（0 → 1.7 秒）
//   pouch.seek(t);         // 跳到故事時間 t（秒），捲動驅動時使用
//   pouch.seekProgress(p); // 以進度 0~1 跳到對應時間
//   pouch.setPath({ from, via, to }); // 改變飛行路徑（容器內 -1~1 座標）
//   pouch.setUpright(k);   // 0~1：把飛入後的傾斜慢慢轉正
//   pouch.setSway(true);   // 開／關很慢的左右擺動
//   pouch.setTilt(x, y);   // 跟著滑鼠傾斜（弧度）
//   pouch.getScreenRect(); // 袋子在容器內的位置與大小（像素）
//   pouch.dispose();       // 移除畫布並釋放資源
// 動畫完全由「故事時間 t」計算，所以可以任意跳轉或倒著播。

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { makeFourLayerPatch } from "./patch.js";

// ---------- 定案參數（取自說明檔「規格一」）----------
const DEFAULTS = {
  modelUrl: "img/3d/frog_pouch.glb", // 模型路徑（相對於頁面）
  speed: 1.6, // 播放速度倍率（只影響 play，不影響 seek）
  fly: 1.7, // 飛入時間（秒）
  pause: 0, // 到中央後、撕開前的停頓
  tear: 1.0, // 撕開時間
  finale: 0.9, // 轉正＋開袋＋抽出
  spins: 3, // 飛入途中翻轉圈數
  fov: 75, // 透視視角
  elev: 0, // 俯視角度
  azim: 0, // 左右角度
  zoom: 1, // 袋子在畫面中的大小
  // 飛行路徑：容器內的位置，-1~1（x 向右、y 向上，0,0 為容器中心）
  from: [0.76, -0.5], // 起點（右下角）
  via: [0.84, 0.3], // 曲線控制點
  to: [0, 0], // 終點（中央）
  onComplete: null, // play 播完時呼叫
};

// ---------- 緩動函式 ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ss = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
const outCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const outBack = (x) => {
  x = clamp01(x);
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
const TILT = -0.42; // 停在中央時的傾斜角

export function createPouchEntrance(container, options = {}) {
  const P = { ...DEFAULTS, ...options };
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // ---------- 時間軸（由參數計算）----------
  const T = {};
  T.flyEnd = P.fly;
  T.tearStart = T.flyEnd + P.pause;
  T.tearEnd = T.tearStart + P.tear;
  T.dropEnd = T.tearEnd + 0.35; // 易撕條捲好後縮小彈掉
  T.uprightStart = T.tearEnd + 0.4;
  T.uprightEnd = T.uprightStart + 0.36 * P.finale;
  T.openStart = T.uprightStart + 0.27 * P.finale;
  T.openEnd = T.openStart + 0.36 * P.finale;
  T.patchStart = T.uprightStart + 0.55 * P.finale;
  T.patchEnd = T.patchStart + 0.45 * P.finale;
  T.total = Math.max(T.patchEnd, T.dropEnd) + 0.8; // 最後留 0.8 秒給 Q 彈

  // ---------- 場景（畫布透明，讓網站背景透出）----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene(); // 不設定 scene.background
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.6;
  const sun = new THREE.DirectionalLight("#fff", 1.8);
  sun.position.set(0.5, 1, 1.2);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight("#ffffff", "#bdbdbd", 0.5));

  // ---------- 鏡頭 ----------
  const camera = new THREE.PerspectiveCamera(30, 1, 0.005, 50);
  const AIM = new THREE.Vector3(0, -0.035, 0);
  const BASE_HALF = 0.95 * Math.tan(THREE.MathUtils.degToRad(15)); // 預設構圖的半高
  let width = 1,
    height = 1;

  // 依容器尺寸更新畫布與鏡頭
  function resize() {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height);
    camera.fov = P.fov;
    camera.aspect = width / height;
    // 改視角時自動推拉，袋子大小不變
    const dist =
      BASE_HALF / P.zoom / Math.tan(THREE.MathUtils.degToRad(P.fov / 2));
    const el = THREE.MathUtils.degToRad(P.elev),
      az = THREE.MathUtils.degToRad(P.azim);
    camera.position.set(
      AIM.x + dist * Math.sin(az) * Math.cos(el),
      AIM.y + dist * Math.sin(el),
      AIM.z + dist * Math.cos(az) * Math.cos(el),
    );
    camera.lookAt(AIM);
    camera.near = dist * 0.02;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    apply(t);
    needsRender = true;
  }

  // 把容器內的位置（-1~1）換成通過原點、面向鏡頭的平面上的 3D 點
  const _ray = new THREE.Raycaster(),
    _plane = new THREE.Plane();
  function screenToWorld(nx, ny) {
    const n = new THREE.Vector3();
    camera.getWorldDirection(n);
    _plane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3());
    _ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const out = new THREE.Vector3();
    return _ray.ray.intersectPlane(_plane, out) || out;
  }

  // ---------- 易撕條（程式產生，可捲曲）----------
  const M = {
    strip: new THREE.MeshStandardMaterial({
      roughness: 0.32,
      side: THREE.FrontSide,
    }),
    stripB: new THREE.MeshStandardMaterial({
      roughness: 0.32,
      side: THREE.BackSide,
    }),
  };
  const rig = new THREE.Group(); // 整個袋子的控制點
  scene.add(rig);
  let morphMeshes = [],
    patch = null,
    patch0 = null,
    ready = false,
    gltfScene = null;
  // 額外姿勢：upright＝額外轉正程度（0~1），sway＝是否擺動，swayTime＝擺動計時
  // tiltX / tiltY＝跟著滑鼠的傾斜（弧度）
  const extra = { upright: 0, sway: false, swayTime: 0, tiltX: 0, tiltY: 0 };

  const SW = 0.14,
    SH = 0.01185,
    COLS = 140,
    ROWS = 3;
  const SY = 0.225 - SH / 2 - 0.1125;
  const stripGeo = new THREE.PlaneGeometry(SW, SH, COLS, ROWS);
  const basePos = stripGeo.attributes.position.array.slice();
  const stripGeoB = stripGeo.clone();

  // 易撕條正反面各自貼上包裝頂端對應位置的圖案
  function stripUV(geo, back) {
    const p = geo.attributes.position.array,
      uv = geo.attributes.uv.array;
    for (let i = 0; i < p.length / 3; i++) {
      const xmm = (p[i * 3] + SW / 2) * 1000,
        zmm = (SY + 0.1125 + p[i * 3 + 1]) * 1000;
      uv[i * 2] = back ? 0.5 + (140 - xmm) / 280 : xmm / 280;
      uv[i * 2 + 1] = 1 - zmm / 225;
    }
    geo.attributes.uv.needsUpdate = true;
  }
  stripUV(stripGeo, false);
  stripUV(stripGeoB, true);

  const strip = new THREE.Group();
  strip.add(
    new THREE.Mesh(stripGeo, M.strip),
    new THREE.Mesh(stripGeoB, M.stripB),
  );
  strip.matrixAutoUpdate = false;
  strip.visible = false; // 模型載入前先藏起來
  scene.add(strip);
  const stripLocal = new THREE.Matrix4().makeTranslation(0, SY, 0);

  // 依撕開進度 p（0~1）把易撕條由左到右捲起
  function curlStrip(p) {
    const pos = stripGeo.attributes.position.array;
    const xt = -SW / 2 + p * SW;
    const colX = [],
      colZ = [],
      colY = [];
    let px = xt,
      pz = 0,
      py = 0,
      phi = 0,
      s = 0,
      prevX = xt;
    for (let c = COLS; c >= 0; c--) {
      const x = -SW / 2 + (c / COLS) * SW;
      if (x >= xt) {
        colX[c] = x;
        colZ[c] = 0;
        colY[c] = 0;
        continue;
      }
      const steps = 4,
        ds = (prevX - x) / steps;
      for (let k = 0; k < steps; k++) {
        const R = 0.018 * (1 - 0.5 * Math.min(1, s / SW)); // 越捲越緊
        phi += ds / R;
        s += ds;
        px -= Math.cos(phi) * ds;
        pz += Math.sin(phi) * ds;
        py += ds * 0.06;
      }
      prevX = x;
      colX[c] = px;
      colZ[c] = pz;
      colY[c] = py;
    }
    for (let i = 0; i < pos.length / 3; i++) {
      const c = i % (COLS + 1);
      pos[i * 3] = colX[c];
      pos[i * 3 + 1] = basePos[i * 3 + 1] + colY[c];
      pos[i * 3 + 2] = colZ[c];
    }
    stripGeo.attributes.position.needsUpdate = true;
    stripGeo.computeVertexNormals();
    stripGeoB.attributes.position.array.set(pos);
    stripGeoB.attributes.position.needsUpdate = true;
    stripGeoB.computeVertexNormals();
  }

  // ---------- 載入模型 ----------
  let resolveReady;
  const readyPromise = new Promise((r) => {
    resolveReady = r;
  });
  let disposed = false;

  new GLTFLoader().load(
    P.modelUrl,
    (gltf) => {
      if (disposed) return;
      const g = gltf.scene;
      gltfScene = g;
      g.position.y = -0.1125;
      g.traverse((o) => {
        if (!o.isMesh) return;
        const n = o.material.name || "";
        // 易撕條沿用袋子印刷貼圖
        if (n.startsWith("Pouch_Print")) {
          M.strip.map = o.material.map;
          M.stripB.map = o.material.map;
          M.strip.needsUpdate = M.stripB.needsUpdate = true;
        }
        if (o.morphTargetInfluences) morphMeshes.push(o);
      });
      g.getObjectByName("Tear_Strip").visible = false; // 改用程式產生的易撕條

      // 四層貼布（抽出來的那一片）：透明背景模式
      const p1 = g.getObjectByName("Patch_1");
      for (const n of ["Patch_1", "Patch_2", "Patch_3", "Patch_4"])
        g.getObjectByName(n).visible = false; // 讓出厚度
      const four = makeFourLayerPatch(THREE, RoundedBoxGeometry, {
        transparentBackground: true,
      });
      g.traverse((o) => {
        if (o.isMesh && (o.material.name || "").startsWith("Patch"))
          o.material = four.materials.white;
      });
      patch = four.group;
      patch.position.set(p1.position.x, p1.position.y, 0.0009);
      p1.parent.add(patch);
      patch0 = patch.position.clone();
      rig.add(g);

      ready = true;
      apply(t);
      needsRender = true;
      resolveReady();
    },
    undefined,
    (err) => console.error("[pouchEntrance] 模型載入失敗：", err),
  );

  // ---------- 動畫（只依時間 t 計算）----------
  // 計算袋子在時間 t 的位置、旋轉、縮放
  function rigAt(time) {
    const e = outCubic(time / T.flyEnd);
    const P0 = screenToWorld(P.from[0], P.from[1]);
    const C = screenToWorld(P.via[0], P.via[1]);
    const P1 = screenToWorld(P.to[0], P.to[1]);
    // 二次貝茲曲線：起點 → 控制點 → 終點
    const pos = new THREE.Vector3()
      .addScaledVector(P0, (1 - e) * (1 - e))
      .addScaledVector(C, 2 * (1 - e) * e)
      .addScaledVector(P1, e * e);
    const sc = 0.26 + 0.74 * outBack(time / (T.flyEnd + 0.3)); // 由小變大，略微回彈
    const rx = (1 - e) * 0.45 + extra.tiltX; // ＋滑鼠上下傾斜
    let ry = (1 - e) * -Math.PI * 2 * P.spins + extra.tiltY; // 翻轉圈數＋滑鼠左右傾斜
    if (extra.sway) ry += Math.sin(extra.swayTime * 0.6) * 0.18; // 很慢的左右擺動
    let rz = THREE.MathUtils.lerp(0.55, TILT, e);
    rz = THREE.MathUtils.lerp(
      rz,
      0,
      ss((time - T.uprightStart) / (T.uprightEnd - T.uprightStart)),
    ); // 轉正
    rz = THREE.MathUtils.lerp(rz, 0, extra.upright); // 外部指定的額外轉正
    if (time > T.tearStart && time < T.tearStart + 0.35) {
      // 開始撕時抖一下
      const k = (time - T.tearStart) / 0.35;
      rz += 0.035 * Math.sin(k * Math.PI * 5) * (1 - k);
    }
    rig.position.copy(pos);
    rig.rotation.set(rx, ry, rz);
    rig.scale.setScalar(sc);
    rig.updateMatrixWorld(true);
    return rig.matrixWorld.clone();
  }

  // 把整個場景設定成時間 t 的狀態
  function apply(time) {
    if (!ready) return;
    const rm = rigAt(time);

    // 易撕條：撕開、捲起，捲好後放大一下再縮小消失
    curlStrip(ss((time - T.tearStart) / (T.tearEnd - T.tearStart)));
    if (time <= T.tearEnd) {
      strip.visible = true;
      strip.matrix.multiplyMatrices(rm, stripLocal);
    } else {
      const m0 = rigAt(T.tearEnd).multiply(stripLocal);
      rigAt(time);
      stripGeo.computeBoundingBox();
      const c = stripGeo.boundingBox.getCenter(new THREE.Vector3()); // 以捲好的卷為中心縮放
      const k = clamp01((time - T.tearEnd) / (T.dropEnd - T.tearEnd));
      const sc =
        k < 0.3 ? 1 + 0.18 * ss(k / 0.3) : 1.18 * (1 - ss((k - 0.3) / 0.7));
      strip.visible = sc > 0.002;
      strip.matrix
        .copy(m0)
        .multiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z))
        .multiply(new THREE.Matrix4().makeScale(sc, sc, sc))
        .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    }
    strip.matrixWorldNeedsUpdate = true;

    // 袋口張開（形變 Open）
    const m = ss((time - T.openStart) / (T.openEnd - T.openStart));
    for (const o of morphMeshes) o.morphTargetInfluences[0] = m;

    // 貼布抽出，抽到頂後果凍 Q 彈兩下
    const pk = (time - T.patchStart) / (T.patchEnd - T.patchStart);
    patch.position.set(patch0.x, patch0.y + 0.095 * ss(pk), patch0.z);
    const w = Math.max(0, time - T.patchEnd);
    const wob = w > 0 ? Math.sin(w * 22) * Math.exp(-w * 6) * 0.06 : 0;
    patch.scale.set(1 - wob * 0.5, 1 + wob, 1);
    patch.rotation.z = Math.sin(clamp01(pk) * Math.PI) * 0.04;
  }

  // ---------- 播放控制 ----------
  let t = 0; // 目前故事時間
  let playing = false;
  let playEnd = T.total; // 這次播放要停在哪個時間
  let needsRender = true; // 畫面有變動才重新繪製

  // 從目前時間播到 end（預設播到最後）
  function play(end = T.total) {
    if (reduceMotion) {
      seek(end);
      return;
    } // 減少動態：直接顯示結束畫面
    if (t >= end - 0.001) t = 0;
    playEnd = end;
    playing = true;
  }

  // 只播飛入段
  function playFlyIn() {
    play(T.flyEnd);
  }

  // 暫停
  function pause() {
    playing = false;
  }

  // 跳到故事時間 time（會停止自動播放）
  function seek(time) {
    playing = false;
    t = Math.min(T.total, Math.max(0, time));
    apply(t);
    needsRender = true;
  }

  // 以進度 p（0~1）跳到對應時間，給捲動驅動使用
  function seekProgress(p) {
    seek(clamp01(p) * T.total);
  }

  // 重新指定飛行路徑（容器內 -1~1 座標，沒給的維持原值）
  function setPath(path = {}) {
    if (path.from) P.from = path.from;
    if (path.via) P.via = path.via;
    if (path.to) P.to = path.to;
    apply(t);
    needsRender = true;
  }

  // 額外轉正程度 k（0＝飛入後的傾斜，1＝完全轉正）
  function setUpright(k) {
    extra.upright = clamp01(k);
    apply(t);
    needsRender = true;
  }

  // 跟著滑鼠傾斜：x 左右、y 上下（弧度，0＝正面）
  function setTilt(x, y) {
    extra.tiltY = x;
    extra.tiltX = y;
    apply(t);
    needsRender = true;
  }

  // 開／關很慢的左右擺動
  function setSway(on) {
    extra.sway = !!on;
    if (!on) extra.swayTime = 0;
    apply(t);
    needsRender = true;
  }

  // 袋子在容器內的外框（像素：x, y, width, height）
  // pose 可暫時指定姿勢量測，例如 { upright: 1, sway: false }，量完會還原
  function getScreenRect(pose = {}) {
    if (!ready) return null;
    const saved = { ...extra };
    Object.assign(extra, pose);
    apply(t);
    const box = new THREE.Box3().setFromObject(gltfScene);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    const v = new THREE.Vector3();
    // 把 3D 外框的 8 個角投影到畫面上，取最大範圍
    for (let i = 0; i < 8; i++) {
      v.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      );
      v.project(camera);
      const px = ((v.x + 1) / 2) * width,
        py = ((1 - v.y) / 2) * height;
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, py);
      y1 = Math.max(y1, py);
    }
    Object.assign(extra, saved);
    apply(t);
    needsRender = true;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  // ---------- 畫面外暫停渲染 ----------
  let visible = true;
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    renderer.setAnimationLoop(visible ? loop : null);
    if (visible) {
      clock.getDelta();
      needsRender = true;
    } // 回到畫面時重設計時，避免跳格
  });
  io.observe(container);

  // 容器尺寸改變時更新
  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();

  // ---------- 主迴圈 ----------
  const clock = new THREE.Clock();
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (ready && playing) {
      t += dt * P.speed;
      if (t >= playEnd) {
        t = playEnd;
        playing = false;
        if (typeof P.onComplete === "function") P.onComplete();
      }
      apply(t);
      needsRender = true;
    } else if (ready && extra.sway) {
      // 擺動中：持續更新姿勢
      extra.swayTime += dt;
      apply(t);
      needsRender = true;
    }
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  }
  renderer.setAnimationLoop(loop);

  // 減少動態：載入後直接停在最後一格
  if (reduceMotion) readyPromise.then(() => seek(T.total));

  // ---------- 釋放資源 ----------
  function dispose() {
    disposed = true;
    renderer.setAnimationLoop(null);
    io.disconnect();
    ro.disconnect();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((mat) => {
          for (const k in mat) if (mat[k] && mat[k].isTexture) mat[k].dispose();
          mat.dispose();
        });
      }
    });
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    play,
    playFlyIn,
    pause,
    seek,
    seekProgress,
    setPath,
    setUpright,
    setSway,
    setTilt,
    getScreenRect,
    dispose,
    ready: readyPromise, // 模型載入完成的 Promise
    timeline: { ...T }, // 各段時間點（故事時間，秒）
    duration: T.total, // 總長（故事時間，秒）
    get time() {
      return t;
    }, // 目前故事時間
    get isPlaying() {
      return playing;
    },
  };
}

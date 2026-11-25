/* 商店主視覺用的液態玻璃青蛙頭（細胞分裂預覽版＋加回 export，給 storeHero.js 用 import 載入） */
// ===== 液態玻璃青蛙頭（不累不累丸「靈感濃縮核」定案版）=====
// 造型依《青蛙頭_三視圖》：橢圓頭＋兩顆眼睛凸起「平滑融合」、白色眼珠、海鷗形嘴巴。
// 材質：液態玻璃螢光綠（後半顆較深＋前層半透明、邊光、虹彩、反射），眼珠與嘴巴是白色霧面玻璃，不描邊。
//
// 用法（three.js r128～r170 都可以，THREE 由你傳進來）：
//   import { createFrogHeadGlass, FROG_HEAD_PARAMS } from './frogHeadGlass.js';
//   const frog = createFrogHeadGlass(THREE, { width: 0.6 });   // width＝頭寬（場景單位）
//   scene.add(frog.group);
//   // 每一格：frog.update(秒數)          → 左右擺頭（sway 為 0 就不動）
//   //         frog.setLight(x, y, z)       → 光源方向（相機座標，預設左上前方）
//   //         frog.dispose()
//
// 調參數：建立時傳進去會覆蓋 FROG_HEAD_PARAMS，例如 createFrogHeadGlass(THREE, { tint: '#bafc52', sway: 0 })

// 調校台定案的參數（造型單位＝原圖示像素）
export const FROG_HEAD_PARAMS = {
  headW: 174, headH: 138, headD: 150, bumpR: 32, eyeGap: 86, eyeY: 51, bumpFwd: 6, smooth: 12,
  pearlR: 12, pearlOut: 4, mouthR: 1.8, mouthW: 1, mouthY: 0,
  tint: '#c8fa6e', bodyA: 0.59, edgeA: 0.92, glow: 0.17, diffuse: 0.5, backDark: 0.61,
  env: 0.55, spec: 1.2, gloss: 300, rimCol: '#e6ffb0', rimPow: 3.2, rimStr: 1.22, irid: 1,
  pearlCol: '#ffffff', pearlGlow: 0.27, pearlSheen: 0.5, pearlSpec: 0.6, mouthCol: '#ffffff',
  sway: 0.8,
  refl: 0, swirl: 0, swirlSpeed: 0.15,   // 新增：液態玻璃反射、旋光（0＝關）
  palette: null,                         // 新增：反射光用的 4 個顏色，例如 ['#c8fa6e', '#ff5391', '#ffbad1', '#00daff']
  paletteW: [1, 1, 1, 1],                // 新增：每段漸變的長度（第 i 段＝第 i 色漸變到下一色；越長那段顏色越多）
  // 以下不是調校台的值，是放進場景用的
  width: 0.6,          // 頭寬（場景單位）
  renderOrder: 1,      // 後半顆用這個，前層 +1、嘴巴 +1.5；要跟其他透明物件排順序時改這裡
  segments: [144, 100] // 頭的細分；手機想省效能可改 [96, 68]
};

export function createFrogHeadGlass(THREE, opt = {}) {
  const C = Object.assign({}, FROG_HEAD_PARAMS, opt);

  // ---------- 造型：從圓開始（有號距離函數：<0 在裡面、>0 在外面）----------
  const base = { c: [0, 0, 0], r: [C.headW / 2, C.headH / 2, C.headD / 2] };
  const bumps = [-1, 1].map((s) => ({ c: [s * C.eyeGap / 2, C.eyeY, C.bumpFwd], r: C.bumpR }));
  const sdEll = (x, y, z, c, r) => {
    const qx = (x - c[0]) / r[0], qy = (y - c[1]) / r[1], qz = (z - c[2]) / r[2];
    const k0 = Math.hypot(qx, qy, qz);
    const k1 = Math.hypot((x - c[0]) / (r[0] * r[0]), (y - c[1]) / (r[1] * r[1]), (z - c[2]) / (r[2] * r[2]));
    return k0 * (k0 - 1) / Math.max(k1, 1e-9);
  };
  const sdSph = (x, y, z, c, r) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r;
  const smin = (a, b, k) => { const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (b - a) / k)); return b * (1 - h) + a * h - k * h * (1 - h); };   // 平滑融合
  const sdf = (x, y, z) => { let d = sdEll(x, y, z, base.c, base.r); for (const b of bumps) d = smin(d, sdSph(x, y, z, b.c, b.r), C.smooth); return d; };

  // 把細分的球「縮」到表面上：從外往中心跳（距離函數告訴我們能跳多遠），再用二分法找準
  const headGeo = new THREE.SphereGeometry(1, C.segments[0], C.segments[1]);
  {
    const p = headGeo.attributes.position, O = [0, C.eyeY * 0.35, 0], tMax = Math.max(C.headW, C.headH + C.eyeY, 200);
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
      let t = tMax;
      for (let k = 0; k < 200; k++) { const d = sdf(O[0] + dx * t, O[1] + dy * t, O[2] + dz * t); if (d < 0.05) break; t -= Math.max(d * 0.8, 0.05); if (t <= 0) { t = 0; break; } }
      let a = Math.max(t - 1.5, 0), b = t + 1.5;
      for (let k = 0; k < 16; k++) { const m = (a + b) / 2; if (sdf(O[0] + dx * m, O[1] + dy * m, O[2] + dz * m) < 0) a = m; else b = m; }
      const tt = (a + b) / 2;
      p.setXYZ(i, (O[0] + dx * tt) / 100, (O[1] + dy * tt) / 100, (O[2] + dz * tt) / 100);
    }
    // 用距離函數的梯度當法線，表面才會非常平滑
    const n = headGeo.attributes.normal, e = 0.05;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * 100, y = p.getY(i) * 100, z = p.getZ(i) * 100;
      const nx = sdf(x + e, y, z) - sdf(x - e, y, z), ny = sdf(x, y + e, z) - sdf(x, y - e, z), nz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const l = Math.hypot(nx, ny, nz) || 1; n.setXYZ(i, nx / l, ny / l, nz / l);
    }
  }
  // 嘴巴：海鷗形細管，沿著臉的表面
  const surfaceZ = (x, y) => { for (let z = C.headD; z > -C.headD; z -= 0.25) if (sdf(x, y, z) < 0) return z; return 0; };
  const M = [[-23, 38.5], [-14, 37], [-7, 33.5], [-2, 29], [0, 25], [2, 29], [7, 33.5], [14, 37], [23, 38.5]];
  const mouthPts = M.map(([x, y]) => { const X = x * C.mouthW, Y = y + C.mouthY; return new THREE.Vector3(X / 100, Y / 100, (surfaceZ(X, Y) + C.mouthR * 0.4) / 100); });
  const mouthGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mouthPts, false, 'catmullrom', 0.3), 80, C.mouthR / 100, 12);
  const pearlGeo = new THREE.SphereGeometry(1, 48, 36);

  // ---------- 材質 ----------
  const L = { value: new THREE.Vector3(-0.45, 0.6, 0.7).normalize() };   // 光源方向（相機座標）
  const VS = `varying vec3 vN; varying vec3 vV;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
  const UG = {
    uTint: { value: new THREE.Color(C.tint) }, uRimCol: { value: new THREE.Color(C.rimCol) }, uL: L,
    uBodyA: { value: C.bodyA }, uEdgeA: { value: C.edgeA }, uGlow: { value: C.glow }, uDiff: { value: C.diffuse }, uBackDark: { value: C.backDark },
    uEnv: { value: C.env }, uSpec: { value: C.spec }, uGloss: { value: C.gloss }, uRimPow: { value: C.rimPow }, uRimStr: { value: C.rimStr }, uIrid: { value: C.irid },
    uRefl: { value: C.refl }, uSwirl: { value: C.swirl }, uSwirlSpeed: { value: C.swirlSpeed }, uTime: { value: 0 },
    uUsePal: { value: C.palette ? 1 : 0 }, uPw: { value: new THREE.Vector4(...(C.paletteW || [1, 1, 1, 1])) },
    uP0: { value: new THREE.Color((C.palette || [])[0] || '#ffffff') }, uP1: { value: new THREE.Color((C.palette || [])[1] || '#ffffff') },
    uP2: { value: new THREE.Color((C.palette || [])[2] || '#ffffff') }, uP3: { value: new THREE.Color((C.palette || [])[3] || '#ffffff') },
  };
  // 液態玻璃：先畫後半顆（較深，玻璃才有厚度），再畫前面那層（半透明＋邊光＋虹彩＋反射）
  const GLASS_FS = `
    uniform vec3 uTint, uRimCol, uL;
    uniform float uBodyA, uEdgeA, uGlow, uDiff, uBackDark, uEnv, uSpec, uGloss, uRimPow, uRimStr, uIrid;
    uniform float uRefl, uSwirl, uSwirlSpeed, uTime, uUsePal;
    uniform vec3 uP0, uP1, uP2, uP3; uniform vec4 uPw;
    varying vec3 vN; varying vec3 vV;
    // 4 個色票繞一圈漸變（x 每加 1 繞完一圈）；uPw 是每段的長度，段越長那段的顏色越多
    vec3 pal(float x){
      float tot = uPw.x + uPw.y + uPw.z + uPw.w; x = fract(x) * tot;
      float a1 = uPw.x, a2 = a1 + uPw.y, a3 = a2 + uPw.z;
      if (x < a1) return mix(uP0, uP1, smoothstep(0.0, 1.0, x / uPw.x));
      if (x < a2) return mix(uP1, uP2, smoothstep(0.0, 1.0, (x - a1) / uPw.y));
      if (x < a3) return mix(uP2, uP3, smoothstep(0.0, 1.0, (x - a2) / uPw.z));
      return mix(uP3, uP0, smoothstep(0.0, 1.0, (x - a3) / uPw.w));
    }
    vec3 envCol(vec3 r){
      vec3 e = mix(vec3(0.86, 0.89, 0.93), vec3(1.0), smoothstep(-0.2, 0.6, r.y));
      e += vec3(1.0) * smoothstep(0.88, 0.97, dot(r, normalize(vec3(-0.5, 0.55, 0.65))));
      e += vec3(0.4) * smoothstep(0.92, 0.985, dot(r, normalize(vec3(0.7, 0.25, 0.65))));
      return e;
    }
    void main(){
      vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
      vec3 v = normalize(vV); vec3 L = normalize(uL);
      float ndv = max(dot(n, v), 0.0);
      float wd = clamp((dot(n, L) + 0.5) / 1.5, 0.0, 1.0);
    #ifdef BACK
      gl_FragColor = vec4(uTint * uBackDark * mix(0.8, 1.0, wd) * (1.0 + uGlow * 0.6), uBodyA * 0.85);
    #else
      float F = pow(1.0 - ndv, uRimPow);
      vec3 sat = clamp(uTint + (uTint - vec3(dot(uTint, vec3(0.333)))) * 0.6, 0.0, 1.0);   // 更飽和的螢光色
      vec3 col = mix(uTint, sat, uGlow) * mix(1.0 - uDiff * 0.4, 1.0, wd) * (1.0 + uGlow * 0.35);
      float er = clamp(uEnv * (0.05 + 0.95 * F), 0.0, 1.0);
      col = mix(col, envCol(reflect(-v, n)), er * 0.7);
      vec3 film = 0.5 + 0.5 * cos(6.2831 * (F * 1.4 + vec3(0.0, 0.33, 0.67)));            // 薄膜虹彩
      film = mix(film, pal(F * 1.4 + 0.1) * 1.05, uUsePal);                                 // 有色票就用色票
      col = mix(col, col * film * 1.6, uIrid * F);
      vec3 palRim = pal(atan(n.y, n.x) / 6.2831 * 2.0 + F * 1.3 + uTime * uSwirlSpeed);
      col += mix(uRimCol, palRim, uUsePal * 0.75) * F * uRimStr;                            // 邊光（有色票就帶色）
      float sp = pow(max(dot(n, normalize(L + v)), 0.0), uGloss) * uSpec;
      col += vec3(sp);
      float a = mix(uBodyA, uEdgeA, pow(1.0 - ndv, 2.0));
      // 液態玻璃反射：反射方向打到兩個柔光箱就變亮，再加一條地平線反光（相機座標，物體轉動時反光會滑過）
      vec3 r = reflect(-v, n);
      float box1 = smoothstep(0.36, 0.16, abs(r.x + 0.42)) * smoothstep(0.30, 0.12, abs(r.y - 0.42)) * smoothstep(-0.1, 0.2, r.z);
      float box2 = smoothstep(0.16, 0.04, abs(r.x - 0.55)) * smoothstep(0.5, 0.3, abs(r.y - 0.05)) * smoothstep(-0.1, 0.2, r.z);
      float hz = smoothstep(0.06, 0.0, abs(r.y + 0.12)) * smoothstep(0.2, 0.6, 1.0 - ndv);
      float refl = uRefl * (box1 * 0.9 + box2 * 0.55 + hz * 0.35);
      vec3 reflCol = mix(vec3(1.0), (uP0 * box1 + uP3 * box2) / max(box1 + box2, 1e-3) * 0.4 + 0.6, uUsePal * step(1e-3, box1 + box2));   // 有色票：柔光箱帶一點色
      col = mix(col, reflCol, clamp(refl, 0.0, 1.0));
      // 旋光：依邊緣的角度上彩虹色，隨時間繞圈轉；越靠邊越明顯
      float ang = atan(n.y, n.x) / 6.2831;
      vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (ang * 2.0 + F * 1.3 + uTime * uSwirlSpeed + vec3(0.0, 0.33, 0.67)));
      rainbow = mix(rainbow, pal(ang * 2.0 + F * 1.3 + uTime * uSwirlSpeed), uUsePal);
      float sw = uSwirl * (0.12 + 0.88 * pow(1.0 - ndv, 1.6));
      col = mix(col, mix(col * 0.45 + rainbow * 0.9, rainbow, uUsePal * 0.8), clamp(sw, 0.0, 1.0));
      a += refl * 0.55 + sw * 0.35;
      gl_FragColor = vec4(col, clamp(a + sp + F * uRimStr * 0.4 + er * 0.2, 0.0, 1.0));
    #endif
    }`;
  // 白色霧面玻璃：眼珠、嘴巴
  const FROST_FS = `
    uniform vec3 uCol, uL; uniform float uGlow, uSheen, uSpec;
    varying vec3 vN; varying vec3 vV;
    void main(){
      vec3 n = normalize(vN), v = normalize(vV), L = normalize(uL);
      float wd = clamp((dot(n, L) + 0.6) / 1.6, 0.0, 1.0);
      vec3 col = uCol * mix(0.78, 1.0, wd) * (1.0 + uGlow * 0.3) + uCol * uGlow * 0.15;
      col = mix(col, vec3(1.0), pow(1.0 - max(dot(n, v), 0.0), 2.5) * uSheen);
      col += vec3(pow(max(dot(n, normalize(L + v)), 0.0), 60.0) * uSpec);
      gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
    }`;
  const frost = (hex, transparent) => new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(hex) }, uGlow: { value: C.pearlGlow }, uSheen: { value: C.pearlSheen }, uSpec: { value: C.pearlSpec }, uL: L },
    vertexShader: VS, fragmentShader: FROST_FS, transparent: !!transparent,
  });
  const backMat = new THREE.ShaderMaterial({ uniforms: UG, vertexShader: VS, fragmentShader: GLASS_FS, defines: { BACK: '' }, side: THREE.BackSide, transparent: true, depthWrite: false });
  const frontMat = new THREE.ShaderMaterial({ uniforms: UG, vertexShader: VS, fragmentShader: GLASS_FS, transparent: true, depthWrite: false });
  const pearlMat = frost(C.pearlCol), mouthMat = frost(C.mouthCol, true);

  // ---------- 組合 ----------
  const group = new THREE.Group();     // 外層：放進場景、決定位置與朝向
  const frog = new THREE.Group();      // 內層：縮放到指定頭寬，左右擺頭在這層
  frog.scale.setScalar(C.width / (C.headW / 100));
  frog.position.y = -C.eyeY * 0.12 / 100 * frog.scale.x;   // 視覺中心放在原點附近
  group.add(frog);
  const headBack = new THREE.Mesh(headGeo, backMat); headBack.renderOrder = C.renderOrder;
  const headFront = new THREE.Mesh(headGeo, frontMat); headFront.renderOrder = C.renderOrder + 1;
  const mouth = new THREE.Mesh(mouthGeo, mouthMat); mouth.renderOrder = C.renderOrder + 1.5;   // 嘴巴畫在玻璃上面才清楚
  const pearls = bumps.map((b) => {
    const m = new THREE.Mesh(pearlGeo, pearlMat);
    m.position.set(b.c[0] / 100, (b.c[1] + 10) / 100, (b.c[2] + b.r - C.pearlR + C.pearlOut - 2) / 100);   // 凸起正前方再突出一點
    m.scale.setScalar(C.pearlR / 100); return m;
  });
  frog.add(headBack, ...pearls, mouth, headFront);

  return {
    group, params: C,
    uniforms: { glass: UG, light: L },
    // 每一格呼叫：輕輕左右擺頭、歪頭（sway 為 0 就不動）
    update(t) { UG.uTime.value = t; frog.rotation.set(0, Math.sin(t * 2) * C.sway, Math.sin(t * 1.6) * 0.08 * (C.sway > 0 ? 1 : 0)); },
    setLight(x, y, z) { L.value.set(x, y, z).normalize(); },
    dispose() {
      [headGeo, mouthGeo, pearlGeo].forEach((g) => g.dispose());
      [backMat, frontMat, pearlMat, mouthMat].forEach((m) => m.dispose());
    },
  };
}

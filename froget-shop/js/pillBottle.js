/* 不累不累丸 3D 藥瓶：購物車縮圖用
   跟商品頁同一個模型（瓶身、標籤、瓶蓋、瓶內膠囊），只開一個 3D 畫面，
   畫好後複製到頁面上每個 <canvas class="bottle-thumb">，所以數量再多也不會卡。
   需要先載入 three.js r128；載入失敗時頁面會維持顯示原本的圖片。 */
(function(){
  function start(){
  if (typeof THREE === 'undefined') return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SIZE = 320;                                   // 內部算圖尺寸（縮圖最大 120px × 2 倍螢幕還有餘裕）
  const cv = document.createElement('canvas');
  let br;
  try { br = new THREE.WebGLRenderer({canvas:cv, antialias:true, alpha:true, preserveDrawingBuffer:true}); } catch(e){ return; }
  br.setPixelRatio(1); br.setSize(SIZE, SIZE, false);
  const o = {};
  let needsDraw = true;

  /* ===== 共用材質、描邊、陰影（從商品頁原樣搬過來） ===== */
  const LIT_GLSL = `
    vec3 litColor(vec3 base, vec3 n, vec3 v, float spec, float shin){
      vec3 L = normalize(vec3(-0.45, 0.6, 0.7));
      float wrap = clamp((dot(n, L) + 0.35) / 1.35, 0.0, 1.0);
      vec3 c = base * mix(0.76, 1.0, wrap);                         // 暗部統一壓到 76%
      vec3 h = normalize(L + v);
      c += vec3(spec) * pow(max(dot(n, h), 0.0), shin);            // 依材質的光澤
      c += vec3(0.05) * pow(1.0 - max(dot(n, v), 0.0), 3.0);       // 一點邊緣光
      return c;
    }`;
  const LIT_VS = `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
    void main(){ vUv = uv; vec4 p = vec4(position, 1.0); vec3 nn = normal;
      #ifdef USE_INSTANCING
        p = instanceMatrix * p; nn = mat3(instanceMatrix) * nn;
      #endif
      vN = normalize(normalMatrix * nn); vec4 mv = modelViewMatrix * p; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
  // 材質：膠囊明膠亮面、塑膠半亮、紙標籤霧面、糖果略亮、青蛙皮膚霧面
  const MAT = { gelatin:{spec:0.32, shin:70}, plastic:{spec:0.16, shin:36}, paper:{spec:0.03, shin:14}, sugar:{spec:0.12, shin:28}, matte:{spec:0.05, shin:18} };
  function litMat(hex, o){
    o = o || {}; const c = new THREE.Color(hex);
    return new THREE.ShaderMaterial({
      uniforms:{ col:{value:new THREE.Vector3(c.r, c.g, c.b)}, map:{value:o.map || null}, spec:{value:o.spec}, shin:{value:o.shin} },
      defines: o.map ? {USE_MAP:''} : {},
      side: o.side || THREE.FrontSide,
      vertexShader: LIT_VS,
      fragmentShader: `uniform vec3 col; uniform float spec; uniform float shin; uniform sampler2D map;
        varying vec3 vN; varying vec3 vV; varying vec2 vUv; ${LIT_GLSL}
        void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; vec3 base = col;
          #ifdef USE_MAP
            base *= texture2D(map, vUv).rgb;
          #endif
          gl_FragColor = vec4(litColor(base, n, normalize(vV), spec, shin), 1.0); }`
    });
  }
  // 描邊：在螢幕上固定像素寬（不管物件多大、離鏡頭多遠，線都一樣粗）
  const OUTLINE_PX = 1, INK = 0x1b1c1e;
  function makeOutlineMat(noBias){
    return new THREE.ShaderMaterial({
      uniforms:{ res:{value:new THREE.Vector2(800, 600)}, px:{value:OUTLINE_PX}, ink:{value:new THREE.Color(INK)} },
      side: THREE.BackSide,
      vertexShader:`attribute vec3 sNormal; uniform vec2 res; uniform float px;
        void main(){
          vec4 p = vec4(position, 1.0); vec3 sn = sNormal;
          #ifdef USE_INSTANCING
            p = instanceMatrix * p; sn = mat3(instanceMatrix) * sn;
          #endif
          vec4 c = projectionMatrix * modelViewMatrix * p;
          vec3 nv = normalize(normalMatrix * sn);
          vec2 d = (projectionMatrix * vec4(nv, 0.0)).xy;
          float l = length(d); d = l > 1e-5 ? d / l : vec2(0.0);
          c.xy += d * px * 2.0 / res * c.w;
          ${noBias ? '' : 'c.z += 0.0008 * c.w;'}
          gl_Position = c; }`,
      fragmentShader:`uniform vec3 ink; void main(){ gl_FragColor = vec4(ink, 1.0); }`
    });
  }
  function syncOutline(mat, rend){
    const pr = rend.getPixelRatio(), sz = rend.getSize(new THREE.Vector2());
    mat.uniforms.res.value.set(sz.x * pr, sz.y * pr); mat.uniforms.px.value = OUTLINE_PX * pr * (mat.userData.k || 1);
    const rm = mat.userData.rim; if (rm && rm !== mat){ const pr2 = rend.getPixelRatio(); rm.uniforms.res.value.copy(mat.uniforms.res.value); rm.uniforms.px.value = OUTLINE_PX * pr2 * 0.55; /* 細圓環兩側都會描，各半寬 → 看起來跟外框一樣粗 */ }
  }
  // 開口邊線：極細的隱形圓環＋同一種螢幕固定寬描邊（跟外框同一個粗細）
  const _hidden = new THREE.MeshBasicMaterial({colorWrite:false, depthWrite:false});
  function rimMatFor(ol){ if (!ol.userData.rim){ const m = makeOutlineMat(true); m.side = THREE.DoubleSide; /* 雙面：細圓環前後都描，才會是一條實線而不是兩條細線 */ ol.userData.rim = m; } return ol.userData.rim; }
  function rimLine(parent, R, y, ol){
    const t = new THREE.Mesh(new THREE.TorusGeometry(R + 0.002, 0.0006, 6, 160), _hidden);
    t.rotation.x = Math.PI / 2; t.position.y = y;
    t.add(new THREE.Mesh(smoothGeo(t.geometry), rimMatFor(ol))); parent.add(t); return t;
  }
  // 平滑法線（同一位置的點共用法線），描邊在稜角處才不會裂開
  const _smooth = new WeakMap();
  function smoothGeo(geo){
    if (_smooth.has(geo)) return _smooth.get(geo);
    const g2 = geo.clone(); if (!g2.attributes.normal) g2.computeVertexNormals();
    const pos = g2.attributes.position, nor = g2.attributes.normal, n = pos.count, idx = new Map(), acc = [], ids = new Array(n);
    for (let i = 0; i < n; i++){
      const k = Math.round(pos.getX(i) * 1e4) + '_' + Math.round(pos.getY(i) * 1e4) + '_' + Math.round(pos.getZ(i) * 1e4);
      let id = idx.get(k); if (id === undefined){ id = acc.length; idx.set(k, id); acc.push(new THREE.Vector3()); }
      ids[i] = id; acc[id].x += nor.getX(i); acc[id].y += nor.getY(i); acc[id].z += nor.getZ(i);
    }
    acc.forEach(v => v.normalize());
    const sn = new Float32Array(n * 3);
    for (let i = 0; i < n; i++){ const v = acc[ids[i]]; sn[i*3] = v.x; sn[i*3+1] = v.y; sn[i*3+2] = v.z; }
    g2.setAttribute('sNormal', new THREE.BufferAttribute(sn, 3)); _smooth.set(geo, g2); return g2;
  }
  // 陰影：全站同一種柔和接觸陰影
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    grd.addColorStop(0, 'rgba(27,28,30,0.30)'); grd.addColorStop(0.55, 'rgba(27,28,30,0.12)'); grd.addColorStop(1, 'rgba(27,28,30,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  })();
  function contactShadow(){ return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({map:shadowTex, transparent:true, depthWrite:false})); }
  function outline(mesh, s, mat){ const o = new THREE.Mesh(smoothGeo(mesh.geometry), mat || olMain); mesh.add(o); return o; }
  const olMain = makeOutlineMat(); rimMatFor(olMain);

  /* ===== 藥瓶模型（從商品頁原樣搬過來） ===== */
    const bs = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(20, 1, 0.1, 200);   // 長焦，產品照的透視比較自然
    const ol = makeOutlineMat(); rimMatFor(ol);
    const LIGHT = 'normalize(vec3(-0.45, 0.55, 0.75))';
    const VS = `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
    // 材質統一走 litMat（白瓶：半亮塑膠）
    function shade(hex){ return litMat(hex, MAT.plastic); }
    const g = new THREE.Group(); bs.add(g);
    const R = 1.0, yB = -1.32, yT = 1.28;

    // 瓶身：半透明灰色玻璃。先畫內側（背面）再畫外框、最後畫正面，裡面的膠囊會隔著玻璃透出來
    const prof = [new THREE.Vector2(0.001, yB)];
    for (let i = 0; i <= 8; i++){ const a = -Math.PI/2 + (i/8) * Math.PI/2; prof.push(new THREE.Vector2(R - 0.12 + 0.12 * Math.cos(a), yB + 0.12 + 0.12 * Math.sin(a))); }
    prof.push(new THREE.Vector2(R, yT));
    for (let i = 1; i <= 14; i++){ const a = (i/14) * Math.PI/2; prof.push(new THREE.Vector2(0.66 + (R - 0.66) * Math.cos(a), yT + 0.3 * Math.sin(a))); }
    prof.push(new THREE.Vector2(0.62, yT + 0.32), new THREE.Vector2(0.62, yT + 0.52), new THREE.Vector2(0.001, yT + 0.52));
    const GLASS_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
    const GLASS_FS = `uniform float yb; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec3 n = normalize(vN), v = normalize(vV); if (!gl_FrontFacing) n = -n;
        float ndv = clamp(abs(dot(n, v)), 0.0, 1.0), edge = 1.0 - ndv;
        float a = mix(0.5, 0.9, pow(edge, 1.7));                              // 正面半透明、側邊玻璃厚所以較不透
        a = max(a, 0.82 * (1.0 - smoothstep(0.0, 0.18, vP.y - yb)));           // 厚玻璃瓶底
        vec3 c = vec3(0.34, 0.35, 0.37) * mix(1.0, 0.62, pow(edge, 1.3));     // 灰色玻璃
        float s1 = exp(-pow((n.x + 0.52) / 0.075, 2.0)) * smoothstep(-0.6, 0.2, n.y + 0.4);   // 主反光條
        float s2 = exp(-pow((n.x - 0.64) / 0.04, 2.0));                                      // 細反光
        vec3 L = normalize(vec3(-0.45, 0.6, 0.7));
        float sp = pow(max(dot(n, normalize(L + v)), 0.0), 170.0);                          // 肩部亮點
        float rim = pow(edge, 4.0);
        #ifdef BACK
          s1 *= 0.3; s2 *= 0.3; sp = 0.0; a *= 0.6;
        #endif
        c += vec3(0.9) * s1 + vec3(0.55) * s2 + vec3(1.0) * sp + vec3(0.3) * rim;
        a = max(a, max(s1 * 0.85, max(s2 * 0.6, sp)));
        gl_FragColor = vec4(c, a); }`;
    const bodyGeo = new THREE.LatheGeometry(prof, 128);
    const glassBack = new THREE.Mesh(bodyGeo, new THREE.ShaderMaterial({ uniforms:{yb:{value:yB}}, defines:{BACK:''}, vertexShader:GLASS_VS, fragmentShader:GLASS_FS, side:THREE.BackSide, transparent:true, depthWrite:true }));
    glassBack.renderOrder = 1; g.add(glassBack);
    const olGlass = makeOutlineMat(); olGlass.transparent = true;          // 外框排在玻璃內側之後，才不會從玻璃裡透出黑色
    const body = new THREE.Mesh(bodyGeo, new THREE.ShaderMaterial({ uniforms:{yb:{value:yB}}, vertexShader:GLASS_VS, fragmentShader:GLASS_FS, transparent:true, depthWrite:false }));
    body.renderOrder = 3; g.add(body);
    const bodyOl = outline(body, 0, olGlass); bodyOl.renderOrder = 2;


    // 標籤：縮小、不整圈包住（留一段玻璃看得到裡面），右半（大字＋青蛙）朝正面，左半規格卡在背面
    const tex = new THREE.TextureLoader().load(window.LABEL_SRC || 'frogs/label.jpg', () => { needsDraw = true; });   // 優先用內嵌版，雙擊開檔也看得到標籤
    tex.anisotropy = br.capabilities.getMaxAnisotropy();
    const FRONT_U = 0.665, LARC = Math.PI * 2 * 0.78;
    const LH = LARC * R / (4096 / 1552), LY = (yB + yT) / 2 - 0.02, LT0 = -LARC * FRONT_U, LR = R + 0.006;
    const labelMat = new THREE.ShaderMaterial({
      uniforms:{ map:{value:tex} }, side:THREE.DoubleSide,
      vertexShader: LIT_VS,
      fragmentShader:`uniform sampler2D map; varying vec3 vN; varying vec3 vV; varying vec2 vUv; ${LIT_GLSL}
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec3 n = normalize(vN), v = normalize(vV);
          if (gl_FrontFacing){
            vec3 base = texture2D(map, vUv).rgb;
            base *= 1.0 + (hash(floor(vUv * vec2(2600.0, 980.0))) - 0.5) * 0.04;   // 紙纖維顆粒
            vec3 c = litColor(base, n, v, 0.08, 24.0);                              // 霧面上光紙
            c += vec3(0.06) * exp(-pow((n.x + 0.45) / 0.2, 2.0));                    // 上光膜的柔和反光
            gl_FragColor = vec4(c, 1.0);
          } else {
            gl_FragColor = vec4(vec3(0.86, 0.86, 0.83), 1.0);                        // 標籤背面：素紙（隔著玻璃看得到）
          } }`
    });
    const label = new THREE.Mesh(new THREE.CylinderGeometry(LR, LR, LH, 160, 1, true, LT0, LARC), labelMat);
    label.position.y = LY; g.add(label);
    // 標籤四邊的線：跟外框同粗
    class ArcY extends THREE.Curve { constructor(r, y, a0, a1){ super(); this.r = r; this.y = y; this.a0 = a0; this.a1 = a1; }
      getPoint(t, o = new THREE.Vector3()){ const a = this.a0 + (this.a1 - this.a0) * t; return o.set(this.r * Math.sin(a), this.y, this.r * Math.cos(a)); } }
    const edgeLine = (curve, segs) => { const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.0006, 6, false), _hidden); m.add(new THREE.Mesh(smoothGeo(m.geometry), rimMatFor(ol))); g.add(m); };
    const ER = LR + 0.002;
    [LY + LH/2, LY - LH/2].forEach(y => edgeLine(new ArcY(ER, y, LT0, LT0 + LARC), 160));
    [LT0, LT0 + LARC].forEach(a => edgeLine(new THREE.LineCurve3(new THREE.Vector3(ER * Math.sin(a), LY - LH/2, ER * Math.cos(a)), new THREE.Vector3(ER * Math.sin(a), LY + LH/2, ER * Math.cos(a))), 2));

    // 瓶蓋：萊姆綠陽極鋁，細密直紋
    const cap = new THREE.Group(); cap.position.y = yT + 0.56; g.add(cap);
    // 瓶蓋：一體成形的直紋圓柱（凸紋直接長在蓋子上，不是另外貼的小方塊）
    const CR = 0.74, CH = 0.5, RIBS = 110, RD = 0.01;
    function ribbedGeo(base){
      const geo = new THREE.CylinderGeometry(1, 1, CH, RIBS * 8, 1, true);
      const pos = geo.attributes.position, ribAttr = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++){
        const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(x, z);
        const k = THREE.MathUtils.smoothstep(Math.cos(a * RIBS), -0.35, 0.35);   // 0 = 凹、1 = 凸
        const r = base + RD * k; ribAttr[i] = k;
        pos.setX(i, Math.sin(a) * r); pos.setZ(i, Math.cos(a) * r);
      }
      geo.setAttribute('rib', new THREE.BufferAttribute(ribAttr, 1));
      geo.computeVertexNormals(); return geo;
    }
    const ALU = 'vec3(0.784, 0.980, 0.431)';   // 色票萊姆綠 #c8fa6e
    const capMat = new THREE.ShaderMaterial({
      vertexShader:`attribute float rib; varying float vR; varying vec3 vN; varying vec3 vS;
        void main(){ vR = rib; vN = normalize(normalMatrix * normal); vS = normalize(normalMatrix * vec3(position.x, 0.0, position.z)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader:`varying float vR; varying vec3 vN; varying vec3 vS;
        void main(){
          vec3 n = normalize(vN); float x = normalize(vS).x;                  // 用不含凸紋的圓柱方向算金屬反光，反光條才會是一條乾淨的直線
          float env = 0.74 + 0.26 * smoothstep(0.85, -0.5, x);
          env -= 0.12 * exp(-pow((x - 0.3) / 0.16, 2.0));                    // 金屬暗帶
          float rib = mix(0.86, 1.0, vR) * (0.94 - 0.06 * n.x);               // 細直紋的明暗
          vec3 c = ${ALU} * env * rib;
          c += vec3(0.30, 0.20, 0.36) * exp(-pow((x + 0.52) / 0.06, 2.0));    // 鋁的亮反光條
          c += vec3(0.12, 0.06, 0.16) * exp(-pow((x - 0.66) / 0.04, 2.0));
          gl_FragColor = vec4(min(c, vec3(1.0)), 1.0); }`
    });
    // 頂面：同心圓拉絲鋁
    const capTopMat = new THREE.ShaderMaterial({
      vertexShader: LIT_VS,
      fragmentShader:`varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          vec2 d = vUv - 0.5; float r = length(d) * 2.0, a = atan(d.y, d.x);
          float brush = 0.88 + 0.12 * cos(2.0 * (a - 0.9)) + 0.025 * sin(r * 260.0);
          vec3 c = ${ALU} * brush * mix(1.0, 0.9, smoothstep(0.85, 1.0, r));
          gl_FragColor = vec4(c, 1.0); }`
    });
    const capSide = new THREE.Mesh(ribbedGeo(CR), capMat); cap.add(capSide);
    // 描邊用外徑的平滑圓柱代替（凸紋不會讓外框忽粗忽細）
    const capProxy = new THREE.Mesh(new THREE.CylinderGeometry(CR + RD, CR + RD, CH, 96, 1, true), new THREE.MeshBasicMaterial({colorWrite:false, depthWrite:false}));
    outline(capProxy, 0, ol); cap.add(capProxy);
    // 頂面＋圓角邊
    const capTopDisc = new THREE.Mesh(new THREE.CircleGeometry(CR + RD, 96), capTopMat);
    capTopDisc.rotation.x = -Math.PI / 2; capTopDisc.position.y = CH / 2; cap.add(capTopDisc);
    const capBot = new THREE.Mesh(new THREE.CircleGeometry(CR + RD, 96), litMat(0x8fb84a, MAT.matte));
    capBot.rotation.x = Math.PI / 2; capBot.position.y = -CH / 2; cap.add(capBot);
    [CH / 2, -CH / 2].forEach(y => rimLine(cap, CR + RD, y, ol));

    // 地面柔和陰影（全站同一種）
    const shadow = contactShadow();
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = yB - 0.02; shadow.scale.set(3.0, 1.6, 1); bs.add(shadow);
    g.position.x = shadow.position.x = o.bx || 0;

    // 小膠囊零件（瓶子裡＋旁邊那堆共用）
    {
      const pr = 0.12, ph = 0.24;
      // 半顆膠囊：圓柱＋半球；上蓋半徑稍大、往下多包一點，像真的膠囊殼套在一起
      function halfGeo(R, y0){
        const pts = [new THREE.Vector2(R * 0.985, y0), new THREE.Vector2(R, y0 + 0.008), new THREE.Vector2(R, ph)];
        for (let i = 1; i <= 24; i++){ const a = (i/24) * Math.PI/2; pts.push(new THREE.Vector2(Math.max(R*Math.cos(a), 0.0001), ph + R*Math.sin(a))); }
        return new THREE.LatheGeometry(pts, 64);
      }
      const PRT = pr * 1.015;
      const hgTop = halfGeo(PRT, -0.05), hgBot = halfGeo(pr, 0);
      // 外框用「整顆膠囊」一個外殼來描（不是上下兩半各描一次），接縫處才不會疊出一段特別粗的黑線
      const fullOl = (() => {
        const pts = [];
        for (let i = 0; i <= 16; i++){ const a = -Math.PI / 2 + (i / 16) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(pr * Math.cos(a), 0.0001), -ph + pr * Math.sin(a))); }
        pts.push(new THREE.Vector2(pr, -0.05), new THREE.Vector2(PRT, -0.05));
        for (let i = 0; i <= 16; i++){ const a = (i / 16) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(PRT * Math.cos(a), 0.0001), ph + PRT * Math.sin(a))); }
        return smoothGeo(new THREE.LatheGeometry(pts, 64));
      })();
      const seamGeo = new THREE.TorusGeometry(PRT + 0.002, 0.0035, 6, 48);
      const inkM = new THREE.MeshBasicMaterial({color:INK}), whiteM = new THREE.MeshBasicMaterial({color:0xffffff});
      function stad(w, h){
        const r = Math.min(w, h) / 2, sh = new THREE.Shape(), hw = w / 2 - r, hh = h / 2 - r;
        sh.absarc(hw, hh, r, 0, Math.PI / 2, false); sh.absarc(-hw, hh, r, Math.PI / 2, Math.PI, false);
        sh.absarc(-hw, -hh, r, Math.PI, Math.PI * 1.5, false); sh.absarc(hw, -hh, r, Math.PI * 1.5, Math.PI * 2, false);
        return sh;
      }
      const dotIn = new THREE.ShapeGeometry(stad(0.022, 0.022), 12), dotOut = new THREE.ShapeGeometry(stad(0.03, 0.03), 12);
      const barIn = new THREE.ShapeGeometry(stad(0.02, 0.12), 12), barOut = new THREE.ShapeGeometry(stad(0.028, 0.128), 12);
      const ZA = new THREE.Vector3(0, 0, 1);
      function stick(inG, outG, nx, nz, R, y){
        const g = new THREE.Group(), o = new THREE.Mesh(outG, inkM), f = new THREE.Mesh(inG, whiteM);
        f.position.z = 0.0008; g.add(o, f);
        const n = new THREE.Vector3(nx, 0, nz).normalize();
        g.position.set(n.x * R, y, n.z * R); g.quaternion.setFromUnitVectors(ZA, n); return g;
      }
      const limeM = litMat(0xbaf65a, MAT.gelatin);
      const gradM = new THREE.ShaderMaterial({
        uniforms:{ len:{value:ph + pr} },
        vertexShader:`uniform float len; varying float vT; varying vec3 vN; varying vec3 vV;
          void main(){ vT = position.y / len; vec4 p = vec4(position, 1.0); vec3 nn = normal;
            #ifdef USE_INSTANCING
              p = instanceMatrix * p; nn = mat3(instanceMatrix) * nn;
            #endif
            vN = normalize(normalMatrix * nn); vec4 mv = modelViewMatrix * p; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
        fragmentShader:`varying float vT; varying vec3 vN; varying vec3 vV; ${LIT_GLSL}
          void main(){ vec3 n = normalize(vN);
            vec3 c = mix(vec3(0.0, 0.863, 1.0), vec3(1.0), smoothstep(0.05, 0.85, vT));
            gl_FragColor = vec4(litColor(c, n, normalize(vV), ${MAT.gelatin.spec.toFixed(2)}, ${MAT.gelatin.shin.toFixed(1)}), 1.0); }`
      });
      // 瓶子裡裝約七分滿的膠囊（隔著半透明玻璃看得到）
      {
        let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
        const mats = [], Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ'), S1 = new THREE.Vector3(1, 1, 1), FLIP = new THREE.Matrix4().makeRotationX(Math.PI);
        for (let y = yB + 0.17; y < yT - 0.32; y += 0.2){
          [[0, 1], [0.40, 4], [0.68, 7]].forEach(([r, n]) => {
            const off = rnd() * Math.PI * 2;
            for (let k = 0; k < n; k++){
              const a = off + k / n * Math.PI * 2;
              const V = new THREE.Vector3(r * Math.cos(a), y + (rnd() - 0.5) * 0.05, r * Math.sin(a));
              E.set((rnd() - 0.5) * 0.5, -a + Math.PI / 2 + (rnd() - 0.5) * 0.5, Math.PI / 2 + (rnd() - 0.5) * 0.4);   // 沿著瓶壁橫躺，不會穿出玻璃
              Q.setFromEuler(E); mats.push(new THREE.Matrix4().compose(V, Q.clone(), S1));
            }
          });
        }
        const N = mats.length;
        const mk = (geo, mat, flip) => { const im = new THREE.InstancedMesh(geo, mat, N); mats.forEach((m, i) => im.setMatrixAt(i, flip ? m.clone().multiply(FLIP) : m)); g.add(im); return im; };
        mk(hgTop, limeM); mk(hgBot, gradM, true);
        mk(fullOl, ol);
      }

      if (o.pile){
      const P = [[0.649,-1.195,0.442,-0.53,0.00],[1.142,-1.195,0.137,-0.75,0.00],[1.463,-1.195,0.631,1.17,0.00],[1.908,-1.195,-0.198,-0.84,0.00],[0.707,-1.195,-0.102,-1.58,0.00],[0.558,-1.195,0.942,0.13,0.00],[1.621,-1.195,0.083,-0.31,0.00],[1.793,-1.195,0.780,1.44,0.00],[1.457,-1.195,-0.467,0.90,0.00],[1.084,-1.195,0.841,1.30,0.00],[0.978,-1.195,-0.547,-1.40,0.00],[0.359,-1.195,-0.360,-1.31,0.00],[0.700,-0.985,0.693,-0.19,0.04],[1.688,-0.985,-0.076,-0.44,0.12],[0.809,-0.985,0.293,-0.18,-0.07],[1.648,-0.985,0.575,1.36,0.11],[0.557,-0.985,-0.333,1.57,-0.07],[1.256,-0.775,0.033,0.60,0.05],[1.142,-0.775,0.438,0.58,-0.07],[0.816,-0.775,-0.084,0.85,0.01],[0.922,-0.575,0.071,0.80,0.04]];
      // 整堆放大 1.3 倍（以靠藥瓶那側的地面為支點，確保不碰到瓶身、也不陷進地面）
      const PS = 0.95, pileG = new THREE.Group(); bs.add(pileG);
      pileG.scale.setScalar(PS); pileG.position.set(0.45 * (1 - PS), yB * (1 - PS), 0.2 * (1 - PS));
      P.forEach(([x, y, z, yaw, tilt], i) => {
        const outer = new THREE.Group(); outer.rotation.order = 'YXZ';
        outer.position.set(x, y, z); outer.rotation.set(0, yaw, tilt);
        const inner = new THREE.Group(); inner.rotation.set(i % 2 ? Math.PI / 2 : -Math.PI / 2, 0, -Math.PI / 2);
        const top = new THREE.Mesh(hgTop, limeM), bot = new THREE.Mesh(hgBot, gradM);
        bot.rotation.x = Math.PI;
        inner.add(new THREE.Mesh(fullOl, ol));
        inner.add(top, bot); rimLine(inner, PRT, -0.05, ol);
        outer.add(inner); pileG.add(outer);
      });
      const ps = contactShadow();
      ps.rotation.x = -Math.PI / 2; ps.position.set(1.13, yB - 0.012, 0.2); ps.scale.set(2.6, 2.4, 1); pileG.add(ps);
      }
    }

  /* ===== 縮圖用鏡頭與動畫 ===== */
  cam.aspect = 1;
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const HH = 2.45;                                    // 上下留一點白，瓶蓋和影子不會被切到
  cam.position.set(0, 0.95, HH / t); cam.lookAt(0, 0.36, 0);
  cam.updateProjectionMatrix();
  syncOutline(ol, br); syncOutline(olGlass, br);

  document.documentElement.classList.add('bottle-3d');
  let yaw = -0.35, last = performance.now();
  function loop(now){
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const thumbs = document.querySelectorAll('canvas.bottle-thumb');
    if (!thumbs.length) return;
    if (!reduce){ yaw += dt * 0.45; needsDraw = true; }   // 慢慢自轉，看得到標籤正面和背面
    g.rotation.y = yaw;
    if (needsDraw){ br.render(bs, cam); needsDraw = false; }
    thumbs.forEach(c => {
      const w = Math.round(c.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
      if (!w) return;
      if (c.width !== w || c.height !== w){ c.width = w; c.height = w; }
      const x = c.getContext('2d'); x.clearRect(0, 0, w, w); x.drawImage(cv, 0, 0, w, w);
    });
  }
  requestAnimationFrame(loop);
  }
  // three.js 主要來源載入失敗時，改用第二個來源
  if (typeof THREE !== 'undefined') start();
  else {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js';
    s.onload = start; document.head.appendChild(s);
  }
})();

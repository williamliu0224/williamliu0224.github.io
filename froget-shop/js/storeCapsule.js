/* 商店主視覺用的不累不累丸膠囊（細胞分裂預覽版的 capsule.js，加上 export 給 storeHero.js 用 import 載入） */
/* =========================================================
   不累不累丸的膠囊（給「細胞分裂」主視覺用）
   外殼的造型和材質從「不累不累丸_膠囊動畫/index.html」原封不動搬過來：
     01 上殼・心態防護衣（乳白半透光明膠）、02 下殼・快捷鍵記憶膠（藍色漸層清透玻璃）、
     03 雙色漩渦微粒（液態玻璃糖果，數量可以少放）
   上下殼有萊姆綠 1px 描邊（螢幕固定寬度）。
   用法：
     const kit = createCapsuleKit(THREE);          // 共用的材質、描邊（建一次）
     const cap = kit.make(4);                       // 一顆膠囊，裡面 4 顆糖果；cap 是 THREE.Group，長軸是 y
     kit.syncOutlines(renderer);                    // 視窗大小改變時呼叫
     kit.update(秒數);                              // 每一格：糖果裡的漩渦流動
   ========================================================= */
export function createCapsuleKit(THREE){
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

  const olMain = makeOutlineMat(); rimMatFor(olMain);
  // 膠囊上下殼專用描邊（萊姆綠）
  const SHELL_INK = 0xc8fa64;
  const olShell = makeOutlineMat(); olShell.uniforms.ink.value.set(SHELL_INK);
  rimMatFor(olShell).uniforms.ink.value.set(SHELL_INK);
  // 玻璃下殼用：只畫輪廓附近的描邊
  const olGlass = makeOutlineMat(); olGlass.uniforms.ink.value.set(SHELL_INK);
  olGlass.vertexShader = olGlass.vertexShader.replace('void main(){', 'varying float vFace;\n        void main(){').replace('gl_Position = c;', 'gl_Position = c; vFace = dot(nv, normalize(-(modelViewMatrix * p).xyz));');
  olGlass.fragmentShader = 'uniform vec3 ink; varying float vFace; void main(){ if (vFace < -0.3) discard; gl_FragColor = vec4(ink, 1.0); }';

  // ---- 01 上殼、02 下殼（跟商品頁同一份程式）----
  const CAPTOP = {"thick":0.042,"lipRound":1,"base":"#c8fa6e","milk":0.12,"opacity":0.88,"sss":0.55,"sssColor":"#efffbf","sssSpread":0.5,"wrap":0.5,"shadow":0.72,"spec":0.5,"gloss":70,"env":0.22,"rim":0.35,"innerDark":0.72,"innerAO":0.55,"innerGlow":0.6,"lipBright":0.4,"rimLines":true,"lightAz":-33,"lightEl":36};
  const R_TOP = 0.628, R_TOP_IN = R_TOP - CAPTOP.thick, R_BOT = R_TOP_IN - 0.003, OL = 0.016;
  const CAPBOT = {"thick":0.019,"lipRound":1,"blue":"#00dcff","gradStart":0,"gradEnd":0.62,"blueAlpha":0.49,"clearAlpha":0.33,"tint":0,"diffuse":0.04,"env":0.55,"streak":1.5,"fresPow":3.5,"fresAlpha":0.55,"edgeTint":0.51,"spec":1.05,"gloss":216,"innerAlpha":0.8,"lipBright":0.6,"lipAlpha":0.85,"rimLines":true};   // 下殼半徑跟著上殼內徑走，才套得進去
  const TOP_Y0 = -0.15, TOP_YC = 0.72;
  const capTop = new THREE.Group();
  {
    const C = CAPTOP, az = C.lightAz * Math.PI / 180, el = C.lightEl * Math.PI / 180;
    const U = {
      uBase:{value:new THREE.Color(C.base)}, uSSSCol:{value:new THREE.Color(C.sssColor)},
      uMilk:{value:C.milk}, uOpacity:{value:C.opacity}, uSSS:{value:C.sss}, uSpread:{value:C.sssSpread},
      uWrap:{value:C.wrap}, uShadow:{value:C.shadow}, uSpec:{value:C.spec}, uGloss:{value:C.gloss}, uEnv:{value:C.env}, uRim:{value:C.rim},
      uInnerDark:{value:C.innerDark}, uInnerAO:{value:C.innerAO}, uInnerGlow:{value:C.innerGlow}, uLip:{value:C.lipBright},
      uThick:{value:C.thick}, uL:{value:new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))},
      uY0:{value:TOP_Y0}, uYTop:{value:TOP_YC + R_TOP_IN}
    };
    const VS = `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
    const FS = `uniform vec3 uBase; uniform vec3 uSSSCol; uniform vec3 uL;
      uniform float uMilk, uOpacity, uSSS, uSpread, uWrap, uShadow, uSpec, uGloss, uEnv, uRim;
      uniform float uInnerDark, uInnerAO, uInnerGlow, uLip, uThick, uY0, uYTop;
      varying vec3 vN; varying vec3 vV; varying float vY;
      vec3 envCol(vec3 r){
        vec3 e = mix(vec3(0.80, 0.82, 0.84), vec3(1.0), smoothstep(-0.25, 0.6, r.y));
        e += vec3(0.9) * smoothstep(0.86, 0.96, dot(r, normalize(vec3(-0.5, 0.55, 0.65))));
        e += vec3(0.35) * smoothstep(0.9, 0.98, dot(r, normalize(vec3(0.75, 0.2, 0.6))));
        return e;
      }
      void main(){
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(vV); vec3 L = normalize(uL);
        vec3 alb = mix(uBase, vec3(1.0), uMilk * 0.45);
        float ndl = dot(n, L);
        float wd = clamp((ndl + uWrap) / (1.0 + uWrap), 0.0, 1.0);
        float thin = 1.0 - smoothstep(0.004, 0.08, uThick);
      #if defined(OUTER)
        vec3 col = alb * mix(uShadow, 1.0, wd);
        vec3 H = normalize(L + n * uSpread);
        float back = pow(clamp(dot(v, -H), 0.0, 1.0), 3.0);
        float term = pow(1.0 - abs(ndl), 3.0);
        col += uSSSCol * uSSS * (0.6 * back + 0.35 * term) * mix(0.55, 1.0, thin);
        col = mix(col, uSSSCol, clamp(uSSS * 0.14 * (1.0 - wd), 0.0, 1.0));
        vec3 h = normalize(L + v);
        float sp = pow(max(dot(n, h), 0.0), uGloss) * uSpec * (uGloss + 8.0) / 25.13 * 0.35;
        float F = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        col = mix(col, envCol(reflect(-v, n)), clamp(uEnv * (0.12 + 0.88 * F), 0.0, 1.0));
        col += vec3(sp);
        col += vec3(1.0) * F * uRim * (0.3 + 0.7 * uMilk);
        gl_FragColor = vec4(col, mix(uOpacity, 1.0, F * 0.7));
      #elif defined(INNER)
        vec3 col = alb * uInnerDark * mix(uShadow, 1.0, wd);
        float depth = smoothstep(uY0, uYTop, vY);
        col *= mix(1.0, 1.0 - uInnerAO * 0.45, depth);
        col += uSSSCol * uSSS * 0.22 * mix(1.0, 0.6, depth);
        float through = max(dot(-n, L), 0.0);
        col += uSSSCol * uSSS * uInnerGlow * through * 0.5 * mix(0.6, 1.0, thin);
        vec3 h = normalize(L + v);
        col += vec3(pow(max(dot(n, h), 0.0), max(uGloss * 0.5, 4.0)) * uSpec * 0.12);
        gl_FragColor = vec4(col, 1.0);
      #else
        vec3 col = mix(alb, vec3(1.0), uLip * 0.6) * mix(uShadow, 1.0, wd) + uSSSCol * uSSS * 0.18;
        gl_FragColor = vec4(col, 1.0);
      #endif
      }`;
    const mk = (kind, side) => new THREE.ShaderMaterial({ uniforms:U, vertexShader:VS, fragmentShader:FS, defines:{[kind]:''}, side });
    const outerM = mk('OUTER', THREE.FrontSide); outerM.transparent = true; outerM.depthWrite = false;
    const innerM = mk('INNER', THREE.BackSide), lipM = mk('LIP', THREE.DoubleSide);
    // 剖面輪廓：外殼、內壁、開口圓唇
    const t = C.thick, Ri = R_TOP_IN, rl = C.lipRound * t * 0.5, N = 32, V2 = THREE.Vector2;
    const dome = (r, arr) => { for (let i = 1; i <= N; i++){ const a = (i / N) * Math.PI / 2; arr.push(new V2(Math.max(r * Math.cos(a), 0.0001), TOP_YC + r * Math.sin(a))); } return arr; };
    const outerP = dome(R_TOP, [new V2(R_TOP, TOP_Y0 + rl), new V2(R_TOP, TOP_YC)]);
    const innerP = dome(Ri, [new V2(Ri, TOP_Y0 + rl), new V2(Ri, TOP_YC)]);
    let lipP;
    if (rl < 1e-5) lipP = [new V2(Ri, TOP_Y0), new V2(R_TOP, TOP_Y0)];
    else {
      lipP = [];
      for (let k = 0; k <= 8; k++){ const a = Math.PI + (k / 8) * Math.PI / 2; lipP.push(new V2(Ri + rl + rl * Math.cos(a), TOP_Y0 + rl + rl * Math.sin(a))); }
      for (let k = 0; k <= 8; k++){ const a = 1.5 * Math.PI + (k / 8) * Math.PI / 2; lipP.push(new V2(R_TOP - rl + rl * Math.cos(a), TOP_Y0 + rl + rl * Math.sin(a))); }
    }
    const SEG = 128;
    const inner = new THREE.Mesh(new THREE.LatheGeometry(innerP, SEG), innerM); inner.renderOrder = 1;
    const lip = new THREE.Mesh(new THREE.LatheGeometry(lipP, SEG), lipM); lip.renderOrder = 1;
    const outer = new THREE.Mesh(new THREE.LatheGeometry(outerP, SEG), outerM); outer.renderOrder = 10;   // 最後畫，才透得到裡面的下殼
    // 外框：唇邊＋外殼合成一個輪廓來描，接縫處線不會變粗
    const hull = new THREE.Mesh(smoothGeo(new THREE.LatheGeometry(lipP.concat(outerP.slice(1)), SEG)), olShell);
    capTop.add(inner, lip, outer, hull);
    if (C.rimLines){ rimLine(capTop, R_TOP, TOP_Y0 + rl, olShell); rimLine(capTop, Ri - 0.004, TOP_Y0 + rl, olShell); }   // 開口內外兩圈邊線（合起來時外圈就是接縫線）
  }

  // 02 下殼：清透玻璃，藍色從接縫淡出成透明（參數來自調校台）
  const capBot = new THREE.Group();
  capBot.rotation.x = Math.PI;
  let botRim;
  {
    const C = CAPBOT, TOP_L = capTop.children[0].material.uniforms.uL;   // 跟上殼同一個光源方向
    const B_Y0 = -0.35, B_YC = 0.72;
    const UB = {
      uBlue:{value:new THREE.Color(C.blue)}, uGS:{value:C.gradStart}, uGE:{value:C.gradEnd}, uBA:{value:C.blueAlpha}, uCA:{value:C.clearAlpha}, uTint:{value:C.tint},
      uDiff:{value:C.diffuse}, uEnv:{value:C.env}, uStreak:{value:C.streak}, uFP:{value:C.fresPow}, uFA:{value:C.fresAlpha}, uEdge:{value:C.edgeTint},
      uSpec:{value:C.spec}, uGloss:{value:C.gloss}, uInA:{value:C.innerAlpha}, uLip:{value:C.lipBright}, uLipA:{value:C.lipAlpha},
      uY0:{value:B_Y0}, uYT:{value:B_YC + R_BOT}, uL:TOP_L
    };
    const VS = `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
    const FS = `uniform vec3 uBlue; uniform vec3 uL;
      uniform float uGS, uGE, uBA, uCA, uTint, uDiff, uEnv, uStreak, uFP, uFA, uEdge, uSpec, uGloss, uInA, uLip, uLipA, uY0, uYT;
      varying vec3 vN; varying vec3 vV; varying float vY;
      vec3 envCol(vec3 r){
        vec3 e = mix(vec3(0.80, 0.82, 0.84), vec3(1.0), smoothstep(-0.25, 0.6, r.y));
        e += vec3(0.9) * smoothstep(0.86, 0.96, dot(r, normalize(vec3(-0.5, 0.55, 0.65))));
        e += vec3(0.35) * smoothstep(0.9, 0.98, dot(r, normalize(vec3(0.75, 0.2, 0.6))));
        return e;
      }
      void main(){
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(vV); vec3 L = normalize(uL);
        float t = clamp((vY - uY0) / (uYT - uY0), 0.0, 1.0);
        float g = smoothstep(uGS, max(uGE, uGS + 0.001), t);
        vec3 clearCol = mix(vec3(1.0), uBlue, uTint);
        vec3 base = mix(uBlue, clearCol, g);
        float wd = clamp((dot(n, L) + 0.5) / 1.5, 0.0, 1.0);
      #if defined(LIP)
        gl_FragColor = vec4(mix(base, vec3(1.0), uLip * 0.7) * mix(0.82, 1.0, wd), max(uLipA, mix(uBA, uCA, g)));
      #else
        vec3 col = base * mix(1.0, mix(0.72, 1.0, wd), uDiff * (1.0 - 0.7 * g));
        float F = pow(1.0 - max(dot(n, v), 0.0), uFP);
        vec3 edgeCol = mix(uBlue * 0.55, clearCol * 0.9, g * 0.8);
        col = mix(col, edgeCol, clamp(F * uEdge, 0.0, 1.0));
        vec3 r = reflect(-v, n);
        vec3 env = mix(envCol(r), vec3(0.97, 0.99, 1.0), 0.6);
        float streak = smoothstep(0.1, 0.0, abs(r.x + 0.42)) * smoothstep(-0.7, 0.1, r.y) * uStreak;
        float er = clamp(uEnv * (0.06 + 0.94 * F), 0.0, 1.0);
        col = mix(col, env, er) + vec3(streak);
        float sp = pow(max(dot(n, normalize(L + v)), 0.0), uGloss) * uSpec;
        col += vec3(sp);
        float a = max(max(mix(uBA, uCA, g), F * uFA), er * 0.4);
        a = clamp(a + sp + streak * 0.8, 0.0, 1.0);
        #if defined(INNER)
          a *= uInA;
        #endif
        gl_FragColor = vec4(col, a);
      #endif
      }`;
    const mk = (kind, side) => { const m = new THREE.ShaderMaterial({ uniforms:UB, vertexShader:VS, fragmentShader:FS, defines:{[kind]:''}, side, transparent:true }); m.depthWrite = false; return m; };
    const t = C.thick, Ri = R_BOT - t, rl = C.lipRound * t * 0.5, N = 32, V2 = THREE.Vector2;
    const dome = (r, arr) => { for (let i = 1; i <= N; i++){ const a = (i / N) * Math.PI / 2; arr.push(new V2(Math.max(r * Math.cos(a), 0.0001), B_YC + r * Math.sin(a))); } return arr; };
    const outerP = dome(R_BOT, [new V2(R_BOT, B_Y0 + rl), new V2(R_BOT, B_YC)]);
    const innerP = dome(Ri, [new V2(Ri, B_Y0 + rl), new V2(Ri, B_YC)]);
    let lipP;
    if (rl < 1e-5) lipP = [new V2(Ri, B_Y0), new V2(R_BOT, B_Y0)];
    else {
      lipP = [];
      for (let k = 0; k <= 8; k++){ const a = Math.PI + (k / 8) * Math.PI / 2; lipP.push(new V2(Ri + rl + rl * Math.cos(a), B_Y0 + rl + rl * Math.sin(a))); }
      for (let k = 0; k <= 8; k++){ const a = 1.5 * Math.PI + (k / 8) * Math.PI / 2; lipP.push(new V2(R_BOT - rl + rl * Math.cos(a), B_Y0 + rl + rl * Math.sin(a))); }
    }
    const SEG = 128;
    const innerGeo = new THREE.LatheGeometry(innerP, SEG);
    const inner = new THREE.Mesh(innerGeo, mk('INNER', THREE.BackSide)); inner.renderOrder = 3;
    const lip = new THREE.Mesh(new THREE.LatheGeometry(lipP, SEG), mk('LIP', THREE.DoubleSide)); lip.renderOrder = 4;
    const outer = new THREE.Mesh(new THREE.LatheGeometry(outerP, SEG), mk('OUTER', THREE.FrontSide)); outer.renderOrder = 5;
    const hull = new THREE.Mesh(smoothGeo(new THREE.LatheGeometry(lipP.concat(outerP.slice(1)), SEG)), olGlass);
    capBot.add(inner, lip, outer, hull);
    // 開口內外兩圈邊線：只在拆開、開口露出來時才顯示（合起來時藏在上殼裡）
    botRim = new THREE.Group(); capBot.add(botRim);
    if (C.rimLines){ rimLine(botRim, R_BOT, B_Y0 + rl, olShell); rimLine(botRim, Ri - 0.004, B_Y0 + rl, olShell); }
    botRim.visible = false;
  }

  // 合起來的樣子：下殼套進上殼
  capBot.position.y = -0.0;
  const proto = new THREE.Group(); proto.add(capTop, capBot);
  botRim.visible = false;

  // ---- 03 漩渦糖果（跟商品頁同一份程式，數量可調）----
  const BEADS = {"size":0.14,"ior":2,"absorb":2.7,"bodyMin":0.37,"env":0.5,"spec":1.2,"gloss":260,"rim":0.5,"edge":0.35,"caustic":0.6,"pinkBody":"#fb6291","pinkMilk":0.1,"pinkRib":"#ffffff","whiteBody":"#ffffff","whiteMilk":0.55,"whiteRib":"#ff7aa5","arms":1,"tight":11.4,"twist":-8,"ribW":0.49,"ribSoft":0.08,"ribH":0.05,"ribR":0.9,"ribA":1.35,"flow":2,"wobAmp":0.05,"wobFreq":1,"wobSpeed":1,"wobIdle":0.15};
  const beadTime = {value:0};
  // 20 顆位置：繞開下殼中央的青蛙（合起來時青蛙待在那裡），青蛙正前方留空，正面看得到臉
  const homes = [[0.38,-0.38,0.06],[-0.30,-1.00,-0.04],[-0.31,-0.30,-0.25],[-0.16,-0.30,0.36],[0.30,-0.94,-0.18],[0.11,-0.91,0.35],[0.14,-0.50,-0.36],[-0.38,-0.60,0.13],[-0.20,-0.73,-0.34],[0.05,-1.10,0.04],
    [0.39,-0.76,0.12],[0.18,-0.32,0.33],[-0.04,-1.01,-0.27],[-0.19,-0.90,0.25],[-0.22,-0.30,0.05],[0.37,-0.60,-0.14],[0.31,-0.30,-0.22],[0.14,-0.79,-0.38],[-0.02,-0.30,-0.22],[-0.36,-0.56,-0.16]];
  const makeBeads = (pill, count) => {
    const B = BEADS;
    const VS = `
      uniform float uTime, uPhase, uWob, uWobAmp, uWobFreq;
      varying vec3 vVP; varying vec3 vNV; varying vec3 vC; varying float vS; varying mat3 vRot;
      void main(){
        vec3 p = position;
        float w = uWob * uWobAmp;
        float d = w * (sin(p.y * uWobFreq * 3.0 + uTime * 7.0 + uPhase) * 0.6 + sin(p.x * uWobFreq * 2.0 - uTime * 5.3 + uPhase * 1.7) * 0.4);
        vec3 grad = vec3(cos(p.x * uWobFreq * 2.0 - uTime * 5.3 + uPhase * 1.7) * 0.4 * uWobFreq * 2.0, cos(p.y * uWobFreq * 3.0 + uTime * 7.0 + uPhase) * 0.6 * uWobFreq * 3.0, 0.0) * w;
        p += normal * d;
        vec3 nObj = normalize(normal - (grad - normal * dot(grad, normal)));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vVP = mv.xyz; vNV = normalize(normalMatrix * nObj);
        vC = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vS = length(modelViewMatrix[0].xyz);
        mat3 m = mat3(modelViewMatrix) / vS;
        vRot = mat3(m[0].x, m[1].x, m[2].x, m[0].y, m[1].y, m[2].y, m[0].z, m[1].z, m[2].z);
        gl_Position = projectionMatrix * mv;
      }`;
    // 沿著折射後的視線在球裡走一段，累積漩渦絲帶的顏色（像彈珠裡的彩色絲帶）
    const FS = `
      uniform vec3 uL; uniform vec3 uBody; uniform vec3 uRib; uniform float uMilk;
      uniform float uIor, uAbsorb, uBodyMin, uEnv, uSpec, uGloss, uRim, uEdge, uCaustic;
      uniform float uArms, uTight, uTwist, uRW, uRSoft, uRH, uRR, uRA, uFlow, uTime, uPhase;
      varying vec3 vVP; varying vec3 vNV; varying vec3 vC; varying float vS; varying mat3 vRot;
      void main(){
        vec3 V = normalize(-vVP); vec3 nV = normalize(vNV);
        vec3 ro = vRot * (-vC) / vS;
        vec3 p = normalize(vRot * (vVP - vC) / vS);
        vec3 rd = normalize(p - ro);
        vec3 rIn = refract(rd, p, 1.0 / uIor);
        if (dot(rIn, rIn) < 0.5) rIn = rd;
        float tEx = max(-2.0 * dot(p, rIn), 0.0);
        const int N = 36;
        float dt = tEx / float(N);
        vec3 acc = vec3(0.0); float aAcc = 0.0;
        float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        for (int i = 0; i < N; i++){
          vec3 q = p + rIn * (float(i) + jit) * dt;
          float rho = length(q.xz);
          float ph = atan(q.z, q.x) * uArms - rho * uTight + q.y * uTwist + uTime * uFlow + uPhase;
          float band = smoothstep(1.0 - uRW - uRSoft, 1.0 - uRW, 0.5 + 0.5 * cos(ph));
          float mask = (1.0 - smoothstep(uRH * 0.55, uRH, abs(q.y))) * (1.0 - smoothstep(uRR - 0.15, uRR, rho));
          float a = 1.0 - exp(-band * mask * uRA * 30.0 * dt);
          acc += (1.0 - aAcc) * a * uRib * (float(i) < float(N) * 0.5 ? 1.0 : 0.85);
          aAcc += (1.0 - aAcc) * a;
        }
        vec3 bodyCol = mix(uBody, vec3(1.0), uMilk * 0.6);
        float bodyA = mix(uBodyMin, 1.0, 1.0 - exp(-uAbsorb * tEx));
        bodyA = mix(bodyA, 1.0, uMilk * 0.5);
        vec3 col = acc + (1.0 - aAcc) * bodyCol * bodyA;
        float alpha = aAcc + (1.0 - aAcc) * bodyA;
        vec3 c = col / max(alpha, 0.001);
        vec3 L = normalize(uL);
        float F = pow(1.0 - max(dot(nV, V), 0.0), 3.0);
        float caus = pow(max(dot(nV, -L) * 0.5 + 0.5, 0.0), 6.0) * uCaustic * (1.0 - F);
        c += mix(bodyCol, vec3(1.0), 0.5) * caus;
        alpha = max(alpha, caus * 0.8);
        c = mix(c, uBody * 0.45 + vec3(0.04), clamp(F * uEdge * 1.6, 0.0, 1.0));   // 鏡片暗邊，取代描邊
        vec3 r = reflect(-V, nV);
        vec3 env = mix(vec3(0.86, 0.89, 0.93), vec3(1.0), smoothstep(-0.2, 0.6, r.y));
        env += vec3(1.0) * smoothstep(0.88, 0.97, dot(r, normalize(vec3(-0.5, 0.55, 0.65))));
        env += vec3(0.4) * smoothstep(0.92, 0.985, dot(r, normalize(vec3(0.7, 0.25, 0.65))));
        float er = clamp(uEnv * (0.04 + 0.96 * F), 0.0, 1.0);
        c = mix(c, env, er);
        float sp = pow(max(dot(nV, normalize(L + V)), 0.0), uGloss) * uSpec;
        c += vec3(sp);
        alpha = clamp(max(alpha, F * uRim) + sp + er * 0.3, 0.0, 1.0);
        gl_FragColor = vec4(c, alpha);
      }`;
    const SH = {
      uIor:{value:B.ior}, uAbsorb:{value:B.absorb}, uBodyMin:{value:B.bodyMin}, uEnv:{value:B.env}, uSpec:{value:B.spec}, uGloss:{value:B.gloss},
      uRim:{value:B.rim}, uEdge:{value:B.edge}, uCaustic:{value:B.caustic},
      uArms:{value:Math.round(B.arms)}, uTight:{value:B.tight}, uTwist:{value:B.twist}, uRW:{value:B.ribW}, uRSoft:{value:B.ribSoft},
      uRH:{value:B.ribH}, uRR:{value:B.ribR}, uRA:{value:B.ribA}, uFlow:{value:B.flow},
      uWobAmp:{value:B.wobAmp}, uWobFreq:{value:B.wobFreq}, uTime:beadTime,
      uL:capTop.children[0].material.uniforms.uL   // 跟膠囊殼同一個光源方向
    };
    const KIND = {
      pink:{ uBody:{value:new THREE.Color(B.pinkBody)}, uRib:{value:new THREE.Color(B.pinkRib)}, uMilk:{value:B.pinkMilk} },
      white:{ uBody:{value:new THREE.Color(B.whiteBody)}, uRib:{value:new THREE.Color(B.whiteRib)}, uMilk:{value:B.whiteMilk} }
    };
    const geo = new THREE.SphereGeometry(1, 64, 48);
    return homes.slice(0, count).map(([x, y, z], i) => {
      // 每顆一份材質：各自的漩渦相位與晃動量
      const mat = new THREE.ShaderMaterial({ uniforms:Object.assign({}, SH, KIND[i % 2 === 0 ? 'pink' : 'white'], {uPhase:{value:i * 1.7}, uWob:{value:0}}), vertexShader:VS, fragmentShader:FS, transparent:true });
      const m = new THREE.Mesh(geo, mat);
      const home = new THREE.Vector3(x, y, z);
      m.position.copy(home); m.scale.setScalar(B.size);
      m.rotation.set(Math.PI/2 + (i%3-1)*0.12, (i%2?0.15:-0.12), i * 0.9);
      m.userData.home = home; m.userData.rot = m.rotation.clone();
      m.userData.dir = new THREE.Vector3(x || 0.15, 0, z || 0.1).normalize();
      m.userData.prev = home.clone(); m.userData.wob = 0;
      pill.add(m); return m;
    });
  };


  // 每種數量做一份糖果（同數量的膠囊共用材質）
  const beadSets = {};
  function beadGroup(n){
    if (!beadSets[n]){ const g = new THREE.Group(); makeBeads(g, n); beadSets[n] = g; }
    return beadSets[n].clone();
  }
  return {
    // 一顆膠囊：外殼共用幾何和材質，再放 n 顆糖果
    make(n){
      const g = new THREE.Group();
      g.add(proto.clone());
      if (n > 0) g.add(beadGroup(n));
      return g;
    },
    // 所有東西的畫圖順序往後移（才能夾在小青蛙泡泡的前後兩層玻璃中間）
    offsetOrder(obj, k){ obj.traverse(o => { if (o.isMesh) o.renderOrder = (o.renderOrder || 0) + k; }); },
    syncOutlines(rend){ [olMain, olShell, olGlass].forEach(m => syncOutline(m, rend)); },
    update(t){ beadTime.value = t; },
    lightUniform: capTop.children[0].material.uniforms.uL
  };
}

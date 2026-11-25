// ===== 四層青蛙貼布（共用）=====
// 由正面往背面：白色霧面外層 → 綠色透明凸點層 → 藍色透明電路層 → 白色霧面底層
// 單位：公尺。貼布平面在 XY，正面朝 +Z。
// opt.transparentBackground = true：3D 畫布背景透明、讓網站背景透出時使用
// opt.gridSlabs = true：薄片切成細網格，可以彎曲、拉伸（Q 彈貼布用）
function makeFourLayerPatch(THREE, RoundedBoxGeometry, opt = {}) {
  const W = 0.1, H = 0.14, CORNER = 0.006;
  const L = {                        // 各層厚度與組合時的位置（中心 z）
    w1: { t: 0.00035, z: 0.00205 },
    g:  { t: 0.0005,  z: 0.00055 },  // 凸起在綠層正面，高約 1.1 mm，所以 w1 留空隙
    b:  { t: 0.0005,  z: -0.00015 },
    w2: { t: 0.00035, z: -0.00075 },
  };

  // ---- 圓角長方形薄片 ----
  function slab(t) {
    const s = new THREE.Shape(), w = W / 2, h = H / 2, r = CORNER;
    s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
    s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h);
    s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.25,
      bevelSize: t * 0.25, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -t / 2);
    // 讓正面 UV 對應 0~1（給電路貼圖用）
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w) / W, (p.getY(i) + h) / H);
    return g;
  }

  // ---- 細網格薄片：正反面都切成小格子，才能被彎曲、拉伸（opt.gridSlabs 時使用）----
  function gridSlab(t, nx = 40, ny = 56) {
    const w = W / 2, h = H / 2, r = CORNER;
    const pts = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      let x = -w + (i / nx) * W, y = -h + (j / ny) * H;
      const cx = Math.sign(x) * (w - r), cy = Math.sign(y) * (h - r);   // 圓角：角落外的點拉回圓弧上
      if (Math.abs(x) > w - r && Math.abs(y) > h - r) {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        if (d > r) { x = cx + dx * r / d; y = cy + dy * r / d; }
      }
      pts.push([x, y]);
    }
    const pos = [], uv = [], idx = [];
    const add = (x, y, z) => { pos.push(x, y, z); uv.push((x + w) / W, (y + h) / H); return pos.length / 3 - 1; };
    const front = pts.map(([x, y]) => add(x, y, t / 2)), back = pts.map(([x, y]) => add(x, y, -t / 2));
    const id = (i, j) => j * (nx + 1) + i;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
      idx.push(front[a], front[b], front[c], front[a], front[c], front[d]);
      idx.push(back[a], back[c], back[b], back[a], back[d], back[c]);
    }
    // 側邊：沿著外框一圈
    const ring = [];
    for (let i = 0; i < nx; i++) ring.push(id(i, 0));
    for (let j = 0; j < ny; j++) ring.push(id(nx, j));
    for (let i = nx; i > 0; i--) ring.push(id(i, ny));
    for (let j = ny; j > 0; j--) ring.push(id(0, j));
    for (let k = 0; k < ring.length; k++) {
      const [x0, y0] = pts[ring[k]], [x1, y1] = pts[ring[(k + 1) % ring.length]];
      const p = add(x0, y0, t / 2), q = add(x1, y1, t / 2), rr = add(x1, y1, -t / 2), s2 = add(x0, y0, -t / 2);
      idx.push(p, s2, rr, p, rr, q);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---- 藍色層的電路板紋路（程式產生，固定亂數種子）----
  function circuitTexture() {
    const cw = 1000, ch = 1400, c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const x = c.getContext('2d');
    x.fillStyle = '#a6ecfa'; x.fillRect(0, 0, cw, ch);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const G = 25, dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const used = new Set(), key = (a, b) => a + ',' + b;
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (let n = 0; n < 150; n++) {
      let gx = Math.floor(rnd() * (cw / G - 4)) + 2, gy = Math.floor(rnd() * (ch / G - 4)) + 2;
      if (used.has(key(gx, gy))) continue;
      let d = Math.floor(rnd() * 4) * 2, len = 6 + Math.floor(rnd() * 22);
      const pts = [[gx, gy]];
      for (let i = 0; i < len; i++) {
        if (rnd() < 0.18) d = (d + (rnd() < 0.5 ? 1 : 7)) % 8;          // 45° 轉彎
        const nx = gx + dirs[d][0], ny = gy + dirs[d][1];
        if (nx < 2 || ny < 2 || nx > cw / G - 2 || ny > ch / G - 2 || used.has(key(nx, ny))) break;
        gx = nx; gy = ny; pts.push([gx, gy]); used.add(key(gx, gy));
      }
      if (pts.length < 3) continue;
      const wide = rnd() < 0.25;
      x.strokeStyle = '#1596c4'; x.lineWidth = wide ? 7 : 4;
      x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a * G, b * G) : x.moveTo(a * G, b * G))); x.stroke();
      for (const [a, b] of [pts[0], pts[pts.length - 1]]) {               // 兩端的焊點
        x.fillStyle = '#1596c4'; x.beginPath(); x.arc(a * G, b * G, wide ? 11 : 8, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#eafdff'; x.beginPath(); x.arc(a * G, b * G, wide ? 5 : 3.5, 0, Math.PI * 2); x.fill();
      }
    }
    // 中央晶片
    x.strokeStyle = '#1596c4'; x.lineWidth = 6; x.strokeRect(cw / 2 - 110, ch / 2 - 110, 220, 220);
    x.fillStyle = '#8fe2f5'; x.fillRect(cw / 2 - 104, ch / 2 - 104, 208, 208);
    x.fillStyle = '#1596c4'; x.font = 'bold 150px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('F', cw / 2, ch / 2 + 8);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }

  const circuit = circuitTexture();
  const M = {
    white: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.55, transparent: true, opacity: 0.58,
      depthWrite: false, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') }),
    green: new THREE.MeshPhysicalMaterial({ color: '#c4f46a', roughness: 0.12, transparent: true, opacity: 0.5,
      clearcoat: 1, clearcoatRoughness: 0.05, specularIntensity: 1 }),
    // 畫布背景透明（疊在網站背景上）時不能用 transmission，改用一般半透明
    blue: opt.transparentBackground
      ? new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: circuit, bumpMap: circuit, bumpScale: 1.2,
          transparent: true, opacity: 0.8, roughness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.08 })
      : new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: circuit, bumpMap: circuit, bumpScale: 1.2,
          transmission: 0.4, thickness: 0.0005, ior: 1.4, roughness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.08 }),
  };

  const group = new THREE.Group();
  const layers = {};
  const mk = (name, mat, t) => {
    const m = new THREE.Mesh(opt.gridSlabs ? gridSlab(t) : slab(t), mat); m.name = name;
    const holder = new THREE.Group(); holder.name = name; holder.add(m); group.add(holder);
    layers[name] = holder; return holder;
  };
  mk('w1', M.white, L.w1.t);
  const g = mk('g', M.green, L.g.t);
  mk('b', M.blue, L.b.t);
  mk('w2', M.white, L.w2.t);

  // 綠色層：交錯蜂巢排列的凸起
  const R = 0.0016, A = 0.0062, DY = A * 0.866, MARGIN = 0.0055;
  const dome = new THREE.SphereGeometry(R, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.rotateX(Math.PI / 2); dome.scale(1, 1, 0.65);
  const spots = [];
  for (let r = 0, y = -H / 2 + MARGIN; y <= H / 2 - MARGIN + 1e-6; r++, y += DY)
    for (let xx = -W / 2 + MARGIN + (r % 2 ? A / 2 : 0); xx <= W / 2 - MARGIN + 1e-6; xx += A) spots.push([xx, y]);
  M.bump = M.green.clone(); M.bump.opacity = 0.85; M.bump.color.set('#ffffff');   // 顏色由每顆凸起自己決定（可做發光）
  const bumps = new THREE.InstancedMesh(dome, M.bump, spots.length);
  const BUMP_BASE = new THREE.Color('#b8ef55');
  const mtx = new THREE.Matrix4();
  spots.forEach(([a, b], i) => bumps.setMatrixAt(i, mtx.makeTranslation(a, b, L.g.t / 2)));
  spots.forEach((_, i) => bumps.setColorAt(i, BUMP_BASE));
  g.add(bumps);

  // 分解：e = 0 組合、1 完全分開；gap = 完全分開時相鄰兩層的距離
  const order = ['w1', 'g', 'b', 'w2'];
  function setExplode(e, gap = 0.035) {
    order.forEach((n, i) => { layers[n].position.z = L[n].z + (1.5 - i) * gap * e; });
  }
  setExplode(0);
  return { group, layers, setExplode, materials: M, bumps, spots, BUMP_BASE, size: { W, H, T: 0.0035 } };
}

export { makeFourLayerPatch };

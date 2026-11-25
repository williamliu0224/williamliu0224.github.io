/* =========================================================
   青蛙貼布夾鏈袋（給「細胞分裂」主視覺用的輕量版）
   造型照 3D 模型：140 × 225 mm 平袋，裝了貼布中間微微鼓起，頂端有易撕條和夾鏈
   貼圖用同一張 pouch_texture（左半正面、右半背面）：img/store-pouch-texture.jpg
   用法：
     const kit = createPouchKit(THREE, 'img/store-pouch-texture.jpg');   // 共用幾何、材質（建一次）
     const p = kit.make();                // 一個袋子（THREE.Group，高 1、寬約 0.62，中心在原點）
   ========================================================= */
export function createPouchKit(THREE, texUrl){
  const W = 140, H = 225, PUFF = 4.4;            // mm：寬、高、最鼓的厚度（一面）
  const S = 1 / H;                               // 換成高 1 的大小
  const tex = new THREE.TextureLoader().load(texUrl);
  tex.anisotropy = 4;

  // 一面的形狀：細分的平面，中間往外鼓（上下封口和兩側壓平）
  function face(back){
    const g = new THREE.PlaneGeometry(W * S, H * S, 28, 44);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++){
      const x = p.getX(i), y = p.getY(i);
      const u = x / (W * S) + 0.5, v = y / (H * S) + 0.5;            // 0～1
      // 封口：兩側 8mm、底 8mm、頂 30mm（易撕條＋夾鏈）是平的，其餘鼓起
      const ex = Math.min(u * W, (1 - u) * W) / 18, ey = Math.min(v * H / 14, (1 - v) * H / 42);
      const k = Math.min(1, Math.max(0, ex)) * Math.min(1, Math.max(0, ey));
      const puff = PUFF * S * Math.pow(Math.sin(Math.PI * Math.min(1, k) / 2), 1.5);
      p.setZ(i, puff);
      // 貼圖：正面用左半、背面用右半（從後面看是正的）
      uv.setXY(i, back ? 0.5 + u * 0.5 : u * 0.5, v);
    }
    g.computeVertexNormals();
    if (back) g.rotateY(Math.PI);
    return g;
  }
  // 材質：跟膠囊頁同一種打光（暗部壓到 76%、一點高光），印刷是半亮面
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){
        vec3 n = normalize(vN), v = normalize(vV), L = normalize(vec3(-0.45, 0.6, 0.7));
        vec3 base = texture2D(map, vUv).rgb;
        float wrap = clamp((dot(n, L) + 0.35) / 1.35, 0.0, 1.0);
        vec3 c = base * mix(0.76, 1.0, wrap);
        c += vec3(0.22) * pow(max(dot(n, normalize(L + v)), 0.0), 60.0);
        c += vec3(0.06) * pow(1.0 - max(dot(n, v), 0.0), 3.0);
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const front = face(false), back = face(true);
  // 正反兩面在封口處貼在一起（z＝0），不用另外做側邊
  return {
    make(){
      const g = new THREE.Group();
      g.add(new THREE.Mesh(front, mat), new THREE.Mesh(back, mat));
      return g;
    }
  };
}

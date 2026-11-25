/* 青蛙貼布 3D 夾鏈袋：購物車縮圖用（完整 360 度自轉）
   模型用商店頁同一個 storePouch.js（正面、背面都有印刷），貼圖 img/store-pouch-texture.jpg。
   跟藥瓶縮圖一樣：只開一個 3D 畫面，畫好後複製到頁面上每個 <canvas class="pouch-thumb">。
   需要 three.js r128（購物車頁已經載入）；載入失敗時頁面會維持顯示原本的貼布圖片。 */
(function () {
  const SPIN = 0.9;      // 自轉速度（弧度／秒）：約 7 秒轉一圈
  const SIZE = 320;      // 內部算圖尺寸
  const TEX = 'img/store-pouch-texture.jpg';
  const modUrl = new URL('storePouch.js', document.currentScript.src).href;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function start() {
    let br;
    const cv = document.createElement('canvas');
    try { br = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return; }
    br.setPixelRatio(1); br.setSize(SIZE, SIZE, false);
    import(modUrl).then(({ createPouchKit }) => {
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
      cam.position.set(0, 0.06, 0.66 / Math.tan(THREE.MathUtils.degToRad(14)));   // 袋高 1，上下留一點白
      cam.lookAt(0, 0, 0);
      const pouch = createPouchKit(THREE, TEX).make();
      pouch.rotation.z = -0.04;
      scene.add(pouch);

      let yaw = -0.5, last = performance.now(), drawn = false;
      function loop(now) {
        requestAnimationFrame(loop);
        const dt = Math.min((now - last) / 1000, 0.05); last = now;
        const thumbs = document.querySelectorAll('canvas.pouch-thumb');
        if (!thumbs.length) return;
        if (!reduce || !drawn) {
          if (!reduce) yaw += dt * SPIN;
          pouch.rotation.y = yaw;
          br.render(scene, cam); drawn = true;
        }
        thumbs.forEach((c) => {
          const w = Math.round(c.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
          if (!w) return;
          if (c.width !== w || c.height !== w) { c.width = w; c.height = w; }
          const x = c.getContext('2d'); x.clearRect(0, 0, w, w); x.drawImage(cv, 0, 0, w, w);
        });
      }
      // 貼圖載好才換掉原本的圖片，不會先閃一個空白袋子
      const img = new Image();
      img.onload = () => { requestAnimationFrame(loop); setTimeout(() => document.documentElement.classList.add('pouch-3d'), 150); };
      img.src = TEX;
    }).catch(() => {});
  }

  // 等 three.js 載入（藥瓶縮圖的程式也會用到同一份）；最多等 10 秒
  let tries = 0;
  (function wait() {
    if (typeof THREE !== 'undefined') return start();
    if (++tries < 50) setTimeout(wait, 200);
  })();
})();

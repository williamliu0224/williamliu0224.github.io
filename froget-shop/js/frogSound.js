// ===== 青蛙音效：彈跳動畫播放時同時播放 =====
// 以一般 script 載入（首頁、商店頁共用），提供全域函式 window.playFrogSound()
// 注意：瀏覽器規定使用者要先在頁面上點擊或按鍵一次，之後才允許播放聲音

(function () {
  // 使用者開啟「減少動態效果」時沒有彈跳動畫，也就不播音效
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // 音量（0＝靜音，1＝原始音量）
  const VOLUME = 0.4;

  // 預先載入音效檔
  const source = new Audio("audio/frog-sound-effect.mp3");
  source.preload = "auto";

  // 播放一次音效（複製一份再播，連續觸發時可以重疊，不會把前一聲切掉）
  function playFrogSound() {
    if (reduceMotion) return;
    const sound = source.cloneNode();
    sound.volume = VOLUME;
    // 還沒互動前瀏覽器會擋下播放，這裡安靜忽略錯誤
    sound.play().catch(function () {});
  }
  window.playFrogSound = playFrogSound;

  // 滑鼠移入時會彈跳的元素：移入就播音效
  // canBounce 對應 CSS 裡 :hover 彈跳的條件，條件不成立時不播
  const hoverTargets = [
    { selector: ".tag-row .tag" }, // 首頁五個膠囊
    { selector: ".body-card" }, // 首頁下方三張卡片
    { selector: ".body-button" }, // 首頁青蛙圖上的三個部件
    {
      // 商店 04 規格卡：滑入完成（is-settled）或沒有滑入動畫時才會彈
      selector: ".spec-card",
      canBounce: function (el) {
        const specs = el.closest(".shop-specs");
        return (
          el.classList.contains("is-settled") ||
          !specs ||
          !specs.classList.contains("is-anim")
        );
      },
    },
    { selector: ".layer-box" }, // 商店 05 說明卡（動畫播完才能懸停）
  ];

  hoverTargets.forEach(function (target) {
    document.querySelectorAll(target.selector).forEach(function (el) {
      el.addEventListener("mouseenter", function () {
        if (target.canBounce && !target.canBounce(el)) return;
        playFrogSound();
      });
    });
  });
})();

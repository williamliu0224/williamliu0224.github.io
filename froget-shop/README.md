# FROGet 商店（商店頁＋兩個商品頁＋購物車）

## 放到 GitHub 的方法
把這個資料夾**裡面的所有東西**（不是資料夾本身）放到你 GitHub Pages 網站的根目錄，
也就是跟你原本的 `index.html` 放在同一層，然後 commit、push 就好。

> 你原本網站已經有 `css/style.css`、`js/frogSound.js`、`img/favicon.png` 等同名檔案時，
> 這裡的版本跟原本相同，覆蓋沒關係。

## 頁面
| 檔案 | 內容 |
|---|---|
| `store.html` | 商店首頁：青蛙細胞分裂動畫（有音效），點泡泡進商品頁 |
| `patch.html` | 青蛙貼布商品頁 |
| `pill.html` | 不累不累丸商品頁 |
| `cart.html` | 購物車（列表 → 填寫資料 → 訂購完成） |

四頁的購物車共用（存在瀏覽器裡），所以四頁一定要放在**同一個網站、同一層資料夾**。

## 導覽列連到的其他頁（要在你原本的網站裡）
`index.html`（首頁／關於我們）、`ask.html`（問答）、`game.html`（解壓遊戲）、`about.html`（商店頁的「關於我們」）。
這幾頁不在這包裡，是你網站原本就有的頁面。

## 資料夾
- `css/`：`style.css`（全站）、`shop.css`（貼布頁）、`store.css`（商店頁）
- `js/`：各頁的程式與 3D 模型程式
- `img/`：圖片、貼圖、`3d/frog_pouch.glb`（貼布 3D 模型）
- `frogs/`：不累不累丸頁的青蛙插圖、藥瓶標籤
- `audio/`：青蛙音效

## 外部資源（要連網）
- three.js（3D）：從 cdnjs／jsdelivr 載入
- 字型：Google Fonts

## 本機預覽
3D 模型要用網頁伺服器開，不能直接雙擊 html：
用 VS Code 的 Live Server 打開這個資料夾，從 `store.html` 開始逛。

## 檔名注意
GitHub Pages 會分大小寫，檔名請不要改大小寫；所有連結都是相對路徑，放在同一層就不會掉檔。

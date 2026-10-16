---
name: gpt-pages-obsidian-visualizations
description: "Generate standard GPT Pages for Markdown export to Obsidian: native visualizations in the body, paired complete HTML sources at the bottom, compatible markers, byte-preserving verification, and explicit rendering trust. Use when creating or updating portable Page visualizations or reusable export layouts; not for live sync or general Obsidian configuration."
---

# GPT Pages → Obsidian 標準匯出範本

讓 GPT Page 正文保留可閱讀、可互動的原生視覺化（native visualization），把完整 HTML 程式碼集中在文件底部，供使用者手動匯出 Markdown 到 Obsidian。匯入外掛依配對標記（marker）將 HTML 移回圖表位置，清理已驗證的標記與原生圖片參照。

## 核心不變條件

- **每圖雙表示**：Page 原生視覺化與一個語言標籤為 `html` 的 fenced code block 並存。不可用程式碼取代原生圖，也不可只交付本機 HTML 而漏掉 Page 內原碼。
- 每圖維護一份標準來源（canonical source），含資料、公式、標籤與互動邏輯。把同一份完整 HTML 提交給原生視覺化工具並原樣放入頁尾；取得工具回傳的真實參照（reference）後再產生標記。宿主配色可以不同，教材資料、計算與事件行為必須一致。
- **乾淨版面**：正文只放主題標題、必要說明、圖表標記與原生圖；頁尾只放來源標記及完整 HTML 圍欄。不要新增「可匯出 HTML 原始碼」總標題、各圖的「HTML 原始碼」副標題、空章節或匯出操作說明。保留原本有意義的正文與使用者指定內容。
- **相容格式**：目標外掛已確認支援時，新 Page 使用 v3 精簡標記（compact marker）：正文只留短 ID，頁尾保存 ref 與 sha256。無法確認 v3 支援時使用 v2 完整標記；不能只憑本機工作目錄有新程式碼，就認定使用者已安裝新版。SHA-256 校驗值（checksum）用來核對來源，不代表使用者信任執行程式碼。
- 獨立 HTML 必須自包含：UTF-8、完整文件、HTML/SVG、內嵌資料、CSS、所需 inline JavaScript；明確字型、背景與文字顏色，CSS 變數有預設值。不要依賴 CDN、遠端字型、外部圖片、宿主 CSS、Page 私有參照或網路 API。
- 保留既有內容與使用者修改。技能的使用本身不授權改 Page、vault 設定、安裝外掛、發佈或同步；依當次任務授權執行。

## 產製與更新

1. 確認使用者指定的 Page、圖形與輸出範圍。先讀最新 Page，再設計適合教材的圖與互動；不要把示範圖數、課程、私人 ID 或本機路徑當成固定規格。
2. 先讀 [references/export-format.md](references/export-format.md)，以 [assets/page-export-template.md](assets/page-export-template.md) 作為版型。依主題選擇圖表數量與互動；新互動圖可改用 [assets/weighted-sum.html](assets/weighted-sum.html) 作為無私人內容的起點。範本中的佔位符（placeholder）全部替換後才能寫入 Page。
3. 保留符合來源與參照的既有原生圖，或透過目前可用工具建立／更新。每圖指定文件內唯一的短 ID，從實際回傳的原生參照取得檔案 ID，依目標外掛能力選 v3 或 v2，再用下方工具產生圖表標記與來源區塊。圖表標記緊鄰正文原生圖；相同 ID 的來源標記與完整 `html` 圍欄集中放在所有正文之後。配對依 ID，不依標題或順序；不要用 raw HTML 取代圍欄。
4. 寫入前再次取得最新 Page，以唯一錨點與舊片段／版本條件做局部插入或替換（guarded edit）。錨點不唯一或內容已改變時，重新讀取並重做局部修改；不要重寫整頁或自動刪除測試與參照。工具缺乏安全局部修改能力時，交付可插入的片段並說明限制。
5. 寫後讀回並核對每組唯一 ID、原生參照、SHA-256、HTML 位元組（bytes）、完整圍欄及圖表／來源數量；確認頁尾沒有新增的來源章節標題或未替換佔位符。另核對中文標題、公式與 ARIA。`????` 或替代字元可能是編碼損壞，不能直接視為字型問題；必要時另查 UTF-8 bytes／Unicode code points。
6. 從實際 Page 下載的 Markdown 再驗證，不能把自行組裝的 Markdown 當作下載證據。未拿到下載檔時，明說匯出層尚未測。

## 匯出與 Obsidian

遇到匯出、renderer 相容性或互動驗收時，讀 [references/validation.md](references/validation.md)。其中有分層驗收、常見失敗與主要來源。

- Page 原生圖／PNG 的 Markdown 匯出曾只留下 `visualize:`／`library-file:` 參照；它們不代表原碼或圖片 bytes 已隨檔輸出。可攜原碼由 HTML code block 承載。
- v2／v3 配對使用匯出 Markdown 內的 HTML，不會連線 Pages 下載。只清理已成功驗證的配對；缺失、重複、歧義或 hash 不符時保留原文並回報，不能把「清得乾淨」當成成功的唯一標準。
- raw HTML 曾呈現成文字，匯出也可能加 Markdown 跳脫。不要全篇刪除反斜線，這會破壞程式碼、數學與路徑。
- 優先重用使用者已選擇且可用的 Polyglot Renderer。它處理 `html` code block；原生 Obsidian raw HTML 會限制 scripts，CSS snippets 或 `css`／`js`／`json` fenced blocks 不等於互動 HTML renderer。JSON／YAML 資料也不會自動成為圖。
- 僅執行已檢查且可信的原碼。保留 renderer 的 sandbox 權限；不要加 `allow-same-origin`、改 vault 設定或以 DataviewJS 繞過。sandbox 不是完整斷網或安全保證。
- 匯入預設使用 `html-source`；可執行的 `html` 需要明確信任（explicit trust）。資料夾自動清理不等於啟用渲染，亦不會自動停用原本已是 `html` 的區塊；需要測試信任流程時，另用 `html-source` 測試副本，只改圍欄語言、不改 HTML 內容或校驗值。技能不得自動接受信任對話框。
- renderer 有自己的 HTML/body 包裝，完整文件需用代表性樣本測試。分別記錄實際測過的 Reading view／Live Preview、外掛版本與平台；不要硬編碼永久「最新」版本。

## 驗證工具與交付

[scripts/build_figure_pair.mjs](scripts/build_figure_pair.mjs) 只讀取完整 HTML，以原始 bytes 計算 SHA-256 並選擇不會截斷內容的圍欄。需 Node.js；三個參數依序為唯一 ID、工具回傳的檔案 ID、HTML 路徑。確認目標支援 v3 後使用：

```powershell
node <skill-dir>/scripts/build_figure_pair.mjs --v3 chart-a ACTUAL_NATIVE_FILE_ID canonical.html
```

省略 `--v3` 則輸出 v2。輸出 JSON 的 `figure_marker` 放在原生圖前；`source_markdown` 放在頁尾。先解析 JSON，再使用字串值，不要把 JSON 跳脫字元原樣貼入 Page。工具不產生原生圖，也不驗證參照屬於該圖。HTML 必須保留結尾換行；若新增或更改任何 bytes，重新建立原生圖與校驗值。精確規格見格式參考。

[scripts/verify_html_export.py](scripts/verify_html_export.py) 使用 Python 標準函式庫解析頂層 `html` 圍欄，保留 UTF-8 內容與換行，輸出 byte 數和 SHA-256；可與標準 Markdown 比對、擷取 HTML、對 inline JS 執行 `node --check`。它不執行文件 JavaScript，也不驗證 HTML 顯示、斷網或 Obsidian 行為。

```powershell
python <skill-dir>/scripts/verify_html_export.py downloaded.md --expected canonical.md --out extracted --node-check
```

`canonical.md` 應由標準來源產生並已與 Page 讀回核對；兩檔需含相同順序的 HTML 區塊。`--out` 僅接受新建或空目錄，不覆寫檔案。完整參數與精確換行比較的限制見驗證參考。

交付時列出已完成的 Page 圖／原碼配對、下載檔原碼比對、JS 語法、瀏覽器互動與 Obsidian 實測。每層標記「代理實測／使用者回報／尚未測／失敗」，附對應證據。使用者回報端到端成功可照實引用；不得提升為代理獨立完成所有平台驗證。

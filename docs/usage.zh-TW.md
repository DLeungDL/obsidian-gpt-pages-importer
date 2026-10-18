# GPT Pages Importer 使用指南（User guide）

[English](usage.md) · **繁體中文**

將 ChatGPT Pages Markdown 匯入 Obsidian，保留完整 portable HTML source，並提供純文字變更預覽、資產報告、重複匯入與備份／衝突保護。也可指定 vault 內的資料夾，自動原地清理已配對的標記與圖片參照。Polyglot Renderer 為選用 companion plugin，不包含在本外掛中。

**目前為 0.1.0 MVP，支援 v3 精簡標記（compact markers）、頁尾 HTML 原始碼與 v1／v2 相容。** 真正 Obsidian 1.14.4／Polyglot Renderer 1.3.0 的既有相鄰 v2 桌面驗證 15 項全部通過，包含兩圖配對、滑桿／重設、重匯、備份、衝突及摘要／ID 不符；頁尾與精簡標記另有自動回歸測試，實機範圍見相容性紀錄。

v2 使用原生檔案 ID 與完整 HTML 的 SHA-256，校驗後自動移除配對標記（marker）與原生圖片參照，避免顯示跳脫標記及失效圖片文字，支援觀察到的 Pages 跳脫格式（escaping）。維護者的既有實際 v2 UI 匯入驗證為兩圖成功配對、15 項桌面檢查通過；公開儲存庫只保存自行編寫、使用虛構 ID 的 fixtures 與 [結果摘要](pages-roundtrip.zh-TW.md)，原始匯出、截圖及來源識別資料保留於 Git 外。未綁定的 v1 原生參照仍保留並警告。UTF-8 BOM 重匯誤判衝突已修正，雜湊及備份保留 BOM／換行，本機增刪 BOM 仍視為修改；實測範圍見 [相容性紀錄](compatibility.zh-TW.md)。

## 建置、測試與安裝

需要 Node.js 24 與 npm：

```sh
npm ci
npm run check
```

`check` 執行公開資料檢查、TypeScript 檢查、esbuild 建置與 Vitest 測試。安裝產物在 `dist/gpt-pages-importer/`，包含 `main.js`、`manifest.json`、`styles.css` 與第三方授權 notices。將整個目錄複製到測試 vault 的 `.obsidian/plugins/`，在 Community plugins 啟用 **GPT Pages Importer**。最低 API 目標為 Obsidian 1.5.0；桌面執行環境（runtime）已測 1.14.4，最低版本尚未實測。CI 也會上傳建置產物。

## 手動匯出／匯入

尚未發行的原始碼已提供中英文介面：跟隨 Obsidian 語言（language），繁體中文為 `zh-TW`，其他未支援語言回退英文。切換語言後依 Obsidian 提示重新載入即可套用。Obsidian 1.8.7 起使用公開 `getLanguage()`，較舊版本讀取既有語言設定，無法讀取時使用英文；最低支援版本仍為 1.5.0。匯入筆記、HTML、路徑及雜湊不會翻譯。現有 0.1.4 發行檔仍為中文介面。

1. 在 Pages 手動匯出 Markdown。本外掛不做同步、OAuth、scraping 或未公開 API 存取。
2. 已把原始匯出檔放進 vault 時，可右鍵檔案選 **使用 GPT Pages Importer 匯入**，或開啟該筆記後執行 **GPT Pages Importer: 匯入目前筆記**，直接帶入檔案。檔案還在 vault 外時，點側邊欄匯入圖示或執行 **GPT Pages Importer: 匯入 Pages Markdown**，選取或拖入一個 UTF-8 `.md`／`.markdown` 檔（最多 20 MiB）。非法 UTF-8 停止匯入，不猜測其他編碼。
3. 來源識別名稱自動使用檔名。需要固定自訂名稱或目的資料夾時，展開「來源與目的地（進階設定）」。不同 Page 即使檔名相同也必須使用不同名稱，重新匯入同一 Page 必須維持同一名稱。來源名稱不是 Page API ID。目的預設為 `GPT Pages/名稱-來源雜湊.md`，首次匯入後固定沿用目的地。
4. 按「預覽」，先查看目的地、狀態、成功配對數與警告，需要時展開原始碼及資產報告，再按摘要下方的「確認寫入」。可按「返回設定」調整選項，已選檔案和欄位會保留。匯入成功後會在目前窗格自動開啟目的筆記；相同內容按「完成（無變更）」也會開啟。原始匯出檔保留。預覽使用純文字，不渲染來源 Markdown／HTML。外掛不複製或下載附件，請自行檢查 assets。
5. 若目的曾被本機修改或有未知既有檔案，停止覆寫。取消後手動合併，或用新的來源識別名稱另存，沒有「強制覆寫」捷徑。

新來源的目的目錄可自訂；禁止絕對路徑、`..`、隱藏目錄與跨平台特殊字元。已匯入來源的目錄欄位不會移動筆記。手動搬移目的筆記會使原有對應失效，請保留資料並自行處理紀錄，或另設新來源識別名稱。

已記錄的目的筆記不會提供「匯入目前筆記」或右鍵匯入入口，避免把清理後的筆記當成新來源產生重複檔案。選擇另一個來源檔案時會重設信任選項；每次新開匯入視窗也預設不信任 HTML。

## 指定資料夾自動清理

1. 在 vault 建立資料夾，例如 `Pages Inbox`。
2. 開啟 **設定 → GPT Pages Importer**，在「自動清理資料夾」填入 `Pages Inbox`，開啟「啟用自動清理」，按「儲存設定」。預設關閉，不會自選資料夾。
3. 啟用後先處理該資料夾的現有 Markdown（含子資料夾）；之後新增、修改或移入 `.md`／`.markdown` 檔案，約一秒後自動檢查與清理。可一次放入多個檔案，不需逐檔確認。重新載入外掛也會重新掃描。

這是**原地清理（in-place cleanup）**：保留原檔路徑、檔名與目前開啟的筆記，不另建匯入目的檔，也不使用來源識別名稱。每次實際修改前，完整原文先備份至 `GPT Pages Backups/cleanup/路徑雜湊/時間-隨機碼.md`。重複事件或掃描不會重寫已清理內容或新增備份。備份失敗、非法 UTF-8、超過 20 MiB、或清理過程中檔案又被修改時，停止該檔寫入並通知，其餘檔案繼續處理。

只移除成功配對的 marker 與原生圖片參照；摘要／ID 不符、缺少原始碼等不明確內容保留並通知。保留 BOM、換行及 HTML body bytes。預設保留每個 fence 原有的 `html`／`html-source` 語言；若原本是 `html`，仍可能由已安裝的 renderer 執行。備份資料夾與已追蹤的匯入目的筆記不參與自動清理，避免破壞備份或匯入 hash 紀錄。

需要清理後呈現 HTML 時，開啟預設關閉的 **「清理後啟用 HTML 渲染」**。確認視窗會顯示指定資料夾；閱讀說明、按 **「我信任此資料夾內容，啟用」** 後，再按 **「儲存設定」** 才生效。取消或關閉視窗保持停用，更換資料夾須重新確認信任。

這項信任適用於該資料夾及子資料夾中，現有及日後新增／修改文件的**所有 HTML fences，包含已清理筆記與未配對區塊**；`html-source` 會轉為 `html`，配對不明確的 marker／圖片參照仍保留。每次轉換前先備份；重複掃描不重寫。需自行安裝並啟用 Polyglot Renderer，外掛不變更 renderer 設定。JavaScript 可能立即執行並發出外部網路請求，成功配對不等於安全。關閉渲染選項只停止後續轉換，既有 `html` 不會自動還原；需還原時先停用清理及 renderer，再使用備份。

可在設定按「立即清理資料夾」，或執行 **GPT Pages Importer: 立即清理指定資料夾** 再次掃描。停用後儲存設定會取消待處理項目；清理只在 Obsidian 與外掛運作時執行，不連線抓取 Pages。備份還原方式見下文；先停用自動清理再還原，避免還原後立即再次清理。

## HTML 與選用 renderer

手動匯入預設將所有 CommonMark HTML fences 的語言改為 `html-source`，保留 code body bytes，避免 Polyglot Renderer 自動執行。資料夾原地清理預設保留原有語言；明確確認資料夾信任並儲存渲染選項後才轉為 `html`。未安裝 renderer 也可閱讀／保存原始碼。普通 Obsidian 不會因此提供互動 HTML。

若已自行檢查整份內容，勾選「我信任這份內容，允許 renderer 執行 HTML／JavaScript」，才輸出 [Polyglot Renderer 公開支援的 `html` fence](https://github.com/Nimaapr/polyglot-renderer)。renderer 的 inline rendering 預設開啟，可能在寫入或閱讀時立即執行。**信任適用於整份文件中所有 HTML fences，包含未配對區塊。** 重匯已啟用內容前，先停用 renderer，避免讀取模式立即執行。

renderer 由使用者獨立安裝；本外掛不使用私有 API，也不自動變更 renderer 設定。公開文件描述 `allow-scripts`／opaque origin iframe，但 sandbox 不保證網路隔離。scripts、外部圖片、字型、函式庫等可能發出網路請求。外掛不提供執行式預覽，不是通用 HTML sanitizer，也不能控制其他外掛如何執行 raw HTML。未知內容請保持信任選項關閉。

## 格式、保留與降級

[v3 配對契約](format.zh-TW.md) 的正文只放 `<!-- gpt-pages:figure id=圖表ID -->` 與相鄰的原生圖片。完整 HTML 集中在文件底部，各份 fence 前放 `<!-- gpt-pages:source v=3 id=同一圖表ID ref=原生檔案ID sha256=64位摘要 -->`，標記與 fence 之間只留空白行。外掛依唯一 ID、精確圖片參照與 SHA-256 校驗後，把完整 fence 移回正文圖表位置並清理兩種標記及圖片參照；缺失、重複或歧義來源保留並警告。無須增加頁尾原始碼標題。原有 HTML 信任選項、備份與衝突保護均適用，不連線 Pages 取得內容。先以同一份 HTML 建立原生視覺化並取得檔案 ID，再生成正文與頁尾兩個 marker：

```sh
node scripts/figure-marker.mjs --v3 example-chart NATIVE_FILE_ID source.html
```

Pages 不會自動添加這些欄位。只有校驗成功才移除配對標記與參照行；摘要不符、ID 重複、未知版本、缺失／不完整 source 均保留並警告。舊 v1 standalone、v2 相鄰與頁尾配對仍支援，生成工具省略 `--v3` 仍輸出原有 v2 marker；沒有明確綁定的原生圖片不猜測配對。

透過 CommonMark 語法樹辨識 marker／URI，只移除成功配對的 metadata，保留章節標題與一般圖說，不全域移除反斜線。中文、UTF-8、公式、HTML entities 與 HTML/CSS/JS code body bytes 保留。摘要涵蓋換行與 BOM，成功配對不代表安全或自動信任。預設修改 HTML fence 語言 token 是為停用 renderer 自動執行。升級後以同一來源名稱重匯，舊筆記會先備份再清理標記；若有本機修改則停止覆寫。

## 重匯、備份與還原

- 固定來源識別名稱對應固定目的地，紀錄存於 plugin `data.json`，使用 SHA-256 追蹤上次輸出。
- 相同內容重匯不新增檔案或區塊；本機修改即使剛好與新來源相同，也會走衝突保護。
- 更新既有目的檔前，先寫入完整備份至 `GPT Pages Backups/來源雜湊/時間-隨機碼.md`。備份失敗即停止。備份原文可能含 `html` fence；還原／查看前請停用 renderer。
- 重新檢查預覽後的檔案內容，使用 Obsidian `Vault.process` 驗證並替換，避免覆寫同時發生的本機編輯。新建檔案用 `Vault.create`，不覆寫既有路徑。
- 還原時先停用 renderer，將備份手動復原到目的筆記。復原後重匯可能因基準不同而衝突；先保留雙方內容，手動合併或使用新來源識別名稱。
- `data.json` 損毀／未知版本時停止註冊匯入命令。寫入後若紀錄儲存失敗會明確回報；不要刪除紀錄後強制重試，先手動檢查目的筆記與備份。

## 範例與開發資料

- [靜態範例](../examples/static.zh-TW.md)、[互動範例](../examples/interactive.zh-TW.md)：自行編寫的通用內容，不是私人資料或實際 Pages 匯出證據。
- `tests/fixtures/`：輸入與獨立預期輸出；v2 escaped fixture 使用通用測試 ID，依觀察到的 UI 格式編寫，並非新下載檔。
- [GPT Pages → Obsidian 技能（skill）](../skills/gpt-pages-obsidian-visualizations/SKILL.md)：製作同時保留原生視覺化與完整可攜式 HTML（portable HTML）之 Page 的主要技能。可安裝的完整技能資料夾包含 v2／v3 配對標記生成器、頁尾版型、自包含互動範例與匯出原碼驗證工具。匯入前可用它產製及核對 Page；依附帶驗收指引分別確認實際下載與 Obsidian 呈現。
- `src/convert.ts`：純轉換、非同步 v2／v3 校驗及資產候選掃描；`src/hash.ts`：UTF-8 摘要；`src/importer.ts`：storage-independent 匯入計畫及寫入；`src/cleanup.ts`：原地清理、備份與事件佇列；`src/cleanup-settings.ts`：監看設定；`src/main.ts`：Obsidian 命令／modal／事件；`src/preview.ts`：不執行內容的預覽。

本外掛不包含 Pages 雲端同步或雙向同步、renderer 重作、任意 HTML 安全執行保證或所有 Pages 視覺化的相容性保證。其他匯出版本與平台仍需依相容性文件補測。

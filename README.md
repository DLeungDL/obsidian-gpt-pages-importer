# GPT Pages Importer for Obsidian

手動將 ChatGPT Pages Markdown 匯入 Obsidian，保留完整 portable HTML source，並提供純文字變更預覽、資產報告、重複匯入與備份／衝突保護。Polyglot Renderer 為選用 companion plugin，不包含在本外掛中。

**目前為 0.1.0 MVP，支援 v2 自動配對（automatic matching）。** 型別檢查、建置及 96 項自動測試通過；真正 Obsidian 1.14.4／Polyglot Renderer 1.3.0 的 v2 桌面驗證 15 項全部通過，包含兩圖配對、滑桿／重設、重匯、備份、衝突及摘要／ID 不符。

v2 使用原生檔案 ID 與完整 HTML 的 SHA-256，校驗後才移除參照，支援觀察到的 Pages 跳脫格式（escaping）。維護者的實際 v2 UI 匯入驗證為兩圖成功配對、15 項桌面檢查通過；公開儲存庫只保存自行編寫、使用虛構 ID 的 fixtures 與 [結果摘要](docs/pages-roundtrip.md)，原始匯出、截圖及來源識別資料保留於 Git 外。未綁定的 v1 原生參照仍保留並警告。UTF-8 BOM 重匯誤判衝突已修正，雜湊及備份保留 BOM／換行，本機增刪 BOM 仍視為修改；實測範圍見 [相容性紀錄](docs/compatibility.md)。

## 建置、測試與安裝

需要 Node.js 24 與 npm：

```sh
npm ci
npm run check
```

`check` 執行公開資料檢查、TypeScript 檢查、esbuild 建置與 Vitest 測試。安裝產物在 `dist/gpt-pages-importer/`，包含 `main.js`、`manifest.json`、`styles.css` 與第三方授權 notices。將整個目錄複製到測試 vault 的 `.obsidian/plugins/`，在 Community plugins 啟用 **GPT Pages Importer**。最低 API 目標為 Obsidian 1.5.0；桌面執行環境（runtime）已測 1.14.4，最低版本尚未實測。CI 也會上傳建置產物。

## 手動匯出／匯入

1. 在 Pages 手動匯出 Markdown。本外掛不做同步、OAuth、scraping 或未公開 API 存取。
2. 開啟 Obsidian command palette，選擇 **GPT Pages Importer: 匯入 Pages Markdown**，選取 UTF-8 `.md`／`.markdown` 檔（最多 20 MiB）。非法 UTF-8 停止匯入，不猜測其他編碼。
3. 輸入固定且唯一的「來源識別名稱」。預設為檔名；不同 Page 即使檔名相同也必須使用不同名稱，重新匯入同一 Page 必須維持同一名稱。來源名稱不是 Page API ID。目的預設為 `GPT Pages/名稱-來源雜湊.md`，首次匯入後固定沿用目的地。
4. 查看目的地、狀態、匯入前／後全文、警告與資產報告，再按「確認寫入」。預覽使用純文字，不渲染來源 Markdown／HTML。外掛不複製或下載附件，請自行檢查 assets。
5. 若目的曾被本機修改或有未知既有檔案，停止覆寫。取消後手動合併，或用新的來源識別名稱另存，沒有「強制覆寫」捷徑。

新來源的目的目錄可自訂；禁止絕對路徑、`..`、隱藏目錄與跨平台特殊字元。已匯入來源的目錄欄位不會移動筆記。手動搬移目的筆記會使原有對應失效，請保留資料並自行處理紀錄，或另設新來源識別名稱。

## HTML 與選用 renderer

預設將所有 CommonMark HTML fences 的語言改為 `html-source`，保留 code body bytes，避免 Polyglot Renderer 自動執行。未安裝 renderer 也可閱讀／保存原始碼。普通 Obsidian 不會因此提供互動 HTML。

若已自行檢查整份內容，勾選「我信任這份內容，允許 renderer 執行 HTML／JavaScript」，才輸出 [Polyglot Renderer 公開支援的 `html` fence](https://github.com/Nimaapr/polyglot-renderer)。renderer 的 inline rendering 預設開啟，可能在寫入或閱讀時立即執行。**信任適用於整份文件中所有 HTML fences，包含未配對區塊。** 重匯已啟用內容前，先停用 renderer，避免讀取模式立即執行。

renderer 由使用者獨立安裝；本外掛不使用私有 API，也不自動變更 renderer 設定。公開文件描述 `allow-scripts`／opaque origin iframe，但 sandbox 不保證網路隔離。scripts、外部圖片、字型、函式庫等可能發出網路請求。外掛不提供執行式預覽，不是通用 HTML sanitizer，也不能控制其他外掛如何執行 raw HTML。未知內容請保持信任選項關閉。

## 格式、保留與降級

[v2 配對契約](docs/format.md) 要求文件內唯一的 figure ID／原生檔案 ID、獨立且相鄰的 marker／image-style 參照／完整 HTML fence，以及精確 SHA-256。先以同一份 HTML 建立原生視覺化並取得檔案 ID，再生成 marker：

```sh
node scripts/figure-marker.mjs example-chart NATIVE_FILE_ID source.html
```

Pages 不會自動添加這些欄位。只有校驗成功才移除該參照行；摘要不符、ID 重複、未知版本、缺失／不完整 source 均保留並警告。舊 v1 standalone 配對仍支援；沒有明確綁定的原生圖片不猜測配對。

透過 CommonMark 語法樹辨識 marker／URI，保留原始文字，不全域移除反斜線；跳脫的 marker 可能仍顯示為文字。中文、UTF-8、公式、HTML entities 與 HTML/CSS/JS code body bytes 保留。摘要涵蓋換行與 BOM，成功配對不代表安全或自動信任。預設修改 HTML fence 語言 token 是為停用 renderer 自動執行。

## 重匯、備份與還原

- 固定來源識別名稱對應固定目的地，紀錄存於 plugin `data.json`，使用 SHA-256 追蹤上次輸出。
- 相同內容重匯不新增檔案或區塊；本機修改即使剛好與新來源相同，也會走衝突保護。
- 更新既有目的檔前，先寫入完整備份至 `GPT Pages Backups/來源雜湊/時間-隨機碼.md`。備份失敗即停止。備份原文可能含 `html` fence；還原／查看前請停用 renderer。
- 重新檢查預覽後的檔案內容，使用 Obsidian `Vault.process` 驗證並替換，避免覆寫同時發生的本機編輯。新建檔案用 `Vault.create`，不覆寫既有路徑。
- 還原時先停用 renderer，將備份手動復原到目的筆記。復原後重匯可能因基準不同而衝突；先保留雙方內容，手動合併或使用新來源識別名稱。
- `data.json` 損毀／未知版本時停止註冊匯入命令。寫入後若紀錄儲存失敗會明確回報；不要刪除紀錄後強制重試，先手動檢查目的筆記與備份。

## 範例與開發資料

- [靜態範例](examples/static.md)、[互動範例](examples/interactive.md)：自行編寫的通用內容，不是私人資料或實際 Pages 匯出證據。
- `tests/fixtures/`：輸入與獨立預期輸出；v2 escaped fixture 使用通用測試 ID，依觀察到的 UI 格式編寫，並非新下載檔。
- [公開生成規範](skills/generate-portable-page/SKILL.md)：後續 Page 同時保留原生視覺化與完整 portable HTML 的要求。
- `src/convert.ts`：純轉換、非同步 v2 校驗及資產候選掃描；`src/hash.ts`：UTF-8 摘要；`src/importer.ts`：storage-independent 匯入計畫及寫入；`src/main.ts`：Obsidian 命令／modal；`src/preview.ts`：不執行內容的預覽。

本外掛不包含即時／雙向同步、renderer 重作、任意 HTML 安全執行保證或所有 Pages 視覺化的相容性保證。其他匯出版本與平台仍需依相容性文件補測。

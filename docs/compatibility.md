# 相容性與驗收紀錄

## 公開介面與自動檢查

Polyglot Renderer 公開 [README](https://github.com/Nimaapr/polyglot-renderer) 與 [manifest](https://github.com/Nimaapr/polyglot-renderer/blob/main/manifest.json) 指定 `html` fence、inline rendering 及最低 Obsidian 1.5.0。本外掛只產生公開支援的 fence，不使用 renderer 私有 API 或打包 renderer。公開 iframe 設定為 `allow-scripts`，opaque origin 不代表網路隔離。

Node.js 24.19.0／npm 11.9.0、Obsidian SDK 型別 1.13.1。`npm run check` 執行公開資料檢查、TypeScript、esbuild 建置、無 DOM 的打包 smoke check 及 86 項 Vitest 測試；完整依賴見 package-lock.json。

- 獨立輸入／預期 fixtures：CommonMark fences、跳脫參照、中文／emoji／公式／反斜線、CRLF／BOM 與 source bytes。
- v2 摘要、ID／URI／文件邊界、重複宣告、部分成功、校驗失敗保留、冪等性及同步 v1 相容。
- 匯入生命週期：建立、重匯、備份、本機修改、競態、備份及紀錄儲存失敗。
- Obsidian API 模擬、UTF-8／路徑／大小拒絕與純文字預覽不執行內容。

模擬、SDK 型別與 jsdom 不等於真正桌面程式。公開資料檢查只針對此儲存庫的來源識別資料形式與證據目錄規則，不是通用機密掃描器。

## 真正 Linux 桌面結果摘要

維護者於 2026-10-14 在 Debian GNU/Linux 13.6 x86_64、Xorg 虛擬顯示器啟動官方 Obsidian 1.14.4／Polyglot Renderer 1.3.0。內嵌 Electron 43.7.7、Chromium 150.0.7871.250、Node.js 24.21.0；使用 Playwright／CDP 操作真正 UI、Vault API 及 iframe，未使用 stub 或 jsdom。啟動旗標 `--no-sandbox --disable-gpu`，沒有驗證 Electron 外層 sandbox 或 GPU。

| 階段 | 維護者回報結果 |
| --- | --- |
| 基準 MVP 桌面驗證 | 19 項通過、1 項 BOM 失敗；含匯入、重匯、備份、競態／衝突、大小／路徑／UTF-8 拒絕及重啟 |
| 基準 MVP 與真正 v1 UI 匯出 | 13 項通過、1 項原生參照配對不支援；完整 HTML 可明確信任後呈現 |
| v2 明確綁定的測試副本 | 15 項通過，兩圖配對、摘要／ID 不符保留及兩種呈現模式正常 |
| 正式儲存 v2 的服務來源 | 4 項通過，兩個 marker 儲存、其他內容保留、摘要正確與冪等性 |
| 新下載的真正 v2 UI 匯出 | 15 項通過，原檔不變、配對 2、HTML bytes 保留、slider／reset、重匯／備份／衝突正常 |

[結果摘要](evidence/validation-summary.json) 不含來源識別碼。[公開 fixtures](evidence/README.md) 全部使用虛構 ID；原始匯出、讀回、操作回條及截圖只保留於儲存庫外，因此公開資料不能獨立核驗全部桌面步驟。

### 已確認問題：BOM 重匯誤判衝突

以 UTF-8 BOM 儲存通用 Markdown，首次匯入後立即用相同來源名稱重匯，實際誤判「停止寫入」，完整重啟後也可重現。磁碟 bytes 與保存的 outputHash 相同，但真正 Vault.read() 移除開頭 BOM，Vault.readBinary() 保留。VaultStorage.read() 使用前者，因此 hash 比較將未修改檔案誤判成本機修改；自動測試的 host double 沒有此差異。

此問題尚未修正，會阻擋 BOM 重匯／更新且不覆寫原檔。無 BOM UI 檔的通過及 v2 source 的 BOM 摘要測試不代表已修復整個匯入生命週期。

## 尚未實測

| 項目 | 範圍 |
| --- | --- |
| 其他 Pages 匯出版本、附件包裝及視覺化類型 | 僅同一自行編寫、自包含靜態／互動測試 Page 的 v1／v2 UI 原檔 |
| 最低目標 Obsidian 1.5.0 與其他 runtime | 已測 1.14.4 Linux，其他未驗證 |
| 其他 renderer 版本及 file view／embed／smart paste | 已測 1.3.0 inline，其他未驗證 |
| Windows／macOS、實體 Linux GPU、Android／iOS | 未驗證 |
| 任意 Pages／HTML 無損、安全執行或離線保證 | 不保證 |

## 人工端到端驗收

1. 自行編寫通用內容並建立自己的測試 Page，包含靜態／互動原生視覺化及相鄰完整 HTML。不要將私人 Page／匯出加入 Git。
2. 依 [v2 契約](format.md) 使用真實檔案 ID 與摘要，手動匯出，將日期／介面版本及原檔保存在儲存庫外。檢查 metadata、fence 和 HTML bytes。
3. 記錄 OS／Obsidian／renderer 版本，以獨立 vault 安裝外掛。先驗證預設 html-source、預覽不執行、文字／HTML 保留。
4. 重匯不得重複，本機修改阻止覆寫，更新未修改筆記先完整備份。
5. 僅對已檢查的自有內容明確信任，確認閱讀／Live Preview 的靜態圖、slider、reset、中文及資產／網路行為。
6. 測摘要／ID 不符、重複 ID、缺 source、escaping 與 assets；結果發布成摘要及虛構 fixtures，執行 `npm run check:public`。不要提交原始回條或截圖。

真正 v1／v2 UI 與 Linux 匯入已測，BOM 與其他平台仍有缺口，不能將完整相容性驗收標為完成。

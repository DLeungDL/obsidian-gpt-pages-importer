# Pages 匯出與 Obsidian 匯入驗證摘要

[English](pages-roundtrip.md) · **繁體中文**

維護者於 2026-10-14 以本專案自行編寫的通用內容驗證 Pages 原生視覺化（native visualization）、Markdown 介面匯出（UI export）及 Obsidian 匯入。真正 v2 UI 匯入完成 15 項桌面檢查，全部通過、兩圖配對成功；完整原檔與識別資料保留於儲存庫外。

## 公開測試資料

[v2 輸入 fixture](../tests/fixtures/v2-escaped.input.md) 與 [獨立預期輸出](../tests/fixtures/v2-escaped.expected.md) 使用虛構檔案 ID，包含靜態長條圖、互動 slider／reset，以及中文、emoji、公式表示、反斜線與 HTML entities。它們依觀察到的 CommonMark 語法自行編寫，不是 UI 下載原檔。

```markdown
\<!-- gpt-pages\:figure v=2 id=example-chart ref=fixture-native-file sha256=64位小寫摘要 -->

![圖表](visualize\:fixture-native-file)
```

上例為語法說明；可執行的正確摘要及完整 HTML 見 fixture。原生檔案 ID 與 HTML 摘要必須明確綁定，不僅依相鄰順序猜測。v1 沒有綁定資訊的原生 image-style 參照保留並警告。

## 桌面結果

使用官方 Obsidian 1.14.4／Polyglot Renderer 1.3.0，在 Debian 13.6、Xorg 虛擬顯示器的獨立 vault／設定中操作真正命令選單、檔案輸入、按鈕與 iframe；未使用 Obsidian stub 或 jsdom。

| 檢查範圍 | 維護者回報結果 |
| --- | --- |
| 真正 v2 UI 匯出與 HTML | ref／sha256 欄位保留，兩份 HTML bytes 相同；escaping 僅在 HTML 之外 |
| 配對與輸出 | 成功配對 2，只移除校驗通過的參照行並更改 fence 語言 |
| 預設預覽／閱讀 | 純文字預覽不建立 script／iframe／img；html-source 不執行 |
| 信任後閱讀／Live Preview | 靜態標籤正常；slider 50→83、長條 83%、reset 回 50 |
| 重匯、更新、本機修改 | 無重複或多餘備份，更新先完整備份，修改後阻止覆寫 |
| 錯誤摘要／原生 ID | 保留不符參照並警告，另一有效圖仍配對 |
| 原檔完整性 | 匯入前後原檔未修改，未將原檔改成合約格式才測試 |

[公開摘要](evidence/validation-summary.json) 記錄階段結果：基準 MVP 桌面 19 項通過、1 項 BOM 失敗；原始 v1 UI 13 項通過、1 項不支援；v2 升級副本與真正 v2 UI 各 15 項通過。結果不等於任意 Pages 內容或其他平台都相容。

## 證據發布範圍

2026-10-15 的公開資料清理移出實際匯出、服務快照、附件回條、上傳／區塊／原生檔案識別碼、Page URL 與截圖；只發布虛構 fixtures 及維護者回報的摘要。公開摘要不能獨立證明所有桌面步驟；詳細紀錄保留於 Git 外，不以替換識別碼後的副本冒充原檔。

重新驗證時使用自己的測試 Page，依 [相容性驗收](compatibility.zh-TW.md) 操作；發布內容前先執行 `npm run check:public`。其他 exporter／附件包裝、Pages 原生 viewer 的直接操作、Windows／macOS／mobile、實體 GPU 及 Electron 外層 sandbox 未驗證。既有 BOM 重匯問題尚未修正。

# Portable figure 格式：v2 明確配對與 v1 相容

本契約由本專案定義，Pages 不會自行補上配對資訊（binding metadata）。v2 使用原生檔案識別碼（native file ID）與 HTML 的 SHA-256 摘要，確認明確宣告的對應。它不會下載原生附件、證明附件內容相同或把缺失的 HTML 還原。

已觀察 v1／v2 Pages 介面匯出：marker 成為 `\<!-- gpt-pages\:figure ... -->`，圖片 URI 成為 `visualize\:file_id`。公開 [v2 fixture](../tests/fixtures/v2-escaped.input.md) 依此語法自行編寫，全部 ID 均為虛構，不是實際匯出原檔。實際原檔、附件及來源識別資料不存入 Git；驗證範圍見 [公開摘要](pages-roundtrip.md)。

## v2 宣告與生成

依序放置三個獨立、頂層（top-level）區塊，區塊間留空白行：

````markdown
<!-- gpt-pages:figure v=2 id=example-chart ref=example-native-file sha256=4eb2054ae9fb6ba6cbd95e045ef601694f71799ad11cbe7f74f600845aca2b74 -->

![圖表](visualize:example-native-file)

```html
<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"></head><body>圖表</body></html>
```
````

上例 ID 為教學佔位值，沒有建立原生視覺化；摘要對應展示的兩行 HTML 加結尾 LF。實際流程先以同一份 HTML 建立原生視覺化，取得真正的檔案 ID，再生成 marker：

```sh
node scripts/figure-marker.mjs example-chart NATIVE_FILE_ID source.html
```

- `id`：文件內唯一的通用 figure ID，使用 ASCII 英數、底線或連字號。
- `ref`：真正的原生檔案 ID，同樣只含上述字元，長度 1–256；不含 `visualize:` 前綴，不使用 Page ID。
- `sha256`：64 位小寫十六進位摘要，涵蓋 HTML opener 的換行之後至 closing delimiter 開頭之前的完整 UTF-8 bytes，包括結尾換行、BOM、CRLF；不涵蓋 fence。

生成工具要求 UTF-8、完整文件、最多 256 KiB 且以換行結尾。將原文逐 bytes 貼入 fence，不重新排版；source 含 delimiter 時使用更長 fence。匯出後若 HTML 改變，應修訂來源，不直接重算摘要掩蓋變動。

## 配對條件與失敗處理

使用 CommonMark 語法樹辨識獨立 marker 與 image-style `visualize:` 參照，因此可處理上述 escaping；輸出仍保留原始 marker bytes，不全域移除反斜線。跳脫的 marker 可能在 Obsidian 顯示為文字。inline、引用、清單或範例 code block 不配對。

只有版本、唯一 figure ID、唯一原生參照、精確 URI、相鄰完整 fence 與 SHA-256 全部通過時，才移除該參照的原始整行。其他段落介入、ID／摘要不符、重複識別碼、未知版本、缺少欄位、缺 source 或校驗不可用時保留參照並警告；同文件其他有效配對可照常處理。

接續的 fence 必須為完整、已關閉的 `html`／`html-source`；支援 CommonMark backtick 和 tilde fences。內容需以 HTML doctype 開始、含 `<html>` 並以 `</html>` 結束。這只是文件邊界檢查，不驗證 HTML/CSS/JS 語意。

轉換後可由 marker 直接接完整 fence，維持冪等性（idempotence）；仍校驗保留的 v2 摘要。Importer 使用非同步 `convertVerified()`。既有同步 `convert()` 保留 v1 行為，對未校驗的 v2 保留參照並回報 `verification-required`。

## v1 相容

舊契約使用 figure ID 本身作為 standalone 參照，仍支援唯一 ID、頂層相鄰完整文件的配對：

````markdown
<!-- gpt-pages:figure v=1 id=example-chart -->
visualize:example-chart
```html
<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><style>/* complete CSS */</style></head>
<body><!-- content and data --><script>/* complete JS */</script></body>
</html>
```
````

文字 `visualize:` 不會建立原生視覺化。原始 UI 樣本的 v1 marker 沒有原生檔案 ID／摘要，image-style 參照不符合舊契約，因此仍保留；現在會辨識並警告未配對，不猜測兩者的關係。

## 原始碼與預設安全輸出

HTML/CSS/JS、所有必要資料須完整放在 fence，不能只留下 `visualize:` URI。code body bytes、中文、emoji、數學公式、反斜線、HTML entities、BOM 與換行形式均保留。不猜測將 `&lt;` 改成 `<`。

預設將所有 CommonMark HTML fences（含引用、清單、未配對、未知版本的內容）改成 `html-source`，只修改 opener 語言 token，不改 source body／delimiter。其他 code fences 保留。這項安全修改不等於配對成功。

明確信任整份內容後才輸出 `html` fences，包含未配對的 HTML 區塊。**校驗成功不代表安全或數位簽章，也不會自動啟用執行。** Polyglot Renderer 可立即執行 scripts。預覽永遠用 `textContent`，沒有執行式預覽。raw HTML 保留原文；importer 不是通用 sanitizer，也不能控制其他外掛的執行行為。

## 資產限制

建議每個文件自包含 HTML/CSS/JS／資料，可用 data URI 放圖片。相對資產以目的筆記目錄為檢查基準，**不複製或下載**來源檔旁的附件。

靜態掃描包含 HTML src/href/poster、CSS url/@import、Markdown 圖片、Obsidian embeds 及 URL 候選，報告外部、缺失、特殊協定、無法安全解析的參照。禁止跨出目錄的 `..`，不把 root-relative URL 當 vault 路徑。

這不是完整依賴解析：JavaScript 動態 URL、srcset、CSS escaping、特殊 HTML entities 等需人工檢查；一般超連結也可能列入。vault 中存在不代表 iframe 可載入；opaque origin、CORS、renderer 相對 URL 基準仍需實測。不能宣稱所有資產可用、離線或任意 HTML 可安全執行。

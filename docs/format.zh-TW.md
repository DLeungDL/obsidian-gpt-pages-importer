# Portable figure 格式：v3 精簡標記與 v1／v2 相容

[English](format.md) · **繁體中文**

本契約由本專案定義，Pages 不會自行補上配對資訊（binding metadata）。v3 將正文標記（marker）縮為圖表 ID，完整原生檔案參照（native file reference）與 HTML 的 SHA-256 摘要放在文件底部。v2 的相鄰與頁尾格式、舊 v1 格式仍相容。它不會下載原生附件、證明附件內容相同或把缺失的 HTML 還原。

已觀察 v1／v2 Pages 介面匯出：marker 成為 `\<!-- gpt-pages\:figure ... -->`，圖片 URI 成為 `visualize\:file_id`。公開 [v2 fixture](../tests/fixtures/v2-escaped.input.md) 依此語法自行編寫，全部 ID 均為虛構，不是實際匯出原檔。實際原檔、附件及來源識別資料不存入 Git；驗證範圍見 [公開摘要](pages-roundtrip.zh-TW.md)。

## v3 精簡正文與頁尾校驗資訊

新 Page 建議採用此格式。正文只留下相鄰的短 ID 標記與原生圖，頁尾各份完整 HTML 前放包含同一 ID、真正原生參照及摘要的 source 標記。版本由頁尾的 `v=3` 宣告，正文不用重複版本或校驗欄位：

````markdown
<!-- gpt-pages:figure id=example-chart -->

![圖表](visualize:example-native-file)

一般圖說與其他正文。

<!-- gpt-pages:source v=3 id=example-chart ref=example-native-file sha256=4eb2054ae9fb6ba6cbd95e045ef601694f71799ad11cbe7f74f600845aca2b74 -->

```html
<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"></head><body>圖表</body></html>
```
````

此例只有虛構識別碼。先以同一份 HTML 建立真正的原生視覺化，取得檔案 ID，再生成正文及頁尾兩個標記，分別放到上面的位置：

```sh
node scripts/figure-marker.mjs --v3 example-chart NATIVE_FILE_ID source.html
```

正文 figure ID、頁尾 source ID 與原生參照在各自範圍皆須唯一；圖片 URI 必須精確符合頁尾 `ref`。多圖來源可用不同順序，依 ID 配對，不能依圖名、排列、相同 HTML 或摘要猜測。v3 必須有對應的 v3 source 標記及完整 fence，不會退回尋找未標記的相鄰 HTML，也不能僅刪除 v2 正文的 ref／sha256 而保留 v2 頁尾標記。

頁尾 source 標記與完整 fence 之間只留空白行，不必額外添加「HTML 原始碼」標題或說明段落。成功配對後，外掛移回完整 fence，清除正文標記、圖片參照及頁尾來源；既有正文與標題保留。校驗、備份及信任條件與以下 v2 格式相同。

## v2 宣告與生成

可使用相鄰原始碼或頁尾原始碼兩種排版。舊的相鄰格式依序放置三個獨立、頂層（top-level）區塊，區塊間留空白行：

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

### 將完整 HTML 集中於文件底部

正文保留相鄰的 figure marker 與原生圖片參照。將完整 fence 移至頁尾，在每份 source 前增加獨立的 source marker，`id` 必須與正文 figure marker 相同：

````markdown
<!-- gpt-pages:figure v=2 id=example-chart ref=example-native-file sha256=4eb2054ae9fb6ba6cbd95e045ef601694f71799ad11cbe7f74f600845aca2b74 -->

![圖表](visualize:example-native-file)

一般圖說與其他正文。

<!-- gpt-pages:source v=2 id=example-chart -->

```html
<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"></head><body>圖表</body></html>
```
````

source marker 與其 fence 必須是相鄰的獨立頂層區塊，中間只能有空白行；標題或說明須放在 source marker 之前。多圖原始碼可以採不同順序，使用唯一 ID 配對，不依順序、圖名或相同摘要猜測。Pages 的 escaped source marker 同樣支援。正文仍需保留與 figure marker 相鄰且 URI 精確相符的原生圖片參照。

非同步校驗通過後，外掛把完整 fence 移回正文 figure marker 的位置，移除 figure marker、圖片參照、source marker 及原本的頁尾 fence；HTML body bytes 與 fence delimiter 保持原樣，僅依原有信任設定變更語言 token。頁尾標題與其他正文保留，不重複插入 HTML。這適用於手動匯入與資料夾原地清理，寫入前仍有備份與衝突保護。它讀取匯出 Markdown 內的 HTML，不連線 Pages 或下載附件。

缺少／重複 source ID、未知版本、非完整文件、摘要不符或校驗不可用時，不移動該份 HTML，也不刪除其標記與圖片參照。同一 figure 同時有相鄰及獨立 source 時視為歧義並保留，不能偷偷改用另一份 source；其他有效圖表仍可處理。

## 配對條件與失敗處理

使用 CommonMark 語法樹辨識獨立 marker 與 image-style `visualize:` 參照，因此可處理上述 escaping。成功配對後自動移除 marker 與原生圖片參照，避免跳脫標記及失效圖片的替代文字出現在 Obsidian；保留章節標題、一般圖說及完整 HTML。inline、引用、清單或範例 code block 不配對，也不全域移除反斜線。

只有版本、唯一 figure ID、唯一原生參照、精確 URI、相鄰或明確 source marker 指定的完整 fence 與 SHA-256 全部通過時，才清理配對資訊。若 marker 位於檔案開頭，仍保留開頭的 UTF-8 BOM。必要的相鄰區塊之間有其他段落介入、ID／摘要不符、重複識別碼、未知版本、缺少欄位、缺 source 或校驗不可用時保留標記與參照並警告；同文件其他有效配對可照常處理。

接續的 fence 必須為完整、已關閉的 `html`／`html-source`；支援 CommonMark backtick 和 tilde fences。內容需以 HTML doctype 開始、含 `<html>` 並以 `</html>` 結束。這只是文件邊界檢查，不驗證 HTML/CSS/JS 語意。

轉換後只留下 HTML fence 與原有正文，再次轉換不會改變輸出，維持冪等性（idempotence）。已清理的輸出沒有配對 metadata，再轉換時不重新計算 figure 數或校驗摘要；每次從原始匯出重新匯入時仍會校驗原始 v2／v3 metadata。舊版 v2 輸出若只保留 marker 與相鄰完整 fence，仍須通過摘要校驗才移除 marker。使用同一來源識別名稱重匯可更新未經本機修改的舊筆記，並先完整備份；本機修改仍停止覆寫。

Importer 使用非同步 `convertVerified()`。既有同步 `convert()` 對成功的 v1 配對同樣移除 marker 與 standalone 參照；對未校驗的 v2／v3 保留標記、參照並回報 `verification-required`。

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

獨立的[圖片來源 v1 合約](images.zh-TW.md) 支援將 PNG／JPEG／GIF／WebP 原圖 Base64 明確內嵌於 Markdown，並還原成 vault 圖片；不處理 HTML 內部圖片，也不改變既有 v1／v2／v3 圖表合約。

靜態掃描包含 HTML src/href/poster、CSS url/@import、Markdown 圖片、Obsidian embeds 及 URL 候選，報告外部、缺失、特殊協定、無法安全解析的參照。禁止跨出目錄的 `..`，不把 root-relative URL 當 vault 路徑。

這不是完整依賴解析：JavaScript 動態 URL、srcset、CSS escaping、特殊 HTML entities 等需人工檢查；一般超連結也可能列入。vault 中存在不代表 iframe 可載入；opaque origin、CORS、renderer 相對 URL 基準仍需實測。不能宣稱所有資產可用、離線或任意 HTML 可安全執行。

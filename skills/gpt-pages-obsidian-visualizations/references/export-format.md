# 標準匯出版型（standard export layout）

此格式供 GPT Pages → Markdown → GPT Pages Importer 使用。建立或更新 Page 時使用；單純詢問格式不授權修改 Page。

## 版面與佔位符

[標準範本](../assets/page-export-template.md) 是編排藍圖，不能原樣發佈。Page 標題使用 Page 本身的標題欄；正文開頭放介紹，依題材重複主題標題、說明、圖表標記及原生圖。所有完整 HTML 來源統一放在最後，來源之間僅留空行，不新增來源章節標題或匯出驗證說明。

| 範本欄位 | 實際內容 |
| --- | --- |
| `INTRODUCTION` | 讀者需要的主題介紹 |
| `SUBJECT_HEADING`、`SUBJECT_DESCRIPTION` | 有意義的圖表標題與資料／互動說明 |
| `FIGURE_MARKER_FROM_BUILDER` | 工具輸出的 `figure_marker` 字串 |
| `EXACT_NATIVE_VISUALIZATION_MARKDOWN_FROM_TOOL` | 原生工具回傳的完整圖表 Markdown，原樣保留 |
| `OTHER_BODY_SECTIONS_BEFORE_ALL_SOURCES` | 其餘正文與圖表；只有一圖時省略 |
| `SOURCE_MARKDOWN_FROM_BUILDER` | 同圖工具輸出的 `source_markdown` 字串 |
| `OTHER_SOURCE_BLOCKS_WITHOUT_APPENDIX_HEADINGS` | 其餘圖的來源區塊；只有一圖時省略 |

刪去不用的佔位符；寫入前確認沒有剩餘 `{{...}}`。來源區塊本身會在 Page 佔用空間，這個格式不承諾隱藏來源或在原生圖匯出時自動附帶 HTML。

## 優先格式：v3 精簡標記（compact marker）

目標外掛確認支援 v3 時使用；正文只保留圖表 ID：

```text
<!-- gpt-pages:figure id=chart-a -->
```

完整原生參照與校驗值移到文件底部、緊接完整 HTML 圍欄之前：

```text
<!-- gpt-pages:source v=3 id=chart-a ref=ACTUAL_NATIVE_FILE_ID sha256=ACTUAL_64_LOWERCASE_HEX -->
```

v3 版本由頁尾來源標記宣告；正文不要加 `v=3`、ref 或 sha256。也不要使用未定義的 `gpt-pages:chart-a` 縮寫。共同的 ID、參照、來源 bytes、圍欄與相鄰規則見下一節。

```powershell
node <skill-dir>/scripts/build_figure_pair.mjs --v3 chart-a ACTUAL_NATIVE_FILE_ID canonical.html
```

## 相容格式：v2 完整標記

正文圖表標記（下列大寫欄位均需替換，不可直接使用）：

```text
<!-- gpt-pages:figure v=2 id=chart-a ref=ACTUAL_NATIVE_FILE_ID sha256=ACTUAL_64_LOWERCASE_HEX -->
```

緊接該標記放工具回傳的原生視覺化 Markdown，只能隔空行。`ref` 等於原生參照 URI 的檔案 ID，不含 `visualize:` 或 `library-file:` 前綴；不要把 Page ID、檔名或自編 ID 當成它。不能建立原生圖時，交付草稿並說明缺少的配對，不能杜撰成功參照。

文件底部每一份來源的形狀如下。示例中的 `COMPLETE_HTML_BYTES` 必須換成完整文件；實際圍欄由產生工具決定。

````text
<!-- gpt-pages:source v=2 id=chart-a -->

```html
COMPLETE_HTML_BYTES
```
````

- 圖表 ID 為 `[A-Za-z0-9_-]+`，在文件中唯一；對應的 source 使用相同 ID。選簡短且穩定的 ID，例如 `chart-a`，更新內容時保持不變。
- 原生檔案 ID 為 `[A-Za-z0-9_-]{1,256}`；工具輸出與實際匯出不符合此格式時，停止宣稱可配對，先核對外掛解析器（parser）的相容性。
- source 標記與來源圍欄必須是獨立的頂層區塊，只能隔空行。不要放入清單、引言、另一個程式碼區塊，也不要在中間插入標題或說明。
- 來源可與正文排序不同，但不要重複 ID 或同時保留同圖的相鄰來源與頁尾來源。不能只憑標題、順序或相同 hash 推測圖表配對。
- `sha256` 是 64 位小寫十六進位，涵蓋起始圍欄換行之後、結束圍欄之前的**完整 HTML UTF-8 bytes**，含 HTML 本身的 BOM、CRLF 與最後換行，不含標記或圍欄。
- 保留原始來源 bytes，不做格式化、HTML entities 解碼、全域去除跳脫或換行正規化。生成器會要求結尾換行；缺少時先在標準來源加上，再建立原生圖與 hash。
- 產生工具接受最多 256 KiB 的來源。超出時先確認目標外掛限制並調整設計，不可截斷文件。
- 若來源內含圍欄，選比最長連續反引號更長的外圍圍欄，至少三個。完整 HTML 應為自包含文件；圖表資料、樣式與互動都在其中。

產生兩段標記與來源，避免手算 hash：

```powershell
node <skill-dir>/scripts/build_figure_pair.mjs chart-a ACTUAL_NATIVE_FILE_ID canonical.html
```

JSON 的字串值才是要寫入的 Markdown；原生圖仍取自視覺化工具。把同一份 canonical HTML 提交給原生工具，若工具回讀來源變更，先解決差異再產生標記。

## 格式版本的相容性界線

v2 圖表標記包含 ref 與 sha256，來源標記只含版本與 ID；v3 則使用精簡正文標記與完整頁尾來源標記。兩者不能只改一半、混用欄位或自行省略 metadata。

以目標解析器（parser）、格式契約與行為測試確認能力，並區分本機開發版本與使用者已安裝版本；沒有證據時用 v2。不要杜撰新版語法、把 metadata 搬到未支援欄位，或聲稱短標記在 Page 會隱藏。既有 Page 更新時保留其有效格式，除非當次任務要求遷移或需要新格式。

## 匯入與信任（import and trust）

外掛由匯出 Markdown 取得完整 HTML，驗證成功才把來源圍欄移回原生圖位置，並清理相應 marker 與原生圖片參照。SHA 不符、來源缺失／不完整、重複 ID 或參照不符時，保留相關原文並顯示警告；不能直接刪掉所有看似失效的圖片。

手動匯入預設把 HTML 保留為 `html-source`，啟用可執行 `html` 需要使用者明確信任。資料夾自動清理預設保留既有的圍欄語言；停用轉換選項不會撤銷先前已啟用的 HTML。需要驗證信任流程時，使用獨立測試副本，把來源開頭的 `html` 改成 `html-source`，保留內容 bytes 與 hash，並確認目標外掛支援此語言標籤。

不得自動勾選信任、安裝或啟用 renderer。SHA-256 只證明配對內容一致，不證明來源安全或取得執行授權。

## 驗收（acceptance）

1. 每圖有一個真實原生圖、一個唯一 figure marker、一個相同 ID 的 source marker 與完整 HTML 圍欄；資料與互動相符。
2. 原生來源、Page 回讀及實際下載 Markdown 的 HTML bytes 與 hash 相符，所有來源都在正文之後。
3. 沒有佔位符、虛構原生參照、額外來源章節標題或空副標題；主題標題、正文與其他圖片保留。
4. 若有可用的外掛驗證環境，確認移回位置、清理僅限有效配對、歧義保留、重複處理不增生內容；不要為了生成 Page 修改外掛。
5. 渲染、互動、信任對話框與 Obsidian 實機結果分層回報，詳見 [validation.md](validation.md)。未取得下載或實機環境時明確標為尚未測。

# 暫定 portable figure 格式 v1

本契約由本專案定義，**尚未由真實 ChatGPT Pages 匯出樣本驗證**。不得聲稱 Pages 目前必然輸出或保留這些標記。`examples/` 與 `tests/fixtures/` 是自行編寫的通用內容，不是實際匯出紀錄。取得實際通用 Page 匯出後，對照 bytes 與標記再修訂／固定細節。

## 精確配對

每個 figure identifier 必須在文件內唯一，使用 ASCII 英數、底線或連字號，不能用私人 Page ID。依下列順序，各區段可有空白行：

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

原生視覺化必須另外在 Page 內建立。文字 `visualize:` 只是暫定契約的匯出參照，不會自行建立原生視覺化。實際匯出若使用其他參照（如 Markdown link），MVP 保留並警告，不猜測或改寫。

只有 top-level、相鄰、identifier 精確相同、版本為 1、ID 唯一且接續完整 `html`／`html-source` fence 才移除參照行。支援 CommonMark backtick 和 tilde fences。來源必須以 HTML doctype 開始、含 `<html>` 並以 `</html>` 結束；只是文件邊界檢查，不是 HTML/CSS/JS 語意驗證。

已匯入文件允許 marker 後直接接完整 fence，以維持 idempotence。缺 source、其他段落介入、ID 不符／重複、未知版本、文件邊界不完整時保留 marker／參照並警告。不將 fragment 補成文件。

## 原始碼與預設安全輸出

HTML/CSS/JS、所有必要資料須完整放在 fence，不能只留下 `visualize:` URI。若 source 含三個 backticks，改用更長 delimiter。code body bytes、中文、emoji、數學公式、反斜線、HTML entities、BOM 與換行形式均保留。

MVP 不做 escaping 解碼：沒有已驗證的 exporter escaping，不能全域移除反斜線，也不能猜測把 `&lt;` 改成 `<`。

預設將所有 CommonMark HTML fences（含引用、清單、未配對、未知版本的內容）改成 `html-source`，只修改 opener 語言 token，不改 source body／delimiter。其他 code fences 保留。這項安全修改不等於配對成功。

明確信任整份內容後才輸出 `html` fences，包含未配對的 HTML 區塊。Polyglot Renderer 可立即執行 scripts。預覽永遠用 `textContent`，沒有執行式預覽。raw HTML 保留原文；importer 不是通用 sanitizer，也不能控制其他外掛的執行行為。

## 資產限制

建議每個文件自包含 HTML/CSS/JS／資料，可用 data URI 放圖片。相對資產以目的筆記目錄為檢查基準，**不複製或下載**來源檔旁的附件。

靜態掃描包含 HTML src/href/poster、CSS url/@import、Markdown 圖片、Obsidian embeds 及 URL 候選，報告外部、缺失、特殊協定、無法安全解析的參照。禁止跨出目錄的 `..`，不把 root-relative URL 當 vault 路徑。

這不是完整依賴解析：JavaScript 動態 URL、srcset、CSS escaping、特殊 HTML entities 等需人工檢查；一般超連結也可能列入。vault 中存在不代表 iframe 可載入；opaque origin、CORS、renderer 相對 URL 基準仍需實測。不能宣稱所有資產可用、離線或任意 HTML 可安全執行。

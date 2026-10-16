---
name: generate-portable-page
description: 為本專案 v3 精簡標記格式編寫通用 Page 視覺化與完整 portable HTML source，保留 v2 相容。
---

依本專案 `docs/format.md` 生成內容。v3／v2 是本專案的配對宣告，不是所有 Pages 匯出格式皆可還原的保證。

1. 自行編寫通用內容，不用私人 Pages、課程材料、私人匯出、帳號識別碼或本機路徑。
2. 在 Page 內建立原生視覺化，並附相鄰、穩定且文件內唯一的通用 figure ID；不能用 `visualize:` 文字假裝已建立視覺化。
3. 每個 figure 同時附完整 fenced html：doctype、html/head/body、UTF-8 meta、CSS、JS 與全部資料。優先自包含，逐一列明外部資產。靜態及互動各一，互動需 slider／reset。
4. 先保存完全相同的 HTML 原文並建立真正的原生視覺化，取得工具回傳的檔案 ID。不能使用 Page ID、檔名、猜測的 ID 或僅貼 `visualize:` 文字。
5. 使用 `node scripts/figure-marker.mjs --v3 FIGURE_ID NATIVE_FILE_ID SOURCE.html` 生成正文及頁尾兩個標記。HTML 檔必須以換行結尾；摘要涵蓋完整 UTF-8 source bytes，包括結尾換行、BOM 和 CRLF。上傳、貼入 fence 與計算摘要必須使用同一份原文，不要重新排版。省略 `--v3` 仍生成舊 v2 marker，僅供舊格式使用。
6. 每組各用獨立 top-level 區塊。新 Page 正文只放 `<!-- gpt-pages:figure id=example-chart -->`，緊接真正的 image-style `![title](visualize:file-id)` 嵌入。完整 HTML 集中於文件底部，每份 fence 前放 `<!-- gpt-pages:source v=3 id=example-chart ref=實際檔案ID sha256=64位小寫十六進位摘要 -->`。source marker 與 fence 之間只留空白行；不額外添加原始碼章節標題或說明。每個 figure ID、source ID 與原生檔案 ID 各自唯一，正文與頁尾用同一 ID 配對。舊 v2 相鄰及頁尾排版仍相容，勿混用版本。
7. `ref` 與 SHA-256 只放在 v3 頁尾 source marker，`ref` 不含 `visualize:` 前綴。Pages 的 CommonMark escaping 可能改變 marker／參照的文字表示；不得事後全域解碼。匯出後 HTML bytes 若改變，保持參照並修訂來源，不要單純重算摘要來掩蓋變動。
8. 不全域解碼 escaping／移除反斜線；source 含 fence delimiter 時使用更長 delimiter。
9. 校驗值只用來確認宣告的配對，不代表安全內容或數位簽章。預覽不執行 HTML/JS；成功配對也不自動啟用 renderer，仍需使用者明確信任。
10. 公開範例／fixtures／skill 只使用虛構識別碼。真正 UI 匯出、Page 連結、附件／上傳／區塊 ID、服務回條及原始截圖保留於 Git 外；公開結果只附不含來源識別資料的摘要。記錄匯出與副本差異、日期、renderer／Obsidian／OS／模式／結果，並執行 `npm run check:public`；mobile 未測明確標示。

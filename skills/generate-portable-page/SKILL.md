---
name: generate-portable-page
description: 為本專案暫定 v1 契約編寫可公開的通用 Page 視覺化與完整 portable HTML source。
---

依本專案 `docs/format.md` 生成內容。這是生成規範，不是 Pages 匯出行為已支援的證明。

1. 自行編寫通用內容，不用私人 Pages、課程材料、私人匯出、帳號識別碼或本機路徑。
2. 在 Page 內建立原生視覺化，並附相鄰、穩定且文件內唯一的通用 figure ID；不能用 `visualize:` 文字假裝已建立視覺化。
3. 每個 figure 同時附完整 fenced html：doctype、html/head/body、UTF-8 meta、CSS、JS 與全部資料。優先自包含，逐一列明外部資產。靜態及互動各一，互動需 slider／reset。
4. 暫定 marker：`<!-- gpt-pages:figure v=1 id=example-chart -->`。匯出是否為 standalone `visualize:example-chart` 需用通用 Page 實際驗證；若未保留契約，記錄差異，不能宣稱 importer 已相容。
5. 不全域解碼 escaping／移除反斜線；source 含 fence delimiter 時使用更長 delimiter。
6. 視 HTML/JS 為不受信任；生成／匯入預覽不得執行 source scripts，信任與執行由使用者另行啟用。
7. 公開前清理範例／fixtures／skill，記錄匯出日期、renderer／Obsidian／OS／模式／測試結果，mobile 未測明確標示。

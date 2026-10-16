# 公開驗證資料

公開儲存庫只保存自行編寫、使用虛構識別碼的測試資料（synthetic fixtures）與結果摘要。實際 UI 匯出、服務讀回、上傳回條、截圖及含真實 Page／檔案／區塊 ID 的紀錄保留於儲存庫外，不提交至 Git。

## 可重現的 fixtures

- [v2 跳脫輸入](../../tests/fixtures/v2-escaped.input.md)：自行編寫的靜態長條圖、互動 slider／reset；`fixture-static-file`、`fixture-interactive-file` 均為虛構檔案 ID，無可存取的 Page URL。
- [獨立預期輸出](../../tests/fixtures/v2-escaped.expected.md)：只移除已綁定參照行及更改 fence 語言，保留 HTML bytes。
- [v2 行為測試](../../tests/convert-v2.test.ts)：正常／跳脫參照、摘要與 URI 不符、重複 ID、缺 source、部分成功、BOM／CRLF、冪等性及匯入生命週期。
- [v1 fixtures](../../tests/fixtures/interactive.input.md)：保留原有同步 API 的回歸測試。

```sh
npm ci
npm run check
```

以上資料依觀察到的 CommonMark 表示方式編寫，不能當成實際 UI 下載原檔或重新產生私人來源的證據。摘要是公開 HTML body 的精確 SHA-256，不是原生附件的存取識別碼。

## 桌面結果的公開摘要

[validation-summary.json](validation-summary.json) 保存維護者回報的版本、日期及檢查結果。2026-10-14 的真正 Obsidian 1.14.4／Polyglot Renderer 1.3.0 測試以自行編寫內容完成；實際 v2 UI 匯入 15 項通過，既有 BOM 重匯問題仍未修正。摘要不包含真實來源 ID、完整原檔、截圖、上傳 ID、操作回條或帳號資訊。

2026-10-15 的公開資料清理保留上述結果，但移出全部原始證據；這是公開摘要，不是可獨立核驗所有桌面步驟的完整證據包。新的桌面驗證需使用自己的測試 Page／vault，依 [驗收步驟](../compatibility.md) 執行，發布前改用虛構 fixtures。

`npm run check:public` 檢查 Git 追蹤檔中的 Pages 識別碼形式、來源帳號／區塊 metadata，並限制此目錄只保存公開摘要。它不是通用機密掃描器。

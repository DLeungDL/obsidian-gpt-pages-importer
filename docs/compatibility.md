# 相容性與驗收紀錄

## 已確認的公開介面

2026-10-08（香港日期）讀取 [Nimaapr/polyglot-renderer README](https://github.com/Nimaapr/polyglot-renderer/blob/main/README.md) 與 [manifest](https://github.com/Nimaapr/polyglot-renderer/blob/main/manifest.json)。manifest 版本 **1.3.0**、最低 Obsidian **1.5.0**。README blob SHA：`c7ab44de801d9d6730cd3ea8a04ae2189a388a56`；manifest blob SHA：`878c5ea2065bc5789b512c5d8368231f656feaac`。這些是讀取檔案的身分，不是 release 實測證據。

公開文件指定 fenced `html` code block，inline rendering 預設開啟，iframe 使用 `allow-scripts` 而無 `allow-same-origin`。scripts 可執行，opaque origin 不等於網路隔離。本外掛只產生公開文件指定的 fence，不使用 renderer 私有 API、plugin registry，也不打包／fork renderer。

## 自動驗證範圍

Node.js 24.19.0、npm 11.9.0、Linux cloud；Obsidian SDK 型別 1.13.1，完整依賴見 `package-lock.json`。2026-10-14 重新建置還原的 MVP，驗證項目如下：

- TypeScript 型別檢查與 esbuild CommonJS 外掛建置；Obsidian 是唯一 runtime external。
- 打包後在沒有 DOM 的 VM 完成模組載入 smoke check；附所有實際 bundle 依賴的授權資料。
- 通用靜態／互動 fixtures 與獨立預期輸出；CommonMark 巢狀 fences、CRLF／BOM、中文／emoji／公式／escaping／反斜線及失敗情境。
- Storage lifecycle：建立、重複匯入、更新備份、本機修改、寫入競態、備份失敗、紀錄儲存失敗。
- Obsidian 公開 API 模擬：命令、modal、檔案選擇、預覽、寫入、信任 opt-in、UTF-8 失敗與衝突。
- jsdom 預覽不建立 script／img／iframe；僅自行編寫的互動測試 source 在測試 DOM 驗證 slider／reset。

API 模擬、SDK 型別檢查與 jsdom 不等於真實 Obsidian／Polyglot Renderer 端到端測試。

## 尚未實測

| 項目 | 狀態 |
| --- | --- |
| 實際 Pages 匯出日期／版本與原生視覺化／HTML source 配對 | 無實際匯出樣本，未驗證 |
| Obsidian runtime 版本、閱讀／編輯模式 | cloud 無 Obsidian 實機，未驗證 |
| Polyglot Renderer 1.3.0 實際呈現 | 僅核對公開文件，未執行 renderer |
| Windows／macOS／Linux Obsidian 實機 | 未驗證 |
| Android／iOS mobile | 未驗證；manifest 可安裝不代表已測試 |
| 任意 Pages 視覺化／任意 HTML 無損轉換 | 不保證 |

## 人工端到端驗收

1. 用公開、通用、自行編寫的內容建立 Page，加入靜態／互動原生視覺化及相鄰完整 HTML source。不得用私人 Pages、課程材料或私人匯出。
2. 手動匯出 Markdown，記錄匯出日期、可取得的版本／介面資訊；確認標記、fence 和 source bytes 是否保留。不符合暫定格式時先修訂契約與通用 fixtures，不宣稱支援。
3. 記錄 OS、Obsidian／Polyglot Renderer 版本，在測試 vault 安裝 importer。先關閉 renderer；確認預設匯入 html-source、預覽不執行 scripts、中文／公式／source 保留。
4. 相同來源名稱重匯不得重複；本機修改後重匯阻擋覆寫；更新未修改筆記時建立完整可還原備份。
5. 僅自有已檢查內容勾選信任，確認後寫入 html，再啟用 renderer。於閱讀／編輯模式檢查靜態圖、slider、reset、中文、資產／網路及 opaque-origin 限制。
6. 檢查缺 source、重複 ID、未知版本、escaping、literal backslash、缺失資產；記錄實際結果。mobile 分開測試，未測明確標示。

實際端到端證據補齊前，Issue #1 的 Pages／renderer 驗收仍不能標為完成。

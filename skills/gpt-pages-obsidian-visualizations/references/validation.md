# 匯出與呈現驗收（validation）

## 逐層記錄證據

| 層 | 要驗證的內容 | 證據與限制 |
| --- | --- | --- |
| 標準來源與 Page 讀回 | 每圖原生視覺化仍在；HTML 配對完整；資料、公式、中文、ARIA、事件一致 | 讀回文字／原碼 hash 加 Page 實際呈現。HTML hash 不證明原生圖的行為。 |
| 實際下載 Markdown | HTML 區塊數、順序與 UTF-8 bytes／SHA-256 等於已核對的標準來源 | 使用者下載或實際匯出取得的檔案，記錄檔案 byte 數；自行組裝檔僅是測試資料。 |
| HTML／JS 靜態檢查 | 完整文件、CSS 預設、內嵌資料、無外部依賴；inline JS 可解析 | `node --check` 只證明語法；不執行 DOM、事件或 renderer。依賴檢查需讀原碼，包含 CSS URL/import、script/src、圖片、模組與 fetch 等。 |
| 瀏覽器呈現與互動 | 標籤、公式、圖形、數字與事件結果；窄畫面、reset、重複操作 | 記錄 browser、直接 HTML 或 iframe、sandbox 條件及測試結果。模擬 sandbox 不代表 Obsidian 實測。 |
| Obsidian 實測 | 實際下載 Markdown 放入指定測試 vault，Polyglot Renderer 呈現及互動 | 記錄平台、外掛版本、Reading view 與實際測過的 Live Preview。截圖證明外觀；互動需操作結果。使用者回報須標為回報。 |

後一層不能由前一層推論通過。對未測或阻擋的層，列出具體缺少的證據。沒有 Page／下載／Obsidian 存取時，仍完成可做的產製與靜態檢查，但不宣稱端到端通過。

## 原碼驗證 helper

```powershell
python <skill-dir>/scripts/verify_html_export.py downloaded.md --expected canonical.md --out extracted --node-check
```

- Python 標準函式庫即可執行；`--node-check` 另需 Node.js，可用 `--node <executable>` 指定。
- 解析頂層圍欄，接受 backtick／tilde 與更長圍欄。HTML 開始圍欄須在第 1 欄；不支援 list／blockquote 內 HTML。遇到未關閉圍欄、非法 UTF-8、沒有 HTML 或不支援縮排會明確失敗，不偷偷修復。
- 比較每區塊圍欄內的完整 UTF-8 payload，包含結尾換行，按順序比對；Markdown 本體的 BOM 不算 HTML payload。保留 LF／CRLF，不自動 normalize、unescape 或 HTML entity decode。換行不同也會 hash 不同，先查原因並分別報告，不能宣稱 byte 相同。
- `--expected` 比對另一 Markdown 的 HTML payload；應先讓它與 Page 精確讀回一致。缺此選項時只產生 manifest，`source_match` 為 `null`，不能聲稱完成比對。
- `--out` 可將 payload 擷取為固定序號 HTML，僅寫新建／空目錄。報告輸出到 stdout；exit code `0` 代表所要求的檢查通過，`1` 代表 hash／JS 語法失敗，`2` 代表輸入或工具錯誤。
- JS 檢查區分 classic script 與 `type="module"`，略過非 JS 資料區塊。外部 `script src` 會失敗；HTML 事件屬性或 `javascript:` URL 不能由本 helper 充分驗證，需另外檢查。helper 不執行任何 extracted script。

## 代表性互動

附帶 [weighted-sum.html](../assets/weighted-sum.html) 是無私人教材的起點，不是所有教材都要使用的規格。固定 `x = (2, 3)`，兩權重分別控制滑桿與數值欄位：

| 操作 | 預期 |
| --- | --- |
| 初始 `(2, 1)` | `s = 7` |
| `(0, 0)` | `s = 0`，零貢獻仍可辨識 |
| `(-1, 2)` | `s = 4`，負貢獻在零點左側 |
| `(0.5, -0.2)` | `s = 0.4`，避免浮點殘差顯示 |
| 反覆改滑桿／數值欄位 | 數值、公式、ARIA 與圖形一起更新 |
| Reset | 回到 `(2, 1)` 與 `7` |
| 約 320px 寬、鍵盤操作 | 無截斷；控制項可操作且有 label／focus |

其他圖依其語義設計測試，不要把這組結果套到不同公式。原生 Page 與 export HTML 都需核對相同測試；樣式差異可以接受，數據與事件差異不可忽略。

## 避免混淆

- 原生 visualization／PNG 的內部參照不含可攜原碼／bytes；除非實際下載檢查證明不同，不要假定平台 export 已嵌入它們。
- 保留 HTML 的 code block 不代表任何 Markdown viewer 都會執行它；必須分開驗證「原碼保存」與「renderer 顯示」。
- Raw HTML、CSS snippets、fenced CSS／JS／JSON 各自有不同用途。Obsidian 原生 HTML 限制 script；若使用者另外要求將 JSON frontmatter 轉為 YAML，明確轉換即可，勿稱為自動 graph。
- 如果中文字變 `????` 或 U+FFFD，讀 bytes／code points、比對標準來源再判定。UTF-8 能解碼並不保證沒有已被替換的字；字型設定也無法修復資料損壞。
- 禁止全篇移除 Markdown 的 `\`，尤其會損害程式碼、公式、路徑和合法 escapes；只在已確認的局部文字處理需要的跳脫。

## Polyglot Renderer 相容性

優先查已安裝版本；需要釐清能力時讀主要來源，不因舊研究提到 `1.3.0` 就稱它永久最新。

- [Obsidian 官方插件頁](https://community.obsidian.md/plugins/polyglot-renderer)：插件身分與版本資訊。
- [上游 repository](https://github.com/Nimaapr/polyglot-renderer)：功能及使用說明。
- [code block 註冊](https://github.com/Nimaapr/polyglot-renderer/blob/main/src/main.ts) 與 [HTML renderer](https://github.com/Nimaapr/polyglot-renderer/blob/main/src/renderers/html-renderer.ts)：需要確認當前程式實作時讀取。

已研究的實作以 `html` code block processor 建立 `iframe.srcdoc`，使用 `sandbox="allow-scripts"`，未加 `allow-same-origin`。它另外包裝 HTML／head／body，並把傳入 source 放在 body；因此不能只從 standalone browser 成功推論 full HTML 在插件一定成功，需代表性測試。opaque origin 也可能令 storage API 不可用，互動應以文件內記憶體狀態為預設。

這些 sandbox 屬性不是完整網路封鎖或一般安全保證；檢查原碼、嵌入所有依賴，再執行可信內容。不為相容性擅自擴大權限、安裝外掛或改 vault 設定。

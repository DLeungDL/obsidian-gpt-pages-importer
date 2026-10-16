# 相容性與驗收紀錄

## 公開介面與自動檢查

Polyglot Renderer 公開 [README](https://github.com/Nimaapr/polyglot-renderer) 與 [manifest](https://github.com/Nimaapr/polyglot-renderer/blob/main/manifest.json) 指定 `html` fence、inline rendering 及最低 Obsidian 1.5.0。本外掛只產生公開支援的 fence，不使用 renderer 私有 API 或打包 renderer。公開 iframe 設定為 `allow-scripts`，opaque origin 不代表網路隔離。

2026-10-17 最新檢查環境為 Node.js 24.15.0／npm 11.12.1、Obsidian SDK 型別 1.13.1。`npm run check` 執行公開資料檢查、TypeScript、esbuild 建置、無 DOM 的打包 smoke check 及 108 項 Vitest 測試；完整依賴見 package-lock.json。

- 獨立輸入／預期 fixtures：CommonMark fences、跳脫參照、中文／emoji／公式／反斜線、CRLF／BOM 與 source bytes。
- v2 摘要、ID／URI／文件邊界、重複宣告、部分成功、校驗失敗保留、冪等性及同步 v1 相容。
- 成功配對後移除 marker 與原生圖片參照，保留正文／HTML bytes／開頭 BOM；舊版保留 marker 的筆記重匯先備份，仍阻止覆寫本機編輯。此次新增 12 項回歸測試（regression tests）。
- 匯入生命週期：建立、重匯、備份、本機修改、競態、備份及紀錄儲存失敗。
- Obsidian API 模擬、UTF-8／路徑／大小拒絕與純文字預覽不執行內容。
- BOM 修復新增 10 項回歸測試：LF／CRLF／雙 BOM、讀回既有紀錄、來源增刪 BOM 的備份／摘要、本機增刪 BOM 衝突及備份後原子寫入競態。測試替身現在反映真正 `Vault.read()` 移除 BOM 的差異；修復前新增案例有 8 項失敗，修復後全部通過。

模擬、SDK 型別與 jsdom 不等於真正桌面程式。公開資料檢查只針對此儲存庫的來源識別資料形式與證據目錄規則，不是通用機密掃描器。

## 真正 Linux 桌面結果摘要

維護者於 2026-10-14 在 Debian GNU/Linux 13.6 x86_64、Xorg 虛擬顯示器啟動官方 Obsidian 1.14.4／Polyglot Renderer 1.3.0。內嵌 Electron 43.7.7、Chromium 150.0.7871.250、Node.js 24.21.0；使用 Playwright／CDP 操作真正 UI、Vault API 及 iframe，未使用 stub 或 jsdom。啟動旗標 `--no-sandbox --disable-gpu`，沒有驗證 Electron 外層 sandbox 或 GPU。

| 階段 | 維護者回報結果 |
| --- | --- |
| 基準 MVP 桌面驗證 | 19 項通過、1 項 BOM 失敗；含匯入、重匯、備份、競態／衝突、大小／路徑／UTF-8 拒絕及重啟 |
| 基準 MVP 與真正 v1 UI 匯出 | 13 項通過、1 項原生參照配對不支援；完整 HTML 可明確信任後呈現 |
| v2 明確綁定的測試副本 | 15 項通過，兩圖配對、摘要／ID 不符保留及兩種呈現模式正常 |
| 正式儲存 v2 的服務來源 | 4 項通過，兩個 marker 儲存、其他內容保留、摘要正確與冪等性 |
| 新下載的真正 v2 UI 匯出 | 15 項通過，原檔不變、配對 2、HTML bytes 保留、slider／reset、重匯／備份／衝突正常 |

[結果摘要](evidence/validation-summary.json) 不含來源識別碼。[公開 fixtures](evidence/README.md) 全部使用虛構 ID；原始匯出、讀回、操作回條及截圖只保留於儲存庫外，因此公開資料不能獨立核驗全部桌面步驟。

### BOM 重匯誤判衝突：基準問題與修復

以 UTF-8 BOM 儲存通用 Markdown，首次匯入後立即用相同來源名稱重匯，實際誤判「停止寫入」，完整重啟後也可重現。磁碟 bytes 與保存的 outputHash 相同，但真正 Vault.read() 移除開頭 BOM，Vault.readBinary() 保留。VaultStorage.read() 使用前者，因此 hash 比較將未修改檔案誤判成本機修改；自動測試的 host double 沒有此差異。

上述為修復前結果。2026-10-17 已改用 `Vault.readBinary()` 搭配嚴格 UTF-8 解碼（`fatal: true, ignoreBOM: true`），保留 BOM／換行再比對 hash 與製作備份。保留原有 `Vault.process()` 的原子內容比對；實測此 API 的 callback 收到包含 BOM 的原文。未修改既有 outputHash 或忽略本機增刪 BOM，因此舊匯入紀錄可直接使用，本機 BOM 變更仍會停止覆寫。Windows 修復後實測另列於下方；未宣稱已在 Linux 重測修復版本。

## Windows 實機驗收（desktop acceptance）

2026-10-17（香港時間），在 Windows 11 Home x64（10.0.22631）以獨立測試 vault 驗證提交 `bd5e0a7` 的建置產物。Obsidian 應用程式為 1.14.4，既有安裝器（installer）為 1.6.7；實際內嵌 Electron 30.1.2、Chromium 124.0.6367.243、Node.js 20.14.0，Polyglot Renderer 為 1.3.0。本機建置環境為 Node.js 24.15.0／npm 11.12.1，`npm run check` 的 86 項自動測試通過。

核心驗收透過 Obsidian 官方命令列（CLI）在真正 Electron renderer 中執行已註冊的匯入命令、操作實際 modal／File API，並使用真正 Vault API 與磁碟 bytes 驗證；未使用 stub 或 jsdom。補充驗收以 Windows 原生檔案選擇器及滑鼠操作實際畫面。使用儲存庫自行編寫、含虛構 ID 的公開 v2 fixture，並非此次重新下載的 Pages UI 匯出。

| 核心驗收項目 | 結果 |
| --- | --- |
| 外掛載入與匯入命令註冊 | 通過 |
| v2 兩圖配對、純文字預覽無可執行元素 | 通過 |
| 首次匯入與獨立預期輸出逐 byte 相同、outputHash 正確 | 通過 |
| 相同來源重匯不寫入、不重複、不新增備份 | 通過 |
| 更新先完整備份，再替換目的內容 | 通過 |
| 本機編輯及預覽後競態阻止覆寫 | 2 項通過 |
| 摘要不符、原生 ID 不符及重複 figure ID 保留參照 | 3 項通過 |
| 非法目的路徑、非法 UTF-8 及超過 20 MiB 拒絕 | 3 項通過 |
| BOM 首次匯入保留磁碟 bytes | 通過 |
| 未修改 BOM 檔案重匯應為無變更 | **失敗：重現已知誤判衝突，原檔未覆寫** |

核心共 15 項：14 項通過、1 項已知問題失敗。另有 5 項補充檢查通過：Windows 原生選檔後成功配對 2 圖並寫入正確 bytes、預設 `html-source` 閱讀模式顯示 2 個 source blocks 且無 iframe、靜態圖標籤及比例、滑桿由 50 調到 85 時數值與長條同步、重設回 50。呈現檢查使用從獨立預期輸出另製的 `html` fence 筆記；沒有將此結果宣稱為信任勾選框的端到端匯入驗證。可見的兩個 renderer iframe 均為 `sandbox="allow-scripts"`，不代表已測網路隔離。

此段為修復前的 Windows 基準結果：磁碟保留 BOM、outputHash 與磁碟一致，但 `Vault.read()` 讀回不含 BOM；相同來源重匯因此被誤判為本機修改，與 Linux 基準問題一致。

原始操作回條（receipts）、驗收腳本、測試 vault 與畫面證據均保留在儲存庫外；[公開結果摘要](evidence/validation-summary.json) 只保存環境、項目數與限制。本次未測完整程式重啟、信任勾選框的匯入流程、其他 renderer 模式或任意 Pages 檔案，不能將完整相容性驗收標為完成。

### Windows BOM 修復後重測

同日、相同 Windows／Obsidian 環境，在獨立測試 vault 安裝以 `bd5e0a7` 為基底的工作目錄修復建置，重新載入該 vault 後驗收。實際安裝的 `main.js` 與建置產物 SHA-256 均為 `6f6072abfb36c17df0d223f7f26ca632d0337001e33d2a0d5e2800497c3a210a`。

| 修復後驗收項目 | 結果 |
| --- | --- |
| 上述 15 項核心流程全部重測，含原失敗的 BOM 相同來源重匯 | 15 項通過 |
| 修復前已匯入的 BOM 筆記，不轉換紀錄、不重寫目的檔案 | 通過 |
| BOM／CRLF 首匯與重匯、更新後逐 byte 備份及 outputHash | 2 項通過 |
| 來源新增／移除 BOM 正常更新、先備份，之後重匯無變更 | 2 項通過 |
| 本機新增／移除 BOM 阻止覆寫 | 2 項通過 |
| 預覽後新增／移除 BOM，在建立備份前停止 | 2 項通過 |
| 備份後、真正 `Vault.process()` 前注入 BOM 增刪競態，原子比對拒絕替換並保留備份 | 2 項通過 |
| 開頭雙 BOM 保留且重匯無變更 | 通過 |
| 再次重新載入測試 vault，從磁碟載入紀錄後 BOM／CRLF 重匯無變更 | 通過 |

共 28 項實機檢查全部通過，使用真正匯入 modal、File API、Vault API 與磁碟 bytes，未使用 stub 或 jsdom。初次腳本在背景等待 UI 超過 5 秒逾時，已保留回條並延長等待、使用獨立來源名稱重跑受影響項目；最終 27 項流程檢查及 1 項重新載入檢查均通過。公開摘要不包含原始操作回條。此次沒有重跑前述 renderer 滑鼠補充項目，也未測完整程式關閉再啟動或 Linux 修復版本。

### Windows 配對標記清理驗證

2026-10-17，以 `a56bbe8` 為基底的標記清理修改在相同獨立測試 vault 建置、安裝並重新載入。建置與安裝的 `main.js` SHA-256 均為 `33b49be1037e4db7cb3a7537adaa00f14ab13adbb45fc3b2615857c2a527c0f1`。以下 8 項實機檢查全部通過：

| 驗收項目 | 結果 |
| --- | --- |
| 實際 runtime、外掛載入與安裝產物 hash | 通過 |
| 公開 v2 fixture 的兩組 marker／原生圖片參照清理、純文字預覽與獨立預期輸出 | 通過 |
| 寫入內容逐 byte 相同，紀錄 outputHash 正確 | 通過 |
| 相同來源重匯不寫入、不新增備份 | 通過 |
| 摘要不符保留該組 metadata，其他有效配對仍清理 | 通過 |
| 原生 ID 不符保留標記與圖片參照 | 通過 |
| 檔案開頭即為 marker 時保留 BOM，重匯無變更 | 通過 |
| 雨水範例勾選信任後匯入，兩個可見 renderer iframe、完整 HTML bytes、章節標題保留且無可見標記／失效圖片 | 通過 |

雨水範例使用先前保存的 Page API 讀回內容，**不是此次重新取得的 Pages UI 匯出**。實際畫面另確認長條圖及互動圖初始的 240 公升、每日 30 公升、可用 8 天及七日後剩水 30 公升；本次沒有操作滑桿／重設。原始來源、驗證腳本與回條保留於 Git 外。

初次腳本的 runtime 診斷使用了 CLI 環境無法載入的模組，產品測試尚未執行；修正後完成前 7 項。最後呈現檢查曾把 Obsidian 快取的隱藏 iframe 計入總數；最終改以兩個可見 iframe 並分別核對靜態／互動來源，結果為 8 項通過。未改動 renderer。

### Windows 匯入流程改善驗證

2026-10-17，在相同獨立測試 vault 安裝以 `fd16aca` 為基底的工作目錄建置。最後安裝的 `main.js` 與建置產物 SHA-256 均為 `c6c8271a0d05b0b6cd71191ec5e228cd16a22d6d8a56ac325dab84780cf55321`，建置及 129 項自動測試通過。使用使用者保留的四圖 Markdown 原檔副本，未在此次重新匯出 Pages。

| 實機檢查 | 結果 |
| --- | --- |
| 右鍵入口直接帶入選取的 Markdown，顯示選檔名稱與更換檔案按鈕 | 通過 |
| 預覽顯示成功配對 4 組，摘要及確認按鈕可見，原始碼與資產報告預設摺疊 | 通過 |
| 返回設定保留所選檔案，毋須重新選檔即可再次預覽 | 通過 |
| 確認寫入後關閉預覽並自動開啟正確目的筆記 | 通過 |
| 磁碟輸出無配對標記／原生圖片參照，四份 HTML body bytes 與原檔一致，原檔未修改，紀錄 hash 正確 | 通過 |
| 目的筆記不再提供「匯入目前筆記」命令 | 通過 |

此次使用預設不信任模式，輸出四個 `html-source` 區塊，未重新驗證互動圖執行。拖放、換檔時的信任重設、不同來源名稱與資料夾、無變更／錯誤／取消等流程另由自動測試涵蓋；不將這些模擬結果宣稱為 Windows 實機檢查。原檔副本、操作摘要及磁碟驗證回條保留於 Git 外。

### Windows 指定資料夾原地清理驗證

2026-10-17，在相同獨立測試 vault 安裝以 `fd16aca` 為基底、包含匯入流程改善及資料夾自動清理的工作目錄建置。建置與安裝的 `main.js` SHA-256 均為 `24c9d2e55ba6a488d31e6ab3b0f6cdbb23ade2df939f46a3c357c02b3b8ce38b`，建置與 163 項自動測試通過。

透過 Obsidian CLI 在真正 runtime 呼叫外掛設定及 Vault API，使用公開、自行編寫的 v2 兩圖 fixture，先將 fence 設為 `html-source`，未執行測試 HTML。17 項 runtime 檢查全部通過，涵蓋：

| 檢查範圍 | 結果 |
| --- | --- |
| 正確測試 vault、設定初始關閉、啟用即掃描現有及子資料夾 Markdown | 通過 |
| 真正 create／modify／rename 事件自動清理原檔，不改路徑 | 通過 |
| 重複掃描及外掛自己的 modify 事件不重寫、不新增重複備份 | 通過 |
| 範圍外相近名稱資料夾、非 Markdown 與未知版本標記保留 | 通過 |
| 每份備份與寫入前來源 bytes 相同，子資料夾同名檔案使用不同備份目錄 | 通過 |
| HTML body bytes、fence 語言、目前筆記與既有匯入紀錄保留，成功配對 metadata 移除 | 通過 |
| 停用後新增檔案不處理，測試後恢復原先關閉設定 | 通過 |

另以 Windows 電腦操作開啟 **設定 → GPT Pages Importer**，確認資料夾輸入框、預設關閉的啟用開關、儲存設定及立即清理按鈕均可見。此次未透過 GUI 啟用監看；設定儲存及檔案事件由上述真正 runtime API 驗證。備份失敗、並行編輯、停用中的原子寫入保護、非法 UTF-8 與大小上限由自動測試涵蓋，不宣稱為此次實機注入測試。原始回條、備份及測試筆記保留於 Git 外。

### Windows 自動清理後 HTML 渲染選項驗證

2026-10-17，在相同獨立測試 vault 安裝加入資料夾信任確認的工作目錄建置。建置與安裝的 `main.js` SHA-256 均為 `26d99781f4d7df6239f88058e7f5717aa543bea9b34c2420d74c97e91ac4f8ee`，建置與 177 項自動測試通過。

透過 Obsidian CLI 呼叫已安裝外掛及真正 Vault API，使用獨立資料夾、公開 v2 fixture 及自行編寫的無外部依賴 HTML，15 項 runtime 檢查全部通過，包含：

| 檢查範圍 | 結果 |
| --- | --- |
| 升級保留原本監看資料夾／清理設定，新渲染選項預設關閉；未確認資料夾信任的 API 呼叫被拒絕 | 通過 |
| 預設清理保留 `html-source`；明確授予測試資料夾信任後，已清理筆記及新增檔案轉為 `html` | 通過 |
| 原始 HTML body bytes、完整備份、重複掃描不重寫、範圍外來源與匯入紀錄保留 | 通過 |
| 開啟自行編寫的證明筆記，以 Polyglot Renderer iframe 的來源及執行後 `postMessage` 回條確認 HTML／JavaScript 實際執行 | 通過 |
| 取消渲染信任後，之後清理保留 `html-source`，既有 `html` 保留 | 通過 |
| 測試完成恢復原有監看資料夾／啟用設定及目前筆記，渲染選項保持關閉 | 通過 |

信任視窗的確認／取消／關閉、更換資料夾後重新確認、確認後仍須儲存設定，以及信任撤銷時的原子寫入防護，由 jsdom 自動測試涵蓋。此次實機驗證直接為自行編寫的測試資料夾授予 API 信任，未透過 GUI 代替使用者接受信任提示，也未對原有監看資料夾啟用渲染。原始回條、備份及測試來源保留於 Git 外。

## 尚未實測

| 項目 | 範圍 |
| --- | --- |
| 其他 Pages 匯出版本、附件包裝及視覺化類型 | 僅同一自行編寫、自包含靜態／互動測試 Page 的 v1／v2 UI 原檔 |
| 最低目標 Obsidian 1.5.0 與其他 runtime | 已測 1.14.4 Linux 與上述 Windows runtime，其他未驗證 |
| 其他 renderer 版本及 file view／embed／smart paste | 已測 1.3.0 inline，其他未驗證 |
| macOS、實體 Linux GPU、Android／iOS | 未驗證 |
| 任意 Pages／HTML 無損、安全執行或離線保證 | 不保證 |

## 人工端到端驗收

1. 自行編寫通用內容並建立自己的測試 Page，包含靜態／互動原生視覺化及相鄰完整 HTML。不要將私人 Page／匯出加入 Git。
2. 依 [v2 契約](format.md) 使用真實檔案 ID 與摘要，手動匯出，將日期／介面版本及原檔保存在儲存庫外。檢查 metadata、fence 和 HTML bytes。
3. 記錄 OS／Obsidian／renderer 版本，以獨立 vault 安裝外掛。先驗證預設 html-source、預覽不執行、文字／HTML 保留。
4. 重匯不得重複，本機修改阻止覆寫，更新未修改筆記先完整備份。
5. 僅對已檢查的自有內容明確信任，確認閱讀／Live Preview 的靜態圖、slider、reset、中文及資產／網路行為。
6. 測摘要／ID 不符、重複 ID、缺 source、escaping 與 assets；結果發布成摘要及虛構 fixtures，執行 `npm run check:public`。不要提交原始回條或截圖。

真正 v1／v2 UI、Linux 匯入及上述 Windows 公開 fixture 範圍已測，BOM 修復與配對標記清理已在 Windows 重測；其他平台與上列未實測範圍仍有缺口，不能將完整相容性驗收標為完成。

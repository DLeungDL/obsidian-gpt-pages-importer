# 單一 Markdown 的可攜圖片

[English](images.md)

由 skill 在 Page 中加入明確版本的 `gpt-pages-asset` 來源 fence，讓下載的 Markdown 同時帶上原圖 Base64。插件離線驗證後，將圖片存入 vault 並改寫原生圖片參照，不需要 ZIP、網路或 HTML 執行信任。

## 格式與限制

每張圖片必須是頂層獨立 Markdown 圖片，與唯一來源區塊的完整 `source_ref` 精確配對。區塊包含 `version: 1`、唯一 `id`、`source_ref`、`filename`、`mime`、`byte_size`、`sha256` 及 `base64`。使用 [產生器](../skills/gpt-pages-obsidian-visualizations/scripts/build_image_asset.mjs) 計算，禁止手抄。完整欄位規則與範例見 [英文格式合約](images.md)。原先實驗用的普通 `json` fence 不會被當成圖片來源。

只接受 PNG、JPEG、GIF、WebP 的 MIME 與簽章配對；簽章檢查不代表完整影像解碼有效。每張解碼後最多 1 MiB，每次匯入最多接受 4 MiB 圖片，來源區塊最多 32 個。Base64 約增加三分之一大小；這些是插件限制，不代表 Pages 或編輯工具能接受相同大小。若完整區塊超過工具編輯預算，應回報限制，不能切開 JSON fence 或擅自壓縮原圖。

來源 ID 及參照須唯一。重複參照、巢狀或嵌在正文內的圖片不會還原；無效、缺失或配對不明的來源保留並警告。程式碼範例、HTML 原始碼及普通附件連結不變。SVG 與一般二進位附件不在此格式內。

頂層獨立圖片支援直接連結與參照式圖片（reference-style images）。內部圖片網址的 `#display=full` 可與不含片段的 `source_ref` 配對，其他片段與查詢參數不會任意移除。獨立的 `data:image/png|jpeg|gif|webp;base64,...` 圖片也會經過簽章、大小與雜湊驗證後還原。有圖片來源區塊時，必須依 MIME、長度與 SHA-256 唯一配對；內容不符或有歧義時保留來源。沒有來源區塊時，可直接還原有效 data URI 圖片。參照定義只在圖片成功改寫，且沒有其他圖片或普通連結使用時移除。須使用包含此功能的新版建置（build）。

## 保存與復原

手動匯入與自動清理都保存到 `筆記資料夾/GPT Pages Assets/完整SHA-256.副檔名`，再改寫成一般 Markdown 相對連結。payload 的檔名只是描述，不能指定寫入路徑。既有圖片只有長度與雜湊一致才重用，絕不覆寫不同內容。

預覽不寫入或載入圖片。更新既有筆記時先備份，再建立圖片並讀回確認，最後以原有原子衝突檢查寫入筆記。任一圖片失敗則保留原筆記。這不是跨檔案交易：中斷可能留下未使用圖片及完整備份，重試會重用已驗證圖片；不自動刪除可能被其他筆記引用的圖片。手動重匯可補回遺失圖片；已清理的筆記不再包含 Base64，須用原匯出檔才能重新產生圖片。

## 已驗證範圍

2026-10-19 的 191-byte、120 × 60 PNG，經 Pages 讀取、普通 JSON fence 儲存、真正 UI Markdown 下載及解碼後，與原始圖片逐 byte 及 SHA-256 完全一致。新 `gpt-pages-asset` fence、較大／多圖片與 vault 自動寫入目前只有自動測試，尚未重新實測 Pages UI 或真正 Obsidian。私人匯出及真實識別碼不提交至公開儲存庫。

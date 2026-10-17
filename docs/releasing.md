# 發行流程（Release process）

GitHub 發行標籤（release tag）必須與 `manifest.json` 的 `version` 完全相同，例如 `0.1.0`，不加 `v` 前綴。`package.json`、`package-lock.json` 的根套件版本，以及 README 的版本徽章與下載檔名也須同步更新。

## 發行前檢查（Preflight）

1. 更新 `manifest.json`，並在 `versions.json` 記錄版本與最低 Obsidian 版本（minimum app version）的對應。
2. 執行 `npm ci` 與 `npm run check`；需要驗證 Page 技能時，再執行 `python -B -m unittest discover -s tests -p 'test_skill_export.py' -v`。
3. 確認 `LICENSE`、使用指南與相容性紀錄完整，且 `git status` 沒有待處理變更。
4. 將檢查通過的提交推送至 `main`，並以相同提交建立發行標籤。

建置會將第三方授權聲明（third-party notices）嵌入 `main.js`，因為 Obsidian 社群安裝只下載 `main.js`、`manifest.json` 與可選的 `styles.css`。

## 發行附件（Release assets）

- `main.js`、`manifest.json`、`styles.css`：直接以這些檔名上傳，讓 Obsidian 下載。
- `LICENSE` 與 `THIRD-PARTY-NOTICES.txt`：提供可單獨閱讀的授權聲明。
- `gpt-pages-importer-版本.zip`：包含完整 `gpt-pages-importer/` 資料夾，供手動安裝。
- `SHA256SUMS.txt`：上述附件的 SHA-256，供下載後校驗。

上傳後另下載附件，比對 SHA-256、壓縮檔目錄與 manifest 版本。正式發行使用一般 release；草稿（draft）與預發行（prerelease）不作為社群安裝版本。

## 社群目錄（Community directory）

依 [Obsidian 官方提交流程](https://docs.obsidian.md/plugins/releasing/submit-plugin)，在 [社群目錄](https://community.obsidian.md) 登入並連結 GitHub，再從 **Plugins → New plugin** 提交儲存庫網址。提交需要閱讀並同意開發者政策（Developer policies），以及由維護者承諾持續支援。

提交後依管理頁的自動審查（automated review）結果修正；若需變更程式碼，再發布遞增版本。只有完成目錄審查並發布後，才在 README 宣稱可由 Obsidian 社群外掛列表安裝。

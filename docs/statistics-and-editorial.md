# 統計、關鍵字與正體中文顯示稿

首頁累計觀看／按讚數來自收錄影片的 YouTube 數字，與本站 GA 流量不同。分段與不同版本按影片 ID 分別計算。

## YouTube 統計

安裝 [requirements.txt](../requirements.txt) 後執行：

```sh
python scripts/update_statistics.py
npm run build
```

- `data/statistics.json` 保存單片數字、取得時間與更新狀態。
- `data/statistics-history.json` 依 Asia/Taipei 日期保存快照，同一天重跑會更新該日資料。
- 未提供的數字為 `null`，真正的零仍為 `0`。
- 連線失敗保留上次成功值與時間，以 stale 或 unavailable 標示。
- 每次最多三支並行，只讀公開中繼資料，不下載影片，不需 YouTube API key。

GitHub 的 `statistics.yml` 每日 19:10 UTC（台灣時間 03:10）執行、提交資料並建置；`ENABLE_PAGES=true` 時接續部署。可以從 Actions 手動執行，排程可能延遲，結果以 run 紀錄為準。

## 其他排程方式（選用）

使用作業系統排程器時，依序執行上述更新及建置指令即可。Unix 另可使用：

```sh
python scripts/daily_update.py
```

此包裝以 `fcntl` 檔案鎖避免重複工作，使用目前 Python 執行統計工具，從 PATH 尋找 Node.js；亦可指定環境變數 `PUMA_NODE_BIN`。它只更新工作目錄，不自動提交或推送 Git。Windows 可直接由排程器執行兩個基本指令。

macOS 如需使用者排程，可在所選 Python 環境準備或安裝設定：

```sh
python scripts/install_daily_statistics.py                    # 只產生設定預覽
python scripts/install_daily_statistics.py --install          # 安裝到目前使用者
python scripts/install_daily_statistics.py --install --hour 3 --minute 10
```

安裝器會依執行時的 Python、Node.js 與專案目錄建立設定，時間依該設備時區。需使用者登入，工作期間以 `caffeinate` 防止閒置睡眠；其他平台不需此工具。設定預覽及日誌位於未納管的 `.cache/`；環境位置改變後需重新安裝。儲存庫不包含任何已安裝排程的宣告或裝置專用設定。

## AI 文字工具

網站建置與一般測試不需要模型或 OpenCC。產生新的顯示稿／關鍵字需 Apple Silicon macOS 14 以上，以及獨立安裝的 Python 套件：

```sh
python -m pip install -r requirements-editorial.txt
# 模型目錄需事先備妥；文字工具不自動下載權重
python scripts/refine_transcripts.py --model ./.models/text-model
python scripts/refine_transcripts.py --model ./.models/text-model --keywords-only
python scripts/finalize_editorial.py
```

先依[文章工作流程](articles.md)產生或更新摘要，再挑選關鍵字。校對與關鍵字選取分開執行，以各篇文章為依據，選出 5–10 個具體詞彙；程式核對文字及 hash，文章改變後需重新選詞。首頁顯示常見詞，主題頁提供完整標籤雲，權重為包含該詞的影片數。

原始 `data/interviews.json` 與顯示用 `data/editorial.json` 分開保存。中文顯示稿透過 OpenCC `t2s → s2tw` 統一字形，並採保守詞彙修正；英文提供正體中文譯稿並保留時間範圍。語意不明時保留明確註記，不猜測發言。`review` 保存模型、方法、來源 hash、時間及人工覆核狀態；AI 處理不標為人工覆核。

OpenCC 與模型套件由目前 Python 環境提供，不從下載快取載入套件或私人覆寫檔。`.cache/` 只保存可重建的生成與媒體產物；不得將原始音訊、模型、cookies、憑證或設備日誌提交儲存庫。

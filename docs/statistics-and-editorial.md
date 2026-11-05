# YouTube 統計、關鍵字與正體中文逐字稿

網站目前收錄 115 支訪談影片。首頁提供 YouTube 累計觀看、累計按讚、影片數與總時數；卡片及每篇專訪頁顯示該影片的觀看數與按讚數。這些是收錄影片的 YouTube 數字，不是本站 GA 流量；分段與不同影片版本按各自的影片 ID 計算。

## 每日統計

- `data/statistics.json`：每支影片的觀看／按讚數、取得時間及更新狀態。
- `data/statistics-history.json`：依台灣日期保存每日總量，同一天重跑只更新該天資料。
- YouTube 未提供的數字保留 `null`，畫面顯示「未提供」；真正的零會顯示 `0`。
- 連線失敗時保留上次成功的數字與原取得時間，標示沿用舊值；不把缺漏資料改成零。

統計以 [yt-dlp 的公開中繼資料欄位](https://github.com/yt-dlp/yt-dlp#output-template)取得，不需要 YouTube API Key。每次最多三支並行，僅讀取中繼資料，不下載影片。

### 本機排程已安裝

macOS 使用者 LaunchAgent：`~/Library/LaunchAgents/tw.pumatalks.daily-statistics.plist`。每天 **03:10（本機時間）**執行，完成統計後重建 `dist/`。本次已透過 launchd 實際試跑，包含 YouTube 更新與網站建置，最後退出碼為 0。

這是本機使用者排程，需使用者登入；不是已上線的雲端排程。工作執行時以 `caffeinate` 避免閒置睡眠，不修改永久能源設定。LaunchAgent 的機制可參閱 [Apple 官方文件](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)。

```sh
# 查詢排程
launchctl print "gui/$(id -u)/tw.pumatalks.daily-statistics"

# 手動更新並建置
PATH="$PWD/.venv/bin:$PATH" npm run daily

# 僅更新數字
PATH="$PWD/.venv/bin:$PATH" npm run statistics

# 重新準備設定檔（只寫入 .cache，尚不安裝）
.venv/bin/python scripts/install_daily_statistics.py

# 安裝／更新同一個使用者排程；記錄當前 Node.js 絕對路徑
.venv/bin/python scripts/install_daily_statistics.py --install
```

日誌：`.cache/daily-statistics.log`、`.cache/daily-statistics-error.log`。Node.js 版本管理器的路徑改變後，重新執行安裝指令更新路徑。`daily_update.py` 以檔案鎖避免重複啟動。

`.github/workflows/statistics.yml` 另提供 GitHub 版本：台灣時間每天 03:10 更新數據、保存每日快照，並建置網站、保存 artifact。儲存庫為 [rickhw/puma-talk](https://github.com/rickhw/puma-talk)，推送後由 GitHub Actions 執行排程（實際時間可能延遲）。若 repository variable `ENABLE_PAGES=true` 且已設定 Pages Source 為 GitHub Actions，會直接部署 Pages；不依賴 bot commit 再觸發另一個工作流程。首次排程是否成功需以 Actions 執行紀錄為準。

## 每篇關鍵字與標籤雲

每篇選出 5–10 個關鍵字。選詞與逐字稿校對分開執行，以各篇導讀、重點與總結為依據，逐字比對內容；不使用校對詞彙清單充當主題。

`data/editorial.json` 的 `keywords` 保存結果，`review.keywordInputSha256` 記錄依據的文章版本。少數通用縮寫與同義寫法會歸一，例如「資訊戰／資訊作戰」、「AI／人工智慧」、「北市科／北士科」。文章修改後，建置會要求重新選詞，避免沿用不相關標籤。

首頁顯示常見關鍵字，主題頁提供完整標籤雲。字體大小與數字均依「含有該關鍵字的影片數」決定；同篇重複出現不增加次數。點擊即可篩選專訪。

## 正體中文與 AI 校對

原始 `data/interviews.json` 保留來源文字與時間碼；網站使用 `data/editorial.json` 的顯示版本。內部原稿狀態仍區別自動字幕、匯入字幕與人工覆核，不將 AI 處理冒充人工覆核。

- 111 支中文影片：完整文字交由本機模型檢視，修正可確認的人名／專有名詞，保留否定、數字、立場與口語。程式拒絕任意刪句、替換既有正確人名或改變數值的建議。
- 4 支英文影片：分段譯為正體中文，保留每段原始時間範圍。畫面標示「AI 翻譯與校對」。
- 中文字形以 [OpenCC Python](https://github.com/yichen0831/opencc-python) `t2s → s2tw` 統一混合輸入，避免直接處理既有正體字時把「里長」誤改為「裡長」，或把「為了解決」切錯詞。
- 來源字幕無法可靠還原的區段，以「辨識不清，請對照原始影片」說明，不猜出完整發言。例如柏林演講影片後段評論的原英文字幕存在嚴重辨識雜訊，已保留時間範圍並明示。

網站使用「AI 輔助校對」文案，關於計畫不再顯示逐字稿處理步驟。文章與發言語境仍以原始影片為準。

### 新增／更新內容

建置與一般測試不需要模型或 OpenCC；下列資料處理工具使用本機 `mlx-lm`、既有模型與 OpenCC。這次沿用現有模型，未呼叫付費 API。

```sh
UV_CACHE_DIR=.cache/uv uv pip install --target .cache/editorial-deps opencc-python-reimplemented==0.1.7

# 使用已安裝 mlx-lm 的 Python；caffeinate 僅用於 macOS
caffeinate -ims /path/to/mlx-lm/python scripts/refine_transcripts.py --model /path/to/model
caffeinate -ims /path/to/mlx-lm/python scripts/refine_transcripts.py --model /path/to/model --keywords-only

.venv/bin/python scripts/finalize_editorial.py
npm run build
```

工具依來源 hash 與文章 hash 續跑，原始模型回覆在 `.cache/editorial/` 與 `.cache/keywords/`。特定已確認的辨識不清範圍，可使用 `finalize_editorial.py --mark-unclear VIDEO_ID:起始秒數` 記錄；不因格式檢查通過就宣稱聲音內容正確。

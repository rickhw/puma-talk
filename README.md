
我想做一個網站，整理沈伯洋 (Puma) 在 Youtube 上所有的專訪，同時將專訪內容作逐字稿的整理。

這個網站以靜態形式呈現，使用者可以透過分類、標籤找到 Puma 的專訪，然後更加理解 Puma 的想法。

技術不受限，最後呈現的形式可以參考以下：

- https://whoispuma.com/
- https://shen-post-wall.pages.dev/
- https://puma.taipei/

未來如果有新增資料，透過排程、以及執行指定 YouTube URL 新增。

網站我預計放在 github，等雛形出來之後我再來準備。

---

## 雛形：PUMA TALKS

純靜態的沈伯洋 YouTube 專訪資料庫。使用原生 HTML / CSS / JavaScript；建置與預覽只需 Node.js 22 以上，沒有 npm 套件依賴。匯入工具使用 Python 3.10 以上；連線 YouTube 時需另裝 `yt-dlp`。

### 本機啟動

```sh
npm run dev
```

開啟終端顯示的 `http://localhost:4173`。修改 `index.html`、`assets/` 或 `data/` 後會重新建置，重新整理瀏覽器即可查看。若埠已占用，可用 `PORT=4174 npm run dev`。

也已產生 `dist/index.html`，建置時將公開資料嵌入頁面，減少離線讀取限制；一般瀏覽器可直接開啟。影片、縮圖仍需網路，剪貼簿等功能建議透過本機伺服器使用。

```sh
npm test        # 字幕解析、搜尋、資料一致性、匯入與 HTTP 驗證
npm run build  # 產生 dist/；可部署到任何靜態主機
npm run preview
```

### 已實作

- YouTube 單篇觀看／按讚數、首頁累計數字與每日統計更新。
- 每篇 5–10 個內容關鍵字、加權標籤雲與關鍵字篩選。
- AI 輔助校對的正體中文逐字稿；4 支英文影片另提供正體中文譯稿。
- 專訪卡片、主題探索、標籤、關鍵字全文搜尋、日期排序與逐字稿狀態篩選。
- 專訪詳情、原始 YouTube 來源與點擊後載入的播放器。
- 逐字稿閱讀器：SRT / VTT 匯入、段落搜尋與高亮、時間碼跳轉、片段分享、TXT 下載及 JSON 匯出。
- 瀏覽器本機收藏與字幕儲存，重新整理後保留。
- 指定 YouTube URL 匯入、離線中繼資料匯入、可設定來源的排程發現流程。
- GitHub Pages 建置部署及新增訪談 PR 的 GitHub Actions 範本。
- 響應式版面、鍵盤操作、跳至主內容與減少動態效果支援。

### 目前內容與初始範圍

2026-11-05 補入 11 月 4 日在台灣上線的兩支影片，目前共 **115 支影片版本**。包含《11點熱吵店》多人綜藝完整版及《寧夏璐66號茶坊》育兒訪談片段；詳細來源與日期見 [11/04 新增紀錄](docs/discovery-2026-11-04.md)。范琪斐《TODAY 看世界》另列於 [待補原片清單](data/pending-interviews.json)，尚未計入已收錄數。

新增兩支共 1,915 段本機轉錄，均完成 AI 正體中文顯示稿與文章摘要；目前全站共 530 項文章重點。

以下為最初 113 支的處理紀錄：

2026-11-04 從[公開專訪清單](https://vocus.cc/article/6ad8d562fd89780001e98adb)、[認識沈伯洋影片目錄](https://whoispuma.com/videos) 與 YouTube 搜尋交叉整理 509 個候選影片 ID，選出 113 支訪談版本，其中 87 支發布於 2026 年並優先處理。分段影片不等於獨立專訪場次，也不宣稱已涵蓋 YouTube 上所有專訪；重傳、剪輯、新聞評論、公開演說、記者會與待確認內容另列於 [候選目錄](data/catalog.json)。實際已匯入數與待辦以[處理進度](docs/processing-status.md)及 `data/interviews.json` 為準。

**本批 113 支已全數匯入並建置完成：29 支原頻道字幕、3 支 YouTube 自動字幕、81 支本機轉錄，共 190,114 段，全部待校對。** 已逐一比對原始輸入檔 hash，24 項測試、HTTP 資料比對與續跑檢查通過。轉錄期間已啟用防睡眠，完成後已解除；未變更永久能源設定，也未部署遠端。

**所有匯入稿均標示待校對，尚無人工校對完成版本。** 初始 10 場已完成：5 場使用原頻道字幕、1 場英文專訪使用英文自動字幕、4 場缺少合適原語言字幕，下載原音後以本機 MLX Whisper large-v3-turbo 轉錄。已排除中文訪談的英文配音字幕及自動翻譯字幕，明確標註靜音幻覺與辨識異常區段。後續批次沿用相同流程，從 YouTube 更新原始標題、頻道、發布日期與片長，保留來源 hash。標籤與短篇說明是本站的編輯索引，不是逐字發言。

初始產物保留在 `.cache/batch-20261104/`，擴充批次在 `.cache/catalog-transcripts-20261104/`，模型在 `.models/huggingface/`；這些目錄不提交或部署，需另行備份。詳見[初始 10 場處理紀錄](docs/transcript-batch-2026-11-04.md)及[擴充處理進度](docs/processing-status.md)。

自動測試涵蓋搜尋／狀態篩選、字幕解析、排除配音與翻譯字幕、資料一致性、離線 CLI 匯入與去重、保留已校對內容、轉錄工作稿、靜態建置及 HTTP request handler。實際 YouTube 字幕／音訊下載、Hugging Face 模型下載及 Metal GPU 語音推論已完成驗證。尚未逐篇聆聽校對；機械檢查不代表辨識正確率。

### 文章摘要、獨立 slug 與 GA 預留

每篇訪談增加導讀、3–5 項專訪重點與總結，並以 `/interviews/SLUG/` 提供獨立靜態頁。文章資料在 `data/articles.json`，摘要依完整逐字稿整理並標示待校對；重點可連回原片時間碼。slug 保存後不隨摘要或標題更新而改變，舊 `?v=VIDEO_ID` 連結會轉向新網址。

**本批 113 頁已完成 AI 文章摘要，共 523 項重點。** 42 項測試與 113 頁 HTTP 檢查通過，原始逐字稿保持不變。其中 1 頁的現有逐字稿主要涵蓋蔡英文柏林演講，已另標來源範圍，沈伯洋評論部分仍待對照原片；詳見[文章處理進度](docs/articles-status.md)。

`data/site.json` 已設定正式網址 `https://puma-talk.gtcafe.com/`、GTM 容器 `GTM-WXCZ2WR7` 與 GA4 `G-TRLVRQ877L`。網站透過已發布的 GTM 容器載入 Google Analytics；不重複載入獨立 GA 標籤。設定、更新與來源核對方式見[文章與 GA 工作流程](docs/articles.md)。

### YouTube 統計、關鍵字與 AI 校對

首頁入口顯示收錄影片的 YouTube 總觀看、總按讚、專訪影片數與對話總時數。每篇顯示單片數字及取得時間；每篇挑選 5–10 個有內容依據的關鍵字，並建立可點擊篩選的加權標籤雲。

原始逐字稿保留，網站另使用 AI 輔助校對的正體中文版本。109 支中文影片已完成文字檢視，4 支英文影片已產生正體中文譯稿；網站改用 AI 校對文案，並移除關於計畫中的步驟說明。AI 處理不會把內部原稿標為人工 `reviewed`。

本機每日 **03:10** 更新數字並重建網站，使用者 LaunchAgent 已安裝且實際試跑成功。YouTube 缺漏值不會當作零，失敗時保留上次成功值與時間。最新數字以 `data/statistics.json` 為準；GA4 已透過 GTM 設定，實際收集狀態需以 GA 即時報表核對。完整操作及 GitHub 排程範本見[統計與 AI 文字處理說明](docs/statistics-and-editorial.md)。

### 新增一場專訪

先安裝下載工具（網站本身不需要）：

```sh
python3 -m pip install -U 'yt-dlp[default]'
```

預設只取得影片中繼資料，不下載影片或字幕：

```sh
python3 scripts/import_youtube.py 'https://www.youtube.com/watch?v=VIDEO_ID' \
  --category '人物與成長' --tags '人物訪談,成長'
```

提供有權使用的字幕，或明確要求取得原頻道字幕：

```sh
python3 scripts/import_youtube.py 'https://www.youtube.com/watch?v=VIDEO_ID' --subtitle /path/to/captions.srt
python3 scripts/import_youtube.py 'https://www.youtube.com/watch?v=VIDEO_ID' --fetch-subtitles
```

離線匯入先前取得的 yt-dlp 中繼資料：

```sh
python3 scripts/import_youtube.py --info-json /path/to/video.info.json --subtitle /path/to/captions.vtt
```

資料寫入 `data/interviews.json`。以影片 ID 去重，重複匯入保留人工編輯標題、分類與標籤；不會自動覆蓋已校對逐字稿。只有加上 `--replace-transcript` 才允許替換已校對字幕。

若在網頁匯入字幕，僅會存於該瀏覽器。使用「匯出 JSON 資料」取得該篇記錄，依影片 ID 替換 `data/interviews.json` 中的對應記錄，再建置即可公開。公開完整逐字稿前，請確認權利與授權。

### 逐字稿整理與本機轉錄

完整說明、資源需求與操作指令見 [逐字稿工作流程](docs/transcripts.md)。採原頻道字幕優先，缺字幕才以本機音檔轉錄；先產生工作稿，再人工校對。保留原始輸出、模型／語言、來源 hash、校對者與時間，不以生成摘要取代原話。

```sh
python3 scripts/transcripts.py doctor  # 檢查工具，不下載模型
python3 scripts/transcripts.py report  # 待辦清單與整理進度
```

已提供 `transcribe`、`apply` 與 `review` 指令。`transcribe` 不修改網站資料，`apply` 只套用為待校對稿，不能覆蓋已校對版本；完成全篇人工校對後才使用 `review` 記錄校對狀態。轉錄套件與模型為選用依賴，網站建置與一般測試不需要安裝。

### 依年份批次整理與防睡眠

`data/catalog.json` 的 `decision: include` 是已選定的處理清單。指定年份優先；加上 `--all-years` 會在該年份之後接續較早影片。已匯入的稿件直接跳過，可在中斷後重跑；不會覆蓋已校對版本。

```sh
# caffeinate 僅在命令執行期間阻止閒置睡眠；不更改永久能源設定
caffeinate -ims .venv/bin/python -u scripts/batch_transcripts.py --year 2026 --all-years
.venv/bin/python scripts/catalog_report.py
PATH="$PWD/.venv/bin:$PATH" npm test
npm run build
```

每次最多兩支下載，GPU 推論與資料寫入逐支進行。原頻道字幕優先；自動字幕以 JSON3 原始文字事件匯入，避免 VTT 捲動行重複。缺少合適字幕時下載原語言完整音軌，以 ffprobe 檢查片長後轉錄。無效解碼窗口與靜音中的可疑辨識文字會留下明確註記，原始輸出保留供校對，不猜測缺漏內容。批次結果在 `.cache/catalog-transcripts-20261104/results.json`。

### GitHub 儲存庫與 Pages

專案儲存庫：[rickhw/puma-talk](https://github.com/rickhw/puma-talk)，預設分支為 `main`。包含網站原始碼、115 支影片的原始逐字稿與 AI 顯示稿、摘要、關鍵字、統計資料及操作文件；音訊、模型、虛擬環境、快取與 `dist/` 不提交。

推送 `main` 會執行測試、建置並保存網站 artifact。若要另行啟用 Pages：

1. Repository → Settings → Pages → Source 選擇 **GitHub Actions**。
2. Settings → Secrets and variables → Actions → Variables 新增 `ENABLE_PAGES`，值為 `true`。
3. 執行 `Build and deploy static site` workflow，即會測試、建置並發布 `dist/`。

全站使用相對資源路徑與獨立 slug 文章連結，支援 `https://user.github.io/repository/` 的子目錄部署，無需伺服器路由設定。Pages 預設未啟用；僅推送儲存庫不會自動公開網站。

逐步操作見 [GitHub Pages 設定指南](docs/github-pages.md)。

### 排程新增

`.github/workflows/update-interviews.yml` 提供每週一台灣時間 06:00 的掃描範本（GitHub 排程可能延遲），也可以從 Actions 手動執行並輸入 `youtube_url`。預設 `data/sources.json` 為停用，沒有指定來源時不會匯入。

要啟用，編輯 `data/sources.json`，將 `enabled` 設為 `true`，並填入要追蹤的 YouTube 頻道 `/videos` 或播放清單 URL。流程只收錄標題符合 `keywords` 的新影片；每個來源最多掃描 `limit` 筆，不保證涵蓋 YouTube 上的所有專訪。建立資料更新 PR，待核對分類與內容後再合併；排程預設不下載字幕。

Repository → Settings → Actions → General 需允許 GitHub Actions 建立 PR，並允許 workflow 的 `contents: write` 與 `pull-requests: write`。若組織政策禁止，改由本機匯入後自行推送。每日統計排程會在 GitHub 的 `main` 分支運行；新增專訪的來源掃描仍依 `data/sources.json` 設定啟用。Pages 部署需另外設定，首次執行結果可在 Actions 查看。

### 資料結構

```text
index.html                    網站入口
assets/app.js                 頁面與互動
assets/core.js                搜尋、字幕解析與資料驗證
assets/style.css              視覺與響應式版面
data/interviews.json           專訪、標籤與時間碼逐字稿
data/articles.json             文章導讀、重點、總結、固定 slug 與來源紀錄
data/site.json                 正式網址與 GA4 設定（預設停用）
data/editorial.json            AI 校對／翻譯的正體中文與內容關鍵字
data/statistics.json           YouTube 單片觀看、按讚與取得時間
data/statistics-history.json   每日累計快照
data/catalog.json              候選目錄、納入／重複／待確認理由與年份
data/sources.json              排程來源（預設停用）
scripts/import_youtube.py      指定 URL / 離線資料 / 排程匯入
scripts/transcripts.py         本機轉錄工作稿、來源紀錄、人工校對與待辦
scripts/batch_transcripts.py   依候選清單與年份批次擷取／本機轉錄，可續跑
scripts/catalog_report.py      依實際網站資料產生處理進度報告
scripts/summarize_articles.py  以完整逐字稿產生待校對文章摘要
scripts/articles_report.py     文章摘要覆蓋與來源核對進度
scripts/build.mjs              無依賴靜態建置
tests/                        自動驗證
.github/workflows/             Pages 部署與資料更新 PR 範本
```

逐字稿狀態：`pending` 待整理、`auto` 自動字幕待校對、`imported` 匯入字幕待校對、`reviewed` 維護者已校對。人工確認完畢後才可將狀態改為 `reviewed`，建置時會檢查狀態與字幕內容一致。

影片、縮圖與字幕權利屬原創作者。這是民間整理計畫，非官方網站。沒有登入、後端或遠端資料儲存，分析追蹤預設停用（GA4 可選設定）；影片縮圖由 YouTube 載入，播放器在使用者點擊後才載入。

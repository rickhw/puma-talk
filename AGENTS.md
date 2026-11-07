# PUMA TALKS：專案指引與 session 交接

本文件整理截至 **2026-11-07（Asia/Taipei）** 的對話決策與已完成工作，供另一台電腦／後續 agent 接手。內容是交接快照；數量、排程執行結果與正式版本應再以 repo 及遠端狀態核對。

## 接手先讀與工作方式

1. 先讀本文件、[README.md](README.md)、[資料與 PR 指南](data/README.md)。新增字幕／ASR 再讀 [docs/transcripts.md](docs/transcripts.md)。
2. 先檢查 `git status`、分支與遠端提交，保留使用者未提交的工作。資料與工具已有完整遷移，接手從現況繼續。
3. 使用者以正體中文溝通，偏好直接完成授權範圍內的工作，提供簡短進度與實際驗證結果。
4. 將本文件當作專案背景；具體收錄、排程、發布工作依當次任務與權限執行。只需預覽或改文件時，使用既有資料即可。
5. 說明變更時交代結果、驗證與實際限制；推送、CI 成功和正式站已更新是不同階段，分別確認。

## 專案定位與已確認需求

- 這是沈伯洋（Puma）的民間 YouTube 專訪資料庫，非本人、政黨或競選團隊官方網站。
- 正式網站：**https://puma-talk.gtcafe.com/**。
- GitHub：**https://github.com/rickhw/puma-talk**，主要分支 `main`。
- 持續發現各頻道新片，優先處理執行當年的訪談。搜尋結果須核對節目、頻道、原片與是否重複；有限的 YouTube 搜尋結果不代表完整清單。
- 「昨天」以執行當下 **Asia/Taipei** 換算，列明實際日期。區分上架日、直播開始時間、播出／錄影日；不要沿用本文件的日期作為下一次搜尋範圍。
- 收錄內容包括專訪、剪輯、完整版、活動及音樂作品，依影片 ID 計數，不能把影片總數稱為獨立專訪場次。
- 每篇提供正體中文顯示稿、導讀、3–5 項重點、總結、5–10 個關鍵字、大分類、固定 slug、封面及 YouTube 數字；音樂作品依下方特例處理。
- 內容用中立文字整理，保留條件、否定、不確定性與說話者範圍。主持人提問、活動玩笑、他人發言及政策構想分別表述，不能改寫成已實施成果或替人物背書。

## 現況與最近完成工作

截至本文件整理時：

| 項目 | 快照 |
| --- | --- |
| 收錄影片／文章／editorial 紀錄 | 各 121 筆 |
| 候選清單 | 517 個 ID：121 納入、16 重複、380 deferred |
| 原稿來源 | 88 ASR、29 原頻道字幕、3 自動字幕、1 音樂作品資訊 |
| 顯示稿 | 115 中文校對、5 英文翻譯、1 metadata-only |
| 全篇人工覆核紀錄 | 0；AI 與局部修正不等於全篇人工覆核 |
| 最近程式驗證 | 59 項測試通過；桌面／手機／靜態頁修正連結已檢查 |

最近提交供定位，並非要求回退或固定在這些版本：

- `819065c`：收錄 11/06 的四部影片，包含摘要、封面與統計。
- `947cc77`：將 121 篇資料拆成 slug 目錄，更新讀寫層、PR 檢查與網站修正入口。
- `8140684`：README 按搜尋、指定 URL 分析、統計／報表／排程與環境需求重新整理。
- 資料拆分版本已部署並驗證；該次正式站 build ID 為 `3d65826bf1aa`。新變更會產生新 ID，核對時讀取當次建置及正式站的 `build.json`。
- 上述收錄與遷移任務已完成；沒有需要照著本 session 的暫存腳本重跑的未完成轉錄批次。

## 資料結構：每篇一個固定目錄

**內容來源為 `data/<slug>/`，以 `data/index.json` 索引。**

```text
data/2026-11-04-stress-relief-family-and-daily-life/
├── metadata.json     # ID、標題、頻道、日期、category、來源及轉錄紀錄
├── transcript.json   # 原始字幕／ASR cues：start、end、text
├── editorial.json    # 網站顯示的正體中文稿、keywords、review
├── article.json      # lead、highlights、conclusion、slug、引證及 provenance
├── statistics.json   # views、likes、comments、fetchedAt、status
└── cover.json        # JPEG 路徑、尺寸、縮圖來源及指紋
```

- `data/index.json` 格式為 `per-interview-v1`：ID／slug 對照及各集合共用資訊，包括整體統計與首頁封面紀錄，不放文章或逐字稿全文。
- `data/catalog.json` 是候選判定；`pending-interviews.json` 是待確認原片；`sources.json` 是固定掃描來源；`statistics-history.json` 是每日統計快照。
- 封面圖片仍在 `assets/covers/`，由單篇 `cover.json` 指向。
- Python 共用層為 `scripts/data_store.py`，Node.js 為 `scripts/data-store.mjs`。資料工具經共用層讀寫，不另建立集中內容來源。
- `interviews.json`、`articles.json`、`editorial.json`、`covers.json`、`statistics.json` 在工具內是**邏輯集合名稱**；原來根目錄的五個集中檔案已移除。不要用 `json.loads(Path('data/interviews.json').read_text())` 讀取現況。
- Python 可使用 `read_document(Path('data/index.json'))` 或對應邏輯集合；`import_youtube.read_archive` 的預設 DB 也是 `data/index.json`。Node 使用 `readCollection`。
- `dist/data/interviews*.json` 是建置生成的共用瀏覽器資料，仍可集中，但不提交，也不是 PR 修正的來源。
- 新匯入先使用 `日期-video-ID雜湊` 目錄，首篇摘要建立後移到永久 slug。之後修正標題或文字，保持目錄／slug 與文章網址穩定。

### 單篇修正與來源一致性

- 讀者修正網站錯字，通常只改該篇 `editorial.json` 中對應 cue 的 `text`，保留時間碼，PR 附原片時間與理由，不需重跑模型。
- 單篇修正應只改該篇相關檔案；一般不需更新索引或其他篇。
- 原始 `transcript.json` 及其時間碼與 AI 顯示稿分開保存。原稿真的改動時，重新整理摘要、顯示稿、關鍵字及來源紀錄，讓 hash 對應實際輸入；不能只換 hash 繞過檢查。
- `article.provenance.transcriptSha256`、`editorial.sourceSha256`、`review.keywordInputSha256` 需有效；metadata-only 音樂摘要另檢查 `metadataSha256`。
- `evidence` 必須對應原始文字及時間範圍。原文不清楚時保留註記，精確文字匹配也不代表語意／立場已人工確認。
- `finalize_editorial.py` 已調整為保留顯示稿局部修正，再檢查時間碼與規則。保留此行為，避免將讀者修正覆蓋回 ASR 原文；也避免反覆正體化已完成的文字造成新錯字。
- `humanReviewed: true`／`reviewed` 只用於實際完成相應覆核的紀錄，局部修正不自動升級全篇狀態。

## 影片處理流程與限制

完整可複製指令在 [README 情境 1–3](README.md#情境與指令索引)。

1. 先檢查工具與 YouTube／Hugging Face 連線，取得公開影片中繼資料，確認原片及實際內容類型。
2. 原語言字幕優先；缺少或不可靠時下載原音並 ASR。`import_youtube.py --fetch-subtitles` 不會自動做 ASR；`batch_transcripts.py` 才有字幕失敗後的 ASR 路徑。
3. `summarize_articles.py` 產生摘要與固定 slug；`refine_transcripts.py` 產生正體中文校對／譯稿；同工具 `--keywords-only` 另選文章可支持的 5–10 個詞。
4. `finalize_editorial.py` 檢查關鍵字與顯示稿規則，再補數字、封面、進度報告，執行測試與建置。
5. 各階段依來源 hash 續跑。新機已有已提交的 121 篇內容，只有新任務或來源變動才需再做推論。

重要限制與已踩過的問題：

- YouTube 自動翻譯字幕、自動配音與 `-orig` 標籤不一定代表真實原音。比對格式及內容，避免把自動配音的字幕當原話。
- 候選 `spokenLanguage` 是 ASR 發言語言；`audioLanguage` 可獨立指定已確認的音軌標籤；`skipSubtitles: true` 可排除不合適字幕，強制由原音 ASR。
- 音軌標籤與發言語言不同、或同片中英切換時需分段處理；不能強制一種語言後將整段錯誤拿去翻譯。
- 批次工具消費已確認的 `catalog`，不是全站搜尋工具；固定來源 `--refresh` 也沒有日期範圍篩選。
- 大分類目前由 `--category`／`metadata.json.category` 指定，不是模型自動分類。五類：人物與成長、政治與公共事務、社會與生活、國際與安全、文化與閱讀。
- 關鍵字以文章為依據；標籤雲權重是包含該詞的影片數，同片重複只計一次，不是全文詞頻。
- 音樂作品使用 `contentType: music`、空逐字稿、`summarize_media.py`、`coverage: video-metadata` 與 `method: metadata-only`。依原頻道製作資訊整理，不產生完整歌詞或虛構對話；頁面顯示作品資訊。
- 活動音樂演出可用省略時間標記與 `omittedRanges` 保留原片位置，摘要跳過相關標記。多人活動不可全數歸屬同一受訪者。
- 長篇摘要／校對有約 65,000 prompt tokens 的輸入檢查；超出需重新規劃處理範圍，不默默截斷。

### 最近收錄的影片定位

以下皆已完成，不需當作新清單重複匯入：

| YouTube ID | 性質／slug |
| --- | --- |
| `Cx-p-VdFu60` | 《台灣最前線》直播回放；`2026-11-06-shen-boyang-municipal-planning-interview` |
| `U0N4WZl0_Gk` | 民視整理的路透英文受訪及中文對談剪輯；`2026-11-06-shen-boyang-mayoral-election-democracy-china` |
| `H-uziOFi3Ug` | 「沈麼啦！這慧贏！」多人活動直播；`2026-11-06-shen-bo-yang-taipei-mayor-campaign` |
| `fbXCUgPZMdY` | 史茵茵《台北順起來 R&B 版》音樂作品；`2026-11-06-taipei-shun-qi-lai-rnb-version` |
| `nyVWWcKaiIk` | 已收錄 11/05 市政對談；`2026-11-05-taipei-internationalization-urban-renewal-democracy` |
| `64ckQX3l4Ao` | 已收錄《女人我最大》；`2026-11-05-shen-boyang-su-qiaohui-tvbs-interview` |

`U0N4WZl0_Gk` 特例：原音軌標示 `zh-Hant`，約 0–164.6 秒為英文，後段為中文；已分段辨識、保留切換處註記及正體中文顯示稿。它不是已核實的路透完整原片。`H-uziOFi3Ug` 的音樂／收尾省略範圍已記於來源紀錄，保留這些範圍與來源說明。

## 網站行為：保留既有決策

- 首頁左上品牌連到 **`https://puma-talk.gtcafe.com/`** 對應的根路徑；不要改回 `index.html` 作為品牌首頁網址。
- 首頁順序：**「從一場對話，認識沈伯洋。」→「每一場對話，都持續被看見。」→ 專訪排行**，再接專訪列表。
- 專訪排行預設 **觀看排行榜**；列表「每場對話，都有新的發現」預設 **最新優先**。兩者獨立，URL 參數為 `ranking` 與 `sort`，切換其一保留另一個。
- Top 10 選項順序為觀看、觀看（不含官方）、時間序列、留言；不含官方只排除沈伯洋自己的 YouTube 頻道，先排除再取十筆。`ranking=views-nonofficial` 與列表排序獨立；已移除的 `comments-nonofficial` 舊連結回到一般留言榜。現有最新排序依發布日期，同日用 ID 穩定排序，不宣稱精確到秒。
- 列表搜尋 input 右邊的逐字稿狀態篩選已移除；關於計畫的逐字稿步驟說明也已移除。
- 網站以「我們使用 AI 技術校對」相關文字呈現，不顯示一般稿件「待校對」徽章。內部來源狀態、AI 與人工覆核仍分開保存；音樂作品顯示音樂類型。
- 每篇與首頁有 1200 × 630 JPEG 封面及 HTML 內的 OG／Twitter metadata。首頁保持輕量，逐字稿共用 JSON 不嵌入 `<head>`；避免 Facebook 擷取不到封面。Facebook 自身的快取更新需另以 Sharing Debugger 核對。
- 「複製摘要與連結」包含標題、導讀、重點標題與固定文章 URL；一般社群分享不帶播放時間／UTM。
- 字幕左側時間碼與右側「跳轉」使用 **同一個嵌入 YouTube 播放器**，以 IFrame API `seekTo` 跳轉；右側複製片段連結保留。完整原片外連另外提供。
- 網站已提供「建議修正逐字稿」／「檢視本篇資料／提出修正」連到該篇 GitHub 目錄，靜態頁也保留入口。
- 早期首頁 CTA 曾被擠成直排，已修正；調整按鈕／排版時兼顧桌面與手機。

## 統計、排程與發布

- 每片公開 `views`／`likes`／`comments` 來自 YouTube metadata；缺漏是 `null`，真正的 0 保留。失敗保留前次成功值與時間，不能將缺漏偽裝成 0。
- 排行、標籤與分類統計由收錄資料衍生；YouTube 累計數與 GA 的網站流量是不同口徑。
- `update_statistics.py` 更新資料；`daily_update.py` 在 Unix 加鎖，更新後建置，即使來源部分失敗仍嘗試建置並回傳狀態。它不自動提交或部署。
- GitHub `statistics.yml`：每日 **19:10 UTC／台灣 03:10**，更新數字、提交單篇統計與索引／快照、測試、建置並部署。
- GitHub `update-interviews.yml`：每週日 **22:00 UTC／台灣週一 06:00**，依固定來源提出資料 PR。`data/sources.json` 目前 `enabled: false` 且來源為空，設定前不會實際發現新片；此流程不跑 ASR／LLM。
- 使用者已要求停止舊 Mac 的每日統計排程；接手以 GitHub 每日工作為基準，在另有指示時才配置新機的電腦端排程，避免重複更新。
- GitHub `pages.yml`：PR 只測試／建置，合併／推送 `main` 或手動執行才部署；需 Pages Source = GitHub Actions、repository variable `ENABLE_PAGES=true`。
- `.github/workflows/statistics.yml` 已改成提交 `data/index.json`、`data/statistics-history.json`、`data/*/statistics.json`；匯入 workflow 也能偵測並提交新目錄。改資料佈局時同步維護排程的 git pathspec。
- README／docs 修改目前由 `paths-ignore` 排除；其他根目錄檔案（含本文件）仍可能觸發 Pages workflow。以當前 YAML 為準。
- `data/site.json` 目前為正式域名、GTM **`GTM-WXCZ2WR7`**、GA4 **`G-TRLVRQ877L`**。GTM 優先，避免再重複載入另一份 GA。這些 ID 是公開網站設定，不是秘密金鑰。
- 網域使用 Cloudflare DNS。DNS、GitHub HTTPS、GTM 容器發布與 GA 收件是外部狀態，調整／判斷時另外核對，不能僅憑 repo 設定宣稱已生效。詳見 [Pages 指南](docs/github-pages.md)及[分析追蹤說明](docs/articles.md)。

### 推送後的驗證慣例

1. Git 操作前核對遠端；每日機器人可能有新統計提交，整合時保留較新的單片數字與本次新增影片，避免覆蓋快照。
2. 有程式或資料變更，執行 `npm test`、`npm run build`；文檔修改依影響檢查連結與範例即可，不為文件啟動模型。
3. 核對當次 GitHub Actions 的 `build`／`deploy` 結果及提交 SHA。Pages 曾等候數分鐘，狀態成功前持續區分「已推送」與「已上線」。
4. 網站更新後比對正式站 `/build.json`、HTML `build-version` 及本次產物，檢查根頁／受影響文章、封面、桌面與手機；需要時檢查靜態 HTML 的 canonical／OG metadata。
5. 只在檢查實際成功後回報對應結果，不把舊版瀏覽器畫面當新版本驗證。

## 新電腦的準備與常用指令

完整需求與範例以 [README](README.md) 為準。程式架構是原生 HTML／CSS／JS＋Node 建置＋Python 資料 CLI，無 npm 套件安裝步驟。

```sh
git clone https://github.com/rickhw/puma-talk.git
cd puma-talk
npm test
npm run build
npm run dev
```

- 建議 Node.js 24、Python 3.12（與 CI 對齊）；核心 Python 最低 3.10，但目前 yt-dlp 需 3.11+。
- 僅修改網站／文件／既有資料，不需模型、GPU、FFmpeg 或 YouTube API key。
- 新影片資料工作：重建 `.venv`、安裝 `requirements.txt`，準備 FFmpeg／ffprobe、Deno 或明確設定的 Node runtime，執行 `transcripts.py doctor`。
- AI 工作目前以 Apple Silicon、原生 arm64 Python、Metal、macOS 14+ 為基準；確認安裝套件支援的系統版本。記憶體與磁碟規劃見 README，不把容量建議誤當實測最低值。
- 文字模型：`lmstudio-community/Qwen3.6-27B-MLX-4bit`，透過 `mlx-lm==0.31.3`；語音模型：`mlx-community/whisper-large-v3-turbo`，透過 `mlx-whisper==0.4.3`；另有 OpenCC 與 Pillow。
- 權重自行下載，以 `PUMA_TEXT_MODEL=./.models/Qwen3.6-27B-MLX-4bit` 指定；不需 LM Studio 應用程式或模型伺服器。文字工具離線讀取模型，先備妥權重；ASR 首次使用遠端名稱會下載。
- 其他平台可選 `faster-whisper` CPU ASR；repo 未提供完整 Qwen CPU／CUDA 安裝流程。
- 模型、虛擬環境、音訊、字型及快取不在 Git；另一台電腦重新建立環境，不沿用舊機的絕對路徑或可執行檔。

常用命令（資料／模型工作先啟用自己的虛擬環境）：

```sh
python scripts/transcripts.py doctor
python scripts/transcripts.py report
python scripts/catalog_report.py
python scripts/articles_report.py

# 更新數字與網站；不載入 LLM
python scripts/daily_update.py

# 針對已取得逐字稿的單支影片分析
python scripts/summarize_articles.py --model "$PUMA_TEXT_MODEL" --video-id VIDEO_ID
python scripts/refine_transcripts.py --model "$PUMA_TEXT_MODEL" --video-id VIDEO_ID
python scripts/refine_transcripts.py --model "$PUMA_TEXT_MODEL" --video-id VIDEO_ID --keywords-only
python scripts/finalize_editorial.py
```

- 單支 URL、缺字幕的原音下載與 ASR、搜尋日期範圍、三組 Top 10／關鍵字／分類 JSON 報表、封面字型準備，均已有 README 範例。
- 長時間的 Mac 工作可在命令前加 `caffeinate -ims`；多階段流程須涵蓋全部階段，程序結束後解除。其他平台用其相應電源管理設定。
- `.cache/` 的舊 session 腳本不是專案介面。新機用已提交的 `scripts/`；快取缺少可重建，YouTube 短效媒體 URL 過期需重新取得，模型／音檔變動須核對來源 hash。

## 隱私與文件維護

- 公開 repo 只保留可重現的程式、內容與公開設定。路徑使用 repo 相對位置或明確的可替換參數。
- `.venv/`、`.models/`、`.cache/`、`dist/`、`.env`、cookies、金鑰、音訊、裝置專用設定與私人日誌均忽略提交。不要把某台電腦的帳號、家目錄、私有網路或排程安裝資訊寫進文件。
- 更新行為、資料格式或 CLI 時，同步更新 README／資料指南；本文件中的快照則註明日期，避免後續將過期數量或版本當作限制。
- 先沿用既有測試、共用讀寫層與部署流程；保持單篇 PR 易於檢閱，原始稿、顯示稿及生成產物的責任清楚。

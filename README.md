# PUMA TALKS

沈伯洋（Puma）的 YouTube 專訪與逐字稿資料庫，提供正體中文逐字稿、內容摘要、關鍵字、大分類、獨立文章網址、社群封面，以及觀看／按讚／留言統計。

- 網站：https://puma-talk.gtcafe.com/
- 儲存庫：https://github.com/rickhw/puma-talk
- 現有 128 支影片版本：分段、完整版、綜藝節目、活動直播與音樂作品各按影片 ID 計數，不等於獨立專訪場次。
- 純靜態網站，沒有應用程式後端、資料庫服務或 npm 套件依賴。模型只在內容處理階段執行。

頂部「所有專訪」右側的「車掃與市政」整理已確認的官方車掃與市政開講原片，各篇以「車掃」標籤標示。此入口可搭配搜尋、分類與排序；一般專訪僅在談話中提到車掃時，不會因此進入這個活動清單。

## 情境與指令索引

| 使用情境 | 入口 | 主要產物 |
| --- | --- | --- |
| 關鍵字＋日期範圍搜尋 YouTube | [情境 1](#情境-1關鍵字與時間範圍搜尋-youtube)；`yt-dlp ytsearch…` | 候選影片清單，尚未匯入網站 |
| 指定 YouTube URL 分析 | [情境 2](#情境-2指定-youtube-url-分析並收錄)；匯入 → 字幕／ASR → 摘要 → 校對／翻譯 → 關鍵字 | 單篇影片資料、原稿、顯示稿、摘要與分類 |
| 更新統計、排行與標籤／分類統計 | [情境 3](#情境-3更新統計排行榜與分類統計)；`python scripts/daily_update.py` | 單片數字、每日快照與網站建置 |
| 批次處理已確認候選 | [批次與續跑](#批次收錄與續跑)；`batch_transcripts.py` | 原頻道字幕優先，缺少時 ASR |
| 從固定頻道找新片 | [固定來源](#固定頻道或播放清單找新片)；`import_youtube.py --refresh` | 新影片中繼資料 |
| 修正單篇逐字稿 | [PR 修正](#修正單篇內容並提出-pr)；編輯該篇 `editorial.json` | 局部修正，不需模型 |
| 預覽、建置、封面、部署 | [其他操作](#預覽與建置網站)、[部署](#網站設定與部署) | `dist/`、社群 JPEG、GitHub Pages |

## 執行條件：工具、硬體與網路

依要做的工作安裝，不需要為了預覽網站準備完整 AI 環境。

| 工作 | 工具／軟體 | 硬體與平台 | 網路／模型 |
| --- | --- | --- | --- |
| 預覽、建置既有網站 | Git、Node.js 22+；CI 使用 Node.js 24 | 一般 Windows／macOS／Linux 電腦，不需 GPU | 既有資料可離線建置；播放 YouTube、外部圖片與分析標籤需網路 |
| 完整測試、純資料 CLI | Python 3.10+；CI 使用 Python 3.12 | 一般 CPU；測試只需標準函式庫 | 不需模型或 API key |
| 搜尋、匯入、字幕、YouTube 統計 | Python 3.11+、`requirements.txt` 的 `yt-dlp[default]`、受支援的 JavaScript runtime；建議 Deno 2.3+ 放在 PATH | 一般 CPU，不需 MLX | 需 YouTube 連線；不使用 YouTube Data API key |
| 音訊下載與 ASR | FFmpeg **執行檔**（含 ffprobe）、`mlx-whisper==0.4.3`；CPU 替代方案為 `faster-whisper` | MLX：Apple Silicon Mac 與 Metal；CPU 替代方案可在其他平台執行 | 首次取得 ASR 權重需 Hugging Face 連線；另需音訊與快取空間 |
| 摘要、校對、翻譯、關鍵字 | `requirements-editorial.txt`、相容 MLX 文字權重 | 專案 MLX 路徑以 Apple Silicon、原生 arm64 Python、macOS 14+ 為基準；大模型記憶體優化需 macOS 15+ | 權重先下載，文字工具以離線模式讀取；不需 LLM API key |
| 重新產生封面 | `requirements-covers.txt` 的 Pillow、支援正體中文的 CJK 字型 | 一般 CPU，不需圖片生成模型 | 首次取得字型及原影片縮圖需網路；既有封面隨 repo 提供 |
| GitHub 排程／部署 | GitHub Actions 權限；手動以 CLI 觸發時另需 `gh` 並登入 | GitHub runner；不依賴個人電腦保持開機 | 平台提供 token；不提交個人憑證 |

資料工具統一使用 **Python 3.12** 最容易與 CI 對齊。Python 3.10 仍可執行本專案的核心測試，但[目前上游 yt-dlp](https://github.com/yt-dlp/yt-dlp#dependencies) 支援 Python 3.11+。完整 YouTube 支援另需 EJS 與 JavaScript runtime；`yt-dlp[default]` 提供相應套件，Deno 為預設啟用的 runtime。僅安裝 Node.js 不等於 yt-dlp 已啟用 Node runtime，設定方式見 [yt-dlp EJS 官方說明](https://github.com/yt-dlp/yt-dlp/wiki/EJS)。

### 模型、記憶體與磁碟規劃

| 模型／元件 | 執行方式與用途 | 需求說明 |
| --- | --- | --- |
| [Qwen3.6-27B-MLX-4bit](https://huggingface.co/lmstudio-community/Qwen3.6-27B-MLX-4bit) | `mlx-lm==0.31.3`；摘要、中文保守校對、英文翻譯及關鍵字 | 模型頁標示權重約 16.1 GB。規劃建議為 32 GB+ 統一記憶體；長篇全文分析優先考慮 64 GB+，仍需依上下文實測 |
| [mlx-community/whisper-large-v3-turbo](https://huggingface.co/mlx-community/whisper-large-v3-turbo) | `mlx-whisper==0.4.3`；沒有合適原音字幕時，由音訊轉錄帶時間碼的原語言稿 | 模型頁標示約 1.61 GB；需另外容納音訊及推論工作記憶體 |
| OpenCC | `opencc-python-reimplemented==0.1.7`，`t2s → s2tw` | 字形統一工具，不是 LLM |
| faster-whisper（選用） | `transcripts.py --engine faster-whisper`，CPU int8 | 可替代 ASR；本 repo 沒有提供 Qwen 的 CPU／CUDA 摘要流程 |

MLX 平台需求參考[官方安裝文件](https://ml-explore.github.io/mlx/build/html/install.html)。上述記憶體數字是容量規劃建議，並非已驗證的最低門檻；權重檔案大小也不等於執行時記憶體。模型、KV cache、全文長度與同時執行的工作都會影響用量，參考 [MLX-LM 大模型與長提示說明](https://github.com/ml-explore/mlx-lm#large-models)。目前摘要／校對工具設有約 65,000 prompt tokens 的輸入檢查，超出會中止，不會默默截斷全文。

建議先預留約 30 GB 給模型與套件，再依影片量增加音訊快取空間；長批次可先規劃 50–100 GB 可用空間，這不是固定上限。音檔大小取決於片長、格式及取樣率，WAV 通常比壓縮音檔大。模型、音訊、字型與快取均不隨 repo 提供。

不需要安裝 LM Studio 或啟動模型伺服器；這裡直接以 `mlx-lm` 讀取 MLX 權重。模型名稱中的 `lmstudio-community` 是權重發布來源。

## 環境準備

### 預覽與建置網站

```sh
git clone https://github.com/rickhw/puma-talk.git
cd puma-talk
npm test
npm run dev
```

不需 `npm install`。`npm test` 需要 Python；預設開發網址為 `http://localhost:4173`，修改後會重建，重新整理即可。可用 `PORT` 調整埠號。

```sh
npm run build     # 建置 dist/
npm run preview   # 預覽已建置的 dist/
```

`dist/` 是建置產物，不提交 Git。JS、CSS 與瀏覽器資料使用內容指紋檔名；`dist/build.json` 可核對版本。請透過 HTTP 預覽，直接以檔案開啟 HTML 可能無法讀取資料。

### 安裝資料工具

以下以 POSIX shell（macOS／Linux）為例，從 repo 根目錄執行。Windows PowerShell 使用 `.venv\Scripts\Activate.ps1` 啟用環境，並依 PowerShell 語法設定環境變數與路徑。

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/transcripts.py doctor
```

音訊處理需將 `ffmpeg`、`ffprobe` 加入 PATH；YouTube 完整格式支援建議同時準備 Deno。例如已有 Homebrew 的 macOS 可執行 `brew install ffmpeg deno`。FFmpeg 不是同名 Python 套件。

只有 AI 分析與產生封面時，才安裝以下選用套件：

```sh
# Apple Silicon 的 AI 文字工具與語音辨識
python -m pip install -r requirements-editorial.txt
python -m pip install mlx-whisper==0.4.3

# 選用：封面生成與模型下載 CLI
python -m pip install -r requirements-covers.txt
python -m pip install huggingface_hub
```

下載文字權重並設定後續指令共用的模型目錄：

```sh
mkdir -p .models .cache
hf download lmstudio-community/Qwen3.6-27B-MLX-4bit \
  --local-dir ./.models/Qwen3.6-27B-MLX-4bit
export PUMA_TEXT_MODEL=./.models/Qwen3.6-27B-MLX-4bit
export HF_HOME="$PWD/.models/huggingface"
```

ASR 使用 `mlx-community/whisper-large-v3-turbo` 時會在首次執行下載權重。文字工具則設定 `HF_HUB_OFFLINE=1`，因此先下載再執行。模型下載 CLI 參考 [Hugging Face 官方說明](https://huggingface.co/docs/huggingface_hub/guides/cli)。公開模型一般不需登入；存取權仍依模型來源而定。

`doctor` 只檢查工具存在，不會載入模型或測試 Metal 推論，也不代表記憶體一定足夠。以下資料指令使用已啟用的虛擬環境，讓 `python` 與 `yt-dlp` 來自同一環境。

## 情境 1：關鍵字與時間範圍搜尋 YouTube

例如搜尋 2026-11-01 至 2026-11-06（含首尾）的「沈伯洋 專訪」，從前 50 個搜尋結果中篩選並輸出 JSON Lines：

```sh
mkdir -p .cache
PUMA_QUERY='沈伯洋 專訪'
PUMA_FROM=20261101
PUMA_TO=20261106

yt-dlp --ignore-config --skip-download --no-flat-playlist \
  --dateafter "$PUMA_FROM" --datebefore "$PUMA_TO" \
  --print '%(.{id,title,channel,upload_date,webpage_url})j' \
  "ytsearch50:$PUMA_QUERY" > .cache/youtube-search.jsonl

python -m json.tool --json-lines .cache/youtube-search.jsonl
```

單日可將兩個日期設成同一天，也可使用 `--date yesterday` 取代兩個日期參數。日期依 YouTube 中繼資料的 `upload_date`，不等於訪談實際錄影／播出日；精確的台灣時間邊界需再核對原片時間戳。搜尋與日期參數見 [yt-dlp 官方文件](https://github.com/yt-dlp/yt-dlp#video-selection)。

清單包含影片 ID、標題、頻道、上架日期及 URL。這一步只找候選，不下載媒體、不匯入網站，也不判定影片是否真的是專訪。`ytsearch50` 是有限搜尋結果，不保證找齊該期間所有影片；可提高數量、換關鍵字，或對已確認的頻道／播放清單使用相同日期篩選。不要加 `--flat-playlist` 來做精確日期篩選，因為扁平清單可能缺少日期欄位。

## 情境 2：指定 YouTube URL 分析並收錄

目前沒有單一 `analyze URL` 命令；以下是現有工具可執行的完整流程。**大分類由編輯指定，並非模型自動分類**；關鍵字則在摘要完成後由模型選取及程式核對。

### 2.1 匯入影片與可用字幕

```sh
export PUMA_VIDEO_URL='https://www.youtube.com/watch?v=VIDEO_ID'
export PUMA_VIDEO_ID=VIDEO_ID

python scripts/import_youtube.py "$PUMA_VIDEO_URL" \
  --fetch-subtitles --category '政治與公共事務'
python scripts/transcripts.py report
```

請將兩處 `VIDEO_ID` 換成同一支真實影片 ID。五個可用大分類為：**人物與成長、政治與公共事務、社會與生活、國際與安全、文化與閱讀**。新影片使用 `--category` 指定分類；重新匯入時若省略此旗標會保留原分類，明確傳入則會更新。已有影片也可直接編輯該篇 `metadata.json` 的 `category`。

`--fetch-subtitles` 先嘗試原語言字幕，排除自動翻譯軌；沒有合適字幕時仍會匯入影片中繼資料，**這支匯入指令本身不會自動轉錄音訊**。以報告及該篇 `transcript.json` 確認是否有稿件。原稿保留原語言，網站的正體中文顯示稿另存。

### 2.2 沒有合適字幕時：下載原音並 ASR

有字幕可直接跳至 2.3。以下以中文原音及 MLX 為例，先列出格式，確認原音音軌，再填入其格式代碼；不要選到 YouTube 自動配音。

```sh
yt-dlp --list-formats "$PUMA_VIDEO_URL"
export PUMA_AUDIO_FORMAT='原音音軌的格式代碼'
export PUMA_SPOKEN_LANGUAGE=zh
mkdir -p .cache/analysis

yt-dlp --no-playlist -f "$PUMA_AUDIO_FORMAT" \
  --extract-audio --audio-format wav \
  -o '.cache/analysis/%(id)s.%(ext)s' "$PUMA_VIDEO_URL"

PUMA_ASR_RUN=".cache/analysis/$PUMA_VIDEO_ID/$(date -u +%Y%m%dT%H%M%SZ)"
python scripts/transcripts.py transcribe "$PUMA_VIDEO_ID" \
  --audio ".cache/analysis/$PUMA_VIDEO_ID.wav" \
  --engine mlx --language "$PUMA_SPOKEN_LANGUAGE" \
  --model mlx-community/whisper-large-v3-turbo --output-dir "$PUMA_ASR_RUN"
python scripts/transcripts.py apply --draft "$PUMA_ASR_RUN/draft.json"
```

`--output-dir` 必須尚不存在。英文原音改用 `--language en`；ASR 只轉錄、不翻譯。混合語言、錯誤的音軌標示、歌曲及辨識雜訊需逐片處理，不能只改語言旗標就假設全文可靠。CPU 替代方式與產物檢查見[逐字稿流程](docs/transcripts.md)。

### 2.3 產生摘要、正體中文顯示稿與關鍵字

先完成模型準備，再針對同一個 ID 執行：

```sh
python scripts/summarize_articles.py \
  --model "$PUMA_TEXT_MODEL" --video-id "$PUMA_VIDEO_ID"
python scripts/refine_transcripts.py \
  --model "$PUMA_TEXT_MODEL" --video-id "$PUMA_VIDEO_ID"
python scripts/refine_transcripts.py \
  --model "$PUMA_TEXT_MODEL" --video-id "$PUMA_VIDEO_ID" --keywords-only
python scripts/finalize_editorial.py
```

摘要包含導讀、3–5 項重點、總結、固定 slug 與原文引證；中文稿採保守校對，英文稿產生正體中文譯稿；每篇選取 5–10 個可對應摘要文字的關鍵字。文字處理不等於已完成人工逐句覆核。

分析結果位於 `data/<slug>/`：

| 檔案 | 內容 |
| --- | --- |
| `metadata.json` | 影片 ID、標題、日期、頻道、來源、大分類、原稿處理紀錄 |
| `transcript.json` | 原始字幕／ASR 稿與時間碼 |
| `editorial.json` | 網站顯示的正體中文稿、關鍵字及處理紀錄 |
| `article.json` | 導讀、重點、總結、slug 及引證 |
| `statistics.json`、`cover.json` | 後續取得的單片統計與封面紀錄 |

新影片在首篇摘要產生前先使用 `日期-video-ID雜湊` 目錄，摘要建立後自動移到固定 slug 目錄；後續改文字保留網址。既有稿件依來源 hash 續跑，不會每次重算全站。`finalize_editorial.py` 是全站一致性檢查，若其他篇也有尚未完成的衍生資料，需一併處理才能通過。

### 2.4 更新數字、封面與驗證

```sh
python scripts/update_statistics.py
# 新封面需先準備字型，方式見 docs/covers.md
python scripts/generate_covers.py --font ./.cache/cover-fonts/NotoSansCJKtc-Bold.otf
python scripts/catalog_report.py
python scripts/articles_report.py
npm test
npm run build
```

統計更新會處理全站已收錄影片；目前沒有按 URL 單獨更新的旗標，`--limit N` 只處理索引前 N 支。未產生本站封面時暫用原影片縮圖。建置不會自動提交、推送或部署。

## 情境 3：更新統計、排行榜與分類統計

### 單次更新

```sh
# 所有平台：先抓取數字，再建置網站
python scripts/update_statistics.py
npm run build

# Unix 選用：同一程序加鎖，更新後建置；避免排程重疊
python scripts/daily_update.py
```

兩種方式擇一即可，不需連續重複更新。前者支援一般 Python 平台；後者使用 `fcntl`，適合 macOS／Linux。這些指令不載入 LLM，也不重新分析字幕。部分影片更新失敗時保留上次成功數值與取得時間，程序會回傳非零；`daily_update.py` 仍會嘗試建置。

| 統計內容 | 資料來源與計算方式 |
| --- | --- |
| 每支影片觀看、讚、留言數 | YouTube 公開中繼資料，保存於單篇 `statistics.json`；缺漏為 `null`，不是 0 |
| 累計數字及更新覆蓋率 | `data/index.json` 的 `statistics`；每日快照在 `data/statistics-history.json` |
| Top 10 觀看排行榜 | 已收錄影片按觀看數排序；未提供數字的項目排最後 |
| Top 10 留言排行榜 | 按留言數排序；數字代表留言則數，不下載留言全文 |
| Top 10 最新上架 | 按現有發布日期排序，並用影片 ID 穩定處理同日順序；不是精確到秒的上架排序 |
| 關鍵字統計 | 每個標籤出現於幾支影片；同片重複標籤只計一次，不是逐字稿字詞頻率 |
| 大分類統計 | 各 `category` 所含影片數；目前每支影片一個大分類 |

排行榜、標籤雲與大分類計數由建置／頁面載入時的收錄資料計算，統計更新不會重新選取關鍵字或更動分類。網站數字只代表已收錄影片的 YouTube 累計值，與 GA 網站流量不同。

### 匯出統計報表 JSON（選用，不連線 YouTube）

先建置，以下指令從網站實際使用的資料匯出單片數字、三組 Top 10、全部關鍵字與五類計數，存入忽略提交的快取：

```sh
npm run build
mkdir -p .cache
node --input-type=module > .cache/statistics-report.json <<'JS'
import {readFile} from 'node:fs/promises';
import {categories, filterInterviews, interviewPath} from './assets/core.js';
import {keywordCounts, collectionStats} from './assets/insights.js';
const data = JSON.parse(await readFile('dist/data/interviews.json', 'utf8'));
const site = JSON.parse(await readFile('data/site.json', 'utf8'));
const items = data.interviews;
const video = item => ({
  id: item.id, title: item.title, date: item.date, category: item.category,
  url: new URL(interviewPath(item), site.siteUrl).href,
  ...item.youtubeStats
});
const top = sort => filterInterviews(items, {sort}).slice(0, 10).map(video);
const knownComments = items.map(x => x.youtubeStats.comments).filter(Number.isSafeInteger);
console.log(JSON.stringify({
  statisticsUpdatedAt: data.statisticsUpdatedAt,
  totals: {...collectionStats(items, data.statisticsUpdatedAt),
    comments: knownComments.reduce((sum, n) => sum + n, 0),
    commentsAvailable: knownComments.length},
  videos: items.map(video),
  rankings: {views: top('views'), comments: top('comments'), newest: top('newest')},
  keywords: keywordCounts(items),
  categories: categories.map(category => ({
    category, videos: items.filter(x => x.category === category).length
  }))
}, null, 2));
JS
```

### 從原始逐字稿分析常見詞彙

使用已有的原始中文字幕做詞串計數，不載入模型或連線。需安裝資料工具環境中的 OpenCC：

```sh
.venv/bin/python scripts/analyze_vocabulary.py
```

產生 `docs/analysis/vocabulary-YYYY-MM-DD.md` 與同名 JSON，日期採台灣時間。報告包含口語／議題詞表的次數、影片涵蓋數、每萬中文字頻率、來源 hash 與原片時間連結；`--output` 可指定輸出檔名基底，`--db` 可指定資料索引。

統計不使用摘要、顯示稿或英文翻譯。既有編輯關鍵字只作另一份候選詞表，次數仍由原稿計算。**原稿沒有說話者標記，因此結果是整段對談詞頻，不能直接稱為 Puma 個人的口頭禪。** 詞表、字形合併、字幕斷行接合、排除記錄與重複片段限制均寫在報告中。首份分析見 [2026-11-07 詞彙報告](docs/analysis/vocabulary-2026-11-07.md)。

首頁上方導覽的「主題探索」頁提供「對談裡的常用語」tag cloud。字體大小與數字依原稿詞串出現次數計算；點選後以 `phrase` URL 參數篩選原稿含該詞的影片，可與搜尋、分類、主題標籤、收藏及排序一起使用。常用語不是每篇的主題標籤，沒有加入單篇 `editorial.json`。

詞表、排除清單與字形對照位於 `data/common-phrases.json`；`npm run build` 使用 Node.js 從原始逐字稿計算，沒有新增模型或 Python 套件需求。新增詞彙時，請補足所需字形對照，並與 Python 分析結果交叉核對。原有主題 tag cloud 仍以含該標籤的影片數作為權重。

### 排程更新

既有 GitHub Actions 每天 **19:10 UTC／台灣 03:10** 執行 `statistics.yml`，更新數字、提交快照、測試、建置並部署。不需讓個人電腦保持開機；GitHub 排程可能延遲，結果以 Actions 紀錄為準。

已安裝並登入 GitHub CLI 時，可手動觸發及查看執行紀錄：

```sh
gh workflow run statistics.yml --repo rickhw/puma-talk
gh run list --workflow statistics.yml --repo rickhw/puma-talk --limit 5
```

自行使用 cron、systemd timer 或其他排程器時，執行 `python scripts/daily_update.py`。工作目錄須為 repo 根目錄，PATH 須包含虛擬環境的 `yt-dlp`、Node.js 與所選 YouTube runtime；`PUMA_NODE_BIN` 可指定 Node.js 執行檔。此指令只寫入資料與 `dist/`，不會替排程器提交 Git 或發布；若需報表 JSON，排程中另接上方匯出步驟。選用的 macOS 排程工具見[統計操作說明](docs/statistics-and-editorial.md)。

## 其他常用情境

### 批次收錄與續跑

核對 `data/catalog.json` 中 `decision: include` 的影片後執行：

```sh
python scripts/batch_transcripts.py --year 2026 --all-years \
  --work-dir ./.cache/catalog-transcripts
python scripts/summarize_articles.py --model "$PUMA_TEXT_MODEL"
python scripts/refine_transcripts.py --model "$PUMA_TEXT_MODEL"
python scripts/refine_transcripts.py --model "$PUMA_TEXT_MODEL" --keywords-only
python scripts/finalize_editorial.py
```

`--year 2026` 優先處理該年，`--all-years` 再接續其他年份；已匯入逐字稿的影片跳過。批次工具會自動走「原語言字幕 → 缺少時下載原音並 MLX ASR」，但不會自己搜尋或判定新候選，也不會自動建立全套摘要。候選列需有 `id`、`uploadDate`、`title`、`referenceUrl`、`metadataFile`（例如 `.cache/catalog/VIDEO_ID.info.json`）；快取不存在／過期時會重新取得。音軌及語言例外見[逐字稿流程](docs/transcripts.md)。

長時間處理可在 macOS 的單條工作命令前加 `caffeinate -ims`，例如 `caffeinate -ims python scripts/batch_transcripts.py --year 2026 --all-years`；保護隨程序結束解除。若還要接續摘要，摘要命令也需各自加上保護，或將整串流程放入同一個受保護的 shell 腳本。

### 固定頻道或播放清單找新片

在 `data/sources.json` 設定 `enabled: true`、確認過的 `urls`、標題 `keywords` 與 `limit` 後執行：

```sh
python scripts/import_youtube.py --refresh
```

這與關鍵字全站搜尋不同：只掃設定來源、以標題比對關鍵字，沒有日期範圍參數；每來源最多檢查 50 支。預設只匯入中繼資料，後續分析依情境 2 處理。來源目前預設停用。`update-interviews.yml` 每週日 22:00 UTC／台灣週一 06:00 可依來源提出資料 PR；建立 PR 需啟用 workflow 的相應權限。

### 已有字幕檔或中繼資料

```sh
python scripts/import_youtube.py "$PUMA_VIDEO_URL" --subtitle ./captions.srt
python scripts/import_youtube.py --info-json ./video.info.json --subtitle ./captions.srt
```

第二種方式可離線匯入。原頻道字幕、自動字幕及 ASR 稿均保留來源紀錄；輸入 JSON 可能含短效媒體 URL，僅放快取，不直接提交。

### 音樂影片與活動

音樂作品使用 `contentType: "music"`，保留原頻道 `originalTitle`、`originalDescription` 與空的逐字稿，再執行：

```sh
python scripts/summarize_media.py --model "$PUMA_TEXT_MODEL" --video-id "$PUMA_VIDEO_ID"
python scripts/refine_transcripts.py --model "$PUMA_TEXT_MODEL" --video-id "$PUMA_VIDEO_ID" --keywords-only
python scripts/finalize_editorial.py
```

音樂頁整理作品與製作資訊，不產生歌詞逐字稿；批次 ASR 跳過音樂影片。活動直播需區分主持、來賓、對談與演出，來源範圍及省略時段另行記錄。

### 修正單篇內容並提出 PR

從網站「建議修正逐字稿」找到 `data/<slug>/editorial.json`，只修改對應句子的 `text`，保留時間碼並附原片時間；不需重跑 LLM。局部修正不等於全篇人工覆核。

```sh
npm test
npm run build
```

原始 `transcript.json` 或摘要改動會影響衍生資料 hash，處理方式見[資料與 PR 指南](data/README.md)及 [CONTRIBUTING](CONTRIBUTING.md)。PR 會執行測試與建置，合併後才部署。例：[單篇資料目錄](data/2026-11-04-stress-relief-family-and-daily-life/)。

### 檢查處理進度、重新生成封面

```sh
python scripts/transcripts.py report
python scripts/catalog_report.py
python scripts/articles_report.py
python scripts/generate_covers.py --font ./.cache/cover-fonts/NotoSansCJKtc-Bold.otf
```

封面需自行準備 CJK 字型，安裝及下載範例見[封面說明](docs/covers.md)。既有封面是 1200 × 630 JPEG；標題改動後需重新產生。首頁與文章提供 Open Graph／Twitter metadata、複製摘要與連結；字幕時間碼與「跳轉」控制同一個嵌入播放器。

## 網站設定與部署

`data/site.json` 是正式網址及 GTM／GA4 設定來源。現行值屬本站；複製作其他網站時請改成自己的設定。`siteUrl` 需以 `/` 結尾，部署於子目錄時包含子目錄；停用分析將兩個 ID 都設為空字串。GTM 存在時優先透過容器載入，不重複載入 GA 標籤。

```json
{
  "siteUrl": "https://your-site.example/",
  "analytics": {"measurementId": "", "gtmContainerId": ""}
}
```

| Workflow | 觸發與用途 |
| --- | --- |
| `pages.yml` | PR：測試、建置；推送 `main`／手動執行：建置，啟用 Pages 時部署 |
| `statistics.yml` | 每日台灣 03:10／手動：統計、提交快照、建置與部署 |
| `update-interviews.yml` | 台灣週一 06:00／手動：依固定來源找片並提出 PR，不執行 ASR／LLM |

GitHub Pages 使用 **Settings → Pages → GitHub Actions**，設定 repository variable `ENABLE_PAGES=true`，再手動執行 `pages.yml`。自訂網域、DNS 與 HTTPS 詳見 [Pages 部署指南](docs/github-pages.md)。GitHub Actions 使用平台 token，勿將個人 token 提交至 repo。

## 資料結構、模型紀錄與文件

| 路徑 | 內容 |
| --- | --- |
| `data/index.json` | ID／slug 對照、集合共用資訊、整體統計及首頁封面紀錄 |
| `data/<slug>/metadata.json`、`transcript.json` | 影片資訊、大分類、來源紀錄與原始逐字稿 |
| `data/<slug>/article.json` | 導讀、重點、總結、固定 slug、引證及文字模型紀錄 |
| `data/<slug>/editorial.json` | 正體中文顯示稿、關鍵字與 AI 處理紀錄 |
| `data/<slug>/statistics.json`、`data/statistics-history.json` | 單片統計與每日快照 |
| `data/<slug>/cover.json`、`assets/covers/` | 逐片封面紀錄與圖片 |
| `data/catalog.json`、`data/pending-interviews.json`、`data/sources.json` | 候選判定、待確認原片與固定掃描來源 |
| [處理進度](docs/processing-status.md)、[摘要進度](docs/articles-status.md) | 已提交資料的覆蓋率、來源範圍與待辦 |

截至 2026-11-08，95 支原稿來自上述 Whisper、32 支來自 YouTube 字幕，另 1 支為音樂作品資訊。原有 121 篇摘要使用上述 Qwen3.6，11/07 三支與本次四支車掃直播使用 `lmstudio-community/Qwen3.8-27B-MLX-8bit`（同為 `mlx-lm==0.31.3`）；顯示稿包含 122 篇中文校對、5 篇英文翻譯及 1 篇作品資訊。11/07 三支新片的來源與省略範圍見[處理紀錄](docs/transcript-batch-2026-11-07.md)，本次四支另見[車掃收錄紀錄](docs/car-sweep-2026-11-08.md)，後續數量以進度報告為準。

模型來源可追查 `metadata.json` 的 `transcriptProvenance`、`article.json` 的 `provenance` 及 `editorial.json` 的 `review`。關鍵字工具目前記錄 `keywordsModel: "Model"` 類別名；實際權重由 `--model` 指定；上述七筆新收錄資料另記錄 `keywordsModelId` 與權重 revision，避免混淆 Qwen3.6 與 Qwen3.8。摘要與校對／翻譯另存，保留原稿；AI 處理不冒充人工覆核。更多細節見[逐字稿流程](docs/transcripts.md)、[文章與網址](docs/articles.md)、[統計與文字處理](docs/statistics-and-editorial.md)。

`dist/` 的集中瀏覽器 JSON 是產物，提出內容修正請改單篇來源檔。瀏覽器收藏與自行匯入的字幕只保存於該瀏覽器，不會更新 repo。

`.venv/`、`.cache/`、`.models/`、`dist/`、環境變數檔、音訊、模型權重、cookies、憑證與裝置專用設定不提交。

這是民間整理計畫，非沈伯洋、政黨或競選團隊官方網站。影片、縮圖與字幕權利屬原作者；AI 摘要與標籤為編輯整理，發言及語境以原片為準。

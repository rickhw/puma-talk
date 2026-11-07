# PUMA TALKS

沈伯洋（Puma）的 YouTube 專訪與逐字稿資料庫，提供正體中文逐字稿、AI 摘要、獨立文章網址、關鍵字標籤雲，以及 YouTube 觀看／按讚／留言統計。首頁上方提供觀看排行榜、發布時間序列與留言排行榜；每段字幕可直接跳至嵌入播放器的對應時間點。每篇提供封面與「複製摘要與連結」，方便轉貼社群。

- 網站：https://puma-talk.gtcafe.com/
- 儲存庫：https://github.com/rickhw/puma-talk
- 純靜態網站，使用原生 HTML、CSS、JavaScript，沒有應用程式後端或 npm 套件依賴。
- 現有資料包含 121 支影片版本及其摘要；分段、完整版、綜藝節目、活動直播與音樂作品均按影片 ID 計數，不等於獨立專訪場次，也不代表已涵蓋全部專訪。

## 執行需求

| 工作 | 必要工具 | 模型／網路需求 |
| --- | --- | --- |
| 建置、開發預覽 | Node.js 22 以上；CI 使用 Node.js 24 | 既有資料可離線建置，不需模型 |
| 完整測試、資料 CLI | Python 3.10 以上；CI 使用 Python 3.12 | 一般測試只用標準函式庫 |
| YouTube 中繼資料、字幕、每日統計 | `requirements.txt` 中的 yt-dlp；依 yt-dlp 要求設定 JavaScript runtime | 需連線 YouTube，不需 YouTube API key |
| 音訊處理及語音辨識 | FFmpeg（包含 ffprobe）、所選 ASR 引擎 | 首次下載語音模型需網路；音訊及模型需額外磁碟空間 |
| 重新產生社群封面（選用） | Python、`requirements-covers.txt`、CJK 字型 | 需連線取得原影片縮圖；既有封面隨儲存庫提供 |
| AI 摘要、文字校對、翻譯、關鍵字 | Apple Silicon macOS 14 以上、相容 Metal 環境、`requirements-editorial.txt` | 需自行取得相容 MLX 文字模型；記憶體需求取決於模型與上下文 |

網站建置不需要 GPU、FFmpeg、yt-dlp、語音模型或文字模型。影片、縮圖與分析標籤仍需網路才能載入。

## 快速開始

先安裝上表的 Node.js 與 Python，再執行：

```sh
git clone https://github.com/rickhw/puma-talk.git
cd puma-talk
npm test
npm run dev
```

不需要執行 `npm install`。預覽網址由終端顯示，預設為 `http://localhost:4173`；修改程式或資料後會重建，重新整理頁面即可。埠號可透過 `PORT` 環境變數調整。

```sh
npm run build    # 產生 dist/，可部署到靜態主機
npm run preview  # 預覽已建置的 dist/
npm test         # Node.js 與 Python 測試
```

`dist/` 是建置產物，不提交 Git。JS、CSS 及共用資料使用內容指紋檔名，避免新頁面載入舊版快取；`dist/build.json` 可核對發布版本。直接以檔案開啟 HTML 時，瀏覽器可能限制逐字稿資料讀取，請使用預覽伺服器。

## 安裝資料處理工具（選用）

只有新增內容、下載字幕或更新統計時才需要 Python 第三方套件：

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
```

Windows PowerShell 的啟用指令為 `.venv\Scripts\Activate.ps1`。後續指令中的 `python`、`yt-dlp` 均應來自同一個虛擬環境；音訊處理另需將 `ffmpeg`、`ffprobe` 加入 PATH。

```sh
python scripts/transcripts.py doctor
python scripts/transcripts.py report
```

`doctor` 檢查工具是否可用，不會下載模型或啟動推論。Python 環境、下載工具、模型權重及媒體快取均不隨儲存庫提供。

## 本機模型與用途（Local LLM / ASR）

模型用於資料整理階段，產物保存為 JSON，再建置成靜態網站。瀏覽網站、執行測試與 GitHub Pages 部署均不需要載入模型；這些資料工具也不需要 LLM API key。

| 實際使用的模型 | 類型與執行引擎 | 用途 |
| --- | --- | --- |
| [Qwen3.6-27B-MLX-4bit](https://huggingface.co/lmstudio-community/Qwen3.6-27B-MLX-4bit) | 27B、4-bit MLX 權重；本專案透過 `mlx-lm==0.31.3` 執行文字推論 | 文章摘要、保守文字校對、英文逐字稿的正體中文翻譯，以及文章關鍵字選取 |
| [mlx-community/whisper-large-v3-turbo](https://huggingface.co/mlx-community/whisper-large-v3-turbo) | 語音辨識模型（ASR）；透過 `mlx-whisper==0.4.3` 執行 | 沒有合適原音字幕時，將下載的音訊轉成帶時間碼的原語言逐字稿；正體化、翻譯與摘要接續由文字流程處理 |

目前 121 支影片中，88 支原始逐字稿來自上述 Whisper 模型，32 支來自 YouTube 字幕，另 1 支音樂影片依原頻道製作資訊收錄。121 篇文章摘要的文字模型紀錄均為上述 Qwen；文字顯示稿包含 115 篇中文校對與 5 篇英文翻譯，另有 1 篇作品資訊，沒有製造歌詞逐字稿。這些數字依已提交資料統計，最新覆蓋率見[處理進度](docs/processing-status.md)與[摘要進度](docs/articles-status.md)。

| 處理階段 | 程式 | 輸入與產物 |
| --- | --- | --- |
| 音訊轉錄 · Whisper | `scripts/batch_transcripts.py`、`scripts/transcripts.py transcribe` | 音訊 → 原始逐字稿與時間碼；套用後存入 `data/interviews.json`，保留輸入 hash、模型及引擎版本 |
| 文章摘要 · Qwen | `scripts/summarize_articles.py` | 完整逐字稿的有效區段 → 導讀、3–5 項重點、總結、固定 slug 與原文引證，存入 `data/articles.json` |
| 音樂作品資訊 · Qwen | `scripts/summarize_media.py` | 音樂影片標題與原頻道製作資訊 → 作品摘要與原文引證；不產生歌詞，來源以 metadata hash 驗證 |
| 校對／翻譯 · Qwen | `scripts/refine_transcripts.py` | 原始逐字稿 → 保守用字修正或正體中文譯稿，存入 `data/editorial.json`；原稿與來源時間範圍另行保留 |
| 關鍵字 · Qwen | `scripts/refine_transcripts.py --keywords-only`，內部呼叫 `scripts/extract_keywords.py` | 已完成的文章摘要 → 5–10 個可對應文章文字的關鍵字，存入 `data/editorial.json`，供卡片與 tag cloud 使用 |

文字模型以 Apple Silicon、Metal 與已取得的 MLX 權重執行。文字工具會設定 `HF_HUB_OFFLINE=1`；請先從模型來源取得權重，再以 `--model` 指定模型目錄。批次 ASR 預設使用上述 Whisper 模型，首次使用遠端模型名稱時會下載權重。模型、音訊與快取需自行準備磁碟空間；推論記憶體需求取決於模型及逐字稿長度。

正體字形統一使用 `opencc-python-reimplemented==0.1.7`（`t2s → s2tw`），`scripts/finalize_editorial.py` 負責關鍵字來源及顯示稿規則檢查；兩者不執行 LLM 推論。封面使用 Pillow 將原影片縮圖與文字排版，詳見[封面說明](docs/covers.md)。

模型紀錄可從 `data/interviews.json` 的 `transcriptProvenance`、`data/articles.json` 的 `provenance` 與 `data/editorial.json` 的 `review` 追查。關鍵字工具目前將模型類別記為 `keywordsModel: "Model"`；實際權重由執行時的 `--model` 指定，現有資料使用同一個 Qwen 模型。

## 新增或更新專訪

只匯入影片中繼資料：

```sh
python scripts/import_youtube.py 'https://www.youtube.com/watch?v=VIDEO_ID' \
  --category '人物與成長' --tags '人物訪談,成長'
```

加上 `--fetch-subtitles` 會嘗試取得原語言字幕；也可提供字幕檔：

```sh
python scripts/import_youtube.py 'https://www.youtube.com/watch?v=VIDEO_ID' --fetch-subtitles
python scripts/import_youtube.py --info-json ./video.info.json --subtitle ./captions.srt
```

資料寫入 `data/interviews.json`，以影片 ID 去重。重複匯入保留編輯過的標題、分類及標籤，並保護已人工校對的稿件。原頻道字幕、自動字幕及語音辨識稿均保留來源與輸入 hash。

缺少合適字幕時，可使用 MLX Whisper（Apple Silicon macOS）或 faster-whisper（CPU）產生語音辨識工作稿。安裝、轉錄、套用與人工覆核步驟見 [逐字稿工作流程](docs/transcripts.md)。批次下載及 ASR 工具目前使用 MLX 引擎。

AI 內容工具另行安裝：

```sh
python -m pip install -r requirements-editorial.txt
# 先取得上表的 Qwen MLX 權重；以下為專案相對的模型目錄範例
PUMA_TEXT_MODEL=./.models/Qwen3.6-27B-MLX-4bit
python scripts/summarize_articles.py --model "$PUMA_TEXT_MODEL"
python scripts/refine_transcripts.py --model "$PUMA_TEXT_MODEL"
python scripts/refine_transcripts.py --model "$PUMA_TEXT_MODEL" --keywords-only
python scripts/finalize_editorial.py
```

音樂影片需先保留 `contentType: "music"`、`originalTitle` 與 `originalDescription`，以 `python scripts/summarize_media.py --model "$PUMA_TEXT_MODEL" --video-id VIDEO_ID` 產生作品資訊，再執行關鍵字選取與驗證。這類頁面顯示作品資訊，不顯示逐字稿工具。

文字工具以離線模式讀取已取得的權重，不會附帶下載模型。摘要、校對與關鍵字分開產生；原稿改變後必須更新衍生資料，否則建置會拒絕過期 hash。詳見 [文章與分析追蹤](docs/articles.md)及 [統計與 AI 文字處理](docs/statistics-and-editorial.md)。

## 統計與自動化

在已啟用資料工具虛擬環境的終端執行：

```sh
npm run statistics  # 更新 YouTube 數字與每日快照
npm run build       # 將更新後的資料建置成網站
```

數字缺漏保留 `null`；更新失敗保留上次成功值與時間。YouTube 累計觀看／按讚／留言數與 GA 的網站流量是不同統計。

| GitHub Actions | 觸發與用途 |
| --- | --- |
| `pages.yml` | 推送 `main` 或手動執行：測試、建置；啟用 Pages 時部署 |
| `statistics.yml` | 每日 19:10 UTC（台灣時間 03:10）或手動執行：更新數字、提交快照、建置及部署 |
| `update-interviews.yml` | 每週日 22:00 UTC（台灣週一 06:00）或手動執行：依來源清單發現影片並提出資料 PR |

GitHub 排程可能延遲；結果以 Actions 紀錄為準。`data/sources.json` 預設停用，需設定 `enabled`、頻道／播放清單 `urls`、`keywords` 與 `limit` 才會掃描；該流程不自動進行 ASR。建立 PR 需允許 workflow 的 PR 權限。

自行安排其他排程時，可直接呼叫更新與建置指令。另提供 Unix 的 `scripts/daily_update.py` 鎖定包裝及選用 macOS 排程工具，見 [統計操作說明](docs/statistics-and-editorial.md)。

## 網站設定與部署

`data/site.json` 是正式網址及分析追蹤的設定來源。現行值指向本站網域與 GA／GTM；複製專案另作網站時，應改為自己的設定。停用追蹤時，將 `measurementId` 與 `gtmContainerId` 都設為空字串。

```json
{
  "siteUrl": "https://your-site.example/",
  "analytics": {
    "measurementId": "",
    "gtmContainerId": ""
  }
}
```

`siteUrl` 必須以 `/` 結尾，若部署於子目錄需包含子目錄。此值用於首頁與文章的 canonical URL；文章 slug 儲存在資料中，不隨標題更新而改變。GTM 存在時優先透過容器載入 GA，不額外載入第二份 GA 標籤。

GitHub Pages 使用儲存庫的 **Settings → Pages → GitHub Actions**，再新增 repository variable `ENABLE_PAGES=true`，手動執行 `pages.yml`。自訂網域、DNS 與 HTTPS 說明見 [Pages 部署指南](docs/github-pages.md)。GitHub Actions 使用平台提供的 token，無須把個人 token 提交到程式碼。

## 封面與社群轉貼

首頁與專訪頁提供 Open Graph／Twitter 封面資訊；既有封面是 1200 × 630 JPEG，建置不需額外圖形工具。重新產生方式見 [封面說明](docs/covers.md)。轉貼按鈕複製標題、摘要、重點標題及該篇固定網址；字幕右側的「跳轉」與左側時間碼共用嵌入播放器。

## 資料與文件索引

| 路徑 | 內容 |
| --- | --- |
| `data/interviews.json` | 影片資料、原始逐字稿、時間碼及來源紀錄 |
| `data/articles.json` | 導讀、重點、總結、固定 slug 與原文引證 |
| `data/editorial.json` | AI 校對／翻譯的正體中文顯示稿及關鍵字 |
| `data/statistics*.json` | 單片 YouTube 統計與每日快照 |
| `data/catalog.json`、`data/pending-interviews.json` | 候選判定與尚待確認原片的訪談 |
| `data/covers.json`、`assets/covers/` | 封面來源、尺寸、內容指紋及 JPEG 圖片 |
| `assets/`、`scripts/`、`tests/` | 前端、建置／資料工具及測試 |
| [處理進度](docs/processing-status.md)、[摘要進度](docs/articles-status.md) | 由已提交資料產生的覆蓋率、來源範圍與待辦 |

瀏覽器收藏與自行匯入的字幕只保存在該瀏覽器，不會更新儲存庫。網站以 AI 輔助校對標示文字處理；人工 `reviewed` 狀態須有實際覆核紀錄。辨識不清與來源只涵蓋部分節目的內容會另行註明。

`.venv/`、`.cache/`、`.models/`、`dist/`、環境變數檔及憑證不提交。請勿提交音訊、模型權重、YouTube cookies 或裝置專用設定。

這是民間整理計畫，非沈伯洋、政黨或競選團隊官方網站。影片、縮圖與字幕權利屬原作者，公開再利用需確認授權；AI 摘要與標籤是編輯整理，發言與語境以原片為準。

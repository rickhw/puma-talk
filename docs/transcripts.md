# 逐字稿整理流程與資源

採用「原頻道字幕優先 → 缺字幕時本機轉錄 → 人工聆聽校對 → 靜態發布」。網站不需要常駐的轉錄伺服器。取得字幕與語音辨識是不同步驟；前者受 YouTube 存取狀況影響，後者需要音檔與運算資源。

## 處理一場專訪

1. 收錄影片 ID、原始標題、頻道、發布日期及完整來源，先排除重複上傳與剪輯片段。
2. 優先取得原頻道可用的原音語言字幕，保留原始檔。自動翻譯字幕不能直接當成原語言逐字稿。
3. 沒有合適字幕時，使用可取得且有權處理的本機音檔做 ASR（語音辨識），產生帶時間碼的待校對工作稿。
4. 人工從頭搭配原音校對，特別確認漏字、否定詞、人名、組織、數字、台語與中英混用。聽不清楚就標註，不猜測。先確認音檔與影片一致，時間碼沒有因剪輯、片頭或廣告而錯位。
5. 逐字稿保留發言內容與必要語助詞；分段、摘要、主題標籤另做，不用潤飾後的文章取代原話。不因模型沒有回報錯誤就自動標為「已校對」。
6. 記錄字幕來源、語言、模型版本、校對者與時間，經資料變更檢閱後建置網站。

目前不自動替聲音標上「主持人」「沈伯洋」姓名。說話者分離需要另外的模型，而且分離出的聲音編號仍須人工確認身分。英文訪談先保留英文逐字稿，未來若附中文翻譯，應獨立標記為翻譯。

## 先檢查環境與待辦

```sh
python3 scripts/transcripts.py doctor
python3 scripts/transcripts.py report
```

`doctor` 只檢查，不會安裝套件、下載模型或呼叫付費 API。本機為 Apple Silicon macOS，已有 `ffmpeg` 與 `yt-dlp`；專案 `.venv` 已安裝 `mlx-whisper`。請用 `.venv/bin/python` 執行轉錄。`doctor` 僅檢查套件是否存在，不保證目前執行環境可存取 Metal GPU；沙箱若回報 `No Metal device available`，需在可存取 GPU 的本機執行環境執行。

## 有現成字幕

```sh
python3 scripts/import_youtube.py 'https://www.youtube.com/watch?v=VIDEO_ID' --fetch-subtitles
```

下載成功時，原始 VTT 會保留在 `.cache/captions/VIDEO_ID/時間戳/`，網站資料記錄來源、語言與檔案 SHA-256。作者提供的字幕也先標為待校對，不等同本站已人工確認。

有自動配音的影片，`en-orig` 也可能屬於英文配音，不能只依 `-orig` 判定原音語言。匯入工具會比對影片語言，並排除 URL 帶有 `tlang` 的自動翻譯字幕；找不到合適來源就保留待整理，改下載原語言音訊轉錄。影片中繼資料也可能標錯語言，仍須核對節目內容；本批英文專訪依英文節目內容保留英文字幕。

也可使用原作者提供的檔案，無需額外 ASR 算力：

```sh
python3 scripts/import_youtube.py --info-json /path/to/video.info.json --subtitle /path/to/captions.srt
```

YouTube 官方 `captions.download` 需要影片編輯權限，因此 API key 不是取得所有第三方字幕的解法。`yt-dlp` 是另一種擷取方式，但仍可能遇到下載失敗、限流或需要登入的情況；不保證所有公開影片都有可取得字幕。不要將 YouTube cookies 或個人登入資料提交到 repository。

## 沒有字幕：本機轉錄

Apple Silicon 優先試 MLX。使用獨立 Python 3.12 虛擬環境，避免改動系統 Python：

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python mlx-whisper
.venv/bin/python scripts/transcripts.py doctor
```

若使用其他平台，可安裝 `faster-whisper`；目前提供 CPU int8 路徑，不需要先購買 NVIDIA GPU：

```sh
uv pip install --python .venv/bin/python faster-whisper
```

先備妥對應的完整音檔，且開頭與 YouTube 影片的時間軸一致。轉錄不會自動下載 YouTube 音訊，也不會把音檔上傳到第三方轉錄服務。

```sh
.venv/bin/python scripts/transcripts.py transcribe VIDEO_ID \
  --audio /path/to/interview.mp3 --engine mlx --language zh
```

預設使用 `mlx-community/whisper-small-mlx` 做第一輪功能與效能測試。可在同一段音訊上比較較大的模型，再決定整批使用的模型：

```sh
.venv/bin/python scripts/transcripts.py transcribe VIDEO_ID \
  --audio /path/to/interview.mp3 --engine mlx --language zh \
  --model mlx-community/whisper-large-v3-turbo
```

CPU 替代路徑：

```sh
.venv/bin/python scripts/transcripts.py transcribe VIDEO_ID \
  --audio /path/to/interview.mp3 --engine faster-whisper --model small --language zh
```

模型名稱首次使用時會由函式庫下載權重；可改指定本機模型路徑。模型與套件相容性需在實際環境驗證，不能用本專案的單元測試代替真實推論。模型快取通常由 Hugging Face 管理；如需放在專案內，可在執行前設定 `HF_HOME="$PWD/.models/huggingface"`，`.models/` 已排除版本控制。

產物預設在 `.cache/transcripts/VIDEO_ID/時間戳/`：

| 檔案 | 用途 |
| --- | --- |
| `engine-output.json` | 引擎原始輸出，保留可供追溯的辨識資料 |
| `draft.json` | 時間碼工作稿、模型／版本／語言、音檔 SHA-256 |
| `subtitles.srt` | 人工編輯用字幕 |
| `review.md` | 可點回原始影片的校對索引 |
| `quality.json` | 長段落、時間重疊、重複文字、超出已知片長等檢查提示 |

這一步不改動網站資料。機械檢查不能判斷人名辨識是否正確、是否漏掉整段聲音，或完整逐字稿品質。

要讓網站先顯示待校對稿：

```sh
python3 scripts/transcripts.py apply --draft .cache/transcripts/VIDEO_ID/時間戳/draft.json
```

網站狀態為 `auto`，並顯示來源、模型與語言。`apply` 不覆蓋已校對版本。

## 完成人工校對

編輯工作目錄裡的 `subtitles.srt`，完整聆聽確認後才執行：

```sh
python3 scripts/transcripts.py review VIDEO_ID \
  --subtitle /path/to/edited.srt --reviewer '校對者暱稱' \
  --note '已全篇對照原音；聽不清處以方括號標註'
npm test
npm run build
```

此指令記錄人工聲明，**不會代替人工聆聽或自動判斷正確性**。它保留原字幕來源與模型資料，新增校對者、時間、檔案 hash 與註記。前一版記錄保存在 `.cache/transcript-history/`，公開的資料檔則依 Git 版本追溯。`.cache/` 不會提交或部署，需要另外備份，不能當成永久保存庫。

## 需要哪些資源

| 資源 | 現階段安排 |
| --- | --- |
| 網站主機 | 維持純靜態；轉錄工作在網站建置外完成，不需要新增常駐後端 |
| YouTube 存取 | 需要可用網路與可取得的字幕／音檔；API key 不能取代字幕下載權限 |
| 轉錄軟體 | 選裝 `mlx-whisper` 或 `faster-whisper`，不需要同時安裝 |
| 運算 | 已在現有 Mac 以 Metal GPU 完成 4 場 MLX Whisper large-v3-turbo 轉錄；實測紀錄見本批報告，不承諾其他影片或設備的固定速度 |
| 磁碟 | 建議先預留 5–10 GB 作為模型、套件與小批音檔的工作空間；這是規劃額度，不是已測得的最低需求 |
| 人工 | 需要校對工時；不能把每小時影片固定對應成某個工時，先以樣本記錄實際耗時 |
| 付費 API | 目前不需要 API key 或 API 計費；若本機處理速度或品質不符需求，再比較雲端方案 |
| 排程 | GitHub Actions 先負責發現新影片與提出資料 PR；ASR 在本機完成。若要全自動，再評估專用 runner、額度與持續運作成本 |

儲存量可用音訊規格估算：16 kHz、單聲道、16-bit PCM 約 `16000 × 1 × 2 × 3600 = 115.2 MB/小時`，不含檔頭；壓縮音訊依實際 bitrate 而變。音檔與模型不提交 GitHub，網站只發布文字資料和來源連結。

取得與公開再利用是兩件事；完整逐字稿公開前，需要確認原節目與字幕的使用授權。這項確認應納入資料維護流程，不能把可下載視為可任意重製。

## 第一批的驗收方式

先選 3–5 場：清楚的一對一、多人交談、台語／中英混用；若有英文專訪，另以 `--language en` 測試。記錄字幕能否取得、轉錄耗時、模型、人工修正與時間碼誤差。沒有經過這輪測試前，不估算全量影片的固定成本，也不啟動大量模型下載或付費服務。

2026-11-04 已處理全部初始 10 場，包含 5 場原頻道字幕、1 場英文自動字幕與 4 場真實本機語音推論，均已匯入網站並標示待校對。模型為 `mlx-community/whisper-large-v3-turbo`，`mlx-whisper` 為 `0.4.3`。來源 hash、時間碼、段數、機械檢查與實測耗時見[本批處理紀錄](transcript-batch-2026-11-04.md)。這輪尚未完成全篇人工校對；不能據此估算人工工時或宣稱辨識品質。

## 擴充清單、續跑與防睡眠

擴充清單有 113 支經原頻道中繼資料核對的訪談版本，其中 87 支發布於 2026 年。完整候選目錄與不納入本批的理由在 `data/catalog.json`；分段影片不等於獨立專訪場次。已匯入進度見[處理進度報告](processing-status.md)。

```sh
caffeinate -ims .venv/bin/python -u scripts/batch_transcripts.py --year 2026 --all-years
.venv/bin/python scripts/catalog_report.py
npm run build
```

不加 `--all-years` 只處理指定年份；已匯入內容會跳過。`caffeinate` 的防睡眠 assertion 隨該命令結束而解除，不改永久能源設定。2026-11-04 執行時另啟動 6 小時的防睡眠保護，已用 `pmset -g assertions` 確認生效。

擴充產物在 `.cache/catalog-transcripts-20261104/VIDEO_ID/`，包含下載紀錄、原始字幕或完整音訊、引擎輸出、靜音檢查、異常窗口索引與 `review/` 校對檔案。來源 URL 過期或快取不在時會重新擷取中繼資料，無需把含暫時媒體 URL 的 info JSON 提交版本控制。語言明確的英文專訪會保留英文，中文原音不使用英文配音字幕或自動翻譯。

一般 `transcribe` 若因時間碼驗證失敗，現在也會先保留 `engine-output.json` 與 `failure.json`，避免長時間推論結果遺失。請另建輸出目錄再重試；原始異常輸出不是可直接套用的工作稿。

參考文件：[MLX Whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper)、[faster-whisper](https://github.com/SYSTRAN/faster-whisper)、[YouTube 字幕下載 API](https://developers.google.com/youtube/data/reference/rest/v3/captions/download)、[MLX small 模型](https://huggingface.co/mlx-community/whisper-small-mlx)、[MLX large-v3-turbo 模型](https://huggingface.co/mlx-community/whisper-large-v3-turbo)。

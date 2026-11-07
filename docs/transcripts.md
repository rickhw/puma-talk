# 字幕與語音辨識工作流程

處理順序為「原語言字幕 → 缺字幕時語音辨識 → AI 顯示稿／人工覆核 → 靜態建置」。原稿保留來源及時間碼；文章摘要與翻譯另存，不取代發言原文。

## 安裝需求

- Python 3.10 以上，建議使用獨立虛擬環境；一般 CLI 與測試僅依賴標準函式庫。
- 連線 YouTube：`python -m pip install -r requirements.txt`。yt-dlp 可能需要其支援的 JavaScript runtime 才能取得部分影片格式。
- 下載音訊、檢查音軌或執行 ASR：安裝 FFmpeg，確保 `ffmpeg` 與 `ffprobe` 在 PATH。
- MLX 語音引擎：Apple Silicon macOS 與可用 Metal 環境，安裝 `mlx-whisper==0.4.3`。
- CPU 引擎：安裝 `faster-whisper`；工具採 CPU int8 模式。

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
# 依平台／需求選擇一個引擎
python -m pip install mlx-whisper==0.4.3
# 或：python -m pip install faster-whisper
python scripts/transcripts.py doctor
python scripts/transcripts.py report
```

Windows PowerShell 改用 `.venv\Scripts\Activate.ps1` 啟用環境，並選擇 CPU 引擎。`doctor` 只檢查工具是否存在，不代表 GPU 或模型可用。第一次使用遠端模型名稱會下載權重；離線環境應先取得模型並提供相容的模型目錄。

## 取得字幕

```sh
python scripts/import_youtube.py 'https://www.youtube.com/watch?v=VIDEO_ID' --fetch-subtitles
# 使用已取得的中繼資料及字幕檔
python scripts/import_youtube.py --info-json ./video.info.json --subtitle ./captions.srt
```

工具排除帶 `tlang` 的自動翻譯字幕，並比對原音語言；自動配音的 `en-orig` 不一定是影片真正原音。YouTube 語言標示也可能不正確，需檢查節目內容。公開影片不保證有可取得字幕，限流或登入要求仍可能造成下載失敗。

原始字幕保存在專案相對的 `.cache/captions/`，來源紀錄包含種類、語言、輸入 SHA-256 與匯入時間。作者字幕及自動字幕不等同本站已完成人工校對。

## 語音辨識單支影片

先匯入影片中繼資料，並準備與原片時間軸一致的完整音檔。此單支轉錄指令不負責下載音訊：

```sh
# Apple Silicon macOS
python scripts/transcripts.py transcribe VIDEO_ID \
  --audio ./audio.m4a --engine mlx --language zh \
  --model mlx-community/whisper-large-v3-turbo

# CPU
python scripts/transcripts.py transcribe VIDEO_ID \
  --audio ./audio.m4a --engine faster-whisper --language zh --model small
```

請依原音選擇 `zh`、`en` 等語言；轉錄指令不翻譯。模型大小影響速度、記憶體及辨識結果，不能由單一設備的耗時推算所有影片。音訊、語音模型與文字模型都不包含在儲存庫中。

輸出預設為 `.cache/transcripts/VIDEO_ID/時間戳/`，包含 `draft.json`、`subtitles.srt`、`review.md`、`quality.json` 及原始引擎輸出。可用 `--output-dir` 指定新的輸出目錄；不覆蓋既有產物。時間碼檢查失敗時保留原始引擎輸出與失敗資訊，不能直接把異常結果當成可發布字幕。

## 套用與人工覆核

```sh
python scripts/transcripts.py apply --draft ./.cache/transcripts/VIDEO_ID/RUN/draft.json
# 全篇人工聆聽及修改字幕後，才記錄覆核者
python scripts/transcripts.py review VIDEO_ID \
  --subtitle ./corrected.srt --reviewer '公開顯示的名稱'
```

`apply` 將來源及工作稿加入網站資料，保護已人工覆核版本。`review` 需實際完成聆聽與修改；名稱及備註會成為公開來源紀錄，勿填敏感個資。優先核對人名、否定、數字、台語、中英混用、漏句與時間碼。無法確認的內容應標明，不猜測說話者，也不以摘要潤飾原話。

AI 正體中文校對／翻譯另存顯示層，安裝及執行方式見[統計與 AI 文字處理](statistics-and-editorial.md)。原稿更動後，需依序更新文章摘要、顯示稿與關鍵字，再執行 `npm test` 與 `npm run build`；衍生資料 hash 不符時建置會中止。

## 候選清單批次處理

`data/catalog.json` 中 `decision: include` 為選定清單。批次工具優先處理指定年份；加入 `--all-years` 後接續其他年份，已匯入逐字稿的影片直接跳過。

```sh
python scripts/batch_transcripts.py --year 2026 --all-years
# 指定產物目錄可保留各次工作並續跑
python scripts/batch_transcripts.py --year 2026 --all-years --work-dir ./.cache/transcript-batch
python scripts/catalog_report.py
```

批次工具目前的缺字幕 ASR 路徑使用 MLX，需符合 Apple Silicon macOS 條件。最多兩支並行準備媒體，推論及資料寫入逐支進行。缺少或過期的中繼資料會重新取得，不需複製他人的快取；下載後以 ffprobe 核對片長與音訊串流。

候選資料可用 `spokenLanguage` 指定 ASR 的實際發言語言；若 YouTube 音軌標示與發言語言不一致，可另外設定 `audioLanguage` 選擇已確認的原音音軌。確認字幕來自自動配音、不能用於原音時，可設 `skipSubtitles: true` 強制由原音 ASR。這些是逐片檢查後的明確設定，不能只憑上傳語言推定。

音樂影片以作品資訊處理，不交給逐字稿批次。活動中的已確認音樂演出可保留省略時間標記，並記錄 `transcriptProvenance.omittedRanges`；摘要跳過這些標記，不將演唱歸為談話。

長時間工作應依執行平台設定暫時防睡眠。macOS 可在命令前加上 `caffeinate -ims`，保護隨該程序結束而解除；其他平台使用其系統電源或工作排程設定。

批次預設產物位於 `.cache/catalog-transcripts/`；Hugging Face 快取預設為 `.models/huggingface/`，亦可透過 `HF_HOME` 指定其他位置。這些均為可重建或另行備份的執行產物，不提交／部署。YouTube info JSON 可能包含短效媒體 URL，也不應公開提交。

## 來源與限制

語音辨識與機械檢查不代表已確認發言語意或準確率。已知缺段、靜音幻覺及來源範圍會明確註記；初始資料的例子見[來源處理紀錄](transcript-batch-2026-11-04.md)。完整逐字稿的取得與公開再利用需分別確認授權。

參考：[MLX Whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper)、[faster-whisper](https://github.com/SYSTRAN/faster-whisper)、[yt-dlp](https://github.com/yt-dlp/yt-dlp)、[YouTube 字幕下載 API](https://developers.google.com/youtube/data/reference/rest/v3/captions/download)。

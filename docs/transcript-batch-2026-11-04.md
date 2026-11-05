# 初始 10 場逐字稿處理紀錄（2026-11-04）

YouTube 與 Hugging Face 連線均回應 HTTP 200。已更新 10 場原頻道中繼資料，匯入 5 份原頻道字幕、1 份英文自動字幕及 4 份本機 ASR 工作稿。全部標示待校對，沒有已校對版本。

| 專訪 | 片長 | 來源／語言 | 段數 | 機械提示 |
| --- | --- | --- | ---: | ---: |
| [從改變自己到改變制度，性別意識怎麼走進城市日常？](https://www.youtube.com/watch?v=YlEaWM3NAKs) | 01:21:07 | 原頻道字幕／zh-TW | 1911 | 1 |
| [發生沈麼事：沈春華對談沈伯洋](https://www.youtube.com/watch?v=vPuFVXknL1w) | 00:53:04 | 原頻道字幕／zh-TW | 2123 | 1 |
| [雅琴看世界：一場英文專訪](https://www.youtube.com/watch?v=YjbsgHRLuJo) | 00:19:25 | 英文自動字幕／en | 428 | 1 |
| [運動終身化、體育產業化，與城市的強壯文化](https://www.youtube.com/watch?v=SLJ-PuMcv-c) | 01:29:45 | 本機 ASR／zh | 2965 | 18 |
| [從少年夢想，到自己想成為的大人](https://www.youtube.com/watch?v=tG4puJVsKN8) | 00:40:45 | 本機 ASR／zh | 1347 | 12 |
| [他選了一首曾經的禁歌](https://www.youtube.com/watch?v=BhR4Mx2_wa0) | 00:43:51 | 原頻道字幕／zh-TW | 1616 | 4 |
| [少康戰情室：專訪台北市長參選人沈伯洋](https://www.youtube.com/watch?v=awX7tVlEWxU) | 01:01:30 | 本機 ASR／zh | 2133 | 14 |
| [一刀不剪：壹蘋新聞網人物專訪](https://www.youtube.com/watch?v=S9jBz2GuuK4) | 00:36:03 | 原頻道字幕／zh-Hant | 1086 | 1 |
| [市長你給我聽好了！李四端專訪](https://www.youtube.com/watch?v=zYtAGw_9Ee0) | 01:03:21 | 本機 ASR／zh | 2067 | 17 |
| [老市民發問：與王偉忠聊聊台北](https://www.youtube.com/watch?v=ULWIruQR-Lc) | 00:42:14 | 原頻道字幕／zh-TW | 484 | 0 |

共 16,160 段，影片總長 08:51:05。機械提示包含時間重疊、長段落、相鄰重複文字或超出片長；提示少不代表內容正確。

## 本機轉錄

- 引擎：`mlx-whisper 0.4.3`，Apple Silicon Metal GPU。
- 模型：`mlx-community/whisper-large-v3-turbo`。
- 模型 revision：`a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb`。
- 原音語言：`zh`；`task=transcribe`、`condition_on_previous_text=False`，未進行翻譯或說話者命名。
- 下載完整原音，ffprobe 確認僅含音訊且片長與影片相差不超過 3 秒；有配音版本的兩場明確選取 `zh-Hant` 原音。

| 影片 ID | 音檔秒數 | 本次推論／輸出秒數 |
| --- | ---: | ---: |
| `SLJ-PuMcv-c` | 5384.701 | 62.00 |
| `tG4puJVsKN8` | 2445.021 | 30.23 |
| `awX7tVlEWxU` | 3690.041 | 44.27 |
| `zYtAGw_9Ee0` | 3801.281 | 44.29 |

處理時間排除網路下載、先前失敗重試、後續格式處理與人工校對；邱個 Podcast 的 62 秒來自引擎進度紀錄的整秒近似值，其餘包含該次引擎呼叫與工作稿輸出。這不是其他設備或影片的速度保證。

## 特殊處理與待校對重點

- 邱個 Podcast 與少康戰情室提供的 `en-orig` 屬英文配音字幕；中文選項是以英文字幕自動翻譯（URL 含 `tlang`），已排除並以中文原音轉錄。匯入工具已加入語言比對與翻譯排除。
- 雅琴看世界為英文專訪。雖然中繼資料的影片語言標示 `zh-Hant`，仍依節目內容選擇英文字幕；以 JSON3 文字事件轉為段落，排除 VTT 捲動顯示的重複行。原始 VTT 與 JSON3 均保留。
- 幸福好時光開頭 0–62.727 秒經 ffmpeg 測得靜音，模型在 0–60 秒產生重複宣傳句；網站工作稿改為明確的編輯註記，原始輸出保留，仍待人工聆聽確認。
- 邱個 Podcast 在 2015.92 秒有一筆空白零長度事件，已略去；5110.74 秒起的片尾輸出含非有限信心值、逆向時間碼與疑似歌曲，工作稿改為不可靠區段註記。原始引擎輸出完整保留，該段尚無可靠逐字稿，須人工對照原音。
- ASR 人名可能出現「沈柏陽」等錯字，繁簡字亦可能混用；沒有批次猜測或潤飾。請依原音逐句校對人名、否定詞、數字、台語、中英混用與時間碼。
- 每篇的 `transcriptProvenance` 保留來源類型、語言與輸入 SHA-256；ASR 另含模型版本、引擎版本、模型 revision 與音軌格式。未填入任何人工校對聲明。

## 本機產物與驗證

- `.cache/batch-20261104/VIDEO_ID/`：原始 info JSON、字幕或音檔、下載紀錄；ASR 另有引擎原始輸出與靜音檢查紀錄。
- 各篇 `review/`：可編輯的 `subtitles.srt`、帶影片時間連結的 `review.md`、`draft.json` 及 `quality.json`。
- `.cache/batch-20261104/final-results.json`：完整來源 hash、機械提示數與實測記錄。`.cache/transcription-run.json` 已由先前受阻狀態更新為本次完成結果，舊紀錄另行保留。
- `.models/huggingface/`：本批模型快取。音檔、模型與 `.cache/` 均排除版本控制與部署，請另行備份。
- 網站只匯入文字工作稿及來源紀錄；未執行 `review`，未推送或部署到遠端。
- 自動測試、靜態建置與本機 HTTP 讀取已驗證。瀏覽器控制服務不可用，未完成瀏覽器互動、影片播放及畫面檢查。

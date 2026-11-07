# 專訪原始資料與修正方式

`common-phrases.json` 是「主題探索」常用語詞雲的共用設定，包含觀察詞表、字形對照及明確排除的多人影片。數字與影片篩選關係由建置從單篇原始 `transcript.json` 衍生，不寫回單篇主題標籤；詞雲顯示出現次數，原有主題標籤仍計影片數。擴充詞表後需核對正／簡體及異體字規則，避免同詞漏計。

`metadata.json.formatTags` 保存經來源確認的內容形式標籤，例如 `車掃`。它與 `editorial.json.keywords` 的 5–10 個文章主題詞分開；建置時去重合併，形式標籤排在前面，避免重新挑選關鍵字後失去車掃分類。新增形式標籤需核對原片，不能僅因標題提及車掃就將評論或新聞片段歸入。頂部「車掃與市政」以 `format=車掃` 篩選已確認的車掃原片，與僅談及車掃的主題關鍵字分開，可與搜尋、排序及其他條件一起使用。

每篇內容以固定 slug 為目錄名稱，例如：

```text
data/2026-11-04-stress-relief-family-and-daily-life/
├── metadata.json     # 影片 ID、標題、頻道、日期、來源與轉錄紀錄
├── transcript.json   # 原始逐字稿，含 start／end／text
├── editorial.json    # 網站實際顯示的正體中文稿、關鍵字與 AI 處理紀錄
├── article.json      # 導讀、重點、總結、slug 與原文引證
├── statistics.json   # 單片 YouTube 觀看、按讚、留言與取得時間
└── cover.json        # 封面檔案、尺寸、縮圖來源與指紋
```

`index.json` 只保存 ID／slug 對照與各集合的共用資訊，不包含逐字稿或文章全文。首頁封面與整體統計資訊也保存在索引；每日歷史快照為 `statistics-history.json`。影片候選、來源與網站設定仍使用共用檔案。封面 JPEG 位於 `assets/covers/`，由單篇 `cover.json` 指向。

## 提出文字修正 PR

1. 從專訪頁的「建議修正逐字稿」或「原始標題與收錄來源 → 檢視本篇資料／提出修正」開啟該篇目錄。
2. 核對 YouTube 對應時間，在 `editorial.json` 的 `transcript` 陣列找到句子，只修改該句的 `text`。這是讀者在網站上看到的稿件；不必安裝模型，也不必重新產生整篇內容。
3. 保留 `videoId`、句子時間碼與來源 hash。`transcript.json` 保留原始字幕／辨識結果，單純顯示稿錯字修正不需修改它。局部修正不等於完成全篇人工覆核，請勿自行將 `humanReviewed` 改為 `true`。
4. 在 PR 說明提供原片網址及時間、修改前後文字與理由。聽不清的內容可註記不明，不推測發言或說話者。
5. 執行 `npm test` 與 `npm run build`；GitHub 的 PR 檢查也會驗證資料與建置。合併後才會部署正式網站。

在 GitHub 開啟檔案後，按鉛筆編輯即可依介面建立 fork／分支及 PR。只修一篇時，PR 應只包含該篇相關檔案，無須更新其他目錄或索引。

## 其他資料調整

- 摘要在 `article.json`。引證 `evidence` 必須與 `transcript.json` 的時間範圍內原文對應；摘要改動後，維護者需重新選取／驗證關鍵字，更新 `editorial.json` 中的文章來源 hash。
- 原始逐字稿或時間碼確實有誤時，可另提 `transcript.json` 的修正並附原片時間。原稿改變會讓摘要與顯示稿的來源 hash 過期，維護者需依 [逐字稿流程](../docs/transcripts.md) 更新衍生資料後合併，不能只改 hash 讓檢查通過。
- 標題、頻道或來源資訊在 `metadata.json`；更動標題後需重新產生封面。更改音樂影片的原始製作資訊時，也須更新作品摘要及其 metadata hash。
- 目錄名稱與 `article.json` 的 slug 是公開文章網址，修正文字時保持不變。
- 統計由每日工作更新。新收錄內容在摘要建立前，會先使用 `日期-video-ID雜湊` 暫存目錄；首篇摘要產生後，工具會將資料移到最終 slug 目錄。後續更新保留該網址。

## 資料工具與產物

Python 的 `scripts/data_store.py` 與 Node.js 的 `scripts/data-store.mjs` 是共用讀寫層，建置與匯入工具直接讀寫上述目錄。工具內部的 `interviews.json`、`articles.json` 等名稱是邏輯集合，不再對應儲存庫中的集中檔案；自訂的外部 JSON 匯出路徑仍可使用。

`dist/data/interviews*.json` 是建置時產生的瀏覽器資料，不提交 Git，也不是提出修正的位置。`dist/`、音訊、模型、下載快取與私人日誌均不提交。

`metadata.json.channelId` 保存可核對的 YouTube 頻道 ID，供排行榜排除沈伯洋官方頻道時使用。舊紀錄缺少 ID 時，僅以確切的「沈伯洋Puma」名稱判定；不因其他媒體名稱含有「官方」而排除。

# 訪談文章、固定網址與 GA4

每支訪談影片在 `data/articles.json` 有獨立文章記錄，包含 `videoId`、固定 `slug`、導讀 `lead`、3–5 項 `highlights`、`conclusion` 與來源紀錄。每項重點保留原文引證與時間範圍，頁面可直接回看原片。文章摘要與原稿保留各自的內部覆核狀態；網站顯示 AI 摘要與 AI 輔助校對，不把 AI 處理冒充人工覆核。

已知來源範圍問題另存 `sourceScopeNote`，頁面會醒目標示。重跑摘要會保留此註記，需人工對照來源確認後才移除。

摘要由本機已安裝的 `Qwen3.6-27B-MLX-4bit` 讀取各篇現有逐字稿的所有有效區段產生，不只依標題或抽樣段落撰寫。已標示的辨識異常不作為摘要來源；英文訪談仍保留英文逐字稿，文章以繁體中文整理。模型產物仍可能誤解語氣、人物或立場，請對照原片校對。若逐字稿只涵蓋節目中的演講等片段，會在文章導讀及處理進度另列來源範圍，不將其他講者的內容歸給沈伯洋。

來源引證優先以精確文字比對，不接受近似字、翻譯或改寫充作原文。模型若把區塊編號寫錯，只有在原文能明確定位時才修正引用位置；若摘錄省略中段，保存實際原文的完整範圍，包括其中的否定與限制條件。無法精確定位時，會捨棄模型的引文、改由程式擷取它指定的真實來源區塊，並在時間連結標示「時間位置供參考」；不將改字後的模型文字當作原話。這些是格式與來源檢查，不等於人工事實或立場核對。

正文中的明顯人名誤字另行修正，不修改逐字稿或引證。例如「曾心慧」依[原節目標題](https://www.youtube.com/watch?v=vcHJTgttPzw)確認，「李貞秀」依[立法院名錄](https://www.ly.gov.tw/Pages/List.aspx?nodeid=56478)確認；僅核對用字，不以後來的職務或事件改寫訪談當時的說法。

## 固定網址

建置會為每篇產生 `dist/interviews/SLUG/index.html`，對外網址為：

```text
/interviews/2026-11-03-shen-boyang-taipei-municipal-reform/
```

`slug` 儲存在文章資料裡，重跑摘要、改標題或更新內容時會保留。多人同日、同主題仍有各自網址；重複 slug 會在建置時拒絕。尚未建立摘要的新影片使用日期與影片 ID 作為暫時網址。

舊網址 `index.html?v=VIDEO_ID&t=123` 會轉至該篇 slug，保留時間碼與來源參數；卡片、相關訪談、分享與片段連結均使用獨立網址。播放時間碼不會另改瀏覽器歷史，避免把播放操作誤當成文章頁瀏覽。

每篇 HTML 包含自己的標題、描述、canonical、文章 ID 與 slug，並直接包含摘要正文，關閉 JavaScript 仍可閱讀。逐字稿與全站索引共用資料 JSON，避免在每個文章檔重複放入整個資料庫。所有相對資源以網站根目錄為基準，支援 GitHub Pages 的 repository 子目錄。

完整閱讀器請透過 `npm run dev` 或 `npm run preview` 使用；直接以 `file:` 開啟文章時仍可閱讀靜態摘要，但瀏覽器可能阻擋共用逐字稿資料的讀取。

## 產生與更新摘要

摘要工具需另外安裝 `mlx-lm` 及本機語言模型；網站建置與一般測試不依賴它。這次使用既有 uv tool 環境與模型，沒有下載新權重或呼叫付費 API：

```sh
caffeinate -ims /Users/rickhwang/.local/share/uv/tools/mlx-lm/bin/python \
  scripts/summarize_articles.py \
  --model /Users/rickhwang/.lmstudio/models/lmstudio-community/Qwen3.6-27B-MLX-4bit
```

工具會略過來源 hash 未變的文章與已校對文章，逐篇保存結果，可中斷後續跑。原始模型回覆及效能資料在 `.cache/articles/VIDEO_ID/時間戳/`，不提交版本控制。若只需重新整理某篇待校對稿：

```sh
# 使用裝有 mlx-lm 的 Python 執行
python scripts/summarize_articles.py --model /path/to/local-model \
  --video-id VIDEO_ID --refresh-drafts
```

`--refresh-drafts` 保留既有 slug，不覆蓋 `reviewed` 文章。逐字稿內容更新後，若摘要的來源 hash 不符，建置會要求更新摘要，避免沿用過期結論。人工確認完畢後才能把文章 `status` 改為 `reviewed`。

## 預留 GA4

`data/site.json` 預設：

```json
{
  "siteUrl": "",
  "analytics": { "measurementId": "" }
}
```

空白 Measurement ID 時不載入 Google 程式、不送出統計資料。正式上線後，可填入真實網址與 GA4 ID，再重新建置，例如：

```json
{
  "siteUrl": "https://ACCOUNT.github.io/REPOSITORY/",
  "analytics": { "measurementId": "G-XXXXXXXXXX" }
}
```

`siteUrl` 須以 `/` 結尾，包含 repository 子目錄；提供後會產生完整 canonical URL。沒有正式網址時保留相對 canonical，無需先設定虛構網域。

啟用後，每次載入頁面送出一個 `page_view`，包含 `page_title`、`page_location`；文章頁另附 `interview_id`、`article_slug`、`content_group: interview`。`page_location` 將 `index.html` 歸一為目錄網址、排除片段時間 `t` 與 fragment，保留 UTM 來源參數；舊連結轉向前不送出瀏覽事件。

本站以 `send_page_view: false` 關閉標籤的預設 pageview，再自行送出單次事件。啟用 GA4 時，請在資料串流的「加強型評估／網頁瀏覽」設定中關閉「根據瀏覽器記錄事件變更的網頁」，避免與網站自己的事件重複；Google 說明見 [Measure pageviews](https://developers.google.com/analytics/devguides/collection/ga4/views)。

GA 報表可依文章 pathname 分辨各篇。如需以文章 ID 或 slug 製作自訂報表，可在 GA 管理介面新增事件範圍的 `interview_id` 與 `article_slug` 自訂維度。目前沒有設定真實 Measurement ID，也未驗證遠端 GA 收集結果。

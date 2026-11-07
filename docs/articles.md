# 訪談文章、固定網址與 GA4

每支訪談影片在 `data/articles.json` 有獨立文章記錄，包含 `videoId`、固定 `slug`、導讀 `lead`、3–5 項 `highlights`、`conclusion` 與來源紀錄。每項重點保留原文引證與時間範圍，頁面可直接回看原片。文章摘要與原稿保留各自的內部覆核狀態；網站顯示 AI 摘要與 AI 輔助校對，不把 AI 處理冒充人工覆核。

已知來源範圍問題另存 `sourceScopeNote`，頁面會醒目標示。重跑摘要會保留此註記，需人工對照來源確認後才移除。

現有摘要的模型與版本保留於各篇 `provenance`；生成工具讀取逐字稿的所有有效區段，不只依標題或抽樣段落撰寫。已標示的辨識異常不作為摘要來源；英文訪談仍保留英文逐字稿，文章以繁體中文整理。模型產物仍可能誤解語氣、人物或立場，請對照原片校對。若逐字稿只涵蓋節目中的演講等片段，會在文章導讀及處理進度另列來源範圍，不將其他講者的內容歸給沈伯洋。

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

摘要工具需 Apple Silicon macOS 14 以上、相容 Metal 環境及已下載的 MLX 文字模型。先在所選 Python 虛擬環境安裝選用依賴；網站建置與一般測試不依賴這些套件：

```sh
python -m pip install -r requirements-editorial.txt
python scripts/summarize_articles.py --model ./.models/text-model
```

模型權重需自行取得；此目錄為專案相對範例，不代表儲存庫包含模型。工具會略過來源 hash 未變的文章與已校對文章，逐篇保存結果，可中斷後續跑。原始模型回覆及效能資料在 `.cache/articles/VIDEO_ID/時間戳/`，不提交版本控制。若只需重新整理某篇待校對稿：

```sh
# 使用裝有 mlx-lm 的 Python 執行
python scripts/summarize_articles.py --model ./.models/text-model \
  --video-id VIDEO_ID --refresh-drafts
```

`--refresh-drafts` 保留既有 slug，不覆蓋 `reviewed` 文章。逐字稿內容更新後，若摘要的來源 hash 不符，建置會要求更新摘要，避免沿用過期結論。人工確認完畢後才能把文章 `status` 改為 `reviewed`。

## Google Tag Manager 與 GA4

正式設定在 `data/site.json`：

```json
{
  "siteUrl": "https://puma-talk.gtcafe.com/",
  "analytics": {
    "measurementId": "G-TRLVRQ877L",
    "gtmContainerId": "GTM-WXCZ2WR7"
  }
}
```

這兩個 ID 為本站公開的分析設定。複製專案另作網站時應換成自己的 ID，或將兩欄設空以停用分析。容器內需設定並發布 GA4 目的地；是否實際收到事件應在分析後台核對。

建置把 GTM 載入程式放在每頁 head，並在 body 開頭加入標準 noscript iframe。GTM 設定存在時優先使用容器，不另外載入獨立 gtag.js、不另外送一份 config 或 page_view。容器內的 Google 標籤負責收集事件；容器設定仍由 Google Tag Manager 管理。

載入容器前以全域參數與 dataLayer 提供 `page_title`、`page_location`；文章頁另提供 `interview_id`、`article_slug`、`content_group: interview`。`page_location` 歸一 `index.html`、排除片段時間 `t` 與 fragment，保留 UTM；舊 `?v=` 連結轉向前不啟動標籤。dataLayer 的 `puma_page_context` 用於容器擴充，不是額外 GA page_view。

只有 Measurement ID 而沒有 GTM 時，才使用獨立 GA4 模式：以 `send_page_view:false` 關閉預設瀏覽，自行送出單次 page_view。兩個 ID 都空白時，不載入分析標籤。

正式網址用於首頁與每篇文章的 canonical URL。啟用後可在 Google Analytics 的「報表 → 即時」確認來訪；如要用 ID／slug 製作自訂報表，可新增事件範圍的 `interview_id`、`article_slug` 自訂維度。需在 Tag Assistant／DebugView 確認實際事件參數後使用。

搜尋篩選改變網址時，是否額外記錄瀏覽事件由容器的增強型評估與 history tracking 設定決定。若只要計算完整頁面載入，可在 GA 網頁瀏覽設定中關閉「根據瀏覽器記錄事件變更的網頁」。網站本身不重複送出 page_view。

官方參考：[安裝 GTM](https://support.google.com/tagmanager/answer/14847097)、[設定 GA4 目的地](https://support.google.com/tagmanager/answer/9442095)、[dataLayer](https://developers.google.com/tag-platform/tag-manager/datalayer)。

## 音樂作品資訊

`contentType: "music"` 且沒有逐字稿的影片，可由 `scripts/summarize_media.py --model MODEL --video-id VIDEO_ID` 依原頻道標題及製作資訊產生摘要。文章使用 `coverage: "video-metadata"`、`metadataSha256` 與製作資訊逐字引證；更動來源資料後，建置會拒絕過期摘要。作品頁不提供虛構逐字稿或時間跳轉引證，重點連回原片製作資訊。編輯紀錄使用 `method: "metadata-only"`，不列為中文逐字稿校對或翻譯。

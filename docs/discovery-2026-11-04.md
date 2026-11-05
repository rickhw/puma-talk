# 2026-11-04 新增資料

2026-11-05 比對既有 113 支影片後，補入以下兩支台灣時間 11 月 4 日上線的影片。目前共 115 支影片版本、115 篇文章摘要、530 項重點；候選目錄共 511 個 YouTube ID。分段、綜藝及不同版本均不等於獨立專訪場次。

| 影片 | 台灣上線時間 | 範圍 | 逐字稿 |
| --- | --- | --- | --- |
| [11點熱吵店：紓壓主題完整版](https://www.youtube.com/watch?v=9zRsNOYZ7U4) | 11/04 00:00:20 | 節目日期 11/03，多位來賓共同參與，44 分 53 秒 | MLX Whisper，1,684 段 |
| [寧夏璐66號茶坊：育兒問答片段](https://www.youtube.com/watch?v=Fc7mNhTRS5o) | 11/04 17:18:06 | 沈伯洋官方頻道發布的 6 分 34 秒片段 | MLX Whisper，231 段 |

日期由 YouTube `timestamp` 換算 Asia/Taipei；《11點熱吵店》的 YouTube `upload_date` 為 UTC 11/03，候選目錄另存 `youtubeUploadDate`，網站保留 `programDate` 與 `publishedAt` 以避免混淆。

本次無法取得合適字幕，改下載原語言音軌並以語音辨識轉錄。音訊輸入 hash 與模型保留於各篇來源紀錄；音訊及執行產物不提交 GitHub。兩支共新增 1,915 段，網站另提供 AI 輔助校對的正體中文稿。原有 113 筆原始記錄逐筆比對保持不變。

兩篇各有獨立 slug、導讀、重點與總結，以及 8／7 個內容關鍵字。摘要已核對說話歸屬：《11點熱吵店》不將其他來賓的婚姻或受騙經歷歸為沈伯洋自身經歷；育兒片段註明問題來自辦公室同仁，其中一題是他自己的問題。這是 AI 文字處理，未標為人工覆核。

115 支 YouTube 公開觀看數／按讚數已更新。統計資料與取得時間見 `data/statistics.json`；每日排程會接續更新。

## 待補的原始訪談

范琪斐主持的 LINE TODAY《TODAY 看世界》專訪沈伯洋，已由中央社確認於 **11/04 晚間 20:00 播出**：[播出預告](https://www.cna.com.tw/news/aipl/202611040248.aspx)、[當晚訪談報導](https://www.cna.com.tw/news/aipl/202611040364.aspx)。

經 YouTube 關鍵字、節目頻道與直播清單、公開影片目錄及 LINE TODAY 網頁搜尋，尚未找到可核實的完整版網址。已保存於 [`data/pending-interviews.json`](../data/pending-interviews.json)，未加入網站已收錄數，也未以新聞剪輯或花絮代替原訪談。這份搜尋紀錄不宣稱已涵蓋所有可能來源。

## 執行與發布

執行需求見 [README](../README.md)，Pages 操作見[設定指南](github-pages.md)；測試與發布結果以儲存庫 Actions 紀錄為準。

# 協助修正專訪內容

請從專訪頁的「建議修正逐字稿」開啟 `data/<slug>/`，修正該篇 `editorial.json` 的顯示文字，並在 PR 附上 YouTube 原片時間、修改前後文字及理由。只修錯字不需重跑 AI，也不用改其他篇的檔案。

詳細檔案說明、原稿與摘要的修正方式見[資料與 PR 指南](data/README.md)。請執行：

```sh
npm test
npm run build
```

GitHub 會檢查 PR；通過並合併後發布網站。發現問題但不確定文字時，也可以提出 issue，附文章網址與影片時間供維護者核對。

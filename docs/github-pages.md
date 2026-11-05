# 開啟 rickhw/puma-talk 的 GitHub Pages

本專案已提供 `.github/workflows/pages.yml`，以 Node.js 建置 `dist/`，不需要新增 Jekyll 或另一份部署 workflow。

## 1. 設定發布來源

開啟 [Settings → Pages](https://github.com/rickhw/puma-talk/settings/pages)，在 **Build and deployment → Source** 選擇 **GitHub Actions**。已有 workflow，可略過畫面建議的其他範本。

## 2. 開啟專案部署開關

開啟 [Settings → Secrets and variables → Actions → Variables](https://github.com/rickhw/puma-talk/settings/variables/actions)，按 **New repository variable**：

- Name：`ENABLE_PAGES`
- Value：`true`

按 **Add variable**。此設定是一般 repository variable，無需新增 secret、PAT 或 YouTube API key。

## 3. 第一次發布

開啟 [Build and deploy static site](https://github.com/rickhw/puma-talk/actions/workflows/pages.yml)，按 **Run workflow**，選擇 `main`，再按 **Run workflow**。

等待 `build` 與 `deploy` 都顯示綠色勾勾。這次需啟動新的 workflow run；設定變數前的舊執行紀錄可能仍顯示 deploy skipped。

預期網址：**https://rickhw.github.io/puma-talk/**。實際網址以成功部署紀錄及 Settings → Pages 顯示的網址為準。

## 後續更新

推送網站程式或資料至 `main` 後，自動測試、建置與部署。每日統計 workflow 在台灣時間 03:10 排程執行（GitHub 可能延遲），完成後直接部署；不依賴機器人 commit 觸發另一個 workflow。

`data/site.json` 已設定此 Pages 網址，讓每篇獨立 slug 的 canonical URL 指向正確子目錄。GA4 Measurement ID 仍留空，無須為了開啟 Pages 填寫。

若 `deploy` 顯示 skipped，先確認 repository variable 的名稱與值；若 `configure-pages` 回報找不到 Pages，確認第一步的 Source。若 environment 要求核准，至該次 run 完成 Review deployments，再查看結果。

官方說明：[發布來源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)、[repository variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository)。

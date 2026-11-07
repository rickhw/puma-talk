# 封面與社群預覽

首頁與現有 121 篇專訪各有 1200 × 630 JPEG 封面。首頁是網站品牌封面，專訪封面由原影片縮圖、標題、頻道及日期排版。影片圖像仍屬原作者，來源 URL 與原圖 SHA-256 保存於 `data/<slug>/cover.json`。

- `assets/covers/`：已產生的圖片，檔名含內容指紋，隨儲存庫提交。
- `data/<slug>/cover.json`：逐片封面的對應、尺寸、替代文字及來源；首頁封面紀錄位於 `data/index.json` 的 `covers.home`。
- 建置將封面加入社群 Open Graph／Twitter metadata，並用於專訪播放器的播放前畫面。分享平台可直接讀取 HTML，不需執行本站 JavaScript。
- `data/site.json` 的 `siteUrl` 需為正確的正式網址，才能產生完整社群圖片 URL。

首頁與專訪頁的 `<head>` 直接提供完整封面資訊，逐字稿另外載入共用的內容指紋 JSON，避免大型資料佔用爬蟲讀取 HTML 的範圍。若 Facebook 仍顯示舊預覽，可在 [Sharing Debugger](https://developers.facebook.com/tools/debug/) 輸入正式網址並選擇重新擷取；HTTP 與圖片可讀取的檢查不等於 Facebook 已更新其快取。

## 重新產生（選用）

使用已啟用的 Python 虛擬環境：

```sh
python -m pip install -r requirements-covers.txt
mkdir -p .cache/cover-fonts
curl -L --fail -o .cache/cover-fonts/NotoSansCJKtc-Bold.otf \
  https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Bold.otf
python scripts/generate_covers.py --font ./.cache/cover-fonts/NotoSansCJKtc-Bold.otf
npm test
npm run build
```

也可透過 `--font` 提供其他支援正體中文的 TrueType／OpenType 字型。字型來源：[Noto CJK](https://github.com/notofonts/noto-cjk)。字型及下載快取不提交，既有圖片可直接建置，不需要安裝 Pillow。

縮圖下載最多四支並行，原圖暫存在 `.cache/cover-thumbnails/`。若原頻道更新縮圖，加上 `--refresh-thumbnails` 重新取得。標題變更後，應重新產生封面；建置會核對標題與圖片指紋。新增但尚未產生本站排版封面的影片，暫以原頻道縮圖提供預覽。

## 轉貼文字與影片跳轉

每篇「複製摘要與連結」會複製標題、節目資料、文章導讀、重點標題與該篇固定網址，保留換行供貼到社群。連結不帶播放時間、UTM 或預覽參數。

逐字稿左側時間碼及右側「跳轉」共用目前的嵌入播放器；首次操作才載入 YouTube IFrame API，之後以 `seekTo` 跳轉。右側的複製片段連結仍保留。原始 YouTube 外連另放在影片下方。

參考：[Open Graph](https://ogp.me/)、[YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)。

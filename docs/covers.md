# 封面與社群預覽

首頁與現有 115 篇專訪各有 1200 × 630 JPEG 封面。首頁是網站品牌封面，專訪封面由原影片縮圖、標題、頻道及日期排版。影片圖像仍屬原作者，來源 URL 與原圖 SHA-256 保存於 `data/covers.json`。

- `assets/covers/`：已產生的圖片，檔名含內容指紋，隨儲存庫提交。
- `data/covers.json`：首頁與逐片封面的對應、尺寸、替代文字及來源。
- 建置將封面加入社群 Open Graph／Twitter metadata，並用於專訪播放器的播放前畫面。分享平台可直接讀取 HTML，不需執行本站 JavaScript。
- `data/site.json` 的 `siteUrl` 需為正確的正式網址，才能產生完整社群圖片 URL。

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

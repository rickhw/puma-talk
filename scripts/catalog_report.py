#!/usr/bin/env python3
"""Write a public progress report from the catalog and the actual website data."""
from collections import Counter
import datetime as dt
import json
from pathlib import Path

from import_youtube import ROOT, read_archive
from transcripts import checksum, quality_report, timestamp


def main():
    catalog=json.loads((ROOT/'data/catalog.json').read_text())
    archive=read_archive(ROOT/'data/interviews.json')
    included=[row for row in catalog['candidates'] if row['decision']=='include']
    items={item['id']:item for item in archive['interviews']}
    complete=[row for row in included if items.get(row['id'],{}).get('transcript')]
    years=sorted({row['uploadDate'][:4] for row in included},key=lambda year:(year==str(catalog['priorityYear']),year),reverse=True)
    kinds=Counter(items[row['id']]['transcriptProvenance']['kind'] for row in complete)
    decisions=Counter(row['decision'] for row in catalog['candidates'])
    total_seconds=sum(items[row['id']].get('duration',0) for row in complete)
    lines=['# 專訪處理進度','',
           f'更新：{dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds")}（台灣時間）','',
           f'已匯入 **{len(complete)} / {len(included)} 支訪談影片**，優先處理 {catalog["priorityYear"]} 年。所有本次匯入稿件均待校對；分段影片不等於獨立專訪場次，亦不宣稱已涵蓋 YouTube 所有訪談。','',
           f'共整理 {len(catalog["candidates"])} 個候選影片 ID：{decisions["include"]} 支納入、{decisions["duplicate"]} 支重複版本、{decisions["deferred"]} 支另列待確認或非專訪內容。原始清單與逐支理由見 [catalog.json](../data/catalog.json)。','',
           f'已匯入來源：原頻道字幕 {kinds["youtube-original"]} 支、YouTube 自動字幕 {kinds["youtube-auto"]} 支、本機 ASR {kinds["asr-local"]} 支。已收錄影片片長總和 {timestamp(total_seconds).split(",")[0]}（包含片頭、片尾與非專訪段落，並非人工驗證的語音覆蓋時數）。','',
           '| 發布年份 | 已匯入 | 納入清單 | 待處理 |','| --- | ---: | ---: | ---: |']
    for year in years:
        count=sum(row['uploadDate'].startswith(year) for row in included)
        done=sum(row['uploadDate'].startswith(year) for row in complete)
        lines.append(f'| {year} | {done} | {count} | {count-done} |')
    validation_path=ROOT/'.cache/catalog-validation.json'
    if validation_path.exists():
        validation=json.loads(validation_path.read_text())
        if validation.get('websiteDataSha256')==checksum(ROOT/'data/interviews.json'):
            annotations=sum(cue['text'].startswith(('［本段辨識','［靜音區段','［片頭靜音','［片尾辨識'))
                            for row in complete for cue in items[row['id']]['transcript'])
            lines+=['','## 本批驗證','',
                    f'完成驗證：{validation["validatedAt"]}。{validation["sourceHashesVerified"]} 支的輸入 SHA-256 已逐一比對原始下載檔；{validation["testsPassed"]} 項測試、靜態建置與 HTTP 資料比對通過。重新執行批次指令的待處理數為 0，已匯入內容未重做。','',
                    f'共有 {annotations} 則明確的異常／靜音區段註記，全部內容仍需人工聆聽校對。完整驗證紀錄在 `.cache/catalog-audit.json`、`.cache/catalog-validation.json` 與最新 `.cache/transcription-run.json`。','',
                    '轉錄期間已使用 caffeinate 防止自動睡眠，完成後已解除本次保護；未修改永久能源設定。']
    result_path=ROOT/'.cache/catalog-transcripts-20261104/results.json'
    results=json.loads(result_path.read_text()) if result_path.exists() else []
    failures=[row for row in results if row['outcome']=='failed' and not items.get(row['id'],{}).get('transcript')]
    lines+=['','## 待處理與失敗','']
    if failures:
        for row in failures:
            lines.append(f'- `{row["id"]}`：尚未成功匯入；詳見 `.cache/catalog-transcripts-20261104/{row["id"]}/` 與批次紀錄。')
    else: lines.append('目前沒有已記錄且尚未解決的批次失敗。')
    pending=[row for row in included if not items.get(row['id'],{}).get('transcript')]
    if pending:
        lines+=['','尚待處理的影片 ID：', '', ', '.join('`'+row['id']+'`' for row in pending)]
    lines+=['','## 已匯入清單','',
            '「機械提示」包含時間重疊、長段落、重複文字或超出片長；少量提示不代表辨識正確。ASR 異常窗口與靜音中的可疑文字會以方括號明確註記，保留原始引擎輸出供人工比對。','',
            '| 發布日期 | 訪談 | 來源 | 段數 | 機械提示 |','| --- | --- | --- | ---: | ---: |']
    labels={'youtube-original':'原頻道字幕','youtube-auto':'自動字幕','asr-local':'本機轉錄'}
    for row in complete:
        item=items[row['id']]
        title=item['title'].replace('|','／').replace('\n',' ')
        kind=item['transcriptProvenance']['kind']
        quality=quality_report(item['transcript'],item.get('duration'))
        lines.append(f'| {item["date"]} | [{title}]({item["sourceUrl"]}) | {labels[kind]}・待校對 | {len(item["transcript"])} | {len(quality["warnings"])} |')
    lines+=['','## 重跑與本機產物','',
            '```sh',
            'caffeinate -ims .venv/bin/python -u scripts/batch_transcripts.py --year 2026 --all-years',
            '.venv/bin/python scripts/catalog_report.py',
            'PATH="$PWD/.venv/bin:$PATH" npm test',
            'npm run build','```','',
            '批次工具先處理指定年份，已匯入稿件直接跳過。下載最多同時兩支，本機 GPU 推論與網站資料寫入逐支進行。中繼資料不存在或超過四小時會重新取得，以更新過期的音訊／字幕 URL。','',
            '初始 10 場的產物保留在 `.cache/batch-20261104/`；擴充批次在 `.cache/catalog-transcripts-20261104/`，每支 `review/` 提供字幕、逐段校對索引與機械提示。模型快取在 `.models/huggingface/`。這些目錄不提交或部署，需另行備份。','',
            '本次未執行人工校對指令，未推送或部署遠端。完整逐字稿公開前仍需確認原頻道授權。瀏覽器控制服務不可用；目前透過資料驗證、靜態建置與 HTTP 讀取驗證，未完成影片播放與瀏覽器畫面檢查。','',
            '來源：[公開專訪清單](https://vocus.cc/article/6ad8d562fd89780001e98adb)、[認識沈伯洋影片目錄](https://whoispuma.com/videos)，以及原 YouTube 頻道的影片中繼資料。','']
    output=ROOT/'docs/processing-status.md'
    output.write_text('\n'.join(lines))
    print(f'已匯入 {len(complete)}/{len(included)}，未解決失敗 {len(failures)} → {output}')


if __name__=='__main__':
    main()

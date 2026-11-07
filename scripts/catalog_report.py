#!/usr/bin/env python3
"""Write a progress report using only the committed catalog and archive data."""
from collections import Counter
import datetime as dt
import json

from import_youtube import ROOT, read_archive
from transcripts import quality_report, timestamp


def main():
    catalog=json.loads((ROOT/'data/catalog.json').read_text())
    archive=read_archive(ROOT/'data/interviews.json')
    included=[row for row in catalog['candidates'] if row['decision']=='include']
    items={item['id']:item for item in archive['interviews']}
    complete=[row for row in included if items.get(row['id'],{}).get('transcript') or items.get(row['id'],{}).get('contentType')=='music']
    complete.sort(key=lambda row:items[row['id']]['date'],reverse=True)
    years=sorted({row['uploadDate'][:4] for row in included},reverse=True)
    kinds=Counter(items[row['id']].get('transcriptProvenance',{}).get('kind') for row in complete)
    decisions=Counter(row['decision'] for row in catalog['candidates'])
    total_seconds=sum(items[row['id']].get('duration',0) for row in complete)
    pending=[row for row in included if not items.get(row['id'],{}).get('transcript') and items.get(row['id'],{}).get('contentType')!='music']
    lines=['# 專訪處理進度','',
        f'更新：{dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}','',
        f'已匯入 **{len(complete)} / {len(included)} 支影片版本**，共 {len(catalog["candidates"])} 個候選影片 ID。候選判定：{decisions["include"]} 支納入、{decisions["duplicate"]} 支重複版本、{decisions["deferred"]} 支待確認或另類內容。','',
        '本報告由 `data/catalog.json`、`data/index.json` 與各專訪目錄 產生，不依賴執行設備、下載快取或私人日誌。分段、完整版與綜藝節目按影片 ID 計數，不等於獨立專訪場次。','',
        f'原始文字來源：原頻道字幕 {kinds["youtube-original"]} 支、自動字幕 {kinds["youtube-auto"]} 支、語音辨識 {kinds["asr-local"]} 支。音樂作品資訊 {kinds["metadata-only"]} 支。影片片長合計 {timestamp(total_seconds).split(",")[0]}，包含片頭、片尾及非專訪段落。','',
        '網站另提供 AI 正體中文顯示稿。原始來源狀態與人工覆核分開保留；語音辨識及機械檢查不代表內容已人工確認。摘要與來源範圍見[文章進度](articles-status.md)。','',
        '| 發布年份 | 已匯入 | 納入清單 | 待處理 |','| --- | ---: | ---: | ---: |']
    for year in years:
        count=sum(row['uploadDate'].startswith(year) for row in included)
        done=sum(row['uploadDate'].startswith(year) for row in complete)
        lines.append(f'| {year} | {done} | {count} | {count-done} |')
    lines+=['','## 待處理','']
    lines+=['、'.join('`'+row['id']+'`' for row in pending) if pending else '已納入的候選影片均完成來源處理；音樂影片以作品資訊收錄。']
    lines+=['','尚待確認原片的訪談另見 [`pending-interviews.json`](../data/pending-interviews.json)。','',
        '## 已匯入清單','',
        '機械提示包含時間重疊、長段落、相鄰重複與超出片長；提示少不代表辨識正確。','',
        '| 發布日期 | 訪談 | 原始文字來源 | 段數 | 機械提示 |','| --- | --- | --- | ---: | ---: |']
    labels={'youtube-original':'原頻道字幕','youtube-auto':'自動字幕','asr-local':'語音辨識','metadata-only':'音樂作品資訊'}
    for row in complete:
        item=items[row['id']]
        title=item['title'].replace('|','／').replace('\n',' ')
        kind=item.get('transcriptProvenance',{}).get('kind')
        warnings=quality_report(item['transcript'],item.get('duration'))['warnings'] if item['transcript'] else []
        lines.append(f'| {item["date"]} | [{title}]({item["sourceUrl"]}) | {labels.get(kind,"字幕檔")} | {len(item["transcript"])} | {len(warnings)} |')
    lines+=['','## 更新報告','',
        '```sh','python scripts/catalog_report.py','python scripts/articles_report.py','```','',
        '轉錄與續跑方式見[逐字稿工作流程](transcripts.md)，執行需求見 [README](../README.md)。批次工具重新取得缺少或過期的中繼資料，不要求複製他人的媒體快取。','']
    output=ROOT/'docs/processing-status.md';output.write_text('\n'.join(lines))
    print(f'已匯入 {len(complete)}/{len(included)} → {output.name}')


if __name__=='__main__':main()

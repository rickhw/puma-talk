#!/usr/bin/env python3
"""Report article coverage separately from transcript review progress."""
from collections import Counter
import datetime as dt
import json
from urllib.parse import urljoin

from import_youtube import ROOT,read_archive
from summarize_articles import transcript_fingerprint


def main():
    archive=read_archive(ROOT/'data/interviews.json')
    path=ROOT/'data/articles.json'
    manifest=json.loads(path.read_text()) if path.exists() else dict(version=1,articles=[])
    articles={article['videoId']:article for article in manifest['articles']}
    valid=[item for item in archive['interviews'] if item['id'] in articles]
    states=Counter(articles[item['id']]['status'] for item in valid)
    editorial_path=ROOT/'data/editorial.json'
    editorial=json.loads(editorial_path.read_text()) if editorial_path.exists() else dict(records=[])
    ai_records={row['videoId']:row for row in editorial['records']}
    ai_count=sum(item['id'] in ai_records for item in valid)
    references=sum(point.get('citationStatus')=='needs-review' for item in valid for point in articles[item['id']]['highlights'])
    stale=[item['id'] for item in valid if articles[item['id']]['provenance']['transcriptSha256']!=transcript_fingerprint(item['transcript'])]
    scope_notes=[(item,articles[item['id']]['sourceScopeNote']) for item in valid if articles[item['id']].get('sourceScopeNote')]
    site_path=ROOT/'data/site.json'
    site=json.loads(site_path.read_text()) if site_path.exists() else {}
    site_url=site.get('siteUrl','')
    lines=['# 文章摘要處理進度','',
        f'更新：{dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds")}（台灣時間）','',
        f'已產生 **{len(valid)} / {len(archive["interviews"])} 篇 AI 文章摘要**。每篇包含導讀、3–5 項重點、總結與固定 slug。正體中文 AI 校對／翻譯版本已完成 {ai_count} 篇；人工覆核紀錄 {states["reviewed"]} 篇，AI 處理不冒充人工覆核。','',
        f'共有 {references} 項時間連結採參考位置；原文由程式直接擷取，未把模型改字後的引文當作原話。其餘引證有精確文字對應；發言語意與立場仍應搭配原始影片理解。','',
        '每篇文章使用 `/interviews/SLUG/`；舊 query-string 連結仍可轉向並保留時間碼。完整設定與更新方式見[文章、網址與 GA 說明](articles.md)。','',
        '網站網址與 GTM／GA4 設定由 `data/site.json` 提供，啟用狀態依該設定及容器發布狀態而定。YouTube 每日統計與本站流量分開計算。此報告僅依儲存庫資料產生，不代表已在分析後台確認收到事件。','',
        ]
    if scope_notes:lines += [f'另有 **{len(scope_notes)} 篇來源範圍說明**，詳見下方專節；文章頁已醒目標示，辨識不清部分保留時間範圍並註記。','']
    lines += ['| 日期 | 訪談 | 固定 slug | 重點數 |','| --- | --- | --- | ---: |']
    for item in valid:
        article=articles[item['id']]
        title=item['title'].replace('|','／').replace('\n',' ')
        url=urljoin(site_url,'interviews/'+article['slug']+'/') if site_url else item['sourceUrl']
        lines.append(f'| {item["date"]} | [{title}]({url}) | `{article["slug"]}` | {len(article["highlights"])} |')
    pending=[item['id'] for item in archive['interviews'] if item['id'] not in articles]
    if scope_notes:
        lines+=['','## 來源範圍說明','']
        lines.extend(f'- `{item["id"]}`：{note}' for item,note in scope_notes)
    if pending:lines+=['','待整理 ID：', '',', '.join('`'+vid+'`' for vid in pending)]
    if stale:lines+=['','來源已變動、需更新摘要：', '',', '.join('`'+vid+'`' for vid in stale)]
    (ROOT/'docs/articles-status.md').write_text('\n'.join(lines)+'\n')
    print(f'文章摘要 {len(valid)}/{len(archive["interviews"])}，參考時間連結 {references}，過期摘要 {len(stale)}')


if __name__=='__main__':main()

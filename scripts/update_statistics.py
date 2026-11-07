#!/usr/bin/env python3
"""Refresh public YouTube counts, preserving the last successful sample on errors."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime as dt
import json
from pathlib import Path
import shutil
import subprocess
from zoneinfo import ZoneInfo
from data_store import read_document, document_exists
from import_youtube import ROOT, atomic_write, read_archive


def count(value):
    return value if isinstance(value,int) and not isinstance(value,bool) and value>=0 else None


def sample(info, timestamp):
    return dict(videoId=info['id'],views=count(info.get('view_count')),likes=count(info.get('like_count')),comments=count(info.get('comment_count')),
                fetchedAt=timestamp,source='youtube',status='ok')


def refresh_item(item):
    executable=shutil.which('yt-dlp')
    if not executable:raise RuntimeError('找不到 yt-dlp')
    result=subprocess.run([executable,'--skip-download','--ignore-no-formats-error','--no-playlist',
        '--no-warnings','--socket-timeout','20','--retries','1','--dump-single-json',item['sourceUrl']],
        capture_output=True,text=True,timeout=120)
    if result.returncode:raise RuntimeError(result.stderr[-700:].strip())
    info=json.loads(result.stdout)
    if info.get('id')!=item['id']:raise ValueError('影片 ID 不符')
    return sample(info,dt.datetime.now(dt.timezone.utc).isoformat())


def totals(records):
    return dict(views=sum(x['views'] for x in records if x.get('views') is not None),
        likes=sum(x['likes'] for x in records if x.get('likes') is not None),
        comments=sum(x['comments'] for x in records if x.get('comments') is not None),
        commentsAvailable=sum(x.get('comments') is not None for x in records),
        videos=len(records),viewsAvailable=sum(x.get('views') is not None for x in records),
        likesAvailable=sum(x.get('likes') is not None for x in records),
        fresh=sum(x.get('status')=='ok' for x in records))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers',type=int,default=3)
    parser.add_argument('--limit',type=int)
    parser.add_argument('--output',type=Path,default=ROOT/'data/statistics.json')
    args=parser.parse_args()
    archive=read_archive(ROOT/'data/interviews.json')['interviews']
    known={}
    if document_exists(args.output):known={x['videoId']:x for x in read_document(args.output)['videos']}
    items=archive[:args.limit] if args.limit else archive
    attempted=dt.datetime.now(dt.timezone.utc).isoformat()
    with ThreadPoolExecutor(max_workers=max(1,min(args.workers,4))) as executor:
        futures={executor.submit(refresh_item,item):item for item in items}
        for future in as_completed(futures):
            item=futures[future]
            try:record=future.result();print('UPDATED',item['id'],record['views'],record['likes'],flush=True)
            except Exception as error:
                record=dict(known.get(item['id'],dict(videoId=item['id'],views=None,likes=None,comments=None,fetchedAt=None,source='youtube')),
                    status='stale' if known.get(item['id'],{}).get('fetchedAt') else 'unavailable',lastError=str(error),attemptedAt=attempted)
                print('FAILED',item['id'],str(error)[:180],flush=True)
            known[item['id']]=record
    records=[known.get(item['id'],dict(videoId=item['id'],views=None,likes=None,comments=None,fetchedAt=None,status='unavailable',source='youtube')) for item in archive]
    aggregate=totals(records)
    output=dict(version=1,attemptedAt=attempted,completedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
        timezone='Asia/Taipei',videos=records,totals=aggregate)
    atomic_write(args.output,output)
    day=dt.datetime.now(ZoneInfo('Asia/Taipei')).date().isoformat()
    history_path=args.output.with_name('statistics-history.json')
    history=json.loads(history_path.read_text()) if history_path.exists() else dict(version=1,days=[])
    history['days']=[row for row in history['days'] if row['date']!=day]+[dict(date=day,**aggregate,recordedAt=output['completedAt'])]
    history['days'].sort(key=lambda row:row['date'])
    atomic_write(history_path,history)
    print('TOTAL',json.dumps(aggregate),flush=True)
    return 0 if aggregate['fresh']==len(records) else 1


if __name__=='__main__':raise SystemExit(main())

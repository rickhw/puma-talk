#!/usr/bin/env python3
"""Import YouTube metadata and subtitles into a static archive. No third-party Python dependencies."""
import argparse
import copy
import datetime as dt
import html
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import parse_qs, urlparse

from data_store import atomic_write, read_document

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / 'data/index.json'
CATEGORIES = ['人物與成長', '政治與公共事務', '社會與生活', '國際與安全', '文化與閱讀']
VIDEO_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')
LANGUAGES = ['zh-TW', 'zh-Hant', 'zh-HK', 'zh', 'zh-CN', 'zh-Hans', 'en']

def video_id(url):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port:
        raise ValueError('請提供 HTTPS YouTube 影片 URL')
    if parsed.hostname in ('youtu.be', 'www.youtu.be'):
        value = parsed.path.strip('/')
    elif parsed.hostname in ('youtube.com', 'www.youtube.com', 'm.youtube.com'):
        parts = parsed.path.strip('/').split('/')
        value = parse_qs(parsed.query).get('v', [''])[0] if parsed.path == '/watch' else parts[1] if len(parts) == 2 and parts[0] in ('live', 'shorts', 'embed') else ''
    else:
        raise ValueError('只接受 YouTube 或 youtu.be 的影片網址')
    if not VIDEO_ID.fullmatch(value):
        raise ValueError('YouTube 影片 ID 格式錯誤')
    return value

def parse_time(value):
    parts = value.replace(',', '.').split(':')
    if len(parts) not in (2,3):
        raise ValueError('字幕時間碼錯誤')
    result = 0.0
    for part in parts:
        result = result * 60 + float(part)
    if result < 0:
        raise ValueError('字幕時間碼錯誤')
    return result

def parse_subtitles(text):
    if len(text.encode('utf-8')) > 5_000_000:
        raise ValueError('字幕上限為 5 MB')
    lines = text.lstrip('\ufeff').replace('\r\n', '\n').replace('\r', '\n').split('\n')
    cues, index = [], 0
    pattern = re.compile(r'^\s*((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{1,3})')
    while index < len(lines):
        match = pattern.match(lines[index])
        index += 1
        if not match:
            continue
        start, end = parse_time(match[1]), parse_time(match[2])
        if end < start:
            raise ValueError('字幕結束時間早於開始時間')
        content = []
        while index < len(lines) and lines[index].strip():
            content.append(lines[index])
            index += 1
        body = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', '', ' '.join(content)))).strip()
        if not body:
            continue
        previous = cues[-1] if cues else None
        if previous and start < previous['end'] and previous['text'] == body:
            previous['end'] = max(previous['end'], end)
            continue
        if previous and start < previous['end'] and body.startswith(previous['text'] + ' '):
            body = body[len(previous['text']):].strip()
        cues.append({'start': start, 'end': end, 'text': body})
    if not cues:
        raise ValueError('找不到有效字幕，請提供 SRT 或 VTT 檔案')
    return sorted(cues, key=lambda cue: cue['start'])

def parse_youtube_json3(text):
    """Read source text events without WebVTT's repeated rolling display lines."""
    if len(text.encode('utf-8')) > 5_000_000:
        raise ValueError('字幕上限為 5 MB')
    payload = json.loads(text)
    cues = []
    for event in payload.get('events', []):
        body = ''.join(segment.get('utf8', '') for segment in event.get('segs', [])).strip()
        if not body:
            continue
        start, duration = event.get('tStartMs'), event.get('dDurationMs')
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
               for value in (start, duration)) or start < 0 or duration <= 0:
            raise ValueError('JSON3 字幕時間碼無效')
        start, end = start / 1000, (start + duration) / 1000
        if cues and start < cues[-1]['start']:
            raise ValueError('JSON3 字幕順序無效')
        if cues and start == cues[-1]['start']:
            cues[-1]['text'] += ' ' + body
            cues[-1]['end'] = max(cues[-1]['end'], end)
            continue
        if cues and cues[-1]['end'] > start:
            cues[-1]['end'] = start
        cues.append(dict(start=start, end=end, text=body))
    if not cues:
        raise ValueError('JSON3 沒有可用字幕')
    return cues

def read_archive(db):
    data = read_document(db)
    if data.get('version') != 1 or not isinstance(data.get('interviews'), list):
        raise ValueError('資料庫格式錯誤')
    return data

def import_record(data, info, args, cues=None, subtitle_status=None, provenance=None):
    vid = info.get('id')
    if not isinstance(vid, str) or not VIDEO_ID.fullmatch(vid):
        raise ValueError('中繼資料缺少有效影片 ID')
    previous = next((item for item in data['interviews'] if item['id'] == vid), None)
    # Re-imports preserve editorial and reviewed content unless explicitly replacing subtitles.
    item = copy.deepcopy(previous) if previous else {'id':vid, 'tags':[], 'transcript':[], 'transcriptStatus':'pending'}
    title = info.get('title')
    if not isinstance(title, str) or not title.strip():
        raise ValueError('影片缺少標題')
    raw_date = info.get('upload_date') or info.get('release_date')
    if raw_date:
        date = dt.datetime.strptime(raw_date, '%Y%m%d').date().isoformat()
    elif previous:
        date = previous['date']
    else:
        raise ValueError('影片缺少發布日期，請確認不是尚未播出的直播')
    item.update({
        'originalTitle':title,
        'channel':info.get('channel') or info.get('uploader') or (previous or {}).get('channel') or '頻道待確認',
        'date':date,
        'sourceUrl':f'https://www.youtube.com/watch?v={vid}',
        'metadataStatus':'imported',
    })
    item.setdefault('title', title)
    item.setdefault('referenceUrl', item['sourceUrl'])
    item.setdefault('description', '影片資料由原頻道匯入；主題與內容待編輯整理。')
    if args.category:
        item['category'] = args.category
    item.setdefault('category', '人物與成長')
    if args.tags is not None:
        item['tags'] = [value.strip() for value in args.tags.split(',') if value.strip()]
    if isinstance(info.get('duration'), (int, float)):
        item['duration'] = info['duration']
    if cues is not None:
        # Automated updates cannot silently replace a manually reviewed transcript.
        if item['transcriptStatus'] == 'reviewed' and not args.replace_transcript:
            print(f'{vid}: 保留已校對逐字稿', file=sys.stderr)
        else:
            item['transcript'] = cues
            item['transcriptStatus'] = subtitle_status or 'imported'
            item['transcriptSource'] = args.subtitle.name if args.subtitle else 'youtube-captions'
            if provenance is None and args.subtitle:
                provenance = dict(kind='provided-subtitle', importedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                                  inputSha256=hashlib.sha256(args.subtitle.read_bytes()).hexdigest())
            item['transcriptProvenance'] = provenance or dict(kind='youtube-auto' if subtitle_status == 'auto' else 'youtube-original')
            item.pop('transcriptReview', None)
    if previous:
        data['interviews'][data['interviews'].index(previous)] = item
    else:
        data['interviews'].append(item)
    data['interviews'].sort(key=lambda row: (row['date'], row['id']), reverse=True)
    data['updatedAt'] = dt.datetime.now(dt.timezone.utc).date().isoformat()
    return item

def run_ytdlp(arguments):
    executable = shutil.which('yt-dlp')
    if not executable:
        raise RuntimeError('找不到 yt-dlp；請先執行 python3 -m pip install -U "yt-dlp[default]"')
    result = subprocess.run([executable, '--no-warnings', '--socket-timeout', '20', '--retries', '1', *arguments], capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise RuntimeError('yt-dlp 無法取得資料：' + result.stderr[-1600:].strip())
    return result.stdout

def choose_language(info):
    for kind in ['subtitles', 'automatic_captions']:
        # Auto-translated tracks may have a matching label but a different source
        # language. In dubbed videos even an -orig track can belong to the dub.
        available = {key: formats for key, formats in (info.get(kind) or {}).items()
                     if not formats or any('tlang' not in parse_qs(urlparse(track.get('url', '')).query)
                                           for track in formats)}
        original_language = info.get('language')
        if kind == 'subtitles' and original_language:
            matching = next((key for key in available if key == original_language or key.split('-')[0] == original_language.split('-')[0]), None)
            if matching:
                return matching, 'imported', False
            continue
        # YouTube often lists translated zh tracks alongside an English -orig track.
        # Prefer source audio language; a translation is not a verbatim transcript.
        if kind == 'automatic_captions':
            originals = [key for key in available if key.endswith('-orig')]
            if original_language:
                originals = [key for key in originals
                             if key.split('-')[0] == original_language.split('-')[0]]
            if originals:
                preferred = next((key for language in LANGUAGES for key in originals if key.removesuffix('-orig') == language), originals[0])
                return preferred, 'auto', True
            if original_language:
                matching = next((key for key in available if key == original_language or key.split('-')[0] == original_language.split('-')[0]), None)
                if matching:
                    return matching, 'auto', True
                continue
        for language in LANGUAGES:
            if language in available:
                return language, 'auto' if kind == 'automatic_captions' else 'imported', kind == 'automatic_captions'
    return None

def import_url(url, args, data):
    vid = video_id(url)
    canonical = f'https://www.youtube.com/watch?v={vid}'
    info = json.loads(run_ytdlp(['--no-playlist', '--skip-download', '--dump-single-json', canonical]))
    if info.get('id') != vid:
        raise ValueError('影片資料與 URL 不一致')
    cues, status, provenance = None, None, None
    if args.subtitle:
        cues = parse_subtitles(args.subtitle.read_text(encoding='utf-8-sig'))
        status = 'imported'
    elif args.fetch_subtitles:
        choice = choose_language(info)
        if choice:
            language, status, automatic = choice
            with tempfile.TemporaryDirectory(prefix='puma-captions-') as directory:
                try:
                    run_ytdlp(['--no-playlist', '--skip-download', '--write-auto-subs' if automatic else '--write-subs', '--sub-langs', language, '--sub-format', 'vtt', '-o', str(Path(directory) / '%(id)s.%(ext)s'), canonical])
                    candidates = list(Path(directory).glob('*.vtt'))
                    if candidates:
                        cues = parse_subtitles(candidates[0].read_text(encoding='utf-8-sig'))
                        artifact_dir = ROOT / '.cache/captions' / vid / dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
                        artifact_dir.mkdir(parents=True, exist_ok=False)
                        shutil.copyfile(candidates[0], artifact_dir / candidates[0].name)
                        provenance = dict(kind='youtube-auto' if automatic else 'youtube-original',
                                          language=language.removesuffix('-orig'),
                                          importedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                                          inputSha256=hashlib.sha256(candidates[0].read_bytes()).hexdigest())
                    else:
                        print(f'{vid}: 未下載到字幕，保留原有逐字稿或標為待整理', file=sys.stderr)
                except (RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
                    print(f'{vid}: 字幕下載失敗，仍匯入影片資料。{error}', file=sys.stderr)
        else:
            print(f'{vid}: 無可用字幕，保留原有逐字稿或標為待整理', file=sys.stderr)
    return import_record(data, info, args, cues, status, provenance)

def refresh(args, data):
    config = json.loads((ROOT / 'data/sources.json').read_text(encoding='utf-8'))
    if not config.get('enabled') or not config.get('urls'):
        print('排程來源尚未啟用，沒有變更。請先設定 data/sources.json。')
        return []
    changed, seen, failures = [], set(), 0
    for url in config['urls']:
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.hostname not in ('youtube.com','www.youtube.com') or parsed.username or parsed.password or parsed.port:
            raise ValueError('排程來源只接受 HTTPS YouTube 頻道或播放清單')
        listing = json.loads(run_ytdlp(['--flat-playlist', '--playlist-end', str(max(1,min(50,int(config.get('limit',15))))), '--dump-single-json', url]))
        for entry in listing.get('entries') or []:
            if not entry:
                continue
            title, vid = entry.get('title') or '', entry.get('id') or ''
            if not VIDEO_ID.fullmatch(vid) or vid in seen or not any(word.casefold() in title.casefold() for word in config.get('keywords', ['沈伯洋'])):
                continue
            seen.add(vid)
            if any(item['id'] == vid for item in data['interviews']):
                continue
            try:
                changed.append(import_url(f'https://www.youtube.com/watch?v={vid}', args, data))
            except (ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
                print(f'{vid}: 匯入失敗：{error}', file=sys.stderr)
                failures += 1
    if failures:
        raise RuntimeError(f'{failures} 場影片匯入失敗，本次不寫入資料庫；請檢查後重試')
    return changed

def main():
    parser = argparse.ArgumentParser(description='將 YouTube 專訪中繼資料與字幕匯入靜態資料庫；預設只匯入 metadata，不下載字幕。')
    parser.add_argument('url', nargs='?', help='YouTube 影片 URL')
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    parser.add_argument('--info-json', type=Path, help='使用先前由 yt-dlp 匯出的 info JSON，可離線執行')
    parser.add_argument('--subtitle', type=Path, help='匯入有權使用的 SRT/VTT 檔案')
    parser.add_argument('--fetch-subtitles', action='store_true', help='下載原頻道可用字幕；請先確認公開使用授權')
    parser.add_argument('--replace-transcript', action='store_true', help='明確允許替換已校對逐字稿')
    parser.add_argument('--category', choices=CATEGORIES)
    parser.add_argument('--tags', help='以逗號分隔的標籤')
    parser.add_argument('--refresh', action='store_true', help='從 data/sources.json 取得新影片')
    args = parser.parse_args()
    if args.refresh and (args.url or args.info_json or args.subtitle):
        parser.error('--refresh 不能與影片 URL、--info-json 或 --subtitle 同時使用')
    if not args.refresh and not args.url and not args.info_json:
        parser.error('請提供 YouTube URL、--info-json 或 --refresh')
    if args.url and args.info_json:
        parser.error('影片 URL 與 --info-json 請擇一使用')
    try:
        data = read_archive(args.db)
        if args.refresh:
            changed = refresh(args, data)
        elif args.info_json:
            info = json.loads(args.info_json.read_text(encoding='utf-8'))
            cues = parse_subtitles(args.subtitle.read_text(encoding='utf-8-sig')) if args.subtitle else None
            changed = [import_record(data, info, args, cues)]
        else:
            changed = [import_url(args.url, args, data)]
        if changed:
            atomic_write(args.db, data)
            for item in changed:
                print(f'已匯入：{item["title"]}（{item["id"]}），字幕 {len(item["transcript"])} 段 / {item["transcriptStatus"]}')
    except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(f'匯入失敗：{error}', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())

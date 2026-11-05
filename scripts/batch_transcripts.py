#!/usr/bin/env python3
"""Resume a reviewed catalog: original captions first, then local ASR drafts."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import json
import math
import os
from pathlib import Path
import re
import subprocess
import time

import import_youtube as importer
import transcripts

ROOT = importer.ROOT


def command(arguments, log, timeout=900):
    with log.open('w') as stream:
        result = subprocess.run(arguments, stdout=stream, stderr=subprocess.STDOUT, timeout=timeout)
    if result.returncode:
        raise RuntimeError(log.read_text()[-1800:])


def fetch_media(row, work):
    folder = work / row['id']
    folder.mkdir(parents=True, exist_ok=True)
    info_path = ROOT / row['metadataFile']
    if not info_path.exists() or time.time()-info_path.stat().st_mtime > 4*3600:
        # Media URLs expire; a catalog remains usable after local caches expire
        # or when checked out on another machine.
        info_path.parent.mkdir(parents=True,exist_ok=True)
        importer.atomic_write(info_path,json.loads(importer.run_ytdlp([
            '--no-playlist','--skip-download','--dump-single-json',
            f'https://www.youtube.com/watch?v={row["id"]}'])))
    info = json.loads(info_path.read_text())
    if info.get('id') != row['id']:
        raise ValueError('影片 ID 與中繼資料不一致')
    language = row.get('spokenLanguage') or info.get('language') or 'zh'
    # Catalog overrides are explicit editorial decisions, e.g. an English
    # interview whose upload metadata incorrectly says zh-Hant.
    selection_info = dict(info, language=language)
    choice = importer.choose_language(selection_info)
    subtitle_error = None
    if choice:
        subtitle_language, status, automatic = choice
        extension = 'json3' if automatic else 'vtt'
        subtitle = folder / f'{row["id"]}.{subtitle_language}.{extension}'
        try:
            if not subtitle.exists():
                command(['yt-dlp', '--load-info-json', str(info_path), '--skip-download',
                    '--write-auto-subs' if automatic else '--write-subs', '--sub-langs', subtitle_language,
                    '--sub-format', extension, '--socket-timeout', '20', '--retries', '1', '--no-progress',
                    '-o', str(folder/'%(id)s.%(ext)s')], folder/'subtitle-download.log', 180)
            parse = importer.parse_youtube_json3 if automatic else importer.parse_subtitles
            cues = transcripts.validate_cues(parse(subtitle.read_text(encoding='utf-8-sig')))
            provenance = dict(kind='youtube-auto' if automatic else 'youtube-original',
                language=subtitle_language.removesuffix('-orig'), importedAt=transcripts.now(),
                inputSha256=transcripts.checksum(subtitle), format=extension)
            return dict(row=row, info=info, cues=cues, status=status, provenance=provenance, folder=folder)
        except (RuntimeError, ValueError, OSError, subprocess.TimeoutExpired) as error:
            subtitle_error = str(error)

    audio_formats = [f for f in info.get('formats', []) if f.get('vcodec') == 'none' and f.get('acodec') not in (None, 'none')]
    languages = {f.get('language') for f in audio_formats if f.get('language')}
    base_language = language.split('-')[0]
    if languages and not any(value.split('-')[0] == base_language for value in languages):
        raise ValueError(f'找不到原音 {language} 音軌；可用語言：{sorted(languages)}')
    selector = f'bestaudio[language^={base_language}]' if languages else 'bestaudio'
    if not any(folder.glob('audio.*')) or not (folder/'audio-ready.json').exists():
        command(['yt-dlp', '--load-info-json', str(info_path), '--no-playlist', '--socket-timeout', '20',
                 '--retries', '2', '--no-progress', '-f', selector, '-o', str(folder/'audio.%(ext)s')],
                folder/'audio-download.log')
        candidates = [p for p in folder.glob('audio.*') if p.suffix in ('.webm', '.m4a', '.mp3', '.ogg', '.opus')]
        if len(candidates) != 1:
            raise ValueError('下載音檔數量不正確')
        probe = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type',
                               '-of','json',str(candidates[0])], capture_output=True,text=True,check=True)
        media = json.loads(probe.stdout)
        duration = float(media['format']['duration'])
        if abs(duration-info['duration']) > 3 or any(s['codec_type'] != 'audio' for s in media['streams']):
            raise ValueError('音檔串流或片長與影片不一致')
        importer.atomic_write(folder/'audio-ready.json',dict(path=candidates[0].name,duration=duration,
            language=language,selector=selector,subtitleError=subtitle_error))
    ready = json.loads((folder/'audio-ready.json').read_text())
    return dict(row=row,info=info,audio=folder/ready['path'],duration=ready['duration'],
                language=language.split('-')[0],folder=folder,subtitleError=subtitle_error)


def prepare_asr_cues(raw, duration, silence_intervals=()):
    """Keep uncertain regions explicit; preserve untouched raw output separately."""
    groups = []
    for index, segment in enumerate(raw.get('segments', [])):
        seek = segment.get('seek', index*3000)
        if not groups or groups[-1][0] != seek:
            groups.append((seek, []))
        groups[-1][1].append(segment)
    cues, notes = [], []
    for position, (seek, segments) in enumerate(groups):
        spoken = [s for s in segments if isinstance(s.get('text'), str) and s['text'].strip()]
        if not spoken:
            continue
        invalid = any(any(not isinstance(s.get(k), (int,float)) or not math.isfinite(s[k]) for k in ('start','end'))
                      or s['start'] < 0 or s['start'] >= duration or s['end'] <= s['start'] or s['end'] > duration+2
                      or not math.isfinite(s.get('avg_logprob',0)) for s in spoken)
        if invalid:
            start = max(0, seek/100)
            next_start = groups[position+1][0]/100 if position+1 < len(groups) else duration
            end = min(duration, next_start if next_start > start else start+30)
            notes.append(dict(kind='invalid-decoder-window',start=start,end=end,seek=seek))
            if end > start:
                cues.append(dict(start=start,end=end,text='［本段辨識或時間碼異常，待人工對照原音］'))
            continue
        for segment in spoken:
            cue = dict(start=segment['start'],end=min(segment['end'],duration),text=segment['text'].strip())
            silence = next(((start,end) for start,end in silence_intervals
                            if cue['start'] >= start and cue['end'] <= end),None)
            if silence:
                notes.append(dict(kind='text-inside-silence',start=cue['start'],end=cue['end']))
                cue['text'] = '［靜音區段的辨識文字不可靠，待人工確認］'
            cues.append(cue)
    cues.sort(key=lambda cue:cue['start'])
    return transcripts.validate_cues(cues), notes


def local_asr(media, item, model):
    folder = media['folder']
    draft_path = folder/'asr/draft.json'
    if draft_path.exists():
        draft = json.loads(draft_path.read_text())
        if draft['provenance']['model'] != model or draft['provenance']['inputSha256'] != transcripts.checksum(media['audio']):
            raise ValueError('既有工作稿的音檔或模型不同，請使用新的工作目錄')
        return draft['transcript'], draft['provenance']
    digest = transcripts.checksum(media['audio'])
    raw_path, provenance_path = folder/'engine-output.json', folder/'asr-provenance.json'
    if raw_path.exists() != provenance_path.exists():
        raise ValueError('引擎輸出與來源紀錄不完整；保留現有檔案，請檢查後另建工作目錄')
    started = time.monotonic()
    if raw_path.exists() and provenance_path.exists():
        provenance = json.loads(provenance_path.read_text())
        if provenance['inputSha256'] != digest or provenance['model'] != model:
            raise ValueError('既有引擎輸出的音檔或模型不同，請使用新的工作目錄')
        raw = json.loads(raw_path.read_text())
    else:
        print(f'ASR {item["id"]} {media["duration"]:.1f}s',flush=True)
        raw, version = transcripts.run_asr(media['audio'],'mlx',model,media['language'])
        importer.atomic_write(raw_path,raw)
        provenance = dict(kind='asr-local',engine='mlx',engineVersion=version,model=model,
            language=media['language'],generatedAt=transcripts.now(),inputSha256=digest,
            audioSelector=json.loads((folder/'audio-ready.json').read_text())['selector'],
            decodingOptions=dict(task='transcribe',condition_on_previous_text=False))
        revision = ROOT/'.models/huggingface/hub'/('models--'+model.replace('/','--'))/'refs/main'
        if revision.exists(): provenance['modelRevision'] = revision.read_text().strip()
        importer.atomic_write(provenance_path,provenance)
    if transcripts.checksum(media['audio']) != digest:
        raise ValueError('轉錄期間音檔已改變')
    silence_log = folder/'silence-detection.log'
    if not silence_log.exists():
        command(['ffmpeg','-hide_banner','-nostdin','-i',str(media['audio']),
                 '-af','silencedetect=noise=-40dB:d=5','-f','null','-'],silence_log)
    text = silence_log.read_text()
    starts = re.findall(r'silence_start: ([0-9.]+)',text)
    ends = re.findall(r'silence_end: ([0-9.]+)',text)
    intervals = [(float(start),float(end)) for start,end in zip(starts,ends)]
    cues, notes = prepare_asr_cues(raw,media['duration'],intervals)
    if notes:
        provenance['processingNotes'] = [f'{len(notes)} 筆時間碼或靜音辨識異常已標為待人工確認；詳見本機 normalization.json，原引擎輸出保留。']
    importer.atomic_write(folder/'normalization.json',notes)
    importer.atomic_write(folder/'asr-run.json',dict(elapsedSeconds=round(time.monotonic()-started,2),
        audioDuration=media['duration'],segments=len(cues),annotations=len(notes)))
    transcripts.write_artifacts(folder/'asr',item,cues,provenance)
    return cues, provenance


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog',type=Path,default=ROOT/'data/catalog.json')
    parser.add_argument('--db',type=Path,default=importer.DEFAULT_DB)
    parser.add_argument('--year',type=int,default=dt.date.today().year)
    parser.add_argument('--all-years',action='store_true',help='指定年份優先，再處理其他年份')
    parser.add_argument('--workers',type=int,default=2)
    parser.add_argument('--model',default='mlx-community/whisper-large-v3-turbo')
    parser.add_argument('--work-dir',type=Path,default=ROOT/'.cache/catalog-transcripts-20261104')
    args=parser.parse_args(argv)
    os.environ.setdefault('HF_HOME',str(ROOT/'.models/huggingface'))
    args.work_dir.mkdir(parents=True,exist_ok=True)
    catalog=json.loads(args.catalog.read_text())
    rows=[row for row in catalog['candidates'] if row.get('decision')=='include'
          and (args.all_years or row.get('uploadDate','').startswith(str(args.year)))]
    rows.sort(key=lambda row:(row.get('uploadDate','').startswith(str(args.year)),row.get('uploadDate','')),reverse=True)
    data=importer.read_archive(args.db)
    existing={item['id'] for item in data['interviews'] if item['transcript']}
    rows=[row for row in rows if row['id'] not in existing]
    results=[]
    print(f'QUEUE {len(rows)} interviews; priority year {args.year}',flush=True)
    with ThreadPoolExecutor(max_workers=max(1,min(3,args.workers))) as pool:
        # Submit all download jobs in year/date order; inference and archive writes
        # stay serial while at most three network workers prepare subsequent audio.
        futures=[(row,pool.submit(fetch_media,row,args.work_dir)) for row in rows]
        for row,future in futures:
            started=time.monotonic()
            result=dict(id=row['id'],title=row['title'])
            try:
                media=future.result()
                data=importer.read_archive(args.db)
                import_args=argparse.Namespace(category=row.get('category'),tags=','.join(row.get('tags',[])),subtitle=None,replace_transcript=False)
                item=importer.import_record(data,media['info'],import_args)
                item['referenceUrl']=row['referenceUrl']
                item['title']=row.get('displayTitle') or row['title']
                item['description']=row.get('description') or '原頻道訪談；逐字稿為待校對工作稿，請搭配原始影片閱讀。'
                if 'cues' in media:
                    cues,provenance,status=media['cues'],media['provenance'],media['status']
                else:
                    cues,provenance=local_asr(media,item,args.model)
                    status='auto'
                item.update(transcript=cues,transcriptStatus=status,
                    transcriptSource='local-asr' if provenance['kind']=='asr-local' else 'youtube-captions',
                    transcriptProvenance=provenance)
                item.pop('transcriptReview',None)
                importer.atomic_write(args.db,data)
                review=media['folder']/'review'
                if not review.exists(): transcripts.write_artifacts(review,item,cues,provenance)
                result.update(outcome='imported',segments=len(cues),source=provenance['kind'],status=status,
                    qualityWarnings=len(transcripts.quality_report(cues,item.get('duration'))['warnings']))
            except Exception as error:
                result.update(outcome='failed',error=str(error))
            result['elapsedSeconds']=round(time.monotonic()-started,2)
            results.append(result)
            importer.atomic_write(args.work_dir/'results.json',results)
            print(json.dumps(result,ensure_ascii=False),flush=True)
    return int(any(row['outcome']=='failed' for row in results))


if __name__=='__main__':
    raise SystemExit(main())

#!/usr/bin/env python3
"""Local ASR drafts, subtitle application, and explicit human-review records."""
import argparse
import copy
import datetime as dt
import hashlib
import importlib.metadata
import importlib.util
import json
import math
from pathlib import Path
import platform
import shutil
import sys

from import_youtube import DEFAULT_DB, ROOT, VIDEO_ID, atomic_write, parse_subtitles, read_archive


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='microseconds')


def checksum(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def get_item(data, vid):
    if not VIDEO_ID.fullmatch(vid):
        raise ValueError('影片 ID 必須為 11 位英數字、底線或連字號')
    item = next((item for item in data['interviews'] if item['id'] == vid), None)
    if not item:
        raise ValueError('請先透過 import_youtube.py 收錄此影片的中繼資料')
    return item


def validate_cues(cues):
    if not isinstance(cues, list) or not cues:
        raise ValueError('逐字稿不能為空')
    cleaned, previous = [], -1
    for cue in cues:
        if not isinstance(cue, dict):
            raise ValueError('逐字稿段落必須為物件')
        start, end, text = cue.get('start'), cue.get('end'), cue.get('text')
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (start, end)):
            raise ValueError('逐字稿時間碼必須為有限數值')
        if start < 0 or end <= start or start < previous or not isinstance(text, str) or not text.strip():
            raise ValueError('逐字稿時間碼、順序或文字無效')
        cleaned.append(dict(start=start, end=end, text=text.strip()))
        previous = start
    return cleaned


def timestamp(seconds, separator=','):
    milliseconds = round(seconds * 1000)
    hours, rest = divmod(milliseconds, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    seconds, milliseconds = divmod(rest, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02}{separator}{milliseconds:03}'


def to_srt(cues):
    return '\n\n'.join(f'{index}\n{timestamp(cue["start"])} --> {timestamp(cue["end"])}\n{cue["text"]}' for index, cue in enumerate(cues, 1)) + '\n'


def quality_report(cues, duration=None):
    warnings = []
    for index, cue in enumerate(cues):
        reasons = []
        if cue['end'] - cue['start'] > 30:
            reasons.append('段落超過 30 秒，請核對時間碼與斷句')
        if index and cue['start'] < cues[index-1]['end']:
            reasons.append('與前段時間重疊，請搭配原音確認')
        if index and cue['text'] == cues[index-1]['text']:
            reasons.append('與前段文字相同，確認是重複發言還是辨識重複')
        if isinstance(duration, (int, float)) and cue['end'] > duration + 2:
            reasons.append('時間碼超出已知影片長度')
        if reasons:
            warnings.append(dict(segment=index+1, start=cue['start'], reasons=reasons))
    return dict(segments=len(cues), lastEnd=cues[-1]['end'], warnings=warnings,
                note='這是機械檢查，不代表辨識正確率、語音覆蓋完整性或事實查核。')


def write_artifacts(directory, item, cues, provenance, raw=None, *, exist_ok=False):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=exist_ok)
    atomic_write(directory/'draft.json', dict(version=1, videoId=item['id'], provenance=provenance, transcript=cues))
    (directory/'subtitles.srt').write_text(to_srt(cues), encoding='utf-8')
    atomic_write(directory/'quality.json', quality_report(cues, item.get('duration')))
    if raw is not None:
        atomic_write(directory/'engine-output.json', raw)
    lines = [f'# 校對工作稿：{item["title"]}', '', f'來源：{item["sourceUrl"]}', '',
             '狀態：待人工校對。此工作稿不代表已完成的逐字稿。', '',
             '先核對音檔與此影片相同，再檢查漏字、否定詞、人名、數字、台語與中英混用。',
             '辨識不清請註記［聽不清楚］；不要推測說話者身分或用摘要替換原話。',
             '請編輯 subtitles.srt；此 Markdown 僅為聆聽索引。', '']
    for cue in cues:
        lines += [f'[{timestamp(cue["start"], ".")}]({item["sourceUrl"]}&t={int(cue["start"])}s)', '', cue['text'], '']
    (directory/'review.md').write_text('\n'.join(lines), encoding='utf-8')
    return directory


def run_asr(audio, engine, model, language):
    if engine == 'mlx':
        if platform.system() != 'Darwin' or platform.machine() != 'arm64':
            raise ValueError('mlx 引擎用於 Apple Silicon macOS；其他平台請選 faster-whisper')
        try:
            import mlx_whisper
        except ImportError as error:
            raise RuntimeError('尚未安裝 mlx-whisper；請在專案虛擬環境安裝，詳見 docs/transcripts.md') from error
        result = mlx_whisper.transcribe(str(audio), path_or_hf_repo=model, language=language,
                                        task='transcribe', verbose=False, condition_on_previous_text=False)
        return result, importlib.metadata.version('mlx-whisper')
    try:
        from faster_whisper import WhisperModel
    except ImportError as error:
        raise RuntimeError('尚未安裝 faster-whisper；請在專案虛擬環境安裝，詳見 docs/transcripts.md') from error
    recognizer = WhisperModel(model, device='cpu', compute_type='int8')
    segments, info = recognizer.transcribe(str(audio), language=language, task='transcribe',
                                           vad_filter=True, condition_on_previous_text=False)
    result = dict(language=info.language, segments=[dict(start=s.start, end=s.end, text=s.text,
                   avg_logprob=s.avg_logprob, no_speech_prob=s.no_speech_prob) for s in segments])
    return result, importlib.metadata.version('faster-whisper')


def transcribe(args, data):
    item = get_item(data, args.video_id)
    if not args.audio.is_file():
        raise ValueError('找不到本機音檔')
    if args.output_dir and args.output_dir.exists():
        raise ValueError('輸出目錄已存在，請使用新目錄以保留原始工作稿')
    model = args.model or ('mlx-community/whisper-small-mlx' if args.engine == 'mlx' else 'small')
    # A digest before/after detects accidental input replacement during a long ASR job.
    digest = checksum(args.audio)
    raw, version = run_asr(args.audio, args.engine, model, args.language)
    directory = args.output_dir or ROOT/'.cache/transcripts'/item['id']/dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    directory.mkdir(parents=True, exist_ok=False)
    # Retain expensive inference output even when malformed timestamps prevent
    # importing a draft; never weaken the website's timestamp validation.
    atomic_write(directory/'engine-output.json', raw)
    try:
        cues = validate_cues(raw.get('segments'))
        if checksum(args.audio) != digest:
            raise ValueError('轉錄期間音檔已被修改，請重新執行')
    except ValueError as error:
        atomic_write(directory/'failure.json', dict(error=str(error), model=model,
                     engine=args.engine, engineVersion=version, language=args.language,
                     generatedAt=now(), inputSha256=digest))
        raise ValueError(f'{error}；原始引擎輸出已保留：{directory}') from error
    provenance = dict(kind='asr-local', engine=args.engine, engineVersion=version, model=model,
                      language=args.language, generatedAt=now(), inputSha256=digest)
    write_artifacts(directory, item, cues, provenance, exist_ok=True)
    print(f'已產生 {len(cues)} 段待校對工作稿：{directory}\n尚未修改網站資料。請先核對音檔對應與辨識內容。')


def apply_draft(args, data):
    draft = json.loads(args.draft.read_text(encoding='utf-8'))
    if draft.get('version') != 1:
        raise ValueError('工作稿版本錯誤')
    item = get_item(data, draft.get('videoId', ''))
    if item['transcriptStatus'] == 'reviewed':
        raise ValueError('不覆蓋已校對逐字稿；若要更新，請人工核對後使用 review 指令')
    provenance = draft.get('provenance')
    if not isinstance(provenance, dict) or provenance.get('kind') != 'asr-local':
        raise ValueError('apply 僅接受本機轉錄工作稿')
    cues = validate_cues(draft.get('transcript'))
    item.update(transcript=cues, transcriptStatus='auto', transcriptSource='local-asr',
                transcriptProvenance=copy.deepcopy(provenance))
    item.pop('transcriptReview', None)
    data['updatedAt'] = dt.datetime.now(dt.timezone.utc).date().isoformat()
    atomic_write(args.db, data)
    print(f'已套用 {item["id"]} 工作稿，網站狀態為「自動字幕・待校對」。')


def review(args, data):
    item = get_item(data, args.video_id)
    if not args.reviewer.strip():
        raise ValueError('請填入校對者顯示名稱')
    if not item['transcript']:
        raise ValueError('請先匯入原始字幕或套用工作稿，保留來源紀錄後再校對')
    cues = validate_cues(parse_subtitles(args.subtitle.read_text(encoding='utf-8-sig')))
    # Retain the previous state locally before replacing a transcript, including reviewed versions.
    backup = ROOT/'.cache/transcript-history'/item['id']/dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')/'record.json'
    atomic_write(backup, item)
    old_digest = hashlib.sha256(json.dumps(item['transcript'], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    item['transcriptReview'] = dict(reviewer=args.reviewer.strip(), reviewedAt=now(), note=args.note or '',
                                    subtitleSha256=checksum(args.subtitle), previousTranscriptSha256=old_digest)
    item['transcript'] = cues
    item['transcriptStatus'] = 'reviewed'
    data['updatedAt'] = dt.datetime.now(dt.timezone.utc).date().isoformat()
    atomic_write(args.db, data)
    print(f'已記錄 {item["id"]} 的人工校對：{args.reviewer.strip()}。原版本已保留於 .cache/transcript-history。')


def report(data):
    counts = {}
    for item in data['interviews']:
        state = item['transcriptStatus']
        counts[state] = counts.get(state, 0) + 1
        label = '缺字幕，先嘗試原頻道字幕，再考慮 ASR' if state == 'pending' else '已校對' if state == 'reviewed' else '待人工聆聽校對'
        print(f'{item["id"]}  {state:8}  {label}  {item["title"]}')
    print('\n統計：' + json.dumps(counts, ensure_ascii=False))


def doctor():
    result = dict(platform=platform.system(), architecture=platform.machine(),
                  ffmpeg=bool(shutil.which('ffmpeg')), yt_dlp=bool(shutil.which('yt-dlp')),
                  mlx_whisper=bool(importlib.util.find_spec('mlx_whisper')),
                  faster_whisper=bool(importlib.util.find_spec('faster_whisper')))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print('此檢查不下載模型、不呼叫付費 API，也不保證模型記憶體足夠或轉錄品質。')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('doctor', help='檢查本機工具，不安裝或下載')
    commands.add_parser('report', help='列出逐字稿待辦與狀態')
    trans = commands.add_parser('transcribe', help='將本機音檔轉為工作稿；不修改網站資料')
    trans.add_argument('video_id')
    trans.add_argument('--audio', type=Path, required=True)
    trans.add_argument('--engine', choices=['mlx', 'faster-whisper'], default='mlx')
    trans.add_argument('--model', help='引擎支援的模型名稱或本機模型路徑；首次使用遠端名稱會下載模型')
    trans.add_argument('--language', default='zh', help='原音語言，例如 zh 或 en；不會翻譯')
    trans.add_argument('--output-dir', type=Path, help='必須是尚不存在的目錄，避免覆蓋原始產物')
    apply = commands.add_parser('apply', help='將 ASR 工作稿套用為待校對字幕')
    apply.add_argument('--draft', type=Path, required=True)
    rev = commands.add_parser('review', help='人工聆聽校對完成後，記錄校對版')
    rev.add_argument('video_id')
    rev.add_argument('--subtitle', type=Path, required=True)
    rev.add_argument('--reviewer', required=True, help='網站會顯示的校對者名稱；可以使用暱稱')
    rev.add_argument('--note', help='校對範圍與註記，勿填敏感個資')
    args = parser.parse_args(argv)
    try:
        if args.command == 'doctor':
            doctor()
        else:
            data = read_archive(args.db)
            dict(transcribe=transcribe, apply=apply_draft, review=review, report=lambda args, data: report(data))[args.command](args, data)
    except (ValueError, RuntimeError, OSError, TypeError) as error:
        print(f'逐字稿處理失敗：{error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
"""Validate AI keyword grounding and apply conservative transcript display rules."""
import argparse
import datetime as dt
import hashlib
import json
import re
from import_youtube import ROOT,atomic_write,read_archive
from summarize_articles import transcript_fingerprint
from refine_transcripts import safe_corrections,replace_phrase
from extract_keywords import ALIASES,context_for
from traditional import TraditionalNormalizer


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mark-unclear',action='append',default=[],help='VIDEO_ID:起始秒數；需經來源檢視後明確指定')
    args=parser.parse_args()
    converter=TraditionalNormalizer()
    source={x['id']:x for x in read_archive(ROOT/'data/interviews.json')['interviews']}
    articles={x['videoId']:x for x in json.loads((ROOT/'data/articles.json').read_text())['articles']}
    path=ROOT/'data/editorial.json';manifest=json.loads(path.read_text())
    if {x['videoId'] for x in manifest['records']}!=set(source):raise ValueError('校對資料未覆蓋所有專訪')
    unclear={}
    for value in args.mark_unclear:
        vid,seconds=value.rsplit(':',1);unclear[vid]=float(seconds)
        if vid not in source or not 0<=unclear[vid]<source[vid]['transcript'][-1]['end']:raise ValueError('辨識不清範圍無效')
    for row in manifest['records']:
        item=source[row['videoId']]
        if row['sourceSha256']!=transcript_fingerprint(item['transcript']):raise ValueError('逐字稿來源已改變')
        context=context_for(articles[row['videoId']])
        if row['review'].get('keywordSelection')!='article-grounded' or row['review'].get('keywordInputSha256')!=hashlib.sha256(context.encode()).hexdigest():raise ValueError('關鍵字來源未完成核對')
        text=re.sub(r'\s+','',converter.convert(context)).casefold()
        row['keywords']=list(dict.fromkeys(converter.convert(tag) for tag in row['keywords']))
        for tag in row['keywords']:
            origins=[tag]+[alias for alias,canonical in ALIASES.items() if canonical==tag]
            if not any(re.sub(r'\s+','',converter.convert(term)).casefold() in text for term in origins):raise ValueError(f'{row["videoId"]} 關鍵字無來源：{tag}')
        if not 5<=len(row['keywords'])<=10:raise ValueError('關鍵字數量無效')
        if row['review']['method']=='ai-proofread':
            candidates=[dict(zip(('from','to'),(pair['before'],pair['after']))) for pair in row['review']['appliedCorrections']]
            raw=' '.join(converter.convert(c['text']) for c in item['transcript'])
            accepted,rejected=safe_corrections(candidates,raw,converter)
            accepted=list({(pair['before'],pair['after']):pair for pair in accepted}.values())
            row['transcript']=[]
            for cue in item['transcript']:
                value=converter.convert(cue['text'])
                for pair in accepted:value=replace_phrase(value,pair['before'],pair['after'])
                if value.startswith(('［本段辨識','［靜音區段','［片頭靜音','［片尾辨識')):value='［此段音訊辨識不清，請對照原片］'
                row['transcript'].append(dict(start=cue['start'],end=cue['end'],text=value))
            row['review']['appliedCorrections']=accepted
            row['review']['rejectedCorrections']+=rejected
        else:
            for cue in row['transcript']:cue['text']=converter.convert(cue['text']).replace('藍鳥運動','青鳥運動')
        if row['videoId'] in unclear:
            start=unclear[row['videoId']]
            for cue in row['transcript']:
                if cue['start']>=start:cue['text']='［此段原字幕辨識不清，請對照原始影片］'
            row['review']['unclearRanges']=[dict(start=start,end=item['transcript'][-1]['end'],reason='檢視原字幕後確認無法可靠還原後續發言，保留時間範圍而不猜譯。')]
        row['review']['converter']='opencc-python-reimplemented 0.1.7 / t2s → s2tw (mixed-script normalization)'
    manifest['updatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    atomic_write(path,manifest)
    print('Validated',len(manifest['records']),'AI transcript displays; original archive unchanged.')


if __name__=='__main__':main()

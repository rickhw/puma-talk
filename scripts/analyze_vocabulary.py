#!/usr/bin/env python3
"""Count reproducible phrase occurrences in original Chinese transcript text."""
import argparse
import bisect
import collections
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import statistics
import subprocess

from data_store import read_document

ROOT = Path(__file__).resolve().parent.parent
PHRASE_CONFIG=json.loads((ROOT/'data/common-phrases.json').read_text(encoding='utf-8'))
ORAL_PHRASES=tuple(PHRASE_CONFIG['phrases'])
TOPIC_PHRASES = (
    '台北', '台灣', '中國', '問題', '重要', '解決', '城市', '市政', '市長',
    '市民', '政策', '政府', '國家', '研究', '社會', '世界', '國際', '交通',
    '都更', '空間', '居住', '社區', '人才', '文化', '教育', '小孩', '孩子',
    '女兒', '家庭', '收養', '陪伴', '運動', '安全', '風險', '民主', '自由',
    '制度', '資訊', '認知作戰', '民防', '國防', '統戰', '犯罪', '犯罪學',
    '心理', '溝通', '理解', '分析', '選擇', '數據', '智庫', '希望', '洋流',
)
EXCLUSIONS=PHRASE_CONFIG['excludedVideoIds']
NOTES = re.compile(r'\[[^\]]*\]|［[^］]*］|【[^】]*】')
HAN = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')
HAN_SPACES = re.compile(r'(?<=[\u3400-\u4dbf\u4e00-\u9fff])\s+(?=[\u3400-\u4dbf\u4e00-\u9fff])')


def normalizer():
    from opencc import OpenCC
    converter = OpenCC('s2t')
    return lambda value: HAN_SPACES.sub('', converter.convert(NOTES.sub('', value)).replace('臺', '台').replace('爲', '為'))


def assemble(cues, normalize, max_gap=1.5):
    """Join subtitle line wraps, retaining sentence/long-gap boundaries and cue offsets."""
    chunks, spans, offset, previous = [], [], 0, None
    for cue in cues:
        text = normalize(cue['text']).strip()
        if not text:
            # An omitted/unreliable range is a boundary, not a word-joining opportunity.
            previous = None
            continue
        if chunks:
            adjacent = previous and cue['start'] - previous['end'] <= max_gap
            chinese_join = adjacent and HAN.search(chunks[-1][-1:]) and HAN.match(text[:1])
            separator = '' if chinese_join else '\n'
            chunks.append(separator)
            offset += len(separator)
        spans.append(dict(offset=offset, endOffset=offset+len(text), start=cue['start'], end=cue['end']))
        chunks.append(text)
        offset += len(text)
        previous = cue
    return ''.join(chunks), spans


def term_pattern(term):
    escaped = re.escape(term)
    if re.search(r'[A-Za-z]', term):
        escaped = r'(?<![A-Za-z0-9_])' + escaped + r'(?![A-Za-z0-9_])'
    return re.compile(escaped, re.IGNORECASE)


def make_documents(archive, normalize):
    docs, excluded = [], []
    for row in archive:
        language = row.get('transcriptProvenance', {}).get('language', '')
        reason = None
        if not row['transcript']:
            reason = '無原始逐字稿／音樂作品資訊'
        elif row['id'] in EXCLUSIONS:
            reason = EXCLUSIONS[row['id']]
        elif language.split('-')[0] != 'zh' or len(row.get('transcriptProvenance', {}).get('languages', [])) > 1:
            reason = '英文或混合語言，避免翻譯詞彙影響中文口語統計'
        if reason:
            excluded.append(dict(videoId=row['id'], title=row['title'], reason=reason))
            continue
        text, spans = assemble(row['transcript'], normalize)
        docs.append(dict(videoId=row['id'], title=row['title'], date=row['date'],
                         sourceUrl=row['sourceUrl'], text=text, spans=spans,
                         hanCharacters=len(HAN.findall(text)),
                         originalCues=len(row['transcript']),
                         sourceSha256=hashlib.sha256(json.dumps(row['transcript'], ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()))
    return docs, excluded


def count_terms(docs, terms, example_limit=3):
    total_chars = sum(doc['hanCharacters'] for doc in docs)
    output = []
    for term in sorted(set(terms)):
        pattern = term_pattern(term)
        counts, examples = [], []
        for doc in docs:
            matches = list(pattern.finditer(doc['text']))
            count = len(matches)
            counts.append(count)
            if matches and len(examples) < example_limit:
                match = matches[0]
                starts = [span['offset'] for span in doc['spans']]
                span = doc['spans'][max(0, bisect.bisect_right(starts, match.start())-1)]
                examples.append(dict(videoId=doc['videoId'], title=doc['title'], start=span['start'],
                                     sourceUrl=doc['sourceUrl']+'&t='+str(int(span['start']))+'s',
                                     context=doc['text'][max(0,match.start()-28):match.end()+45].replace('\n','／')))
        total = sum(counts)
        output.append(dict(term=term, count=total, videos=sum(c>0 for c in counts),
                           videoCoverage=round(sum(c>0 for c in counts)/len(docs),6) if docs else 0,
                           per10000Han=round(total/total_chars*10000,3) if total_chars else 0,
                           medianPerVideo10000Han=round(statistics.median(c/doc['hanCharacters']*10000 if doc['hanCharacters'] else 0 for c,doc in zip(counts,docs)),3) if docs else 0,
                           maxSingleVideoCount=max(counts,default=0), examples=examples))
    return sorted(output,key=lambda row:(-row['count'],row['term']))


def markdown(report):
    n=report['corpus']['includedVideos']
    oral={row['term']:row for row in report['oralPhrases']}
    topic={row['term']:row for row in report['topicPhrases']}
    lines = ['# 中文逐字稿高頻詞與口語模式', '',
             f'分析日期：{report["generatedAt"]}；資料來源提交：`{report["sourceCommit"]}`。', '',
             '**這是 Puma 相關中文對談的詞串統計，不是已分離說話者的 Puma 個人詞頻。** 原稿沒有說話者欄位；主持人、來賓與引述仍在語料中。', '',
             f'本次讀取 {report["corpus"]["archiveVideos"]} 筆收錄記錄，使用 {n} 部影片、{report["corpus"]["cues"]:,} 段原始字幕、{report["corpus"]["hanCharacters"]:,} 個正規化後中文字。', '',
             '## 初步觀察（對談層級）', '',
             f'1. **口語連接與說明很多。** 在觀察詞表中，「就是」{oral["就是"]["count"]:,} 次、「然後」{oral["然後"]["count"]:,} 次；「因為」「所以」也各超過一萬次。這與解釋、銜接、因果說明的功能相符，但詞頻本身無法證明每次的實際語用功能。', '',
             f'2. **表達判斷時，「我覺得」很常見。** 它出現 {oral["我覺得"]["count"]:,} 次，約是「我認為」（{oral["我認為"]["count"]:,} 次）的 {oral["我覺得"]["count"]/max(1,oral["我認為"]["count"]):.1f} 倍。這是整段對談的用詞比較，不能歸為個人性格或確定是 Puma 所說。', '',
             f'3. **舉例與分點的用語分布廣。** 「比如說」出現於 {oral["比如說"]["videos"]}/{n} 部影片；「第一個」出現於 {oral["第一個"]["videos"]}/{n} 部。它們適合作為後續逐段核對說話方式的候選線索。', '',
             f'4. **議題與選樣共同影響頻率。** 「台北」{topic["台北"]["count"]:,} 次、「台灣」{topic["台灣"]["count"]:,} 次、「中國」{topic["中國"]["count"]:,} 次；「小孩」也有 {topic["小孩"]["count"]:,} 次，出現於 {topic["小孩"]["videos"]} 部。政治、市政與生活議題都有出現，但詞頻不是各議題的時間占比。', '',
             f'5. **不能由這份資料判斷個人獨特性。** 納入影片中有 {report["corpus"]["byYear"].get("2026",0)}/{n} 部發布於 2026 年；語料混有主持人發言與重複片段，也沒有其他受訪者的對照組。', '',
             '## 常見口語詞串（預先列出的觀察詞表）', '',
             '| 詞串 | 次數 | 出現影片數 | 每萬中文字 |', '|---|---:|---:|---:|']
    for row in report['oralPhrases']:
        lines.append(f'| {row["term"]} | {row["count"]:,} | {row["videos"]}/{n} | {row["per10000Han"]:.2f} |')
    lines += ['', '## 議題與表述詞串（觀察詞表，不是完整斷詞排名）', '',
              '| 詞串 | 次數 | 出現影片數 | 每萬中文字 |', '|---|---:|---:|---:|']
    for row in report['topicPhrases']:
        lines.append(f'| {row["term"]} | {row["count"]:,} | {row["videos"]}/{n} | {row["per10000Han"]:.2f} |')
    lines += ['', '## 方法與解讀界線', '']
    lines += ['- '+item for item in report['methodology']]
    lines += ['', '## 排除記錄', '', '| 影片 ID | 原因 |', '|---|---|']
    lines += [f'| `{row["videoId"]}` | {row["reason"]} |' for row in report['corpus']['excluded']]
    lines += ['', '## 2026 年與其他年份的組成', '',
              '以下是各影片發布年份的組成，不是獨立場次，也不是語詞使用的時間趨勢。', '',
              '| 年份 | 影片數 |', '|---|---:|']
    lines += [f'| {year} | {count} |' for year,count in sorted(report['corpus']['byYear'].items())]
    lines += ['', '## 可回查的逐字稿上下文', '',
              '下列片段只是機械定位的原稿上下文；沒有確認說話者，不能當成 Puma 的直接引言。', '']
    for row in report['oralPhrases']:
        if row['term'] not in {'我覺得','就是','其實','比如說','第一個','問題是','很重要'}:
            continue
        lines += ['### '+row['term'], '']
        for example in row['examples']:
            text=example['context'].replace('|','／').replace('\n',' ')
            lines += [f'- [{example["title"]} · {example["start"]:.1f} 秒]({example["sourceUrl"]})：{text}']
        lines += ['']
    return '\n'.join(lines).rstrip()+'\n'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',type=Path,default=ROOT/'data/index.json')
    today=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
    parser.add_argument('--output',type=Path,default=ROOT/'docs/analysis'/('vocabulary-'+today))
    args=parser.parse_args()
    normalize=normalizer()
    archive=read_document(args.db)['interviews']
    docs,excluded=make_documents(archive,normalize)
    if not docs:
        raise ValueError('沒有可分析的中文原稿')
    editorial=read_document(args.db.parent/'editorial.json')['records']
    keyword_vocabulary={normalize(word) for row in editorial for word in row.get('keywords',[]) if 2<=len(normalize(word))<=12}
    try:
        commit=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    except (OSError,subprocess.CalledProcessError):
        commit='unknown'
    report=dict(version=1,generatedAt=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec='seconds'),sourceCommit=commit,
                corpus=dict(archiveVideos=len(archive),includedVideos=len(docs),hanCharacters=sum(d['hanCharacters'] for d in docs),
                            cues=sum(d['originalCues'] for d in docs),byYear=dict(collections.Counter(d['date'][:4] for d in docs)),
                            speakerLabeledCues=sum(bool(cue.get('speaker')) for row in archive for cue in row['transcript']),excluded=excluded,
                            sources=[{k:v for k,v in doc.items() if k not in ('text','spans')} for doc in docs]),
                methodology=[
                    '只分析原始 transcript.json；不把摘要、導讀、AI 中文校對稿、英文翻譯稿或文章標籤當成發言文字。',
                    '以 OpenCC s2t 做字形統一，再合併「臺／台」「爲／為」；不合併同義詞，不修補 ASR 誤字；方括號註記不計。',
                    '相鄰 cue 間隔不超過 1.5 秒且兩端為中文字時接合，處理字幕斷行；句末標點、長間隔及省略註記不跨越。',
                    '逐詞串計算非重疊的字面出現次數；不同詞串可相互包含，例如「台北」包含「台北市」。各列不可直接相加當成詞占比。',
                    '口語詞表與議題詞表是明列的觀察集合，不是完整中文斷詞排行；另外輸出既有編輯關鍵字詞表的原稿頻次。',
                    '同一影片內真實重複發言照計；不同影片的重複片段未做音訊層級去重，影片數不是獨立訪談場次。',
                    '影片涵蓋率與每萬中文字可輔助判斷普遍程度；不同長度影片仍有不同的總詞頻權重。',
                    '沒有主持人／來賓／Puma 的說話者分離，也沒有一般受訪者比較語料，不能宣稱為 Puma 專屬口頭禪或異常高頻。',
                    '排除明確綜藝完整版與多人競選活動只是降低混入；剩餘訪談仍包含他人發言。全部結果仍受 ASR、字幕錯誤與影片選樣影響。',
                    '未進行全篇人工聆聽覆核。詞頻不代表贊同、立場、人格，也不能由提及次數推定政策承諾。',
                ],oralPhrases=count_terms(docs,ORAL_PHRASES),topicPhrases=count_terms(docs,TOPIC_PHRASES),
                editorialKeywordOccurrences=count_terms(docs,keyword_vocabulary,example_limit=0))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    args.output.with_suffix('.md').write_text(markdown(report),encoding='utf-8')
    print(json.dumps({**{k:v for k,v in report['corpus'].items() if k not in ('sources','excluded')},
                      'oralTop':[{k:row[k] for k in ('term','count','videos')} for row in report['oralPhrases'][:16]],
                      'topicsTop':[{k:row[k] for k in ('term','count','videos')} for row in report['topicPhrases'][:20]]},ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()

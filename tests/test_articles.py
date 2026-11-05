import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from summarize_articles import transcript_blocks,parse_response,transcript_fingerprint,make_slug,locate_evidence


class ArticleTests(unittest.TestCase):
    def blocks(self):
        return transcript_blocks([dict(start=i*70,end=i*70+5,text=f'這是第{i}個功能測試來源段落。') for i in range(4)])

    def response(self):
        return dict(slugTopic='test-article-summary',lead='測試導讀，並非真實專訪內容。'*4,
            conclusion='測試總結，並非真實專訪內容。'*4,
            highlights=[dict(title=f'測試重點{i}',text='這是用於驗證引證保留的測試重點，並非真實專訪發言。'*2,
                sourceBlock=i,evidence=f'這是第{i}個功能測試來源段落。') for i in range(3)])

    def test_complete_timeline_and_explicit_anomalies(self):
        cues=[dict(start=0,end=30,text='［靜音區段的辨識文字不可靠，待人工確認］'),
              dict(start=35,end=40,text='真正的測試來源內容。'),dict(start=150,end=155,text='另一段真實測試資料。')]
        blocks=transcript_blocks(cues)
        self.assertEqual([b['start'] for b in blocks],[35,150])
        changed=copy.deepcopy(cues);changed[1]['text']='更新後的來源'
        self.assertNotEqual(transcript_fingerprint(cues),transcript_fingerprint(changed))

    def test_exact_evidence_can_repair_only_unambiguous_block_number(self):
        data=self.response();data['highlights'][2]['sourceBlock']=1
        result=parse_response(json.dumps(data,ensure_ascii=False),self.blocks())
        self.assertEqual(result['highlights'][2]['start'],140)
        data['highlights'][2]['evidence']='來源不存在的文字不可引用。'
        fallback=parse_response(json.dumps(data),self.blocks())['highlights'][2]
        self.assertEqual(fallback['citationStatus'],'needs-review')
        self.assertNotIn('來源不存在',fallback['evidence'])
        self.assertEqual(fallback['evidence'],self.blocks()[1]['text'])
        data['highlights'][2]['sourceBlock']=999
        with self.assertRaisesRegex(ValueError,'有效'):parse_response(json.dumps(data),self.blocks())
        english='This is a literal English source quotation with enough detail to preserve the original statement and its conditions. '*2
        data=self.response();data['highlights'][0].update(sourceBlock=0,evidence=english)
        blocks=self.blocks();blocks[0]['text']=english
        self.assertEqual(parse_response(json.dumps(data),blocks)['highlights'][0]['citationStatus'],'matched')

    def test_omitted_evidence_restores_actual_source_including_negation(self):
        blocks=[dict(index=0,start=0,end=60,text='這裡是來源前半句。中間的否定條件是不支持這個說法。接下來是來源後半句。')]
        match=locate_evidence('這裡是來源前半句...接下來是來源後半句',0,blocks)
        self.assertIn('不支持',match['evidence'])
        self.assertNotIn('...',match['evidence'])
        with self.assertRaises(ValueError):locate_evidence('來源沒有出現的肯定陳述',0,blocks)

    def test_existing_slug_is_preserved_and_collisions_get_safe_suffix(self):
        item=dict(id='AbCdEfGh_12',date='2026-11-04')
        base='2026-11-04-test-topic'
        self.assertEqual(make_slug(item,'new-title',set(),base),base)
        self.assertRegex(make_slug(item,'test-topic',{base}),r'^2026-11-04-test-topic-[a-f0-9]{8}$')


if __name__=='__main__':unittest.main()

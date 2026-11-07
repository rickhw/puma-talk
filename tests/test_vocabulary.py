import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from analyze_vocabulary import assemble,count_terms,make_documents,term_pattern


class VocabularyTests(unittest.TestCase):
    def test_subtitle_wraps_join_but_not_sentences_or_omissions(self):
        cues=[dict(start=0,end=1,text='我'),dict(start=1,end=2,text='覺得'),
              dict(start=2,end=3,text='我。'),dict(start=3,end=4,text='覺得'),
              dict(start=9,end=10,text='我'),dict(start=13,end=14,text='覺得'),
              dict(start=14,end=15,text='我'),dict(start=15,end=16,text='[omit]'),dict(start=16,end=17,text='覺得')]
        text,spans=assemble(cues,lambda text:text.replace('[omit]',''))
        self.assertEqual(text.count('我覺得'),1)
        self.assertEqual(len(spans),8)

    def test_counts_coverage_examples_and_repeated_speech(self):
        docs=[]
        for vid,text in [('one','我覺得我覺得這個'),('two','這個')]:
            docs.append(dict(videoId=vid,title='test',date='2026-01-01',sourceUrl='https://example.test/?v='+vid,
                             text=text,hanCharacters=len(text),spans=[dict(offset=0,endOffset=len(text),start=3,end=9)]))
        rows={r['term']:r for r in count_terms(docs,['我覺得','這個'])}
        self.assertEqual(rows['我覺得']['count'],2)
        self.assertEqual(rows['我覺得']['videos'],1)
        self.assertEqual(rows['我覺得']['videoCoverage'],0.5)
        self.assertEqual(rows['我覺得']['examples'][0]['start'],3)
        self.assertEqual(rows['這個']['videos'],2)

    def test_english_boundaries_and_exclusions(self):
        self.assertEqual(len(list(term_pattern('AI').finditer('AI Taiwan ai AIs'))),2)
        base=dict(title='test',date='2026-01-01',sourceUrl='https://example.test',transcript=[dict(start=0,end=1,text='我覺得')])
        rows=[dict(base,id='chinese',transcriptProvenance=dict(language='zh')),
              dict(base,id='english',transcriptProvenance=dict(language='en')),
              dict(base,id='mixed',transcriptProvenance=dict(language='zh',languages=['zh','en'])),
              dict(base,id='9zRsNOYZ7U4',transcriptProvenance=dict(language='zh')),
              dict(base,id='music',transcript=[])]
        docs,excluded=make_documents(rows,lambda value:value)
        self.assertEqual([d['videoId'] for d in docs],['chinese'])
        self.assertEqual(len(excluded),4)


if __name__=='__main__':
    unittest.main()

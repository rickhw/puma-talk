import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from data_store import atomic_json,atomic_write,read_document,validate_index


class DataStoreTests(unittest.TestCase):
    def fixture(self,folder):
        atomic_json(folder/'index.json',dict(version=1,format='per-interview-v1',interviews=[],
            archive=dict(version=1),articles=dict(version=1),editorial=dict(version=1),
            statistics=dict(version=1),covers=dict(version=1,home=None)))
        rows=[dict(id=vid,date='2026-11-04',title='測試',transcript=[dict(start=0,end=2,text='原始來源')]) for vid in ['AbCdEfGh_12','ZbCdEfGh_12']]
        atomic_write(folder/'index.json',dict(version=1,interviews=rows))
        articles=[dict(videoId=row['id'],slug=f'2026-11-04-test-{i}',lead='測試摘要') for i,row in enumerate(rows)]
        atomic_write(folder/'articles.json',dict(version=1,articles=articles))
        records=[dict(videoId=row['id'],transcript=[dict(start=0,end=2,text='顯示文字')]) for row in rows]
        atomic_write(folder/'editorial.json',dict(version=1,records=records))
        return rows,articles,records

    def test_display_correction_changes_only_one_file_and_preserves_original_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary);rows,_,records=self.fixture(folder)
            before={p.relative_to(folder):p.read_bytes() for p in folder.rglob('*.json')}
            records[0]['transcript'][0]['text']='校正後的顯示文字'
            atomic_write(folder/'editorial.json',dict(version=1,records=records))
            changed=[p.relative_to(folder) for p in folder.rglob('*.json') if before[p.relative_to(folder)]!=p.read_bytes()]
            self.assertEqual(changed,[Path('2026-11-04-test-0/editorial.json')])
            self.assertEqual(read_document(folder/'interviews.json')['interviews'],rows)
            self.assertFalse((folder/'interviews.json').exists())
            self.assertEqual(read_document(folder/'index.json')['interviews'],rows)

    def test_new_import_moves_all_its_files_once_first_article_establishes_slug(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary);rows,articles,_=self.fixture(folder)
            new=dict(id='YbCdEfGh_12',date='2026-11-05',title='新影片',transcript=[])
            atomic_write(folder/'interviews.json',dict(version=1,interviews=rows+[new]))
            entry=json.loads((folder/'index.json').read_text())['interviews'][-1]
            provisional=folder/entry['slug'];self.assertTrue(provisional.exists())
            atomic_write(folder/'statistics.json',dict(version=1,videos=[dict(videoId=new['id'],views=7)]))
            atomic_write(folder/'articles.json',dict(version=1,articles=articles+[dict(videoId=new['id'],slug='2026-11-05-permanent-name',lead='新摘要')]))
            self.assertFalse(provisional.exists())
            target=folder/'2026-11-05-permanent-name'
            self.assertTrue(all((target/name).exists() for name in ['metadata.json','transcript.json','article.json','statistics.json']))
            self.assertEqual(read_document(folder/'statistics.json')['videos'][0]['views'],7)
            self.assertEqual(read_document(folder/'interviews.json')['interviews'][-1],new)
            with self.assertRaisesRegex(ValueError,'既有文章 slug'):
                atomic_write(folder/'articles.json',dict(version=1,articles=[dict(videoId=new['id'],slug='renamed-again')]))

    def test_rejects_directory_escape_duplicate_ids_and_mismatched_records(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary);self.fixture(folder)
            index=json.loads((folder/'index.json').read_text())
            for slug in ['../escape','/tmp/escape','UPPER','']:
                bad=copy.deepcopy(index);bad['interviews'][0]['slug']=slug
                with self.assertRaises(ValueError):validate_index(bad)
            bad=copy.deepcopy(index);bad['interviews'].append(bad['interviews'][0])
            with self.assertRaises(ValueError):validate_index(bad)
            atomic_json(folder/'2026-11-04-test-0/editorial.json',dict(videoId='wrong'))
            with self.assertRaisesRegex(ValueError,'ID 與索引不符'):read_document(folder/'editorial.json')


if __name__=='__main__':unittest.main()

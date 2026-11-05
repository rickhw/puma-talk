import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from refine_transcripts import safe_corrections,keywords,json_response,translation_blocks,replace_phrase
from extract_keywords import parse_keywords
import update_statistics
from install_daily_statistics import configuration

class Identity:
    def convert(self,text):return text


class EditorialTests(unittest.TestCase):
    def test_proofreading_cannot_change_negation_facts_or_remove_speech(self):
        source='沈柏陽提到不支持10億元，也說對不起沒有共鳴。'
        accepted,rejected=safe_corrections([{'from':'沈柏陽','to':'沈伯洋'},
            {'from':'不支持10億元','to':'支持20億元'},{'from':'對不起沒有共鳴','to':'對不起沒有空氣投籃'},
            {'from':'黑熊學苑','to':'黑熊學院'}],source,Identity())
        self.assertEqual(accepted,[dict(before='沈柏陽',after='沈伯洋')])
        self.assertEqual(len(rejected),3)
        self.assertEqual(replace_phrase('蔣萬安以及蔣萬','蔣萬','蔣萬安'),'蔣萬安以及蔣萬安')
        accepted,_=safe_corrections([{'from':'民進黨','to':'國民黨'}],'民進黨',Identity())
        self.assertEqual(accepted,[])

    def test_json_recovery_never_invents_replacement_text(self):
        text='{"keywords":["民防教育","資訊作戰","社會信任","媒體識讀","個資保護"],"corrections":[{"from":"沈柏陽","to":"沈伯洋"},"broken"] bad}'
        parsed=json_response(text)
        self.assertTrue(parsed['formatRecovery'])
        self.assertEqual(parsed['corrections'],[{'from':'沈柏陽','to':'沈伯洋'}])
        self.assertEqual(len(keywords(parsed['keywords'],Identity())),5)
        with self.assertRaises(ValueError):json_response('{"translations":[this is not JSON]}')
        with self.assertRaises(ValueError):keywords(['專訪']*6,Identity())
        with self.assertRaises(ValueError):parse_keywords('["黑熊學院","資訊戰","民防教育","北士科","認知作戰"]','這是一篇只談法律教育的文章。',Identity())

    def test_translation_blocks_preserve_complete_time_range_and_order(self):
        cues=[dict(start=i*20,end=i*20+10,text='source '+str(i)) for i in range(8)]
        blocks=translation_blocks(cues)
        self.assertEqual(blocks[0]['start'],0)
        self.assertEqual(blocks[-1]['end'],150)
        self.assertEqual(' '.join(x['text'] for x in blocks),' '.join(x['text'] for x in cues))

    def test_missing_and_hidden_counts_are_not_zero_and_stale_values_survive(self):
        self.assertIsNone(update_statistics.count(True))
        self.assertIsNone(update_statistics.count(None))
        self.assertEqual(update_statistics.count(0),0)
        with tempfile.TemporaryDirectory() as temporary:
            output=Path(temporary)/'statistics.json'
            output.write_text(json.dumps(dict(version=1,videos=[dict(videoId='AbCdEfGh_12',views=123,likes=0,fetchedAt='2026-11-01T00:00:00Z',status='ok')])))
            with patch.object(sys,'argv',['update_statistics.py','--output',str(output)]),patch.object(update_statistics,'read_archive',return_value=dict(interviews=[dict(id='AbCdEfGh_12',sourceUrl='https://www.youtube.com/watch?v=AbCdEfGh_12')])),patch.object(update_statistics,'refresh_item',side_effect=RuntimeError('test source unavailable')):
                self.assertEqual(update_statistics.main(),1)
            record=json.loads(output.read_text())['videos'][0]
            self.assertEqual(record['views'],123)
            self.assertEqual(record['likes'],0)
            self.assertEqual(record['status'],'stale')
            self.assertEqual(record['fetchedAt'],'2026-11-01T00:00:00Z')

    def test_launch_agent_is_a_daily_user_job_with_scoped_arguments(self):
        job=configuration()
        self.assertEqual(job['StartCalendarInterval'],dict(Hour=3,Minute=10))
        self.assertEqual(job['ProgramArguments'][:2],['/usr/bin/caffeinate','-ims'])
        self.assertEqual(job['ProgramArguments'][2],sys.executable)
        self.assertIn(str(Path(sys.executable).parent),job['EnvironmentVariables']['PATH'].split(os.pathsep))
        self.assertTrue(job['ProgramArguments'][-1].endswith('/scripts/daily_update.py'))
        self.assertNotIn('KeepAlive',job)


if __name__=='__main__':unittest.main()

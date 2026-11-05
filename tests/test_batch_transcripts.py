import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]/'scripts'
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0,str(SCRIPTS))
import batch_transcripts as batch
import transcripts


class BatchTests(unittest.TestCase):
    def test_invalid_decoder_window_is_flagged_without_inventing_speech(self):
        raw = dict(segments=[
            dict(seek=0,start=0,end=1,text='保留的原辨識文字'),
            dict(seek=100,start=1.2,end=1.1,text='損壞的辨識',avg_logprob=float('nan')),
            dict(seek=100,start=1.1,end=1.1,text=''),
            dict(seek=3100,start=31,end=33,text='後續內容'),
        ])
        cues, notes = batch.prepare_asr_cues(raw,40)
        transcripts.validate_cues(cues)
        self.assertEqual([cues[0]['text'],cues[2]['text']],['保留的原辨識文字','後續內容'])
        self.assertIn('待人工',cues[1]['text'])
        self.assertEqual((cues[1]['start'],cues[1]['end']),(1,31))
        self.assertEqual(notes[0]['kind'],'invalid-decoder-window')
        self.assertEqual(raw['segments'][1]['text'],'損壞的辨識')

    def test_only_text_fully_inside_measured_silence_is_flagged(self):
        raw = dict(segments=[
            dict(seek=0,start=0,end=29.98,text='靜音中的疑似幻覺'),
            dict(seek=3000,start=30,end=31,text='不是'),
            dict(seek=3000,start=31,end=32,text='不是'),
        ])
        cues, notes = batch.prepare_asr_cues(raw,40,[(0,30.5)])
        self.assertIn('靜音',cues[0]['text'])
        self.assertEqual([cue['text'] for cue in cues[1:]],['不是','不是'])
        self.assertEqual(len(notes),1)

    def test_resume_preserves_existing_transcripts_without_downloading(self):
        with tempfile.TemporaryDirectory() as directory:
            directory=Path(directory)
            db=directory/'db.json';catalog=directory/'catalog.json'
            data=dict(version=1,interviews=[dict(id='AbCdEfGh_12',transcriptStatus='reviewed',
                transcript=[dict(start=0,end=1,text='保留人工校對版本')])])
            db.write_text(json.dumps(data))
            catalog.write_text(json.dumps(dict(candidates=[dict(id='AbCdEfGh_12',decision='include',uploadDate='20261101')])))
            with patch.object(batch,'fetch_media',side_effect=AssertionError('不得重新下載')):
                self.assertEqual(batch.main(['--db',str(db),'--catalog',str(catalog),'--year','2026','--work-dir',str(directory/'work')]),0)
            self.assertEqual(json.loads(db.read_text()),data)


if __name__=='__main__':
    unittest.main()

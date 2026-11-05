import argparse
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]/'scripts'
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))
import transcripts


class TranscriptTests(unittest.TestCase):
    def data(self):
        return dict(version=1, updatedAt='2026-11-04', interviews=[dict(id='AbCdEfGh_12',title='功能測試，非真實專訪',
                    sourceUrl='https://www.youtube.com/watch?v=AbCdEfGh_12', transcriptStatus='pending', transcript=[],duration=20)])

    def test_validation_and_srt_roundtrip(self):
        cues = [dict(start=0.125,end=2.5,text='測試文字，非訪談內容'), dict(start=3,end=4,text='第二段')]
        self.assertEqual(transcripts.validate_cues(cues), cues)
        self.assertEqual(transcripts.parse_subtitles(transcripts.to_srt(cues)),cues)
        for bad in [[], [dict(start=float('nan'),end=3,text='x')], [dict(start=2,end=1,text='x')],
                    [dict(start=0,end=1,text='')], [dict(start=True,end=2,text='x')]]:
            with self.assertRaises(ValueError): transcripts.validate_cues(bad)

    def test_asr_draft_does_not_modify_archive(self):
        data = self.data()
        original = copy.deepcopy(data)
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            audio = directory/'test.wav'
            audio.write_bytes(b'fixture; not real audio')
            args = argparse.Namespace(video_id='AbCdEfGh_12', audio=audio,engine='mlx', model=None,language='zh',output_dir=directory/'output')
            raw = dict(segments=[dict(start=0,end=2,text='測試輸出，非真實辨識')])
            with patch.object(transcripts,'run_asr',return_value=(raw,'test-version')):
                transcripts.transcribe(args,data)
            self.assertEqual(data,original)
            draft = json.loads((args.output_dir/'draft.json').read_text())
            self.assertEqual(draft['provenance']['inputSha256'], transcripts.checksum(audio))
            self.assertEqual(draft['provenance']['kind'],'asr-local')
            self.assertEqual(draft['videoId'],'AbCdEfGh_12')
            for name in ['subtitles.srt','review.md','quality.json','engine-output.json']:
                self.assertTrue((args.output_dir/name).is_file())

    def test_apply_review_and_no_automatic_overwrite(self):
        data = self.data()
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            db, draft = directory/'db.json', directory/'draft.json'
            draft.write_text(json.dumps(dict(version=1, videoId='AbCdEfGh_12',
                              provenance=dict(kind='asr-local',model='fixture'),transcript=[dict(start=0,end=2,text='測試工作稿')])) )
            args = argparse.Namespace(db=db,draft=draft)
            transcripts.apply_draft(args,data)
            self.assertEqual(data['interviews'][0]['transcriptStatus'],'auto')
            subtitle = directory/'edited.srt'
            subtitle.write_text('1\n00:00:00,000 --> 00:00:02,000\n測試人工校對稿\n',encoding='utf-8')
            rev = argparse.Namespace(db=db,video_id='AbCdEfGh_12',subtitle=subtitle,reviewer='測試校對者',note='測試')
            with patch.object(transcripts, 'ROOT', directory):
                transcripts.review(rev,data)
            item = data['interviews'][0]
            self.assertEqual(item['transcriptStatus'],'reviewed')
            self.assertEqual(item['transcriptReview']['reviewer'],'測試校對者')
            self.assertEqual(item['transcriptProvenance']['model'],'fixture')
            backups = list((directory/'.cache/transcript-history').rglob('record.json'))
            self.assertEqual(len(backups),1)
            self.assertEqual(json.loads(backups[0].read_text())['transcriptStatus'],'auto')
            with self.assertRaisesRegex(ValueError,'不覆蓋'): transcripts.apply_draft(args,data)

    def test_bad_engine_timestamps_retain_raw_output_without_importing(self):
        data = self.data()
        before = copy.deepcopy(data)
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            audio = directory/'test.wav'
            audio.write_bytes(b'fixture; not real audio')
            args = argparse.Namespace(video_id='AbCdEfGh_12', audio=audio, engine='mlx',
                                      model=None, language='zh', output_dir=directory/'output')
            raw = dict(segments=[dict(start=4.5,end=4.4,text='辨識異常')])
            with patch.object(transcripts,'run_asr',return_value=(raw,'test-version')):
                with self.assertRaisesRegex(ValueError,'原始引擎輸出已保留'):
                    transcripts.transcribe(args,data)
            self.assertEqual(json.loads((args.output_dir/'engine-output.json').read_text()),raw)
            self.assertTrue((args.output_dir/'failure.json').is_file())
            self.assertFalse((args.output_dir/'draft.json').exists())
            self.assertEqual(data,before)

    def test_review_requires_source_and_valid_edited_subtitles(self):
        with tempfile.TemporaryDirectory() as directory:
            args = argparse.Namespace(db=Path(directory)/'db.json',video_id='AbCdEfGh_12',reviewer='test',subtitle=Path(directory)/'missing.srt',note=None)
            with self.assertRaisesRegex(ValueError,'先匯入'): transcripts.review(args,self.data())

    def test_quality_report_is_advisory(self):
        cues = [dict(start=0,end=31,text='測試'),dict(start=30,end=40,text='測試')]
        report = transcripts.quality_report(cues,duration=35)
        self.assertEqual(len(report['warnings']),2)
        self.assertIn('不代表',report['note'])


if __name__ == '__main__':
    unittest.main()

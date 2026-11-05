import argparse
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('importer', Path(__file__).resolve().parents[1] / 'scripts/import_youtube.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

class ImportTests(unittest.TestCase):
    def args(self, **kwargs):
        values = dict(category=None, tags=None, replace_transcript=False, subtitle=None)
        values.update(kwargs)
        return argparse.Namespace(**values)

    def info(self):
        return dict(id='AbCdEfGh_12', title='離線匯入測試影片（非真實專訪）', channel='測試頻道', upload_date='20261101', duration=120)

    def test_url_validation(self):
        for url in ['https://youtu.be/AbCdEfGh_12?t=1','https://www.youtube.com/watch?v=AbCdEfGh_12','https://youtube.com/live/AbCdEfGh_12']:
            self.assertEqual(importer.video_id(url),'AbCdEfGh_12')
        for url in ['https://evil.example/?v=AbCdEfGh_12', 'https://youtube.com.evil.example/watch?v=AbCdEfGh_12', 'http://youtube.com/watch?v=AbCdEfGh_12','https://youtube.com/watch?v=bad','https://user:pass@youtube.com/watch?v=AbCdEfGh_12']:
            with self.assertRaises(ValueError): importer.video_id(url)

    def test_subtitle_and_import_roundtrip(self):
        cues = importer.parse_subtitles('\ufeffWEBVTT\n\n00:01.000 --> 00:04.000\n第一段\n\n00:02.000 --> 00:05.000\n第一段 第二段\n\n00:04.500 --> 00:07.000\n第二段\n')
        self.assertEqual(cues, [dict(start=1,end=4,text='第一段'),dict(start=2,end=7,text='第二段')])
        data = dict(version=1, interviews=[])
        item = importer.import_record(data,self.info(),self.args(category='文化與閱讀',tags='閱讀, 成長'),cues)
        self.assertEqual(item['transcriptStatus'],'imported')
        self.assertEqual(item['tags'],['閱讀','成長'])
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory)/'interviews.json'
            importer.atomic_write(db,data)
            self.assertEqual(importer.read_archive(db),data)

    def test_reimport_is_idempotent_and_preserves_editorial_and_reviewed_transcript(self):
        data = dict(version=1, interviews=[])
        cues = [dict(start=0,end=2,text='人工校對內容')]
        item = importer.import_record(data,self.info(),self.args(),cues)
        item['transcriptStatus'] = 'reviewed'
        item['title'] = '人工編輯標題'
        item['tags'] = ['人工標籤']
        before = copy.deepcopy(item)
        importer.import_record(data,self.info(),self.args(),[dict(start=0,end=1,text='自動內容')],'auto')
        self.assertEqual(len(data['interviews']),1)
        self.assertEqual(data['interviews'][0],before)
        importer.import_record(data,self.info(),self.args(replace_transcript=True),[dict(start=0,end=1,text='明確替換')],'auto')
        self.assertEqual(data['interviews'][0]['transcript'][0]['text'],'明確替換')

    def test_invalid_metadata_does_not_produce_record(self):
        for info in [dict(id='invalid',title='test'),dict(id='AbCdEfGh_12',title=''),dict(id='AbCdEfGh_12',title='test')]:
            data = dict(version=1, interviews=[])
            with self.assertRaises(ValueError): importer.import_record(data,info,self.args())
            self.assertEqual(data['interviews'],[])
        with self.assertRaises(ValueError): importer.parse_subtitles('no captions')
        with self.assertRaises(ValueError): importer.parse_subtitles('00:00:09,000 --> 00:00:01,000\nreverse')

    def test_prefer_original_subtitles_before_auto(self):
        self.assertEqual(importer.choose_language({'subtitles':{'en':[]},'automatic_captions':{'zh-TW':[]}}),('en','imported',False))
        self.assertEqual(importer.choose_language({'automatic_captions':{'zh-TW':[]}}),('zh-TW','auto',True))
        self.assertIsNone(importer.choose_language({}))
        self.assertEqual(importer.choose_language({'automatic_captions':{'zh-TW':[], 'en-orig':[]}}),('en-orig','auto',True))
        self.assertEqual(importer.choose_language({'language':'en','automatic_captions':{'zh-TW':[],'en':[]}}),('en','auto',True))
        self.assertIsNone(importer.choose_language({'language':'fr','automatic_captions':{'zh-TW':[]}}))
        self.assertEqual(importer.choose_language({'language':'en','subtitles':{'zh-TW':[],'en':[]}}),('en','imported',False))

    def test_repeated_non_overlapping_speech_is_not_deleted(self):
        cues = importer.parse_subtitles('00:00:01,000 --> 00:00:02,000\n對\n\n00:00:02,000 --> 00:00:03,000\n對')
        self.assertEqual(len(cues),2)

    def test_dubbed_and_translated_captions_are_not_original_speech(self):
        info = {'language':'zh-Hant', 'automatic_captions': {
            'en-orig':[{'url':'https://www.youtube.com/api/timedtext?lang=en'}],
            'zh-Hant':[{'url':'https://www.youtube.com/api/timedtext?lang=en&tlang=zh-Hant'}],
        }}
        self.assertIsNone(importer.choose_language(info))
        info['automatic_captions']['zh-orig'] = [{'url':'https://www.youtube.com/api/timedtext?lang=zh'}]
        self.assertEqual(importer.choose_language(info), ('zh-orig','auto',True))

    def test_json3_uses_new_text_events_and_preserves_repeated_speech(self):
        raw = json.dumps({'events': [
            {'tStartMs':0,'dDurationMs':9000,'id':1},
            {'tStartMs':1000,'dDurationMs':4000,'segs':[{'utf8':'Hello'},{'utf8':' world'}]},
            {'tStartMs':2500,'aAppend':1,'segs':[{'utf8':'\n'}]},
            {'tStartMs':2510,'dDurationMs':1000,'segs':[{'utf8':'Yes'}]},
            {'tStartMs':4000,'dDurationMs':1000,'segs':[{'utf8':'Yes'}]},
        ]})
        self.assertEqual(importer.parse_youtube_json3(raw),[
            dict(start=1,end=2.51,text='Hello world'),dict(start=2.51,end=3.51,text='Yes'),
            dict(start=4,end=5,text='Yes')])

    def test_offline_command_line_import(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            db, info, subtitle = directory/'db.json', directory/'video.info.json', directory/'sample.srt'
            db.write_text(json.dumps(dict(version=1, interviews=[])))
            info.write_text(json.dumps(self.info()))
            subtitle.write_text('1\n00:00:00,000 --> 00:00:04,000\n命令列離線匯入測試（不是專訪內容）\n',encoding='utf-8')
            command = [sys.executable, str(Path(importer.__file__)), '--db', str(db), '--info-json', str(info), '--subtitle', str(subtitle)]
            for _ in range(2):
                result = subprocess.run(command, capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode,0,result.stderr)
            data = importer.read_archive(db)
            self.assertEqual(len(data['interviews']),1)
            self.assertEqual(data['interviews'][0]['transcriptStatus'],'imported')
            self.assertIn('命令列離線匯入測試',data['interviews'][0]['transcript'][0]['text'])

if __name__ == '__main__':
    unittest.main()

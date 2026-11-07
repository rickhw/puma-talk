import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildCommonPhrases} from '../scripts/common-phrases.mjs';
import {commonPhraseCloudHTML} from '../assets/insights.js';
import {filterInterviews} from '../assets/core.js';

const config=JSON.parse(await readFile(new URL('../data/common-phrases.json',import.meta.url),'utf8'));
const record=(id,text,extra={})=>({id,title:'測試',date:'2026-11-07',tags:[],category:'文化與閱讀',transcriptProvenance:{language:'zh'},transcript:[{start:0,end:3,text}],...extra});

test('common phrases normalize equivalent forms and count repetitions, not tag membership',()=>{
  const result=buildCommonPhrases([record('a','我觉得我覺得，因爲因为因為，有没有有沒有',{tags:['但是']}),record('b','其他文字')],config);
  const rows=new Map(result.summary.phrases.map(row=>[row.term,row]));
  assert.equal(result.summary.videos,2);
  assert.deepEqual(rows.get('我覺得'),{term:'我覺得',count:2,videos:1});
  assert.deepEqual(rows.get('因為'),{term:'因為',count:3,videos:1});
  assert.deepEqual(rows.get('有沒有'),{term:'有沒有',count:2,videos:1});
  assert.ok(!rows.has('但是'));
  assert.ok(result.videoTerms.get('a').includes('我覺得'));
  assert.deepEqual(result.videoTerms.get('b'),[]);
});

test('subtitle joins preserve sentence, long-gap and omitted-range boundaries',()=>{
  const transcript=[{start:0,end:1,text:'我'},{start:1,end:2,text:'覺得'},
    {start:2,end:3,text:'我。'},{start:3,end:4,text:'覺得'},
    {start:10,end:11,text:'我'},{start:14,end:15,text:'覺得'},
    {start:15,end:16,text:'我'},{start:16,end:17,text:'［聽不清楚］'},{start:17,end:18,text:'覺得'}];
  const result=buildCommonPhrases([record('a','',{transcript})],config);
  assert.equal(result.summary.phrases.find(row=>row.term==='我覺得').count,1);
});

test('music, translations and explicitly excluded multi-person videos do not contribute',()=>{
  const items=[record('zh','其實'),record('en','其實',{transcriptProvenance:{language:'en'}}),
    record('mixed','其實',{transcriptProvenance:{language:'zh',languages:['zh','en']}}),
    record('9zRsNOYZ7U4','其實'),record('music','其實',{contentType:'music'})];
  const result=buildCommonPhrases(items,config);
  assert.equal(result.summary.videos,1);
  assert.deepEqual(result.summary.phrases,[{term:'其實',count:1,videos:1}]);
  assert.throws(()=>buildCommonPhrases(items,{...config,phrases:['其實','其實']}),/格式/);
});

test('phrase cloud and filters use original-source matches separately from editorial tags',()=>{
  const a=record('a','其實',{commonPhrases:['其實']}),b=record('b','其實',{tags:['其實']});
  assert.deepEqual(filterInterviews([a,b],{phrase:'其實'}).map(row=>row.id),['a']);
  assert.deepEqual(filterInterviews([a,b],{phrase:'其實',tag:'其實'}),[]);
  assert.deepEqual(filterInterviews([a,b],{phrase:'不存在'}),[]);
  const html=commonPhraseCloudHTML({videos:113,phrases:[{term:'我覺得',count:7669,videos:113}]});
  assert.match(html,/phrase=%E6%88%91%E8%A6%BA%E5%BE%97#archive/);
  assert.ok(html.includes('7,669')&&html.includes('並非 Puma 個人詞頻'));
  assert.ok(!html.includes('?tag='));
  const escaped=commonPhraseCloudHTML({videos:1,phrases:[{term:'<script>',count:1,videos:1}]});
  assert.ok(escaped.includes('&lt;script&gt;')&&!escaped.includes('<script>'));
});

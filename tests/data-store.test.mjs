import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readCollection,readIndex} from '../scripts/data-store.mjs';

test('split source loader uses each directory and rejects missing source, wrong IDs and unsafe slugs',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'puma-source-'));
 const slug='2026-11-04-single-contribution',id='AbCdEfGh_12';
 const index={version:1,format:'per-interview-v1',archive:{version:1},articles:{version:1},interviews:[{id,slug}]};
 const json=async(file,data)=>writeFile(path.join(directory,file),JSON.stringify(data));
 try{
  await mkdir(path.join(directory,slug));await json('index.json',index);
  await json(slug+'/metadata.json',{id,title:'測試資料'});
  await assert.rejects(readCollection(directory,'interviews.json'),/ENOENT/);
  await json(slug+'/transcript.json',[{start:0,end:1,text:'原始發言'}]);
  assert.equal((await readCollection(directory,'interviews.json')).interviews[0].transcript[0].text,'原始發言');
  assert.deepEqual((await readCollection(directory,'articles.json')).articles,[]);
  await json(slug+'/article.json',{videoId:id,slug:'different-slug'});
  await assert.rejects(readCollection(directory,'articles.json'),/slug 與目錄不符/);
  await json(slug+'/metadata.json',{id:'different-id'});
  await assert.rejects(readCollection(directory,'interviews.json'),/ID 與索引不符/);
  index.interviews[0].slug='../escape';await json('index.json',index);
  await assert.rejects(readIndex(directory),/slug 無效/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

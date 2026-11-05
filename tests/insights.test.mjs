import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {mergeEnhancements,collectionStats,collectionStatsHTML,keywordCounts,keywordCloudHTML,videoStatsHTML} from '../assets/insights.js';

function fixture(){
  const item={id:'AbCdEfGh_12',title:'測試',date:'2026-11-04',channel:'測試頻道',category:'文化與閱讀',tags:['舊標籤'],sourceUrl:'https://www.youtube.com/watch?v=AbCdEfGh_12',duration:120,transcriptStatus:'auto',transcript:[{start:0,end:10,text:'这是原文。'}]};
  const record={videoId:item.id,sourceSha256:'a'.repeat(64),keywords:['資訊作戰','民防教育','社會信任','媒體識讀','個資保護'],transcript:[{start:0,end:10,text:'這是原文。'}],review:{method:'ai-proofread',model:'test-model',checkedAt:'2026-11-04T00:00:00Z',displayLanguage:'zh-Hant-TW',coverage:'full-transcript',humanReviewed:false,keywordSelection:'article-grounded'}};
  const statistics={version:1,completedAt:'2026-11-04T12:00:00Z',videos:[{videoId:item.id,views:1200,likes:0,fetchedAt:'2026-11-04T12:00:00Z',status:'ok'}]};
  return {item,record,statistics,archive:{version:1,interviews:[item]}};
}
test('display corrections preserve raw records and keyword/source constraints',()=>{
  const {item,record,statistics,archive}=fixture();
  const data=mergeEnhancements(archive,{version:1,records:[record]},statistics);
  assert.equal(item.transcript[0].text,'这是原文。');
  assert.equal(data.interviews[0].transcript[0].text,'這是原文。');
  assert.equal(data.interviews[0].tags.length,5);
  const shifted=structuredClone(record);shifted.transcript[0].start=1;
  assert.throws(()=>mergeEnhancements(archive,{version:1,records:[shifted]},statistics),/時間碼/);
  assert.throws(()=>mergeEnhancements(archive,{version:1,records:[{...record,keywords:['少於五個']}]},statistics),/關鍵字/);
  assert.throws(()=>mergeEnhancements(archive,{version:1,records:[record,record]},statistics),/重複/);
});
test('totals distinguish zero, missing and stale counts and count each video once',()=>{
  const {archive,record,statistics}=fixture();
  const data=mergeEnhancements(archive,{version:1,records:[record]},statistics);
  assert.deepEqual(collectionStats(data.interviews),{videos:1,views:1200,likes:0,viewsAvailable:1,likesAvailable:1,fresh:1,duration:120,completedAt:null});
  assert.match(videoStatsHTML(data.interviews[0]),/按讚 <strong>0<\/strong>/);
  const missing={...data.interviews[0],youtubeStats:{views:null,likes:null,status:'unavailable'}};
  assert.match(videoStatsHTML(missing),/未提供/);
  assert.equal(collectionStats([missing]).viewsAvailable,0);
  assert.match(collectionStatsHTML([missing]),/—/);
  const duplicate=structuredClone(statistics);duplicate.videos.push(duplicate.videos[0]);
  assert.throws(()=>mergeEnhancements(archive,{version:1,records:[record]},duplicate),/重複/);
});
test('keyword weights count videos rather than repeated tags and links are escaped',()=>{
  const items=[{tags:['資訊作戰','資訊作戰','<script>']},{tags:['資訊作戰','民防教育']}];
  assert.equal(keywordCounts(items)[0].count,2);
  const cloud=keywordCloudHTML(items);
  assert.match(cloud,/tag=%E8%B3%87%E8%A8%8A%E4%BD%9C%E6%88%B0/);
  assert.ok(cloud.includes('&lt;script&gt;')&&!cloud.includes('<script>'));
  assert.match(cloud,/資訊作戰，2 支專訪/);
});

test('actual homepage shows entry statistics, keyword links and AI copy; about has no transcript steps',async()=>{
  const {archive,record,statistics}=fixture();
  const merged=mergeEnhancements(archive,{version:1,records:[record]},statistics);
  const core=(await readFile(new URL('../assets/core.js',import.meta.url),'utf8')).replace(/^export /gm,'');
  const insights=(await readFile(new URL('../assets/insights.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  const app=(await readFile(new URL('../assets/app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
  async function render(search=''){
    const elements=new Map(),errors=[];
    const document={title:'',baseURI:'https://example.test/',querySelector(selector){
      if(selector==='#archive-data')return {textContent:JSON.stringify(merged)};
      if(selector==='#site-config')return {textContent:'{}'};
      if(selector==='.skip-link'||selector.startsWith('meta['))return null;
      if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',value:'',hasAttribute(){return false;}});
      return elements.get(selector);
    },querySelectorAll(){return [];},addEventListener(){}};
    await vm.runInNewContext(`(async()=>{${core}\n${insights}\nconst esc=escapeHTML;\n${app}})()`,{
      document,window:{addEventListener(){}},localStorage:{getItem(){return null;}},structuredClone,URL,URLSearchParams,
      location:new URL('https://example.test/'+search),console:{error(error){errors.push(error);}}
    });
    assert.equal(errors.length,0,errors.map(String).join(';'));
    return elements;
  }
  const home=await render(),html=home.get('#main').innerHTML;
  assert.ok(html.indexOf('collection-statistics')<html.indexOf('class="hero wrap"'));
  assert.ok(html.includes('1,200')&&html.includes('keyword-cloud'));
  assert.ok(home.get('#interview-grid').innerHTML.includes('AI 輔助校對'));
  const about=(await render('?view=about')).get('#main').innerHTML;
  assert.ok(about.includes('我們使用 AI 技術校對逐字稿'));
  assert.ok(!about.includes('process-list')&&!about.includes('閱讀器現在就可以試')&&!about.includes('待校對'));
});

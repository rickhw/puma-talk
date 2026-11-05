import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {mergeEnhancements,collectionStats,collectionStatsHTML,keywordCounts,keywordCloudHTML,videoStatsHTML,rankingHTML} from '../assets/insights.js';

function fixture(){
  const item={id:'AbCdEfGh_12',title:'測試',date:'2026-11-04',channel:'測試頻道',category:'文化與閱讀',tags:['舊標籤'],sourceUrl:'https://www.youtube.com/watch?v=AbCdEfGh_12',duration:120,transcriptStatus:'auto',transcript:[{start:0,end:10,text:'这是原文。'}]};
  const record={videoId:item.id,sourceSha256:'a'.repeat(64),keywords:['資訊作戰','民防教育','社會信任','媒體識讀','個資保護'],transcript:[{start:0,end:10,text:'這是原文。'}],review:{method:'ai-proofread',model:'test-model',checkedAt:'2026-11-04T00:00:00Z',displayLanguage:'zh-Hant-TW',coverage:'full-transcript',humanReviewed:false,keywordSelection:'article-grounded'}};
  const statistics={version:1,completedAt:'2026-11-04T12:00:00Z',videos:[{videoId:item.id,views:1200,likes:0,comments:23,fetchedAt:'2026-11-04T12:00:00Z',status:'ok'}]};
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
  assert.match(videoStatsHTML(data.interviews[0]),/留言 <strong>23<\/strong>/);
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
  merged.interviews[0].transcript.push({start:12.9,end:20,text:'第二句對話'});
  merged.interviews[0].slug='test-reading';
  merged.interviews[0].article={status:'draft',lead:'這是可轉貼的摘要。',highlights:[{title:'內容重點',text:'測試正文',start:0,end:10}],conclusion:'測試總結'};
  async function render(search='',detail=false){
    const elements=new Map(),errors=[],listeners=new Map(),players=[],copies=[];
    const document={title:'',baseURI:'https://example.test/',querySelector(selector){
      if(selector==='#archive-data')return null;
      if(selector==='meta[name="archive-data-url"]')return {content:'./data/interviews.fingerprint.json'};
      if(selector==='#status-filter')throw new Error('Removed transcript status control must not be accessed');
      if(selector==='#site-config')return {textContent:JSON.stringify({siteUrl:'https://example.test/'})};
      if(detail&&selector==='meta[name="interview-id"]')return {content:merged.interviews[0].id};
      if(selector==='.skip-link'||selector.startsWith('meta['))return null;
      if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',value:'',scrollIntoView(){elements.scrolled=true;},classList:{add(){},remove(){}},hasAttribute(){return false;}});
      return elements.get(selector);
    },querySelectorAll(){return [];},addEventListener(type,listener){listeners.set(type,listener);}};
    await vm.runInNewContext(`(async()=>{${core}\n${insights}\nconst esc=escapeHTML;\n${app}})()`,{
      document,window:{addEventListener(){},YT:{Player:function(id,options){this.seeks=[];this.plays=0;this.seekTo=(time,allow)=>this.seeks.push([time,allow]);this.playVideo=()=>this.plays++;this.ready=()=>options.events.onReady({target:this});players.push(this);}}},navigator:{clipboard:{async writeText(text){copies.push(text);}}},matchMedia(){return {matches:true};},setTimeout(){return 0;},clearTimeout(){},localStorage:{getItem(){return null;}},structuredClone,URL,URLSearchParams,
      fetch:async url=>{assert.equal(url,'./data/interviews.fingerprint.json');return {ok:true,json:async()=>structuredClone(merged)};},
      history:{replaceState(_state,_title,url){elements.lastURL=url;}},
      location:new URL('https://example.test/'+search),console:{error(error){errors.push(error);}}
    });
    assert.equal(errors.length,0,errors.map(String).join(';'));
    elements.listeners=listeners;elements.players=players;elements.copies=copies;
    return elements;
  }
  const home=await render(),html=home.get('#main').innerHTML;
  assert.ok(html.indexOf('class="hero wrap"')<html.indexOf('collection-statistics'));
  assert.ok(html.indexOf('collection-statistics')<html.indexOf('id="ranking-panel"'));
  for(const label of ['觀看排行榜','時間序列','留言排行榜'])assert.ok(home.get('#ranking-panel').innerHTML.includes(label));
  assert.ok(html.includes('1,200')&&html.includes('keyword-cloud'));
  assert.equal(home.get('#sort-filter').value,'newest');
  assert.ok(!html.includes('id="status-filter"')&&!html.includes('逐字稿狀態'));
  assert.ok(home.get('#interview-grid').innerHTML.includes('AI 輔助校對'));
  let prevented=false;
  await home.listeners.get('click')({target:{closest(selector){return selector==='[data-ranking]'?{dataset:{ranking:'comments'}}:null;}},preventDefault(){prevented=true;}});
  assert.ok(prevented);
  assert.equal(home.get('#sort-filter').value,'comments');
  assert.ok(home.lastURL.includes('sort=comments'));
  assert.match(home.get('#ranking-panel').innerHTML,/data-ranking="comments" aria-current="true"/);
  await home.listeners.get('click')({target:{closest(selector){return selector==='button'?{dataset:{clear:''},hasAttribute(name){return name==='data-clear';}}:null;}},preventDefault(){}});
  assert.equal(home.get('#sort-filter').value,'newest');
  assert.ok(home.lastURL.includes('sort=newest'));
  assert.equal((await render('?sort=invalid')).get('#sort-filter').value,'newest');
  const legacy=await render('?status=available');
  await legacy.listeners.get('click')({target:{closest(selector){return selector==='button'?{dataset:{removeFilter:'status'},hasAttribute(name){return name==='data-remove-filter';}}:null;}},preventDefault(){}});
  assert.ok(!legacy.lastURL.includes('status='));
  const timeline=await render('?sort=oldest');
  assert.equal(timeline.get('#sort-filter').value,'oldest');
  assert.ok(timeline.get('#ranking-panel').innerHTML.includes('最早發布'));
  const detail=await render('',true),cues=detail.get('#transcript-body');
  assert.ok(cues.innerHTML.includes('data-share="12.9"'));
  assert.ok(cues.innerHTML.includes('class="cue-seek" data-seek="1"'));
  assert.ok(!cues.innerHTML.includes('class="cue-youtube"'));
  const clickButton=async(dataset)=>detail.listeners.get('click')({target:{closest(selector){return selector==='button'?{dataset,hasAttribute(name){return Object.hasOwn(dataset,name.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase()));}}:null;}},preventDefault(){}});
  await clickButton({seek:'1'});
  assert.equal(detail.players.length,1);
  const frame=detail.get('#video-player').innerHTML;
  assert.ok(frame.includes('enablejsapi=1&start=12'));
  detail.players[0].ready();
  assert.equal(detail.players[0].seeks[0][0],12);
  await clickButton({seek:'0'});
  assert.equal(detail.players.length,1);
  assert.equal(detail.get('#video-player').innerHTML,frame);
  assert.equal(detail.players[0].seeks.at(-1)[0],0);
  assert.ok(detail.scrolled);
  await clickButton({shareSummary:''});
  assert.ok(detail.copies[0].includes('這是可轉貼的摘要。'));
  assert.ok(detail.copies[0].includes('• 內容重點'));
  assert.ok(detail.copies[0].endsWith('https://example.test/interviews/test-reading/'));
  await detail.listeners.get('input')({target:{id:'transcript-search',value:'第二句'}});
  assert.ok(cues.innerHTML.includes('data-cue="1"')&&!cues.innerHTML.includes('data-cue="0"'));
  assert.ok(cues.innerHTML.includes('data-seek="1"'));
  await clickButton({seek:'1'});
  assert.equal(detail.players[0].seeks.at(-1)[0],12);
  const about=(await render('?view=about')).get('#main').innerHTML;
  assert.ok(about.includes('我們使用 AI 技術校對逐字稿'));
  assert.ok(!about.includes('process-list')&&!about.includes('閱讀器現在就可以試')&&!about.includes('待校對'));
});

test('ranking links use article slugs, preserve missing comments and escape titles',()=>{
  const {item}=fixture();
  const html=rankingHTML([{...item,slug:'reading-test',title:'<script>測試',youtubeStats:{views:5,comments:null}}],'comments');
  assert.ok(html.includes('href="./interviews/reading-test/"'));
  assert.ok(html.includes('&lt;script&gt;測試')&&!html.includes('<script>'));
  assert.ok(html.includes('未提供')&&html.includes('aria-current="true"'));
  assert.ok(html.includes('data-ranking="views"')&&html.includes('data-ranking="newest"'));
});

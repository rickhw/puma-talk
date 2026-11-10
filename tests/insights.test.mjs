import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {mergeEnhancements,collectionStats,collectionStatsHTML,keywordCounts,keywordCloudHTML,videoStatsHTML,rankingHTML,rankedInterviews,isOfficialChannel,normalizeRanking,fullRankingHTML,rankingPath} from '../assets/insights.js';

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
test('curated format tags survive article keyword selection without replacing topic keywords',()=>{
  const {archive,record,statistics}=fixture();
  archive.interviews[0].formatTags=['車掃','車掃'];
  const data=mergeEnhancements(archive,{version:1,records:[record]},statistics);
  assert.deepEqual(data.interviews[0].tags,['車掃',...record.keywords]);
  assert.equal(record.keywords.length,5);
  assert.ok(!data.interviews[0].tags.includes('舊標籤'));
  archive.interviews[0].formatTags='車掃';
  assert.throws(()=>mergeEnhancements(archive,{version:1,records:[record]},statistics),/形式標籤/);
});

test('metadata-only editorial records require a music video and no transcript',()=>{
  const {archive,record,statistics}=fixture();
  Object.assign(archive.interviews[0],{contentType:'music',transcript:[],transcriptStatus:'pending'});
  record.transcript=[];Object.assign(record.review,{method:'metadata-only',coverage:'video-metadata'});
  const data=mergeEnhancements(archive,{version:1,records:[record]},statistics);
  assert.deepEqual(data.interviews[0].transcript,[]);
  const spoken=structuredClone(archive);delete spoken.interviews[0].contentType;
  assert.throws(()=>mergeEnhancements(spoken,{version:1,records:[record]},statistics),/校對/);
  const fake=structuredClone(record);fake.transcript=[{start:0,end:1,text:'不可偽造的演唱稿'}];
  assert.throws(()=>mergeEnhancements(archive,{version:1,records:[fake]},statistics),/偽造/);
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
  assert.match(cloud,/資訊作戰，2 支影片/);
});

test('actual homepage shows entry statistics, keyword links and AI copy; about has no transcript steps',async()=>{
  const {archive,record,statistics}=fixture();
  const merged=mergeEnhancements(archive,{version:1,records:[record]},statistics);
  merged.commonPhrases={videos:1,phrases:[{term:'我覺得',count:2,videos:1}]};
  merged.interviews[0].commonPhrases=['我覺得'];
  merged.interviews[0].formatTags=['車掃'];
  merged.interviews[0].tags.unshift('車掃');
  const core=(await readFile(new URL('../assets/core.js',import.meta.url),'utf8')).replace(/^export /gm,'');
  const insights=(await readFile(new URL('../assets/insights.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  const app=(await readFile(new URL('../assets/app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
  merged.interviews[0].transcript.push({start:12.9,end:20,text:'第二句對話'});
  merged.interviews[0].slug='test-reading';
  merged.interviews[0].sourceDataUrl='https://github.com/example/archive/tree/main/data/test-reading/';
  merged.interviews[0].article={status:'draft',lead:'這是可轉貼的摘要。',highlights:[{title:'內容重點',text:'測試正文',start:0,end:10}],conclusion:'測試總結'};
  async function render(search='',detail=false,rankingMode=null,failData=false){
    const elements=new Map(),errors=[],listeners=new Map(),players=[],copies=[];
    const nav=['archive','car-sweep','topics','about'].map(value=>({dataset:{nav:value},attributes:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}}));
    const document={title:'',baseURI:'https://example.test/',querySelector(selector){
      if(selector==='#archive-data')return null;
      if(selector==='meta[name="archive-data-url"]')return {content:'./data/interviews.fingerprint.json'};
      if(selector==='#status-filter')throw new Error('Removed transcript status control must not be accessed');
      if(selector==='#site-config')return {textContent:JSON.stringify({siteUrl:'https://example.test/'})};
      if(detail&&selector==='meta[name="interview-id"]')return {content:merged.interviews[0].id};
      if(rankingMode&&selector==='meta[name="ranking-mode"]')return {content:rankingMode};
      if(selector==='.skip-link'||selector.startsWith('meta['))return null;
      if(!elements.has(selector))elements.set(selector,{innerHTML:rankingMode&&selector==='#main'?'STATIC COMPLETE RANKING':'',textContent:'',value:'',scrollIntoView(){elements.scrolled=true;},classList:{add(){},remove(){}},hasAttribute(name){return Boolean(rankingMode&&name==='data-static-ranking');}});
      return elements.get(selector);
    },querySelectorAll(selector){return selector==='[data-nav]'?nav:[];},addEventListener(type,listener){listeners.set(type,listener);}};
    await vm.runInNewContext(`(async()=>{${core}\n${insights}\nconst esc=escapeHTML;\n${app}})()`,{
      document,window:{addEventListener(){},YT:{Player:function(id,options){this.seeks=[];this.plays=0;this.seekTo=(time,allow)=>this.seeks.push([time,allow]);this.playVideo=()=>this.plays++;this.ready=()=>options.events.onReady({target:this});players.push(this);}}},navigator:{clipboard:{async writeText(text){copies.push(text);}}},matchMedia(){return {matches:true};},setTimeout(){return 0;},clearTimeout(){},localStorage:{getItem(){return null;}},structuredClone,URL,URLSearchParams,
      fetch:async url=>{assert.equal(url,'./data/interviews.fingerprint.json');return {ok:!failData,json:async()=>structuredClone(merged)};},
      history:{replaceState(_state,_title,url){elements.lastURL=url;}},
      location:new URL('https://example.test/'+search),console:{error(error){errors.push(error);}}
    });
    assert.equal(errors.length,failData?1:0,errors.map(String).join(';'));
    elements.listeners=listeners;elements.players=players;elements.copies=copies;
    elements.nav=nav;elements.document=document;
    return elements;
  }
  const home=await render(),html=home.get('#main').innerHTML;
  for(const mode of ['views','views-nonofficial','newest','comments']){
    const page=await render('',false,mode);
    assert.ok(page.get('#main').innerHTML.includes('complete-ranking-list'));
    assert.ok(page.get('#main').innerHTML.includes(`data-full-ranking="${mode}" aria-current="page"`));
    assert.ok(!page.has('#sort-filter'),'full rankings must not render the home archive');
    assert.match(page.document.title,/完整排名/);
  }
  const fallback=await render('',false,'views',true);
  assert.equal(fallback.get('#main').innerHTML,'STATIC COMPLETE RANKING','keep static ranking when shared data cannot load');
  assert.ok(html.indexOf('class="hero wrap"')<html.indexOf('collection-statistics'));
  assert.ok(html.indexOf('collection-statistics')<html.indexOf('id="ranking-panel"'));
  for(const label of ['觀看排行榜','時間序列','留言排行榜'])assert.ok(home.get('#ranking-panel').innerHTML.includes(label));
  assert.ok(html.includes('1,200')&&html.includes('keyword-cloud'));
  assert.equal(home.get('#sort-filter').value,'newest');
  assert.match(home.get('#ranking-panel').innerHTML,/data-ranking="views" aria-current="true"/);
  assert.ok(!html.includes('id="status-filter"')&&!html.includes('逐字稿狀態'));
  assert.ok(home.get('#interview-grid').innerHTML.includes('AI 輔助校對'));
  let prevented=false;
  await home.listeners.get('click')({target:{closest(selector){return selector==='[data-ranking]'?{dataset:{ranking:'comments'}}:null;}},preventDefault(){prevented=true;}});
  assert.ok(prevented);
  assert.equal(home.get('#sort-filter').value,'newest');
  assert.ok(home.lastURL.includes('sort=newest')&&home.lastURL.includes('ranking=comments'));
  assert.match(home.get('#ranking-panel').innerHTML,/data-ranking="comments" aria-current="true"/);
  assert.ok(home.get('#ranking-panel').innerHTML.includes('href="./rankings/comments/"'));
  await home.listeners.get('change')({target:{id:'sort-filter',value:'oldest'}});
  assert.ok(home.lastURL.includes('sort=oldest')&&home.lastURL.includes('ranking=comments'));
  assert.match(home.get('#ranking-panel').innerHTML,/data-ranking="comments" aria-current="true"/);
  assert.ok(home.get('#ranking-panel').innerHTML.includes('sort=oldest&amp;ranking=views'));
  const restored=await render('?sort=oldest&ranking=comments');
  assert.equal(restored.get('#sort-filter').value,'oldest');
  assert.match(restored.get('#ranking-panel').innerHTML,/data-ranking="comments" aria-current="true"/);
  const external=await render('?sort=oldest&ranking=views-nonofficial&format='+encodeURIComponent('車掃'));
  assert.equal(external.get('#sort-filter').value,'oldest');
  assert.match(external.get('#ranking-panel').innerHTML,/data-ranking="views-nonofficial" aria-current="true"/);
  await external.listeners.get('click')({target:{closest(selector){return selector==='[data-ranking]'?{dataset:{ranking:'comments'}}:null;}},preventDefault(){}});
  assert.equal(new URL(external.lastURL,'https://example.test/').searchParams.get('format'),'車掃');
  assert.equal(new URL(external.lastURL,'https://example.test/').searchParams.get('sort'),'oldest');
  assert.match(external.get('#ranking-panel').innerHTML,/data-ranking="comments" aria-current="true"/);
  await external.listeners.get('change')({target:{id:'sort-filter',value:'views'}});
  assert.equal(new URL(external.lastURL,'https://example.test/').searchParams.get('ranking'),'comments');
  const removedRanking=await render('?ranking=comments-nonofficial&sort=oldest');
  assert.match(removedRanking.get('#ranking-panel').innerHTML,/data-ranking="comments" aria-current="true"/);
  assert.ok(!removedRanking.get('#ranking-panel').innerHTML.includes('comments-nonofficial'));
  assert.equal(removedRanking.get('#sort-filter').value,'oldest');
  const sweep=await render('?format='+encodeURIComponent('車掃')+'&sort=oldest&ranking=comments');
  assert.equal(sweep.document.title,'車掃與市政｜PUMA TALKS');
  assert.match(sweep.get('#archive-title').innerHTML,/車掃與市政/);
  assert.match(sweep.get('#results-count').innerHTML,/1<\/strong> 支車掃與市政影片/);
  assert.equal(sweep.nav.find(a=>a.dataset.nav==='car-sweep').attributes['aria-current'],'page');
  assert.ok(!sweep.nav.find(a=>a.dataset.nav==='archive').attributes['aria-current']);
  await sweep.listeners.get('change')({target:{id:'sort-filter',value:'newest'}});
  assert.equal(new URL(sweep.lastURL,'https://example.test/').searchParams.get('format'),'車掃');
  assert.ok(sweep.lastURL.includes('ranking=comments'));
  await sweep.listeners.get('click')({target:{closest(selector){return selector==='button'?{dataset:{removeFilter:'format'},hasAttribute(name){return name==='data-remove-filter';}}:null;}},preventDefault(){}});
  assert.match(sweep.get('#archive-title').innerHTML,/每場對話，都有新的發現/);
  assert.equal(sweep.nav.find(a=>a.dataset.nav==='archive').attributes['aria-current'],'page');
  assert.ok(!sweep.nav.find(a=>a.dataset.nav==='car-sweep').attributes['aria-current']);
  const phraseResults=await render('?phrase=我覺得&ranking=comments&sort=oldest');
  assert.match(phraseResults.get('#active-filters').innerHTML,/常用語：我覺得/);
  assert.ok(phraseResults.get('#interview-grid').innerHTML.includes('interview-card'));
  await phraseResults.listeners.get('change')({target:{id:'sort-filter',value:'newest'}});
  assert.ok(new URL(phraseResults.lastURL,'https://example.test/').searchParams.get('phrase')==='我覺得');
  const topicHTML=(await render('?view=topics')).get('#main').innerHTML;
  assert.ok(topicHTML.indexOf('id="common-phrases"')<topicHTML.indexOf('class="topic-grid"'));
  assert.ok(topicHTML.includes('?phrase=')&&topicHTML.includes('id="keyword-cloud"'));
  await home.listeners.get('click')({target:{closest(selector){return selector==='button'?{dataset:{clear:''},hasAttribute(name){return name==='data-clear';}}:null;}},preventDefault(){}});
  assert.equal(home.get('#sort-filter').value,'newest');
  assert.ok(home.lastURL.includes('sort=newest'));
  assert.ok(home.lastURL.includes('ranking=comments'));
  assert.match(home.get('#ranking-panel').innerHTML,/data-ranking="comments" aria-current="true"/);
  assert.equal((await render('?sort=invalid')).get('#sort-filter').value,'newest');
  const invalidRanking=await render('?ranking=invalid&sort=comments');
  assert.equal(invalidRanking.get('#sort-filter').value,'comments');
  assert.match(invalidRanking.get('#ranking-panel').innerHTML,/data-ranking="views" aria-current="true"/);
  const rankingOnly=await render('?ranking=comments');
  assert.equal(rankingOnly.get('#sort-filter').value,'newest');
  assert.match(rankingOnly.get('#ranking-panel').innerHTML,/data-ranking="comments" aria-current="true"/);
  const legacy=await render('?status=available');
  await legacy.listeners.get('click')({target:{closest(selector){return selector==='button'?{dataset:{removeFilter:'status'},hasAttribute(name){return name==='data-remove-filter';}}:null;}},preventDefault(){}});
  assert.ok(!legacy.lastURL.includes('status='));
  const timeline=await render('?sort=oldest&ranking=newest');
  assert.equal(timeline.get('#sort-filter').value,'oldest');
  assert.ok(timeline.get('#ranking-panel').innerHTML.includes('最新發布'));
  const detail=await render('',true),cues=detail.get('#transcript-body');
  assert.ok(cues.innerHTML.includes('data-share="12.9"'));
  assert.ok(detail.get('#main').innerHTML.includes(merged.interviews[0].sourceDataUrl));
  assert.ok(detail.get('#main').innerHTML.includes('建議修正逐字稿'));
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
  Object.assign(merged.interviews[0],{contentType:'music',transcript:[],transcriptStatus:'pending'});
  merged.interviews[0].article.provenance={coverage:'video-metadata'};
  const music=await render('',true);
  assert.ok(music.get('.transcript-panel').innerHTML.includes('作品資訊'));
  assert.ok(music.get('.transcript-panel').innerHTML.includes('音樂影片'));
  assert.ok(!music.has('#transcript-body'));
  assert.ok(music.get('.source-button').innerHTML.includes('觀看音樂影片'));
});

test('ranking links use article slugs, preserve missing comments and escape titles',()=>{
  const {item}=fixture();
  const html=rankingHTML([{...item,slug:'reading-test',title:'<script>測試',youtubeStats:{views:5,comments:null}}],'comments');
  assert.ok(html.includes('href="./interviews/reading-test/"'));
  assert.ok(html.includes('&lt;script&gt;測試')&&!html.includes('<script>'));
  assert.ok(html.includes('未提供')&&html.includes('aria-current="true"'));
  assert.ok(html.includes('data-ranking="views"')&&html.includes('data-ranking="newest"'));
  assert.ok(html.includes('href="./index.html?ranking=comments#rankings"'));
});
test('nonofficial rankings exclude only Puma before selecting ten and preserve count ordering',()=>{
  const {item}=fixture();
  const media=Array.from({length:12},(_,i)=>({...item,id:String(i).padStart(11,'0'),channel:i===0?'媒體官方頻道':'其他媒體',date:'2026-11-04',youtubeStats:{views:100-i,comments:50-i}}));
  const official={...item,id:'Official_12',channel:'沈伯洋Puma',youtubeStats:{views:99999,comments:99999}};
  const renamed={...official,id:'Renamed__12',channel:'改名後的頻道',channelId:'UC49EKUpNvS_fzdk5SKvipQg'};
  assert.ok(isOfficialChannel(official)&&isOfficialChannel(renamed));
  assert.ok(!isOfficialChannel(media[0]));
  assert.ok(!isOfficialChannel({...official,channelId:'UCJU_mEOzlhdKAAUyt08NGog'}));
  const all=[official,renamed,...media];
  assert.equal(rankedInterviews(all,'views')[0].id,official.id);
  for(const mode of ['views-nonofficial']){
    assert.deepEqual(rankedInterviews(all,mode).map(x=>x.id),media.slice(0,10).map(x=>x.id));
    const html=rankingHTML(all,mode,null,'format=車掃&sort=oldest&ranking=views');
    assert.ok(!html.includes('href="./index.html?id=Official_12"'));
    assert.match(html,/不含官方前 10 名/);
    assert.match(html,/排除沈伯洋的官方 YouTube 頻道/);
    assert.match(html,new RegExp(`data-ranking="${mode}" aria-current="true"`));
    assert.ok(html.includes('format=%E8%BB%8A%E6%8E%83&amp;sort=oldest'));
  }
  const edge=[{...media[0],youtubeStats:{views:null,comments:null}},{...media[1],youtubeStats:{views:0,comments:0}}];
  for(const mode of ['views-nonofficial'])assert.equal(rankedInterviews(edge,mode)[0].id,media[1].id);
  const tabs=[...rankingHTML(all).matchAll(/data-ranking="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(tabs,['views','views-nonofficial','newest','comments']);
  assert.equal(normalizeRanking('oldest'),'oldest');
  assert.equal(normalizeRanking('invalid'),'views');
  assert.equal(normalizeRanking('comments-nonofficial'),'comments');
  assert.equal(rankedInterviews(all,'comments-nonofficial')[0].id,official.id);
});

test('complete rankings include every eligible video in preview order, including zero and missing counts',()=>{
  const {item}=fixture();
  const media=Array.from({length:14},(_,i)=>({...item,id:String(i).padStart(11,'0'),slug:'reading-'+i,title:i===0?'<script>完整標題':'完整標題 '+i,date:'2026-11-04',youtubeStats:{views:100-i,comments:i}}));
  const official={...item,id:'Official_12',slug:'official-reading',channelId:'UC49EKUpNvS_fzdk5SKvipQg',youtubeStats:{views:9999,comments:9999}};
  const zero={...item,id:'Zero_____12',slug:'zero-counts',youtubeStats:{views:0,comments:0}};
  const missing={...item,id:'Missing__12',slug:'missing-counts',youtubeStats:{views:null,comments:null}};
  const all=[official,missing,...media,zero];
  for(const mode of ['views','views-nonofficial','newest','comments']){
    const expected=rankedInterviews(all,mode,Infinity),html=fullRankingHTML(all,mode);
    assert.equal(expected.length,mode==='views-nonofficial'?all.length-1:all.length);
    assert.deepEqual(expected.slice(0,10),rankedInterviews(all,mode));
    assert.deepEqual([...html.matchAll(/data-ranking-video="([^"]+)"/g)].map(x=>x[1]),expected.map(x=>x.id));
    assert.match(html,/&lt;script&gt;完整標題/);
    assert.ok(!html.includes('<script>'));
    assert.equal([...html.matchAll(/data-full-ranking=/g)].length,4);
    assert.ok(html.includes(`href="./index.html?ranking=${mode}#rankings"`));
    assert.ok(rankingHTML(all,mode).includes(`href="${rankingPath(mode)}"`));
    if(mode!=='newest')assert.equal(expected.at(-1).id,missing.id);
  }
  assert.equal(rankingPath('comments-nonofficial'),'./rankings/comments/');
  assert.equal(rankingPath('oldest'),'./rankings/newest/');
  assert.equal(rankingPath('invalid'),'./rankings/views/');
  assert.match(fullRankingHTML([]),/0 支影片/);
});

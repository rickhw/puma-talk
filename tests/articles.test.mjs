import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {mergeArticles, validateArticle, interviewPath, interviewSharePath, fallbackSlug,
  articleSummaryHTML, transcriptFingerprintText, filterInterviews} from '../assets/core.js';

function fixture() {
  const item={id:'AbCdEfGh_12',date:'2026-11-04',title:'功能測試訪談',channel:'測試頻道',category:'文化與閱讀',
    sourceUrl:'https://www.youtube.com/watch?v=AbCdEfGh_12',tags:[],transcriptStatus:'auto',
    transcript:[{start:0,end:4,text:'測試內容：第一個來源段落。'},{start:10,end:14,text:'測試內容：第二個來源段落。'},{start:20,end:24,text:'測試內容：第三個來源段落。'}]};
  const article={videoId:item.id,slug:'2026-11-04-test-reading',status:'draft',lead:'功能測試導讀，並非真實專訪摘要。',
    highlights:item.transcript.map((c,i)=>({title:`重點${i+1}`,text:`測試專訪重點${i+1}，並非真實發言。`,start:c.start,end:c.end,evidence:c.text})),
    conclusion:'功能測試總結，並非真實專訪內容。',
    provenance:{transcriptSha256:createHash('sha256').update(transcriptFingerprintText(item.transcript)).digest('hex')}};
  return {item,article,archive:{version:1,interviews:[item]}};
}

test('article slugs are independent URLs and clip sharing preserves the article path',()=>{
  const {item,article,archive}=fixture();
  const merged=mergeArticles(archive,{version:1,articles:[article]});
  const record=merged.interviews[0];
  assert.equal(interviewPath(record),'./interviews/2026-11-04-test-reading/');
  assert.equal(interviewSharePath(record,12.9),'./interviews/2026-11-04-test-reading/?t=12');
  assert.match(fallbackSlug(item),/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const base=new URL('../../','https://example.test/repository/interviews/another-page/');
  assert.equal(new URL(interviewPath(record),base).pathname,'/repository/interviews/2026-11-04-test-reading/');
  assert.equal(archive.interviews[0].article,undefined);
});

test('duplicate slugs, orphaned articles, and invented evidence are rejected',()=>{
  const {item,article,archive}=fixture();
  const second={...item,id:'ZbCdEfGh_12',sourceUrl:'https://www.youtube.com/watch?v=ZbCdEfGh_12'};
  assert.throws(()=>mergeArticles({...archive,interviews:[item,second]}, {version:1,articles:[article,{...article,videoId:second.id}]}),/slug/);
  assert.throws(()=>mergeArticles(archive,{version:1,articles:[{...article,videoId:second.id}]}),/不存在/);
  const invented=structuredClone(article);invented.highlights[0].evidence='逐字稿沒有這段內容';
  assert.throws(()=>validateArticle(invented,item),/引證/);
  assert.throws(()=>validateArticle({...article,slug:'../escape'},item),/slug/);
});

test('summary content is searchable, rendered as an article, and escaped',()=>{
  const {item,article,archive}=fixture();article.lead+='摘要專屬搜尋詞';article.highlights[0].title='<script>測試</script>';
  article.sourceScopeNote='功能測試：來源的 <script>標示</script> 不可執行。';
  const merged=mergeArticles(archive,{version:1,articles:[article]});
  assert.equal(filterInterviews(merged.interviews,{q:'摘要專屬搜尋詞'}).length,1);
  const html=articleSummaryHTML(merged.interviews[0]);
  for (const text of ['文章摘要','專訪重點','總結','AI 摘要','data-summary-time="10"']) assert.ok(html.includes(text));
  assert.ok(html.includes('&lt;script&gt;測試&lt;/script&gt;'));assert.ok(!html.includes('<script>測試'));
  assert.ok(html.includes('來源說明')&&html.includes('&lt;script&gt;標示&lt;/script&gt;'));
});

async function analyticsRuntime(analytics,search='?t=123&utm_source=test',path='') {
  const script=await readFile(new URL('../assets/analytics.js',import.meta.url),'utf8');
  const appended=[],window={};
  const metadata={'interview-id':'AbCdEfGh_12','article-slug':'test-slug'};
  const document={title:'文章標題｜PUMA TALKS',querySelector(selector){
    if(selector==='#site-config') return {textContent:JSON.stringify({analytics})};
    const key=selector.match(/meta\[name="([^"]+)"\]/)?.[1];return key?{content:metadata[key]}:null;
  },createElement(){return {};},head:{append(node){appended.push(node);}}};
  const location=new URL('https://example.test/repo/interviews/test-slug/'+path+search+'#fragment');
  const context={document,location,URL,URLSearchParams,window,Date};
  vm.runInNewContext(script,context);
  return {appended,window,rerun(){vm.runInNewContext(script,context);}};
}

test('GA stays off without an ID and emits one article pageview when configured',async()=>{
  assert.equal((await analyticsRuntime({})).appended.length,0);
  const enabled=await analyticsRuntime({measurementId:'G-TEST123'});
  const views=enabled.window.dataLayer.filter(args=>args[0]==='event'&&args[1]==='page_view');
  assert.equal(views.length,1);
  assert.equal(views[0][2].page_location,'https://example.test/repo/interviews/test-slug/?utm_source=test');
  assert.equal(views[0][2].article_slug,'test-slug');
  assert.equal(enabled.appended.length,1);
  assert.equal((await analyticsRuntime({measurementId:'G-TEST123'},'?v=AbCdEfGh_12')).appended.length,0);
  const indexed=(await analyticsRuntime({measurementId:'G-TEST123'},'?t=123','index.html')).window.dataLayer.find(args=>args[0]==='event');
  assert.equal(indexed[2].page_location,'https://example.test/repo/interviews/test-slug/');
});

test('GTM takes precedence over direct GA and queues article context before loading once',async()=>{
  const enabled=await analyticsRuntime({measurementId:'G-TEST123',gtmContainerId:'GTM-TEST123'});
  assert.equal(enabled.appended.length,1);
  assert.equal(enabled.appended[0].src,'https://www.googletagmanager.com/gtm.js?id=GTM-TEST123');
  const layer=enabled.window.dataLayer;
  assert.equal(layer.filter(x=>x.event==='gtm.js').length,1);
  assert.equal(layer.filter(x=>x[0]==='config'||x[0]==='event').length,0);
  assert.equal(layer[0][0],'set');
  assert.equal(layer[0][1].page_location,'https://example.test/repo/interviews/test-slug/?utm_source=test');
  assert.equal(layer[0][1].article_slug,'test-slug');
  assert.equal(layer[1].event,'puma_page_context');
  assert.equal(layer[1].interview_id,'AbCdEfGh_12');
  assert.equal(layer[1].content_group,'interview');
  enabled.rerun();
  assert.equal(enabled.appended.length,1);
  assert.equal(layer.filter(x=>x.event==='gtm.js').length,1);
  assert.equal((await analyticsRuntime({gtmContainerId:'GTM-TEST123'},'?v=AbCdEfGh_12')).appended.length,0);
  assert.equal((await analyticsRuntime({gtmContainerId:'GTM-invalid?inject'})).appended.length,0);
});

test('legacy query links redirect to the slug and retain clip and campaign parameters',async()=>{
  const {item,article,archive}=fixture();
  const merged=mergeArticles(archive,{version:1,articles:[article]});
  const core=(await readFile(new URL('../assets/core.js',import.meta.url),'utf8')).replace(/^export /gm,'');
  const app=(await readFile(new URL('../assets/app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
  let destination;const errors=[];
  const document={querySelector(selector){if(selector==='#main')return {};if(selector==='#archive-data')return {textContent:JSON.stringify(merged)};return null;},
    querySelectorAll(){return [];},addEventListener(){},baseURI:'https://example.test/repo/'};
  await vm.runInNewContext(`(async()=>{${core}\nconst esc=escapeHTML;\n${app}})()`,{
    document,window:{addEventListener(){}},localStorage:{getItem(){return null;}},structuredClone,URL,URLSearchParams,
    location:{search:'?v='+item.id+'&t=45&utm_source=legacy',hash:'',replace(url){destination=url;}},
    console:{error(error){errors.push(error);}}
  });
  assert.equal(errors.length,0);
  assert.equal(destination,'https://example.test/repo/interviews/2026-11-04-test-reading/?t=45&utm_source=legacy');
});

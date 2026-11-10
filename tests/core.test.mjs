import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseSubtitles, filterInterviews, validateArchive, escapeHTML, formatTime, interviewPath, youtubeTimeURL } from '../assets/core.js';
import {readCollection} from '../scripts/data-store.mjs';
import {fileURLToPath} from 'node:url';
import { build } from '../scripts/build.mjs';
import { handleRequest } from '../scripts/serve.mjs';
import {rankingOptions,rankingPath,rankedInterviews} from '../assets/insights.js';

const archive = await readCollection(fileURLToPath(new URL('../data/',import.meta.url)),'interviews.json');
test('archive records have consistent IDs, sources and transcript status', () => {
  assert.equal(validateArchive(archive), archive);
  const duplicate = structuredClone(archive); duplicate.interviews.push(duplicate.interviews[0]);
  assert.throws(() => validateArchive(duplicate), /重複/);
  const mismatch = structuredClone(archive); mismatch.interviews[0].transcriptStatus = 'reviewed'; mismatch.interviews[0].transcript = [];
  assert.throws(() => validateArchive(mismatch), /不一致/);
});
test('search includes transcript text and intersects category, tag and saved filters', () => {
  const item = {...archive.interviews[0], transcript:[{start:0,end:4,text:'校對後的獨特搜尋詞'}]};
  assert.equal(filterInterviews([item], {q:'獨特搜尋詞'}).length, 1);
  assert.equal(filterInterviews([item], {q:'性別 不存在'}).length, 0);
  assert.equal(filterInterviews([item], {category:item.category,tag:item.tags[0],saved:true},[item.id]).length,1);
  assert.equal(filterInterviews([item], {status:'available'}).length,1);
  const sweep={...item,formatTags:['車掃']},mentioned={...item,tags:['車掃']};
  assert.equal(filterInterviews([sweep,mentioned],{format:'車掃'}).length,1);
  assert.equal(filterInterviews([sweep],{format:'車掃',category:item.category,saved:true},[item.id]).length,1);
  assert.equal(filterInterviews([item], {status:'pending'}).length,0);
  assert.equal(filterInterviews(archive.interviews, {saved:true}, []).length,0);
});
test('SRT and WebVTT support BOM, CRLF, multiline and rolling captions', () => {
  const srt = '\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\n你好\r\n世界\r\n\r\n2\r\n01:02:03,250 --> 01:02:06,000\r\n下一句\r\n';
  assert.deepEqual(parseSubtitles(srt), [{start:1,end:3.5,text:'你好 世界'},{start:3723.25,end:3726,text:'下一句'}]);
  const vtt = 'WEBVTT\n\n00:01.000 --> 00:03.000 align:start\n<c>hello</c>\n\n00:02.000 --> 00:04.000\nhello world\n\n00:03.500 --> 00:06.000\nworld\n';
  assert.deepEqual(parseSubtitles(vtt), [{start:1,end:3,text:'hello'},{start:2,end:6,text:'world'}]);
});
test('non-overlapping repeated speech remains in the transcript', () => {
  const cues = parseSubtitles('00:00:01,000 --> 00:00:02,000\n對\n\n00:00:02,000 --> 00:00:03,000\n對\n\n00:01:00,000 --> 00:01:01,000\n對');
  assert.equal(cues.length,3);
});
test('malformed subtitles reject and source HTML is escaped', () => {
  assert.throws(() => parseSubtitles('a plain text file'), /找不到/);
  assert.throws(() => parseSubtitles('00:00:05,000 --> 00:00:01,000\n反向'), /不能早於/);
  assert.equal(escapeHTML('<script>"x"&\''), '&lt;script&gt;&quot;x&quot;&amp;&#39;');
  assert.equal(parseSubtitles('00:00:00,000 --> 00:00:01,000\n&lt;img src=x onerror=alert(1)&gt;')[0].text, '<img src=x onerror=alert(1)>');
  assert.equal(formatTime(3723.9), '1:02:03');
  assert.equal(formatTime(-1), '00:00');
});
test('static output serves correctly without dependencies or a backend', async () => {
  await build();
  // Exercise the real HTTP handler without requiring a socket in restricted CI/sandboxes.
  async function request(url, method = 'GET') {
    const response = {status:0,headers:{},body:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
    await handleRequest({url,method},response); return response;
  }
  for (const url of ['/', '/?v=YlEaWM3NAKs', '/?view=topics', '/assets/app.bundle.js', '/assets/style.css', '/data/interviews.json', '/examples/reader-demo.srt']) assert.equal((await request(url)).status,200,url);
  const homeHTML=(await request('/')).body.toString();
  assert.ok(homeHTML.indexOf('data-nav="archive"')<homeHTML.indexOf('data-nav="car-sweep"'));
  assert.ok(homeHTML.indexOf('data-nav="car-sweep"')<homeHTML.indexOf('data-nav="topics"'));
  assert.match(homeHTML,/href="\.\/index\.html\?format=%E8%BB%8A%E6%8E%83#archive" data-nav="car-sweep">車掃與市政<\/a>/);
  assert.equal((await request('/assets/missing.js')).status,404);
  assert.equal((await request('/%E0%A4%A')).status,400);
  assert.equal((await request('/','POST')).status,405);
  assert.equal((await request('/','HEAD')).body,undefined);
  const html = String((await request('/')).body);
  assert.match(html,/lang="zh-Hant"/);
  assert.match(html,/\.\/assets\/app\.bundle\.[a-f0-9]{12}\.js/);
  assert.ok(!html.includes('id="archive-data"'),'home shares the archive JSON rather than embedding transcripts in its head');
  assert.ok(Buffer.byteLength(html)<100_000,'social crawlers receive a lightweight homepage');
  assert.ok(Buffer.byteLength(html.slice(0,html.indexOf('</head>')))<32_000,'social metadata and the complete head fit in a small response');
  const brand=html.match(/class="brand" href="([^"]+)"/)[1];
  assert.equal(new URL(brand,'https://example.test/').href,'https://example.test/');
  const site=JSON.parse(await readFile(new URL('../data/site.json',import.meta.url),'utf8'));
  if(site.analytics?.gtmContainerId) {
    assert.ok(html.indexOf('id="site-config"')<html.indexOf('<body>'));
    assert.ok(html.indexOf('event:\'gtm.js\'')<html.indexOf('<body>'));
    assert.ok(html.includes(`<body>\n  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${site.analytics.gtmContainerId}"`));
  }

  const dataURL = html.match(/name="archive-data-url" content="([^"]+)"/)[1];
  const shared=await request(new URL(dataURL,'https://example.test/').pathname);
  assert.equal(shared.status,200);
  assert.equal(validateArchive(JSON.parse(String(shared.body))).interviews.length,archive.interviews.length);
  const bundle = String((await request('/assets/app.bundle.js')).body);
  assert.doesNotThrow(() => new vm.Script(bundle, {filename:'app.bundle.js'}));
  const publicData=JSON.parse(String((await request('/data/interviews.json')).body));
  const config=JSON.parse(await readFile(new URL('../data/site.json',import.meta.url),'utf8'));
  assert.equal(new Set(publicData.interviews.map(item=>item.slug)).size,archive.interviews.length);
  for(const [mode,label] of rankingOptions){
    const pathname=rankingPath(mode).slice(1),response=await request(pathname);
    assert.equal(response.status,200,pathname);
    const page=String(response.body),expected=rankedInterviews(publicData.interviews,mode,Infinity);
    assert.ok(page.includes('<base href="../../">'));
    assert.ok(page.includes(`name="ranking-mode" content="${mode}"`));
    assert.ok(page.includes(`href="${rankingPath(mode)}#main"`));
    assert.ok(page.includes('data-static-ranking="true"'));
    assert.ok(page.includes(`<h1 id="full-ranking-title">${label}</h1>`));
    assert.ok(page.includes(`rel="canonical" href="${new URL(rankingPath(mode),config.siteUrl).href}"`));
    assert.ok(page.includes(`property="og:url" content="${new URL(rankingPath(mode),config.siteUrl).href}"`));
    assert.ok(page.includes('property="og:image"'));
    assert.deepEqual([...page.matchAll(/data-ranking-video="([^"]+)"/g)].map(x=>x[1]),expected.map(x=>x.id));
    assert.equal([...page.matchAll(/data-full-ranking=/g)].length,4);
    assert.ok(!page.includes('id="archive-data"'),'rank pages share data and work as static HTML');
    const redirect=await request(pathname.slice(0,-1));
    assert.equal(redirect.status,301);assert.equal(redirect.headers.Location,pathname);
  }
  for (const item of publicData.interviews) {
    const pathname=interviewPath(item).slice(1);
    const response=await request(pathname);
    assert.equal(response.status,200,pathname);
    const page=String(response.body);
    assert.ok(page.includes('<base href="../../">'));
    assert.ok(page.includes('class="brand" href="./"'));
    assert.ok(page.includes(`href="${interviewPath(item)}#main"`));
    assert.ok(page.includes(`name="interview-id" content="${item.id}"`));
    const canonical=config.siteUrl?new URL(interviewPath(item),config.siteUrl).href:interviewPath(item);
    assert.ok(page.includes(`rel="canonical" href="${escapeHTML(canonical)}"`));
    assert.ok(!page.includes('id="archive-data"'),'article pages share the archive JSON instead of duplicating it');
    if (item.article) {
      assert.ok(page.includes(escapeHTML(item.article.lead)));
      assert.equal(item.sourceDataUrl,`https://github.com/rickhw/puma-talk/tree/main/data/${item.slug}/`);
      assert.ok(page.includes(item.sourceDataUrl)&&page.includes('提出修正'));
      const label=item.article.status==='reviewed'?'摘要已校對':'AI 摘要';
      assert.ok(page.includes(item.contentType==='music'?'作品資訊':'專訪重點')&&page.includes('總結')&&page.includes(label));
    }
  }
  const directory=interviewPath(publicData.interviews[0]).slice(1,-1);
  const redirected=await request(directory+'?t=12');
  assert.equal(redirected.status,301);assert.equal(redirected.headers.Location,directory+'/?t=12');
});

test('rankings sort known counts before missing values and use deterministic date ties',()=>{
  const base=archive.interviews[0];
  const rows=[
    {...base,id:'AAAAAAA0001',date:'2026-11-04',youtubeStats:{views:0,comments:null}},
    {...base,id:'AAAAAAA0002',date:'2026-11-03',youtubeStats:{views:20,comments:2}},
    {...base,id:'AAAAAAA0003',date:'2026-11-05',youtubeStats:{views:null,comments:0}},
    {...base,id:'AAAAAAA0004',date:'2026-11-04',youtubeStats:{views:20,comments:5}}
  ];
  assert.deepEqual(filterInterviews(rows,{sort:'views'}).map(i=>i.id),['AAAAAAA0004','AAAAAAA0002','AAAAAAA0001','AAAAAAA0003']);
  assert.deepEqual(filterInterviews(rows,{sort:'comments'}).map(i=>i.id),['AAAAAAA0004','AAAAAAA0002','AAAAAAA0003','AAAAAAA0001']);
  assert.equal(filterInterviews(rows,{sort:'newest'})[0].id,'AAAAAAA0003');
  assert.equal(filterInterviews(rows,{sort:'oldest'})[0].id,'AAAAAAA0002');
  assert.equal(rows[0].id,'AAAAAAA0001');
});
test('YouTube time links keep the source video and floor valid cue seconds',()=>{
  assert.equal(youtubeTimeURL('AbCdEfGh_12',123.9),'https://www.youtube.com/watch?v=AbCdEfGh_12&t=123s');
  assert.equal(youtubeTimeURL('AbCdEfGh_12',0),'https://www.youtube.com/watch?v=AbCdEfGh_12&t=0s');
  assert.equal(youtubeTimeURL('AbCdEfGh_12',-10),'https://www.youtube.com/watch?v=AbCdEfGh_12&t=0s');
  assert.throws(()=>youtubeTimeURL('invalid?x',10),/影片 ID/);
});

test('deployed HTML references content-addressed scripts, styles and article data',async()=>{
  await build();
  const {createHash}=await import('node:crypto');
  const manifest=JSON.parse(await readFile(new URL('../dist/build.json',import.meta.url),'utf8'));
  assert.match(manifest.buildId,/^[a-f0-9]{12}$/);
  for(const [original,versioned] of Object.entries(manifest.assets)) {
    const content=await readFile(new URL('../dist/'+versioned.slice(2),import.meta.url));
    const hash=createHash('sha256').update(content).digest('hex').slice(0,12);
    assert.ok(versioned.includes('.'+hash+'.'));
    assert.deepEqual(content,await readFile(new URL('../dist/'+original.slice(2),import.meta.url)));
  }
  const merged=JSON.parse(await readFile(new URL('../dist/data/interviews.json',import.meta.url),'utf8'));
  for(const relative of ['index.html',`interviews/${merged.interviews[0].slug}/index.html`,...rankingOptions.map(([mode])=>`rankings/${mode}/index.html`)]) {
    const page=await readFile(new URL('../dist/'+relative,import.meta.url),'utf8');
    assert.ok(page.includes(`name="build-version" content="${manifest.buildId}"`));
    assert.ok(page.includes(`name="archive-data-url" content="${manifest.assets['./data/interviews.json']}"`));
    for(const [original,versioned] of Object.entries(manifest.assets)) {
      if(original.startsWith('./assets/'))assert.ok(page.includes(versioned));
      assert.ok(!page.includes(`src="${original}"`)&&!page.includes(`href="${original}"`));
    }
  }
});

test('home and every interview expose a real 1200 by 630 JPEG social cover',async()=>{
  await build();
  const manifest=await readCollection(fileURLToPath(new URL('../data/',import.meta.url)),'covers.json');
  const data=JSON.parse(await readFile(new URL('../dist/data/interviews.json',import.meta.url),'utf8'));
  const config=JSON.parse(await readFile(new URL('../data/site.json',import.meta.url),'utf8'));
  assert.ok(manifest.interviews.length<=data.interviews.length);
  assert.ok(data.interviews.every(item=>item.coverImage?.url));
  function dimensions(bytes){
    assert.equal(bytes.readUInt16BE(0),0xffd8);
    let offset=2;
    while(offset<bytes.length){
      assert.equal(bytes[offset],0xff);const marker=bytes[offset+1];offset+=2;
      const length=bytes.readUInt16BE(offset);
      if([0xc0,0xc1,0xc2].includes(marker))return [bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)];
      offset+=length;
    }
    throw new Error('JPEG dimensions missing');
  }
  for(const cover of [manifest.home,...manifest.interviews]){
    assert.deepEqual(dimensions(await readFile(new URL('../'+cover.file,import.meta.url))),[1200,630]);
  }
  const home=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const body=home.slice(home.indexOf('<main'));
  assert.ok(body.indexOf('class="hero wrap"')<body.indexOf('collection-statistics'));
  assert.ok(body.indexOf('collection-statistics')<body.indexOf('id="ranking-panel"'));
  assert.match(body,/data-ranking="views" aria-current="true"/);
  const pages=[['index.html',data.homeCover],...data.interviews.map(item=>['interviews/'+item.slug+'/index.html',item.coverImage])];
  for(const [path,cover] of pages){
    const html=await readFile(new URL('../dist/'+path,import.meta.url),'utf8');
    assert.ok(html.includes(`property="og:image" content="${new URL(cover.url,config.siteUrl).href}"`));
    assert.ok(html.includes(`property="og:image:width" content="${cover.width}"`));
    assert.ok(html.includes(`property="og:image:height" content="${cover.height}"`));
    assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
    if(path!=='index.html'){
      assert.ok(html.includes('data-share-summary')&&html.includes('data-share-text='));
      assert.ok(html.includes(`class="article-cover-image" src="${cover.url}"`));
    }
  }
});

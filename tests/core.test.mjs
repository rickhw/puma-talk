import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseSubtitles, filterInterviews, validateArchive, escapeHTML, formatTime, interviewPath } from '../assets/core.js';
import { build } from '../scripts/build.mjs';
import { handleRequest } from '../scripts/serve.mjs';

const archive = JSON.parse(await readFile(new URL('../data/interviews.json', import.meta.url)));
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
  assert.equal((await request('/assets/missing.js')).status,404);
  assert.equal((await request('/%E0%A4%A')).status,400);
  assert.equal((await request('/','POST')).status,405);
  assert.equal((await request('/','HEAD')).body,undefined);
  const html = String((await request('/')).body);
  assert.match(html,/lang="zh-Hant"/);
  assert.match(html,/\.\/assets\/app.bundle.js/);
  assert.match(html,/id="archive-data"/);
  const site=JSON.parse(await readFile(new URL('../data/site.json',import.meta.url),'utf8'));
  if(site.analytics?.gtmContainerId) {
    assert.ok(html.indexOf('id="site-config"')<html.indexOf('<body>'));
    assert.ok(html.indexOf('event:\'gtm.js\'')<html.indexOf('<body>'));
    assert.ok(html.includes(`<body>\n  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${site.analytics.gtmContainerId}"`));
  }

  const embedded = html.match(/<script id="archive-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.equal(validateArchive(JSON.parse(embedded)).interviews.length,archive.interviews.length);
  const bundle = String((await request('/assets/app.bundle.js')).body);
  assert.doesNotThrow(() => new vm.Script(bundle, {filename:'app.bundle.js'}));
  const publicData=JSON.parse(String((await request('/data/interviews.json')).body));
  const config=JSON.parse(await readFile(new URL('../data/site.json',import.meta.url),'utf8'));
  assert.equal(new Set(publicData.interviews.map(item=>item.slug)).size,archive.interviews.length);
  for (const item of publicData.interviews) {
    const pathname=interviewPath(item).slice(1);
    const response=await request(pathname);
    assert.equal(response.status,200,pathname);
    const page=String(response.body);
    assert.ok(page.includes('<base href="../../">'));
    assert.ok(page.includes(`href="${interviewPath(item)}#main"`));
    assert.ok(page.includes(`name="interview-id" content="${item.id}"`));
    const canonical=config.siteUrl?new URL(interviewPath(item),config.siteUrl).href:interviewPath(item);
    assert.ok(page.includes(`rel="canonical" href="${escapeHTML(canonical)}"`));
    assert.ok(!page.includes('id="archive-data"'),'article pages share the archive JSON instead of duplicating it');
    if (item.article) {
      assert.ok(page.includes(escapeHTML(item.article.lead)));
      const label=item.article.status==='reviewed'?'摘要已校對':'AI 摘要';
      assert.ok(page.includes('專訪重點')&&page.includes('總結')&&page.includes(label));
    }
  }
  const directory=interviewPath(publicData.interviews[0]).slice(1,-1);
  const redirected=await request(directory+'?t=12');
  assert.equal(redirected.status,301);assert.equal(redirected.headers.Location,directory+'/?t=12');
});

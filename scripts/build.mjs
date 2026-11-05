import { readFile, mkdir, rm, cp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateArchive, mergeArticles, interviewPath, articleSummaryHTML, escapeHTML, transcriptFingerprintText } from '../assets/core.js';
import { mergeEnhancements, collectionStatsHTML, videoStatsHTML } from '../assets/insights.js';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function build() {
  const archive = validateArchive(JSON.parse(await readFile(path.join(root, 'data/interviews.json'), 'utf8')));
  let articles = {version:1, articles:[]};
  try { articles = JSON.parse(await readFile(path.join(root, 'data/articles.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let data = mergeArticles(archive, articles);
  for (const item of data.interviews) if (item.article) {
    const fingerprint = createHash('sha256').update(transcriptFingerprintText(item.transcript)).digest('hex');
    if (fingerprint !== item.article.provenance.transcriptSha256) throw new Error(`${item.id} 逐字稿已更新，請先重新整理摘要`);
  }
  async function optionalJSON(name,fallback) {
    try{return JSON.parse(await readFile(path.join(root,'data',name),'utf8'));}
    catch(error){if(error.code==='ENOENT')return fallback;throw error;}
  }
  const editorial=await optionalJSON('editorial.json',{version:1,records:[]});
  const statistics=await optionalJSON('statistics.json',{version:1,videos:[]});
  for(const record of editorial.records) {
    const source=archive.interviews.find(item=>item.id===record.videoId);
    if(!source||createHash('sha256').update(transcriptFingerprintText(source.transcript)).digest('hex')!==record.sourceSha256)throw new Error(`${record.videoId} 校對版本來源已更新，請重新處理`);
    if(record.review.keywordSelection==='article-grounded') {
      const article=articles.articles.find(row=>row.videoId===record.videoId);
      const context=article&&[article.lead,...article.highlights.flatMap(point=>[point.title,point.text]),article.conclusion].join('\n');
      if(!context||createHash('sha256').update(context).digest('hex')!==record.review.keywordInputSha256)throw new Error(`${record.videoId} 文章已更新，請重新挑選關鍵字`);
    }
  }
  data=mergeEnhancements(data,editorial,statistics);
  const config = JSON.parse(await readFile(path.join(root, 'data/site.json'), 'utf8'));
  if (config.analytics?.measurementId && !/^G-[A-Z0-9]+$/.test(config.analytics.measurementId)) throw new Error('GA4 Measurement ID 格式錯誤');
  if (config.siteUrl && (!/^https?:\/\//.test(config.siteUrl) || !config.siteUrl.endsWith('/'))) throw new Error('siteUrl 需為以 / 結尾的完整 HTTP(S) 網址');
  const out = path.join(root, 'dist');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const name of ['index.html', 'assets']) await cp(path.join(root, name), path.join(out, name), { recursive: true });
  // Small, dependency-free bundle also works when index.html is opened via file://.
  const core = (await readFile(path.join(root, 'assets/core.js'), 'utf8')).replace(/^export /gm, '');
  const insights=(await readFile(path.join(root,'assets/insights.js'),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  const app = (await readFile(path.join(root, 'assets/app.js'), 'utf8')).replace(/^import .*;\n/gm, '');
  await writeFile(path.join(out, 'assets/app.bundle.js'), `(async () => {\n${core}\n${insights}\nconst esc = escapeHTML;\n${app}\n})();\n`);
  const jsonScript = value => JSON.stringify(value).replaceAll('<','\\u003c');
  const analytics = `<script id="site-config" type="application/json">${jsonScript(config)}</script>\n  <script defer src="./assets/analytics.js"></script>`;
  const template = await readFile(path.join(root, 'index.html'), 'utf8');
  const html = template.replace('<script type="module" src="./assets/app.js"></script>', `<script id="archive-data" type="application/json">${jsonScript(data)}</script>\n  <script defer src="./assets/app.bundle.js"></script>\n  ${analytics}`)
    .replace('<main id="main" tabindex="-1"><div class="loading-state">正在打開專訪資料庫…</div></main>',`<main id="main" tabindex="-1">${collectionStatsHTML(data.interviews,data.statisticsUpdatedAt)}<div class="loading-state">正在載入專訪…</div></main>`);
  await writeFile(path.join(out, 'index.html'), html);
  for (const item of data.interviews) {
    const title = `${item.title}｜PUMA TALKS`;
    const description = item.article?.lead || item.description;
    const canonical = config.siteUrl ? new URL(interviewPath(item), config.siteUrl).href : interviewPath(item);
    const metadata = `<base href="../../">\n  <meta name="interview-id" content="${escapeHTML(item.id)}">\n  <meta name="article-slug" content="${escapeHTML(item.slug)}">\n  <link rel="canonical" href="${escapeHTML(canonical)}">`;
    const staticContent = `<div class="detail-page wrap"><a class="back-link" href="./index.html#archive">← 回到所有專訪</a><header class="detail-heading"><div><div class="eyebrow">THE CONVERSATION ／ ${escapeHTML(item.category)}</div><h1>${escapeHTML(item.title)}</h1><p class="detail-meta">${escapeHTML(item.channel)} · <time datetime="${item.date}">${item.date}</time></p></div></header>${videoStatsHTML(item)}<div class="card-tags">${item.tags.map(tag=>`<a class="tag" href="./index.html?tag=${encodeURIComponent(tag)}#archive"># ${escapeHTML(tag)}</a>`).join('')}</div>${articleSummaryHTML(item)}<p class="static-source-link"><a class="button button-outline" href="${escapeHTML(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">觀看原始影片 ↗</a></p></div>`;
    let page = template.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  ${metadata}`)
      .replace('href="#main"', `href="${escapeHTML(interviewPath(item))}#main"`)
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHTML(title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHTML(description)}">`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHTML(title)}">`)
      .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeHTML(description)}">`)
      .replace('<script type="module" src="./assets/app.js"></script>', `<script defer src="./assets/app.bundle.js"></script>\n  ${analytics}`)
      .replace('<main id="main" tabindex="-1"><div class="loading-state">正在打開專訪資料庫…</div></main>', `<main id="main" tabindex="-1" data-static-article="true">${staticContent}</main>`);
    const directory = path.join(out, 'interviews', item.slug);
    await mkdir(directory, {recursive:true});
    await writeFile(path.join(directory, 'index.html'), page);
  }
  await mkdir(path.join(out, 'data'), { recursive: true });
  await writeFile(path.join(out, 'data/interviews.json'), JSON.stringify(data));
  await mkdir(path.join(out, 'examples'), { recursive: true });
  await cp(path.join(root, 'docs/reader-demo.srt'), path.join(out, 'examples/reader-demo.srt'));
  await writeFile(path.join(out, '.nojekyll'), '');
  console.log(`已建置 ${data.interviews.length} 支訪談影片與獨立文章頁 → dist/`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();

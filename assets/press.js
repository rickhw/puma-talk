import {escapeHTML} from './core.js';

export const pressPath = './english-press/';
export const pressTypes = ['專訪', '人物報導', '新聞', '評論', '影音專訪'];
export const pressTopics = ['城市與市政', '人物與經歷', '資訊與認知作戰', '民防與韌性', '兩岸與國際'];

export function validatePress(document) {
  if (document?.version !== 1 || !Array.isArray(document.reports) || !Number.isFinite(Date.parse(document.updatedAt))) throw new Error('英文報導資料格式無效');
  for (const field of ['title', 'description', 'scopeNote']) if (typeof document[field] !== 'string' || !document[field].trim()) throw new Error('英文報導說明缺漏');
  const ids = new Set(), urls = new Set();
  for (const report of document.reports) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(report.id) || ids.has(report.id)) throw new Error('英文報導 ID 無效或重複');
    for (const field of ['publisher', 'title', 'titleZh', 'summary']) if (typeof report[field] !== 'string' || !report[field].trim() || report[field].length > 500) throw new Error('英文報導文字無效');
    if (!pressTypes.includes(report.type) || report.language !== 'en' || !Array.isArray(report.topics) || !report.topics.length || new Set(report.topics).size !== report.topics.length || report.topics.some(topic => !pressTopics.includes(topic))) throw new Error('英文報導分類無效');
    const date = report.publishedOn;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || !Number.isFinite(Date.parse(report.checkedAt))) throw new Error('英文報導日期無效');
    let url;
    try { url = new URL(report.url); } catch { throw new Error('英文報導網址無效'); }
    if (url.protocol !== 'https:' || url.username || url.password || urls.has(url.href)) throw new Error('英文報導網址不安全或重複');
    for (const field of ['author', 'sourceNote']) if (report[field] !== undefined && typeof report[field] !== 'string') throw new Error('英文報導來源說明無效');
    if (report.verification !== 'publisher-page') throw new Error('英文報導尚未核對刊載頁');
    ids.add(report.id); urls.add(url.href);
  }
  return document;
}

export function filterPress(reports, filters = {}) {
  const terms = String(filters.q || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return reports.filter(report => {
    const text = [report.title, report.titleZh, report.publisher, report.author, report.summary, ...report.topics].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term)) && (!filters.publisher || report.publisher === filters.publisher) && (!filters.topic || report.topics.includes(filters.topic)) && (!filters.type || report.type === filters.type) && (!filters.year || report.publishedOn.slice(0, 4) === filters.year);
  }).sort((a, b) => (filters.sort === 'oldest' ? a.publishedOn.localeCompare(b.publishedOn) : b.publishedOn.localeCompare(a.publishedOn)) || a.id.localeCompare(b.id));
}

export function pressFilters(search = '') {
  const params = new URLSearchParams(search);
  return Object.fromEntries(['q', 'publisher', 'topic', 'type', 'year', 'sort'].map(key => [key, params.get(key) || '']));
}

export function pressResultsHTML(reports, total) {
  return `<p class="press-result-count" role="status" aria-live="polite">顯示 <strong>${reports.length}</strong> / ${total} 篇報導</p><div class="press-list">${reports.length ? reports.map(report => `<article class="press-report" id="${escapeHTML(report.id)}" data-press-report="${escapeHTML(report.id)}">
    <div class="press-byline"><span class="press-publisher">${escapeHTML(report.publisher)}</span><time datetime="${report.publishedOn}">${report.publishedOn.replaceAll('-', '.')}</time><span class="press-kind ${report.type === '評論' ? 'press-opinion' : ''}">${escapeHTML(report.type)}</span></div>
    <div class="press-reading-pair"><div class="press-headlines"><h2><a href="${escapeHTML(report.url)}" target="_blank" rel="noopener noreferrer" lang="en">${escapeHTML(report.title)}<span aria-hidden="true"> ↗</span></a></h2><p class="press-chinese-title">${escapeHTML(report.titleZh)}</p>${report.author ? `<p class="press-author">${escapeHTML(report.author)}</p>` : ''}</div><div class="press-guide"><span class="press-guide-label">中文導讀</span><p>${escapeHTML(report.summary)}</p><div class="press-report-topics">${report.topics.map(topic => `<a href="${pressPath}?topic=${encodeURIComponent(topic)}#press-results" data-press-topic="${escapeHTML(topic)}">${escapeHTML(topic)}</a>`).join('')}</div>${report.sourceNote ? `<p class="press-source-note">${escapeHTML(report.sourceNote)}</p>` : ''}</div></div>
    </article>`).join('') : '<div class="press-empty"><h2>沒有符合條件的報導</h2><p>試試較短的關鍵字，或清除篩選重新瀏覽。</p><button type="button" class="button button-outline" data-press-clear>清除篩選</button></div>'}</div>`;
}

export function pressPageHTML(document, filters = {}, interactive = false) {
  const reports = filterPress(document.reports, filters);
  const options = (values, chosen, label) => `<option value="">${label}</option>${values.map(value => `<option value="${escapeHTML(value)}"${value === chosen ? ' selected' : ''}>${escapeHTML(value)}</option>`).join('')}`;
  const publishers = [...new Set(document.reports.map(report => report.publisher))].sort((a, b) => a.localeCompare(b));
  const years = [...new Set(document.reports.map(report => report.publishedOn.slice(0, 4)))].sort().reverse();
  return `<section class="press-page wrap" aria-labelledby="press-title"><header class="press-hero"><div><div class="eyebrow">PUMA, IN THE PRESS</div><h1 id="press-title">英文報導<span class="heading-dot">.</span></h1><p class="press-intro">從不同媒體的提問，<br>讀懂報導中的沈伯洋。</p></div><div class="press-editor-note"><span class="press-index-label">ENGLISH ORIGINALS / 中文導讀</span><p>${escapeHTML(document.description)}</p><p class="press-coverage">${document.reports.length} 篇選錄 · ${publishers.length} 家媒體<br>最近整理 ${escapeHTML(document.updatedAt.slice(0, 10))}</p></div></header>
    <div class="press-topic-links" aria-label="報導主題">${pressTopics.map(topic => `<a href="${pressPath}?topic=${encodeURIComponent(topic)}#press-results" data-press-topic="${escapeHTML(topic)}"${filters.topic === topic ? ' aria-current="true"' : ''}>${escapeHTML(topic)}<span aria-hidden="true"> ↗</span></a>`).join('')}</div>
    <form class="press-controls" data-press-form role="search" aria-label="搜尋英文報導"><fieldset${interactive ? '' : ' disabled'}><legend class="press-visually-hidden">篩選英文報導</legend><label class="press-search"><span>搜尋報導</span><input type="search" name="q" value="${escapeHTML(filters.q || '')}" placeholder="標題、媒體、主題或關鍵字" autocomplete="off"></label><div class="press-selects"><label><span>媒體</span><select name="publisher">${options(publishers, filters.publisher, '全部媒體')}</select></label><label><span>類型</span><select name="type">${options(pressTypes, filters.type, '全部類型')}</select></label><label><span>年份</span><select name="year">${options(years, filters.year, '全部年份')}</select></label><label><span>排序</span><select name="sort"><option value="newest"${filters.sort !== 'oldest' ? ' selected' : ''}>最新優先</option><option value="oldest"${filters.sort === 'oldest' ? ' selected' : ''}>最早優先</option></select></label><button type="button" class="press-reset" data-press-clear>清除篩選</button></div><input type="hidden" name="topic" value="${escapeHTML(filters.topic || '')}"></fieldset></form>
    <div class="press-active-topic" data-press-active-topic>${filters.topic ? `主題：${escapeHTML(filters.topic)} <button type="button" data-press-remove-topic>移除主題 ×</button>` : ''}</div>
    <div id="press-results">${pressResultsHTML(reports, document.reports.length)}</div>
    <aside class="press-scope"><h2>關於這份閱讀索引</h2><p>${escapeHTML(document.scopeNote)}</p><p>評論呈現作者觀點，專訪保留受訪者的陳述範圍；政策、指控與選情均需放回發表當時閱讀。原文可能因媒體政策需登入或訂閱。</p><a href="./index.html#archive">繼續閱讀站內專訪與逐字稿 →</a></aside></section>`;
}

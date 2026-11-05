import { categories, statusLabels, escapeHTML as esc, formatTime, filterInterviews, parseSubtitles, validateArchive, interviewPath, interviewSharePath, articleSummaryHTML } from './core.js';
import {collectionStatsHTML, videoStatsHTML, keywordCloudHTML} from './insights.js';

const icons = {
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  upRight: '<path d="M6 18 18 6M6 6h12v12"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  play: '<path d="m9 5 11 7-11 7z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  share: '<path d="M12 16V3m-5 5 5-5 5 5M6 11H4v10h16V11h-2"/>',
  text: '<path d="M4 5h16M4 10h16M4 15h11M4 20h8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  headphones: '<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12h4v8H4zM16 12h4v8h-4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload: '<path d="M12 17V4m-5 5 5-5 5 5M4 16v5h16v-5"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
const main = document.querySelector('#main');
const skipLink = document.querySelector('.skip-link');
if (skipLink) { const target = new URL(location.href); target.hash = 'main'; skipLink.href = target.href; }
const analyticsEnabled = /^G-[A-Z0-9]+$/.test(JSON.parse(document.querySelector('#site-config')?.textContent || '{}').analytics?.measurementId || '');
const storageKey = 'puma-talks:saved:v1', transcriptKey = 'puma-talks:transcripts:v1';
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
let saved = readStorage(storageKey, []);
if (!Array.isArray(saved)) saved = [];
let localTranscripts = readStorage(transcriptKey, {});
if (!localTranscripts || typeof localTranscripts !== 'object' || Array.isArray(localTranscripts)) localTranscripts = {};
let archive, items = [], toastTimer, filters, activeItem, visibleCue = 0;
const dateLabel = date => date.replaceAll('-', '.');
const detailURL = id => interviewPath(items.find(item => item.id === id)) + (location.protocol === 'file:' ? 'index.html' : '');
const topicColors = ['plum', 'sage', 'peach', 'blue', 'pink'];
const tagsHTML = tags => tags.map(t => `<button class="tag" data-tag="${esc(t)}"># ${esc(t)}</button>`).join('');

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message; element.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('show'), 3500);
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { toast('瀏覽器無法儲存資料；請下載備份後再離開。'); return false; }
}
function updateSaved() {
  document.querySelector('#saved-count').textContent = saved.length;
  document.querySelectorAll('[data-save]').forEach(button => {
    const isSaved = saved.includes(button.dataset.save);
    button.setAttribute('aria-pressed', String(isSaved));
    button.setAttribute('aria-label', isSaved ? '取消收藏' : '收藏專訪');
    button.classList.toggle('is-saved', isSaved);
    if (button.classList.contains('save-detail')) button.innerHTML = icon('bookmark') + (isSaved ? '已收藏' : '收藏專訪');
  });
}
function photo(item, large = false) {
  return `<div class="photo-fallback theme-${topicColors[categories.indexOf(item.category)]}"><span class="fallback-channel">${esc(item.channel)}</span><span class="fallback-title">${esc(item.title)}</span><span class="fallback-brand">PUMA <b>TALKS</b> ↗</span><img ${large ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" src="https://i.ytimg.com/vi/${item.id}/hqdefault.jpg" alt="${esc(item.channel)}專訪影片縮圖" data-thumbnail></div>`;
}
function status(item) {
  return `<span class="transcript-status ${item.transcript.length ? 'available' : ''}">${icon(item.transcript.length ? 'text' : 'clock')}${esc(localTranscripts[item.id] ? '本機匯入字幕' : item.aiReview ? (item.aiReview.method === 'ai-translated' ? 'AI 翻譯與校對' : 'AI 輔助校對') : statusLabels[item.transcriptStatus])}</span>`;
}
function provenanceHTML(item) {
  if (localTranscripts[item.id]) return '<div class="transcript-provenance">來源：此瀏覽器匯入的字幕檔。</div>';
  const source = item.transcriptProvenance;
  const review = item.transcriptReview;
  if (!source && !review && !item.aiReview) return '';
  const kinds = { 'asr-local':'本機語音辨識', 'provided-subtitle':'提供的字幕檔', 'youtube-original':'原頻道字幕', 'youtube-auto':'YouTube 自動字幕' };
  const parts = [];
  if (item.aiReview) { parts.push(item.aiReview.method === 'ai-translated' ? 'AI 翻譯與校對 · 正體中文譯稿' : 'AI 輔助校對 · 正體中文'); parts.push(`校對更新：${esc(String(item.aiReview.checkedAt).split('T')[0])}`); }
  if (source) {
    parts.push(`來源：${esc(kinds[source.kind] || '匯入字幕')}`);
    if (source.model) parts.push(`模型：${esc(source.model)}`);
    if (source.language) parts.push(`語言：${esc(source.language)}`);
  }
  if (review && item.transcriptStatus === 'reviewed') {
    parts.push(`校對：${esc(review.reviewer)} · ${esc(String(review.reviewedAt || '').split('T')[0])}`);
    if (review.note) parts.push(`註記：${esc(review.note)}`);
  }
  return `<div class="transcript-provenance">${parts.map(part => `<span>${part}</span>`).join('')}</div>`;
}
function card(item, index) {
  return `<article class="interview-card" style="--card-delay:${Math.min(index, 5) * 40}ms">
    <div class="card-visual"><a href="${detailURL(item.id)}" class="thumbnail-link" aria-label="閱讀：${esc(item.title)}">${photo(item)}<span class="card-play">${icon('play')}</span><span class="category-badge">${esc(item.category)}</span></a><button class="save-button" data-save="${item.id}" aria-label="收藏專訪" aria-pressed="false">${icon('bookmark')}</button></div>
    <div class="card-meta"><span>${esc(item.channel)}</span><time datetime="${item.date}">${dateLabel(item.date)}</time></div>
    <h3><a href="${detailURL(item.id)}">${esc(item.title)}</a></h3>
    <div class="card-tags">${tagsHTML(item.tags.slice(0, 5))}</div>
    ${videoStatsHTML(item,true)}<div class="card-bottom">${status(item)}<a class="read-link" href="${detailURL(item.id)}" aria-label="閱讀 ${esc(item.title)}">查看專訪 ${icon('arrow')}</a></div>
  </article>`;
}
function home() {
  const params = new URLSearchParams(location.search);
  filters = Object.fromEntries(['q', 'category', 'tag', 'status', 'sort'].map(k => [k, params.get(k) || '']));
  filters.saved = params.get('saved') === '1';
  const featured = items.find(i => i.featured) || items[0];
  activeItem = null;
  document.title = 'PUMA TALKS｜沈伯洋專訪資料庫';
  main.innerHTML = `${collectionStatsHTML(items,archive.statisticsUpdatedAt)}<section class="hero wrap" aria-labelledby="hero-title">
    <div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> PUMA INTERVIEW ARCHIVE</div><h1 id="hero-title">從一場對話，<br>認識<span class="name-underline">沈伯洋<svg viewBox="0 0 270 20" aria-hidden="true"><path d="M4 13Q110 0 265 10"/></svg></span>。</h1><p class="hero-description">關於世界的思考，也關於生活的選擇。<br>把散落各處的專訪，整理成可以慢慢理解的脈絡。</p><a class="button button-dark" href="#archive">找一場，開始聽 ${icon('arrow')}</a><div class="hero-note"><span class="tiny-wave"><i></i><i></i><i></i><i></i><i></i></span>完整對話．正體中文逐字稿．AI 輔助校對</div></div>
    <div class="hero-feature"><div class="feature-topline"><span>從這場對話開始</span><span class="feature-star" aria-hidden="true">✳</span></div><a class="feature-image" href="${detailURL(featured.id)}" aria-label="查看精選專訪">${photo(featured, true)}<span class="feature-play">${icon('play')}</span></a><div class="feature-caption"><span class="feature-label">本期選聽</span><a href="${detailURL(featured.id)}"><h2>${esc(featured.title)}</h2><span>${esc(featured.channel)} <span class="caption-dot">·</span> ${dateLabel(featured.date)}</span></a><a class="circle-arrow" href="${detailURL(featured.id)}" aria-label="查看精選專訪">${icon('upRight')}</a></div></div>
  </section>
  <div class="archive-intro"><div class="wrap intro-inner"><span>留一點時間，聽完整的想法。</span><span>${items.length} 支訪談影片<span class="intro-dot">·</span>${categories.length} 個主題<span class="intro-dot">·</span>持續整理中 ${icon('headphones')}</span></div></div>
  <section class="keyword-section wrap" aria-labelledby="keywords-heading"><div class="keyword-section-header"><h2 id="keywords-heading">跟著關鍵字，找到想聽的對話。</h2><p>字越大，出現的專訪越多；數字為影片數。</p></div>${keywordCloudHTML(items,45)}</section>
  <section class="archive-section wrap" id="archive" aria-labelledby="archive-title"><div class="section-heading"><div><div class="eyebrow">THE COLLECTION</div><h2 id="archive-title">${filters.saved ? '我的收藏' : '每場對話，都有新的發現'}<span class="heading-dot">.</span></h2></div><a href="./index.html?view=topics" class="text-link">不知道從哪開始？探索主題 ${icon('upRight')}</a></div>
    <div class="search-bar"><label class="search-input">${icon('search')}<input id="archive-search" type="search" placeholder="搜尋專訪、節目、標籤或逐字稿內容…" value="${esc(filters.q)}" aria-label="搜尋專訪與逐字稿" autocomplete="off"><kbd aria-hidden="true">/</kbd></label><label class="select-wrap"><span>逐字稿</span><select id="status-filter" aria-label="逐字稿狀態"><option value="">全部狀態</option value="available">有逐字稿</option><option value="ai">AI 校對</option><option value="pending">整理中</option></select></label></div>
    <div class="category-tabs" role="group" aria-label="依主題分類"><button class="category-tab" data-category="">全部專訪 <span>${items.length}</span></button>${categories.map(c => `<button class="category-tab" data-category="${c}">${c}</button>`).join('')}</div>
    <div class="results-toolbar"><p id="results-count" role="status" aria-live="polite"></p><label class="sort-label">排序<select id="sort-filter" aria-label="專訪排序"><option value="newest">最新優先</option><option value="oldest">最早優先</option></select></label></div>
    <div id="active-filters" class="active-filters"></div><div id="interview-grid" class="interview-grid"></div>
    <div class="collection-note">${icon('text')}<p>每一份逐字稿，都從保留脈絡開始。<span>我們使用 AI 技術校對逐字稿，統一以正體中文呈現；點擊時間碼即可對照原始影片。</span></p><a href="./index.html?view=about">關於計畫 ${icon('arrow')}</a></div>
  </section>`;
  document.querySelector('#status-filter').value = filters.status;
  document.querySelector('#sort-filter').value = filters.sort === 'oldest' ? 'oldest' : 'newest';
  updateResults(false);
}
function updateResults(changeURL = true) {
  const results = filterInterviews(items, filters, saved);
  document.querySelector('#results-count').innerHTML = `共 <strong>${results.length}</strong> 支訪談影片${filters.q ? `，搜尋「${esc(filters.q)}」` : ''}`;
  document.querySelector('#interview-grid').innerHTML = results.length ? results.map(card).join('') : `<div class="empty-state">${icon(filters.saved ? 'bookmark' : 'search')}<h3>${filters.saved && !saved.length ? '把想慢慢聽的對話，留在這裡。' : '這個條件下，還沒有找到專訪。'}</h3><p>${filters.saved && !saved.length ? '點擊專訪卡片上的書籤，就能在這裡找到它。收藏儲存在目前的瀏覽器。' : '試試其他關鍵字，或清除篩選條件後重新探索。'}</p><button class="button button-dark" data-clear>瀏覽所有專訪 ${icon('arrow')}</button></div>`;
  document.querySelectorAll('[data-category]').forEach(button => { const active = button.dataset.category === filters.category; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  const chips = [];
  if (filters.saved) chips.push('<button class="filter-chip" data-remove-filter="saved">我的收藏 ×</button>');
  for (const key of ['category', 'tag', 'status']) if (filters[key]) chips.push(`<button class="filter-chip" data-remove-filter="${key}">${esc(key === 'status' ? { available: '有逐字稿', ai: 'AI 校對', reviewed: '人工校對', pending: '整理中' }[filters[key]] || filters[key] : filters[key])} ×</button>`);
  if (chips.length || filters.q) chips.push('<button class="clear-link" data-clear>清除篩選</button>');
  document.querySelector('#active-filters').innerHTML = chips.join('');
  updateSaved();
  if (changeURL) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value === true ? '1' : value);
    history.replaceState(null, '', `./index.html${params.size ? '?' + params : ''}${location.hash}`);
  }
}
function detail(item) {
  activeItem = item; visibleCue = 0;
  document.title = `${item.title}｜PUMA TALKS`;
  const params = new URLSearchParams(location.search);
  const start = Math.min(604800, Math.max(0, Number(params.get('t')) || 0));
  main.innerHTML = `<div class="detail-page wrap"><a class="back-link" href="./index.html#archive">${icon('back')} 回到所有專訪</a><div class="detail-heading"><div><div class="eyebrow">THE CONVERSATION <span>／ ${esc(item.category)}</span></div><h1>${esc(item.title)}</h1><p class="detail-meta">${esc(item.channel)} <span>·</span> <time datetime="${item.date}">${dateLabel(item.date)}</time></p></div><button class="button button-outline save-detail" data-save="${item.id}" aria-pressed="false">${icon('bookmark')} 收藏專訪</button></div>${videoStatsHTML(item)}<div class="detail-layout"><aside class="video-column"><div id="video-player" class="video-player"><button class="player-cover" data-play="${start}" aria-label="在本站播放 YouTube 專訪">${photo(item, true)}<span class="big-play">${icon('play')}</span><span class="player-cover-note">點擊載入 YouTube 播放器</span></button></div><a class="source-button" href="${esc(item.sourceUrl)}${start ? '&t=' + start + 's' : ''}" target="_blank" rel="noopener noreferrer">在 YouTube 觀看完整專訪 ${icon('upRight')}</a><div class="detail-description"><span class="eyebrow">關於這場對話</span><p>${esc(item.description)}</p><div class="card-tags">${tagsHTML(item.tags)}</div></div><details class="source-details"><summary>原始標題與收錄來源</summary><p>${esc(item.originalTitle || item.title)}</p><p>${item.metadataStatus === 'listed' ? '日期與節目資料依公開專訪清單收錄，尚待向原頻道逐一核對。主題標籤為本站編輯分類，不代表受訪者原話。' : '影片資料由 YouTube 中繼資料匯入；主題標籤為本站編輯分類。'}</p><a href="${esc(item.referenceUrl || item.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看資料來源 ↗</a></details></aside><div class="reading-column">${articleSummaryHTML(item)}<section class="transcript-panel" aria-labelledby="transcript-heading"><div class="transcript-header"><div><span class="eyebrow">READ THE CONVERSATION</span><h2 id="transcript-heading">逐字稿<span class="heading-dot">.</span></h2></div>${status(item)}</div><div class="transcript-search">${icon('search')}<input id="transcript-search" type="search" placeholder="在這場對話中尋找…" aria-label="搜尋本篇逐字稿" ${item.transcript.length ? '' : 'disabled'}><span id="cue-count">${item.transcript.length ? item.transcript.length + ' 段' : '尚無字幕'}</span></div><div id="transcript-body"></div><div class="transcript-tools"><button class="text-link" data-download ${item.transcript.length ? '' : 'disabled'}>${icon('download')} 下載逐字稿</button><button class="text-link" data-share>${icon('share')} 複製連結</button></div><details class="import-details"><summary>${icon('upload')} 匯入這場專訪的字幕</summary><p>選擇 SRT 或 VTT 字幕檔，就能試用時間碼閱讀與全文搜尋。匯入內容僅儲存在此瀏覽器。</p><label class="button button-outline file-button">${icon('upload')} 選擇字幕檔<input id="subtitle-file" type="file" accept=".srt,.vtt,text/vtt,application/x-subrip"></label><div class="import-actions"><button class="text-link" data-export ${localTranscripts[item.id] ? '' : 'hidden'}>匯出 JSON 資料</button><button class="text-link" data-reset-transcript ${localTranscripts[item.id] ? '' : 'hidden'}>移除本機字幕</button></div><p class="import-hint">${localTranscripts[item.id] ? '目前顯示本機匯入版本。需匯出 JSON 並加入專案資料，才會出現在公開網站。' : '本站不會上傳檔案。請只匯入你有權使用的字幕。'}</p></details></section></div></div><div class="related-section"><div class="section-heading"><div class="eyebrow">KEEP LISTENING</div><h2>下一場，聽聽這些</h2></div><div class="interview-grid">${items.filter(i => i.id !== item.id).sort((a,b) => Number(b.category === item.category) - Number(a.category === item.category)).slice(0,3).map(card).join('')}</div></div></div>`;
  renderCues(); updateSaved();
}
function renderCues(query = '') {
  const body = document.querySelector('#transcript-body');
  if (!activeItem.transcript.length) {
    body.innerHTML = `<div class="transcript-empty"><div class="paper-illustration" aria-hidden="true"><span></span><span></span><span></span><i>${icon('headphones')}</i></div><h3>先聽對話，文字慢慢來。</h3><p>這場專訪的逐字稿尚未匯入。<br>你可以先觀看完整影片，或匯入字幕開始閱讀。</p><button class="button button-dark" data-play="0">${icon('play')} 觀看原始訪談</button><small>我們不以生成文字代替受訪者的原話。</small></div>`;
    return;
  }
  const cues = activeItem.transcript.map((cue, index) => ({ ...cue, index })).filter(cue => cue.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  document.querySelector('#cue-count').textContent = query ? `${cues.length} 段符合` : `${cues.length} 段`;
  body.innerHTML = `${provenanceHTML(activeItem)}<p class="transcript-notice">${localTranscripts[activeItem.id] ? '目前為此瀏覽器的匯入字幕。' : ''}${activeItem.aiReview ? '我們使用 AI 技術校對'+(activeItem.aiReview.method === 'ai-translated' ? '與翻譯' : '')+'逐字稿，統一使用正體中文。' : '本稿保留來源字幕內容。'}發言內容與語境以原始影片為準。點擊時間碼可跳至對應片段。</p><div class="cue-list">${cues.length ? cues.map(cue => `<div class="cue ${cue.index === visibleCue ? 'active-cue' : ''}" id="cue-${cue.index}"><button class="cue-time" data-cue="${cue.index}" aria-label="跳到影片 ${formatTime(cue.start)}">${formatTime(cue.start)}</button><p>${highlight(cue.text, query)}</p><button class="cue-share" data-share="${cue.start}" aria-label="複製 ${formatTime(cue.start)} 片段連結">${icon('share')}</button></div>`).join('') : '<div class="empty-state small"><h3>找不到這段文字</h3><p>試試較短的關鍵字。</p></div>'}</div>`;
}
function highlight(text, query) {
  if (!query) return esc(text);
  let result = '', start = 0, index;
  while ((index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase(), start)) !== -1) {
    result += esc(text.slice(start, index)) + '<mark>' + esc(text.slice(index, index + query.length)) + '</mark>';
    start = index + query.length;
  }
  return result + esc(text.slice(start));
}
function play(seconds) {
  const time = Math.max(0, Math.floor(Number(seconds) || 0));
  document.querySelector('#video-player').innerHTML = `<iframe title="${esc(activeItem.title)} YouTube 播放器" src="https://www.youtube-nocookie.com/embed/${activeItem.id}?start=${time}&autoplay=1&rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  // Clip links are created by Share; playback does not create another pageview URL.
}
function topics() {
  activeItem = null;
  document.title = '主題探索｜PUMA TALKS';
  const descriptions = ['一個人如何成為現在的自己？從求學、家庭與人生選擇開始認識。', '回到公共議題的提問現場，從不同節目觀察政策對話。', '從每天的生活裡，找到性別、家庭、運動與城市的連結。', '保留跨語言訪談的入口，從更廣的視角聆聽對話。', '一本書、一首歌、一個故事，都是另一種認識的方式。'];
  main.innerHTML = `<section class="topics-page wrap"><div class="eyebrow">FIND YOUR WAY IN</div><h1>從你在意的事，<br>開始一場對話<span class="heading-dot">.</span></h1><p class="page-lead">不必照著時間順序。從一個主題，找到想聽的專訪。</p><div class="topic-grid">${categories.map((category, index) => `<a class="topic-card theme-${topicColors[index]}" href="./index.html?category=${encodeURIComponent(category)}#archive"><div class="topic-card-top"><span>${items.filter(i => i.category === category).length} 支訪談影片</span>${icon('upRight')}</div><h2>${category}</h2><p>${descriptions[index]}</p><div class="topic-tags">${[...new Set(items.filter(i => i.category === category).flatMap(i => i.tags))].slice(0,3).map(t => `<span># ${esc(t)}</span>`).join('')}</div></a>`).join('')}</div><div class="tag-cloud-section" id="keyword-cloud"><div class="eyebrow">FOLLOW YOUR CURIOSITY</div><h2>也可以，從一個關鍵字開始。</h2><p>每篇挑選 5–10 個主題關鍵字。字越大，涵蓋的專訪越多。</p>${keywordCloudHTML(items,Infinity)}</div></section>`;
}
function about() {
  activeItem = null;
  document.title = '關於計畫｜PUMA TALKS';
  main.innerHTML = `<article class="about-page wrap"><div class="eyebrow">A LITTLE MORE CONTEXT</div><h1>好好聽，<br>慢慢懂<span class="heading-dot">.</span></h1><p class="about-intro">理解一個人，需要比一段短影音<br>更長一點的時間。</p><div class="about-body"><section><h2>把零散的對話，留在同一個地方。</h2><p>PUMA TALKS 是一個民間整理計畫，收錄沈伯洋在 YouTube 上的專訪，以主題、標籤和逐字稿，讓你更容易找到完整對話。本網站不是沈伯洋、任何政黨或競選團隊的官方網站。</p><p>目前是雛形，共收錄 ${items.length} 支訪談影片、${items.filter(i => i.transcript.length).length} 份可讀字幕，尚未涵蓋所有訪談。初始清單參考公開專訪清單；每篇保留 YouTube 來源與原始標題，並標示是否已匯入原頻道中繼資料。分類是本站的閱讀索引。分段訪談會分別列出，收錄數量以影片為單位。</p></section><section><h2>用 AI 技術，讓對話更容易閱讀。</h2><p>我們使用 AI 技術校對逐字稿，統一以正體中文呈現。英文訪談提供中文譯稿，並為每篇挑選關鍵字、整理重點與總結。發言內容與語境以原始影片為準。</p><p>YouTube 觀看數與按讚數每日更新，首頁總數為已收錄影片的累計值；分段影片各自計算。</p></section><section><h2>來源與使用說明</h2><p>訪談影片、縮圖及字幕內容的著作權歸原創作者所有。本站的短篇說明為編輯整理，不代表受訪者逐字發言。公開完整逐字稿前，請先確認字幕的授權與使用範圍。</p><p>影片縮圖會向 YouTube 圖片服務載入；播放器在你點擊播放或時間碼後才向 YouTube 載入。${analyticsEnabled ? '本站已啟用 Google Analytics，以了解文章瀏覽情況。' : '本站目前未啟用分析追蹤。'}不需註冊帳號。收藏與匯入字幕僅使用瀏覽器本機儲存。</p><div class="about-links"><a href="https://vocus.cc/article/6ad8d562fd89780001e98adb" target="_blank" rel="noopener noreferrer">初始專訪清單來源 ${icon('upRight')}</a><a href="https://whoispuma.com/" target="_blank" rel="noopener noreferrer">參考計畫：認識沈伯洋 ${icon('upRight')}</a><a href="https://shen-post-wall.pages.dev/" target="_blank" rel="noopener noreferrer">參考計畫：沈伯洋親友見證牆 ${icon('upRight')}</a><a href="https://puma.taipei/" target="_blank" rel="noopener noreferrer">沈伯洋官方網站 ${icon('upRight')}</a></div></section></div><a href="./index.html#archive" class="button button-dark">回到對話裡 ${icon('arrow')}</a></article>`;
}
function route() {
  const params = new URLSearchParams(location.search);
  const articleId = document.querySelector('meta[name="interview-id"]')?.content;
  if (articleId || params.get('v')) {
    const item = items.find(i => i.id === (articleId || params.get('v')));
    if (item && !articleId) {
      const target = new URL(detailURL(item.id), document.baseURI);
      params.delete('v'); target.search = params.toString(); target.hash = location.hash;
      location.replace(target.href); return;
    }
    if (item) detail(item);
    else { activeItem = null; main.innerHTML = '<section class="wrap empty-state not-found"><h1>還沒收錄這場專訪。</h1><p>這個影片連結可能有誤，或尚未加入資料庫。</p><a class="button button-dark" href="./index.html#archive">瀏覽所有專訪 →</a></section>'; }
  } else if (params.get('view') === 'topics') topics();
  else if (params.get('view') === 'about') about();
  else home();
  document.querySelectorAll('[data-nav]').forEach(a => { const current = params.get('view') || 'archive'; if (a.dataset.nav === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  updateSaved();
}
function download(filename, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('error', event => { if (event.target.matches?.('[data-thumbnail]')) event.target.style.display = 'none'; }, true);
document.addEventListener('click', async event => {
  const summaryTime = event.target.closest('[data-summary-time]');
  if (summaryTime && activeItem && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault(); play(Number(summaryTime.dataset.summaryTime));
    document.querySelector('#video-player').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    return;
  }
  const button = event.target.closest('button');
  if (button?.hasAttribute('data-save')) {
    const id = button.dataset.save, exists = saved.includes(id);
    saved = exists ? saved.filter(v => v !== id) : [...saved, id];
    const persisted = writeStorage(storageKey, saved); updateSaved();
    if (!activeItem && filters?.saved) updateResults(false);
    if (persisted) toast(exists ? '已從收藏移除' : '已收藏，留給下一次慢慢聽。');
  } else if (button?.hasAttribute('data-category')) { filters.category = button.dataset.category; updateResults(); }
  else if (button?.hasAttribute('data-tag')) { location.href = new URL(`./index.html?tag=${encodeURIComponent(button.dataset.tag)}#archive`, document.baseURI).href; }
  else if (button?.hasAttribute('data-clear')) {
    filters = { q:'', category:'', tag:'', status:'', sort:'', saved:false };
    document.querySelector('#archive-search').value = ''; document.querySelector('#status-filter').value = ''; document.querySelector('#sort-filter').value = 'newest';
    document.querySelector('#archive-title').innerHTML = '每場對話，都有新的發現<span class="heading-dot">.</span>'; updateResults();
  } else if (button?.hasAttribute('data-remove-filter')) { filters[button.dataset.removeFilter] = ''; if (button.dataset.removeFilter === 'status') document.querySelector('#status-filter').value = ''; if (button.dataset.removeFilter === 'saved') document.querySelector('#archive-title').innerHTML = '每場對話，都有新的發現<span class="heading-dot">.</span>'; updateResults(); }
  else if (button?.hasAttribute('data-play') && activeItem) play(button.dataset.play);
  else if (button?.hasAttribute('data-cue') && activeItem) {
    visibleCue = Number(button.dataset.cue); play(activeItem.transcript[visibleCue].start);
    document.querySelectorAll('.cue').forEach(cue => cue.classList.toggle('active-cue', cue.id === `cue-${visibleCue}`));
  } else if (button?.hasAttribute('data-share') && activeItem) {
    const url = new URL(interviewSharePath(activeItem, button.dataset.share === '' ? undefined : button.dataset.share), document.baseURI);
    try { await navigator.clipboard.writeText(url.href); toast('已複製對話連結'); }
    catch { toast('無法使用剪貼簿，請複製瀏覽器網址。'); }
  } else if (button?.hasAttribute('data-download') && activeItem?.transcript.length) {
    download(`puma-${activeItem.id}.txt`, `${activeItem.title}\n${activeItem.channel} · ${activeItem.date}\n${activeItem.sourceUrl}\n處理方式：${activeItem.aiReview ? (activeItem.aiReview.method === 'ai-translated' ? 'AI 翻譯與校對' : 'AI 輔助校對') : statusLabels[activeItem.transcriptStatus]}\n\n${activeItem.transcript.map(c => `[${formatTime(c.start)}] ${c.text}`).join('\n\n')}`);
  } else if (button?.hasAttribute('data-export') && activeItem) {
    const exported = { ...activeItem, transcriptStatus: 'imported', transcriptSource: 'local-subtitle-file', transcriptProvenance: {kind:'provided-subtitle',importedAt:new Date().toISOString()} };
    delete exported.transcriptReview;
    delete exported.article;
    delete exported.slug;
    delete exported.aiReview;
    delete exported.youtubeStats;
    download(`${activeItem.id}.json`, JSON.stringify(exported, null, 2) + '\n', 'application/json');
    toast('已匯出此篇資料，加入專案後才會公開。');
  } else if (button?.hasAttribute('data-reset-transcript') && activeItem) {
    delete localTranscripts[activeItem.id]; writeStorage(transcriptKey, localTranscripts);
    const original = archive.interviews.find(i => i.id === activeItem.id);
    Object.assign(activeItem, structuredClone(original)); detail(activeItem); toast('已移除本機字幕，恢復網站版本。');
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'archive-search') { filters.q = event.target.value; updateResults(); }
  if (event.target.id === 'transcript-search') renderCues(event.target.value);
});
document.addEventListener('change', async event => {
  if (event.target.id === 'sort-filter') { filters.sort = event.target.value; updateResults(); }
  if (event.target.id === 'status-filter') { filters.status = event.target.value; updateResults(); }
  if (event.target.id === 'subtitle-file') {
    const file = event.target.files[0]; if (!file || !activeItem) return;
    try {
      if (file.size > 5_000_000) throw new Error('字幕檔案過大，上限為 5 MB');
      const cues = parseSubtitles(await file.text());
      localTranscripts[activeItem.id] = cues; writeStorage(transcriptKey, localTranscripts);
      activeItem.transcript = cues; activeItem.transcriptStatus = 'imported';
      delete activeItem.aiReview;
      detail(activeItem); toast(`已匯入 ${cues.length} 段本機字幕。`);
    } catch (error) { toast(error.message); event.target.value = ''; }
  }
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.matches('input,textarea,[contenteditable]')) {
    const search = document.querySelector('#archive-search, #transcript-search:not(:disabled)');
    if (search) { event.preventDefault(); search.focus(); }
  }
});
window.addEventListener('popstate', route);
window.addEventListener('storage', event => {
  if (event.key === storageKey) { const next = readStorage(storageKey, []); saved = Array.isArray(next) ? next : []; updateSaved(); if (filters?.saved && !activeItem) updateResults(false); }
});
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
try {
  const embedded = document.querySelector('#archive-data');
  if (embedded) archive = validateArchive(JSON.parse(embedded.textContent));
  else {
    const response = await fetch('./data/interviews.json');
    if (!response.ok) throw new Error('資料庫讀取失敗');
    archive = validateArchive(await response.json());
  }
  items = structuredClone(archive.interviews);
  for (const item of items) {
    const cues = localTranscripts[item.id];
    if (Array.isArray(cues) && cues.length) {
      try { validateArchive({ version: 1, interviews: [{ ...item, transcriptStatus: 'imported', transcript: cues }] }); item.transcript = cues; item.transcriptStatus = 'imported'; delete item.aiReview; }
      catch { delete localTranscripts[item.id]; }
    }
  }
  saved = saved.filter(id => items.some(item => item.id === id));
  route();
  if (['#archive','#keyword-cloud'].includes(location.hash)) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
} catch (error) {
  if (!main.hasAttribute('data-static-article')) main.innerHTML = `<section class="wrap empty-state"><h1>專訪資料暫時無法讀取。</h1><p>請重新整理頁面。若從檔案直接開啟，請改用本機預覽伺服器。</p><a class="button button-dark" href="./index.html">重新載入</a></section>`;
  console.error(error);
}

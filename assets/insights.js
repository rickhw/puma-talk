import {escapeHTML, validateArchive, filterInterviews, interviewPath, categories} from './core.js';

export const formatCount = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('zh-TW') : '未提供';
export function formatUpdate(value) {
  const date=new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) : '尚未取得';
}
export function keywordCounts(items) {
  const counts=new Map();
  for(const item of items) for(const tag of new Set(item.tags)) counts.set(tag,(counts.get(tag)||0)+1);
  return [...counts].map(([tag,count])=>({tag,count})).sort((a,b)=>b.count-a.count||a.tag.localeCompare(b.tag,'zh-Hant'));
}
export function keywordCloudHTML(items,limit=50) {
  const all=keywordCounts(items),words=all.slice(0,limit),max=words[0]?.count||1;
  return `<div class="keyword-cloud" aria-label="依出現影片數排列的關鍵字">${words.map(({tag,count})=>{
    const size=max===1?16:Math.round(14+13*Math.log2(count+1)/Math.log2(max+1));
    return `<a href="./index.html?tag=${encodeURIComponent(tag)}#archive" style="--keyword-size:${size}px" aria-label="${escapeHTML(tag)}，${count} 支影片"><span>${escapeHTML(tag)}</span><small>${count}</small></a>`;
  }).join('')}</div>${all.length>limit?`<p class="keyword-more"><a class="text-link" href="./index.html?view=topics#keyword-cloud">查看全部 ${all.length} 個關鍵字 ↗</a></p>`:''}`;
}
export function commonPhraseCloudHTML(vocabulary) {
  const words=vocabulary?.phrases||[];
  const max=Math.max(1,...words.map(word=>word.count));
  const cloud=words.length?`<div class="keyword-cloud phrase-cloud" aria-label="依原始逐字稿出現次數排列的常用語">${words.map(({term,count,videos})=>{
    const size=Math.round(14+13*Math.log2(count+1)/Math.log2(max+1));
    return `<a href="./index.html?phrase=${encodeURIComponent(term)}#archive" style="--keyword-size:${size}px" aria-label="${escapeHTML(term)}，出現 ${formatCount(count)} 次，涵蓋 ${videos} 支影片" title="${escapeHTML(term)}：${formatCount(count)} 次／${videos} 支影片"><span>${escapeHTML(term)}</span><small>${formatCount(count)}</small></a>`;
  }).join('')}</div>`:'<p class="phrase-cloud-empty">常用語統計整理中。</p>';
  return `<section class="common-phrases-section" id="common-phrases" aria-labelledby="common-phrases-heading"><div class="eyebrow">WORDS IN CONVERSATION</div><h2 id="common-phrases-heading">對談裡的常用語</h2><p>字越大，出現次數越多；數字為詞串出現次數。點選常用語，尋找原稿含有這句話的專訪。</p>${cloud}<p class="common-phrases-note">統計自 ${vocabulary?.videos||0} 支中文影片的原始逐字稿，包含主持人與來賓發言，並非 Puma 個人詞頻。已排除英文／混合語言、音樂作品與部分多人節目。</p></section>`;
}
export function videoStatsHTML(item,compact=false) {
  const stats=item.youtubeStats||{};
  return `<div class="video-statistics ${compact?'compact':''}" aria-label="YouTube 影片統計"><span>YouTube 觀看 <strong>${formatCount(stats.views)}</strong></span><span>按讚 <strong>${formatCount(stats.likes)}</strong></span><span>留言 <strong>${formatCount(stats.comments)}</strong></span>${compact?'':`<small>統計截至 ${escapeHTML(formatUpdate(stats.fetchedAt))}${stats.status==='stale'?' · 沿用上次取得的數值':''}</small>`}</div>`;
}
export function collectionStats(items,completedAt=null) {
  const total={videos:items.length,views:0,likes:0,viewsAvailable:0,likesAvailable:0,fresh:0,duration:0,completedAt};
  for(const item of items) {
    const record=item.youtubeStats;
    for(const field of ['views','likes']) if(Number.isSafeInteger(record?.[field])&&record[field]>=0){total[field]+=record[field];total[field+'Available']++;}
    if(record?.status==='ok')total.fresh++;
    total.duration+=Number.isFinite(item.duration)?item.duration:(item.transcript.at(-1)?.end||0);
  }
  return total;
}
export function collectionStatsHTML(items,completedAt=null) {
  const total=collectionStats(items,completedAt);
  return `<section class="collection-statistics wrap" aria-labelledby="collection-statistics-title"><div class="statistics-caption"><h2 id="collection-statistics-title">每一場對話，都持續被看見。</h2><span>YOUTUBE ／ 收錄影片累計</span></div><dl class="statistics-grid"><div><dt>YouTube 總觀看</dt><dd>${total.viewsAvailable?formatCount(total.views):'—'}</dd></div><div><dt>YouTube 總按讚</dt><dd>${total.likesAvailable?formatCount(total.likes):'—'}</dd></div><div><dt>收錄影片</dt><dd>${formatCount(total.videos)}<small> 支</small></dd></div><div><dt>影片總時數</dt><dd>${(total.duration/3600).toLocaleString('zh-TW',{maximumFractionDigits:1})}<small> 小時</small></dd></div></dl><p class="statistics-note">${escapeHTML(formatUpdate(completedAt))} 更新 · 每日統計 · 觀看數 ${total.viewsAvailable}/${total.videos} 支、按讚數 ${total.likesAvailable}/${total.videos} 支${total.fresh<total.videos?` · ${total.videos-total.fresh} 支未能更新，保留可用資料`:''}。分段影片各自計算，非本站流量。</p></section>`;
}

export function mergeEnhancements(archive,editorial,statistics) {
  if(editorial.version!==1||!Array.isArray(editorial.records))throw new Error('AI 校對資料格式錯誤');
  if(statistics.version!==1||!Array.isArray(statistics.videos))throw new Error('統計資料格式錯誤');
  const ids=new Set(archive.interviews.map(x=>x.id)),reviews=new Map(),counts=new Map();
  for(const row of editorial.records) {
    if(!ids.has(row.videoId)||reviews.has(row.videoId)||!/^[a-f0-9]{64}$/.test(row.sourceSha256||''))throw new Error('AI 校對來源不明或重複');
    if(!Array.isArray(row.keywords)||row.keywords.length<5||row.keywords.length>10||new Set(row.keywords).size!==row.keywords.length||row.keywords.some(tag=>typeof tag!=='string'||!tag.trim()||tag.length>24))throw new Error(`${row.videoId} 需有5至10個關鍵字`);
    const music=archive.interviews.find(x=>x.id===row.videoId).contentType==='music'&&row.review?.method==='metadata-only';
    if(!Array.isArray(row.transcript)||(!row.transcript.length&&!music)||!(music||['ai-proofread','ai-translated'].includes(row.review?.method))||row.review.displayLanguage!=='zh-Hant-TW'||row.review.coverage!==(music?'video-metadata':'full-transcript')||typeof row.review.model!=='string'||!row.review.model||!Number.isFinite(Date.parse(row.review.checkedAt))||typeof row.review.humanReviewed!=='boolean')throw new Error(`${row.videoId} AI 校對紀錄無效`);
    const source=archive.interviews.find(x=>x.id===row.videoId).transcript;
    if(row.review.method==='ai-proofread'&&(source.length!==row.transcript.length||source.some((cue,i)=>cue.start!==row.transcript[i].start||cue.end!==row.transcript[i].end)))throw new Error(`${row.videoId} 校對不可改變原時間碼`);
    if(music&&(source.length||row.transcript.length))throw new Error(`${row.videoId} 音樂作品資訊不可偽造逐字稿`);
    if(!music&&(row.transcript[0].start<source[0].start||row.transcript.at(-1).end>source.at(-1).end+0.01))throw new Error(`${row.videoId} 譯稿超出原片範圍`);
    reviews.set(row.videoId,row);
  }
  for(const row of statistics.videos) {
    if(!ids.has(row.videoId)||counts.has(row.videoId)||!['ok','stale','unavailable'].includes(row.status))throw new Error('統計來源不明或重複');
    if(['views','likes'].some(field=>row[field]!==null&&(!Number.isSafeInteger(row[field])||row[field]<0)))throw new Error('統計數值無效');
    const comments=row.comments??null;
    if(comments!==null&&(!Number.isSafeInteger(comments)||comments<0))throw new Error('留言數值無效');
    counts.set(row.videoId,{views:row.views,likes:row.likes,comments,fetchedAt:row.fetchedAt,status:row.status});
  }
  const data={...archive,statisticsUpdatedAt:statistics.completedAt||null,interviews:archive.interviews.map(item=>{
    const row=reviews.get(item.id);
    const treatment=row?(row.review.method==='ai-translated'?'使用 AI 翻譯與校對':'使用 AI 輔助校對'):'整理中';
    const description=(item.description||'').replace(/逐字稿(?:為待校對工作稿|待校對)/g,'逐字稿'+treatment).replace('未自動判定說話者','多人發言請搭配原片理解');
    const topicTags=row?.review.keywordSelection==='article-grounded'?row.keywords:item.tags;
    const tags=[...new Set([...(item.formatTags||[]),...topicTags])];
    return {...item,description,tags,...(row?{transcript:row.transcript,aiReview:row.review}:{}),youtubeStats:counts.get(item.id)||{views:null,likes:null,comments:null,fetchedAt:null,status:'unavailable'}};
  })};
  return validateArchive(data);
}

export const rankingOptions=[['views','觀看排行榜'],['views-nonofficial','觀看排行榜 (不含官方)'],['newest','時間序列'],['comments','留言排行榜']];
export function normalizeRanking(value) {
  if(value==='comments-nonofficial')return 'comments';
  return value==='oldest'||rankingOptions.some(([mode])=>mode===value)?value:'views';
}
export function isOfficialChannel(item) {
  // Older records predate channel IDs; match only Puma's exact channel name.
  return item.channelId ? item.channelId==='UC49EKUpNvS_fzdk5SKvipQg' : item.channel?.trim()==='沈伯洋Puma';
}
export function rankedInterviews(items, sort='views', limit=10) {
  const mode=normalizeRanking(sort);
  const eligible=mode.endsWith('-nonofficial')?items.filter(item=>!isOfficialChannel(item)):items;
  return filterInterviews(eligible,{sort:mode.split('-')[0]}).slice(0,limit);
}
export function rankingPath(sort='views') {
  const mode=normalizeRanking(sort);
  return `./rankings/${mode==='oldest'?'newest':mode}/`;
}
export function rankingDescription(sort='views') {
  const mode=normalizeRanking(sort);
  if(mode==='newest'||mode==='oldest')return '依發布日期由新到舊，瀏覽所有已收錄影片；同日影片以固定順序排列。';
  return `依 YouTube ${mode==='comments'?'留言則數':'累計觀看數'}由高到低，瀏覽所有已收錄影片的完整排名。${mode==='views-nonofficial'?'此榜排除沈伯洋的官方 YouTube 頻道，其他媒體頻道仍列入。':''}`;
}
function rankingRowsHTML(items,mode,complete=false) {
  const metric=mode.split('-')[0],label=metric==='views'?'觀看次數':metric==='comments'?'留言則數':'發布日期';
  return items.map((item,index)=>`<li data-ranking-video="${escapeHTML(item.id)}"><span class="ranking-position" aria-hidden="true">${String(index+1).padStart(2,'0')}</span><a href="${escapeHTML(interviewPath(item))}"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.channel)} · <time datetime="${escapeHTML(item.date)}">${escapeHTML(item.date)}</time></small></a><span class="ranking-value">${complete?`<span class="ranking-metric-label">${label}</span>`:''}${['views','comments'].includes(metric)?formatCount(item.youtubeStats?.[metric]):escapeHTML(item.date)}</span></li>`).join('')||'<li class="ranking-empty">尚無符合的影片</li>';
}
export function fullRankingHTML(items, sort='views', updatedAt=null) {
  const requested=normalizeRanking(sort),mode=requested==='oldest'?'newest':requested;
  const title=rankingOptions.find(([value])=>value===mode)[1],sorted=rankedInterviews(items,mode,Infinity);
  const metric=mode.split('-')[0],label=metric==='views'?'觀看次數':metric==='comments'?'留言則數':'發布日期';
  return `<section class="full-ranking-page wrap" aria-labelledby="full-ranking-title"><a class="back-link" href="./index.html?ranking=${mode}#rankings">← 回到首頁專訪排行</a><header class="full-ranking-heading"><div class="eyebrow">THE FULL RANKING</div><h1 id="full-ranking-title">${title}</h1><p class="full-ranking-description">${rankingDescription(mode)}</p><p class="full-ranking-summary"><strong>${formatCount(sorted.length)} 支影片</strong><span>完整排名</span><span>${escapeHTML(formatUpdate(updatedAt))} 更新</span></p></header><nav class="ranking-tabs" aria-label="選擇完整排行榜">${rankingOptions.map(([value,text])=>`<a href="${rankingPath(value)}" data-full-ranking="${value}" ${mode===value?'aria-current="page"':''}>${text}</a>`).join('')}</nav><div class="ranking-columns" aria-hidden="true"><span>名次</span><span>專訪</span><span>${label}</span></div><ol class="ranking-list complete-ranking-list" role="list">${rankingRowsHTML(sorted,mode,true)}</ol><p class="ranking-note">${['views','comments'].includes(metric)?'數字為原影片的 YouTube 累計值；未提供的數值列於最後。各影片取得時間請見專訪頁。':'日期為影片發布日；同日排序不代表精確到秒的上架順序。'}分段、剪輯及完整版依影片分別計算。</p><a class="text-link ranking-back-top" href="${rankingPath(mode)}#main">回到排行榜頂端 ↑</a></section>`;
}
export function rankingHTML(items, sort='views', updatedAt=null, query='') {
  const mode=normalizeRanking(sort),metric=mode.split('-')[0],nonofficial=mode.endsWith('-nonofficial');
  const sorted=rankedInterviews(items,mode);
  const label=metric==='views'?'觀看次數':metric==='comments'?'留言則數':mode==='oldest'?'最早發布':'最新發布';
  const rankingURL=value=>{
    const params=new URLSearchParams(query);params.set('ranking',value);
    return './index.html?'+escapeHTML(params.toString())+'#rankings';
  };
  return `<section class="ranking-section wrap" id="rankings" aria-labelledby="ranking-title"><div class="ranking-heading"><h2 id="ranking-title">專訪排行</h2><span>${nonofficial?'不含官方':'全站'}前 10 ${['newest','oldest'].includes(mode)?'支':'名'} · ${label}</span></div><nav class="ranking-tabs" aria-label="選擇專訪排行">${rankingOptions.map(([value,title])=>`<a href="${rankingURL(value)}" data-ranking="${value}" ${mode===value||(value==='newest'&&mode==='oldest')?'aria-current="true"':''}>${title}</a>`).join('')}</nav><ol class="ranking-list" role="list">${rankingRowsHTML(sorted,mode)}</ol><div class="ranking-footer"><p class="ranking-note">${['views','comments'].includes(metric)?`YouTube ${label} · ${escapeHTML(formatUpdate(updatedAt))} 更新；未提供的數值列於最後。`:'依影片發布日期排列；下方專訪列表可獨立設定排序。'}${nonofficial?' 此榜排除沈伯洋的官方 YouTube 頻道，其他媒體頻道仍列入。':''}</p><a class="button button-outline ranking-full-link" href="${rankingPath(mode)}" aria-label="查看${rankingOptions.find(([value])=>value===(mode==='oldest'?'newest':mode))[1]}的完整排名">查看完整排名 <span aria-hidden="true">→</span></a></div></section>`;
}

export function photoHTML(item,large=false) {
  const themes=['plum','sage','peach','blue','pink'];
  const src=large&&item.coverImage?item.coverImage.url:`https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
  const alt=large&&item.coverImage?item.coverImage.alt:item.channel+'專訪影片縮圖';
  return `<div class="photo-fallback theme-${themes[categories.indexOf(item.category)]}"><span class="fallback-channel">${escapeHTML(item.channel)}</span><span class="fallback-title">${escapeHTML(item.title)}</span><span class="fallback-brand">PUMA <b>TALKS</b> ↗</span><img ${large?'fetchpriority="high"':'loading="lazy"'} decoding="async" src="${escapeHTML(src)}" alt="${escapeHTML(alt)}" data-thumbnail></div>`;
}
export function homeHeroHTML(items) {
  const featured=items.find(item=>item.featured)||items[0];
  if(!featured)return '';
  const esc=escapeHTML,dateLabel=date=>date.replaceAll('-','.');
  const detailURL=id=>interviewPath(items.find(item=>item.id===id));
  const photo=photoHTML;
  const paths={arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',play:'<path d="m9 5 11 7-11 7z"/>',upRight:'<path d="M6 18 18 6M6 6h12v12"/>'};
  const icon=name=>`<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${paths[name]}</svg>`;
  return `<section class="hero wrap" aria-labelledby="hero-title">
    <div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> PUMA INTERVIEW ARCHIVE</div><h1 id="hero-title">從一場對話，<br>認識<span class="name-underline">沈伯洋<svg viewBox="0 0 270 20" aria-hidden="true"><path d="M4 13Q110 0 265 10"/></svg></span>。</h1><p class="hero-description">關於世界的思考，也關於生活的選擇。<br>把散落各處的專訪，整理成可以慢慢理解的脈絡。</p><a class="button button-dark" href="#archive">找一場，開始聽 ${icon('arrow')}</a><div class="hero-note"><span class="tiny-wave"><i></i><i></i><i></i><i></i><i></i></span>完整對話．正體中文逐字稿．AI 輔助校對</div></div>
    <div class="hero-feature"><div class="feature-topline"><span>從這場對話開始</span><span class="feature-star" aria-hidden="true">✳</span></div><a class="feature-image" href="${detailURL(featured.id)}" aria-label="查看精選專訪">${photo(featured, true)}<span class="feature-play">${icon('play')}</span></a><div class="feature-caption"><span class="feature-label">本期選聽</span><a href="${detailURL(featured.id)}"><h2>${esc(featured.title)}</h2><span>${esc(featured.channel)} <span class="caption-dot">·</span> ${dateLabel(featured.date)}</span></a><a class="circle-arrow" href="${detailURL(featured.id)}" aria-label="查看精選專訪">${icon('upRight')}</a></div></div>
  </section>`;
}

import {escapeHTML, validateArchive} from './core.js';

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
  return `<div class="keyword-cloud" aria-label="依出現專訪數排列的關鍵字">${words.map(({tag,count})=>{
    const size=max===1?16:Math.round(14+13*Math.log2(count+1)/Math.log2(max+1));
    return `<a href="./index.html?tag=${encodeURIComponent(tag)}#archive" style="--keyword-size:${size}px" aria-label="${escapeHTML(tag)}，${count} 支專訪"><span>${escapeHTML(tag)}</span><small>${count}</small></a>`;
  }).join('')}</div>${all.length>limit?`<p class="keyword-more"><a class="text-link" href="./index.html?view=topics#keyword-cloud">查看全部 ${all.length} 個關鍵字 ↗</a></p>`:''}`;
}
export function videoStatsHTML(item,compact=false) {
  const stats=item.youtubeStats||{};
  return `<div class="video-statistics ${compact?'compact':''}" aria-label="YouTube 影片統計"><span>YouTube 觀看 <strong>${formatCount(stats.views)}</strong></span><span>按讚 <strong>${formatCount(stats.likes)}</strong></span>${compact?'':`<small>統計截至 ${escapeHTML(formatUpdate(stats.fetchedAt))}${stats.status==='stale'?' · 沿用上次取得的數值':''}</small>`}</div>`;
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
  return `<section class="collection-statistics wrap" aria-labelledby="collection-statistics-title"><div class="statistics-caption"><h2 id="collection-statistics-title">每一場對話，都持續被看見。</h2><span>YOUTUBE ／ 收錄影片累計</span></div><dl class="statistics-grid"><div><dt>YouTube 總觀看</dt><dd>${total.viewsAvailable?formatCount(total.views):'—'}</dd></div><div><dt>YouTube 總按讚</dt><dd>${total.likesAvailable?formatCount(total.likes):'—'}</dd></div><div><dt>專訪影片</dt><dd>${formatCount(total.videos)}<small> 支</small></dd></div><div><dt>對話總時數</dt><dd>${(total.duration/3600).toLocaleString('zh-TW',{maximumFractionDigits:1})}<small> 小時</small></dd></div></dl><p class="statistics-note">${escapeHTML(formatUpdate(completedAt))} 更新 · 每日統計 · 觀看數 ${total.viewsAvailable}/${total.videos} 支、按讚數 ${total.likesAvailable}/${total.videos} 支${total.fresh<total.videos?` · ${total.videos-total.fresh} 支未能更新，保留可用資料`:''}。分段影片各自計算，非本站流量。</p></section>`;
}

export function mergeEnhancements(archive,editorial,statistics) {
  if(editorial.version!==1||!Array.isArray(editorial.records))throw new Error('AI 校對資料格式錯誤');
  if(statistics.version!==1||!Array.isArray(statistics.videos))throw new Error('統計資料格式錯誤');
  const ids=new Set(archive.interviews.map(x=>x.id)),reviews=new Map(),counts=new Map();
  for(const row of editorial.records) {
    if(!ids.has(row.videoId)||reviews.has(row.videoId)||!/^[a-f0-9]{64}$/.test(row.sourceSha256||''))throw new Error('AI 校對來源不明或重複');
    if(!Array.isArray(row.keywords)||row.keywords.length<5||row.keywords.length>10||new Set(row.keywords).size!==row.keywords.length||row.keywords.some(tag=>typeof tag!=='string'||!tag.trim()||tag.length>24))throw new Error(`${row.videoId} 需有5至10個關鍵字`);
    if(!Array.isArray(row.transcript)||!row.transcript.length||!['ai-proofread','ai-translated'].includes(row.review?.method)||row.review.displayLanguage!=='zh-Hant-TW'||row.review.coverage!=='full-transcript'||typeof row.review.model!=='string'||!row.review.model||!Number.isFinite(Date.parse(row.review.checkedAt))||typeof row.review.humanReviewed!=='boolean')throw new Error(`${row.videoId} AI 校對紀錄無效`);
    const source=archive.interviews.find(x=>x.id===row.videoId).transcript;
    if(row.review.method==='ai-proofread'&&(source.length!==row.transcript.length||source.some((cue,i)=>cue.start!==row.transcript[i].start||cue.end!==row.transcript[i].end)))throw new Error(`${row.videoId} 校對不可改變原時間碼`);
    if(row.transcript[0].start<source[0].start||row.transcript.at(-1).end>source.at(-1).end+0.01)throw new Error(`${row.videoId} 譯稿超出原片範圍`);
    reviews.set(row.videoId,row);
  }
  for(const row of statistics.videos) {
    if(!ids.has(row.videoId)||counts.has(row.videoId)||!['ok','stale','unavailable'].includes(row.status))throw new Error('統計來源不明或重複');
    if(['views','likes'].some(field=>row[field]!==null&&(!Number.isSafeInteger(row[field])||row[field]<0)))throw new Error('統計數值無效');
    counts.set(row.videoId,{views:row.views,likes:row.likes,fetchedAt:row.fetchedAt,status:row.status});
  }
  const data={...archive,statisticsUpdatedAt:statistics.completedAt||null,interviews:archive.interviews.map(item=>{
    const row=reviews.get(item.id);
    const treatment=row?(row.review.method==='ai-translated'?'使用 AI 翻譯與校對':'使用 AI 輔助校對'):'整理中';
    const description=(item.description||'').replace(/逐字稿(?:為待校對工作稿|待校對)/g,'逐字稿'+treatment).replace('未自動判定說話者','多人發言請搭配原片理解');
    return {...item,description,...(row?{tags:row.review.keywordSelection==='article-grounded'?row.keywords:item.tags,transcript:row.transcript,aiReview:row.review}:{}),youtubeStats:counts.get(item.id)||{views:null,likes:null,fetchedAt:null,status:'unavailable'}};
  })};
  return validateArchive(data);
}

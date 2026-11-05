export const categories = ["人物與成長", "政治與公共事務", "社會與生活", "國際與安全", "文化與閱讀"];
export const statusLabels = { pending: "逐字稿整理中", auto: "AI 語音辨識稿", reviewed: "人工校對", imported: "來源字幕" };
export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fallbackSlug = item => `${item.date}-${item.id.toLowerCase()}`.replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/-$/,'');
export const interviewPath = item => `./interviews/${item.slug || fallbackSlug(item)}/`;
export function interviewSharePath(item, seconds) {
  return interviewPath(item) + (seconds === undefined ? '' : `?t=${Math.max(0, Math.floor(Number(seconds) || 0))}`);
}
export function transcriptFingerprintText(cues) {
  return cues.map(c => `${Math.round(c.start * 1000)}:${Math.round(c.end * 1000)}:${c.text}`).join('\n');
}
export function validateArticle(article, item) {
  if (!article || article.videoId !== item.id || !['draft','reviewed'].includes(article.status)
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) || article.slug.length > 130) throw new Error(`${item.id} 文章識別或 slug 無效`);
  for (const key of ['lead','conclusion']) if (typeof article[key] !== 'string' || !article[key].trim()) throw new Error(`${item.id} 摘要缺少 ${key}`);
  if (article.sourceScopeNote !== undefined && (typeof article.sourceScopeNote !== 'string' || !article.sourceScopeNote.trim())) throw new Error(`${item.id} 來源範圍說明無效`);
  if (!Array.isArray(article.highlights) || article.highlights.length < 3 || article.highlights.length > 5) throw new Error(`${item.id} 摘要需有3至5項重點`);
  for (const point of article.highlights) {
    if (['title','text','evidence'].some(key => typeof point[key] !== 'string' || !point[key].trim())
        || !Number.isFinite(point.start) || !Number.isFinite(point.end) || point.start < 0 || point.end <= point.start) throw new Error(`${item.id} 摘要重點格式無效`);
    if (point.citationStatus && !['matched','needs-review'].includes(point.citationStatus)) throw new Error(`${item.id} 摘要引證狀態無效`);
    const source = item.transcript.filter(c => c.start >= point.start - 0.001 && c.start <= point.end).map(c => c.text).join('').replace(/\s+/g, '');
    if (!source.includes(point.evidence.replace(/\s+/g, ''))) throw new Error(`${item.id} 摘要引證與逐字稿不符`);
  }
  if (!/^[a-f0-9]{64}$/.test(article.provenance?.transcriptSha256 || '')) throw new Error(`${item.id} 摘要缺少逐字稿 hash`);
  return article;
}
export function mergeArticles(archive, manifest) {
  if (manifest.version !== 1 || !Array.isArray(manifest.articles)) throw new Error('文章資料格式錯誤');
  const records = new Map(), slugs = new Set(), items = new Map(archive.interviews.map(item => [item.id, item]));
  for (const article of manifest.articles) {
    const item = items.get(article.videoId);
    if (!item || records.has(article.videoId) || slugs.has(article.slug)) throw new Error('文章來源或 slug 重複／不存在');
    validateArticle(article, item); records.set(item.id, article); slugs.add(article.slug);
  }
  return validateArchive({...archive, interviews:archive.interviews.map(item => ({...item,
    slug:records.get(item.id)?.slug || fallbackSlug(item), ...(records.has(item.id) ? {article:records.get(item.id)} : {})}))});
}
export function articleSummaryHTML(item) {
  const article = item.article;
  if (!article) return '<section class="article-summary"><h2>文章摘要</h2><p>摘要整理中。</p></section>';
  return `<article class="article-summary" aria-labelledby="article-summary-heading"><div class="article-summary-header"><div><span class="eyebrow">IN THIS CONVERSATION</span><h2 id="article-summary-heading">文章摘要<span class="heading-dot">.</span></h2></div><span class="article-review-label">${article.status === 'reviewed' ? '摘要已校對' : 'AI 摘要'}</span></div>${article.sourceScopeNote ? `<p class="article-source-scope"><strong>來源說明：</strong>${escapeHTML(article.sourceScopeNote)}</p>` : ''}<p class="article-lead">${escapeHTML(article.lead)}</p><h3>專訪重點</h3><ol class="article-highlights">${article.highlights.map(point => `<li><h4>${escapeHTML(point.title)}</h4><p>${escapeHTML(point.text)}</p><a class="article-time-link" href="${escapeHTML(item.sourceUrl)}&amp;t=${Math.floor(point.start)}s" target="_blank" rel="noopener noreferrer" data-summary-time="${point.start}">回看原片 ${formatTime(point.start)} ↗</a>${point.citationStatus === 'needs-review' ? '<span class="article-reference-note">（時間位置供參考）</span>' : ''}</li>`).join('')}</ol><section class="article-conclusion"><h3>總結</h3><p>${escapeHTML(article.conclusion)}</p></section><p class="article-summary-note">${article.status === 'reviewed' ? '本篇摘要已校對。' : '摘要由 AI 技術整理與輔助校對。'}發言內容與語境請以原始影片為準。</p></article>`;
}
export function formatTime(seconds = 0) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(value / 3600), m = Math.floor(value / 60) % 60, s = value % 60;
  return (h ? `${h}:` : "") + `${h ? String(m).padStart(2, "0") : String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
export function parseTime(value) {
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(v => !Number.isFinite(v) || v < 0)) throw new Error("時間碼格式不正確");
  return parts.reduce((sum, part) => sum * 60 + part, 0);
}
export function parseSubtitles(input) {
  if (typeof input !== "string" || input.length > 5_000_000) throw new Error("字幕檔案過大，上限為 5 MB");
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n"), cues = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{1,3})/);
    if (!match) continue;
    const start = parseTime(match[1]), end = parseTime(match[2]);
    if (end < start) throw new Error("字幕結束時間不能早於開始時間");
    const content = [];
    while (++i < lines.length && lines[i].trim()) content.push(lines[i]);
    const body = content.join(" ").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (!body) continue;
    const previous = cues.at(-1);
    if (previous?.text === body && start < previous.end) { previous.end = Math.max(previous.end, end); continue; }
    // YouTube rolling captions repeat the previous line in the following cue.
    let clean = body;
    if (previous && start < previous.end && body.startsWith(previous.text + " ")) clean = body.slice(previous.text.length).trim();
    cues.push({ start, end, text: clean });
  }
  if (!cues.length) throw new Error("找不到有效的字幕時間碼，請選擇 SRT 或 WebVTT 檔案");
  return cues.sort((a, b) => a.start - b.start);
}
export function filterInterviews(items, filters = {}, saved = []) {
  const words = (filters.q || "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.tag && !item.tags.includes(filters.tag)) return false;
    if (filters.saved && !saved.includes(item.id)) return false;
    if (filters.status === "available" && !item.transcript?.length) return false;
    if (filters.status === "ai" && !item.aiReview) return false;
    if (filters.status === "reviewed" && item.transcriptStatus !== "reviewed") return false;
    if (filters.status === "pending" && item.transcript?.length) return false;
    if (!words.length) return true;
    const haystack = [item.title, item.originalTitle, item.channel, item.description, item.article?.lead, item.article?.conclusion,
      ...(item.article?.highlights || []).flatMap(point => [point.title, point.text]), ...item.tags, ...item.transcript.map(c => c.text)].join(" ").toLocaleLowerCase();
    return words.every(word => haystack.includes(word));
  }).sort((a, b) => {
    const tie = b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
    if (filters.sort === 'oldest') return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
    if (['views','comments'].includes(filters.sort)) {
      const count = item => Number.isSafeInteger(item.youtubeStats?.[filters.sort]) && item.youtubeStats[filters.sort] >= 0 ? item.youtubeStats[filters.sort] : null;
      const av = count(a), bv = count(b);
      if (av === null || bv === null) return av === bv ? tie : av === null ? 1 : -1;
      return bv - av || tie;
    }
    return tie;
  });
}
export function validateArchive(data) {
  if (data.version !== 1 || !Array.isArray(data.interviews)) throw new Error("資料庫格式錯誤");
  const ids = new Set(), slugs = new Set();
  for (const item of data.interviews) {
    if (!/^[\w-]{11}$/.test(item.id) || ids.has(item.id)) throw new Error(`影片 ID 無效或重複：${item.id}`);
    ids.add(item.id);
    if (item.slug !== undefined) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || item.slug.length > 130 || slugs.has(item.slug)) throw new Error(`${item.id} slug 無效或重複`);
      slugs.add(item.slug);
    }
    for (const field of ["title", "channel", "date", "category", "sourceUrl", "transcriptStatus"]) if (typeof item[field] !== "string" || !item[field]) throw new Error(`${item.id} 缺少 ${field}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || Number.isNaN(Date.parse(item.date)) || !categories.includes(item.category)) throw new Error(`${item.id} 日期或分類錯誤`);
    if (item.sourceUrl !== `https://www.youtube.com/watch?v=${item.id}` || !Array.isArray(item.tags) || item.tags.some(t => typeof t !== "string") || !Array.isArray(item.transcript) || !statusLabels[item.transcriptStatus]) throw new Error(`${item.id} 來源或逐字稿格式錯誤`);
    if (item.transcriptStatus === "pending" && item.transcript.length || item.transcriptStatus !== "pending" && !item.transcript.length) throw new Error(`${item.id} 逐字稿狀態與內容不一致`);
    let last = -1;
    for (const cue of item.transcript) {
      if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end < cue.start || cue.start < last || typeof cue.text !== "string" || !cue.text.trim()) throw new Error(`${item.id} 字幕內容無效`);
      last = cue.start;
    }
  }
  return data;
}

export function youtubeTimeURL(videoId, seconds) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('YouTube 影片 ID 格式錯誤');
  const value = Number(seconds);
  const start = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${start}s`;
}

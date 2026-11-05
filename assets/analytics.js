/* Disabled until a GA4 Measurement ID is explicitly configured at build time. */
(() => {
  const node = document.querySelector('#site-config');
  if (!node || !['http:','https:'].includes(location.protocol) || new URLSearchParams(location.search).has('v')) return;
  const config = JSON.parse(node.textContent);
  const id = config.analytics?.measurementId;
  if (!/^G-[A-Z0-9]+$/.test(id || '')) return;
  const page = new URL(location.href);
  page.pathname = page.pathname.replace(/\/index\.html$/, '/');
  page.hash = ''; page.searchParams.delete('t');
  const articleId = document.querySelector('meta[name="interview-id"]')?.content;
  const slug = document.querySelector('meta[name="article-slug"]')?.content;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id, {send_page_view:false});
  gtag('event', 'page_view', {
    page_title:document.title, page_location:page.href,
    ...(articleId ? {interview_id:articleId, article_slug:slug, content_group:'interview'} : {})
  });
  const script = document.createElement('script');
  script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);
})();

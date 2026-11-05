/* GTM owns collection when configured; direct GA4 is the standalone fallback. */
(() => {
  const node = document.querySelector('#site-config');
  if (!node || !['http:','https:'].includes(location.protocol) || new URLSearchParams(location.search).has('v') || window.__pumaAnalyticsLoaded) return;
  const config = JSON.parse(node.textContent);
  const id = config.analytics?.measurementId;
  const container = config.analytics?.gtmContainerId;
  const useGTM = /^GTM-[A-Z0-9]+$/.test(container || '');
  if (!useGTM && !/^G-[A-Z0-9]+$/.test(id || '')) return;
  const page = new URL(location.href);
  page.pathname = page.pathname.replace(/\/index\.html$/, '/');
  page.hash = ''; page.searchParams.delete('t');
  const articleId = document.querySelector('meta[name="interview-id"]')?.content;
  const slug = document.querySelector('meta[name="article-slug"]')?.content;
  const fields = {
    page_title:document.title, page_location:page.href,
    ...(articleId ? {interview_id:articleId, article_slug:slug, content_group:'interview'} : {})
  };
  window.__pumaAnalyticsLoaded = true;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  const script = document.createElement('script');
  script.async = true;
  if (useGTM) {
    // Set context before the container starts; its published Google tag sends views.
    // Do not add a second config or manual page_view alongside the GTM container.
    gtag('set', fields);
    window.dataLayer.push({...fields, event:'puma_page_context'});
    window.dataLayer.push({'gtm.start':new Date().getTime(), event:'gtm.js'});
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(container)}`;
  } else {
    gtag('js', new Date());
    gtag('config', id, {send_page_view:false});
    gtag('event', 'page_view', fields);
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  }
  document.head.append(script);
})();

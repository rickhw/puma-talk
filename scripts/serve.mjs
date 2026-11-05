import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.srt':'text/plain; charset=utf-8' };
export async function handleRequest(req, res) {
    try {
      if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
      const url = new URL(req.url, 'http://localhost');
      const urlPath = decodeURIComponent(url.pathname);
      let file = path.resolve(root, '.' + urlPath);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
      if ((await stat(file)).isDirectory()) {
        if (!url.pathname.endsWith('/')) { res.writeHead(301, {Location:url.pathname + '/' + url.search}); return res.end(); }
        file = path.join(file, 'index.html');
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) { res.writeHead(error instanceof URIError ? 400 : 404); res.end(error instanceof URIError ? 'Bad request' : 'Not found'); }
}
export function serve(port = Number(process.env.PORT || 4173)) {
  const server = http.createServer(handleRequest);
  server.listen(port, '127.0.0.1', () => console.log(`Local: http://localhost:${server.address().port}`));
  server.on('error', error => { console.error(`預覽伺服器啟動失敗：${error.message}`); process.exitCode = 1; });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve();

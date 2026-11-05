import { watch } from 'node:fs';
import path from 'node:path';
import { build, root } from './build.mjs';
import { serve } from './serve.mjs';

await build();
serve();
let timer, building = false, queued = false;
async function rebuild() {
  if (building) { queued = true; return; }
  building = true;
  try { await build(); console.log('已更新，重新整理瀏覽器即可查看。'); }
  catch (error) { console.error(error.message); }
  finally { building = false; if (queued) { queued = false; await rebuild(); } }
}
for (const name of ['index.html', 'assets', 'data', 'docs/reader-demo.srt']) watch(path.join(root,name), { recursive: name === 'assets' || name === 'data' }, () => { clearTimeout(timer); timer = setTimeout(rebuild,150); });

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePress, filterPress, pressFilters, pressPageHTML, pressResultsHTML} from '../assets/press.js';

const document=JSON.parse(await readFile(new URL('../data/english-press.json',import.meta.url),'utf8'));
test('press sources require distinct, verified English articles with safe links and real dates',()=>{
  assert.equal(validatePress(document),document);
  const duplicate=structuredClone(document);duplicate.reports.push(duplicate.reports[0]);
  assert.throws(()=>validatePress(duplicate),/重複/);
  for(const url of ['javascript:alert(1)','http://example.org/report','https://name:password@example.org/report']){
    const unsafe=structuredClone(document);unsafe.reports[0].url=url;
    assert.throws(()=>validatePress(unsafe),/網址/);
  }
  const invalid=structuredClone(document);invalid.reports[0].publishedOn='2026-02-30';assert.throws(()=>validatePress(invalid),/日期/);
  invalid.reports[0].publishedOn='2026-11-24';invalid.reports[0].verification='search-title-only';assert.throws(()=>validatePress(invalid),/核對/);
});
test('press search intersects terms, media, topic, type and year without changing source order',()=>{
  const before=document.reports.map(r=>r.id);
  const result=filterPress(document.reports,pressFilters('?q=PUMA%20disinformation&publisher=New+Bloom&type=專訪&year=2020&topic=資訊與認知作戰'));
  assert.deepEqual(result.map(r=>r.id),['new-bloom-disinformation-2020']);
  assert.deepEqual(filterPress(document.reports,{publisher:'Reuters',year:'2020'}),[]);
  assert.equal(filterPress(document.reports,{sort:'oldest'})[0].publishedOn,'2020-01-06');
  assert.deepEqual(document.reports.map(r=>r.id),before);
});
test('press HTML distinguishes opinion, preserves source credits, escapes text and keeps originals readable without scripts',()=>{
  const html=pressPageHTML(document);
  assert.equal((html.match(/data-press-report=/g)||[]).length,document.reports.length);
  assert.match(html,/fieldset disabled/);assert.match(pressPageHTML(document,{},true),/<fieldset>/);
  assert.match(html,/press-kind press-opinion/);assert.ok(html.includes('Reuters稿，由DZRH刊載'));
  for(const report of document.reports)assert.ok(html.includes(report.url.replaceAll('&','&amp;')));
  const hostile={...document.reports[0],title:'<script>alert(1)</script>',summary:'<img src=x onerror=alert(1)>'};
  const escaped=pressResultsHTML([hostile],1);assert.ok(!escaped.includes('<script>'));assert.ok(!escaped.includes('<img '));assert.match(escaped,/&lt;script&gt;/);
  assert.match(pressResultsHTML([],document.reports.length),/沒有符合條件的報導/);
});

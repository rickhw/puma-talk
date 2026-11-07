import {readFile} from 'node:fs/promises';
import path from 'node:path';
const collections={
 'interviews.json':['archive','interviews','metadata.json','id'],
 'articles.json':['articles','articles','article.json','videoId'],
 'editorial.json':['editorial','records','editorial.json','videoId'],
 'statistics.json':['statistics','videos','statistics.json','videoId'],
 'covers.json':['covers','interviews','cover.json','videoId']
};
export async function readIndex(directory){
 const index=JSON.parse(await readFile(path.join(directory,'index.json'),'utf8'));
 if(index.version!==1||index.format!=='per-interview-v1'||!Array.isArray(index.interviews))throw new Error('專訪目錄索引格式錯誤');
 const ids=new Set(),slugs=new Set();
 for(const {id,slug} of index.interviews){
  if(!/^[A-Za-z0-9_-]{11}$/.test(id)||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>130||ids.has(id)||slugs.has(slug))throw new Error('專訪目錄 ID 或 slug 無效／重複');
  ids.add(id);slugs.add(slug);
 }
 return index;
}
export async function readCollection(directory,name){
 const index=await readIndex(directory),[section,key,filename,identifier]=collections[name];
 const rows=await Promise.all(index.interviews.map(async entry=>{
  const folder=path.join(directory,entry.slug);
  let row;
  try{row=JSON.parse(await readFile(path.join(folder,filename),'utf8'));}
  catch(error){if(error.code==='ENOENT'&&section!=='archive')return null;throw error;}
  if(row[identifier]!==entry.id)throw new Error(`${entry.slug}/${filename} 的影片 ID 與索引不符`);
  if(section==='archive')row.transcript=JSON.parse(await readFile(path.join(folder,'transcript.json'),'utf8'));
  if(section==='articles'&&row.slug!==entry.slug)throw new Error(`${entry.slug} 的文章 slug 與目錄不符`);
  return row;
 }));
 return {...index[section],[key]:rows.filter(row=>row!==null)};
}

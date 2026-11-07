// Derive clouds and exact phrase filters from original cues before editorial merging.
// Only normalize the characters needed by the configured phrase vocabulary, so Node builds need no OpenCC.
export function buildCommonPhrases(items,config) {
  if(config.version!==1||!Array.isArray(config.phrases)||!config.phrases.length||
    new Set(config.phrases).size!==config.phrases.length||
    config.phrases.some(term=>typeof term!=='string'||!/^[\u3400-\u4dbf\u4e00-\u9fff]{2,12}$/.test(term)))throw new Error('常用語詞表格式錯誤');
  const replacements=config.normalizationMap||{};
  if(Object.entries(replacements).some(([key,value])=>key.length!==1||typeof value!=='string'||value.length!==1))throw new Error('常用語字形對照格式錯誤');
  const normalize=value=>value.replace(/\[[^\]]*\]|［[^］]*］|【[^】]*】/g,'')
    .replace(/[\s\S]/gu,char=>replacements[char]||char)
    .replace(/(?<=[\u3400-\u4dbf\u4e00-\u9fff])\s+(?=[\u3400-\u4dbf\u4e00-\u9fff])/g,'').trim();
  const counts=new Map(config.phrases.map(term=>[term,{term,count:0,videos:0}]));
  const videoTerms=new Map();
  let videos=0;
  for(const item of items) {
    const provenance=item.transcriptProvenance||{};
    if(!item.transcript.length||item.contentType==='music'||config.excludedVideoIds?.[item.id]||
      (provenance.language||'').split('-')[0]!=='zh'||(provenance.languages||[]).length>1)continue;
    videos++;
    const chunks=[];
    let previous=null;
    for(const cue of item.transcript) {
      const text=normalize(cue.text);
      if(!text){previous=null;continue;}
      if(chunks.length) {
        const adjacent=previous&&cue.start-previous.end<=1.5;
        const chineseJoin=adjacent&&/[\u3400-\u4dbf\u4e00-\u9fff]$/.test(chunks.at(-1))&&/^[\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
        chunks.push(chineseJoin?'':'\n');
      }
      chunks.push(text);previous=cue;
    }
    const text=chunks.join(''),terms=[];
    for(const term of config.phrases) {
      const count=text.split(term).length-1;
      if(count){const row=counts.get(term);row.count+=count;row.videos++;terms.push(term);}
    }
    videoTerms.set(item.id,terms);
  }
  return {summary:{source:'original-chinese-transcripts',videos,phrases:[...counts.values()].filter(row=>row.count).sort((a,b)=>b.count-a.count||a.term.localeCompare(b.term,'zh-Hant'))},videoTerms};
}

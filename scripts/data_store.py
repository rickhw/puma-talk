"""Read/write logical collections stored in data/<slug>/, without rewriting other videos."""
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

COLLECTIONS = {
    'interviews.json': ('archive', 'interviews', 'metadata.json', 'id'),
    'articles.json': ('articles', 'articles', 'article.json', 'videoId'),
    'editorial.json': ('editorial', 'records', 'editorial.json', 'videoId'),
    'statistics.json': ('statistics', 'videos', 'statistics.json', 'videoId'),
    'covers.json': ('covers', 'interviews', 'cover.json', 'videoId'),
}


def atomic_json(path, value):
    path=Path(path)
    content=json.dumps(value,ensure_ascii=False,indent=2)+'\n'
    if path.exists() and path.read_text(encoding='utf-8')==content:return
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,temporary=tempfile.mkstemp(prefix='.archive-',suffix='.json',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as stream:stream.write(content)
        os.replace(temporary,path)
    finally:Path(temporary).unlink(missing_ok=True)


def validate_index(index):
    if index.get('version')!=1 or index.get('format')!='per-interview-v1' or not isinstance(index.get('interviews'),list):raise ValueError('專訪目錄索引格式錯誤')
    ids=set();slugs=set()
    for entry in index['interviews']:
        vid,slug=entry.get('id',''),entry.get('slug','')
        if not re.fullmatch(r'[A-Za-z0-9_-]{11}',vid) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',slug) or len(slug)>130 or vid in ids or slug in slugs:raise ValueError('專訪目錄 ID 或 slug 無效／重複')
        ids.add(vid);slugs.add(slug)
    return index


def logical_name(path):
    return 'interviews.json' if Path(path).name=='index.json' else Path(path).name


def split_index(path):
    path=Path(path)
    index_path=path.parent/'index.json'
    if logical_name(path) not in COLLECTIONS or not index_path.exists():return None
    return validate_index(json.loads(index_path.read_text(encoding='utf-8')))


def document_exists(path):
    return split_index(path) is not None or Path(path).exists()


def read_document(path):
    path=Path(path);index=split_index(path)
    if index is None:return json.loads(path.read_text(encoding='utf-8'))
    section,key,filename,identifier=COLLECTIONS[logical_name(path)]
    rows=[]
    for entry in index['interviews']:
        folder=path.parent/entry['slug'];source=folder/filename
        if not source.exists() and section!='archive':continue
        row=json.loads(source.read_text(encoding='utf-8'))
        if row.get(identifier)!=entry['id']:raise ValueError(f'{source} 的影片 ID 與索引不符')
        if section=='archive':row['transcript']=json.loads((folder/'transcript.json').read_text(encoding='utf-8'))
        if section=='articles' and row.get('slug')!=entry['slug']:raise ValueError(f'{source} 的 slug 與目錄不符')
        rows.append(row)
    return dict(index[section],**{key:rows})


def atomic_write(path,value):
    path=Path(path);index=split_index(path)
    if index is None:return atomic_json(path,value)
    section,key,filename,identifier=COLLECTIONS[logical_name(path)]
    entries={e['id']:e for e in index['interviews']}
    rows=value[key]
    if len({row[identifier] for row in rows})!=len(rows):raise ValueError('專訪資料 ID 重複')
    for row in rows:
        vid=row[identifier]
        if vid not in entries:
            if section!='archive':raise ValueError(f'未匯入的專訪：{vid}')
            entries[vid]=dict(id=vid,slug=row['date']+'-video-'+hashlib.sha256(vid.encode()).hexdigest()[:12])
            index['interviews'].append(entries[vid])
        entry=entries[vid]
        if section=='articles' and row['slug']!=entry['slug']:
            # The first summary establishes a new import's permanent public slug.
            if (path.parent/entry['slug']/filename).exists():raise ValueError('既有文章 slug 不可由資料工具自動變更')
            replacement=dict(entry,slug=row['slug'])
            validate_index(dict(index,interviews=[replacement if x['id']==vid else x for x in index['interviews']]))
            destination=path.parent/replacement['slug']
            if destination.exists():raise ValueError('文章目錄已存在')
            (path.parent/entry['slug']).rename(destination)
            entry.update(replacement)
        validate_index(index)
        folder=path.parent/entry['slug']
        if section=='archive':
            atomic_json(folder/filename,{k:v for k,v in row.items() if k!='transcript'})
            atomic_json(folder/'transcript.json',row['transcript'])
        else:atomic_json(folder/filename,row)
    if section=='archive':
        if set(entries)!=set(row['id'] for row in rows):raise ValueError('移除專訪須明確處理索引與目錄，不可隱性刪除')
        index['interviews']=[entries[row['id']] for row in rows]
    index[section]={k:v for k,v in value.items() if k!=key}
    atomic_json(path.parent/'index.json',index)

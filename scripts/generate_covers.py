#!/usr/bin/env python3
"""Render share covers from public video thumbnails and a supplied CJK font."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
from io import BytesIO
import json
from pathlib import Path
import urllib.error
import urllib.request
from urllib.parse import urlparse

from PIL import Image, ImageDraw, ImageFont, ImageOps, __version__ as pillow_version
from import_youtube import ROOT, atomic_write, read_archive

SIZE=(1200,630)
PAPER='#eeedf6';INK='#302a3d';PURPLE='#493862';GREEN='#d6eac5';MUTED='#766f80'


def wrapped(text,font,width,max_lines,draw):
    lines=[];line=''
    for char in text.replace('\n',' '):
        if draw.textlength(line+char,font=font)>width and line:
            lines.append(line);line=char
        else:line+=char
    if line:lines.append(line)
    if len(lines)>max_lines:
        lines=lines[:max_lines]
        while draw.textlength(lines[-1]+'…',font=font)>width:lines[-1]=lines[-1][:-1]
        lines[-1]+='…'
    return lines


def save_cover(image,stem,alt,output):
    buffer=BytesIO();image.save(buffer,format='JPEG',quality=90,optimize=True)
    content=buffer.getvalue();digest=hashlib.sha256(content).hexdigest()[:12]
    path=output/f'{stem}.{digest}.jpg';path.write_bytes(content)
    return dict(file=path.relative_to(ROOT).as_posix(),width=1200,height=630,alt=alt)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font',type=Path,required=True,help='CJK TrueType/OpenType font; see docs/covers.md')
    parser.add_argument('--refresh-thumbnails',action='store_true')
    args=parser.parse_args()
    fonts={size:ImageFont.truetype(str(args.font),size) for size in [22,26,30,34,48,72,94]}
    output=ROOT/'assets/covers';output.mkdir(exist_ok=True)
    cache=ROOT/'.cache/cover-thumbnails';cache.mkdir(parents=True,exist_ok=True)
    image=Image.new('RGB',SIZE,PAPER);draw=ImageDraw.Draw(image)
    draw.rounded_rectangle((64,54,356,106),radius=12,fill=GREEN)
    draw.text((83,62),'PUMA TALKS',font=fonts[30],fill=PURPLE)
    draw.text((64,170),'從一場對話，',font=fonts[94],fill=INK)
    draw.text((64,285),'認識沈伯洋。',font=fonts[94],fill=PURPLE)
    draw.line((68,415,714,415),fill=GREEN,width=14)
    draw.text((68,492),'專訪・摘要・正體中文逐字稿',font=fonts[30],fill=INK)
    site=json.loads((ROOT/'data/site.json').read_text())
    draw.text((68,554),urlparse(site.get('siteUrl','')).netloc or 'PUMA TALKS',font=fonts[22],fill=MUTED)
    for i,height in enumerate([96,172,246,172,96]):
        x=884+i*48;draw.rounded_rectangle((x,330-height//2,x+24,330+height//2),radius=12,fill=PURPLE)
    home=save_cover(image,'home','PUMA TALKS：從一場對話，認識沈伯洋。',output)
    items=read_archive(ROOT/'data/interviews.json')['interviews']

    def thumbnail(item):
        path=cache/(item['id']+'.jpg');record=cache/(item['id']+'.json')
        if path.exists() and record.exists() and not args.refresh_thumbnails:
            return path.read_bytes(),json.loads(record.read_text())['url']
        for quality in ['maxresdefault','hqdefault']:
            url=f'https://i.ytimg.com/vi/{item["id"]}/{quality}.jpg'
            try:
                request=urllib.request.Request(url,headers={'User-Agent':'PUMA-TALKS-Cover/1.0'})
                with urllib.request.urlopen(request,timeout=30) as response:content=response.read()
                with Image.open(BytesIO(content)) as source:
                    if source.width<320:continue
                path.write_bytes(content);atomic_write(record,dict(url=url))
                return content,url
            except (OSError,urllib.error.URLError):continue
        raise RuntimeError('無法取得影片縮圖：'+item['id'])

    records=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for item,(content,url) in zip(items,pool.map(thumbnail,items)):
            image=Image.new('RGB',SIZE,PAPER);draw=ImageDraw.Draw(image)
            draw.rounded_rectangle((52,46,290,94),radius=10,fill=GREEN)
            draw.text((70,52),'PUMA TALKS',font=fonts[26],fill=PURPLE)
            channel=wrapped(item['channel'],fonts[26],620,1,draw)[0]
            draw.text((54,112),channel,font=fonts[26],fill=MUTED)
            title=item['title'].replace('#','')
            for index,line in enumerate(wrapped(title,fonts[48],602,5,draw)):
                draw.text((54,174+index*66),line,font=fonts[48],fill=INK)
            caption='音樂影片與作品資訊' if item.get('contentType')=='music' else '專訪重點與完整逐字稿'
            draw.text((56,556),item['date']+'  /  '+caption,font=fonts[22],fill=PURPLE)
            panel=(710,118,1150,482);draw.rounded_rectangle(panel,radius=16,fill=PURPLE)
            with Image.open(BytesIO(content)) as source:
                thumb=ImageOps.contain(source.convert('RGB'),(440,364),Image.Resampling.LANCZOS)
                image.paste(thumb,(710+(440-thumb.width)//2,118+(364-thumb.height)//2))
            draw.text((710,516),'在原片聽完整演出。' if item.get('contentType')=='music' else '聽完整的想法。',font=fonts[30],fill=PURPLE)
            record=save_cover(image,item['id'],item['title']+'｜PUMA TALKS',output)
            record.update(videoId=item['id'],title=item['title'],sourceUrl=url,sourceSha256=hashlib.sha256(content).hexdigest())
            records.append(record);print('COVER',item['id'],flush=True)
    atomic_write(ROOT/'data/covers.json',dict(version=1,generator=dict(engine='Pillow',version=pillow_version,fontSha256=hashlib.sha256(args.font.read_bytes()).hexdigest()),home=home,interviews=records))
    print('Generated',len(records)+1,'covers.',flush=True)


if __name__=='__main__':main()

#!/usr/bin/env python3
"""Prepare/install the current user's daily statistics LaunchAgent on macOS."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
from import_youtube import ROOT

LABEL='tw.pumatalks.daily-statistics'


def configuration(hour=3,minute=10):
    node=shutil.which('node')
    if not node:raise RuntimeError('找不到 Node.js，請在可執行 npm 的環境安裝排程')
    return dict(Label=LABEL,ProgramArguments=['/usr/bin/caffeinate','-ims',str(ROOT/'.venv/bin/python'),str(ROOT/'scripts/daily_update.py')],
        WorkingDirectory=str(ROOT),StartCalendarInterval=dict(Hour=hour,Minute=minute),
        EnvironmentVariables=dict(PATH=str(Path(node).parent)+':'+str(ROOT/'.venv/bin')+':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',PUMA_NODE_BIN=node),
        StandardOutPath=str(ROOT/'.cache/daily-statistics.log'),StandardErrorPath=str(ROOT/'.cache/daily-statistics-error.log'),
        ProcessType='Background')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install',action='store_true')
    parser.add_argument('--hour',type=int,default=3)
    parser.add_argument('--minute',type=int,default=10)
    args=parser.parse_args()
    if not 0<=args.hour<24 or not 0<=args.minute<60:raise ValueError('排程時間錯誤')
    (ROOT/'.cache').mkdir(exist_ok=True)
    payload=plistlib.dumps(configuration(args.hour,args.minute),sort_keys=False)
    preview=ROOT/'.cache'/f'{LABEL}.plist';preview.write_bytes(payload)
    print('Prepared:',preview)
    if not args.install:return
    target=Path.home()/'Library/LaunchAgents'/preview.name
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():
        subprocess.run(['/bin/launchctl','bootout',f'gui/{os.getuid()}',str(target)],capture_output=True)
    target.write_bytes(payload)
    subprocess.run(['/bin/launchctl','bootstrap',f'gui/{os.getuid()}',str(target)],check=True)
    subprocess.run(['/bin/launchctl','enable',f'gui/{os.getuid()}/{LABEL}'],check=True)
    print('Installed:',target,'daily',f'{args.hour:02d}:{args.minute:02d}','local time')


if __name__=='__main__':main()

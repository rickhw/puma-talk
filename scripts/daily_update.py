#!/usr/bin/env python3
"""Run one locked YouTube statistics refresh and rebuild the static site."""
import fcntl
import os
import datetime as dt
from pathlib import Path
import shutil
import subprocess
import sys
from import_youtube import ROOT


def main():
    cache=ROOT/'.cache';cache.mkdir(exist_ok=True)
    with (cache/'daily-statistics.lock').open('a') as handle:
        try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:print('Another daily statistics update is running.');return 0
        print('DAILY START',dt.datetime.now(dt.timezone.utc).isoformat(),flush=True)
        refreshed=subprocess.run([sys.executable,str(ROOT/'scripts/update_statistics.py')],cwd=ROOT)
        node=os.environ.get('PUMA_NODE_BIN') or shutil.which('node')
        if not node:raise RuntimeError('找不到 Node.js')
        built=subprocess.run([node,str(ROOT/'scripts/build.mjs')],cwd=ROOT)
        print('DAILY COMPLETE','refresh='+str(refreshed.returncode),'build='+str(built.returncode),dt.datetime.now(dt.timezone.utc).isoformat(),flush=True)
        return built.returncode or refreshed.returncode


if __name__=='__main__':raise SystemExit(main())

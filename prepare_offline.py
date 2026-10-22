# coding: utf-8
"""Prepare all mandatory offline assets for packaging.

Exam vocab derives deterministically from the already-bundled, MIT-licensed
ECDICT study tags. No exam book is fetched from a remote server.
Tom Sawyer is an independent public-domain work and must be supplied as an
unabridged English TXT (or fetched on the developer's build computer).
"""
from pathlib import Path
import sys, subprocess
from build_ecdict_tagged_wordbooks import build,write
root=Path(__file__).resolve().parent
assets=root/'app/src/main/assets'
print('Step 1: prepare 4 exam wordbooks from bundled ECDICT (no internet)')
books,meta=build()
write(books,meta,force=False)
for key in books:
    p=assets/'wordbooks-data'/f'{key}.txt'
    if not p.is_file():raise RuntimeError(f'not found: {p}')
print('Step 2: ensure unabridged 35-chapter Tom Sawyer')
from prepare_tom import ensure
ensure()
print('Step 3: generate actual resource inventory')
import generate_asset_status
subprocess.run([sys.executable,str(root/'check_v5_release.py')],check=True)
subprocess.run([sys.executable,str(root/'verify_assets.py')],check=True)
print('All offline assets valid; ready for Android packaging (not yet device-tested).')

# coding: utf-8
from pathlib import Path
import urllib.request,zipfile,os,sys
root=Path(__file__).resolve().parent
folder=root/'.tools';folder.mkdir(exist_ok=True)
if (folder/'gradle-8.10.2/bin/gradle.bat').exists():sys.exit(0)
u='https://services.gradle.org/distributions/gradle-8.10.2-bin.zip'
p=folder/'gradle-8.10.2-bin.zip'
try:
    if not p.exists() or p.stat().st_size<100_000_000:urllib.request.urlretrieve(u,p)
    with zipfile.ZipFile(p) as z:z.extractall(folder)
    if not (folder/'gradle-8.10.2/bin/gradle.bat').exists():raise ValueError('Gradle missing after extract')
    print('Gradle ready')
except Exception as e:print('Cannot download Gradle:',e,'Please verify network access to services.gradle.org');sys.exit(1)

#!/usr/bin/env python3
"""Development only: acquire public hash-pinned HRA originals outside git."""
import argparse, hashlib, json, os, pathlib, urllib.request

def acquire(cache, lock):
 cache.mkdir(parents=True,exist_ok=True)
 for source in lock['sources']:
  target=cache/source['file']
  if target.exists() and target.stat().st_size==source['bytes']:
   with target.open('rb') as existing: actual=hashlib.file_digest(existing,'sha256').hexdigest()
   if actual==source['sha256']:
    print(f"Verified {source['id']}");continue
  temp=target.with_suffix('.part')
  try:
   with urllib.request.urlopen(source['url'],timeout=60) as response, temp.open('wb') as output:
    if response.status!=200:raise ValueError('Expected a full public source response')
    digest=hashlib.sha256();received=0
    while block:=response.read(1024*1024):
     received+=len(block)
     if received>source['bytes']:raise ValueError('Source byte budget exceeded')
     output.write(block);digest.update(block)
    if received!=source['bytes'] or digest.hexdigest()!=source['sha256']:raise ValueError('Source length/hash mismatch')
   os.replace(temp,target);print(f"Acquired {source['id']}")
  finally:
   temp.unlink(missing_ok=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--cache',type=pathlib.Path,default=pathlib.Path.home()/'.cache/ares-anatomy-phase7');args=parser.parse_args()
 root=pathlib.Path(__file__).resolve().parent.parent
 if args.cache.resolve().is_relative_to(root):raise ValueError('Original source cache must remain outside git')
 acquire(args.cache,json.loads((root/'docs/anatomy/FEMALE_SOURCE_LOCK.json').read_text()))

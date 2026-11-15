#!/usr/bin/env python3
"""Development only: acquire public hash-pinned HRA originals outside git."""
import argparse, hashlib, json, os, pathlib, urllib.request

def inspect_denver_cache(cache, lock):
 denver_dir = cache / 'denver-vhf-final-stl'
 stl_files = sorted(denver_dir.rglob('*.stl')) if denver_dir.exists() else []
 zip_files = sorted(cache.glob('*denver*.zip')) + sorted(cache.glob('*visiblehuman*.zip'))
 report_file = cache / 'denver-registration-report.json'
 if stl_files or zip_files:
  print(f"Denver VHF cache found in {cache}: {len(stl_files)} STL file(s), {len(zip_files)} archive(s).")
  for item in (zip_files + stl_files)[:16]:
   with item.open('rb') as handle:
    digest = hashlib.file_digest(handle, 'sha256').hexdigest()
   print(f"  {item.name}: {item.stat().st_size} bytes | sha256={digest}")
  if report_file.exists():
   print(f"  Registration report present: {report_file}")
  else:
   print("  Pending registration: author >=4 fit + >=3 check landmarks and run scripts/register_anatomy.mjs")
  return True
 unavailable = lock.get('unavailableSources', [])
 if unavailable:
  entry = unavailable[0]
  print(
   f"Denver VHF STL cache not present ({entry.get('id')}: HTTP {entry.get('status')} automated gate).\n"
   f"Follow docs/anatomy/DENVER_STL_RUNBOOK.md to download Final 3D STL Models (87.8 MB) via interactive browser into {denver_dir}."
  )
 return False

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
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--cache',type=pathlib.Path,default=pathlib.Path.home()/'.cache/ares-anatomy-phase7')
 parser.add_argument('--verify-denver',action='store_true',help='Inspect external Denver VHF STL cache status without modifying files')
 args=parser.parse_args()
 root=pathlib.Path(__file__).resolve().parent.parent
 if args.cache.resolve().is_relative_to(root):raise ValueError('Original source cache must remain outside git')
 lock_data=json.loads((root/'docs/anatomy/FEMALE_SOURCE_LOCK.json').read_text())
 if args.verify_denver:
  inspect_denver_cache(args.cache, lock_data)
 else:
  acquire(args.cache, lock_data)
  inspect_denver_cache(args.cache, lock_data)

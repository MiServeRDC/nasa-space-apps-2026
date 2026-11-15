#!/usr/bin/env python3
"""Phase 4 research tool, not an application runtime dependency.
Fetches only HRA GLB JSON chunks, never geometry. Writes metadata cache outside git.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import struct
import urllib.request

MAX_JSON_BYTES = 16_000_000
HRA_ROOT = 'https://cdn.humanatlas.io/digital-objects/ref-organ/united-female'
# Exact curator-selected source names. Name matching produces candidates, not anatomical validation.
TARGETS = {
 'brain': ('NervousSystem100.glb', ['Brain.g'], ['Allen_brain']),
 'spinal_cord': ('NervousSystem100.glb', ['Spinal cord.g'], ['VH_F_spinal_cord']),
 'vestibular': ('NervousSystem100.glb', ['Vestibular nerve.l','Vestibular nerve.r','Vestibule.l','Vestibule.r'], []),
 'eye': ('NervousSystem100.glb', ['Eyeball.g'], ['VH_F_eyes']),
 'optic_nerve': ('NervousSystem100.glb', ['Optic nerve (II).l','Optic nerve (II).r'], ['VH_F_left_optic_nerve','VH_F_right_optic_nerve']),
 'optic_sheath': ('NervousSystem100.glb', [], []),
 'vagus': ('NervousSystem100.glb', ['Vagus nerve (X).l','Vagus nerve (X).r'], []),
 'heart': ('CardioVascular41.glb', ['Heart.g'], ['VH_F_heart']),
 'internal_jugular': ('CardioVascular41.glb', ['Internal jugular vein.l','Internal jugular vein.r'], []),
 'vessels': ('CardioVascular41.glb', ['Systemic arteries.g','Systemic veins.g'], ['VH_F_blood_vasculature']),
 'soleus': ('MuscularSystem100.glb', ['Soleus muscle.l','Soleus muscle.r'], []),
 'calcaneus': ('SkeletalSystem100.glb', ['Calcaneus.l','Calcaneus.r'], []),
 'femur': ('SkeletalSystem100.glb', ['Femur.l','Femur.r'], ['VH_F_femur_L','VH_F_femur_R']),
 'spine': ('SkeletalSystem100.glb', ['Vertebral column.g'], ['VH_F_vertebral_column','VH_F_vertebrae']),
 'pelvis': ('SkeletalSystem100.glb', ['Hip bone.l','Hip bone.r'], ['VH_F_ilium','VH_F_pubis','VH_F_ischium']),
 'kidneys': ('VisceralSystem100.glb', ['Kidney.l','Kidney.r'], ['VH_F_left_kidney','VH_F_right_kidney']),
 'lungs': ('VisceralSystem100.glb', ['Left lung.g','Right lung.g'], ['VH_F_lungs']),
}

def sha(data):
 return hashlib.sha256(data).hexdigest()

def load_glb_json(path):
 with Path(path).open('rb') as f:
  header = f.read(20)
  if len(header) != 20 or struct.unpack_from('<III',header)[:2] != (0x46546c67,2):
   raise ValueError('Invalid GLB v2 header')
  length, kind = struct.unpack_from('<II', header, 12)
  if kind != 0x4e4f534a or length > MAX_JSON_BYTES:
   raise ValueError('Invalid/big JSON chunk')
  data = f.read(length)
  if len(data) != length:
   raise ValueError('Truncated GLB JSON')
  return json.loads(data)

def mesh_descendants(doc, index):
 found=set(); visited=set(); todo=[index]
 while todo:
  current=todo.pop()
  if current in visited: continue
  visited.add(current)
  if type(current) is not int or current < 0 or current >= len(doc.get('nodes',[])): raise ValueError('Invalid node reference')
  node=doc['nodes'][current]
  if 'mesh' in node:
   mesh=node['mesh']
   if type(mesh) is not int or mesh < 0 or mesh >= len(doc.get('meshes',[])): raise ValueError('Invalid mesh reference')
   # A mesh must declare actual POSITION samples, not just have a label/group.
   primitives=doc['meshes'][mesh].get('primitives',[])
   for p in primitives:
    accessor=p.get('attributes',{}).get('POSITION')
    if accessor is not None:
     if type(accessor) is not int or accessor < 0 or accessor >= len(doc.get('accessors',[])): raise ValueError('Invalid position accessor')
     if doc['accessors'][accessor].get('count',0)>0: found.add(current)
  todo.extend(node.get('children',[]))
 return sorted(found)

def candidates(doc, names, crosswalk=None):
 crosswalk=crosswalk or {}
 rows=[]
 for i,node in enumerate(doc.get('nodes',[])):
  if node.get('name') not in names: continue
  meshes=mesh_descendants(doc,i)
  rows.append({'nodeIndex':i,'nodeName':node['name'],'directMesh':node.get('mesh'),
   'descendantMeshNodeIndices':meshes,'declaredGeometry':bool(meshes),
   'sourceOntology':crosswalk.get(node['name'],[]),'anatomicallyReviewed':False})
 return rows

def read_range(url, last):
 req=urllib.request.Request(url,headers={'Range':f'bytes=0-{last}','Accept-Encoding':'identity','User-Agent':'ARES anatomy metadata inventory'})
 with urllib.request.urlopen(req,timeout=45) as r:
  # Refuse an ignored Range; do not accidentally acquire a complete 375 MB source.
  if r.status != 206 or not r.headers.get('Content-Range','').startswith(f'bytes 0-{last}/'):
   raise ValueError('Server did not honor the exact bounded Range')
  data=r.read(last+2)
  if len(data)!=last+1: raise ValueError('Range length mismatch')
  return data,dict(r.headers)

def fetch_hra(cache, version):
 root=f'{HRA_ROOT}/{version}'
 asset=f'{root}/assets/3d-vh-f-united.glb'
 first,headers=read_range(asset,19)
 magic,glb_version,total,length,kind=struct.unpack('<IIIII',first)
 if magic!=0x46546c67 or glb_version!=2 or kind!=0x4e4f534a or length>MAX_JSON_BYTES: raise ValueError('Invalid remote GLB header')
 prefix,prefix_headers=read_range(asset,19+length)
 if prefix[:20]!=first or any(headers.get(k)!=prefix_headers.get(k) for k in ['ETag','x-amz-version-id']):
  raise ValueError('Remote asset changed during metadata acquisition')
 raw=prefix[20:];json.loads(raw)
 (cache/f'hra-female-{version}-gltf.json').write_bytes(raw)
 (cache/f'hra-female-{version}-request.json').write_text(json.dumps({'url':asset,'assetBytes':total,
  'jsonBytes':length,'rangeStatus':206,'headers':headers,'jsonSha256':sha(raw)},indent=2)+'\n')
 for name,path in [('crosswalk.csv','assets/crosswalk.csv'),('metadata.json','metadata.json')]:
  with urllib.request.urlopen(f'{root}/{path}',timeout=45) as r:
   data=r.read(MAX_JSON_BYTES+1)
   if len(data)>MAX_JSON_BYTES: raise ValueError('Metadata too large')
  (cache/f'hra-female-{version}-{name}').write_bytes(data)

def build_inventory(root, cache, checked_at):
 base=root/'ares-cockpit/public/anatomy'
 manifest=json.loads((base/'MANIFEST.json').read_text())
 local={}; sources=[]
 for a in manifest['files']:
  path=base/a['file']; data=path.read_bytes()
  if len(data)!=a['bytes'] or sha(data)!=a['sha256']: raise ValueError(f"Pinned asset mismatch: {a['file']}")
  doc=load_glb_json(path);local[a['file']]=doc
  sources.append({'id':a['file'],'kind':'LOCAL_PINNED_MALE','sourceCommit':manifest['source_commit'],
   'sourceUrl':a['source_url'],'assetSha256':a['sha256'],'assetBytes':len(data),'nodeCount':len(doc['nodes']),
   'meshCount':len(doc['meshes']),'declaredLicense':'CC-BY-SA-4.0',
   'redistributionReview':'SUBCOMPONENT_PROVENANCE_UNRESOLVED' if a['file'] in ['NervousSystem100.glb','VisceralSystem100.glb'] else 'DECLARED_LICENSE_NOT_INDIVIDUALLY_AUDITED'})
 female={}
 for version in ['v1.10','v1.5']:
  doc=json.loads((cache/f'hra-female-{version}-gltf.json').read_text())
  metadata_bytes=(cache/f'hra-female-{version}-metadata.json').read_bytes();metadata=json.loads(metadata_bytes)
  crosswalk_bytes=(cache/f'hra-female-{version}-crosswalk.csv').read_bytes()
  request=json.loads((cache/f'hra-female-{version}-request.json').read_text())
  crosswalk={}
  for row in csv.DictReader(crosswalk_bytes.decode('utf-8-sig').splitlines()):
   crosswalk.setdefault(row['node_name'],[]).append({'id':row['OntologyID'],'label':row['label']})
  female[version]=(doc,crosswalk)
  original = metadata.get('was_derived_from', {})
  sources.append({'id':f'hra-female-{version}','kind':'REMOTE_FEMALE_METADATA_ONLY',
   'sourceUrl':request['url'],'sourceVersion':version,'digitalObjectId':metadata['id'],
   'license':metadata.get('license'),'rawDataLicense':original.get('license'),
   'rawDataDOI':original.get('doi'),'creators':[c.get('fullName') for c in original.get('creators',[])],
   'citation':original.get('citation'),'metadataSha256':sha(metadata_bytes),'crosswalkSha256':sha(crosswalk_bytes),
   'glbJsonChunkSha256':request['jsonSha256'],'assetSha256':None,'assetBytes':request['assetBytes'],
   'jsonChunkBytes':request['jsonBytes'],'nodeCount':len(doc['nodes']),'meshCount':len(doc['meshes']),
   'httpObjectVersion':request['headers'].get('x-amz-version-id'),'httpETag':request['headers'].get('ETag'),
   'geometryDecoded':False,'anatomicallyReviewed':False})
 coverage=[]
 for key,(asset,male_names,female_names) in TARGETS.items():
  male=candidates(local[asset],male_names)
  female_rows={v:candidates(d,female_names,c) for v,(d,c) in female.items()}
  coverage.append({'structure':key,'maleAsset':asset,'male':male,'female':female_rows,
   'maleRequestedNames':male_names,'femaleRequestedNames':female_names,
   'maleEvidence':'NAMED_GEOMETRY_CANDIDATE' if any(r['declaredGeometry'] for r in male) else 'UNRESOLVED',
   'femaleEvidence':'NAMED_GEOMETRY_CANDIDATE' if any(r['declaredGeometry'] for r in female_rows['v1.10']) else 'UNRESOLVED',
   'clinicalObservationAvailableFromGeometry':False})
 return {'schemaVersion':1,'checkedAt':checked_at,'scope':'SOURCE_INVENTORY_NOT_ANATOMICAL_OR_CLINICAL_VALIDATION',
  'femaleComplete':False,'sources':sources,'coverage':coverage}

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--cache-dir',type=Path,required=True)
 parser.add_argument('--fetch-hra',action='store_true')
 parser.add_argument('--checked-at',required=True)
 parser.add_argument('--output',type=Path)
 args=parser.parse_args();args.cache_dir.mkdir(parents=True,exist_ok=True)
 if args.fetch_hra:
  for version in ['v1.10','v1.5']:fetch_hra(args.cache_dir,version)
 result=build_inventory(Path(__file__).resolve().parents[1],args.cache_dir,args.checked_at)
 text=json.dumps(result,indent=2,ensure_ascii=False)+'\n'
 if args.output:args.output.write_text(text)
 else:print(text,end='')
if __name__=='__main__':main()

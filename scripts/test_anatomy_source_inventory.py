import importlib.util
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('anatomy_inventory',Path(__file__).with_name('inventory_anatomy_sources.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class InventoryTests(unittest.TestCase):
 def fixture(self):
  return {'nodes':[{'name':'Internal jugular vein.l','children':[1]}, {'name':'fragment','mesh':0},
   {'name':'External jugular vein.l','mesh':1}], 'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}, {'primitives':[]}], 'accessors':[{'count':3}]}
 def test_exact_names_do_not_accept_nearby_vessels(self):
  rows=module.candidates(self.fixture(),['Internal jugular vein.l'])
  self.assertEqual(len(rows),1);self.assertEqual(rows[0]['nodeIndex'],0)
  self.assertEqual(rows[0]['descendantMeshNodeIndices'],[1]);self.assertFalse(rows[0]['anatomicallyReviewed'])
 def test_named_groups_without_geometry_do_not_establish_coverage(self):
  rows=module.candidates(self.fixture(),['External jugular vein.l'])
  self.assertFalse(rows[0]['declaredGeometry'])
 def test_source_ontology_is_preserved_without_pretending_review(self):
  rows=module.candidates(self.fixture(),['Internal jugular vein.l'],{'Internal jugular vein.l':[{'id':'UBERON:0001586','label':'source label'}]})
  self.assertEqual(rows[0]['sourceOntology'][0]['id'],'UBERON:0001586');self.assertFalse(rows[0]['anatomicallyReviewed'])
 def test_cycles_do_not_loop_and_invalid_references_fail(self):
  d=self.fixture();d['nodes'][1]['children']=[0];self.assertEqual(module.mesh_descendants(d,0),[1])
  d['nodes'][1]['children']=[99]
  with self.assertRaises(ValueError):module.mesh_descendants(d,0)
 def test_ignored_range_does_not_read_a_full_asset(self):
  class Response(io.BytesIO):
   status=200;headers={}
   def read(self,*args):raise AssertionError('An ignored Range must not be read')
  with patch.object(module.urllib.request,'urlopen',return_value=Response(b'')):
   with self.assertRaises(ValueError):module.read_range('https://example.org/file.glb',19)
 def test_glb_json_parser_rejects_bad_and_truncated_headers(self):
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp)/'test.glb';p.write_bytes(b'wrong')
   with self.assertRaises(ValueError):module.load_glb_json(p)
   p.write_bytes(struct.pack('<IIIII',0x46546c67,2,200,180,0x4e4f534a)+b'{}')
   with self.assertRaises(ValueError):module.load_glb_json(p)
 def test_committed_inventory_preserves_release_and_license_gaps(self):
  root=Path(__file__).resolve().parents[1]
  data=json.loads((root/'docs/anatomy/SOURCE_INVENTORY.json').read_text())
  self.assertFalse(data['femaleComplete'])
  remote=[s for s in data['sources'] if s['kind']=='REMOTE_FEMALE_METADATA_ONLY']
  self.assertEqual(len(remote),2)
  for s in remote:
   self.assertIsNone(s['assetSha256']);self.assertFalse(s['geometryDecoded'])
   self.assertEqual(len(s['glbJsonChunkSha256']),64);self.assertIn('CC BY 4.0',s['rawDataLicense'])
  nerve=next(s for s in data['sources'] if s['id']=='NervousSystem100.glb')
  self.assertEqual(nerve['redistributionReview'],'SUBCOMPONENT_PROVENANCE_UNRESOLVED')
  rows={r['structure']:r for r in data['coverage']}
  for key in ['vagus','internal_jugular','optic_sheath']:
   self.assertEqual(rows[key]['femaleEvidence'],'UNRESOLVED')
  self.assertTrue(any(r['declaredGeometry'] for r in rows['internal_jugular']['male']))
if __name__=='__main__':unittest.main()

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('Phase 4: source inventory, exact identity and bounded acquisition regressions',()=>{
 const result=spawnSync('python3',['scripts/test_anatomy_source_inventory.py'],{
  cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
});

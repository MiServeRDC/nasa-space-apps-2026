// Explicit source qualification; requires the external full-source cache.
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {hash} from './anatomyPipeline.mjs';
const app=fileURLToPath(new URL('..',import.meta.url)),cache=process.argv[2]??join(homedir(),'.cache/ares-anatomy-phase7'),out=await mkdtemp(join(tmpdir(),'ares-female-rebuild-'));
try{
 const result=spawnSync(process.execPath,['--experimental-strip-types','scripts/buildFemaleReference.mjs',cache,out],{cwd:app,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const baseline=join(app,'public/anatomy/female-hra');assert.deepEqual((await readdir(out)).sort(),(await readdir(baseline)).sort());
 for(const file of await readdir(out))assert.equal(hash(await readFile(join(out,file))),hash(await readFile(join(baseline,file))),file);
 console.log('Full-source hashes, source selection and every derivative/catalog/review artifact reproduce exactly.');
}finally{await rm(out,{recursive:true,force:true});}

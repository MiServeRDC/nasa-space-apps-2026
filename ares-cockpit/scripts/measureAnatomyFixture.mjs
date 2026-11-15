// Development-only actual GLTF decode measurements; stdout JSON stays outside git.
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGlb,disposeScene} from './anatomyPipeline.mjs';
import {geometryBytes} from '../src/anatomy/semanticGeometry.ts';
const base=resolve(fileURLToPath(new URL('../public/anatomy/fixture/',import.meta.url)));
const build=JSON.parse(await readFile(join(base,'build.json'),'utf8')),results=[];
for(const artifact of build.artifacts){
 const bytes=await readFile(join(base,artifact.file)),times=[];let decodedBytes=0;
 for(let i=0;i<21;i++){
  const start=performance.now(),gltf=await parseGlb(bytes);const duration=performance.now()-start;
  if(i>0)times.push(duration);decodedBytes=0;gltf.scene.traverse(o=>{if(o.isMesh)decodedBytes+=geometryBytes(o.geometry);});disposeScene(gltf.scene);
 }
 times.sort((a,b)=>a-b);results.push({file:artifact.file,bytes:bytes.length,decodedBytes,triangles:artifact.triangles,
  warmMedianMs:(times[9]+times[10])/2,warmP95Ms:times[18],runs:20});
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,results},null,2));

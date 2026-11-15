// Usage: node --experimental-strip-types scripts/convertAnatomy.mjs SOURCE.glb SPEC.json OUTPUT_DIRECTORY
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {convertAnatomy} from './anatomyPipeline.mjs';
const [source,specification,output]=process.argv.slice(2);
if(!source||!specification||!output)throw Error('Usage: SOURCE.glb SPEC.json OUTPUT_DIRECTORY');
const out=resolve(output);
for(const original of [source,specification])if(resolve(original).startsWith(out+sep)||resolve(original)===out)throw Error('Output must be separate from immutable sources/specification');
const report=await convertAnatomy(await readFile(source),JSON.parse(await readFile(specification,'utf8')),out);
console.log(JSON.stringify({pipeline:report.pipeline,artifacts:report.artifacts.length,sourceSha256:report.sourceSha256}));

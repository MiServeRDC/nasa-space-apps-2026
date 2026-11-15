import test from 'node:test';
import assert from 'node:assert/strict';
import {fitAnatomyRegistration} from '../../scripts/anatomyRegistration.mjs';
const points=[[-1,0,0],[1,0,0],[0,1,0],[0,0,1],[1,2,3],[-2,1,3],[2,-1,4]];
function spec(transform=(p)=>[-p[1]*2+.5,p[0]*2-.2,p[2]*2+.3]){
 const pairs=points.map((point,i)=>({id:`landmark-${i}`,source:{point:point.map(x=>x*1000),landmark:`BONE-${i}`,laterality:i%2?'RIGHT':'LEFT',nodeId:`source-${i}`},target:{point:transform(point),landmark:`BONE-${i}`,laterality:i%2?'RIGHT':'LEFT',nodeId:`target-${i}`}}));
 return {schemaVersion:1,author:'Synthetic test only',correspondenceEvidence:'Known synthetic correspondence; not a real anatomy registration',source:{sha256:'1'.repeat(64),units:'mm',axes:'GLTF_Y_UP_RIGHT_HANDED',frameId:'synthetic-source'},target:{sha256:'2'.repeat(64),units:'m',axes:'GLTF_Y_UP_RIGHT_HANDED',frameId:'synthetic-target'},fit:pairs.slice(0,4),check:pairs.slice(4)};
}
test('proper similarity recovers translation, rotation and units with independent check points',()=>{
 const r=fitAnatomyRegistration(spec());assert.ok(Math.abs(r.scaleInMetres-2)<1e-12);assert.ok(Math.abs(r.rotationDeterminant-1)<1e-12);assert.ok(r.fit.maxM<1e-12);assert.ok(r.independentCheck.maxM<1e-12);assert.equal(r.anatomicallyReviewed,false);
 const m=r.sourceRawToTargetMetresColumnMajor,p=[1000,2000,3000];const transformed=[0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);for(const [i,v]of [-3.5,1.8,6.3].entries())assert.ok(Math.abs(transformed[i]-v)<1e-12);
});
test('independent check errors do not affect fitting or disappear behind acceptance',()=>{
 const s=spec();s.check[0].target.point[0]+=.1;const r=fitAnatomyRegistration(s);assert.ok(r.fit.maxM<1e-12);assert.ok(Math.abs(r.independentCheck.maxM-.1)<1e-12);assert.equal(r.status,'COMPUTED_UNREVIEWED');assert.equal(r.anatomicallyReviewed,false);
});
test('180 degree rotations do not converge to an incorrect power-iteration eigenvector',()=>{
 for(const t of [p=>[p[0],-p[1],-p[2]],p=>[-p[0],p[1],-p[2]],p=>[-p[0],-p[1],p[2]]])assert.ok(fitAnatomyRegistration(spec(t)).independentCheck.maxM<1e-12);
});
test('reflection, degeneracy, wrong laterality, reused fit/check points and unknown units fail',()=>{
 assert.throws(()=>fitAnatomyRegistration(spec(p=>[-p[0],p[1],p[2]])),/Reflected/);
 const collinear=spec();collinear.fit.forEach((p,i)=>{p.source.point=[i,0,0];p.target.point=[i+1,0,0];});assert.throws(()=>fitAnatomyRegistration(collinear),/Degenerate/);
 const planar=spec();planar.fit.forEach((p,i)=>{p.source.point=[i,i*i,0];p.target.point=[i+1,i*i+1,0];});assert.throws(()=>fitAnatomyRegistration(planar),/Degenerate/);
 const laterality=spec();laterality.check[0].target.laterality='MIDLINE';assert.throws(()=>fitAnatomyRegistration(laterality),/laterality/);
 const duplicated=spec();duplicated.check[0].source.point=[...duplicated.fit[0].source.point];assert.throws(()=>fitAnatomyRegistration(duplicated),/Repeated/);
 const unknown=spec();unknown.source.units='inch';assert.throws(()=>fitAnatomyRegistration(unknown),/units/);
 const nonfinite=spec();nonfinite.fit[0].source.point[0]=NaN;assert.throws(()=>fitAnatomyRegistration(nonfinite),/Invalid landmark/);
});

test('registration CLI binds exact file hashes and refuses input overwrite',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,resolve}=await import('node:path'),{createHash}=await import('node:crypto'),{spawnSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'ares-registration-cli-'));
 try{
  const source=join(dir,'source'),target=join(dir,'target'),input=join(dir,'landmarks.json'),output=join(dir,'report.json'),s=spec();
  await writeFile(source,'synthetic source identity');await writeFile(target,'synthetic target identity');
  s.source.sha256=createHash('sha256').update(await readFile(source)).digest('hex');s.target.sha256=createHash('sha256').update(await readFile(target)).digest('hex');await writeFile(input,JSON.stringify(s));
  const cli=resolve(import.meta.dirname,'../../scripts/register_anatomy.mjs'),run=out=>spawnSync(process.execPath,[cli,input,source,target,out],{encoding:'utf8'});
  assert.equal(run(output).status,0);const report=JSON.parse(await readFile(output,'utf8'));assert.equal(report.source.sha256,s.source.sha256);assert.equal(report.status,'COMPUTED_UNREVIEWED');assert.ok(report.independentCheck.maxM<1e-12);
  assert.notEqual(run(input).status,0);await writeFile(source,'changed source');assert.notEqual(run(output).status,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('arbitrary 3D rotation, non-unit scale and target centimetres retain metre residuals',()=>{
 const axis=[1,2,3].map(x=>x/Math.sqrt(14)),angle=1.234,co=Math.cos(angle),si=Math.sin(angle);
 const rotate=p=>{const cross=[axis[1]*p[2]-axis[2]*p[1],axis[2]*p[0]-axis[0]*p[2],axis[0]*p[1]-axis[1]*p[0]],dot=axis.reduce((s,x,i)=>s+x*p[i],0);return p.map((x,i)=>co*x+si*cross[i]+(1-co)*dot*axis[i]);};
 const s=spec(p=>rotate(p).map((x,i)=>(x*.73+[.2,-1,3][i])*100));s.target.units='cm';const r=fitAnatomyRegistration(s);
 assert.ok(Math.abs(r.scaleInMetres-.73)<1e-12);assert.ok(r.independentCheck.maxM<1e-12);assert.ok(Math.abs(r.rotationDeterminant-1)<1e-12);
});

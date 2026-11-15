/** Horn (1987) proper rotation; least-squares uniform scale (Umeyama 1991).
 * Development evidence only. No clinical acceptance threshold or automatic approval.
 */
const unit={m:1,cm:.01,mm:.001};
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const subtract=(a,b)=>a.map((x,i)=>x-b[i]);
const average=points=>[0,1,2].map(i=>points.reduce((n,p)=>n+p[i],0)/points.length);
const det=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
function eigenSymmetric(input){
 const n=input.length,a=input.map(r=>[...r]),v=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));
 // Numerical convergence only, relative to matrix scale (not an anatomical tolerance).
 const tolerance=Number.EPSILON*Math.max(...a.flat().map(Math.abs))*32;
 for(let iteration=0;iteration<100*n*n;iteration++){
  let p=0,q=1;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(Math.abs(a[i][j])>Math.abs(a[p][q])){p=i;q=j;}
  if(Math.abs(a[p][q])<=tolerance)return {values:a.map((r,i)=>r[i]),vectors:v};
  const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle),pp=a[p][p],qq=a[q][q],pq=a[p][q];
  for(let k=0;k<n;k++)if(k!==p&&k!==q){const kp=a[k][p],kq=a[k][q];a[k][p]=a[p][k]=c*kp-s*kq;a[k][q]=a[q][k]=s*kp+c*kq;}
  a[p][p]=c*c*pp-2*s*c*pq+s*s*qq;a[q][q]=s*s*pp+2*s*c*pq+c*c*qq;a[p][q]=a[q][p]=0;
  for(let k=0;k<n;k++){const vp=v[k][p],vq=v[k][q];v[k][p]=c*vp-s*vq;v[k][q]=s*vp+c*vq;}
 }
 throw Error('Registration eigensolver did not converge');
}
export function fitAnatomyRegistration(spec){
 if(spec.schemaVersion!==1||!spec.author?.trim()||!spec.correspondenceEvidence?.trim())throw Error('Authored correspondence evidence required');
 for(const asset of [spec.source,spec.target])if(!asset||!unit[asset.units]||!/^[0-9a-f]{64}$/.test(asset.sha256)||asset.axes!=='GLTF_Y_UP_RIGHT_HANDED'||!asset.frameId?.trim())throw Error('Invalid source identity, units or axes');
 if(!Array.isArray(spec.fit)||spec.fit.length<4||!Array.isArray(spec.check)||spec.check.length<3)throw Error('At least four 3D fit landmarks and three independent check landmarks required');
 const ids=new Set(),sourcePoints=new Set(),targetPoints=new Set();
 for(const pair of [...spec.fit,...spec.check]){
  if(!pair.id||ids.has(pair.id))throw Error('Repeated fit/check identity');ids.add(pair.id);
  const [a,b]=[pair.source,pair.target];
  if(!a?.landmark||a.landmark!==b?.landmark||!['LEFT','RIGHT','MIDLINE'].includes(a.laterality)||a.laterality!==b.laterality||!a.nodeId||!b.nodeId)throw Error('Mismatched landmark anatomy, node identity or laterality');
  for(const p of [a.point,b.point])if(!Array.isArray(p)||p.length!==3||p.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw Error('Invalid landmark point');
  const sp=JSON.stringify(a.point),tp=JSON.stringify(b.point);if(sourcePoints.has(sp)||targetPoints.has(tp))throw Error('Repeated fit/check coordinates');sourcePoints.add(sp);targetPoints.add(tp);
 }
 const points=(pairs,key)=>pairs.map(p=>p[key].point.map(x=>x*unit[spec[key].units]));
 const x=points(spec.fit,'source'),y=points(spec.fit,'target'),xc=average(x),yc=average(y),xs=x.map(p=>subtract(p,xc)),ys=y.map(p=>subtract(p,yc));
 const covariance=(a,b)=>[0,1,2].map(i=>[0,1,2].map(j=>a.reduce((n,p,k)=>n+p[i]*b[k][j],0)));
 for(const p of [xs,ys]){const eigen=eigenSymmetric(covariance(p,p)).values;if(Math.min(...eigen)<=Math.max(...eigen)*Number.EPSILON*64)throw Error('Degenerate or ill-conditioned 3D landmarks');}
 const m=covariance(xs,ys);if(det(m)<=0)throw Error('Reflected or degenerate correspondence');
 const [[xx,xy,xz],[yx,yy,yz],[zx,zy,zz]]=m;
 const horn=[[xx+yy+zz,yz-zy,zx-xz,xy-yx],[yz-zy,xx-yy-zz,xy+yx,zx+xz],[zx-xz,xy+yx,-xx+yy-zz,yz+zy],[xy-yx,zx+xz,yz+zy,-xx-yy+zz]];
 const eigen=eigenSymmetric(horn),column=eigen.values.indexOf(Math.max(...eigen.values)),raw=eigen.vectors.map(r=>r[column]),norm=Math.hypot(...raw),[w,a,b,c]=raw.map(x=>x/norm);
 const rotation=[[1-2*(b*b+c*c),2*(a*b-w*c),2*(a*c+w*b)],[2*(a*b+w*c),1-2*(a*a+c*c),2*(b*c-w*a)],[2*(a*c-w*b),2*(b*c+w*a),1-2*(a*a+b*b)]];
 const rotate=p=>rotation.map(row=>dot(row,p));
 const scale=xs.reduce((n,p,i)=>n+dot(rotate(p),ys[i]),0)/xs.reduce((n,p)=>n+dot(p,p),0);
 if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid uniform scale');
 const translation=yc.map((v,i)=>v-scale*rotate(xc)[i]);
 const transform=p=>rotate(p).map((v,i)=>scale*v+translation[i]);
 const residuals=pairs=>{const ps=points(pairs,'source'),qs=points(pairs,'target'),perLandmark=pairs.map((p,i)=>({id:p.id,laterality:p.source.laterality,errorM:Math.hypot(...subtract(transform(ps[i]),qs[i]))}));if(perLandmark.some(p=>!Number.isFinite(p.errorM)))throw Error('Non-finite registration residual');return {rmsM:Math.sqrt(perLandmark.reduce((n,r)=>n+r.errorM**2,0)/pairs.length),maxM:Math.max(...perLandmark.map(p=>p.errorM)),perLandmark};};
 const matrix=[0,1,2].flatMap(j=>[...rotation.map(row=>row[j]*scale*unit[spec.source.units]),0]).concat([...translation,1]);
 if(matrix.some(x=>!Number.isFinite(x)))throw Error('Non-finite registration');
 return {schemaVersion:1,status:'COMPUTED_UNREVIEWED',anatomicallyReviewed:false,method:'HORN_QUATERNION_ROTATION_WITH_LEAST_SQUARES_UNIFORM_SCALE',source:spec.source,target:spec.target,author:spec.author,correspondenceEvidence:spec.correspondenceEvidence,scaleInMetres:scale,rotationDeterminant:det(rotation),sourceRawToTargetMetresColumnMajor:matrix,fit:residuals(spec.fit),independentCheck:residuals(spec.check),landmarks:{fit:spec.fit,check:spec.check},acceptance:'Not automatically accepted. Independent anatomical review and tolerances are required.'};
}

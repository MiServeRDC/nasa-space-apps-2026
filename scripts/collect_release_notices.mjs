#!/usr/bin/env node
/** Build-time license collection only; no Node/Python runtime is shipped to judges. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const args=process.argv.slice(2), index=args.indexOf('--out');
if(index<0||!args[index+1])throw new Error('--out DIRECTORY is required');
const out=path.resolve(args[index+1]);fs.mkdirSync(out,{recursive:true});
const records=[];
function collect(name,version,license,root,repository) {
  const id=`${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}-${version}`;
  const dest=path.join(out,id);fs.mkdirSync(dest,{recursive:true});
  const copied=[];
  for(const file of fs.readdirSync(root,{withFileTypes:true})) {
    if(file.isFile()&&/^(licen[sc]e|copying|notice|ofl)([._-]|$)/i.test(file.name)) {
      fs.copyFileSync(path.join(root,file.name),path.join(dest,file.name));copied.push(file.name);
    }
  }
  records.push({name,version,license:license??'SEE_SOURCE',repository:typeof repository==='string'?repository:repository?.url,files:copied});
}
if(!args.includes('--rust-only')) {
  const lock=JSON.parse(fs.readFileSync('ares-cockpit/package-lock.json','utf8'));
  for(const key of Object.keys(lock.packages??{})) {
    if(!key.startsWith('node_modules/'))continue;
    const root=path.resolve('ares-cockpit',key),manifest=path.join(root,'package.json');
    if(!fs.existsSync(manifest))continue;
    const p=JSON.parse(fs.readFileSync(manifest,'utf8'));
    collect(p.name,p.version,p.license,root,p.repository);
  }
}
if(!args.includes('--npm-only')) {
  const metadata=JSON.parse(execFileSync('cargo',['metadata','--locked','--format-version','1'],{encoding:'utf8',maxBuffer:64*1024*1024}));
  for(const p of metadata.packages) {
    if(metadata.workspace_members.includes(p.id))continue;
    collect(p.name,p.version,p.license,path.dirname(p.manifest_path),p.repository);
  }
}
records.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
fs.writeFileSync(path.join(out,'INDEX.json'),JSON.stringify(records,null,2)+'\n');
fs.writeFileSync(path.join(out,'README.txt'),'Third-party package versions, declared licenses, source links and available license texts.\nAssets retain their separate credits/licenses under frontend/anatomy and frontend/fonts.\nThe package list may include build-only or unused optional dependencies; it is not a claim that every dependency runs in this release.\nEntries without bundled license text retain source/license identifiers and require review before redistribution.\n');
console.log(`Collected notices for ${records.length} packages in ${out}; ${records.filter(r=>!r.files.length).length} have no root license text.`);

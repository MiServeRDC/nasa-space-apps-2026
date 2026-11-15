#!/usr/bin/env node
/** Build a relocatable native demo from already compiled, verified artifacts. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const args=process.argv.slice(2), outIndex=args.indexOf('--out');
if(outIndex<0||!args[outIndex+1])throw new Error('--out ABSOLUTE_DIRECTORY is required');
const root=process.cwd(), output=path.resolve(args[outIndex+1]);
const dirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0;
if(dirty&&!args.includes('--allow-dirty'))throw new Error('Commit the verified changes first; --allow-dirty is for local preview bundles only.');
const target=process.env.CARGO_TARGET_DIR??path.join(root,'target');
const binary=path.join(target,'release/ares-server-cli');
const version=execFileSync(binary,['--version'],{encoding:'utf8'}).trim();
if(!['darwin','linux'].includes(process.platform))throw new Error('This launcher currently packages macOS/Linux native builds only.');
const name=`ARES-Health-${process.platform}-${process.arch}`, bundle=path.join(output,name);
if(fs.existsSync(bundle))throw new Error(`Refusing to overwrite ${bundle}`);
fs.mkdirSync(bundle,{recursive:true});
function copyTree(from,to) {
  if(fs.lstatSync(from).isSymbolicLink())throw new Error(`Refusing symlink: ${from}`);
  if(fs.statSync(from).isDirectory()) {
    fs.mkdirSync(to,{recursive:true});
    for(const name of fs.readdirSync(from))copyTree(path.join(from,name),path.join(to,name));
  } else {fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}
}
copyTree(binary,path.join(bundle,'bin/ares-server-cli'));fs.chmodSync(path.join(bundle,'bin/ares-server-cli'),0o755);
copyTree('ares-cockpit/dist',path.join(bundle,'frontend'));
copyTree('data/bidmc',path.join(bundle,'data/bidmc'));
for(const f of ['LICENSE','LICENSE-APACHE'])copyTree(f,path.join(bundle,f));
copyTree('docs/submission/JUDGES_START_HERE.md',path.join(bundle,'README.md'));
copyTree('scripts/run_judges_demo.sh',path.join(bundle,'scripts/run_judges_demo.sh'));
fs.chmodSync(path.join(bundle,'scripts/run_judges_demo.sh'),0o755);
fs.writeFileSync(path.join(bundle,'Start.command'),'#!/bin/sh\nexec "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/scripts/run_judges_demo.sh"\n',{mode:0o755});
execFileSync(process.execPath,['scripts/collect_release_notices.mjs','--out',path.join(bundle,'frontend/third-party')],{stdio:'inherit'});
const manifest={version,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source_dirty:dirty,
  platform:process.platform,architecture:process.arch,built_at:new Date().toISOString(),host:os.release(),
  runtime:'Native Rust HTTP/WebSocket server and bundled static cockpit; no Node, Cargo or Python runtime required',
  source:'PhysioNet BIDMC terrestrial replay; scenario/injected values explicitly simulated',recording:false,
  notices:'frontend/third-party/INDEX.json; frontend/anatomy/ATTRIBUTION*.md; frontend/fonts/LICENSE-OFL-1.1.txt'};
fs.writeFileSync(path.join(bundle,'RELEASE.json'),JSON.stringify(manifest,null,2)+'\n');
const sums=[];
function digest(directory) {
 for(const name of fs.readdirSync(directory).sort()) {
  const p=path.join(directory,name);
  if(fs.statSync(p).isDirectory())digest(p);else {
   const relative=path.relative(bundle,p).split(path.sep).join('/');
   if(/[\n\r]/.test(relative))throw new Error('Unsupported filename');
   sums.push(`${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}  ${relative}`);
  }
 }
}
digest(bundle);fs.writeFileSync(path.join(bundle,'SHA256SUMS'),sums.join('\n')+'\n');
const archive=path.join(output,name+'.tar.gz');execFileSync('tar',['-czf',archive,'-C',output,name]);
fs.writeFileSync(archive+'.sha256',crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')+'  '+path.basename(archive)+'\n');
if(!dirty) {
 const source=path.join(output,'ARES-Health-source.zip');
 execFileSync('git',['archive','--format=zip','--prefix=ARES-Health-source/','-o',source,'HEAD']);
 fs.writeFileSync(source+'.sha256',crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')+'  '+path.basename(source)+'\n');
}
console.log(JSON.stringify({bundle,archive,files:sums.length,bytes:fs.statSync(archive).size,source_dirty:dirty}));

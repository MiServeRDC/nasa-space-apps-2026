import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {pickSemantic,type SemanticBatch,type SemanticHit} from './semanticGeometry';
export default function FixtureCanvas({batches,onSelect,onUnavailable,onMemory,autoFrame=false,label='Synthetic reference model',selectedId=null,keyboardPicking=false}:{keyboardPicking?:boolean;autoFrame?:boolean;label?:string;selectedId?:string|null;batches:readonly SemanticBatch[];onSelect:(id:string,point:[number,number,number],hit:SemanticHit)=>void;onUnavailable:(message:string|null)=>void;onMemory:(count:number)=>void}){
 const host=useRef<HTMLDivElement>(null),renderRef=useRef<(()=>void)|null>(null),sceneRef=useRef<THREE.Scene|null>(null);
 const frameRef=useRef<(()=>void)|null>(null);
 const memoryRef=useRef(onMemory);memoryRef.current=onMemory;
 const batchesRef=useRef(batches),selectRef=useRef(onSelect);batchesRef.current=batches;selectRef.current=onSelect;
 useEffect(()=>{
  const el=host.current;if(!el)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{onUnavailable('3D unavailable; use structure buttons.');return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));el.appendChild(renderer.domElement);
  const scene=new THREE.Scene();sceneRef.current=scene;
  const camera=new THREE.PerspectiveCamera(40,1,.01,100);camera.position.set(0,0,4);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
  const frame=()=>{if(!autoFrame)return;const box=new THREE.Box3();for(const b of batchesRef.current)box.expandByObject(b.mesh);
   if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
   const radius=Math.max(size.length()/2,.001),distance=radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))/Math.min(camera.aspect,1)*1.12;
   controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,0,distance));camera.near=Math.max(distance/1000,.00001);camera.far=distance+radius*10;camera.updateProjectionMatrix();controls.update();};frameRef.current=frame;
  const render=()=>{if(!renderer.getContext().isContextLost())renderer.render(scene,camera);memoryRef.current(renderer.info.memory.geometries);};renderRef.current=render;
  const resize=()=>{const w=Math.max(el.clientWidth,1),h=Math.max(el.clientHeight,1);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();frame();render();};
  let moved=false;const down=()=>{moved=false;};const change=()=>{moved=true;render();};
  const keyPick=(event:KeyboardEvent)=>{if(!keyboardPicking||event.key!=='Enter')return;event.preventDefault();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);const hit=pickSemantic(batchesRef.current,ray);if(hit)selectRef.current(hit.structureId,hit.point.toArray() as [number,number,number],hit);};
  if(keyboardPicking){renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D reference viewport. Arrow keys pan, Control and arrow keys rotate, Enter selects an actual surface at the viewport center.');controls.listenToKeyEvents(renderer.domElement);renderer.domElement.addEventListener('keydown',keyPick);}
  const up=(event:PointerEvent)=>{if(moved)return;const rect=renderer.domElement.getBoundingClientRect();
   const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
   const hit=pickSemantic(batchesRef.current,ray);if(hit)selectRef.current(hit.structureId,hit.point.toArray() as [number,number,number],hit);};
  const lost=(event:Event)=>{event.preventDefault();onUnavailable('3D context lost; structure buttons remain available.');};
  const restored=()=>{onUnavailable(null);render();};
  renderer.domElement.addEventListener('webglcontextrestored',restored);
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('webglcontextlost',lost);
  controls.addEventListener('change',change);const observer=new ResizeObserver(resize);observer.observe(el);
  for(const b of batchesRef.current)scene.add(b.mesh);resize();
  return ()=>{renderer.domElement.removeEventListener('keydown',keyPick);observer.disconnect();controls.removeEventListener('change',change);controls.dispose();
   renderer.domElement.removeEventListener('webglcontextrestored',restored);
   renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('webglcontextlost',lost);
   // Geometry/material ownership belongs to the session, never dispose it twice here.
   scene.clear();sceneRef.current=null;renderRef.current=null;frameRef.current=null;renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
 },[]);
 useEffect(()=>{const scene=sceneRef.current;if(!scene)return;scene.clear();for(const b of batches)scene.add(b.mesh);frameRef.current?.();renderRef.current?.();},[batches]);
 return <div className="relative">{keyboardPicking?<span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-sm text-white">+</span>:null}<div ref={host} className="h-[420px] w-full" data-anatomy-canvas="true" aria-label={`${label}; use the labelled structure buttons for keyboard selection`} data-selected-id={selectedId??'none'}/></div>;
}

import {useCallback,useEffect,useRef,useState} from 'react';
import {renderSettings,type RenderProfile} from '../../lib/renderQuality';

const preferenceKey='ares.render-profile';
function preferredProfile():RenderProfile {
  try {
    const value=localStorage.getItem(preferenceKey);
    if(value==='LITE'||value==='STANDARD'||value==='HIGH') return value;
  } catch { /* Storage may be unavailable in a private WebView. */ }
  return 'AUTO';
}
export function useRenderQuality(viewActive=true) {
  const [profile,setProfileState]=useState<RenderProfile>(preferredProfile);
  const setProfile=useCallback((value:RenderProfile)=>{
    setProfileState(value);
    try {localStorage.setItem(preferenceKey,value);} catch { /* Keep the in-memory choice. */ }
  },[]);
  const [factor,setFactor]=useState(0.5);
  const [hidden,setHidden]=useState(document.hidden);
  const [intersects,setIntersects]=useState(true);
  const [deviceDpr,setDeviceDpr]=useState(window.devicePixelRatio);
  const [reducedMotion,setReducedMotion]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const viewportRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const visibility=()=>setHidden(document.hidden);
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const motion=()=>setReducedMotion(media.matches);
    const resize=()=>{setDeviceDpr(window.devicePixelRatio);setFactor(0.5);};
    document.addEventListener('visibilitychange',visibility);
    media.addEventListener('change',motion);
    window.addEventListener('resize',resize);
    const observer=typeof IntersectionObserver==='undefined' ? null : new IntersectionObserver(entries=>{
      setIntersects(entries.some(entry=>entry.isIntersecting));
    });
    if(viewportRef.current) observer?.observe(viewportRef.current);
    return ()=>{
      document.removeEventListener('visibilitychange',visibility);
      media.removeEventListener('change',motion);
      window.removeEventListener('resize',resize);
      observer?.disconnect();
    };
  },[]);
  useEffect(()=>{if(viewActive) setProfileState(preferredProfile());},[viewActive]);
  return {profile,setProfile,factor,setFactor,viewportRef,reducedMotion,active:!hidden&&intersects&&viewActive,
    ...renderSettings(profile,factor,deviceDpr,hidden||!intersects||!viewActive,reducedMotion)};
}

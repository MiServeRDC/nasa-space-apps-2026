import {useEffect,useState} from 'react';
/** Keep presentation controls synchronized when the OS preference changes live. */
export function useReducedMotionPreference(){
 const [reduced,setReduced]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(media.matches);update();media.addEventListener('change',update);return ()=>media.removeEventListener('change',update);},[]);
 return reduced;
}

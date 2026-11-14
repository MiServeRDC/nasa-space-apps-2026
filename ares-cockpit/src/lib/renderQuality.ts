export type RenderProfile='AUTO'|'LITE'|'STANDARD'|'HIGH';

/** UI quality policy only: never changes sensor data, clinical thresholds or picking IDs. */
export function renderSettings(profile:RenderProfile,factor:number,deviceDpr:number,hidden:boolean,reducedMotion:boolean) {
  const device=Number.isFinite(deviceDpr) && deviceDpr>0 ? Math.min(2,deviceDpr) : 1;
  const adaptive=Number.isFinite(factor) ? Math.max(0,Math.min(1,factor)) : 0.5;
  const requested=profile==='LITE' ? 0.75 : profile==='STANDARD' ? 1.25 : profile==='HIGH' ? 2 : 0.75+1.25*adaptive;
  return {dpr:Math.min(device,requested),frameloop:hidden ? 'never' as const : reducedMotion || profile==='LITE' ? 'demand' as const : 'always' as const};
}

import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useTelemetry} from '../src/lib/useTelemetry';
import {DEFAULT_WHATIF} from '../src/lib/scenario';

function Harness() {
  const [overlay,setOverlay]=useState(false);
  const t=useTelemetry(DEFAULT_WHATIF,null,0,overlay);
  return <><button onClick={()=>setOverlay(v=>!v)}>Toggle preview</button><output>{JSON.stringify({
    link:t.link,localFrames:t.localSimulationFrameCount,overlay,alarm:t.packet.safety_margins.alarm_level,
    missing:t.packet.biometrics.hrv_rmssd_ms===null,
  })}</output></>;
}
const element=document.getElementById('root');
if(element) createRoot(element).render(<Harness/>);

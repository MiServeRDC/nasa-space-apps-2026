import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PressAndHoldCountermeasureButton} from '../src/lenses/BranchedPlaybookDagLens';
const action = {action_id:'TEST_LOCAL_NOTE',label:'Test local note',category:'TEST',delta_rho_per_hour:0};
function Harness() {
  const [count,setCount] = useState(0);
  return <><PressAndHoldCountermeasureButton action={action} completed={false} onConfirm={()=>setCount(n=>n+1)} />
    <output>{count}</output><button id="other">Other focus target</button></>;
}
const root=document.getElementById('root');if(root)createRoot(root).render(<Harness/>);

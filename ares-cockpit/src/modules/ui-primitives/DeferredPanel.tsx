import {Component, Suspense, type ReactNode} from 'react';

class PanelErrorBoundary extends Component<{name:string; children:ReactNode}, {failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() {
    if(this.state.failed) return <div role="alert" className="rounded border border-warning p-4 text-sm text-warning">
      <p>{this.props.name} could not be loaded. Check that all local application files are available.</p>
      <button type="button" className="mt-3 rounded border px-3 py-2" onClick={()=>window.location.reload()}>Reload interface</button>
    </div>;
    return this.props.children;
  }
}

/** Local chunks only; failures stay inside the optional panel, not the monitor. */
export function DeferredPanel({name,children}:{name:string;children:ReactNode}) {
  return <PanelErrorBoundary name={name}><Suspense fallback={<div role="status" className="p-4 text-sm text-gray-400">Loading {name}…</div>}>
    {children}
  </Suspense></PanelErrorBoundary>;
}

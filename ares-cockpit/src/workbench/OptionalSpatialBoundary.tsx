import React, { lazy, Suspense } from 'react';
import type { OptionalSpatialSceneProps } from '../stage3d/OptionalSpatialScene';
const Scene = lazy(() => import('../stage3d/OptionalSpatialScene'));
class Boundary extends React.Component<{children: React.ReactNode; onFailure: () => void}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
export function OptionalSpatialBoundary(props: OptionalSpatialSceneProps & {onFailure: () => void}) {
  // Checking the interface avoids allocating a second probe WebGL context.
  const supported = typeof window !== 'undefined' && typeof window.WebGL2RenderingContext !== 'undefined';
  if (!supported) return null;
  const {onFailure, ...scene} = props;
  return <Boundary onFailure={onFailure}><Suspense fallback={null}><Scene {...scene} /></Suspense></Boundary>;
}

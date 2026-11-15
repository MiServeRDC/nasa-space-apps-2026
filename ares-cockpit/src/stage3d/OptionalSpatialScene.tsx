import {View} from '@react-three/drei';
import type { ComponentProps, RefObject } from 'react';
import { SpatialCanvasRoot } from './SpatialCanvasRoot';
import { BiodigitalTwinStage } from './BiodigitalTwinStage';
export interface OptionalSpatialSceneProps extends ComponentProps<typeof BiodigitalTwinStage> {
  eventSource: ComponentProps<typeof SpatialCanvasRoot>['eventSource'];
  onContextLostChange: (lost: boolean) => void;
}
export default function OptionalSpatialScene({eventSource, onContextLostChange, ...stage}: OptionalSpatialSceneProps) {
  return <SpatialCanvasRoot eventSource={eventSource} onContextLostChange={onContextLostChange}>
    <View track={stage.apertureTrackRef as RefObject<HTMLElement>} index={1}><BiodigitalTwinStage {...stage} /></View>
  </SpatialCanvasRoot>;
}

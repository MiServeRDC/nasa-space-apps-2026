import type { TelemetryPacket } from '../types/telemetry';
import { clinicalSourceLabel } from '../lib/clinicalViewModel';

export function ClinicalDataNotice({ packet }: { packet: TelemetryPacket }) {
  return <p className="font-mono text-[10px] text-amber-300" data-clinical-provenance={packet.provenance_manifest.biometrics_source}>
    {clinicalSourceLabel(packet)} · model outputs: {packet.model_validation_status ?? 'ILLUSTRATIVE_UNVALIDATED'}.
    Missing values remain unavailable.
  </p>;
}

// Protocol identifiers retain their original form on the wire and in raw results.
const LABELS: Record<string, string> = {
  BEAT_INTERVALS_NOT_AVAILABLE: 'Beat intervals unavailable',
  CHANNEL_NAN_DROPOUT: 'Missing sensor sample',
  DERIVED_FROM_HYBRID_SCENARIO: 'Calculated from a mixed scenario',
  HOLD_LAST_VALID: 'Last valid reading',
  ILLUSTRATIVE_UNVALIDATED: 'Illustrative, unvalidated',
  LOCAL_OFFLINE_SIMULATION: 'Local simulation',
  MANIFEST_SHA256_VERIFIED: 'Dataset checksum verified',
  rr_interval_ms: 'Beat interval',
  hrv_rmssd_ms: 'Heart rate variability',
};

export function displayLabel(value: string): string {
  if (Object.hasOwn(LABELS, value)) return LABELS[value];
  return value.replace(/\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+\b/g, token => {
    const words = token.replaceAll('_', ' ');
    return words === words.toUpperCase()
      ? words[0] + words.slice(1).toLowerCase()
      : words;
  });
}

/** Never enable server-based Web Speech or download language packs implicitly. */
export function requireLocalSpeech(recognition: {processLocally?: boolean}): boolean {
  try {
    if (!('processLocally' in recognition)) return false;
    recognition.processLocally = true;
    return recognition.processLocally === true;
  } catch { return false; }
}

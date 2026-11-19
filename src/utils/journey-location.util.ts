/** Display Unicode filenames while retaining the encoded URL in the visit record. */
export function readableJourneyLocation(value: string): string {
  return value.replace(/(?:%20|%[8-9A-F][0-9A-F])+/gi, bytes => {
    try { return decodeURIComponent(bytes); }
    catch { return bytes; }
  });
}

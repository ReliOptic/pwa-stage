/** Empty fields use the host environment. Invalid IPC or persisted values never reach CDP. */
export function regionLanguage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 80) return null;
  if (!value.trim()) return '';
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}

export function regionTimeZone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 100) return null;
  const zone = value.trim();
  if (!zone) return '';
  if (!/^[A-Za-z][A-Za-z0-9._+\/-]*$/.test(zone)) return null;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

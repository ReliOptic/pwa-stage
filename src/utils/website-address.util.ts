/** Resolve an address typed in the device, toolbar or journey form. */
export function parseWebsiteAddress(raw: string): URL | null {
  const value = raw.trim();
  if (!value || /[\t\r\n\\]/.test(value)) return null;
  if (/^https?:\/\//i.test(value)) return URL.parse(value);
  if (/^:\d+(?:[/?#]|$)/.test(value)) return URL.parse('http://localhost' + value);
  if (value.startsWith('/') || (/^[a-z][\w.+-]*:/i.test(value) && !/^[^:/?#]+:\d+(?:[/?#]|$)/.test(value))) return null;

  const url = URL.parse('https://' + value);
  if (url && (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
      url.hostname === '[::1]' || url.hostname === '0.0.0.0' || /^127(?:\.\d+){3}$/.test(url.hostname))) {
    // Reparse with the chosen scheme so an explicit port 443 is retained.
    return URL.parse('http://' + value);
  }
  return url;
}

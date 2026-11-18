import type { TouchIcon } from '../types/pwa.types';

/** Pick the smallest declared square rendition that covers the desired backing pixels. */
export function chooseTouchIcon(icons: readonly TouchIcon[] | undefined, pixels: number): string | null {
  let above = Infinity, below = 0;
  let fit: string | null = null, smaller: string | null = null, unspecified: string | null = null;
  if (!Array.isArray(icons)) return null;
  for (const icon of icons) {
    if (!icon || typeof icon.src !== 'string' || !/^https?:\/\//i.test(icon.src)) continue;
    const sizes = typeof icon.sizes === 'string' ? icon.sizes.trim().toLowerCase() : '';
    if (!sizes) unspecified ??= icon.src;
    for (const token of sizes.split(/\s+/)) {
      if (token === 'any') { fit ??= icon.src; continue; }
      const match = /^(\d+)x(\d+)$/.exec(token);
      if (!match || match[1] !== match[2]) continue;
      const n = Number(match[1]);
      if (n >= pixels && n < above) { above = n; fit = icon.src; }
      if (n < pixels && n > below) { below = n; smaller = icon.src; }
    }
  }
  return fit ?? smaller ?? unspecified;
}

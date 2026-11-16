/** Relative luminance (0..1) of a #hex / rgb() / rgba() color, or null if unparseable. */
export function cssColorLuminance(color: string | null | undefined): number | null {
  if (!color) return null;
  const c = color.trim().toLowerCase();
  let rgb: [number, number, number] | null = null;
  const hex = /^#([0-9a-f]{3,8})$/.exec(c);
  if (hex) {
    const h = hex[1];
    const full = h.length <= 4 ? h.split('').map((x) => x + x).join('') : h;
    rgb = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  } else {
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(c);
    if (m) {
      const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
      if (alpha < 0.1) return null;
      rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
    } else if (c === 'white') {
      rgb = [255, 255, 255];
    } else if (c === 'black') {
      rgb = [0, 0, 0];
    }
  }
  if (!rgb || rgb.some((v) => !Number.isFinite(v))) return null;
  const lin = rgb.map((v) => {
    const x = Math.min(255, Math.max(0, v)) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** iOS picks light (white) status-bar content on dark backgrounds. */
export function prefersLightContent(background: string | null | undefined, fallbackDark: boolean): boolean {
  const lum = cssColorLuminance(background);
  return lum === null ? fallbackDark : lum < 0.4;
}

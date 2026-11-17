/** Reference-normalized estimates, NOT UIKit metrics. See docs/ios-home-layout-measurements.md. */
export function resolveHomeLayout(width: number, height: number, rail = 0, safeTop = 62) {
  const inner = rail > 0 && width > 700;
  const compact = height < 740;
  const landscape = rail === 0 && width > height;
  const icon = rail ? 60 : width < 400 ? 60 : 64;
  const panelWidth = rail ? (inner ? 340 : width - rail - 50) : Math.min(width - 56, 390);
  const left = rail ? (inner ? width - rail - 405 : 28) : (width - panelWidth) / 2;
  const top = rail ? 54 : landscape ? 24 : safeTop + (compact ? 18 : 28);
  const widget = (panelWidth - 22) / 2;
  const dockHeight = rail ? 266 : 100;
  const dockBottom = rail ? (height - dockHeight) / 2 - (inner ? 16 : 40) : compact ? 8 : 18;
  const gridTop = top + (landscape ? 0 : widget + (compact && !rail ? 34 : 38));
  const searchTop = rail ? height - 66 : height - (compact ? 138 : 168);
  const pageDotsTop = rail ? height - 34 : searchTop - 28;
  const gridBottom = pageDotsTop - 8;
  const rows = Math.max(1, Math.min(landscape ? 2 : 4,
    1 + Math.floor((gridBottom - gridTop - icon - 19) / (icon + 16))));
  const pitch = rows > 1 ? Math.min(100, (gridBottom - gridTop - icon - 19) / (rows - 1)) : icon + 19;
  return { inner, landscape, icon, panelWidth, left, top, widget, gridTop, rows,
    pitch: Math.max(icon + 16, pitch), capacity: rows * 4, dockHeight, dockBottom, searchTop, pageDotsTop,
    dockIcon: rail ? 48 : icon, label: 12 };
}

/** Page count never drops to zero; clamp after removing the last app on a page. */
export function resolveHomePage(count: number, capacity: number, requested: number) {
  const pages = Math.max(1, Math.ceil(count / capacity));
  return { pages, page: Math.max(0, Math.min(requested, pages - 1)) };
}

/** Original mathematical superellipse; exponent is a visual estimate, not Apple's curve. */
export function homeIconClip(size: number): string {
  const points = Array.from({ length: 128 }, (_, i) => {
    const t = i * Math.PI * 2 / 128;
    const f = (v: number) => size / 2 * (1 + Math.sign(v) * Math.pow(Math.abs(v), 2 / 4.5));
    return `${f(Math.cos(t)).toFixed(3)} ${f(Math.sin(t)).toFixed(3)}`;
  });
  return `path('M ${points.join(' L ')} Z')`;
}

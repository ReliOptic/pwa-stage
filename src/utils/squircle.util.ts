import { CornerRadiiSpec } from '../types/device.types';

export function buildAppleSquirclePath(
  width: number,
  height: number,
  radii: CornerRadiiSpec
): string {
  const tl = Math.min(radii.topLeft, width / 2, height / 2);
  const tr = Math.min(radii.topRight, width / 2, height / 2);
  const br = Math.min(radii.bottomRight, width / 2, height / 2);
  const bl = Math.min(radii.bottomLeft, width / 2, height / 2);

  const s = 1.28;
  const tlReach = Math.min(width / 2, height / 2, tl * s);
  const trReach = Math.min(width / 2, height / 2, tr * s);
  const brReach = Math.min(width / 2, height / 2, br * s);
  const blReach = Math.min(width / 2, height / 2, bl * s);

  const k1 = 0.63;
  const k2 = 0.14;

  return [
    `M ${tlReach.toFixed(2)} 0`,
    `L ${(width - trReach).toFixed(2)} 0`,
    `C ${(width - tr * k1).toFixed(2)} 0, ${(width - tr * k2).toFixed(2)} ${(tr * k2).toFixed(2)}, ${(width - tr * k2).toFixed(2)} ${(tr * k2).toFixed(2)}`,
    `C ${width} ${(tr * k1).toFixed(2)}, ${width} ${trReach.toFixed(2)}, ${width} ${trReach.toFixed(2)}`,
    `L ${width} ${(height - brReach).toFixed(2)}`,
    `C ${width} ${(height - br * k1).toFixed(2)}, ${(width - br * k2).toFixed(2)} ${(height - br * k2).toFixed(2)}, ${(width - br * k2).toFixed(2)} ${(height - br * k2).toFixed(2)}`,
    `C ${(width - br * k1).toFixed(2)} ${height}, ${(width - brReach).toFixed(2)} ${height}, ${(width - brReach).toFixed(2)} ${height}`,
    `L ${blReach.toFixed(2)} ${height}`,
    `C ${(bl * k1).toFixed(2)} ${height}, ${(bl * k2).toFixed(2)} ${(height - bl * k2).toFixed(2)}, ${(bl * k2).toFixed(2)} ${(height - bl * k2).toFixed(2)}`,
    `C 0 ${(height - bl * k1).toFixed(2)}, 0 ${(height - blReach).toFixed(2)}, 0 ${(height - blReach).toFixed(2)}`,
    `L 0 ${tlReach.toFixed(2)}`,
    `C 0 ${(tl * k1).toFixed(2)}, ${(tl * k2).toFixed(2)} ${(tl * k2).toFixed(2)}, ${(tl * k2).toFixed(2)} ${(tl * k2).toFixed(2)}`,
    `C ${(tl * k1).toFixed(2)} 0, ${tlReach.toFixed(2)} 0, ${tlReach.toFixed(2)} 0`,
    'Z'
  ].join(' ');
}

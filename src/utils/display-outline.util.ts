/** Geometry read from the bundled display mesh, not a measured physical device. */
export interface DisplayOutline {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly y: number;
  readonly points: readonly (readonly [number, number])[];
}

/** Screen meshes are convex in their bind plane. Ignore duplicate/interior vertices. */
export function readDisplayOutline(positions: ArrayLike<number>): DisplayOutline {
  const points: [number, number][] = [];
  let y = 0;
  for (let i = 0; i < positions.length; i += 3) {
    points.push([positions[i], positions[i + 2]]);
    y += positions[i + 1];
  }
  if (points.length < 3) throw new Error('Display mesh has no aperture');
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]): [number, number][] => {
    const hull: [number, number][] = [];
    for (const p of list) {
      while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
      hull.push(p);
    }
    return hull.slice(0, -1);
  };
  const hull = [...half(points), ...half([...points].reverse())];
  return {
    minX: points[0][0], maxX: points[points.length - 1][0],
    minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1])),
    y: y / points.length, points: hull
  };
}

/** The outer panel reads right-to-left in bind coordinates; Stand rotates it clockwise. */
export function displayOutlineCss(outline: DisplayOutline, outer = false, rotated = false): string {
  return `polygon(${outline.points.map(([x, z]) => {
    const u = (x - outline.minX) / (outline.maxX - outline.minX);
    const v = (z - outline.minZ) / (outline.maxZ - outline.minZ);
    const px = outer ? 1 - u : u;
    return rotated ? `${((1 - v) * 100).toFixed(5)}% ${(px * 100).toFixed(5)}%`
      : `${(px * 100).toFixed(5)}% ${(v * 100).toFixed(5)}%`;
  }).join(',')})`;
}

/** Clip a convex outline to the left half without reordering its boundary. */
export function leftDisplayContour(outline: DisplayOutline): readonly (readonly [number, number])[] {
  const result: [number, number][] = [];
  for (let i = 0; i < outline.points.length; i++) {
    const a = outline.points[i];
    const b = outline.points[(i + 1) % outline.points.length];
    if (a[0] <= 0) result.push([a[0], a[1]]);
    if ((a[0] < 0 && b[0] > 0) || (a[0] > 0 && b[0] < 0)) {
      const t = -a[0] / (b[0] - a[0]);
      result.push([0, a[1] + t * (b[1] - a[1])]);
    }
  }
  return result;
}

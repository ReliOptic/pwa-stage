import { CornerRadiiSpec } from '../types/device.types';

export type DeviceHingeStatus = 'closed' | 'partiallyOpen' | 'fullyOpen';

export type DuoPostureId = 'closed' | 'standing' | 'book' | 'tabletop' | 'open' | 'portrait';

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface DuoFoldInterpolatedMetrics {
  readonly angleDeg: number;
  readonly progress: number;
  readonly phi: number;
  readonly hingeStatus: DeviceHingeStatus;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly outerFrameWidth: number;
  readonly outerFrameHeight: number;
  readonly bezelInset: number;
  readonly cornerRadii: CornerRadiiSpec;
  readonly isOuterActive: boolean;
  readonly isBookPosture: boolean;
  readonly foldShadowOpacity: number;
  readonly creaseHighlightOpacity: number;
  readonly outerSurfaceOpacity: number;
  readonly innerSurfaceOpacity: number;
  readonly leafFoldAngleDeg: number;
  readonly perspectiveTiltDeg: number;
}

/**
 * Apple / Campsite R13 non-linear hinge curve knots:
 * Maps UI progress u = theta / 180 in [0, 1] -> physical rig progress phi in [0, 1].
 */
export const FOLD_CURVE_KNOTS: readonly (readonly [number, number])[] = [
  [0.0, 0.0],
  [0.08, 0.04],
  [0.17, 0.1],
  [0.25, 0.18],
  [0.33, 0.28],
  [0.42, 0.4],
  [0.5, 0.5],
  [0.58, 0.6],
  [0.67, 0.72],
  [0.75, 0.82],
  [0.83, 0.9],
  [0.92, 0.96],
  [1.0, 1.0]
];

const KNOT_SECANTS = FOLD_CURVE_KNOTS.slice(1).map(
  (pt, idx) => (pt[1] - FOLD_CURVE_KNOTS[idx][1]) / (pt[0] - FOLD_CURVE_KNOTS[idx][0])
);

const KNOT_TANGENTS = FOLD_CURVE_KNOTS.map((_, idx) => {
  if (idx === 0) return KNOT_SECANTS[0];
  if (idx === FOLD_CURVE_KNOTS.length - 1) return KNOT_SECANTS[KNOT_SECANTS.length - 1];
  return 2 / (1 / KNOT_SECANTS[idx - 1] + 1 / KNOT_SECANTS[idx]);
});

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Evaluates the monotone cubic Hermite spline phi = FoldCurve.sample(u).
 */
export function sampleFoldCurve(uRaw: number): number {
  const x = clamp01(uRaw);
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  let segIdx = 0;
  for (let i = FOLD_CURVE_KNOTS.length - 2; i >= 0; i--) {
    if (FOLD_CURVE_KNOTS[i][0] <= x) {
      segIdx = i;
      break;
    }
  }

  const a = FOLD_CURVE_KNOTS[segIdx];
  const b = FOLD_CURVE_KNOTS[segIdx + 1];
  const h = b[0] - a[0];
  const t = (x - a[0]) / h;
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return clamp01(h00 * a[1] + h10 * h * KNOT_TANGENTS[segIdx] + h01 * b[1] + h11 * h * KNOT_TANGENTS[segIdx + 1]);
}

/**
 * Inverts FoldCurve: finds u in [0, 1] such that sampleFoldCurve(u) ~= phi.
 */
export function invertFoldCurve(phiRaw: number): number {
  const phi = clamp01(phiRaw);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) * 0.5;
    if (sampleFoldCurve(mid) < phi) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) * 0.5;
}

/**
 * Resolves the 3-state Apple DeviceHinge.Status from hinge angle theta (0..180 deg).
 */
export function resolveDeviceHingeStatus(angleDeg: number): DeviceHingeStatus {
  const clamped = Math.max(0, Math.min(180, Number.isFinite(angleDeg) ? angleDeg : 0));
  if (clamped < 20) return 'closed';
  if (clamped > 165) return 'fullyOpen';
  return 'partiallyOpen';
}

/**
 * Simulator playback defaults, not measured hardware timing.
 * Real folding follows the hand; retain these defaults until an angle/time fit is available.
 */
export function computeFoldDriveDurationMs(fromDeg: number, toDeg: number): number {
  const deltaNorm = Math.abs(toDeg - fromDeg) / 180;
  if (deltaNorm <= 0.001) return 0;
  const baseMs = toDeg > fromDeg ? 1360 : 1140;
  return Math.max(260, Math.round(baseMs * Math.pow(deltaNorm, 0.65)));
}

/**
 * Simulator quintic C2 smoothstep; no verified Apple easing specification.
 */
export function evaluateFoldDriveEasing(tRaw: number): number {
  const t = clamp01(tRaw);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Computes an exact 8-DOF 4-point projective homography CSS matrix3d(...) string
 * mapping a logical rectangle [0..width, 0..height] to 4 screen points [TL, TR, BR, BL].
 */
export function computeHomographyMatrix3d(
  corners: readonly [Point2D, Point2D, Point2D, Point2D],
  width: number,
  height: number
): string | null {
  if (width <= 0 || height <= 0) return null;
  const rows: number[][] = [];
  const src: readonly [number, number][] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height]
  ];

  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const { x: X, y: Y } = corners[i];
    rows.push(
      [x, y, 1, 0, 0, 0, -x * X, -y * X, X],
      [0, 0, 0, x, y, 1, -x * Y, -y * Y, Y]
    );
  }

  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(rows[pivot][col]) < 1e-9) {
      return null;
    }
    const tmp = rows[col];
    rows[col] = rows[pivot];
    rows[pivot] = tmp;

    const div = rows[col][col];
    for (let k = col; k < 9; k++) {
      rows[col][k] /= div;
    }
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = rows[row][col];
      for (let k = col; k < 9; k++) {
        rows[row][k] -= factor * rows[col][k];
      }
    }
  }

  const v = rows.map((r) => r[8]);
  const m = [
    v[0], v[3], 0, v[6],
    v[1], v[4], 0, v[7],
    0, 0, 1, 0,
    v[2], v[5], 0, 1
  ];
  return `matrix3d(${m.map((n) => Number(n.toFixed(7))).join(',')})`;
}

/**
 * Computes continuous iPhone Duo metrics across 0° (Closed Outer 466x678)
 * -> 20°..165° (Partially Open 3D Postures) -> 180° (Unfolded Inner 951x669).
 */
export function computeDuoFoldMetrics(foldAngleDeg: number): DuoFoldInterpolatedMetrics {
  const clampedAngle = Math.max(0, Math.min(180, Number.isFinite(foldAngleDeg) ? foldAngleDeg : 180));
  const rawProgress = clampedAngle / 180;
  const phi = sampleFoldCurve(rawProgress);
  const hingeStatus = resolveDeviceHingeStatus(clampedAngle);

  const logicalWidth = Math.round(lerp(466, 951, phi));
  const logicalHeight = Math.round(lerp(678, 669, phi));
  const bezelInset = Math.round(lerp(17, 20, phi));

  const outerFrameWidth = Math.round(lerp(514, 991, phi));
  const outerFrameHeight = Math.round(lerp(712, 718, phi));

  const isOuterActive = clampedAngle < 30;
  const isBookPosture = clampedAngle >= 20 && clampedAngle <= 165;

  const cornerRadii: CornerRadiiSpec = isOuterActive
    ? { topLeft: 8, topRight: 59, bottomRight: 59, bottomLeft: 8 }
    : {
        topLeft: Math.round(lerp(24, 59, phi)),
        topRight: 59,
        bottomRight: 59,
        bottomLeft: Math.round(lerp(24, 59, phi))
      };

  const foldBell = Math.sin(rawProgress * Math.PI);
  const foldShadowOpacity =
    clampedAngle >= 178 || clampedAngle <= 2
      ? 0
      : Number((foldBell * 0.78).toFixed(3));
  const creaseHighlightOpacity =
    clampedAngle >= 179 || clampedAngle <= 5
      ? 0
      : Number((Math.sin(phi * Math.PI) * 0.55).toFixed(3));

  // Crossfade gate between outer cover (u <= 0.20) and inner dual leaves (u >= 0.12)
  const outerSurfaceOpacity =
    rawProgress === 0 ? 1 : clamp01((0.20 - rawProgress) / 0.1);
  const innerSurfaceOpacity =
    rawProgress === 1 ? 1 : clamp01((rawProgress - 0.1) / 0.12);

  const leafFoldAngleDeg = Number(((1 - phi) * 90).toFixed(2));
  const perspectiveTiltDeg = Number((foldBell * 16).toFixed(2));

  return {
    angleDeg: Math.round(clampedAngle),
    progress: Number(phi.toFixed(4)),
    phi: Number(phi.toFixed(4)),
    hingeStatus,
    logicalWidth,
    logicalHeight,
    outerFrameWidth,
    outerFrameHeight,
    bezelInset,
    cornerRadii,
    isOuterActive,
    isBookPosture,
    foldShadowOpacity,
    creaseHighlightOpacity,
    outerSurfaceOpacity: Number(outerSurfaceOpacity.toFixed(3)),
    innerSurfaceOpacity: Number(innerSurfaceOpacity.toFixed(3)),
    leafFoldAngleDeg,
    perspectiveTiltDeg
  };
}

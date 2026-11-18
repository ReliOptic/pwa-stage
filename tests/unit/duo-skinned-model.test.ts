import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Duo3DHardwareEngine, loadDuoSkinnedAsset } from '../../src/utils/duo-3d-engine.util';
import { sampleFoldCurve } from '../../src/utils/duo-fold-math.util';

describe('restored skinned hardware', () => {
  it('exposes both screens only when the camera can see past the moving leaf', () => {
    const context = { window: {} as Window, console };
    runInNewContext(readFileSync('public/duo-3d/duo-3d-bundle.js', 'utf8'), context);
    vi.stubGlobal('window', context.window);
    try {
      const engine = new Duo3DHardwareEngine({} as HTMLCanvasElement);
      for (const [posture, first, last] of [['open', 33, 89], ['book', 26, 44], ['tabletop', 2, 48]] as const) {
        const visible: number[] = [];
        for (let angle = 0; angle <= 180; angle++) {
          const projection = engine.renderFrame({
            stageWidth: 991, stageHeight: 718, foldAngleDeg: angle, posture,
            orbitDeg: 0, pitchDeg: 0, zoom: 1, finish: 'night', transitioning: false
          });
          if (projection.simultaneous) visible.push(angle);
          if (angle === 70 && posture === 'open') {
            expect(projection.outer.lensMask).toContain('radial-gradient');
            expect(projection.transition.active).toBe(false);
            expect(projection.outer.active && projection.right.active).toBe(true);
          }
        }
        expect(visible).toEqual(Array.from({length: last - first + 1}, (_, index) => first + index));
      }
      engine.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  }, 20000);

  it('animates the imported bones and projects finite screen points under the parent rig', () => {
    const context = { window: {} as Window, console };
    runInNewContext(readFileSync('public/duo-3d/duo-3d-bundle.js', 'utf8'), context);
    const T = context.window.THREE;
    const asset = loadDuoSkinnedAsset(T, context.window.__DUO_ASSET!);
    const rig = new T.Group(); rig.add(asset.model);
    rig.rotation.set(0.3, -Math.PI / 2, 0.5); rig.position.set(2, 3, 4);
    let first: number[] = [];
    for (let angle = 0; angle <= 180; angle += 10) {
      asset.setFold(sampleFoldCurve(angle / 180)); rig.updateMatrixWorld(true);
      const point = asset.point(-7.87, 0.268, 0, 24).toArray();
      expect(point.every(Number.isFinite)).toBe(true);
      expect(asset.point(7.87, 0.268, 0, 25).toArray().every(Number.isFinite)).toBe(true);
      if (angle === 0) first = point;
      if (angle === 180) expect(point).not.toEqual(first);
    }
    expect(asset.meshes.some((mesh: any) => mesh.isSkinnedMesh)).toBe(true);
    expect(asset.meshes.every((mesh: any) => mesh.geometry.attributes.position.count > 0)).toBe(true);
  });
});

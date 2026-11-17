import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { loadDuoSkinnedAsset } from '../../src/utils/duo-3d-engine.util';
import { sampleFoldCurve } from '../../src/utils/duo-fold-math.util';

describe('restored skinned hardware', () => {
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

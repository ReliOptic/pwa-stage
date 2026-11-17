import { describe, expect, it } from 'vitest';
import * as THREE from '../../src/vendor/three.module.js';
import { createDuoProceduralModel, DUO_SURFACE_Y } from '../../src/utils/duo-procedural-model.util';

describe('original foldable geometry', () => {
  it('joins the screen hinge without a gap throughout a complete sweep', () => {
    const asset = createDuoProceduralModel(THREE);
    for (let degrees = 0; degrees <= 180; degrees++) {
      asset.setFold(degrees / 180);
      for (const z of [-5.49, 0, 5.49]) {
        expect(asset.point(0, DUO_SURFACE_Y, z, 24).distanceTo(asset.point(0, DUO_SURFACE_Y, z, 25))).toBeLessThan(1e-10);
      }
      const hinge = asset.point(0, DUO_SURFACE_Y, 0, 24);
      expect(asset.point(-7.87, DUO_SURFACE_Y, 0, 24).distanceTo(hinge)).toBeCloseTo(7.87, 10);
    }
  });
  it('puts the cover toward the viewer when closed and both inner halves on one plane when open', () => {
    const asset = createDuoProceduralModel(THREE);
    asset.setFold(0);
    const cover = asset.point(-7.94, -0.288, 0, 24);
    expect(cover.x).toBeCloseTo(7.94);
    expect(cover.y).toBeGreaterThan(DUO_SURFACE_Y);
    asset.setFold(1);
    expect(asset.point(-7.87, DUO_SURFACE_Y, 0, 24).x).toBeCloseTo(-7.87);
    expect(asset.point(-7.87, DUO_SURFACE_Y, 0, 24).y).toBeCloseTo(asset.point(7.87, DUO_SURFACE_Y, 0, 25).y);
  });
  it('uses the same parent rig transform for chassis and projected points', () => {
    const asset = createDuoProceduralModel(THREE);
    const rig = new THREE.Group(); rig.add(asset.model);
    rig.rotation.set(0.3, -Math.PI / 2, 0.5); rig.position.set(2, 3, 4);
    asset.setFold(0.6); rig.updateMatrixWorld(true);
    const a = asset.point(0, DUO_SURFACE_Y, 2, 24);
    const b = asset.point(0, DUO_SURFACE_Y, 2, 25);
    expect(a.distanceTo(b)).toBeLessThan(1e-10);
    expect(asset.meshes.every((m: any) => m.geometry.attributes.position.count > 0)).toBe(true);
  });
});

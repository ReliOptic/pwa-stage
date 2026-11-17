/** Original parametric foldable hardware, MIT. All dimensions are artistic
 * estimates in arbitrary model units, not measurements of a commercial device.
 * The inner surface is the hinge axis: both leaves meet exactly at every angle.
 * 24/25 are compatibility leaf identifiers, not imported skeleton joints. */
export const DUO_SURFACE_Y = 0.268;
export function createDuoProceduralModel(T: any): any {
  const model = new T.Group();
  const left = new T.Group();
  const right = new T.Group();
  left.position.y = right.position.y = DUO_SURFACE_Y;
  model.add(left, right);
  const meshes: any[] = [];
  const metal = new T.MeshStandardMaterial({ color: '#777d89', metalness: 0.9, roughness: 0.24 });
  const edge = new T.MeshStandardMaterial({ color: '#b0b6c0', metalness: 0.95, roughness: 0.18 });
  const glass = new T.MeshBasicMaterial({ color: '#07090c' });
  const lens = new T.MeshStandardMaterial({ color: '#102332', metalness: 0.65, roughness: 0.12 });
  function slab(parent: any, x0: number, x1: number, z0: number, z1: number, y: number, depth: number, radius: number, material: any): void {
    const s = new T.Shape();
    // Hinge-side corners are nearly square; the free edge is softly rounded.
    const l = Math.abs(x0) < 0.16 ? 0.035 : radius;
    const r = Math.abs(x1) < 0.16 ? 0.035 : radius;
    s.moveTo(x0 + l, z0); s.lineTo(x1 - r, z0);
    s.quadraticCurveTo(x1, z0, x1, z0 + r); s.lineTo(x1, z1 - r);
    s.quadraticCurveTo(x1, z1, x1 - r, z1); s.lineTo(x0 + l, z1);
    s.quadraticCurveTo(x0, z1, x0, z1 - l); s.lineTo(x0, z0 + l);
    s.quadraticCurveTo(x0, z0, x0 + l, z0);
    const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.025, bevelThickness: 0.025, curveSegments: 16 });
    // Shape XY -> device XZ; positive extrusion goes toward the back.
    g.rotateX(Math.PI / 2);
    const mesh = new T.Mesh(g, material); mesh.position.y = y - DUO_SURFACE_Y;
    mesh.userData.originalColor = material.color.clone();
    parent.add(mesh); meshes.push(mesh);
  }
  for (const [leaf, a, b] of [[left, -8.08, -0.04], [right, 0.04, 8.08]] as const) {
    slab(leaf, a, b, -5.76, 5.76, 0.20, 0.46, 0.72, metal);
    slab(leaf, a + 0.025, b - 0.025, -5.735, 5.735, 0.235, 0.035, 0.70, edge);
    slab(leaf, a + 0.065, b - 0.065, -5.69, 5.69, 0.258, 0.025, 0.67, glass);
  }
  // Cover glass backing, rounded body corners remain outside the live aperture.
  slab(left, -8.02, -0.12, -5.69, 5.69, -0.275, 0.025, 0.66, glass);
  // Original rear camera island with concentric optical barrels (no logos).
  slab(right, 5.5, 7.7, -5.25, -1.9, -0.27, 0.13, 0.45, metal);
  for (const z of [-4.45, -2.75]) {
    for (const [r, y, mat] of [[0.62, -0.46, edge], [0.48, -0.50, glass], [0.32, -0.53, lens]] as const) {
      const mesh = new T.Mesh(new T.CylinderGeometry(r, r, 0.07, 48), mat);
      mesh.position.set(6.6, y - DUO_SURFACE_Y, z);
      mesh.userData.originalColor = mat.color.clone(); right.add(mesh); meshes.push(mesh);
    }
  }
  // Segmented hinge barrel and side controls.
  for (let i = 0; i < 9; i++) {
    const mesh = new T.Mesh(new T.CylinderGeometry(0.14, 0.14, 1.185, 32), metal);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(0, -0.06, -4.8 + i * 1.2);
    mesh.userData.originalColor = edge.color.clone(); model.add(mesh); meshes.push(mesh);
  }
  slab(right, 8.07, 8.13, -2.5, -1.15, 0.08, 0.22, 0.025, edge);
  return {
    model, meshes,
    setFold(progress: number): void {
      const u = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
      left.rotation.z = -(1 - u) * Math.PI;
      model.updateMatrixWorld(true);
    },
    point(x: number, y: number, z: number, leaf: number): any {
      return new T.Vector3(x, y - DUO_SURFACE_Y, z).applyMatrix4((leaf === 24 ? left : right).matrixWorld);
    }
  };
}

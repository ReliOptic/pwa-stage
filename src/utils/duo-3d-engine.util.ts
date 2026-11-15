import {
  computeHomographyMatrix3d,
  DuoPostureId,
  Point2D,
  sampleFoldCurve
} from './duo-fold-math.util';

export interface ProjectedSurfaceSlice {
  readonly active: boolean;
  readonly opacity: number;
  readonly width: number;
  readonly height: number;
  readonly corners: readonly [Point2D, Point2D, Point2D, Point2D];
  readonly matrix3d: string | null;
  readonly zIndex: number;
}

export interface Duo3DFrameProjection {
  readonly u: number;
  readonly phi: number;
  readonly isOuterPrimary: boolean;
  readonly isFlatSinglePlane: boolean;
  readonly isHorizontalSplit: boolean;
  readonly outer: ProjectedSurfaceSlice;
  readonly left: ProjectedSurfaceSlice;
  readonly right: ProjectedSurfaceSlice;
  readonly full: ProjectedSurfaceSlice;
}

export interface Duo3DRenderParams {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly foldAngleDeg: number;
  readonly posture: DuoPostureId;
  readonly orbitDeg: number;
  readonly pitchDeg: number;
  readonly zoom: number;
  readonly finish: 'night' | 'white';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    THREE?: any;
    __DUO_ASSET?: {
      readonly gltf: any;
      readonly binary: string;
    };
  }
}

function clamp(val: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, val));
}

function signedQuadArea(q: readonly Point2D[]): number {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const next = q[(i + 1) % 4];
    area += q[i].x * next.y - next.x * q[i].y;
  }
  return area * 0.5;
}

function loadDuoSkinnedAsset(T: any, data: { readonly gltf: any; readonly binary: string }): any {
  const g = data.gltf;
  const bytes = Uint8Array.from(atob(data.binary), (c) => c.charCodeAt(0));
  const types: Record<number, any> = {
    5120: Int8Array,
    5121: Uint8Array,
    5122: Int16Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array
  };
  const sizes: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

  function readAccessorArray(idx: number): any {
    const acc = g.accessors[idx];
    const view = g.bufferViews[acc.bufferView];
    const Ctor = types[acc.componentType];
    const itemSize = sizes[acc.type];
    const offset = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = view.byteStride || itemSize * Ctor.BYTES_PER_ELEMENT;
    if (stride === itemSize * Ctor.BYTES_PER_ELEMENT) {
      return new Ctor(bytes.buffer.slice(offset, offset + acc.count * stride));
    }
    const out = new Ctor(acc.count * itemSize);
    for (let n = 0; n < acc.count; n++) {
      const sliceStart = offset + n * stride;
      out.set(
        new Ctor(bytes.buffer.slice(sliceStart, sliceStart + itemSize * Ctor.BYTES_PER_ELEMENT)),
        n * itemSize
      );
    }
    return out;
  }

  const nodes = g.nodes.map((n: any, idx: number) => {
    const bone = new T.Bone();
    bone.name = `duo-node-${idx}`;
    bone.position.fromArray(n.translation || [0, 0, 0]);
    bone.quaternion.fromArray(n.rotation || [0, 0, 0, 1]);
    bone.scale.fromArray(n.scale || [1, 1, 1]);
    if (n.matrix) {
      bone.matrix.fromArray(n.matrix);
      bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
    }
    return bone;
  });

  g.nodes.forEach((n: any, idx: number) => {
    (n.children || []).forEach((childIdx: number) => nodes[idx].add(nodes[childIdx]));
  });

  const model = new T.Group();
  g.scenes[g.scene || 0].nodes.forEach((rootIdx: number) => model.add(nodes[rootIdx]));
  model.updateMatrixWorld(true);

  const materials = g.materials.map((m: any, idx: number) => {
    const pbr = m.pbrMetallicRoughness || {};
    const factor = pbr.baseColorFactor || [0.045, 0.045, 0.049, 1];
    const col = new T.Color().fromArray(factor);
    const metalness = pbr.metallicFactor ?? 0.86;
    const roughness = pbr.roughnessFactor ?? 0.28;
    if (idx === 7 || idx === 8) {
      return new T.MeshBasicMaterial({ color: 0x09090b, side: T.DoubleSide });
    }
    if (Math.max(factor[0], factor[1], factor[2]) > 0.45) {
      const gray = (factor[0] + factor[1] + factor[2]) / 3;
      col.setRGB(gray * 0.95, gray * 0.965, gray * 0.975);
    }
    return new T.MeshStandardMaterial({
      color: col,
      metalness,
      roughness: Math.max(0.15, roughness),
      transparent: factor[3] < 1,
      opacity: factor[3],
      side: T.FrontSide,
      depthWrite: factor[3] > 0.4
    });
  });

  const meshes: any[] = [];
  const attrMap: Record<string, string> = {
    POSITION: 'position',
    NORMAL: 'normal',
    TEXCOORD_0: 'uv',
    TEXCOORD_1: 'uv1',
    JOINTS_0: 'skinIndex',
    WEIGHTS_0: 'skinWeight'
  };

  g.nodes.forEach((n: any, nodeIdx: number) => {
    if (n.mesh === undefined) return;
    g.meshes[n.mesh].primitives.forEach((prim: any) => {
      const geo = new T.BufferGeometry();
      for (const [attrName, accIdx] of Object.entries(prim.attributes)) {
        const mapped = attrMap[attrName];
        if (mapped) {
          const acc = g.accessors[accIdx as number];
          geo.setAttribute(
            mapped,
            new T.BufferAttribute(
              readAccessorArray(accIdx as number),
              sizes[acc.type],
              acc.normalized || false
            )
          );
        }
      }
      if (prim.indices !== undefined) {
        geo.setIndex(new T.BufferAttribute(readAccessorArray(prim.indices), 1));
      }
      const mesh =
        n.skin === undefined
          ? new T.Mesh(geo, materials[prim.material])
          : new T.SkinnedMesh(geo, materials[prim.material]);
      mesh.name = n.name;
      mesh.frustumCulled = false;
      mesh.userData.originalColor = mesh.material.color.clone();
      nodes[nodeIdx].add(mesh);
      meshes.push(mesh);

      if (n.skin !== undefined) {
        const skin = g.skins[n.skin];
        const invArr = readAccessorArray(skin.inverseBindMatrices);
        const skeleton = new T.Skeleton(
          skin.joints.map((j: number) => nodes[j]),
          skin.joints.map((_: number, jIdx: number) => new T.Matrix4().fromArray(invArr, jIdx * 16))
        );
        model.updateMatrixWorld(true);
        mesh.bind(skeleton, mesh.matrixWorld);
        mesh.normalizeSkinWeights();
      }
    });
  });

  const sliderAnim = g.animations.find((a: any) => a.name === 'Slider');
  const tracks: any[] = [];
  const propMap: Record<string, string> = {
    translation: 'position',
    rotation: 'quaternion',
    scale: 'scale'
  };
  for (const ch of sliderAnim.channels) {
    const sampler = sliderAnim.samplers[ch.sampler];
    const prop = propMap[ch.target.path];
    const TrackCtor = prop === 'quaternion' ? T.QuaternionKeyframeTrack : T.VectorKeyframeTrack;
    const track = new TrackCtor(
      `${nodes[ch.target.node].uuid}.${prop}`,
      readAccessorArray(sampler.input),
      readAccessorArray(sampler.output)
    );
    if (sampler.interpolation === 'STEP') {
      track.setInterpolation(T.InterpolateDiscrete);
    }
    tracks.push(track);
  }

  const mixer = new T.AnimationMixer(model);
  const clip = new T.AnimationClip('Apple Slider', -1, tracks);
  const action = mixer.clipAction(clip);
  action.play();
  action.paused = true;

  const skin0 = g.skins[0];
  const inv0 = readAccessorArray(skin0.inverseBindMatrices);
  const inverseMatrices = skin0.joints.map((_: number, idx: number) =>
    new T.Matrix4().fromArray(inv0, idx * 16)
  );

  return {
    model,
    meshes,
    duration: clip.duration,
    setFold(phi: number): void {
      action.time = clamp(phi, 0, 1) * clip.duration;
      mixer.update(0);
      model.updateMatrixWorld(true);
    },
    point(x: number, y: number, z: number, jointIdx: number): any {
      return new T.Vector3(x, y, z)
        .applyMatrix4(inverseMatrices[jointIdx])
        .applyMatrix4(nodes[skin0.joints[jointIdx]].matrixWorld);
    }
  };
}

export class Duo3DHardwareEngine {
  private readonly T: any;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene: any;
  private readonly camera: any;
  private readonly rig: any;
  private readonly asset: any;
  private renderer: any = null;
  private isSoftware = false;
  private lastW = 0;
  private lastH = 0;
  private lastDpr = 0;
  private currentFinish: 'night' | 'white' = 'night';

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.T = window.THREE;
    if (!this.T || !window.__DUO_ASSET) {
      throw new Error('Apple iPhone Duo 3D bundle (THREE / __DUO_ASSET) is not loaded');
    }

    const T = this.T;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(27.5, 1, 0.1, 200);
    this.rig = new T.Group();
    this.asset = loadDuoSkinnedAsset(T, window.__DUO_ASSET);
    this.rig.add(this.asset.model);
    this.scene.add(this.rig);

    try {
      this.renderer = new T.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.24;

      this.scene.add(new T.HemisphereLight(0xf9faff, 0x5c6472, 2.5));
      const lights: readonly [number, readonly [number, number, number]][] = [
        [2.6, [-15, 20, -10]],
        [2.1, [8, 11, 14]],
        [2.5, [4, 7, -18]]
      ];
      lights.forEach(([intensity, pos]) => {
        const dirLight = new T.DirectionalLight(0xffffff, intensity);
        dirLight.position.set(pos[0], pos[1], pos[2]);
        this.scene.add(dirLight);
      });

      const studio = new T.Scene();
      studio.background = new T.Color(0x8e949e);
      const panels: readonly [
        readonly [number, number, number],
        number,
        number,
        readonly [number, number, number]
      ][] = [
        [[-10, 8, 0], 10, 26, [0, Math.PI / 2, 0]],
        [[7, 9, 0], 6, 22, [0, -Math.PI / 2, 0]],
        [[0, 16, 0], 25, 24, [-Math.PI / 2, 0, 0]]
      ];
      panels.forEach(([p, w, h, r]) => {
        const plane = new T.Mesh(
          new T.PlaneGeometry(w, h),
          new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide })
        );
        plane.position.set(p[0], p[1], p[2]);
        plane.rotation.set(r[0], r[1], r[2]);
        studio.add(plane);
      });
      const pmrem = new T.PMREMGenerator(this.renderer);
      const envTarget = pmrem.fromScene(studio, 0.06);
      this.scene.environment = envTarget.texture;
      pmrem.dispose();
    } catch {
      this.isSoftware = true;
    }
  }

  public setFinish(finish: 'night' | 'white'): void {
    if (this.currentFinish === finish) return;
    this.currentFinish = finish;
    const T = this.T;
    this.asset.meshes.forEach((m: any) => {
      if (!m.material.isMeshStandardMaterial) return;
      m.material.color.copy(m.userData.originalColor);
      if (
        finish === 'white' &&
        Math.max(m.material.color.r, m.material.color.g, m.material.color.b) > 0.25
      ) {
        m.material.color.lerp(new T.Color('#ecece8'), 0.62);
      }
    });
  }

  private getQuad3D(name: 'outer' | 'left' | 'right', rotationY: number, isStanding: boolean): any[] {
    const p = (x: number, y: number, z: number, j: number) => this.asset.point(x, y, z, j);
    if (name === 'outer') {
      const q = [
        p(-0.25, -0.288, -5.56, 24),
        p(-7.94, -0.288, -5.56, 24),
        p(-7.94, -0.288, 5.56, 24),
        p(-0.25, -0.288, 5.56, 24)
      ];
      return isStanding ? [q[3], q[0], q[1], q[2]] : q;
    }
    const isLeft = name === 'left';
    const joint = isLeft ? 24 : 25;
    const x0 = isLeft ? -7.87 : 0;
    const x1 = isLeft ? 0 : 7.87;
    let q = [
      p(x0, 0.268, -5.49, joint),
      p(x1, 0.268, -5.49, joint),
      p(x1, 0.268, 5.49, joint),
      p(x0, 0.268, 5.49, joint)
    ];
    if (Math.abs(rotationY) > 1.1) {
      q = [q[3], q[0], q[1], q[2]];
    }
    return q;
  }

  public renderFrame(params: Duo3DRenderParams): Duo3DFrameProjection {
    const T = this.T;
    const W = Math.max(1, params.stageWidth);
    const H = Math.max(1, params.stageHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.25);

    this.setFinish(params.finish);

    if (!this.isSoftware && this.renderer) {
      if (W !== this.lastW || H !== this.lastH || dpr !== this.lastDpr) {
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(W, H, true);
        this.lastW = W;
        this.lastH = H;
        this.lastDpr = dpr;
      }
    }

    const u = clamp(params.foldAngleDeg / 180, 0, 1);
    const phi = sampleFoldCurve(u);
    const isStanding = params.posture === 'standing' && u >= 0.2 && u <= 0.72;
    const isRotatedRig = params.posture === 'tabletop' || params.posture === 'portrait';
    const rotationY = isRotatedRig ? -Math.PI / 2 : 0;

    this.asset.setFold(phi);
    this.rig.position.set(0, 0, 0);
    this.rig.quaternion.identity();
    this.rig.rotation.set(0, rotationY, 0);
    this.rig.updateMatrixWorld(true);

    if (isStanding) {
      const foot1 = this.asset.point(-8, 0, 0, 24);
      const foot2 = this.asset.point(8, 0, 0, 25);
      const hinge = this.asset.point(0, 0, 0, 25);
      const mid = foot1.clone().add(foot2).multiplyScalar(0.5);
      const right = new T.Vector3(0, 0, -1);
      const up = right.clone().cross(foot2.clone().sub(foot1)).normalize();
      if (up.dot(hinge.clone().sub(mid)) < 0) up.negate();
      const front = right.clone().cross(up).normalize();
      const qs = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, front).transpose()
      );
      this.rig.quaternion.copy(qs);
      this.rig.updateMatrixWorld(true);
      const feetY = Math.min(
        this.asset.point(-8, 0, 0, 24).y,
        this.asset.point(8, 0, 0, 25).y
      );
      this.rig.position.y = -feetY;
      this.rig.updateMatrixWorld(true);
    }

    const quads3D = {
      outer: this.getQuad3D('outer', rotationY, isStanding),
      left: this.getQuad3D('left', rotationY, isStanding),
      right: this.getQuad3D('right', rotationY, isStanding)
    };
    const allBounds = [...quads3D.outer, ...quads3D.left, ...quads3D.right];
    const box = new T.Box3().setFromPoints(allBounds);
    const center = box.getCenter(new T.Vector3());

    const isOuterPrimary = isStanding || u < 0.16;

    // Automatic 3D presentation tilt during intermediate fold angles so the 3D V-valley is vivid
    const foldBell = Math.sin(Math.PI * phi);
    const autoPitch = !isStanding && !isRotatedRig ? foldBell * 15.5 : 0;
    const autoOrbit = !isStanding && !isRotatedRig ? foldBell * -6.5 : 0;
    const effectiveOrbit = params.orbitDeg + autoOrbit;
    const effectivePitch = clamp(params.pitchDeg + autoPitch, -55, 55);

    if (isStanding) {
      const standTarget = quads3D.outer
        .reduce((acc: any, pt: any) => acc.add(pt.clone()), new T.Vector3())
        .multiplyScalar(0.25);
      const dir = new T.Vector3(0.45, 0.12, 1.0).normalize();
      dir.applyAxisAngle(new T.Vector3(0, 1, 0), (effectiveOrbit * Math.PI) / 180);
      this.camera.up.set(0, 1, 0);
      this.camera.aspect = W / H;
      this.camera.updateProjectionMatrix();
      const dist =
        Math.max(25.0, 13.4 / (2 * Math.tan((13.75 * Math.PI) / 180) * this.camera.aspect)) /
        clamp(params.zoom, 0.7, 1.25);
      this.camera.position.copy(standTarget).addScaledVector(dir, dist);
      this.camera.lookAt(standTarget);
      this.camera.updateMatrixWorld(true);
    } else {
      const handoffT = clamp((phi - 0.05) / 0.18, 0, 1);
      const smoothHandoff = handoffT * handoffT * (3 - 2 * handoffT);
      const bisectorAngle = smoothHandoff * (1 - phi) * (Math.PI / 2);
      const dir = new T.Vector3(
        Math.sin(bisectorAngle),
        Math.cos(bisectorAngle),
        0.008
      ).applyAxisAngle(new T.Vector3(0, 1, 0), rotationY);

      if (isRotatedRig && phi < 0.97) {
        const seatBlend = clamp((0.97 - phi) / 0.2, 0, 1);
        dir.lerp(new T.Vector3(0, 0.62, 0.78).normalize(), seatBlend).normalize();
      }

      dir.applyAxisAngle(new T.Vector3(0, 0, -1), (effectiveOrbit * Math.PI) / 180);
      const sideAxis = new T.Vector3()
        .crossVectors(new T.Vector3(0, 0, -1), dir)
        .normalize();
      dir.applyAxisAngle(sideAxis, (effectivePitch * Math.PI) / 180);

      this.camera.up.set(0, 0, -1);
      this.camera.aspect = W / H;
      this.camera.updateProjectionMatrix();

      let dist = 34.5;
      for (let iter = 0; iter < 5; iter++) {
        this.camera.position.copy(center).addScaledVector(dir, dist);
        this.camera.lookAt(center);
        this.camera.updateMatrixWorld(true);
        const projected = allBounds.map((pt: any) => pt.clone().project(this.camera));
        const maxX = Math.max(...projected.map((p: any) => Math.abs(p.x)));
        const maxY = Math.max(...projected.map((p: any) => Math.abs(p.y)));
        dist *= Math.max(maxX / 0.9, maxY / 0.9);
      }
      dist /= clamp(params.zoom, 0.7, 1.25);
      this.camera.position.copy(center).addScaledVector(dir, dist);
      this.camera.lookAt(center);
      this.camera.updateMatrixWorld(true);
    }

    if (!this.isSoftware && this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }

    const projectQuad = (q3d: any[]): [Point2D, Point2D, Point2D, Point2D] => {
      const pts = q3d.map((pt: any) => {
        const ndc = pt.clone().project(this.camera);
        return {
          x: ((ndc.x + 1) * W) * 0.5,
          y: ((1 - ndc.y) * H) * 0.5,
          z: ndc.z
        };
      });
      return [pts[0], pts[1], pts[2], pts[3]];
    };

    const outerCorners = projectQuad(quads3D.outer);
    const leftCorners = projectQuad(quads3D.left);
    const rightCorners = projectQuad(quads3D.right);
    const fullCorners: [Point2D, Point2D, Point2D, Point2D] = isRotatedRig
      ? [leftCorners[0], leftCorners[1], rightCorners[2], rightCorners[3]]
      : [leftCorners[0], rightCorners[1], rightCorners[2], leftCorners[3]];

    const outerW = isStanding ? 678 : 466;
    const outerH = isStanding ? 466 : 678;
    const leafW = isRotatedRig ? 669 : 475.5;
    const leafH = isRotatedRig ? 475.5 : 669;
    const fullW = isRotatedRig ? 669 : 951;
    const fullH = isRotatedRig ? 951 : 669;

    const outerOpacity = isStanding
      ? 1
      : u === 0
        ? 1
        : clamp((0.18 - u) / 0.08, 0, 1);
    const innerOpacity = isStanding
      ? 0
      : u === 1
        ? 1
        : clamp((u - 0.12) / 0.1, 0, 1);

    const isFlatSinglePlane =
      !isStanding &&
      Math.abs(params.orbitDeg) < 0.5 &&
      Math.abs(params.pitchDeg) < 0.5 &&
      (u <= 0.01 || u >= 0.99);

    return {
      u,
      phi,
      isOuterPrimary,
      isFlatSinglePlane,
      isHorizontalSplit: isRotatedRig,
      outer: {
        active: outerOpacity > 0.02 && signedQuadArea(outerCorners) > 10,
        opacity: outerOpacity,
        width: outerW,
        height: outerH,
        corners: outerCorners,
        matrix3d: computeHomographyMatrix3d(outerCorners, outerW, outerH),
        zIndex: 16
      },
      left: {
        active: innerOpacity > 0.02 && signedQuadArea(leftCorners) > 10,
        opacity: innerOpacity,
        width: leafW,
        height: leafH,
        corners: leftCorners,
        matrix3d: computeHomographyMatrix3d(leftCorners, leafW, leafH),
        zIndex: 14
      },
      right: {
        active: innerOpacity > 0.02 && signedQuadArea(rightCorners) > 10,
        opacity: innerOpacity,
        width: leafW,
        height: leafH,
        corners: rightCorners,
        matrix3d: computeHomographyMatrix3d(rightCorners, leafW, leafH),
        zIndex: 15
      },
      full: {
        active: innerOpacity > 0.02,
        opacity: innerOpacity,
        width: fullW,
        height: fullH,
        corners: fullCorners,
        matrix3d: computeHomographyMatrix3d(fullCorners, fullW, fullH),
        zIndex: 18
      }
    };
  }

  public dispose(): void {
    if (this.renderer && typeof this.renderer.dispose === 'function') {
      this.renderer.dispose();
    }
  }
}

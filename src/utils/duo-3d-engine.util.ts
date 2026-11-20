import { sampleFoldFocus } from './duo-transition.util';
import { readDisplayOutline, displayOutlineCss, leftDisplayContour, DisplayOutline } from './display-outline.util';
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
  readonly apertureClip?: string;
  readonly lensMask?: string;
}

export interface Duo3DFrameProjection {
  readonly u: number;
  readonly phi: number;
  readonly isOuterPrimary: boolean;
  readonly isFlatSinglePlane: boolean;
  readonly isHorizontalSplit: boolean;
  /** Which physical surfaces face the camera right now (lit or not). */
  readonly outerFacing: boolean;
  readonly simultaneous: boolean;
  readonly coverReflection: number;
  readonly leftFacing: boolean;
  /**
   * CSS polygon (right-leaf local px) of the part of the right leaf the camera
   * can actually see when the left leaf is still raised in front of it.
   * null = unobstructed.
   */
  readonly rightVisibleClip: string | null;
  /**
   * Opening / closing transition (the device swinging between closed and
   * open, seen from the front). While it runs, content stays anchored to the
   * unfolded inner-display plane and the moving leaf acts like a sheet of
   * tracing paper passing over it: `flat` is that plane, the clips are the
   * moving leaf's two screens projected onto it from the camera.
   */
  readonly transition: {
    readonly active: boolean;
    readonly flat: ProjectedSurfaceSlice;
    readonly coverClip: string | null;
    readonly leftClip: string | null;
    /** 0..1 blur/darken strength of the cover face and of the inner-left face. */
    readonly coverMotion: number;
    readonly innerMotion: number;
    /** Projected hinge-to-edge samples, in flat-picture x coordinates. */
    readonly coverGradientX: readonly number[];
    readonly innerGradientX: readonly number[];
  };
  /** 0..1 backlight of the inner display (fades up as the device cracks open). */
  readonly innerBrightness: number;
  readonly outer: ProjectedSurfaceSlice;
  readonly left: ProjectedSurfaceSlice;
  readonly right: ProjectedSurfaceSlice;
  readonly full: ProjectedSurfaceSlice;
}

export interface Duo3DRenderParams {
  readonly transitioning: boolean;
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

/**
 * At this angle the inner plane can start painting beneath the raised cover.
 * The front-view focus and emulated viewport handoff are timed separately.
 */
export const COVER_HANDOFF_DEG = 2;
/**
 * `rightVisibleClip` value meaning "entirely behind the raised leaf". The
 * stage hides the live page with opacity instead of a clip in that case: a
 * guest clipped down to nothing stops producing frames, which would freeze
 * its mirror and with it the picture on the cover during the transition.
 */
export const RIGHT_LEAF_HIDDEN = 'hidden';
/** The inner display fades up between the hand-off and this angle. */
export const INNER_FULLY_LIT_DEG = 20;
/** Estimated cover-glass blur radius in CSS points on the unfolded plane. */
export const TRANSITION_MAX_BLUR_PX = 18;
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

export function loadDuoSkinnedAsset(T: any, data: { readonly gltf: any; readonly binary: string }): any {
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
      return new T.MeshPhysicalMaterial({
        color: 0x060709, metalness: 0, roughness: 0.18, clearcoat: 1,
        clearcoatRoughness: 0.12, envMapIntensity: 0.32, side: T.FrontSide
      });
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
  const displays: Partial<Record<'inner' | 'outer', DisplayOutline>> = {};
  let coverLens: DisplayOutline | undefined;
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
      if (prim.material === 7 || prim.material === 8) {
        displays[prim.material === 7 ? 'outer' : 'inner'] = readDisplayOutline(geo.attributes.position.array);
      }
      if (prim.material === 27) coverLens = readDisplayOutline(geo.attributes.position.array);
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
    displays,
    coverLens,
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
  private environmentTarget: any = null;
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
      this.renderer.toneMappingExposure = 1.04;

      this.scene.add(new T.HemisphereLight(0xfff8ef, 0x464958, 0.92));
      const lights: readonly [number, readonly [number, number, number]][] = [
        [2.0, [-15, 20, -10]],
        [0.75, [8, 11, 14]],
        [1.2, [4, 7, -18]]
      ];
      lights.forEach(([intensity, pos]) => {
        const dirLight = new T.DirectionalLight(0xffffff, intensity);
        dirLight.position.set(pos[0], pos[1], pos[2]);
        this.scene.add(dirLight);
      });

      const studio = new T.Scene();
      studio.background = new T.Color(0x515259);
      const panels: readonly [
        readonly [number, number, number],
        number,
        number,
        readonly [number, number, number]
      ][] = [
        [[-10, 8, 0], 10, 26, [0, Math.PI / 2, 0]],
        [[7, 9, 0], 3, 22, [0, -Math.PI / 2, 0]],
        [[0, 16, 0], 16, 20, [-Math.PI / 2, 0, 0]]
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
      this.environmentTarget = envTarget;
      this.scene.environment = envTarget.texture;
      studio.children.forEach((panel: any) => { panel.geometry.dispose(); panel.material.dispose(); });
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
      const d: DisplayOutline = this.asset.displays.outer;
      const q = [p(d.maxX, d.y, d.minZ, 24), p(d.minX, d.y, d.minZ, 24),
        p(d.minX, d.y, d.maxZ, 24), p(d.maxX, d.y, d.maxZ, 24)];
      return isStanding ? [q[3], q[0], q[1], q[2]] : q;
    }
    const d: DisplayOutline = this.asset.displays.inner;
    const isLeft = name === 'left';
    const joint = isLeft ? 24 : 25;
    const x0 = isLeft ? d.minX : 0;
    const x1 = isLeft ? 0 : d.maxX;
    // Shared hinge midpoint prevents a subpixel gap between independent bones.
    const hinge = (z: number): any =>
      p(0, d.y, z, 24).clone().add(p(0, d.y, z, 25)).multiplyScalar(0.5);
    let q = isLeft
      ? [p(x0, d.y, d.minZ, joint), hinge(d.minZ), hinge(d.maxZ), p(x0, d.y, d.maxZ, joint)]
      : [hinge(d.minZ), p(x1, d.y, d.minZ, joint), p(x1, d.y, d.maxZ, joint), hinge(d.maxZ)];

    if (Math.abs(rotationY) > 1.1) {
      q = [q[3], q[0], q[1], q[2]];
    }
    return q;
  }

  public renderFrame(params: Duo3DRenderParams, paintHardware = true): Duo3DFrameProjection {
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
    const isStanding = params.posture === 'standing';
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

    // Layout hand-off is independent of the public DeviceHinge.Status threshold.
    const isOuterPrimary = isStanding || u < COVER_HANDOFF_DEG / 180;

    // Automatic 3D presentation tilt during intermediate fold angles so the 3D V-valley is vivid
    // The signature transition is an illusion built for a viewer straight in
    // front of the device, so the camera holds a steady front view while the
    // device swings between closed and open.
    const frontView =
      !isStanding && !isRotatedRig && (params.posture === 'open' || params.posture === 'closed');
    // Longer front-view lens keeps the held display larger within the fixed sweep.
    this.camera.fov = frontView ? 14 : 27.5;
    const foldBell = Math.sin(Math.PI * phi);
    const autoPitch = !isStanding && !isRotatedRig && !frontView ? foldBell * 15.5 : 0;
    const autoOrbit = !isStanding && !isRotatedRig && !frontView ? foldBell * -6.5 : 0;
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
      const bisectorAngle = frontView ? 0 : smoothHandoff * (1 - phi) * (Math.PI / 2);
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

      const fit = (target: any, pts: any[]): number => {
        let d = 34.5;
        for (let iter = 0; iter < 5; iter++) {
          this.camera.position.copy(target).addScaledVector(dir, d);
          this.camera.lookAt(target);
          this.camera.updateMatrixWorld(true);
          const projected = pts.map((pt: any) => pt.clone().project(this.camera));
          const maxX = Math.max(...projected.map((p: any) => Math.abs(p.x)));
          const maxY = Math.max(...projected.map((p: any) => Math.abs(p.y)));
          d *= Math.max(maxX / 0.9, maxY / 0.9);
        }
        return d;
      };
      let target = center;
      let dist: number;
      if (frontView) {
        // The film keeps the held half stable while the other leaf swings.
        // Fit the open plane once; do not add an angle-driven pan/zoom to it.
        const pf = (x: number, z: number): any => this.asset.point(x, 0.268, z, 25);
        const openPts = [pf(-8.0, -5.6), pf(8.0, -5.6), pf(8.0, 5.6), pf(-8.0, 5.6)];
        target = openPts.reduce((acc: any, pt: any) => acc.add(pt.clone()), new T.Vector3()).multiplyScalar(0.25);
        // Fit a fixed swept envelope too: the raised leaf can approach the
        // camera by one half-width. This prevents clipping without a camera
        // move during folding; it is a simulator framing constraint.
        dist = fit(target, [...openPts, ...openPts.map((pt: any) => pt.clone().addScaledVector(dir, 8))]);
      } else {
        dist = fit(center, allBounds);
      }
      dist /= clamp(params.zoom, 0.7, 1.25);
      this.camera.position.copy(target).addScaledVector(dir, dist);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld(true);
    }

    if (paintHardware && !this.isSoftware && this.renderer) {
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

    // Displays are either lit or off; the wake fade is time-based (see
    // Duo3DStage), not a function of the hinge angle.
    const innerOpacity = isOuterPrimary ? 0 : 1;
    const leftFacing = signedQuadArea(leftCorners) > 10;
    const outerFacing = signedQuadArea(outerCorners) > 10;
    const rightVisibleClip =
      isStanding || leftFacing ? null : this.computeRightLeafVisibleClip(isRotatedRig);

    const rightFacing = signedQuadArea(rightCorners) > 10;
    const simultaneous = !isOuterPrimary && outerFacing && rightFacing && rightVisibleClip !== RIGHT_LEAF_HIDDEN;
    const outerQuad = quads3D.outer;
    const glassNormal = outerQuad[1].clone().sub(outerQuad[0]).cross(outerQuad[3].clone().sub(outerQuad[0])).normalize();
    const view = this.camera.position.clone().sub(outerQuad[0]).normalize();
    // Schlick angular response, deliberately attenuated over emissive content.
    const grazing = 1 - Math.min(1, Math.abs(glassNormal.dot(view)));
    const coverReflection = 0.035 + 0.17 * grazing ** 5;

    // --- opening / closing transition ---------------------------------------
    const angleDeg = u * 180;
    const transitionActive = params.transitioning && frontView && effectiveOrbit === 0 && effectivePitch === 0 && angleDeg >= COVER_HANDOFF_DEG && angleDeg < 179;
    const d: DisplayOutline = this.asset.displays.inner;
    const flatCorners = projectQuad([
      this.asset.point(d.minX, d.y, d.minZ, 25), this.asset.point(d.maxX, d.y, d.minZ, 25),
      this.asset.point(d.maxX, d.y, d.maxZ, 25), this.asset.point(d.minX, d.y, d.maxZ, 25)
    ]);
    const { coverMotion, innerMotion } = sampleFoldFocus(u);
    const innerBrightness = isOuterPrimary
      ? 0
      : clamp(
          (angleDeg - COVER_HANDOFF_DEG) / (INNER_FULLY_LIT_DEG - COVER_HANDOFF_DEG),
          0,
          1
        );

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
      outerFacing,
      simultaneous,
      coverReflection,
      leftFacing,
      rightVisibleClip,
      transition: {
        active: transitionActive,
        flat: {
          active: transitionActive,
          opacity: 1,
          width: 951,
          height: 669,
          corners: flatCorners,
          matrix3d: computeHomographyMatrix3d(flatCorners, 951, 669),
          zIndex: 17
        },
        coverClip:
          transitionActive && outerFacing ? this.projectScreenOntoFlatPlane('outer') : null,
        leftClip:
          transitionActive && leftFacing ? this.projectScreenOntoFlatPlane('left') : null,
        coverMotion,
        innerMotion,
        coverGradientX: this.projectGradientX(quads3D.outer, false),
        innerGradientX: this.projectGradientX(quads3D.left, true)
      },
      innerBrightness,
      outer: {
        apertureClip: displayOutlineCss(this.asset.displays.outer, true, isStanding),
        lensMask: this.coverLensMask(isStanding),
        active: outerFacing,
        opacity: 1,
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
        active: innerOpacity > 0.02 && rightFacing,
        opacity: innerOpacity,
        width: leafW,
        height: leafH,
        corners: rightCorners,
        matrix3d: computeHomographyMatrix3d(rightCorners, leafW, leafH),
        zIndex: 15
      },
      full: {
        apertureClip: displayOutlineCss(this.asset.displays.inner, false, isRotatedRig),
        active: innerOpacity > 0.02 && signedQuadArea(fullCorners) > 10,
        opacity: innerOpacity,
        width: fullW,
        height: fullH,
        corners: fullCorners,
        matrix3d: computeHomographyMatrix3d(fullCorners, fullW, fullH),
        zIndex: 18
      }
    };
  }

  /**
   * While the device is barely open and the camera still sees the back of the
   * left leaf, that leaf hides most of the right half of the inner display.
   * The hidden part is bounded by a straight line on the right leaf: the left
   * leaf's free edge projected from the camera onto the right-leaf plane.
   */
  private computeRightLeafVisibleClip(isRotatedRig: boolean): string | null {
    const T = this.T;
    const d: DisplayOutline = this.asset.displays.inner;
    const LEAF_X = d.maxX;
    const LEAF_Z = (d.maxZ - d.minZ) / 2;
    const origin = this.asset.point(0, d.y, d.minZ, 25);
    const ex = this.asset.point(LEAF_X, d.y, d.minZ, 25).clone().sub(origin);
    const ez = this.asset.point(0, d.y, d.maxZ, 25).clone().sub(origin);
    const normal = new T.Vector3().crossVectors(ex, ez);
    const cam = this.camera.position;
    const hidden = RIGHT_LEAF_HIDDEN;

    const project = (z: number): { x: number; z: number } | null => {
      // free edge of the left leaf body (slightly outside the glass)
      const edge = this.asset.point(-8.05, 0.0, z, 24);
      const dir = edge.clone().sub(cam);
      const denom = normal.dot(dir);
      if (Math.abs(denom) < 1e-6) return null;
      const t = normal.dot(origin.clone().sub(cam)) / denom;
      if (t <= 0) return null;
      const hit = cam.clone().addScaledVector(dir, t).sub(origin);
      return {
        x: (hit.dot(ex) / ex.lengthSq()) * LEAF_X,
        z: (hit.dot(ez) / ez.lengthSq()) * 2 * LEAF_Z + d.minZ
      };
    };
    const a = project(d.minZ - 0.2);
    const b = project(d.maxZ + 0.2);
    if (!a || !b) return hidden;
    if (Math.min(a.x, b.x) >= LEAF_X) return hidden;
    if (Math.max(a.x, b.x) <= 0) return null;

    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const pa = { x: a.x - dx * 4, z: a.z - dz * 4 };
    const pb = { x: b.x + dx * 4, z: b.z + dz * 4 };
    const FAR = 1000;
    const toLocal = (pt: { x: number; z: number }): string => {
      const along = (pt.x / LEAF_X) * 475.5;
      const across = ((pt.z - d.minZ) / (2 * LEAF_Z)) * 669;
      // rotated rig: corners are re-ordered so the hinge is the top edge
      const lx = isRotatedRig ? 669 - across : along;
      const ly = isRotatedRig ? along : across;
      return `${lx.toFixed(1)}px ${ly.toFixed(1)}px`;
    };
    return `polygon(${[
      toLocal(pa),
      toLocal({ x: pa.x + FAR, z: pa.z }),
      toLocal({ x: pb.x + FAR, z: pb.z }),
      toLocal(pb)
    ].join(', ')})`;
  }

  /**
   * Projects a screen quad of the moving leaf from the camera onto the
   * unfolded inner-display plane and returns it as a CSS polygon in that
   * plane's local points (951×669). This is the "stencil": the region of the
   * anchored picture that is seen through that screen.
   */
  private projectGradientX(quad: any[], inner: boolean): number[] {
    const left = quad[0].clone().add(quad[3]).multiplyScalar(0.5);
    const right = quad[1].clone().add(quad[2]).multiplyScalar(0.5);
    const hinge = inner ? right : left;
    const edge = inner ? left : right;
    const samples = Array.from({ length: 21 }, (_, i) => hinge.clone().lerp(edge, i / 20));
    return this.projectPointsOntoFlatPlane(samples)?.map((p) => p.x) ?? [];
  }

  private coverLensMask(rotated: boolean): string | undefined {
    const lens: DisplayOutline | undefined = this.asset.coverLens;
    if (!lens) return undefined;
    const d: DisplayOutline = this.asset.displays.outer;
    const w = d.maxX - d.minX, h = d.maxZ - d.minZ;
    const x = 100 * (d.maxX - (lens.maxX + lens.minX) / 2) / w;
    const y = 100 * ((lens.maxZ + lens.minZ) / 2 - d.minZ) / h;
    const rx = 50 * (lens.maxX - lens.minX) / w;
    const ry = 50 * (lens.maxZ - lens.minZ) / h;
    return `radial-gradient(ellipse ${rotated ? ry : rx}% ${rotated ? rx : ry}% at ${rotated ? 100 - y : x}% ${rotated ? x : y}%, transparent 96%, black 100%)`;
  }

  private projectScreenOntoFlatPlane(name: 'outer' | 'left'): string | null {
    const d: DisplayOutline = this.asset.displays[name === 'outer' ? 'outer' : 'inner'];
    const contour = name === 'outer' ? d.points : leftDisplayContour(d);
    const pts = this.projectPointsOntoFlatPlane(contour.map(([x, z]) => this.asset.point(x, d.y, z, 24)));
    if (!pts) return null;
    const point = (p: Point2D): string => `${p.x.toFixed(3)}px ${p.y.toFixed(3)}px`;
    const lens: DisplayOutline | undefined = this.asset.coverLens;
    if (name === 'outer' && lens) {
      const hole = this.projectPointsOntoFlatPlane(lens.points.map(([x,z]) => this.asset.point(x, d.y, z, 24)));
      if (hole) return `polygon(evenodd, ${[...pts, pts[0], ...hole, hole[0], pts[0]].map(point).join(',')})`;
    }
    return `polygon(${pts.map(point).join(',')})`;
  }

  private projectPointsOntoFlatPlane(quad: any[]): Point2D[] | null {
    const T = this.T;
    const d: DisplayOutline = this.asset.displays.inner;
    const origin = this.asset.point(d.minX, d.y, d.minZ, 25);
    const ex = this.asset.point(d.maxX, d.y, d.minZ, 25).clone().sub(origin);
    const ez = this.asset.point(d.minX, d.y, d.maxZ, 25).clone().sub(origin);
    const normal = new T.Vector3().crossVectors(ex, ez);
    const cam = this.camera.position;
    const pts: Point2D[] = [];
    for (const corner of quad) {
      const dir = corner.clone().sub(cam);
      const denom = normal.dot(dir);
      if (Math.abs(denom) < 1e-6) return null;
      const t = normal.dot(origin.clone().sub(cam)) / denom;
      if (t <= 0) return null;
      const hit = cam.clone().addScaledVector(dir, t).sub(origin);
      const lx = (hit.dot(ex) / ex.lengthSq()) * 951;
      const ly = (hit.dot(ez) / ez.lengthSq()) * 669;
      pts.push({ x: lx, y: ly });
    }
    return pts;
  }

  public dispose(): void {
    this.environmentTarget?.dispose();
    if (this.renderer && typeof this.renderer.dispose === 'function') {
      this.renderer.dispose();
    }
  }
}

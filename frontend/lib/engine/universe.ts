// The ASTRO universe engine: a navigable HD solar system — Keplerian
// orbits with real inclinations, shader-lit surfaces with true
// terminators, Earth's city lights, live comet tails, the Kuiper Belt —
// with cinematic camera flights and a warp into procedural deep fields.

import * as THREE from "three";
import {
  DisposalBag,
  buildMilkyWay,
  buildSkySphere,
  buildStarShell,
  easeInOut,
  makeBloom,
  makeRenderer,
  radialSprite,
} from "./core";
import {
  ATMO_FRAG,
  BODY_UV_VERT,
  BODY_VERT,
  CLOUD_FRAG,
  ICY_MOON_FRAG,
  PLUTO_FRAG,
  RING_FRAG,
  RING_VERT,
  SUN_SURFACE_FRAG,
  SURFACE_FRAG,
} from "./shaders";
import { DeepScene, DeepType, buildDeepScene, displacedRock } from "./deep";
import { COMETS, PLANETS, SUN, orbitRadius, phase0 } from "../universe-data";

const EARTH_YEAR_S = 240; // seconds of sim time per Earth year at 1x
const DAYS_PER_SEC = 365.25 / EARTH_YEAR_S;

export type UniverseMode = "system" | "deep" | "warping";

export interface LabelInfo {
  id: string;
  x: number;
  y: number;
  show: boolean;
  focused: boolean;
}

export interface Universe {
  focus(id: string | null): void;
  warp(type: DeepType, name: string): void;
  returnToSystem(): void;
  getMode(): UniverseMode;
  getFocus(): string | null;
  setTimeScale(s: number): void;
  getTimeScale(): number;
  onLabels(cb: (labels: LabelInfo[]) => void): void;
  onPick(cb: (id: string) => void): void;
  onHover(cb: (id: string | null) => void): void;
  onMode(cb: (mode: UniverseMode, deepName?: string) => void): void;
  onClock(cb: (years: number) => void): void;
  dispose(): void;
}

interface BodyEntry {
  id: string;
  mesh: THREE.Object3D;
  radius: number;
  parentId?: string;
  isMoon: boolean;
  isComet?: boolean;
}

/** Solve Kepler's equation and return the position on the orbit ellipse
 *  (sun at the focus) in the orbit plane's local XZ. */
function keplerPos(A: number, e: number, M: number, out: THREE.Vector3): THREE.Vector3 {
  let E = M + e * Math.sin(M); // good first guess even at high eccentricity
  for (let i = 0; i < 5; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  out.set(A * (Math.cos(E) - e), 0, A * Math.sqrt(1 - e * e) * Math.sin(E));
  return out;
}

function axialTiltRad(tiltDeg: number): number {
  const t = Math.min(tiltDeg, 180 - tiltDeg);
  return THREE.MathUtils.degToRad(t) * (tiltDeg > 90 ? -1 : 1);
}

function spinRate(spinHours: number | undefined): number {
  if (!spinHours) return 0.19;
  const mag = Math.min(0.6, Math.max(0.006, (24 / Math.abs(spinHours)) * 0.19));
  return mag * Math.sign(spinHours);
}

export function createUniverse(canvas: HTMLCanvasElement): Universe {
  const bag = new DisposalBag();
  const deepBag = new DisposalBag();
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 8000);
  const loader = new THREE.TextureLoader();

  const sprite = bag.add(radialSprite("rgba(255,255,255,0.95)", "rgba(255,255,255,0)"));

  // ── Sky: 4K Milky Way panorama + round parallax stars ───────────────────
  buildSkySphere(scene, bag, loader, 3000, 0.52);
  buildStarShell(scene, bag, 9000, 1200, 2200, 2.3, 0.85, 0.85, sprite);
  buildStarShell(scene, bag, 3500, 700, 1100, 1.5, 0.9, 0.9, sprite);
  const milky = buildMilkyWay(scene, bag, 9000);
  (milky.material as THREE.PointsMaterial).opacity = 0.35;

  // ── Lights (shader surfaces self-light; this covers rock meshes) ────────
  scene.add(new THREE.AmbientLight(0x223044, 0.5));
  const sunLight = new THREE.PointLight(0xfff2dc, 3.0, 0, 0);
  scene.add(sunLight);

  const deepLightDir = new THREE.Vector3(-0.55, 0.4, 0.75).normalize();
  const deepKey = new THREE.PointLight(0xfff2dc, 2.6, 0, 0);
  deepKey.position.copy(deepLightDir.clone().multiplyScalar(40));
  deepKey.visible = false;
  scene.add(deepKey);

  // ── Groups ──────────────────────────────────────────────────────────────
  const systemGroup = new THREE.Group();
  scene.add(systemGroup);
  const deepGroup = new THREE.Group();
  deepGroup.visible = false;
  scene.add(deepGroup);

  const bodies = new Map<string, BodyEntry>();
  const pickMeshes: THREE.Object3D[] = [];

  const tex = (url: string) => {
    const t = bag.add(loader.load(url));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };

  /** Sun-lit shader surface; light direction tracked toward the origin. */
  const litUniforms = (extra: Record<string, { value: unknown }> = {}) => ({
    uLightDir: { value: new THREE.Vector3(1, 0, 0) },
    ...extra,
  });
  const trackSun = (mesh: THREE.Mesh, uniforms: { uLightDir: { value: THREE.Vector3 } }) => {
    const wp = new THREE.Vector3();
    mesh.onBeforeRender = () => {
      mesh.getWorldPosition(wp);
      uniforms.uLightDir.value.copy(wp).multiplyScalar(-1).normalize();
    };
  };

  // ── Sun: animated 4K surface + layered corona + prominence field ────────
  const sunUniforms = { uMap: { value: tex(SUN.texture) }, uTime: { value: 0 } };
  {
    const mat = bag.add(
      new THREE.ShaderMaterial({ uniforms: sunUniforms, vertexShader: BODY_UV_VERT, fragmentShader: SUN_SURFACE_FRAG }),
    );
    const sunMesh = new THREE.Mesh(bag.add(new THREE.SphereGeometry(SUN.radius, 128, 128)), mat);
    sunMesh.userData.bodyId = "sun";
    systemGroup.add(sunMesh);
    bodies.set("sun", { id: "sun", mesh: sunMesh, radius: SUN.radius, isMoon: false });
    pickMeshes.push(sunMesh);
  }
  const coronaInner = (() => {
    const m = bag.add(
      new THREE.SpriteMaterial({ map: sprite, color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }),
    );
    const s = new THREE.Sprite(m);
    s.scale.setScalar(SUN.radius * 4.4);
    systemGroup.add(s);
    return { s, m };
  })();
  const coronaOuter = (() => {
    const m = bag.add(
      new THREE.SpriteMaterial({ map: sprite, color: 0xff9a3c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.18 }),
    );
    const s = new THREE.Sprite(m);
    s.scale.setScalar(SUN.radius * 6.6);
    systemGroup.add(s);
    return { s, m };
  })();
  const prominences = (() => {
    const count = 1200;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = SUN.radius * (1.005 + Math.pow(Math.random(), 2.6) * 0.28);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = bag.add(
      new THREE.PointsMaterial({ map: sprite, color: 0xff8a3c, size: 0.3, sizeAttenuation: true, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const pts = new THREE.Points(geo, mat);
    systemGroup.add(pts);
    return pts;
  })();

  // ── Orbit line helper (ellipse, sun at focus) ───────────────────────────
  const orbitLine = (A: number, e: number, color = 0xffb454, opacity = 0.1) => {
    const pts: THREE.Vector3[] = [];
    const b = A * Math.sqrt(1 - e * e);
    for (let i = 0; i <= 220; i++) {
      const E = (i / 220) * Math.PI * 2;
      pts.push(new THREE.Vector3(A * (Math.cos(E) - e), 0, b * Math.sin(E)));
    }
    const geo = bag.add(new THREE.BufferGeometry().setFromPoints(pts));
    const mat = bag.add(new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    return new THREE.Line(geo, mat);
  };

  // ── Planets and dwarf planets ───────────────────────────────────────────
  interface MoonRt {
    group: THREE.Group;
    orbitR: number;
    w: number;
    ph: number;
    spin: THREE.Object3D;
  }
  interface PlanetRt {
    pivot: THREE.Group;
    A: number;
    e: number;
    w: number;
    ph: number;
    spin: THREE.Object3D;
    spinW: number;
    clouds?: THREE.Mesh;
    moons: MoonRt[];
  }
  const planetRts: PlanetRt[] = [];

  for (const p of PLANETS) {
    const A = orbitRadius(p.aAU);
    const e = p.ecc ?? 0;

    // Orbit plane: ascending-node twist + inclination
    const plane = new THREE.Group();
    plane.rotation.y = phase0(`${p.id}-node`);
    plane.rotation.x = THREE.MathUtils.degToRad(p.incDeg ?? 0);
    systemGroup.add(plane);
    plane.add(orbitLine(A, e, p.dwarf ? 0x9fb8c8 : 0xffb454, p.dwarf ? 0.07 : 0.1));

    const pivot = new THREE.Group();
    plane.add(pivot);

    // Axial tilt group: surface, clouds, atmosphere, rings and moons all
    // share the planet's real obliquity (Uranus rolls on its side).
    const tilt = new THREE.Group();
    tilt.rotation.z = axialTiltRad(p.tiltDeg);
    pivot.add(tilt);

    let mesh: THREE.Mesh;
    if (p.proc === "pluto") {
      const u = litUniforms();
      const mat = bag.add(new THREE.ShaderMaterial({ uniforms: u, vertexShader: BODY_VERT, fragmentShader: PLUTO_FRAG }));
      mesh = new THREE.Mesh(bag.add(new THREE.SphereGeometry(p.radius, 72, 72)), mat);
      trackSun(mesh, u);
    } else {
      const u = litUniforms({
        uMap: { value: tex(p.texture!) },
        uNight: { value: p.night ? tex(p.night) : null },
        uHasNight: { value: p.night ? 1 : 0 },
        uOcean: { value: p.id === "earth" ? 1 : 0 },
        uAmbient: { value: 0.04 },
      });
      const mat = bag.add(new THREE.ShaderMaterial({ uniforms: u, vertexShader: BODY_UV_VERT, fragmentShader: SURFACE_FRAG }));
      const segs = p.radius >= 1.5 ? 128 : 96;
      mesh = new THREE.Mesh(bag.add(new THREE.SphereGeometry(p.radius, segs, segs)), mat);
      trackSun(mesh, u);
    }
    if (p.scale) mesh.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    mesh.userData.bodyId = p.id;
    tilt.add(mesh);
    bodies.set(p.id, { id: p.id, mesh, radius: p.radius, isMoon: false });
    pickMeshes.push(mesh);

    let clouds: THREE.Mesh | undefined;
    if (p.clouds) {
      const u = litUniforms({ uMap: { value: tex(p.clouds) } });
      const cmat = bag.add(
        new THREE.ShaderMaterial({ uniforms: u, vertexShader: BODY_UV_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false }),
      );
      clouds = new THREE.Mesh(bag.add(new THREE.SphereGeometry(p.radius * 1.012, 72, 72)), cmat);
      trackSun(clouds, u);
      tilt.add(clouds);
    }

    if (p.atmosphere !== undefined) {
      const u = { uAtmo: { value: new THREE.Color(p.atmosphere) }, uLightDir: { value: new THREE.Vector3(1, 0, 0) } };
      const amat = bag.add(
        new THREE.ShaderMaterial({
          uniforms: u,
          vertexShader: BODY_VERT,
          fragmentShader: ATMO_FRAG,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const shell = new THREE.Mesh(bag.add(new THREE.SphereGeometry(p.radius * 1.05, 64, 64)), amat);
      trackSun(shell, u);
      tilt.add(shell);
    }

    if (p.ring === "saturn") {
      const ringTex = tex("/textures/saturn_ring.png");
      const rgeo = bag.add(new THREE.RingGeometry(p.radius * 1.32, p.radius * 2.35, 192, 1));
      const uv = rgeo.attributes.uv as THREE.BufferAttribute;
      const posAttr = rgeo.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < uv.count; i++) {
        v.fromBufferAttribute(posAttr, i);
        const f = (v.length() - p.radius * 1.32) / (p.radius * 1.03);
        uv.setXY(i, f, 0.5);
      }
      const ru = { uMap: { value: ringTex }, uPlanetPos: { value: new THREE.Vector3() }, uPlanetR: { value: p.radius } };
      const rmat = bag.add(
        new THREE.ShaderMaterial({
          uniforms: ru,
          vertexShader: RING_VERT,
          fragmentShader: RING_FRAG,
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
        }),
      );
      const ring = new THREE.Mesh(rgeo, rmat);
      ring.rotation.x = Math.PI / 2;
      ring.onBeforeRender = () => {
        ring.getWorldPosition(ru.uPlanetPos.value);
      };
      tilt.add(ring);
    } else if (p.ring === "faint") {
      const rgeo = bag.add(new THREE.RingGeometry(p.radius * 1.55, p.radius * 1.85, 128, 1));
      const rmat = bag.add(
        new THREE.MeshBasicMaterial({ color: 0x9fb8c8, side: THREE.DoubleSide, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      const ring = new THREE.Mesh(rgeo, rmat);
      ring.rotation.x = Math.PI / 2;
      tilt.add(ring);
    }

    const moons: MoonRt[] = [];
    for (const m of p.moons ?? []) {
      const mg = new THREE.Group();
      tilt.add(mg);
      let mmesh: THREE.Object3D;
      if (m.rocky) {
        mmesh = displacedRock(bag, m.radius, 3, 0.34, new THREE.Vector3(1.25, 0.85, 1), m.color);
      } else if (m.texture) {
        const u = litUniforms({
          uMap: { value: tex(m.texture) },
          uNight: { value: null },
          uHasNight: { value: 0 },
          uOcean: { value: 0 },
          uAmbient: { value: 0.045 },
        });
        const mat = bag.add(new THREE.ShaderMaterial({ uniforms: u, vertexShader: BODY_UV_VERT, fragmentShader: SURFACE_FRAG }));
        const sm = new THREE.Mesh(bag.add(new THREE.SphereGeometry(m.radius, 56, 56)), mat);
        trackSun(sm, u);
        mmesh = sm;
      } else {
        const u = litUniforms({ uBase: { value: new THREE.Color(m.color) } });
        const mat = bag.add(new THREE.ShaderMaterial({ uniforms: u, vertexShader: BODY_VERT, fragmentShader: ICY_MOON_FRAG }));
        const sm = new THREE.Mesh(bag.add(new THREE.SphereGeometry(m.radius, 48, 48)), mat);
        trackSun(sm, u);
        mmesh = sm;
      }
      mmesh.userData.bodyId = m.id;
      mg.add(mmesh);
      bodies.set(m.id, { id: m.id, mesh: mmesh, radius: m.radius, parentId: p.id, isMoon: true });
      pickMeshes.push(mmesh);
      // Slowed moon time with a floor so inner moons stay readable
      const effPeriod = Math.max(Math.abs(m.periodDays), 1.5) * Math.sign(m.periodDays || 1);
      moons.push({ group: mg, orbitR: m.orbitR, w: (Math.PI * 2) / effPeriod, ph: phase0(m.id), spin: mmesh });
    }

    planetRts.push({
      pivot,
      A,
      e,
      w: (Math.PI * 2) / p.periodYears,
      ph: phase0(p.id),
      spin: mesh,
      spinW: spinRate(p.spinHours),
      clouds,
      moons,
    });
  }

  // ── Asteroid belt ───────────────────────────────────────────────────────
  const asteroidBelt = (() => {
    const count = 5200;
    const rIn = orbitRadius(2.1),
      rOut = orbitRadius(3.3);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const ca = new THREE.Color(0x8a7a64),
      cb = new THREE.Color(0x6b5f4e);
    for (let i = 0; i < count; i++) {
      const r = rIn + Math.random() * (rOut - rIn);
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 1.8;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const c = ca.clone().lerp(cb, Math.random());
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const geo = bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = bag.add(
      new THREE.PointsMaterial({ map: sprite, size: 0.2, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    const belt = new THREE.Points(geo, mat);
    systemGroup.add(belt);
    return belt;
  })();

  // ── Kuiper belt: a cold, sparse icy donut past Neptune ──────────────────
  const kuiperBelt = (() => {
    const count = 5200;
    const rIn = orbitRadius(31),
      rOut = orbitRadius(52);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const ca = new THREE.Color(0x7a8a9c),
      cb = new THREE.Color(0x54606e);
    for (let i = 0; i < count; i++) {
      const r = rIn + Math.pow(Math.random(), 1.3) * (rOut - rIn);
      const a = Math.random() * Math.PI * 2;
      const f = (r - rIn) / (rOut - rIn);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * (5 + f * 14);
      pos[i * 3 + 2] = Math.sin(a) * r;
      const c = ca.clone().lerp(cb, Math.random());
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const geo = bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = bag.add(
      new THREE.PointsMaterial({ map: sprite, size: 0.42, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.42, depthWrite: false }),
    );
    const belt = new THREE.Points(geo, mat);
    systemGroup.add(belt);
    return belt;
  })();

  // ── Comets: Keplerian screamers with live anti-sunward tails ────────────
  interface CometRt {
    plane: THREE.Group;
    group: THREE.Group;
    tailGroup: THREE.Group;
    A: number;
    e: number;
    w: number;
    M0: number;
    comaMat: THREE.SpriteMaterial;
    coma: THREE.Sprite;
    ionMat: THREE.PointsMaterial;
    dustMat: THREE.PointsMaterial;
  }
  const cometRts: CometRt[] = [];

  const buildTail = (count: number, spread: number, curve: number, color: number, size: number) => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const f = Math.pow(Math.random(), 0.65);
      const g1 = Math.random() + Math.random() - 1;
      const g2 = Math.random() + Math.random() - 1;
      pos[i * 3] = g1 * spread * (0.25 + f) + curve * f * f;
      pos[i * 3 + 1] = g2 * spread * (0.25 + f);
      pos[i * 3 + 2] = f; // unit length; stretched via tailGroup.scale.z
      const b = 1 - f * 0.85;
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
    }
    const geo = bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = bag.add(
      new THREE.PointsMaterial({ map: sprite, size, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    return { pts: new THREE.Points(geo, mat), mat };
  };

  for (const c of COMETS) {
    const plane = new THREE.Group();
    plane.rotation.y = THREE.MathUtils.degToRad(c.nodeDeg);
    plane.rotation.x = THREE.MathUtils.degToRad(c.incDeg);
    systemGroup.add(plane);

    const A = orbitRadius(c.aAU);
    plane.add(orbitLine(A, c.ecc, 0x9fd8ff, 0.06));

    const group = new THREE.Group();
    plane.add(group);

    const nucleus = displacedRock(bag, 0.16, 3, 0.4, new THREE.Vector3(1.3, 0.85, 1), 0x8a8170);
    group.add(nucleus);

    // Invisible pick/label proxy so the tiny nucleus is easy to hit
    // (opacity 0 rather than visible:false so the raycaster still sees it)
    const proxy = new THREE.Mesh(
      bag.add(new THREE.SphereGeometry(0.7, 12, 12)),
      bag.add(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })),
    );
    proxy.userData.bodyId = c.id;
    group.add(proxy);
    bodies.set(c.id, { id: c.id, mesh: proxy, radius: 0.7, isMoon: false, isComet: true });
    pickMeshes.push(proxy);

    const comaMat = bag.add(
      new THREE.SpriteMaterial({ map: sprite, color: c.ionColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }),
    );
    const coma = new THREE.Sprite(comaMat);
    coma.scale.setScalar(1.4);
    group.add(coma);

    const tailGroup = new THREE.Group();
    group.add(tailGroup);
    const ion = buildTail(7000, 0.14, 0.0, c.ionColor, 0.085);
    const dust = buildTail(6000, 0.34, 1.6, c.dustColor, 0.115);
    tailGroup.add(ion.pts);
    tailGroup.add(dust.pts);

    cometRts.push({
      plane,
      group,
      tailGroup,
      A,
      e: c.ecc,
      w: ((Math.PI * 2) / c.periodYears) * (c.retrograde ? -1 : 1),
      M0: (phase0(c.id) % 0.9) - 0.45, // open near perihelion for drama
      comaMat,
      coma,
      ionMat: ion.mat,
      dustMat: dust.mat,
    });
  }

  // ── Post ────────────────────────────────────────────────────────────────
  const { composer, bloom, finish } = makeBloom(renderer, scene, camera, { strength: 0.45, threshold: 0.72 });
  const SYSTEM_BLOOM = { strength: 0.45, threshold: 0.72 };

  // ── Warp streaks (parented to camera, shown only during warp) ──────────
  const streaks = (() => {
    const count = 700;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 22;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a) * r;
      pos[i * 3 + 2] = -20 - Math.random() * 160;
    }
    const geo = bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = bag.add(
      new THREE.PointsMaterial({ color: 0xcfe8ff, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    camera.add(pts);
    scene.add(camera);
    return { pts, mat, geo };
  })();

  // ── Camera state machine ────────────────────────────────────────────────
  type CamMode = "overview" | "travel" | "orbit" | "warp-out" | "deep" | "warp-in";
  let camMode: CamMode = "overview";
  let az = 0.7,
    el = 0.42,
    dist = 190; // overview spherical
  let baz = 0.5,
    bel = 0.25,
    bdist = 10; // body/deep orbit spherical
  let focusId: string | null = null;
  let deepScene: DeepScene | null = null;
  let deepName = "";
  let pendingDeep: { type: DeepType; name: string } | null = null;
  let warpT = 0;
  let travelT = 0;
  let travelFrom = new THREE.Vector3();
  let travelLookFrom = new THREE.Vector3();
  let travelDir = new THREE.Vector3();
  let returnAfterWarp = false;

  const lookAt = new THREE.Vector3(0, 0, 0);
  camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);

  const worldPos = (id: string, out: THREE.Vector3) => {
    const b = bodies.get(id);
    if (b) b.mesh.getWorldPosition(out);
    return out;
  };

  // ── Sinks ───────────────────────────────────────────────────────────────
  let labelSink: ((l: LabelInfo[]) => void) | null = null;
  let pickSink: ((id: string) => void) | null = null;
  let hoverSink: ((id: string | null) => void) | null = null;
  let modeSink: ((m: UniverseMode, deepName?: string) => void) | null = null;
  let clockSink: ((years: number) => void) | null = null;

  // ── Input ───────────────────────────────────────────────────────────────
  let dragging = false;
  let moved = 0;
  let lastX = 0,
    lastY = 0;
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  let hoverId: string | null = null;

  const clampEl = (v: number) => Math.max(-1.35, Math.min(1.35, v));

  const onDown = (e: PointerEvent) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e: PointerEvent) => {
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (camMode === "overview") {
        az -= dx * 0.004;
        el = clampEl(el + dy * 0.004);
      } else if (camMode === "orbit" || camMode === "deep") {
        baz -= dx * 0.005;
        bel = clampEl(bel + dy * 0.005);
      }
      lastX = e.clientX;
      lastY = e.clientY;
    }
    pointerNDC.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  };
  const onUp = (e: PointerEvent) => {
    const wasDrag = moved > 6;
    dragging = false;
    canvas.style.cursor = "grab";
    if (wasDrag || camMode === "warp-out" || camMode === "warp-in" || camMode === "deep" || camMode === "travel") return;
    pointerNDC.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(pickMeshes, false);
    if (hits.length > 0) {
      const id = hits[0].object.userData.bodyId as string;
      if (id && pickSink) pickSink(id);
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (camMode === "overview") {
      dist = Math.max(40, Math.min(520, dist + e.deltaY * 0.14));
    } else if (camMode === "orbit") {
      const b = focusId ? bodies.get(focusId) : null;
      const r = b ? b.radius : 2;
      bdist = Math.max(r * 2.4, Math.min(r * 40, bdist + e.deltaY * 0.01 * r));
    } else if (camMode === "deep" && deepScene) {
      bdist = Math.max(deepScene.camDist * 0.5, Math.min(deepScene.camDist * 2.4, bdist + e.deltaY * 0.01));
    }
  };

  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const onResize = () => {
    const w = window.innerWidth,
      h = window.innerHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  onResize();
  window.addEventListener("resize", onResize);

  // ── Transitions ─────────────────────────────────────────────────────────
  const startTravel = (id: string) => {
    focusId = id;
    camMode = "travel";
    travelT = 0;
    travelFrom.copy(camera.position);
    travelLookFrom.copy(lookAt);
    const bp = worldPos(id, new THREE.Vector3());
    travelDir.copy(camera.position).sub(bp).normalize();
    if (travelDir.lengthSq() < 0.001) travelDir.set(0.6, 0.35, 0.7).normalize();
    // Bias the arrival toward the day side so worlds are revealed lit
    if (bp.lengthSq() > 1) {
      const sunward = bp.clone().multiplyScalar(-1).normalize();
      travelDir.multiplyScalar(0.45).add(sunward.multiplyScalar(0.85));
    }
    travelDir.y = Math.max(travelDir.y, 0.22);
    travelDir.normalize();
  };

  const beginWarp = (type: DeepType, name: string) => {
    pendingDeep = { type, name };
    deepName = name;
    camMode = "warp-out";
    warpT = 0;
    returnAfterWarp = false;
    streaks.pts.visible = true;
    modeSink?.("warping", name);
  };

  const finishWarpOut = () => {
    deepBag.disposeAll();
    deepGroup.clear();
    deepGroup.rotation.set(0, 0, 0);
    if (pendingDeep) {
      deepScene = buildDeepScene(pendingDeep.type, pendingDeep.name.toLowerCase(), deepGroup, deepBag, sprite, deepLightDir);
      bdist = deepScene.camDist;
      baz = 0.4;
      bel = 0.16;
      bloom.strength = deepScene.bloom.strength;
      bloom.threshold = deepScene.bloom.threshold;
    }
    systemGroup.visible = false;
    deepKey.visible = true;
    sunLight.visible = false;
    deepGroup.visible = true;
    camMode = "deep";
    camera.fov = 55;
    camera.updateProjectionMatrix();
    streaks.pts.visible = false;
    (streaks.mat as THREE.PointsMaterial).opacity = 0;
    modeSink?.("deep", deepName);
  };

  const beginReturn = () => {
    camMode = "warp-in";
    warpT = 0;
    returnAfterWarp = true;
    streaks.pts.visible = true;
    modeSink?.("warping");
  };

  const finishWarpIn = () => {
    deepGroup.visible = false;
    systemGroup.visible = true;
    deepKey.visible = false;
    sunLight.visible = true;
    bloom.strength = SYSTEM_BLOOM.strength;
    bloom.threshold = SYSTEM_BLOOM.threshold;
    deepScene = null;
    focusId = null;
    camMode = "overview";
    camera.fov = 55;
    camera.updateProjectionMatrix();
    streaks.pts.visible = false;
    (streaks.mat as THREE.PointsMaterial).opacity = 0;
    modeSink?.("system");
  };

  // ── Frame loop ──────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let raf = 0;
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  let frame = 0;
  let timeScale = 1;
  let simT = 0; // sim seconds; orbital mechanics run on this

  const animate = () => {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const sdt = dt * timeScale;
    simT += sdt;
    frame++;

    // Orbital motion: Kepler's equation on every world, real period ratios.
    const years = simT / EARTH_YEAR_S;
    const days = simT * DAYS_PER_SEC * 0.45; // moon time, slowed for readability
    for (const pr of planetRts) {
      keplerPos(pr.A, pr.e, pr.ph + pr.w * years, tmpV);
      pr.pivot.position.copy(tmpV);
      pr.spin.rotation.y += sdt * pr.spinW;
      if (pr.clouds) pr.clouds.rotation.y += sdt * pr.spinW * 1.25;
      for (const m of pr.moons) {
        const angM = m.ph + m.w * days;
        m.group.position.set(Math.cos(angM) * m.orbitR, 0, Math.sin(angM) * m.orbitR);
        m.spin.rotation.y += sdt * 0.3;
      }
    }

    // Comets: position, orientation (tail anti-sunward), activity by radius
    for (const cr of cometRts) {
      keplerPos(cr.A, cr.e, cr.M0 + cr.w * years, tmpV);
      cr.group.position.copy(tmpV);
      const r = tmpV.length();
      // In the orbit plane's local frame the Sun is at the origin, so the
      // anti-sun direction is simply the normalized position.
      tmpV2.copy(tmpV).normalize();
      cr.tailGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmpV2);
      const strength = Math.max(0, Math.min(1, 1.35 - r / 70));
      cr.tailGroup.scale.set(1 + strength * 1.2, 1 + strength * 1.2, 5 + strength * 30);
      cr.ionMat.opacity = 0.05 + strength * 0.5;
      cr.dustMat.opacity = 0.04 + strength * 0.4;
      cr.comaMat.opacity = 0.12 + strength * 0.32;
      cr.coma.scale.setScalar(0.35 + strength * 0.85);
    }

    asteroidBelt.rotation.y += sdt * 0.004;
    kuiperBelt.rotation.y += sdt * 0.0012;
    milky.rotation.y += dt * 0.0008;

    // Sun churn + corona breathing (real time, independent of sim speed).
    // The corona fades as the camera closes in so nearby worlds are not
    // drowned in amber glow.
    sunUniforms.uTime.value = t;
    const pulse = 1 + Math.sin(t * 1.3) * 0.03;
    const proximity = Math.max(0.18, Math.min(1, (camera.position.length() - 14) / 60));
    coronaInner.s.scale.setScalar(SUN.radius * 4.4 * pulse);
    coronaInner.m.opacity = (0.8 + Math.sin(t * 2.1) * 0.08) * Math.max(proximity, 0.5);
    coronaOuter.s.scale.setScalar(SUN.radius * 6.6 * (2 - pulse));
    coronaOuter.m.opacity = (0.16 + Math.sin(t * 1.7 + 1) * 0.04) * proximity;
    prominences.rotation.y += dt * 0.02;

    if (finish) finish.uniforms.uTime.value = t;

    // Deep scene animation
    if (deepScene && deepGroup.visible) deepScene.update(t);

    // Camera
    if (camMode === "overview") {
      az += dt * 0.008;
      camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
      lookAt.lerp(tmpV.set(0, 0, 0), 0.06);
    } else if (camMode === "travel" && focusId) {
      travelT = Math.min(1, travelT + dt / 2.1);
      const k = easeInOut(travelT);
      const bp = worldPos(focusId, tmpV);
      const b = bodies.get(focusId)!;
      const targetPos = tmpV2.copy(bp).add(travelDir.clone().multiplyScalar(b.radius * 5.2));
      camera.position.lerpVectors(travelFrom, targetPos, k);
      lookAt.lerpVectors(travelLookFrom, bp, Math.min(1, k * 1.4));
      if (travelT >= 1) {
        camMode = "orbit";
        bdist = b.radius * 5.2;
        const rel = camera.position.clone().sub(bp);
        baz = Math.atan2(rel.x, rel.z);
        bel = Math.asin(Math.max(-1, Math.min(1, rel.y / rel.length())));
      }
    } else if (camMode === "orbit" && focusId) {
      const bp = worldPos(focusId, tmpV);
      if (!dragging) baz += dt * 0.05;
      camera.position.set(
        bp.x + Math.sin(baz) * Math.cos(bel) * bdist,
        bp.y + Math.sin(bel) * bdist,
        bp.z + Math.cos(baz) * Math.cos(bel) * bdist,
      );
      lookAt.lerp(bp, 0.25);
    } else if (camMode === "warp-out" || camMode === "warp-in") {
      warpT = Math.min(1, warpT + dt / (camMode === "warp-out" ? 1.15 : 0.85));
      const k = easeInOut(warpT);
      camera.fov = 55 + Math.sin(k * Math.PI) * 38;
      camera.updateProjectionMatrix();
      (streaks.mat as THREE.PointsMaterial).opacity = Math.sin(k * Math.PI) * 0.85;
      const sp = streaks.geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sp.count; i++) {
        let z = sp.getZ(i) + dt * (140 + k * 380);
        if (z > 8) z = -160 - Math.random() * 60;
        sp.setZ(i, z);
      }
      sp.needsUpdate = true;
      if (warpT >= 1) {
        if (returnAfterWarp) finishWarpIn();
        else finishWarpOut();
      }
    } else if (camMode === "deep" && deepScene) {
      if (!dragging) baz += dt * 0.04;
      camera.position.set(
        Math.sin(baz) * Math.cos(bel) * bdist,
        Math.sin(bel) * bdist,
        Math.cos(baz) * Math.cos(bel) * bdist,
      );
      lookAt.lerp(tmpV.set(0, 0, 0), 0.2);
    }
    camera.lookAt(lookAt);

    // Hover raycast (every 4th frame, system mode only)
    if (frame % 4 === 0 && (camMode === "overview" || camMode === "orbit") && !dragging && hoverSink) {
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(pickMeshes, false);
      const id = hits.length > 0 ? ((hits[0].object.userData.bodyId as string) ?? null) : null;
      if (id !== hoverId) {
        hoverId = id;
        hoverSink(id);
        canvas.style.cursor = dragging ? "grabbing" : id ? "pointer" : "grab";
      }
    }

    // Labels (every 2nd frame, system mode only)
    if (labelSink && frame % 2 === 0) {
      const labels: LabelInfo[] = [];
      const systemVisible = systemGroup.visible && camMode !== "warp-out" && camMode !== "warp-in";
      if (systemVisible) {
        const camDistToSun = camera.position.length();
        for (const [id, b] of bodies) {
          const wp = b.mesh.getWorldPosition(tmpV);
          if (b.isMoon) {
            const near = focusId === id || focusId === b.parentId || camera.position.distanceTo(wp) < 30;
            if (!near) {
              labels.push({ id, x: 0, y: 0, show: false, focused: false });
              continue;
            }
          }
          const proj = tmpV2.copy(wp).project(camera);
          const behind = proj.z > 1;
          const onScreen = proj.x > -1.05 && proj.x < 1.05 && proj.y > -1.05 && proj.y < 1.05;
          labels.push({
            id,
            x: (proj.x * 0.5 + 0.5) * window.innerWidth,
            y: (-proj.y * 0.5 + 0.5) * window.innerHeight,
            show: !behind && onScreen && camDistToSun < 620,
            focused: focusId === id,
          });
        }
      } else {
        for (const [id] of bodies) labels.push({ id, x: 0, y: 0, show: false, focused: false });
      }
      labelSink(labels);
    }

    if (clockSink && frame % 12 === 0) clockSink(simT / EARTH_YEAR_S);

    composer.render();
  };
  animate();

  // ── API ─────────────────────────────────────────────────────────────────
  return {
    focus(id) {
      if (camMode === "deep" || camMode === "warp-out" || camMode === "warp-in") return;
      if (id === null) {
        focusId = null;
        camMode = "overview";
        return;
      }
      if (!bodies.has(id)) return;
      startTravel(id);
    },
    warp(type, name) {
      if (camMode === "warp-out" || camMode === "warp-in") return;
      beginWarp(type, name);
    },
    returnToSystem() {
      if (camMode !== "deep") return;
      beginReturn();
    },
    getMode() {
      if (camMode === "deep") return "deep";
      if (camMode === "warp-out" || camMode === "warp-in") return "warping";
      return "system";
    },
    getFocus() {
      return focusId;
    },
    setTimeScale(s) {
      timeScale = Math.max(0, Math.min(64, s));
    },
    getTimeScale() {
      return timeScale;
    },
    onLabels(cb) {
      labelSink = cb;
    },
    onPick(cb) {
      pickSink = cb;
    },
    onHover(cb) {
      hoverSink = cb;
    },
    onMode(cb) {
      modeSink = cb;
    },
    onClock(cb) {
      clockSink = cb;
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      composer.dispose();
      renderer.dispose();
      deepBag.disposeAll();
      bag.disposeAll();
    },
  };
}

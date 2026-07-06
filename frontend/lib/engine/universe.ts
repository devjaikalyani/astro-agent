// The ASTRO universe engine: a navigable stylized solar system with
// cinematic camera flights, body picking, projected labels, and a warp
// transition into procedural deep-field scenes for anything beyond it.

import * as THREE from "three";
import {
  DisposalBag,
  buildMilkyWay,
  buildStarShell,
  easeInOut,
  makeBloom,
  makeRenderer,
  radialSprite,
} from "./core";
import { ATMO_FRAG, BODY_VERT } from "./shaders";
import { DeepScene, DeepType, buildDeepScene } from "./deep";
import { PLANETS, SUN, orbitRadius, phase0 } from "../universe-data";

const EARTH_YEAR_S = 240; // seconds of real time per Earth year
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
  onLabels(cb: (labels: LabelInfo[]) => void): void;
  onPick(cb: (id: string) => void): void;
  onHover(cb: (id: string | null) => void): void;
  onMode(cb: (mode: UniverseMode, deepName?: string) => void): void;
  dispose(): void;
}

interface BodyEntry {
  id: string;
  mesh: THREE.Mesh;
  radius: number;
  parentId?: string;
  isMoon: boolean;
}

export function createUniverse(canvas: HTMLCanvasElement): Universe {
  const bag = new DisposalBag();
  const deepBag = new DisposalBag();
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
  const loader = new THREE.TextureLoader();

  // ── Sky ─────────────────────────────────────────────────────────────────
  buildStarShell(scene, bag, 9000, 1200, 2200, 1.6, 0.75);
  buildStarShell(scene, bag, 3500, 700, 1100, 1.0, 0.85);
  const milky = buildMilkyWay(scene, bag);

  const sprite = bag.add(radialSprite("rgba(255,255,255,0.95)", "rgba(255,255,255,0)"));

  // ── Lights ──────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x223044, 0.55));
  const sunLight = new THREE.PointLight(0xfff2dc, 2.8, 0, 0);
  scene.add(sunLight); // at origin — the Sun itself

  const deepLightDir = new THREE.Vector3(-0.55, 0.4, 0.75).normalize();
  const deepKey = new THREE.PointLight(0xfff2dc, 2.6, 0, 0);
  deepKey.position.copy(deepLightDir.clone().multiplyScalar(40));
  deepKey.visible = false;
  scene.add(deepKey);

  // ── System group ────────────────────────────────────────────────────────
  const systemGroup = new THREE.Group();
  scene.add(systemGroup);
  const deepGroup = new THREE.Group();
  deepGroup.visible = false;
  scene.add(deepGroup);

  const bodies = new Map<string, BodyEntry>();
  const pickMeshes: THREE.Mesh[] = [];
  const planetPivots: Array<{
    group: THREE.Group;
    aR: number;
    w: number;
    ph: number;
    spin: THREE.Mesh;
    clouds?: THREE.Mesh;
    moons: Array<{ group: THREE.Group; orbitR: number; w: number; ph: number; spin: THREE.Mesh }>;
  }> = [];

  const tex = (url: string) => {
    const t = bag.add(loader.load(url));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };

  // Sun
  {
    const sunMat = bag.add(new THREE.MeshBasicMaterial({ map: tex(SUN.texture) }));
    const sunMesh = new THREE.Mesh(bag.add(new THREE.SphereGeometry(SUN.radius, 96, 96)), sunMat);
    sunMesh.userData.bodyId = "sun";
    systemGroup.add(sunMesh);
    bodies.set("sun", { id: "sun", mesh: sunMesh, radius: SUN.radius, isMoon: false });
    pickMeshes.push(sunMesh);

    const coronaMat = bag.add(
      new THREE.SpriteMaterial({ map: sprite, color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }),
    );
    const corona = new THREE.Sprite(coronaMat);
    corona.scale.setScalar(SUN.radius * 4.6);
    systemGroup.add(corona);
  }

  // Orbit line helper
  const orbitLine = (r: number, color = 0xffb454, opacity = 0.1) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const geo = bag.add(new THREE.BufferGeometry().setFromPoints(pts));
    const mat = bag.add(new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    return new THREE.Line(geo, mat);
  };

  // Planets
  for (const p of PLANETS) {
    const aR = orbitRadius(p.aAU);
    systemGroup.add(orbitLine(aR));

    const pivot = new THREE.Group();
    systemGroup.add(pivot);

    const mat = bag.add(new THREE.MeshStandardMaterial({ map: tex(p.texture), roughness: 1, metalness: 0 }));
    const mesh = new THREE.Mesh(bag.add(new THREE.SphereGeometry(p.radius, 72, 72)), mat);
    mesh.rotation.z = THREE.MathUtils.degToRad(p.tiltDeg > 90 ? 180 - p.tiltDeg : p.tiltDeg) * 0.6;
    mesh.userData.bodyId = p.id;
    pivot.add(mesh);
    bodies.set(p.id, { id: p.id, mesh, radius: p.radius, isMoon: false });
    pickMeshes.push(mesh);

    let clouds: THREE.Mesh | undefined;
    if (p.clouds) {
      const cmap = tex(p.clouds);
      const cmat = bag.add(new THREE.MeshStandardMaterial({ map: cmap, alphaMap: cmap, transparent: true, depthWrite: false }));
      clouds = new THREE.Mesh(bag.add(new THREE.SphereGeometry(p.radius * 1.015, 48, 48)), cmat);
      pivot.add(clouds);
    }

    if (p.atmosphere !== undefined) {
      const amat = bag.add(
        new THREE.ShaderMaterial({
          uniforms: { uAtmo: { value: new THREE.Color(p.atmosphere) }, uLightDir: { value: new THREE.Vector3(1, 0, 0) } },
          vertexShader: BODY_VERT,
          fragmentShader: ATMO_FRAG,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      // Light comes from the Sun at origin: update per-frame via onBeforeRender
      const shell = new THREE.Mesh(bag.add(new THREE.SphereGeometry(p.radius * 1.05, 48, 48)), amat);
      shell.onBeforeRender = () => {
        const wp = new THREE.Vector3();
        shell.getWorldPosition(wp);
        (amat.uniforms.uLightDir.value as THREE.Vector3).copy(wp.multiplyScalar(-1).normalize());
      };
      pivot.add(shell);
    }

    if (p.ring) {
      if (p.id === "saturn") {
        const ringTex = tex("/textures/saturn_ring.png");
        const rgeo = bag.add(new THREE.RingGeometry(p.radius * 1.35, p.radius * 2.35, 128, 1));
        // Remap UVs so the ring texture strip runs across the radius
        const uv = rgeo.attributes.uv as THREE.BufferAttribute;
        const posAttr = rgeo.attributes.position as THREE.BufferAttribute;
        const v = new THREE.Vector3();
        for (let i = 0; i < uv.count; i++) {
          v.fromBufferAttribute(posAttr, i);
          const f = (v.length() - p.radius * 1.35) / (p.radius * 1.0);
          uv.setXY(i, f, 0.5);
        }
        const rmat = bag.add(
          new THREE.MeshBasicMaterial({ map: ringTex, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
        );
        const ring = new THREE.Mesh(rgeo, rmat);
        ring.rotation.x = Math.PI / 2 - THREE.MathUtils.degToRad(12);
        pivot.add(ring);
      } else {
        const rgeo = bag.add(new THREE.RingGeometry(p.radius * 1.5, p.radius * 1.9, 96, 1));
        const rmat = bag.add(
          new THREE.MeshBasicMaterial({ color: 0x9fb8c8, side: THREE.DoubleSide, transparent: true, opacity: 0.18, depthWrite: false }),
        );
        const ring = new THREE.Mesh(rgeo, rmat);
        ring.rotation.x = THREE.MathUtils.degToRad(8); // Uranus rolls on its side
        pivot.add(ring);
      }
    }

    const moons: (typeof planetPivots)[number]["moons"] = [];
    for (const m of p.moons ?? []) {
      const mg = new THREE.Group();
      pivot.add(mg);
      const mmat = m.texture
        ? bag.add(new THREE.MeshStandardMaterial({ map: tex(m.texture), roughness: 1, metalness: 0 }))
        : bag.add(new THREE.MeshStandardMaterial({ color: m.color, roughness: 1, metalness: 0 }));
      const mmesh = new THREE.Mesh(bag.add(new THREE.SphereGeometry(m.radius, 40, 40)), mmat);
      mmesh.userData.bodyId = m.id;
      mg.add(mmesh);
      bodies.set(m.id, { id: m.id, mesh: mmesh, radius: m.radius, parentId: p.id, isMoon: true });
      pickMeshes.push(mmesh);
      moons.push({ group: mg, orbitR: m.orbitR, w: (Math.PI * 2) / m.periodDays, ph: phase0(m.id), spin: mmesh });
    }

    planetPivots.push({
      group: pivot,
      aR,
      w: (Math.PI * 2) / p.periodYears,
      ph: phase0(p.id),
      spin: mesh,
      clouds,
      moons,
    });
  }

  // Asteroid belt
  {
    const count = 3600;
    const rIn = orbitRadius(2.1),
      rOut = orbitRadius(3.3);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = rIn + Math.random() * (rOut - rIn);
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 1.6;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = bag.add(
      new THREE.PointsMaterial({ color: 0x8a7a64, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    const belt = new THREE.Points(geo, mat);
    systemGroup.add(belt);
  }

  // ── Post ────────────────────────────────────────────────────────────────
  const { composer, bloom } = makeBloom(renderer, scene, camera, { strength: 0.5, threshold: 0.68 });
  const SYSTEM_BLOOM = { strength: 0.5, threshold: 0.68 };

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
    // Pick
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
      dist = Math.max(40, Math.min(420, dist + e.deltaY * 0.12));
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
    travelDir.y = Math.max(travelDir.y, 0.18);
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
    // Build the deep scene and swap
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

  const animate = () => {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    frame++;

    // Orbital motion (real period ratios, compressed time).
    // Planet w is 2pi/periodYears; moon w is 2pi/periodDays.
    const years = t / EARTH_YEAR_S;
    const days = t * DAYS_PER_SEC;
    for (const pp of planetPivots) {
      const a = pp.ph + pp.w * years;
      pp.group.position.set(Math.cos(a) * pp.aR, 0, Math.sin(a) * pp.aR);
      pp.spin.rotation.y += dt * 0.25;
      if (pp.clouds) pp.clouds.rotation.y += dt * 0.3;
      for (const m of pp.moons) {
        const angM = m.ph + m.w * days;
        m.group.position.set(Math.cos(angM) * m.orbitR, 0, Math.sin(angM) * m.orbitR);
        m.spin.rotation.y += dt * 0.4;
      }
    }
    milky.rotation.y += dt * 0.0008;

    // Deep scene animation
    if (deepScene && deepGroup.visible) deepScene.update(t);

    // Camera
    if (camMode === "overview") {
      az += dt * 0.008; // slow idle drift
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
        // Derive spherical from arrival vector
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
          // Moons only when close to their parent or focused
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
            show: !behind && onScreen && camDistToSun < 500,
            focused: focusId === id,
          });
        }
      } else {
        for (const [id] of bodies) labels.push({ id, x: 0, y: 0, show: false, focused: false });
      }
      labelSink(labels);
    }

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

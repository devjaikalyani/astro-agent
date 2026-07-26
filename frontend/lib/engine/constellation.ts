// The Observatory constellation: every fact the agent has learned is a
// living star — twinkling, deterministically placed, clustered by data
// source under a soft nebula haze. Supports hover, click-to-pin, source
// filtering, and a chronological replay of the sky being born.

import * as THREE from "three";
import { DisposalBag, buildSkySphere, buildStarShell, makeBloom, makeRenderer, radialSprite } from "./core";
import { KnowledgeStar } from "../api";

const SCALE = 42;

export const SOURCE_KEYS: Array<{ key: string; re: RegExp; color: number; label: string }> = [
  { key: "simbad", re: /simbad/i, color: 0x9fd8ff, label: "SIMBAD" },
  { key: "jpl", re: /jpl|horizons/i, color: 0xffb454, label: "JPL HORIZONS" },
  { key: "exoplanet", re: /exoplanet/i, color: 0xc9a0ff, label: "EXOPLANET ARCHIVE" },
  { key: "ads", re: /ads|paper|research/i, color: 0xff8fb8, label: "NASA ADS" },
  { key: "mpc", re: /mpc|minor/i, color: 0x8fe0c0, label: "MPC" },
];

export function sourceKeyFor(source: string): string {
  for (const s of SOURCE_KEYS) if (s.re.test(source)) return s.key;
  return "agent";
}

export function sourceColorFor(source: string): THREE.Color {
  for (const s of SOURCE_KEYS) if (s.re.test(source)) return new THREE.Color(s.color);
  return new THREE.Color(0xf0eadf);
}

const STAR_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  attribute float aBorn;
  attribute float aDim;
  uniform float uTime;
  uniform float uReplayT;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    float twinkle = 0.76 + 0.24 * sin(uTime * (1.1 + aPhase * 1.3) + aPhase * 6.2831);
    float appear = smoothstep(aBorn, aBorn + 0.025, uReplayT);
    float young = 1.0 - smoothstep(aBorn, aBorn + 0.09, uReplayT);
    vAlpha = appear * aDim;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float size = aSize * twinkle * (1.0 + young * 2.2);
    gl_PointSize = size * (340.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG_PT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float a = smoothstep(0.5, 0.1, d);
    float core = smoothstep(0.18, 0.0, d) * 0.7;
    gl_FragColor = vec4(vColor + core, a * vAlpha);
    if (gl_FragColor.a < 0.01) discard;
  }
`;

function ringSprite(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "rgba(255,214,150,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(64, 64, 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,214,150,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export interface Constellation {
  onHover(cb: (star: KnowledgeStar | null, x: number, y: number) => void): void;
  onSelect(cb: (star: KnowledgeStar | null) => void): void;
  onReplay(cb: (progress: number) => void): void;
  setFilter(sourceKey: string | null): void;
  selectById(id: number): void;
  replay(): void;
  dispose(): void;
}

export function createConstellation(canvas: HTMLCanvasElement, stars: KnowledgeStar[]): Constellation {
  const bag = new DisposalBag();
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
  const loader = new THREE.TextureLoader();
  const sprite = bag.add(radialSprite("rgba(255,255,255,0.95)", "rgba(255,255,255,0)"));

  buildSkySphere(scene, bag, loader, 2400, 0.3);
  buildStarShell(scene, bag, 5000, 700, 1400, 1.6, 0.55, 0.55, sprite);

  const group = new THREE.Group();
  scene.add(group);

  const positions: THREE.Vector3[] = stars.map(
    (s) => new THREE.Vector3(s.pos[0] * SCALE, s.pos[1] * SCALE, s.pos[2] * SCALE),
  );

  // Chronological order for replay (created_at ascending, id as tiebreak)
  const order = stars
    .map((s, i) => ({ i, k: `${s.created_at}-${String(s.id).padStart(9, "0")}` }))
    .sort((a, b) => (a.k < b.k ? -1 : 1));
  const bornOf = new Float32Array(stars.length);
  order.forEach((o, rank) => {
    bornOf[o.i] = stars.length > 1 ? 0.03 + (rank / (stars.length - 1)) * 0.93 : 0.03;
  });

  // ── Fact stars: custom twinkle shader ───────────────────────────────────
  const starUniforms = { uTime: { value: 0 }, uReplayT: { value: 1 } };
  const dimAttr = new THREE.BufferAttribute(new Float32Array(stars.length).fill(1), 1);
  let pointsObj: THREE.Points | undefined;
  if (stars.length > 0) {
    const pos = new Float32Array(stars.length * 3);
    const col = new Float32Array(stars.length * 3);
    const size = new Float32Array(stars.length);
    const phase = new Float32Array(stars.length);
    stars.forEach((s, i) => {
      pos[i * 3] = positions[i].x;
      pos[i * 3 + 1] = positions[i].y;
      pos[i * 3 + 2] = positions[i].z;
      const c = sourceColorFor(s.source).multiplyScalar(0.75 + s.confidence * 0.45);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      size[i] = 2.2 + s.confidence * 1.8 + Math.min(s.access_count, 6) * 0.16;
      phase[i] = Math.random();
    });
    const geo = bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    geo.setAttribute("aBorn", new THREE.BufferAttribute(bornOf, 1));
    geo.setAttribute("aDim", dimAttr);
    const mat = bag.add(
      new THREE.ShaderMaterial({
        uniforms: starUniforms,
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG_PT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    pointsObj = new THREE.Points(geo, mat);
    group.add(pointsObj);
  }

  // ── Nebula haze around each source cluster ──────────────────────────────
  {
    const clusters = new Map<string, { c: THREE.Vector3; n: number; color: THREE.Color; spread: number }>();
    stars.forEach((s, i) => {
      const k = sourceKeyFor(s.source);
      const e = clusters.get(k) ?? { c: new THREE.Vector3(), n: 0, color: sourceColorFor(s.source), spread: 0 };
      e.c.add(positions[i]);
      e.n++;
      clusters.set(k, e);
    });
    for (const [k, e] of clusters) {
      if (e.n < 3) continue; // sparse clusters get no haze — avoids giant blobs
      e.c.divideScalar(e.n);
      let sp = 0;
      stars.forEach((s, i) => {
        if (sourceKeyFor(s.source) === k) sp = Math.max(sp, e.c.distanceTo(positions[i]));
      });
      e.spread = Math.min(Math.max(sp * 0.6, 6), 16);
      const layers = Math.min(2 + Math.ceil(e.n / 5), 4);
      for (let l = 0; l < layers; l++) {
        const m = bag.add(
          new THREE.SpriteMaterial({
            map: sprite,
            color: e.color,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.03 + Math.random() * 0.02,
          }),
        );
        const h = new THREE.Sprite(m);
        h.position.copy(e.c).add(new THREE.Vector3((Math.random() - 0.5) * e.spread, (Math.random() - 0.5) * e.spread, (Math.random() - 0.5) * e.spread));
        h.scale.setScalar(e.spread * (1.1 + Math.random() * 0.6));
        group.add(h);
      }
    }
  }

  // ── Constellation lines: nearest same-source kin ────────────────────────
  let lines: THREE.LineSegments | undefined;
  {
    const linePts: number[] = [];
    for (let i = 0; i < stars.length; i++) {
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < stars.length; j++) {
        if (i === j || stars[i].source !== stars[j].source) continue;
        const d = positions[i].distanceToSquared(positions[j]);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (best >= 0 && bestD < (SCALE * 0.9) ** 2) {
        linePts.push(
          positions[i].x, positions[i].y, positions[i].z,
          positions[best].x, positions[best].y, positions[best].z,
        );
      }
    }
    if (linePts.length > 0) {
      const geo = bag.add(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(linePts), 3));
      const mat = bag.add(
        new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.12 }),
      );
      lines = new THREE.LineSegments(geo, mat);
      group.add(lines);
    }
  }

  // ── Selection marker ────────────────────────────────────────────────────
  const markerMat = bag.add(
    new THREE.SpriteMaterial({ map: bag.add(ringSprite()), transparent: true, depthWrite: false, opacity: 0 }),
  );
  const marker = new THREE.Sprite(markerMat);
  marker.scale.setScalar(4.2);
  group.add(marker);
  let selectedIdx = -1;

  const { composer, bloom, finish } = makeBloom(renderer, scene, camera, { strength: 0.75, threshold: 0.35 });

  // ── Orbit + hover + select ──────────────────────────────────────────────
  let az = 0.5,
    el = 0.2,
    dist = 105;
  let dragging = false,
    movedPx = 0,
    lastX = 0,
    lastY = 0;
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 2.2 };
  const ndc = new THREE.Vector2(2, 2);
  let hoverCb: ((s: KnowledgeStar | null, x: number, y: number) => void) | null = null;
  let selectCb: ((s: KnowledgeStar | null) => void) | null = null;
  let replayCb: ((p: number) => void) | null = null;
  let hoverIdx = -1;
  let mouseX = 0,
    mouseY = 0;

  const lookTarget = new THREE.Vector3(0, 0, 0);
  const lookGoal = new THREE.Vector3(0, 0, 0);

  const applySelect = (idx: number) => {
    selectedIdx = idx;
    if (idx >= 0) {
      marker.position.copy(positions[idx]);
      markerMat.opacity = 0.95;
      lookGoal.copy(positions[idx]).multiplyScalar(0.55);
      selectCb?.(stars[idx]);
    } else {
      markerMat.opacity = 0;
      lookGoal.set(0, 0, 0);
      selectCb?.(null);
    }
  };

  const onDown = (e: PointerEvent) => {
    dragging = true;
    movedPx = 0;
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onMove = (e: PointerEvent) => {
    if (dragging) {
      movedPx += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
      az -= (e.clientX - lastX) * 0.004;
      el = Math.max(-1.3, Math.min(1.3, el + (e.clientY - lastY) * 0.004));
      lastX = e.clientX;
      lastY = e.clientY;
    }
    mouseX = e.clientX;
    mouseY = e.clientY;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  };
  const onUp = () => {
    const wasDrag = movedPx > 6;
    dragging = false;
    if (wasDrag || !pointsObj || stars.length === 0) return;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(pointsObj, false);
    const idx = hits.length > 0 && hits[0].index !== undefined ? hits[0].index : -1;
    applySelect(idx === selectedIdx ? -1 : idx);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    dist = Math.max(45, Math.min(220, dist + e.deltaY * 0.08));
  };

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

  // ── Replay state ────────────────────────────────────────────────────────
  let replayStart = -1;
  const REPLAY_S = 9;

  let raf = 0;
  let frame = 0;
  const clock = new THREE.Clock();
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    frame++;
    if (!dragging) az += dt * 0.03;
    group.rotation.y += dt * 0.004;
    camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    lookTarget.lerp(lookGoal, 0.06);
    camera.lookAt(lookTarget);

    starUniforms.uTime.value = t;
    if (replayStart >= 0) {
      const p = Math.min(1, (t - replayStart) / REPLAY_S);
      starUniforms.uReplayT.value = p;
      if (lines) lines.visible = p >= 1;
      replayCb?.(p);
      if (p >= 1) replayStart = -1;
    }
    markerMat.opacity = selectedIdx >= 0 ? 0.7 + Math.sin(t * 3) * 0.25 : 0;
    if (selectedIdx >= 0) marker.scale.setScalar(4.2 + Math.sin(t * 3) * 0.4);

    if (frame % 4 === 0 && pointsObj && hoverCb && stars.length > 0 && !dragging) {
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(pointsObj, false);
      const idx = hits.length > 0 && hits[0].index !== undefined ? hits[0].index : -1;
      if (idx !== hoverIdx) {
        hoverIdx = idx;
        hoverCb(idx >= 0 ? stars[idx] : null, mouseX, mouseY);
        canvas.style.cursor = idx >= 0 ? "pointer" : "grab";
      }
    }

    if (finish) finish.uniforms.uTime.value = t;
    composer.render();
  };
  animate();

  return {
    onHover(cb) {
      hoverCb = cb;
    },
    onSelect(cb) {
      selectCb = cb;
    },
    onReplay(cb) {
      replayCb = cb;
    },
    setFilter(sourceKey) {
      const arr = dimAttr.array as Float32Array;
      stars.forEach((s, i) => {
        arr[i] = sourceKey === null || sourceKeyFor(s.source) === sourceKey ? 1 : 0.1;
      });
      dimAttr.needsUpdate = true;
      if (lines) (lines.material as THREE.LineBasicMaterial).opacity = sourceKey === null ? 0.12 : 0.04;
    },
    selectById(id) {
      if (id < 0) {
        applySelect(-1);
        return;
      }
      const idx = stars.findIndex((s) => s.id === id);
      if (idx >= 0) applySelect(idx);
    },
    replay() {
      if (stars.length === 0) return;
      replayStart = clock.elapsedTime;
      starUniforms.uReplayT.value = 0;
      if (lines) lines.visible = false;
      applySelect(-1);
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
      bag.disposeAll();
    },
  };
}

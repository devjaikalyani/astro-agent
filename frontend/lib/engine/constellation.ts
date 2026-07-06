// The Observatory constellation: every fact the agent has learned is a
// star, deterministically placed, clustered by data source, connected to
// its nearest kin. The sky is stable between visits and only ever grows.

import * as THREE from "three";
import { DisposalBag, buildStarShell, makeBloom, makeRenderer, radialSprite } from "./core";
import { KnowledgeStar } from "../api";

const SCALE = 42;

const SOURCE_COLORS: Array<[RegExp, number]> = [
  [/simbad/i, 0x9fd8ff],
  [/jpl|horizons/i, 0xffb454],
  [/exoplanet/i, 0xc9a0ff],
  [/ads|paper|research/i, 0xff8fb8],
  [/mpc|minor/i, 0x8fe0c0],
];

function colorFor(source: string): THREE.Color {
  for (const [re, c] of SOURCE_COLORS) if (re.test(source)) return new THREE.Color(c);
  return new THREE.Color(0xf0eadf);
}

export interface Constellation {
  onHover(cb: (star: KnowledgeStar | null, x: number, y: number) => void): void;
  dispose(): void;
}

export function createConstellation(canvas: HTMLCanvasElement, stars: KnowledgeStar[]): Constellation {
  const bag = new DisposalBag();
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);

  buildStarShell(scene, bag, 5000, 700, 1400, 1.1, 0.5, 0.55);

  const group = new THREE.Group();
  scene.add(group);

  const sprite = bag.add(radialSprite("rgba(255,255,255,0.95)", "rgba(255,255,255,0)"));

  // Fact stars
  const positions: THREE.Vector3[] = stars.map(
    (s) => new THREE.Vector3(s.pos[0] * SCALE, s.pos[1] * SCALE, s.pos[2] * SCALE),
  );
  {
    const pos = new Float32Array(stars.length * 3);
    const col = new Float32Array(stars.length * 3);
    stars.forEach((s, i) => {
      pos[i * 3] = positions[i].x;
      pos[i * 3 + 1] = positions[i].y;
      pos[i * 3 + 2] = positions[i].z;
      const c = colorFor(s.source).multiplyScalar(0.7 + s.confidence * 0.5);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    });
    const geo = bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = bag.add(
      new THREE.PointsMaterial({
        map: sprite,
        size: 2.6,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    group.add(new THREE.Points(geo, mat));
  }

  // Constellation lines: each star to its nearest same-source neighbor
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
        new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.14 }),
      );
      group.add(new THREE.LineSegments(geo, mat));
    }
  }

  const { composer, bloom } = makeBloom(renderer, scene, camera, { strength: 0.75, threshold: 0.35 });

  // Orbit + hover
  let az = 0.5,
    el = 0.2,
    dist = 105;
  let dragging = false,
    lastX = 0,
    lastY = 0;
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 2.2 };
  const ndc = new THREE.Vector2(2, 2);
  let hoverCb: ((s: KnowledgeStar | null, x: number, y: number) => void) | null = null;
  let hoverIdx = -1;
  let mouseX = 0,
    mouseY = 0;

  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onMove = (e: PointerEvent) => {
    if (dragging) {
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
    dragging = false;
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

  const pointsObj = group.children.find((c) => c instanceof THREE.Points) as THREE.Points | undefined;

  let raf = 0;
  let frame = 0;
  const clock = new THREE.Clock();
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    frame++;
    if (!dragging) az += dt * 0.03;
    group.rotation.y += dt * 0.004;
    camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(0, 0, 0);

    if (frame % 4 === 0 && pointsObj && hoverCb && stars.length > 0) {
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(pointsObj, false);
      const idx = hits.length > 0 && hits[0].index !== undefined ? hits[0].index : -1;
      if (idx !== hoverIdx) {
        hoverIdx = idx;
        hoverCb(idx >= 0 ? stars[idx] : null, mouseX, mouseY);
        canvas.style.cursor = idx >= 0 ? "pointer" : "grab";
      }
    }

    composer.render();
  };
  animate();

  return {
    onHover(cb) {
      hoverCb = cb;
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

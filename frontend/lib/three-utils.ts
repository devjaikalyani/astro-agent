// Reusable Three.js building blocks shared by every ASTRO scene:
// renderer + ACES tone mapping, an UnrealBloom composer, parallax starfields,
// spectral star colours, and a disposal bag so each scene cleans up fully.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// Spectral class RGB: O (blue-white) -> M (red).
const SPECTRAL: [number, number, number][] = [
  [0.72, 0.82, 1.0],
  [0.83, 0.9, 1.0],
  [1.0, 1.0, 1.0],
  [1.0, 0.97, 0.88],
  [1.0, 0.92, 0.7],
  [1.0, 0.78, 0.5],
  [1.0, 0.54, 0.34],
];

export function spectralRGB(dim = 1): [number, number, number] {
  const r = Math.random();
  let cls: number;
  if (r < 0.04) cls = 0;
  else if (r < 0.14) cls = 1;
  else if (r < 0.32) cls = 2;
  else if (r < 0.52) cls = 3;
  else if (r < 0.72) cls = 4;
  else if (r < 0.88) cls = 5;
  else cls = 6;
  const v = dim * (0.75 + Math.random() * 0.25);
  return [SPECTRAL[cls][0] * v, SPECTRAL[cls][1] * v, SPECTRAL[cls][2] * v];
}

/** Tracks every disposable resource a scene creates so teardown is one call. */
export class DisposalBag {
  private items: Array<{ dispose: () => void }> = [];
  add<T extends { dispose: () => void }>(item: T): T {
    this.items.push(item);
    return item;
  }
  disposeAll() {
    for (const it of this.items) {
      try {
        it.dispose();
      } catch {
        /* ignore */
      }
    }
    this.items = [];
  }
}

export function makeRenderer(canvas: HTMLCanvasElement, clear = 0x00010a): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(clear, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  return renderer;
}

export function makeBloomComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opts: { strength?: number; radius?: number; threshold?: number } = {},
): { composer: EffectComposer; bloom: UnrealBloomPass } {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    opts.strength ?? 0.62,
    opts.radius ?? 0.7,
    opts.threshold ?? 0.62,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return { composer, bloom };
}

/** A spherical shell of spectral-coloured stars used for parallax depth. */
export function buildStarfield(
  scene: THREE.Scene,
  bag: DisposalBag,
  count: number,
  rMin: number,
  rMax: number,
  size: number,
  opacity: number,
  dim: number,
): THREE.Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rMin + Math.random() * (rMax - rMin);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
    const [cr, cg, cb] = spectralRGB(dim);
    col[i * 3] = cr;
    col[i * 3 + 1] = cg;
    col[i * 3 + 2] = cb;
  }
  const geo = bag.add(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = bag.add(
    new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true, transparent: true, opacity, depthWrite: false }),
  );
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
}

/** Soft radial sprite texture for glows, coronae, and particle clouds. */
export function radialSprite(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)"): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

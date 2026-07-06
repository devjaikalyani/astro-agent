// Core Three.js building blocks: renderer, bloom composer, disposal bag,
// starfields, Milky Way band, soft sprites, CPU noise.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** Tracks every disposable resource a scene creates. */
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

export function makeRenderer(canvas: HTMLCanvasElement, clear = 0x04050a): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(clear, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  return renderer;
}

export function makeBloom(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opts: { strength?: number; radius?: number; threshold?: number } = {},
) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    opts.strength ?? 0.55,
    opts.radius ?? 0.7,
    opts.threshold ?? 0.62,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return { composer, bloom };
}

// Spectral class RGB: O (blue-white) -> M (red), weighted like a real sky.
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

/** Spherical shell of spectral-colored stars for parallax depth. */
export function buildStarShell(
  parent: THREE.Object3D,
  bag: DisposalBag,
  count: number,
  rMin: number,
  rMax: number,
  size: number,
  opacity: number,
  dim = 0.85,
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
    new THREE.PointsMaterial({
      size,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
  const pts = new THREE.Points(geo, mat);
  parent.add(pts);
  return pts;
}

/** Tilted great-circle band of warm stars — the Milky Way. */
export function buildMilkyWay(parent: THREE.Object3D, bag: DisposalBag, count = 12000): THREE.Points {
  const alpha = 0.9;
  const ny = -Math.cos(alpha);
  const nz = Math.sin(alpha);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const px = Math.cos(a);
    const py = Math.sin(a) * Math.sin(alpha);
    const pz = Math.sin(a) * Math.cos(alpha);
    const s = (Math.random() + Math.random() - 1) * 0.3;
    let dx = px,
      dy = py + s * ny,
      dz = pz + s * nz;
    const len = Math.hypot(dx, dy, dz);
    dx /= len;
    dy /= len;
    dz /= len;
    const r = 1500 + Math.random() * 500;
    pos[i * 3] = r * dx;
    pos[i * 3 + 1] = r * dy;
    pos[i * 3 + 2] = r * dz;
    const w = 0.7 + Math.random() * 0.3;
    const b = 0.55 + (1 - Math.abs(s) / 0.3) * 0.45;
    col[i * 3] = w * b;
    col[i * 3 + 1] = w * 0.92 * b;
    col[i * 3 + 2] = w * 0.78 * b;
  }
  const geo = bag.add(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = bag.add(
    new THREE.PointsMaterial({
      size: 1.1,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  const pts = new THREE.Points(geo, mat);
  parent.add(pts);
  return pts;
}

/** Soft radial sprite texture for glows, coronae, particle clouds. */
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

// ── CPU value-noise (mesh displacement, particle gating) ────────────────────
const fract = (x: number) => x - Math.floor(x);
function h3(x: number, y: number, z: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
}
export function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const xf = x - xi,
    yf = y - yi,
    zf = z - zi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf),
    w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c000 = h3(xi, yi, zi),
    c100 = h3(xi + 1, yi, zi),
    c010 = h3(xi, yi + 1, zi),
    c110 = h3(xi + 1, yi + 1, zi);
  const c001 = h3(xi, yi, zi + 1),
    c101 = h3(xi + 1, yi, zi + 1),
    c011 = h3(xi, yi + 1, zi + 1),
    c111 = h3(xi + 1, yi + 1, zi + 1);
  const x00 = lerp(c000, c100, u),
    x10 = lerp(c010, c110, u),
    x01 = lerp(c001, c101, u),
    x11 = lerp(c011, c111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
export function fbm3(x: number, y: number, z: number): number {
  let f = 0,
    a = 0.5,
    fr = 1;
  for (let i = 0; i < 5; i++) {
    f += a * vnoise(x * fr, y * fr, z * fr);
    fr *= 2.0;
    a *= 0.5;
  }
  return f;
}
export const gauss = () => Math.random() + Math.random() + Math.random() - 1.5;
export function smoothstep01(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

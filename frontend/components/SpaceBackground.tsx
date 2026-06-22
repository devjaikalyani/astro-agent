"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ObjectType, OBJECT_COLORS } from "@/lib/types";

interface SpaceBackgroundProps {
  objectType: ObjectType;
  hasContent: boolean;
}

// Spectral class RGB values: O (blue-white) → M (red)
const SPECTRAL: [number, number, number][] = [
  [0.72, 0.82, 1.00], // O
  [0.83, 0.90, 1.00], // B
  [1.00, 1.00, 1.00], // A
  [1.00, 0.97, 0.88], // F
  [1.00, 0.92, 0.70], // G (Sun)
  [1.00, 0.78, 0.50], // K
  [1.00, 0.54, 0.34], // M
];

function randStarRGB(dim = 1): [number, number, number] {
  const r = Math.random();
  let cls: number;
  if      (r < 0.04) cls = 0;
  else if (r < 0.14) cls = 1;
  else if (r < 0.32) cls = 2;
  else if (r < 0.52) cls = 3;
  else if (r < 0.72) cls = 4;
  else if (r < 0.88) cls = 5;
  else               cls = 6;
  const v = dim * (0.75 + Math.random() * 0.25);
  return [SPECTRAL[cls][0] * v, SPECTRAL[cls][1] * v, SPECTRAL[cls][2] * v];
}

interface Layer { geo: THREE.BufferGeometry; mat: THREE.PointsMaterial; pts: THREE.Points }

function starLayer(count: number, rMin: number, rMax: number, size: number, opacity: number, dim: number, scene: THREE.Scene): Layer {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r     = rMin + Math.random() * (rMax - rMin);
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
    const [cr, cg, cb] = randStarRGB(dim);
    col[i * 3] = cr; col[i * 3 + 1] = cg; col[i * 3 + 2] = cb;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true, transparent: true, opacity });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return { geo, mat, pts };
}

function milkyWayLayer(count: number, scene: THREE.Scene): Layer {
  // Stars concentrated in a tilted great-circle band (galactic plane)
  const alpha = 0.88; // tilt in radians
  // Plane normal for this great circle: p=(cos t, sin t·sin α, sin t·cos α)
  // Normal = (0, -cos α, sin α), perpendicular to every p
  const ny = -Math.cos(alpha);
  const nz =  Math.sin(alpha);

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t  = Math.random() * Math.PI * 2;
    const px =  Math.cos(t);
    const py =  Math.sin(t) * Math.sin(alpha);
    const pz =  Math.sin(t) * Math.cos(alpha);
    // Tent distribution ≈ gaussian spread perpendicular to the band plane
    const s  = (Math.random() + Math.random() - 1) * 0.30;
    let dx = px, dy = py + s * ny, dz = pz + s * nz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= len; dy /= len; dz /= len;
    const r = 700 + Math.random() * 240;
    pos[i * 3] = r * dx; pos[i * 3 + 1] = r * dy; pos[i * 3 + 2] = r * dz;
    // Warm creamy tone, brighter toward band centre
    const w = 0.70 + Math.random() * 0.30;
    const b = 0.55 + (1 - Math.abs(s) / 0.30) * 0.45;
    col[i * 3] = w * b; col[i * 3 + 1] = w * 0.92 * b; col[i * 3 + 2] = w * 0.76 * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.50, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.60 });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return { geo, mat, pts };
}

function nebulaCloud(count: number, cx: number, cy: number, cz: number, radius: number, color: THREE.Color, opacity: number, scene: THREE.Scene): Layer {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = radius * Math.sqrt(Math.random()); // concentrated toward centre
    pos[i * 3]     = cx + r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = cy + r * Math.sin(phi) * Math.sin(theta) * 0.45;
    pos[i * 3 + 2] = cz + r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: 3.2, sizeAttenuation: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return { geo, mat, pts };
}

export default function SpaceBackground({ objectType, hasContent }: SpaceBackgroundProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const sphereRef    = useRef<THREE.Mesh | null>(null);
  const glowRef      = useRef<THREE.Mesh | null>(null);
  const ringRef      = useRef<THREE.Mesh | null>(null);
  const accretionRef = useRef<THREE.Mesh | null>(null);
  const hasContentRef = useRef(hasContent);

  useEffect(() => { hasContentRef.current = hasContent; }, [hasContent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x00010c, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.z = 22;
    camera.lookAt(0, 1.2, 0);

    // ── THREE STAR LAYERS (depth parallax) ───────────────────────────────────
    const L1 = starLayer(13000, 860, 1100, 0.44, 0.78, 0.80, scene); // deep background
    const L2 = starLayer(3800,  640, 860,  0.80, 0.86, 0.92, scene); // mid-field
    const L3 = starLayer(520,   480, 640,  1.55, 0.92, 1.00, scene); // bright foreground

    // ── MILKY WAY BAND ───────────────────────────────────────────────────────
    const MW = milkyWayLayer(13000, scene);

    // ── NEBULA CLOUDS (colours from real nebulae) ────────────────────────────
    const N1 = nebulaCloud(2200, -460,  180, -580, 260, new THREE.Color(0x1a3ecc), 0.130, scene); // Orion blue
    const N2 = nebulaCloud(1800,  380, -130, -680, 210, new THREE.Color(0x8822bb), 0.115, scene); // Crab purple
    const N3 = nebulaCloud(1600,  120,  420, -620, 190, new THREE.Color(0xcc2255), 0.100, scene); // Lagoon pink
    const N4 = nebulaCloud(1400, -280, -360, -700, 220, new THREE.Color(0x117799), 0.110, scene); // Eagle teal
    const N5 = nebulaCloud(1200,  580,  300, -500, 180, new THREE.Color(0x663399), 0.095, scene); // Pillars indigo

    // ── CENTRAL SPHERE ───────────────────────────────────────────────────────
    const disposeList: Array<{ dispose(): void }> = [];
    const hexColor = OBJECT_COLORS[objectType || "planet"] ?? OBJECT_COLORS.planet;
    const color    = new THREE.Color(hexColor);
    const sphereGeo = new THREE.SphereGeometry(1.8, 64, 64);
    let material: THREE.Material;
    if (objectType === "black_hole") {
      material = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.0, metalness: 1.0, emissive: new THREE.Color(0x330055), emissiveIntensity: 0.8 });
    } else if (objectType === "star") {
      material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.6, metalness: 0.0 });
    } else if (objectType === null) {
      // Idle / home page — push past bloom threshold so the sphere glows beautifully
      material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.75, roughness: 0.40, metalness: 0.18 });
    } else {
      material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.7, metalness: 0.1 });
    }
    disposeList.push(material);
    const sphere = new THREE.Mesh(sphereGeo, material);
    scene.add(sphere);
    sphereRef.current = sphere;

    // ── GLOW SHELL ───────────────────────────────────────────────────────────
    const glowGeo = new THREE.SphereGeometry(objectType === null ? 3.4 : 2.4, 32, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: objectType === "black_hole" ? new THREE.Color(0x660099) : color,
      transparent: true, opacity: objectType === "star" ? 0.18 : objectType === null ? 0.24 : 0.07,
      blending: THREE.AdditiveBlending, side: THREE.FrontSide, depthWrite: false,
    });
    disposeList.push(glowMat);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    scene.add(glow);
    glowRef.current = glow;

    // ── OPTIONAL FEATURES PER TYPE ───────────────────────────────────────────
    if (objectType === null) {
      // Idle — a tilted cosmic ring gives the home sphere a planetary elegance
      const idleRingGeo = new THREE.RingGeometry(2.8, 4.5, 80);
      const idleRingMat = new THREE.MeshBasicMaterial({
        color, side: THREE.DoubleSide, transparent: true, opacity: 0.15,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const idleRing = new THREE.Mesh(idleRingGeo, idleRingMat);
      idleRing.rotation.x = Math.PI / 3.2;
      scene.add(idleRing);
      disposeList.push(idleRingGeo, idleRingMat);
    }
    if (objectType === "planet") {
      const ringGeo = new THREE.RingGeometry(3.0, 4.4, 64);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xc8a860, side: THREE.DoubleSide, transparent: true, opacity: 0.18 });
      const ring    = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2.8;
      scene.add(ring);
      ringRef.current = ring;
      disposeList.push(ringGeo, ringMat);
    }
    if (objectType === "black_hole") {
      const accGeo = new THREE.RingGeometry(2.8, 5.5, 128);
      const accMat = new THREE.MeshBasicMaterial({ color: 0xff6600, side: THREE.DoubleSide, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const acc = new THREE.Mesh(accGeo, accMat);
      acc.rotation.x = Math.PI / 6;
      scene.add(acc);
      accretionRef.current = acc;
      const innerGeo = new THREE.RingGeometry(2.4, 3.0, 128);
      const innerMat = new THREE.MeshBasicMaterial({ color: 0xffaa22, side: THREE.DoubleSide, transparent: true, opacity: 0.70, blending: THREE.AdditiveBlending, depthWrite: false });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.rotation.x = Math.PI / 6;
      scene.add(inner);
      disposeList.push(accGeo, accMat, innerGeo, innerMat);
    }
    if (objectType === "star") {
      [3.2, 3.8, 4.6].forEach((r, i) => {
        const rGeo = new THREE.RingGeometry(r, r + 0.18, 64);
        const rMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.08 - i * 0.02, blending: THREE.AdditiveBlending, depthWrite: false });
        scene.add(new THREE.Mesh(rGeo, rMat));
        disposeList.push(rGeo, rMat);
      });
    }

    // ── LIGHTS ───────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x111133, 1.5));
    const keyLight = new THREE.PointLight(color, 3, 40);
    keyLight.position.set(8, 5, 8);
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(0x2244aa, 1.5, 30);
    fillLight.position.set(-8, -4, -6);
    scene.add(fillLight);

    // ── POSTPROCESSING ────────────────────────────────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.50,  // strength  — photographic, not overblown
      0.60,  // radius
      0.68,  // threshold — only the brightest stars glow
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ── RESIZE ───────────────────────────────────────────────────────────────
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
      bloom.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    onResize();
    window.addEventListener("resize", onResize);

    // ── ANIMATION ─────────────────────────────────────────────────────────────
    let frame = 0;
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      frame++;

      // Different drift rates create parallax depth
      L1.pts.rotation.y += 0.000055; L1.pts.rotation.x += 0.000018;
      L2.pts.rotation.y += 0.000085; L2.pts.rotation.x += 0.000030;
      L3.pts.rotation.y += 0.000120; L3.pts.rotation.x += 0.000042;
      MW.pts.rotation.y += 0.000038; MW.pts.rotation.z += 0.000012;

      // Slow independent nebula drift
      N1.pts.rotation.y += 0.000022;
      N2.pts.rotation.y -= 0.000018;
      N3.pts.rotation.z += 0.000015;

      sphere.rotation.y += objectType === "star" ? 0.006 : 0.003;

      const targetX = hasContentRef.current ? 6.5 : 0;
      sphere.position.x += (targetX - sphere.position.x) * 0.04;
      if (glowRef.current)      glowRef.current.position.x      = sphere.position.x;
      if (ringRef.current)      ringRef.current.position.x      = sphere.position.x;
      if (accretionRef.current) accretionRef.current.position.x = sphere.position.x;

      if (objectType === "star" && glowRef.current) {
        (glowRef.current.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.08 * Math.sin(frame * 0.03);
      }
      if (objectType === "black_hole") {
        sphere.rotation.y += 0.008;
        if (accretionRef.current) accretionRef.current.rotation.z += 0.004;
      }

      composer.render();
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      composer.dispose();
      renderer.dispose();
      sphereGeo.dispose(); glowGeo.dispose();
      L1.geo.dispose(); L1.mat.dispose();
      L2.geo.dispose(); L2.mat.dispose();
      L3.geo.dispose(); L3.mat.dispose();
      MW.geo.dispose(); MW.mat.dispose();
      N1.geo.dispose(); N1.mat.dispose();
      N2.geo.dispose(); N2.mat.dispose();
      N3.geo.dispose(); N3.mat.dispose();
      N4.geo.dispose(); N4.mat.dispose();
      N5.geo.dispose(); N5.mat.dispose();
      disposeList.forEach((obj) => obj.dispose());
    };
  }, [objectType]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}

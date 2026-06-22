"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ObjectType, OBJECT_COLORS } from "@/lib/types";

interface ExploreSceneProps {
  objectType: ObjectType;
  nasaImageUrl?: string | null;
}

// Bloom [strength, radius, threshold] per type
const BLOOM: Record<string, [number, number, number]> = {
  black_hole:    [0.9, 0.5, 0.25],
  star:          [1.4, 0.6, 0.15],
  nebula:        [1.4, 0.70, 0.22],
  galaxy:        [0.7, 0.4, 0.15],
  comet:         [1.1, 0.5, 0.12],
  planet:        [0.3, 0.3, 0.40],
  ringed_planet: [0.4, 0.3, 0.35],
  moon:          [0.2, 0.2, 0.50],
  asteroid:      [0.2, 0.2, 0.50],
};

// ── 3D value-noise helpers (used to sculpt the Crab Nebula's fibrous gas) ──
function hash3(ix: number, iy: number, iz: number): number {
  const h = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const c000 = hash3(ix, iy, iz),       c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz),   c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1),   c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1), c111 = hash3(ix + 1, iy + 1, iz + 1);
  const x00 = c000 + (c100 - c000) * ux, x10 = c010 + (c110 - c010) * ux;
  const x01 = c001 + (c101 - c001) * ux, x11 = c011 + (c111 - c011) * ux;
  const y0 = x00 + (x10 - x00) * uy,     y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}
function fbm3(x: number, y: number, z: number): number {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < 5; i++) {
    v += a * vnoise3(x * f, y * f, z * f);
    f *= 2.0; a *= 0.5;
  }
  return v;
}

// These types show the NASA photo as a full-screen CSS background.
// (nebula is intentionally excluded — it is reimagined as a true 3D volume.)
const BG_TYPES = new Set(["galaxy", "comet"]);

// These types apply the NASA photo as a texture on the 3-D sphere
const TEXTURE_TYPES = new Set(["planet", "moon", "asteroid"]);

export default function ExploreScene({ objectType, nasaImageUrl }: ExploreSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    const type = objectType ?? "planet";
    const hexColor = OBJECT_COLORS[type] ?? OBJECT_COLORS.planet;
    const color = new THREE.Color(hexColor);
    const [bloomStrength, bloomRadius, bloomThreshold] = BLOOM[type] ?? [0.6, 0.4, 0.2];
    const showNasaBg = BG_TYPES.has(type) && !!nasaImageUrl;
    const useNasaTexture = TEXTURE_TYPES.has(type) && !!nasaImageUrl;

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: showNasaBg });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x00000a, showNasaBg ? 0 : 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);

    // ── Camera ────────────────────────────────────────────────────────────────
    if (type === "black_hole") {
      camera.position.set(0, 7, 11);
    } else if (type === "ringed_planet") {
      camera.position.set(0, 5, 20);
    } else {
      camera.position.z = 18;
    }

    // ── Orbit controls ────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = type === "black_hole" ? 14 : 8;
    controls.maxDistance = type === "black_hole" ? 42 : 35;

    // ── Star field ────────────────────────────────────────────────────────────
    const starCount = 9000;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 400 + Math.random() * 700;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.5, sizeAttenuation: true,
      transparent: true,
      opacity: showNasaBg ? 0.0 : (type === "black_hole" ? 0.55 : 0.9),
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ── Lights ────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x111133, 2.0));
    const keyLight = new THREE.PointLight(type === "black_hole" ? 0x660099 : color, 5, 80);
    keyLight.position.set(7, 5, 10);
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(0x2244aa, 2.5, 50);
    fillLight.position.set(-9, -5, -8);
    scene.add(fillLight);

    // ── Per-type scene ────────────────────────────────────────────────────────
    let animFn: ((frame: number) => void) | null = null;
    const disposeList: Array<{ dispose(): void }> = [];

    // ── Helper: apply NASA texture to a mesh material ─────────────────────────
    const applyNasaTexture = (mat: THREE.MeshStandardMaterial) => {
      if (!nasaImageUrl || disposed) return;
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = "anonymous";
      loader.load(nasaImageUrl, (tex) => {
        if (disposed) { tex.dispose(); return; }
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.emissiveIntensity = 0.02;
        mat.needsUpdate = true;
        disposeList.push(tex);
      });
    };

    if (type === "black_hole") {
      const DISK_TILT = Math.PI / 2 - 0.08;

      // Event horizon — large solid black sphere, rendered last so it cuts through disk
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(3.2, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x000000 }),
      );
      sphere.renderOrder = 10;
      scene.add(sphere);

      // Photon sphere ring — paper-thin bright halo
      const photon = new THREE.Mesh(
        new THREE.RingGeometry(3.22, 3.42, 256),
        new THREE.MeshBasicMaterial({
          color: 0xfff0dd, side: THREE.DoubleSide, transparent: true,
          opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      photon.rotation.x = DISK_TILT;
      scene.add(photon);

      // Inner accretion — white-hot core (brightest, most intense)
      const inner = new THREE.Mesh(
        new THREE.RingGeometry(3.4, 5.2, 256),
        new THREE.MeshBasicMaterial({
          color: 0xffeecc, side: THREE.DoubleSide, transparent: true,
          opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      inner.rotation.x = DISK_TILT;
      scene.add(inner);

      // Mid ring — orange transition
      const mid = new THREE.Mesh(
        new THREE.RingGeometry(5.2, 8.0, 256),
        new THREE.MeshBasicMaterial({
          color: 0xff5500, side: THREE.DoubleSide, transparent: true,
          opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      mid.rotation.x = DISK_TILT;
      scene.add(mid);

      // Outer ring — dark red fade
      const outer = new THREE.Mesh(
        new THREE.RingGeometry(8.0, 12.0, 256),
        new THREE.MeshBasicMaterial({
          color: 0xaa1500, side: THREE.DoubleSide, transparent: true,
          opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      outer.rotation.x = DISK_TILT;
      scene.add(outer);

      // Gravitational lensing arc above the horizon
      const lensArc = new THREE.Mesh(
        new THREE.RingGeometry(3.3, 4.6, 256),
        new THREE.MeshBasicMaterial({
          color: 0xffddaa, side: THREE.DoubleSide, transparent: true,
          opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      lensArc.rotation.x = Math.PI / 2 + 0.08;
      lensArc.position.y = 0.5;
      scene.add(lensArc);

      // Subtle purple void glow around the horizon
      const voidGlow = new THREE.Mesh(
        new THREE.SphereGeometry(4.2, 32, 32),
        new THREE.MeshBasicMaterial({
          color: 0x220033, transparent: true, opacity: 0.08,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      scene.add(voidGlow);

      const diskLight = new THREE.PointLight(0xff5500, 6, 25);
      diskLight.position.set(0, -1.5, 0);
      scene.add(diskLight);

      disposeList.push(
        sphere.geometry, sphere.material as THREE.Material,
        photon.geometry, photon.material as THREE.Material,
        inner.geometry, inner.material as THREE.Material,
        mid.geometry, mid.material as THREE.Material,
        outer.geometry, outer.material as THREE.Material,
        lensArc.geometry, lensArc.material as THREE.Material,
        voidGlow.geometry, voidGlow.material as THREE.Material,
      );

      animFn = (frame) => {
        inner.rotation.z += 0.008;
        mid.rotation.z  += 0.003;
        outer.rotation.z += 0.0015;
        photon.rotation.z += 0.014;
        const lm = lensArc.material as THREE.MeshBasicMaterial;
        lm.opacity = 0.35 + 0.12 * Math.sin(frame * 0.02);
      };

    } else if (type === "star") {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(4.2, 64, 64),
        new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: 1.6, roughness: 0.8, metalness: 0.0,
        }),
      );
      scene.add(sphere);
      scene.add(new THREE.PointLight(color, 7, 100));

      const glowMesh = new THREE.Mesh(
        new THREE.SphereGeometry(6.0, 32, 32),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.14,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      scene.add(glowMesh);

      const coronaRings: { mat: THREE.MeshBasicMaterial; geo: THREE.RingGeometry }[] = [];
      [5.2, 6.2, 7.3, 8.5, 9.8].forEach((r) => {
        const geo = new THREE.RingGeometry(r, r + 0.3, 64);
        const mat = new THREE.MeshBasicMaterial({
          color, side: THREE.DoubleSide, transparent: true, opacity: 0.055,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.random() * Math.PI;
        mesh.rotation.y = Math.random() * Math.PI;
        scene.add(mesh);
        coronaRings.push({ mat, geo });
      });

      disposeList.push(
        sphere.geometry, sphere.material as THREE.Material,
        glowMesh.geometry, glowMesh.material as THREE.Material,
      );
      coronaRings.forEach(({ geo, mat }) => disposeList.push(geo, mat));

      const glowMatRef = glowMesh.material as THREE.MeshBasicMaterial;
      animFn = (frame) => {
        sphere.rotation.y += 0.007;
        glowMatRef.opacity = 0.10 + 0.07 * Math.sin(frame * 0.025);
        coronaRings.forEach(({ mat }, i) => {
          mat.opacity = 0.035 + 0.035 * Math.sin(frame * 0.018 + i * 1.2);
        });
      };

    } else if (type === "nebula") {
      // ── True 3D volumetric Crab Nebula — structured from the NASA reference ──
      // Three physically distinct components, all inside one orbit-able group:
      //   (1) fibrous lavender outer envelope — supernova ejecta, voids & bays
      //   (2) smooth electric-blue interior — pulsar-wind synchrotron glow
      //   (3) bright magenta filament cage — ionised H/S strands draped over it
      const group = new THREE.Group();
      scene.add(group);

      // Oblate envelope proportions (Crab is wider than tall)
      const SX = 1.34, SY = 0.82, SZ = 1.0;
      const R  = 8.4;                       // envelope radius
      // Blue synchrotron region sits slightly up-and-right of centre
      const blueCx = 0.6, blueCy = 0.7, blueCz = -0.3;

      // ── (1) Fibrous outer envelope — density carved by domain-warped fBm ─────
      const HAZE_N = 20000;
      const hPos = new Float32Array(HAZE_N * 3);
      const hCol = new Float32Array(HAZE_N * 3);
      const lavender = new THREE.Color(0x8f7ce0);
      const indigo   = new THREE.Color(0x2a1a78);
      for (let i = 0; i < HAZE_N; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const rr    = Math.pow(Math.random(), 0.5);   // outer-biased
        const x = R * rr * Math.sin(phi) * Math.cos(theta) * SX;
        const y = R * rr * Math.sin(phi) * Math.sin(theta) * SY;
        const z = R * rr * Math.cos(phi) * SZ;
        hPos[i * 3] = x; hPos[i * 3 + 1] = y; hPos[i * 3 + 2] = z;

        // Domain-warped fBm → wispy, fibrous density with voids
        const wx = fbm3(x * 0.22 + 11.0, y * 0.22, z * 0.22) - 0.5;
        const wy = fbm3(x * 0.22, y * 0.22 + 7.0, z * 0.22) - 0.5;
        const d  = fbm3(x * 0.30 + wx * 2.6, y * 0.30 + wy * 2.6, z * 0.30 + 5.0);
        // Brighter in a mid-outer shell, fading at the very edge
        const shell = 1.0 - Math.abs(rr - 0.74) * 1.3;
        let bright = Math.pow(Math.max(0, d * Math.max(0.05, shell)), 2.2) * 2.6;
        bright = Math.min(bright, 1.1);

        const c = indigo.clone().lerp(lavender, Math.min(1, d * 1.4));
        hCol[i * 3]     = c.r * bright;
        hCol[i * 3 + 1] = c.g * bright;
        hCol[i * 3 + 2] = c.b * bright;
      }
      const hazeGeo = new THREE.BufferGeometry();
      hazeGeo.setAttribute("position", new THREE.BufferAttribute(hPos, 3));
      hazeGeo.setAttribute("color",    new THREE.BufferAttribute(hCol, 3));
      const hazeMat = new THREE.PointsMaterial({
        size: 0.16, sizeAttenuation: true, vertexColors: true,
        transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const haze = new THREE.Points(hazeGeo, hazeMat);
      group.add(haze);
      disposeList.push(hazeGeo, hazeMat);

      // ── (2) Blue synchrotron interior — smooth, centre-biased, offset blob ───
      const BLUE_N = 7000;
      const bPos = new Float32Array(BLUE_N * 3);
      const bCol = new Float32Array(BLUE_N * 3);
      const electric = new THREE.Color(0x6a5cff);
      const skyblue  = new THREE.Color(0x9fb0ff);
      for (let i = 0; i < BLUE_N; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const rr    = Math.pow(Math.random(), 1.6) * 5.0;   // centre-biased
        const x = rr * Math.sin(phi) * Math.cos(theta) * 1.1 + blueCx;
        const y = rr * Math.sin(phi) * Math.sin(theta) * 0.78 + blueCy;
        const z = rr * Math.cos(phi) * 0.95 + blueCz;
        bPos[i * 3] = x; bPos[i * 3 + 1] = y; bPos[i * 3 + 2] = z;

        const t = rr / 5.0;
        const c = skyblue.clone().lerp(electric, t);
        // Gentle noise mottle, but stays smooth compared to the haze
        const n = 0.55 + 0.45 * fbm3(x * 0.4, y * 0.4, z * 0.4);
        const b = (1.0 - t * 0.5) * n * 0.85;
        bCol[i * 3]     = c.r * b;
        bCol[i * 3 + 1] = c.g * b;
        bCol[i * 3 + 2] = c.b * b;
      }
      const blueGeo = new THREE.BufferGeometry();
      blueGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3));
      blueGeo.setAttribute("color",    new THREE.BufferAttribute(bCol, 3));
      const blueMat = new THREE.PointsMaterial({
        size: 0.18, sizeAttenuation: true, vertexColors: true,
        transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const blueCore = new THREE.Points(blueGeo, blueMat);
      group.add(blueCore);
      disposeList.push(blueGeo, blueMat);

      // ── (3) Magenta filament cage — organic strands via noise-flow walk ──────
      const fPos: number[] = [];
      const fCol: number[] = [];
      const STRANDS = 56;
      for (let s = 0; s < STRANDS; s++) {
        const isBand = s < 12;            // central bright zigzag band
        // Strand start point
        let px: number, py: number, pz: number;
        if (isBand) {
          px = (Math.random() - 0.5) * 11.0;
          py = (Math.random() - 0.5) * 3.0;
          pz = (Math.random() - 0.5) * 3.0;
        } else {
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          const rr = 0.42 + Math.random() * 0.5;
          px = R * rr * Math.sin(ph) * Math.cos(th) * SX;
          py = R * rr * Math.sin(ph) * Math.sin(th) * SY;
          pz = R * rr * Math.cos(ph) * SZ;
        }
        // Initial direction
        let dx = Math.random() - 0.5, dy = Math.random() - 0.5, dz = Math.random() - 0.5;
        let dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;

        const steps     = 130 + Math.floor(Math.random() * 90);
        const stepLen   = 0.12;
        const thickness = isBand ? 0.20 : 0.13;
        const baseB     = isBand ? 1.25 : 0.62 + Math.random() * 0.45;

        for (let st = 0; st < steps; st++) {
          // Curl the heading with a smooth noise flow-field
          const n1 = fbm3(px * 0.28 + s * 1.7, py * 0.28, pz * 0.28) - 0.5;
          const n2 = fbm3(px * 0.28, py * 0.28 + s * 1.7, pz * 0.28) - 0.5;
          const n3 = fbm3(px * 0.28, py * 0.28, pz * 0.28 + s * 1.7) - 0.5;
          dx += n1 * 0.55; dy += n2 * 0.55; dz += n3 * 0.55;
          if (isBand) dy -= py * 0.05;     // keep band near the equator
          dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;

          px += dx * stepLen * 1.25;        // step wider in X
          py += dy * stepLen;
          pz += dz * stepLen;

          // Contain inside the oblate envelope
          const er = Math.hypot(px / SX, py / SY, pz / SZ);
          if (er > R) { px *= 0.96; py *= 0.96; pz *= 0.96; }

          // Lay down a small clump of bright points (gives the strand thickness)
          for (let c = 0; c < 2; c++) {
            fPos.push(
              px + (Math.random() - 0.5) * thickness,
              py + (Math.random() - 0.5) * thickness,
              pz + (Math.random() - 0.5) * thickness,
            );
            const b = baseB * (0.55 + Math.random() * 0.6);
            fCol.push(
              Math.min(1.0, 1.0 * b),     // R — magenta core, clips toward white when bright
              Math.min(1.0, 0.26 * b),    // G
              Math.min(1.0, 0.58 * b),    // B
            );
          }
        }
      }
      const filGeo = new THREE.BufferGeometry();
      filGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(fPos), 3));
      filGeo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array(fCol), 3));
      const filMat = new THREE.PointsMaterial({
        size: 0.09, sizeAttenuation: true, vertexColors: true,
        transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const filaments = new THREE.Points(filGeo, filMat);
      group.add(filaments);
      disposeList.push(filGeo, filMat);

      // ── Ambient volume shells — soft depth, no hard sphere edges ─────────────
      [
        { r: 8.2, hex: 0x140a48, op: 0.07 },   // outer indigo haze
        { r: 4.6, hex: 0x3322a8, op: 0.08 },   // blue mid volume
      ].forEach(({ r, hex, op }) => {
        const sGeo = new THREE.SphereGeometry(r, 32, 32);
        const sMat = new THREE.MeshBasicMaterial({
          color: hex, transparent: true, opacity: op,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
        });
        const mesh = new THREE.Mesh(sGeo, sMat);
        mesh.scale.set(SX, SY, SZ);
        group.add(mesh);
        disposeList.push(sGeo, sMat);
      });

      // ── Pulsar — bright neutron-star core with a pulsing halo ────────────────
      const pulsarGeo = new THREE.SphereGeometry(0.16, 16, 16);
      const pulsarMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff });
      const pulsar    = new THREE.Mesh(pulsarGeo, pulsarMat);
      pulsar.position.set(blueCx, blueCy, blueCz);
      group.add(pulsar);

      const haloGeo = new THREE.SphereGeometry(0.5, 16, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x8ce8ff, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(blueCx, blueCy, blueCz);
      group.add(halo);
      disposeList.push(pulsarGeo, pulsarMat, haloGeo, haloMat);

      // Tilt — Crab as seen slightly off-axis from Earth
      group.rotation.x =  0.16;
      group.rotation.z = -0.06;

      animFn = (frame) => {
        group.rotation.y += 0.0004;
        const pulse = Math.abs(Math.sin(frame * 0.11));   // ~Crab pulsar cadence
        haloMat.opacity = 0.15 + 0.45 * pulse;
        pulsarMat.color.setRGB(0.78 + 0.22 * pulse, 0.92 + 0.08 * pulse, 1.0);
        hazeMat.opacity = 0.80 + 0.08 * Math.sin(frame * 0.006);
        blueMat.opacity = 0.50 + 0.10 * Math.sin(frame * 0.008 + 0.7);
        filMat.opacity  = 0.82 + 0.14 * Math.sin(frame * 0.010 + 1.1);
      };

    } else if (type === "galaxy") {
      const count = 6000;
      const pos = new Float32Array(count * 3);
      const cols = new Float32Array(count * 3);
      const palette = [
        new THREE.Color(0xff9955), new THREE.Color(0xffddaa),
        new THREE.Color(0x8899ff), new THREE.Color(0xffffff),
        new THREE.Color(0xffcc88),
      ];
      for (let i = 0; i < count; i++) {
        const arm = i % 3;
        const t = Math.random();
        const r = 0.4 + t * 10;
        const angle = arm * (Math.PI * 2 / 3) + t * Math.PI * 1.6 + (Math.random() - 0.5) * 0.4;
        pos[i * 3]     = r * Math.cos(angle) + (Math.random() - 0.5) * 0.9;
        pos[i * 3 + 1] = (Math.random() - 0.5) * (r < 2 ? 2.0 : 0.4);
        pos[i * 3 + 2] = r * Math.sin(angle) + (Math.random() - 0.5) * 0.9;
        const c = palette[Math.floor(Math.random() * palette.length)];
        const b = 1.0 - t * 0.55;
        cols[i * 3] = c.r * b; cols[i * 3 + 1] = c.g * b; cols[i * 3 + 2] = c.b * b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.14, sizeAttenuation: true, transparent: true,
        opacity: showNasaBg ? 0.0 : 0.88, // hide procedural galaxy — real photo is better
        vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const galaxy = new THREE.Points(geo, mat);
      galaxy.rotation.x = Math.PI / 6;
      scene.add(galaxy);
      disposeList.push(geo, mat);

      if (!showNasaBg) {
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(1.4, 32, 32),
          new THREE.MeshStandardMaterial({
            color: 0xff9955, emissive: new THREE.Color(0xff9955), emissiveIntensity: 1.2, roughness: 0.8,
          }),
        );
        scene.add(core);
        disposeList.push(core.geometry, core.material as THREE.Material);
        animFn = (frame) => {
          galaxy.rotation.y += 0.0008;
          core.rotation.y += 0.003;
          mat.opacity = 0.8 + 0.1 * Math.sin(frame * 0.012);
        };
      } else {
        animFn = () => { galaxy.rotation.y += 0.0004; };
      }

    } else if (type === "moon") {
      const mat = new THREE.MeshStandardMaterial({
        color: useNasaTexture ? 0xffffff : 0x8899aa,
        roughness: 0.92, metalness: 0.0,
        emissive: new THREE.Color(0x1a2233), emissiveIntensity: useNasaTexture ? 0.02 : 0.15,
      });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(3.2, 64, 64), mat);
      scene.add(sphere);

      if (useNasaTexture) applyNasaTexture(mat);

      const moonGlow = new THREE.Mesh(
        new THREE.SphereGeometry(3.5, 32, 32),
        new THREE.MeshBasicMaterial({
          color: 0xaabbcc, transparent: true, opacity: 0.04,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      scene.add(moonGlow);
      disposeList.push(
        sphere.geometry, mat,
        moonGlow.geometry, moonGlow.material as THREE.Material,
      );

      animFn = () => { sphere.rotation.y += 0.002; };

    } else if (type === "comet") {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 64, 64),
        new THREE.MeshStandardMaterial({
          color: 0x88ddff, emissive: new THREE.Color(0x88ddff), emissiveIntensity: 0.9, roughness: 0.5,
        }),
      );
      if (!showNasaBg) scene.add(sphere);

      const coma = new THREE.Mesh(
        new THREE.SphereGeometry(4.2, 32, 32),
        new THREE.MeshBasicMaterial({
          color: 0x88ddff, transparent: true, opacity: 0.08,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      if (!showNasaBg) scene.add(coma);

      const tailCount = 2000;
      const tailPos = new Float32Array(tailCount * 3);
      const tailCols = new Float32Array(tailCount * 3);
      for (let i = 0; i < tailCount; i++) {
        const t = Math.random();
        const spread = t * 3.5;
        tailPos[i * 3]     = -(t * 16 + 2.8) + (Math.random() - 0.5) * spread;
        tailPos[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.5;
        tailPos[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.5;
        const b = 1 - t;
        tailCols[i * 3] = 0.45 * b; tailCols[i * 3 + 1] = 0.85 * b; tailCols[i * 3 + 2] = b;
      }
      const tailGeo = new THREE.BufferGeometry();
      tailGeo.setAttribute("position", new THREE.BufferAttribute(tailPos, 3));
      tailGeo.setAttribute("color", new THREE.BufferAttribute(tailCols, 3));
      const tailMat = new THREE.PointsMaterial({
        size: 0.1, sizeAttenuation: true, transparent: true,
        opacity: showNasaBg ? 0.4 : 0.7,
        vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      scene.add(new THREE.Points(tailGeo, tailMat));
      disposeList.push(
        sphere.geometry, sphere.material as THREE.Material,
        coma.geometry, coma.material as THREE.Material,
        tailGeo, tailMat,
      );

      animFn = () => { if (!showNasaBg) sphere.rotation.y += 0.004; };

    } else if (type === "asteroid") {
      const geo = new THREE.SphereGeometry(3.0, 32, 32);
      const posAttr = geo.getAttribute("position");
      for (let i = 0; i < posAttr.count; i++) {
        const noise = 0.65 + Math.random() * 0.7;
        posAttr.setXYZ(i, posAttr.getX(i) * noise, posAttr.getY(i) * noise, posAttr.getZ(i) * noise);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: useNasaTexture ? 0xffffff : 0xb8885a,
        roughness: 0.95, metalness: 0.08,
        emissive: new THREE.Color(0x1a0f00), emissiveIntensity: useNasaTexture ? 0.02 : 0.1,
      });
      const sphere = new THREE.Mesh(geo, mat);
      scene.add(sphere);

      if (useNasaTexture) applyNasaTexture(mat);
      disposeList.push(geo, mat);

      animFn = () => {
        sphere.rotation.y += 0.013;
        sphere.rotation.x += 0.005;
      };

    } else if (type === "ringed_planet") {
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.18, roughness: 0.65, metalness: 0.05,
      });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(3.2, 64, 64), mat);
      scene.add(sphere);

      const gapRing = new THREE.Mesh(
        new THREE.RingGeometry(3.7, 4.1, 128),
        new THREE.MeshBasicMaterial({ color: 0x221a00, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }),
      );
      gapRing.rotation.x = Math.PI / 2.4;
      scene.add(gapRing);

      const ringB = new THREE.Mesh(
        new THREE.RingGeometry(4.1, 5.8, 128),
        new THREE.MeshBasicMaterial({ color: 0xd4b06a, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
      );
      ringB.rotation.x = Math.PI / 2.4;
      scene.add(ringB);

      const ringA = new THREE.Mesh(
        new THREE.RingGeometry(5.9, 7.4, 128),
        new THREE.MeshBasicMaterial({ color: 0xb8965a, side: THREE.DoubleSide, transparent: true, opacity: 0.38 }),
      );
      ringA.rotation.x = Math.PI / 2.4;
      scene.add(ringA);

      const ringOuter = new THREE.Mesh(
        new THREE.RingGeometry(7.4, 8.8, 128),
        new THREE.MeshBasicMaterial({ color: 0x997744, side: THREE.DoubleSide, transparent: true, opacity: 0.14 }),
      );
      ringOuter.rotation.x = Math.PI / 2.4;
      scene.add(ringOuter);

      const rpGlow = new THREE.Mesh(
        new THREE.SphereGeometry(3.7, 32, 32),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.06,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      scene.add(rpGlow);
      disposeList.push(
        sphere.geometry, mat,
        gapRing.geometry, gapRing.material as THREE.Material,
        ringB.geometry, ringB.material as THREE.Material,
        ringA.geometry, ringA.material as THREE.Material,
        ringOuter.geometry, ringOuter.material as THREE.Material,
        rpGlow.geometry, rpGlow.material as THREE.Material,
      );

      animFn = () => {
        sphere.rotation.y += 0.003;
        ringB.rotation.z += 0.0005;
        ringA.rotation.z += 0.0003;
      };

    } else {
      // Generic planet — no rings
      const mat = new THREE.MeshStandardMaterial({
        color: useNasaTexture ? 0xffffff : color,
        emissive: useNasaTexture ? new THREE.Color(0x000000) : color,
        emissiveIntensity: useNasaTexture ? 0.0 : 0.1,
        roughness: 0.72, metalness: 0.05,
      });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(3.2, 64, 64), mat);
      scene.add(sphere);

      if (useNasaTexture) applyNasaTexture(mat);

      // Atmospheric rim
      const atmo1 = new THREE.Mesh(
        new THREE.SphereGeometry(3.55, 32, 32),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.07,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      scene.add(atmo1);
      const atmo2 = new THREE.Mesh(
        new THREE.SphereGeometry(4.1, 32, 32),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.025,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      scene.add(atmo2);
      disposeList.push(
        sphere.geometry, mat,
        atmo1.geometry, atmo1.material as THREE.Material,
        atmo2.geometry, atmo2.material as THREE.Material,
      );

      animFn = () => { sphere.rotation.y += 0.003; };
    }

    // ── Postprocessing ────────────────────────────────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      bloomStrength, bloomRadius, bloomThreshold,
    ));
    composer.addPass(new OutputPass());

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── Animate ───────────────────────────────────────────────────────────────
    let frame = 0;
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      frame++;
      controls.update();
      stars.rotation.y += 0.00006;
      stars.rotation.x += 0.00002;
      if (animFn) animFn(frame);
      composer.render();
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      controls.dispose();
      window.removeEventListener("resize", onResize);
      composer.dispose();
      renderer.dispose();
      starGeo.dispose();
      starMat.dispose();
      disposeList.forEach((obj) => obj.dispose());
    };
  }, [objectType, nasaImageUrl]);

  const type = objectType ?? "planet";
  const showNasaBg = BG_TYPES.has(type) && !!nasaImageUrl;

  return (
    <div className="fixed inset-0 z-0">
      {showNasaBg && (
        type === "nebula" ? (
          <div className="absolute inset-0 overflow-hidden">
            <div className="nebula-bg-spin" style={{ "--nasa-bg-url": `url(${nasaImageUrl})` } as React.CSSProperties} />
          </div>
        ) : (
          <div className="nasa-bg-static" style={{ "--nasa-bg-url": `url(${nasaImageUrl})` } as React.CSSProperties} />
        )
      )}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

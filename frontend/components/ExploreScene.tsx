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
  nebula:        [1.1, 0.60, 0.32],
  galaxy:        [0.7, 0.4, 0.15],
  comet:         [1.1, 0.5, 0.12],
  planet:        [0.3, 0.3, 0.40],
  ringed_planet: [0.4, 0.3, 0.35],
  moon:          [0.2, 0.2, 0.50],
  asteroid:      [0.2, 0.2, 0.50],
};

// ── Path A: GLSL procedural Crab Nebula (used when no NASA image is available) ──
const NEBULA_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAG = `
  precision highp float;
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 7; i++) {
      v += a * vnoise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;

    // Slow internal rotation
    float ang = uTime * 0.014;
    uv = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * uv;

    // Oval boundary — Crab is slightly wider than tall
    vec2 oval = vec2(uv.x / 1.10, uv.y / 0.96);
    float r = length(oval);
    float outerMask = smoothstep(0.95, 0.55, r);
    if (outerMask < 0.004) discard;

    // Domain-warped fBm cloud (gives filamentary, non-uniform texture)
    float t = uTime * 0.005;
    vec2 q = uv * 2.9;
    vec2 warp = vec2(fbm(q + t), fbm(q + vec2(5.2, 1.3) + t * 0.8));
    float cloud = fbm(q + 1.9 * warp + t * 0.6);

    // Dark voids — two noise layers thresholded to create the cellular bubbly interior
    float v1 = fbm(uv * 3.5 + vec2(1.1, 0.9) + t * 0.7);
    float v2 = fbm(uv * 2.8 + vec2(-0.9, 1.6) + t * 0.5);
    float voids = smoothstep(0.33, 0.58, (v1 + v2) * 0.5 + cloud * 0.12);

    // Filaments — ridge noise: bright where two fbm values are nearly equal
    vec2 fq = uv * 5.4 + t * 1.3;
    float fa = fbm(fq);
    float fb = fbm(fq + vec2(2.3, 1.9));
    float filament = pow(max(0.0, 1.0 - abs(fa - fb) * 5.2), 4.5);
    // S-curve weighting concentrates filaments along a diagonal band like the real Crab
    float sCurve = exp(-7.0 * pow(uv.y - 0.28 * sin(uv.x * 2.5) - uv.x * 0.18, 2.0));
    filament *= (0.18 + 0.82 * sCurve);

    // Color palette
    vec3 voidClr    = vec3(0.010, 0.004, 0.055);
    vec3 deepPurple = vec3(0.130, 0.040, 0.500);
    vec3 midPurple  = vec3(0.260, 0.090, 0.760);
    vec3 blueViolet = vec3(0.200, 0.135, 0.840);
    vec3 hotPink    = vec3(0.960, 0.175, 0.520);

    vec3 color = mix(deepPurple, mix(midPurple, blueViolet, cloud), cloud);
    color = mix(voidClr, color, voids);
    // Blue outer haze
    color = mix(color, blueViolet * 0.52, smoothstep(0.28, 0.90, r) * 0.38);
    // Filaments
    color += hotPink * filament * 0.92;

    float alpha = cloud * voids * outerMask;
    alpha = pow(alpha, 0.60);
    alpha = clamp(alpha + filament * sCurve * 0.58, 0.0, 1.0) * outerMask;

    gl_FragColor = vec4(color, alpha);
  }
`;

// These types show the NASA photo as a full-screen CSS background
const BG_TYPES = new Set(["galaxy", "nebula", "comet"]);

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
      });
    };

    // ── Per-type scene ────────────────────────────────────────────────────────
    let animFn: ((frame: number) => void) | null = null;
    const disposeList: Array<{ dispose(): void }> = [];

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
      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(4.2, 32, 32),
        new THREE.MeshBasicMaterial({
          color: 0x220033, transparent: true, opacity: 0.08,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      ));

      const diskLight = new THREE.PointLight(0xff5500, 6, 25);
      diskLight.position.set(0, -1.5, 0);
      scene.add(diskLight);

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

      const coronaRings: { mat: THREE.MeshBasicMaterial }[] = [];
      [5.2, 6.2, 7.3, 8.5, 9.8].forEach((r) => {
        const mat = new THREE.MeshBasicMaterial({
          color, side: THREE.DoubleSide, transparent: true, opacity: 0.055,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const mesh = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.3, 64), mat);
        mesh.rotation.x = Math.random() * Math.PI;
        mesh.rotation.y = Math.random() * Math.PI;
        scene.add(mesh);
        coronaRings.push({ mat });
      });

      const glowMatRef = glowMesh.material as THREE.MeshBasicMaterial;
      animFn = (frame) => {
        sphere.rotation.y += 0.007;
        glowMatRef.opacity = 0.10 + 0.07 * Math.sin(frame * 0.025);
        coronaRings.forEach(({ mat }, i) => {
          mat.opacity = 0.035 + 0.035 * Math.sin(frame * 0.018 + i * 1.2);
        });
      };

    } else if (type === "nebula") {

      if (!showNasaBg) {
        // ── PATH A: no NASA image — render procedural GLSL nebula ────────────
        const nebMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(16, 16),
          new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0.0 } },
            vertexShader: NEBULA_VERT,
            fragmentShader: NEBULA_FRAG,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        scene.add(nebMesh);
        disposeList.push(nebMesh.geometry, nebMesh.material as THREE.ShaderMaterial);

        // Sparse outer particles for 3-D depth/parallax around the shader mesh
        const spPos: number[] = [], spCol: number[] = [];
        for (let i = 0; i < 2200; i++) {
          const theta = Math.random() * Math.PI * 2;
          const phi   = Math.acos(2 * Math.random() - 1);
          const r     = 3.6 + Math.random() * 2.4;
          spPos.push(r * Math.sin(phi) * Math.cos(theta) * 1.18,
                     r * Math.sin(phi) * Math.sin(theta) * 0.86,
                     r * Math.cos(phi) * 0.9);
          const v = 0.30 + Math.random() * 0.40;
          spCol.push(v * 0.28, v * 0.06, v * 0.88);
        }
        const spGeo = new THREE.BufferGeometry();
        spGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(spPos), 3));
        spGeo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array(spCol), 3));
        const spMat = new THREE.PointsMaterial({
          size: 0.13, sizeAttenuation: true, transparent: true, opacity: 0.70,
          vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const spCloud = new THREE.Points(spGeo, spMat);
        scene.add(spCloud);
        disposeList.push(spGeo, spMat);

        animFn = (frame) => {
          nebMesh.lookAt(camera.position);
          (nebMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = frame * 0.016;
          spCloud.rotation.y += 0.00030;
          spCloud.rotation.z += 0.00010;
          spMat.opacity = 0.65 + 0.08 * Math.sin(frame * 0.007);
        };

      } else {
        // ── PATH B: NASA image is the primary visual ──────────────────────────
        // Only add a faint outer particle halo for depth — the photo does the rest.
        const spPos: number[] = [], spCol: number[] = [];
        for (let i = 0; i < 1000; i++) {
          const theta = Math.random() * Math.PI * 2;
          const phi   = Math.acos(2 * Math.random() - 1);
          const r     = 4.0 + Math.random() * 2.0;
          spPos.push(r * Math.sin(phi) * Math.cos(theta) * 1.15,
                     r * Math.sin(phi) * Math.sin(theta) * 0.82,
                     r * Math.cos(phi) * 0.5);
          const v = 0.45 + Math.random() * 0.35;
          spCol.push(v * 0.26, v * 0.05, v * 0.90);
        }
        const spGeo = new THREE.BufferGeometry();
        spGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(spPos), 3));
        spGeo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array(spCol), 3));
        const spMat = new THREE.PointsMaterial({
          size: 0.40, sizeAttenuation: true, transparent: true, opacity: 0.10,
          vertexColors: true, blending: THREE.NormalBlending, depthWrite: false,
        });
        const spCloud = new THREE.Points(spGeo, spMat);
        scene.add(spCloud);
        disposeList.push(spGeo, spMat);

        animFn = (frame) => {
          spCloud.rotation.y += 0.00025;
          spMat.opacity = 0.08 + 0.04 * Math.sin(frame * 0.006);
        };
      }

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

      if (!showNasaBg) {
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(1.4, 32, 32),
          new THREE.MeshStandardMaterial({
            color: 0xff9955, emissive: new THREE.Color(0xff9955), emissiveIntensity: 1.2, roughness: 0.8,
          }),
        );
        scene.add(core);
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

      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(3.5, 32, 32),
        new THREE.MeshBasicMaterial({
          color: 0xaabbcc, transparent: true, opacity: 0.04,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      ));

      animFn = () => { sphere.rotation.y += 0.002; };

    } else if (type === "comet") {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 64, 64),
        new THREE.MeshStandardMaterial({
          color: 0x88ddff, emissive: new THREE.Color(0x88ddff), emissiveIntensity: 0.9, roughness: 0.5,
        }),
      );
      if (!showNasaBg) scene.add(sphere);

      if (!showNasaBg) {
        scene.add(new THREE.Mesh(
          new THREE.SphereGeometry(4.2, 32, 32),
          new THREE.MeshBasicMaterial({
            color: 0x88ddff, transparent: true, opacity: 0.08,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        ));
      }

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

      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(3.7, 32, 32),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.06,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      ));

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
      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(3.55, 32, 32),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.07,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      ));
      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(4.1, 32, 32),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.025,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      ));

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

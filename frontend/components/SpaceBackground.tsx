"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ATMO_FRAG, BODY_VERT, SIMPLEX_3D } from "@/lib/glsl";
import {
  DisposalBag,
  buildStarfield,
  makeBloomComposer,
  makeRenderer,
  radialSprite,
} from "@/lib/three-utils";
import { ObjectType } from "@/lib/types";

interface SpaceBackgroundProps {
  objectType: ObjectType;
  hasContent: boolean;
}

// Procedural gas-giant: turbulent latitude bands + storm cells, lit by a
// world-space sun direction with a cool terminator scatter line.
const PLANET_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  ${SIMPLEX_3D}
  void main() {
    vec3 p = normalize(vLocal);
    float t = uTime * 0.02;
    float warp = fbm(p * 1.6 + vec3(t, 0.0, 0.0));
    float bands = sin(p.y * 9.0 + warp * 3.0);
    float fine = fbm(p * 4.5 + warp * 1.2 + vec3(t * 1.5, 0.0, 0.0));
    float storms = ridged(p * 3.0 + vec3(t * 0.8, 0.0, t * 0.5));

    vec3 deep = vec3(0.04, 0.08, 0.22);
    vec3 mid  = vec3(0.10, 0.30, 0.60);
    vec3 warm = vec3(0.55, 0.80, 1.00);
    vec3 col = mix(deep, mid, smoothstep(-0.8, 0.8, bands));
    col = mix(col, warm, smoothstep(0.55, 0.95, storms) * 0.6);
    col += fine * 0.06;

    vec3 N = normalize(vWorldN);
    vec3 L = normalize(uLightDir);
    float d = dot(N, L);
    float day = smoothstep(-0.15, 0.65, d);
    float term = exp(-pow(d * 3.2, 2.0));
    vec3 lit = col * (0.04 + day * 1.15);
    lit += vec3(0.10, 0.28, 0.55) * term * 0.5;

    gl_FragColor = vec4(lit, 1.0);
  }
`;

export default function SpaceBackground({ objectType, hasContent }: SpaceBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasContentRef = useRef(hasContent);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    hasContentRef.current = hasContent;
  }, [hasContent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bag = new DisposalBag();
    const renderer = makeRenderer(canvas, 0x00010a);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x00010a, 0.0008);

    const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.set(0, 0, 15);

    // ── Parallax starfields ────────────────────────────────────────────────
    const far = buildStarfield(scene, bag, 14000, 900, 1300, 0.45, 0.75, 0.8);
    const mid = buildStarfield(scene, bag, 4200, 600, 900, 0.85, 0.85, 0.92);
    const near = buildStarfield(scene, bag, 600, 420, 600, 1.7, 0.95, 1.0);

    // ── Milky Way band (tilted great circle of warm stars) ─────────────────
    const milky = (() => {
      const count = 14000;
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
        let dx = px, dy = py + s * ny, dz = pz + s * nz;
        const len = Math.hypot(dx, dy, dz);
        dx /= len; dy /= len; dz /= len;
        const r = 760 + Math.random() * 280;
        pos[i * 3] = r * dx; pos[i * 3 + 1] = r * dy; pos[i * 3 + 2] = r * dz;
        const w = 0.7 + Math.random() * 0.3;
        const b = 0.55 + (1 - Math.abs(s) / 0.3) * 0.45;
        col[i * 3] = w * b; col[i * 3 + 1] = w * 0.92 * b; col[i * 3 + 2] = w * 0.78 * b;
      }
      const geo = bag.add(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = bag.add(new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.6, depthWrite: false }));
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      return pts;
    })();

    // ── Drifting nebula clouds (additive particle volumes) ─────────────────
    const sprite = bag.add(radialSprite("rgba(255,255,255,0.9)", "rgba(255,255,255,0)"));
    const makeNebula = (count: number, cx: number, cy: number, cz: number, radius: number, color: number, opacity: number) => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = radius * Math.cbrt(Math.random());
        pos[i * 3] = cx + r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = cy + r * Math.sin(phi) * Math.sin(theta) * 0.5;
        pos[i * 3 + 2] = cz + r * Math.cos(phi);
      }
      const geo = bag.add(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = bag.add(new THREE.PointsMaterial({ map: sprite, color, size: 7, sizeAttenuation: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      return pts;
    };
    const neb1 = makeNebula(2400, -520, 200, -640, 300, 0x1f49d6, 0.1);
    const neb2 = makeNebula(2000, 460, -160, -740, 250, 0x8a2bd6, 0.085);
    const neb3 = makeNebula(1700, 160, 460, -680, 230, 0x117799, 0.075);

    // ── Hero gas-giant planet (procedural surface + atmosphere + ring) ─────
    const planetGroup = new THREE.Group();
    planetGroup.position.set(3.6, -2.1, -1.0);
    scene.add(planetGroup);

    const R = 3.0;
    const lightDir = new THREE.Vector3(-0.5, 0.35, 0.8).normalize();

    const planetGeo = bag.add(new THREE.SphereGeometry(R, 96, 96));
    const planetMat = bag.add(
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uLightDir: { value: lightDir } },
        vertexShader: BODY_VERT,
        fragmentShader: PLANET_FRAG,
      }),
    );
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.rotation.z = 0.18;
    planetGroup.add(planet);

    const atmoGeo = bag.add(new THREE.SphereGeometry(R * 1.045, 64, 64));
    const atmoMat = bag.add(
      new THREE.ShaderMaterial({
        uniforms: { uAtmo: { value: new THREE.Color(0x5fd0ff) }, uLightDir: { value: lightDir } },
        vertexShader: BODY_VERT,
        fragmentShader: ATMO_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    );
    planetGroup.add(new THREE.Mesh(atmoGeo, atmoMat));

    // Tilted particle ring
    const ringGroup = new THREE.Group();
    ringGroup.rotation.set(Math.PI / 2.3, 0, 0.4);
    planetGroup.add(ringGroup);
    const ring = (() => {
      const count = 9000;
      const inner = R * 1.5, outer = R * 2.45;
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const cInner = new THREE.Color(0xffe2b0);
      const cOuter = new THREE.Color(0x7fb6ff);
      for (let i = 0; i < count; i++) {
        const rr = inner + Math.random() * (outer - inner);
        const ang = Math.random() * Math.PI * 2;
        const f = (rr - inner) / (outer - inner);
        // gap modulation for Cassini-like structure
        const dens = 0.5 + 0.5 * Math.sin(f * 22.0);
        pos[i * 3] = Math.cos(ang) * rr;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 0.05 * R;
        pos[i * 3 + 2] = Math.sin(ang) * rr;
        const c = cInner.clone().lerp(cOuter, f);
        const b = 0.5 + dens * 0.5;
        col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
      }
      const geo = bag.add(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = bag.add(new THREE.PointsMaterial({ map: sprite, size: 0.12, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      const pts = new THREE.Points(geo, mat);
      ringGroup.add(pts);
      return pts;
    })();

    // ── Distant sun (bloom anchor) along the light direction ───────────────
    const sunSprite = bag.add(radialSprite("rgba(255,244,214,1)", "rgba(255,200,120,0)"));
    const sunMat = bag.add(new THREE.SpriteMaterial({ map: sunSprite, color: 0xfff0d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const sun = new THREE.Sprite(sunMat);
    sun.position.copy(planetGroup.position).add(lightDir.clone().multiplyScalar(120));
    sun.scale.setScalar(60);
    scene.add(sun);

    // ── Postprocessing ─────────────────────────────────────────────────────
    const { composer, bloom } = makeBloomComposer(renderer, scene, camera, { strength: 0.55, radius: 0.7, threshold: 0.6 });

    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      bloom.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    onResize();
    window.addEventListener("resize", onResize);

    const onPointer = (e: PointerEvent) => {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer);

    // ── Animation ──────────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      planetMat.uniforms.uTime.value = t;

      far.rotation.y += 0.00002;
      mid.rotation.y += 0.00004;
      near.rotation.y += 0.00007;
      milky.rotation.y += 0.000018;
      neb1.rotation.y += 0.00002;
      neb2.rotation.y -= 0.000016;
      neb3.rotation.z += 0.000014;

      planet.rotation.y += 0.0012;
      ringGroup.rotation.z += 0.0006;

      // Cinematic drift + pointer parallax, eased toward target
      const px = pointerRef.current.x;
      const py = pointerRef.current.y;
      const driftX = Math.sin(t * 0.07) * 0.6 + px * 1.4 + (hasContentRef.current ? -2.2 : 0);
      const driftY = Math.cos(t * 0.05) * 0.4 - py * 0.9;
      camera.position.x += (driftX - camera.position.x) * 0.03;
      camera.position.y += (driftY - camera.position.y) * 0.03;
      camera.lookAt(1.4, -0.4, 0);

      composer.render();
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      composer.dispose();
      renderer.dispose();
      bag.disposeAll();
    };
  }, [objectType]);

  return <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" style={{ zIndex: 0 }} />;
}

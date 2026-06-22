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

interface ExploreSceneProps {
  objectType: ObjectType;
}

// ── Surface fragment shaders (paired with BODY_VERT) ───────────────────────
const TERRA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  ${SIMPLEX_3D}
  void main() {
    vec3 p = normalize(vLocal);
    float cont = fbm(p * 1.8);
    float detail = fbm(p * 5.5) * 0.5;
    float h = cont + detail * 0.4;
    float land = smoothstep(0.02, 0.12, h);
    vec3 ocean = mix(vec3(0.01, 0.05, 0.16), vec3(0.03, 0.18, 0.36), smoothstep(-0.3, 0.12, h));
    vec3 green = vec3(0.08, 0.24, 0.10);
    vec3 rock = vec3(0.30, 0.24, 0.18);
    vec3 sand = vec3(0.34, 0.30, 0.18);
    vec3 landC = mix(green, rock, smoothstep(0.18, 0.5, h));
    landC = mix(sand, landC, smoothstep(0.1, 0.22, h));
    vec3 base = mix(ocean, landC, land);
    float ice = smoothstep(0.74, 0.88, abs(p.y));
    base = mix(base, vec3(0.92, 0.96, 1.0), ice);

    vec3 N = normalize(vWorldN);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float d = dot(N, L);
    float day = smoothstep(-0.1, 0.6, d);
    float term = exp(-pow(d * 3.0, 2.0));
    vec3 col = base * (0.03 + day * 1.1);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 60.0) * (1.0 - land) * day;
    col += vec3(0.6, 0.75, 0.9) * spec * 0.6;
    col += vec3(0.1, 0.28, 0.55) * term * 0.4;
    col += landC * smoothstep(0.1, -0.25, d) * 0.05;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const GAS_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  ${SIMPLEX_3D}
  void main() {
    vec3 p = normalize(vLocal);
    float t = uTime * 0.02;
    float warp = fbm(p * 1.5 + vec3(t, 0.0, 0.0));
    float bands = sin(p.y * 11.0 + warp * 3.5);
    float storms = ridged(p * 3.0 + vec3(t * 0.7, 0.0, t * 0.4));
    vec3 c1 = vec3(0.32, 0.22, 0.12);
    vec3 c2 = vec3(0.78, 0.62, 0.36);
    vec3 c3 = vec3(0.96, 0.90, 0.72);
    vec3 col = mix(c1, c2, smoothstep(-0.8, 0.8, bands));
    col = mix(col, c3, smoothstep(0.55, 0.95, storms) * 0.7);

    vec3 N = normalize(vWorldN);
    float d = dot(N, normalize(uLightDir));
    float day = smoothstep(-0.15, 0.65, d);
    float term = exp(-pow(d * 3.2, 2.0));
    vec3 lit = col * (0.05 + day * 1.1);
    lit += vec3(0.5, 0.35, 0.15) * term * 0.4;
    gl_FragColor = vec4(lit, 1.0);
  }
`;

const STAR_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  ${SIMPLEX_3D}
  void main() {
    vec3 p = normalize(vLocal);
    float t = uTime * 0.25;
    float n = fbm(p * 3.0 + vec3(t, 0.0, 0.0));
    float n2 = ridged(p * 6.0 - vec3(0.0, t, 0.0));
    float gran = fbm(p * 16.0 + n * 1.5);
    float heat = n * 0.5 + n2 * 0.4 + gran * 0.25;
    vec3 cool = vec3(0.85, 0.18, 0.02);
    vec3 mid = vec3(1.0, 0.55, 0.12);
    vec3 hot = vec3(1.0, 0.94, 0.66);
    vec3 col = mix(cool, mid, smoothstep(0.1, 0.5, heat));
    col = mix(col, hot, smoothstep(0.5, 0.92, heat));
    vec3 N = normalize(vWorldN);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float limb = pow(max(dot(N, V), 0.0), 0.5);
    col *= 0.7 + 0.55 * limb;
    col *= 2.2;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const CLOUD_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  ${SIMPLEX_3D}
  void main() {
    vec3 p = normalize(vLocal);
    float c = fbm(p * 2.6 + vec3(uTime * 0.01, 0.0, 0.0));
    float a = smoothstep(0.12, 0.5, c);
    vec3 N = normalize(vWorldN);
    float day = smoothstep(-0.05, 0.6, dot(N, normalize(uLightDir)));
    gl_FragColor = vec4(vec3(1.0) * day, a * day * 0.85);
  }
`;

// ── CPU value-noise for mesh displacement (rocky bodies) ───────────────────
const fract = (x: number) => x - Math.floor(x);
function h3(x: number, y: number, z: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
}
function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c000 = h3(xi, yi, zi), c100 = h3(xi + 1, yi, zi), c010 = h3(xi, yi + 1, zi), c110 = h3(xi + 1, yi + 1, zi);
  const c001 = h3(xi, yi, zi + 1), c101 = h3(xi + 1, yi, zi + 1), c011 = h3(xi, yi + 1, zi + 1), c111 = h3(xi + 1, yi + 1, zi + 1);
  const x00 = lerp(c000, c100, u), x10 = lerp(c010, c110, u), x01 = lerp(c001, c101, u), x11 = lerp(c011, c111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
function fbm3(x: number, y: number, z: number): number {
  let f = 0, a = 0.5, fr = 1;
  for (let i = 0; i < 5; i++) {
    f += a * vnoise(x * fr, y * fr, z * fr);
    fr *= 2.0;
    a *= 0.5;
  }
  return f;
}
const gauss = () => Math.random() + Math.random() + Math.random() - 1.5;
function smoothstep01(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

type Update = (t: number) => void;

// ── Per-type builders. Each adds objects to the scene and returns update(t). ─
function buildPlanet(scene: THREE.Scene, bag: DisposalBag, L: THREE.Vector3): Update {
  const R = 2.2;
  const g = new THREE.Group();
  scene.add(g);
  const geo = bag.add(new THREE.SphereGeometry(R, 128, 128));
  const mat = bag.add(new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uLightDir: { value: L } }, vertexShader: BODY_VERT, fragmentShader: TERRA_FRAG }));
  const planet = new THREE.Mesh(geo, mat);
  planet.rotation.z = 0.3;
  g.add(planet);

  const cgeo = bag.add(new THREE.SphereGeometry(R * 1.02, 96, 96));
  const cmat = bag.add(new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uLightDir: { value: L } }, vertexShader: BODY_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false }));
  const clouds = new THREE.Mesh(cgeo, cmat);
  clouds.rotation.z = 0.3;
  g.add(clouds);

  const ageo = bag.add(new THREE.SphereGeometry(R * 1.07, 64, 64));
  const amat = bag.add(new THREE.ShaderMaterial({ uniforms: { uAtmo: { value: new THREE.Color(0x6fc0ff) }, uLightDir: { value: L } }, vertexShader: BODY_VERT, fragmentShader: ATMO_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(new THREE.Mesh(ageo, amat));

  return (t) => {
    mat.uniforms.uTime.value = t;
    cmat.uniforms.uTime.value = t;
    planet.rotation.y += 0.0015;
    clouds.rotation.y += 0.0019;
  };
}

function buildRinged(scene: THREE.Scene, bag: DisposalBag, L: THREE.Vector3, sprite: THREE.Texture): Update {
  const R = 2.0;
  const g = new THREE.Group();
  g.rotation.z = 0.2;
  scene.add(g);
  const geo = bag.add(new THREE.SphereGeometry(R, 128, 128));
  const mat = bag.add(new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uLightDir: { value: L } }, vertexShader: BODY_VERT, fragmentShader: GAS_FRAG }));
  const planet = new THREE.Mesh(geo, mat);
  g.add(planet);

  const ageo = bag.add(new THREE.SphereGeometry(R * 1.05, 64, 64));
  const amat = bag.add(new THREE.ShaderMaterial({ uniforms: { uAtmo: { value: new THREE.Color(0xffcf8a) }, uLightDir: { value: L } }, vertexShader: BODY_VERT, fragmentShader: ATMO_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(new THREE.Mesh(ageo, amat));

  const count = 16000;
  const inner = R * 1.4, outer = R * 2.6;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const cIn = new THREE.Color(0xfff0cf), cOut = new THREE.Color(0xcfa86a);
  for (let i = 0; i < count; i++) {
    const rr = inner + Math.random() * (outer - inner);
    const f = (rr - inner) / (outer - inner);
    const ang = Math.random() * Math.PI * 2;
    const dens = 0.45 + 0.55 * Math.sin(f * 26.0);
    pos[i * 3] = Math.cos(ang) * rr;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 0.04 * R;
    pos[i * 3 + 2] = Math.sin(ang) * rr;
    const c = cIn.clone().lerp(cOut, f);
    const b = 0.45 + dens * 0.55;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
  }
  const rgeo = bag.add(new THREE.BufferGeometry());
  rgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  rgeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const rmat = bag.add(new THREE.PointsMaterial({ map: sprite, size: 0.1, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const ring = new THREE.Points(rgeo, rmat);
  ring.rotation.x = Math.PI / 2.4;
  g.add(ring);

  return (t) => {
    mat.uniforms.uTime.value = t;
    planet.rotation.y += 0.0014;
    ring.rotation.z += 0.0005;
  };
}

function buildStar(scene: THREE.Scene, bag: DisposalBag, sprite: THREE.Texture): Update {
  const R = 2.4;
  const geo = bag.add(new THREE.SphereGeometry(R, 128, 128));
  const mat = bag.add(new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: BODY_VERT, fragmentShader: STAR_FRAG }));
  const star = new THREE.Mesh(geo, mat);
  scene.add(star);

  const coronaMat = bag.add(new THREE.SpriteMaterial({ map: sprite, color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
  const corona = new THREE.Sprite(coronaMat);
  corona.scale.setScalar(R * 5.0);
  scene.add(corona);

  const count = 3000;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = R * (1.0 + Math.random() * 0.6);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }
  const fgeo = bag.add(new THREE.BufferGeometry());
  fgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const fmat = bag.add(new THREE.PointsMaterial({ map: sprite, color: 0xffae3a, size: 0.18, sizeAttenuation: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  const flares = new THREE.Points(fgeo, fmat);
  scene.add(flares);

  return (t) => {
    mat.uniforms.uTime.value = t;
    star.rotation.y += 0.0009;
    flares.rotation.y -= 0.0006;
    const pulse = 1 + Math.sin(t * 1.5) * 0.04;
    corona.scale.setScalar(R * 5.0 * pulse);
    coronaMat.opacity = 0.8 + Math.sin(t * 2.0) * 0.1;
  };
}

function displacedRock(R: number, detail: number, amp: number, elong: THREE.Vector3, color: number, bag: DisposalBag): THREE.Mesh {
  const geo = bag.add(new THREE.IcosahedronGeometry(R, detail));
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const nx = x / len, ny = y / len, nz = z / len;
    const big = fbm3(nx * 1.6 + 5, ny * 1.6, nz * 1.6) - 0.5;
    const crater = Math.pow(vnoise(nx * 4 + 11, ny * 4, nz * 4), 3.0);
    const d = 1 + big * amp - crater * amp * 0.8;
    pos.setXYZ(i, nx * R * d * elong.x, ny * R * d * elong.y, nz * R * d * elong.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mat = bag.add(new THREE.MeshStandardMaterial({ color, roughness: 1.0, metalness: 0.0 }));
  return new THREE.Mesh(geo, mat);
}

function buildMoon(scene: THREE.Scene, bag: DisposalBag): Update {
  const moon = displacedRock(2.1, 5, 0.07, new THREE.Vector3(1, 1, 1), 0x9aa0a8, bag);
  scene.add(moon);
  return () => {
    moon.rotation.y += 0.0008;
  };
}

function buildAsteroid(scene: THREE.Scene, bag: DisposalBag): Update {
  const rock = displacedRock(2.0, 4, 0.28, new THREE.Vector3(1.35, 0.85, 1.0), 0x7a6450, bag);
  scene.add(rock);
  const debris: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const d = displacedRock(0.18 + Math.random() * 0.18, 2, 0.4, new THREE.Vector3(1.2, 0.9, 1), 0x6f5a47, bag);
    const a = Math.random() * Math.PI * 2;
    d.position.set(Math.cos(a) * 3.4, gauss() * 1.4, Math.sin(a) * 3.4);
    scene.add(d);
    debris.push(d);
  }
  return () => {
    rock.rotation.y += 0.0016;
    rock.rotation.x += 0.0006;
    debris.forEach((d, i) => {
      d.rotation.y += 0.01 + i * 0.002;
      d.rotation.x += 0.008;
    });
  };
}

function buildComet(scene: THREE.Scene, bag: DisposalBag, L: THREE.Vector3, sprite: THREE.Texture): Update {
  const away = L.clone().multiplyScalar(-1).normalize();
  const perp = new THREE.Vector3(0, 1, 0).cross(away).normalize();
  const nucleus = displacedRock(0.55, 3, 0.35, new THREE.Vector3(1.2, 0.9, 1), 0x8a8170, bag);
  scene.add(nucleus);

  const comaMat = bag.add(new THREE.SpriteMaterial({ map: sprite, color: 0x9fe6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
  const coma = new THREE.Sprite(comaMat);
  coma.scale.setScalar(2.6);
  scene.add(coma);

  const makeTail = (count: number, length: number, spread: number, color: number, curve: number, size: number) => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const f = Math.pow(Math.random(), 0.6);
      const along = away.clone().multiplyScalar(f * length);
      const side = perp.clone().multiplyScalar(gauss() * spread * (0.3 + f) + curve * f * f * length * 0.2);
      const up = new THREE.Vector3(0, 1, 0).multiplyScalar(gauss() * spread * (0.3 + f));
      const vv = along.add(side).add(up);
      pos[i * 3] = vv.x; pos[i * 3 + 1] = vv.y; pos[i * 3 + 2] = vv.z;
      const b = 1 - f * 0.85;
      col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    }
    const geo = bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = bag.add(new THREE.PointsMaterial({ map: sprite, size, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    return pts;
  };
  const ionTail = makeTail(6000, 14, 0.25, 0x6fd0ff, 0.0, 0.16);
  makeTail(5000, 9, 0.6, 0xffd9a0, 1.0, 0.2);

  return (t) => {
    nucleus.rotation.y += 0.004;
    comaMat.opacity = 0.7 + Math.sin(t * 4.0) * 0.08;
    (ionTail.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(t * 3.0) * 0.1;
  };
}

function buildNebula(scene: THREE.Scene, bag: DisposalBag, sprite: THREE.Texture): Update {
  const g = new THREE.Group();
  scene.add(g);
  const PALETTE = [0x8a3bd6, 0x3b6fd6, 0xd64f93, 0x3bd6c0];

  const envCount = 22000;
  const epos: number[] = [];
  const ecol: number[] = [];
  let guard = 0;
  while (epos.length / 3 < envCount && guard < envCount * 6) {
    guard++;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 6 * Math.cbrt(Math.random());
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta) * 0.8;
    const z = r * Math.cos(phi);
    const density = fbm3(x * 0.35 + 3, y * 0.35, z * 0.35);
    if (density < 0.45) continue;
    epos.push(x, y, z);
    const c = new THREE.Color(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    const b = 0.4 + density * 0.6;
    ecol.push(c.r * b, c.g * b, c.b * b);
  }
  const egeo = bag.add(new THREE.BufferGeometry());
  egeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(epos), 3));
  egeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(ecol), 3));
  const emat = bag.add(new THREE.PointsMaterial({ map: sprite, size: 0.5, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(new THREE.Points(egeo, emat));

  const strands = 60;
  const perStrand = 220;
  const fpos: number[] = [];
  const fcol: number[] = [];
  for (let s = 0; s < strands; s++) {
    let p = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8);
    const c = new THREE.Color(PALETTE[s % PALETTE.length]).lerp(new THREE.Color(0xffffff), 0.3);
    for (let i = 0; i < perStrand; i++) {
      const dir = new THREE.Vector3(
        fbm3(p.x * 0.3, p.y * 0.3, p.z * 0.3 + 10) - 0.5,
        fbm3(p.x * 0.3 + 20, p.y * 0.3, p.z * 0.3) - 0.5,
        fbm3(p.x * 0.3, p.y * 0.3 + 30, p.z * 0.3) - 0.5,
      ).normalize().multiplyScalar(0.16);
      p = p.clone().add(dir);
      if (p.length() > 7) break;
      fpos.push(p.x, p.y, p.z);
      fcol.push(c.r, c.g, c.b);
    }
  }
  const fgeo = bag.add(new THREE.BufferGeometry());
  fgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(fpos), 3));
  fgeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(fcol), 3));
  const fmat = bag.add(new THREE.PointsMaterial({ map: sprite, size: 0.34, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(new THREE.Points(fgeo, fmat));

  const coreMat = bag.add(new THREE.SpriteMaterial({ map: sprite, color: 0xead6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
  const core = new THREE.Sprite(coreMat);
  core.scale.setScalar(3);
  g.add(core);

  return (t) => {
    g.rotation.y += 0.0004;
    coreMat.opacity = 0.75 + Math.sin(t * 1.2) * 0.1;
  };
}

function buildBlackHole(scene: THREE.Scene, bag: DisposalBag, sprite: THREE.Texture): Update {
  const g = new THREE.Group();
  g.rotation.x = 0.45;
  scene.add(g);

  const ehGeo = bag.add(new THREE.SphereGeometry(1.2, 64, 64));
  const ehMat = bag.add(new THREE.MeshBasicMaterial({ color: 0x000000 }));
  g.add(new THREE.Mesh(ehGeo, ehMat));

  const prGeo = bag.add(new THREE.TorusGeometry(1.35, 0.04, 16, 128));
  const prMat = bag.add(new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, blending: THREE.AdditiveBlending }));
  const photon = new THREE.Mesh(prGeo, prMat);
  photon.rotation.x = Math.PI / 2;
  g.add(photon);

  const count = 24000;
  const inner = 1.5, outer = 5.2;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const f = Math.pow(Math.random(), 0.6);
    const rr = inner + f * (outer - inner);
    const ang = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(ang) * rr;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 0.08 * rr;
    pos[i * 3 + 2] = Math.sin(ang) * rr;
    const beam = Math.cos(ang);
    const heat = 1 - f;
    const c = new THREE.Color().setHSL(0.58 - heat * 0.18 + beam * 0.05, 0.9, 0.5 + beam * 0.18 + heat * 0.15);
    const b = 0.4 + heat * 0.6 + Math.max(beam, 0) * 0.4;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
  }
  const dgeo = bag.add(new THREE.BufferGeometry());
  dgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  dgeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const dmat = bag.add(new THREE.PointsMaterial({ map: sprite, size: 0.11, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  const disk = new THREE.Points(dgeo, dmat);
  g.add(disk);

  const jpos: number[] = [];
  const jcol: number[] = [];
  for (let i = 0; i < 2500; i++) {
    const f = Math.random();
    const sign = Math.random() < 0.5 ? 1 : -1;
    const spread = 0.05 + f * 0.5;
    jpos.push(gauss() * spread, sign * f * 7, gauss() * spread);
    const c = new THREE.Color().setHSL(0.55, 0.9, 0.5 + (1 - f) * 0.3);
    jcol.push(c.r, c.g, c.b);
  }
  const jgeo = bag.add(new THREE.BufferGeometry());
  jgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(jpos), 3));
  jgeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(jcol), 3));
  const jmat = bag.add(new THREE.PointsMaterial({ map: sprite, size: 0.14, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(new THREE.Points(jgeo, jmat));

  return () => {
    disk.rotation.y += 0.006;
  };
}

function buildGalaxy(scene: THREE.Scene, bag: DisposalBag, sprite: THREE.Texture): Update {
  const g = new THREE.Group();
  g.rotation.x = 1.1;
  scene.add(g);
  const arms = 4;
  const maxR = 8;
  const count = 60000;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const core = new THREE.Color(0xffe6a8);
  const armC = new THREE.Color(0x6fa8ff);
  const hii = new THREE.Color(0xff6fae);
  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 0.6) * maxR;
    const arm = Math.floor(Math.random() * arms);
    const spin = r * 0.55;
    const spread = (1 - r / maxR) * 0.4 + 0.12;
    const ang = (arm / arms) * Math.PI * 2 + spin + gauss() * spread;
    pos[i * 3] = Math.cos(ang) * r + gauss() * 0.25;
    pos[i * 3 + 1] = gauss() * (0.3 + 0.6 * Math.exp(-r * 0.4));
    pos[i * 3 + 2] = Math.sin(ang) * r + gauss() * 0.25;
    const f = r / maxR;
    let c = core.clone().lerp(armC, smoothstep01(f, 0.05, 0.6));
    if (Math.random() < 0.04 && f > 0.25) c = c.lerp(hii, 0.7);
    const b = 0.5 + (1 - f) * 0.7;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
  }
  const geo = bag.add(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = bag.add(new THREE.PointsMaterial({ map: sprite, size: 0.12, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(new THREE.Points(geo, mat));

  const coreMat = bag.add(new THREE.SpriteMaterial({ map: sprite, color: 0xfff0cc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
  const bulge = new THREE.Sprite(coreMat);
  bulge.scale.setScalar(3.2);
  g.add(bulge);

  return () => {
    g.rotation.z += 0.0006;
  };
}

const CAM_DIST: Record<string, number> = {
  planet: 7,
  ringed_planet: 8,
  star: 9,
  moon: 6.5,
  asteroid: 6.5,
  comet: 13,
  nebula: 17,
  black_hole: 12,
  galaxy: 20,
};

export default function ExploreScene({ objectType }: ExploreSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const type = objectType ?? "planet";
    const bag = new DisposalBag();
    const renderer = makeRenderer(canvas, 0x00010a);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x00010a, 0.001);
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 4000);

    const far = buildStarfield(scene, bag, 9000, 700, 1100, 0.5, 0.7, 0.8);
    const near = buildStarfield(scene, bag, 1800, 400, 700, 0.9, 0.85, 0.95);

    const L = new THREE.Vector3(-0.55, 0.4, 0.75).normalize();
    scene.add(new THREE.AmbientLight(0x223044, 0.7));
    const key = new THREE.PointLight(0xfff2dc, 2.6, 0, 0);
    key.position.copy(L.clone().multiplyScalar(40));
    scene.add(key);
    const rim = new THREE.PointLight(0x335588, 1.1, 0, 0);
    rim.position.copy(L.clone().multiplyScalar(-30));
    scene.add(rim);

    const sprite = bag.add(radialSprite("rgba(255,255,255,0.95)", "rgba(255,255,255,0)"));

    const builders: Record<string, () => Update> = {
      planet: () => buildPlanet(scene, bag, L),
      ringed_planet: () => buildRinged(scene, bag, L, sprite),
      star: () => buildStar(scene, bag, sprite),
      moon: () => buildMoon(scene, bag),
      asteroid: () => buildAsteroid(scene, bag),
      comet: () => buildComet(scene, bag, L, sprite),
      nebula: () => buildNebula(scene, bag, sprite),
      black_hole: () => buildBlackHole(scene, bag, sprite),
      galaxy: () => buildGalaxy(scene, bag, sprite),
    };
    const update = (builders[type] ?? builders.planet)();
    const camDist = CAM_DIST[type] ?? 8;

    const bright = type === "star" || type === "black_hole" || type === "nebula" || type === "galaxy";
    const { composer, bloom } = makeBloomComposer(renderer, scene, camera, { strength: bright ? 0.85 : 0.55, radius: 0.75, threshold: 0.55 });

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

    const clock = new THREE.Clock();
    let theta = 0;
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      update(t);
      far.rotation.y += 0.00002;
      near.rotation.y += 0.00004;

      theta += 0.0009;
      const az = theta + pointerRef.current.x * 0.5;
      const el = 0.12 - pointerRef.current.y * 0.35;
      camera.position.set(
        Math.sin(az) * Math.cos(el) * camDist,
        Math.sin(el) * camDist,
        Math.cos(az) * Math.cos(el) * camDist,
      );
      camera.lookAt(0, 0, 0);
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

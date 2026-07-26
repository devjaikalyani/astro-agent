// Deep-field scene builders: fully volumetric, procedural 3D for every
// object class beyond the navigable solar system. All objects mount into a
// dedicated group so the universe engine can swap system <-> deep field.

import * as THREE from "three";
import { DisposalBag, fbm3, gauss, smoothstep01, vnoise } from "./core";
import { ATMO_FRAG, BODY_VERT, GAS_FRAG, ICY_FRAG, STAR_FRAG, TERRA_FRAG } from "./shaders";

export type DeepType =
  | "planet"
  | "ringed_planet"
  | "star"
  | "moon"
  | "asteroid"
  | "comet"
  | "nebula"
  | "black_hole"
  | "galaxy";

export interface DeepScene {
  update: (t: number) => void;
  camDist: number;
  bloom: { strength: number; threshold: number };
}

type Ctx = { g: THREE.Group; bag: DisposalBag; sprite: THREE.Texture; L: THREE.Vector3 };

function shaderMat(bag: DisposalBag, frag: string, uniforms: Record<string, { value: unknown }>) {
  return bag.add(
    new THREE.ShaderMaterial({ uniforms, vertexShader: BODY_VERT, fragmentShader: frag }),
  );
}

function atmoShell(ctx: Ctx, R: number, color: number) {
  const geo = ctx.bag.add(new THREE.SphereGeometry(R, 64, 64));
  const mat = ctx.bag.add(
    new THREE.ShaderMaterial({
      uniforms: { uAtmo: { value: new THREE.Color(color) }, uLightDir: { value: ctx.L } },
      vertexShader: BODY_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  ctx.g.add(new THREE.Mesh(geo, mat));
}

function particleRing(ctx: Ctx, inner: number, outer: number, count: number, cIn: number, cOut: number, tiltX: number) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const a = new THREE.Color(cIn),
    b = new THREE.Color(cOut);
  for (let i = 0; i < count; i++) {
    const rr = inner + Math.random() * (outer - inner);
    const f = (rr - inner) / (outer - inner);
    const ang = Math.random() * Math.PI * 2;
    const dens = 0.45 + 0.55 * Math.sin(f * 26.0);
    pos[i * 3] = Math.cos(ang) * rr;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
    pos[i * 3 + 2] = Math.sin(ang) * rr;
    const c = a.clone().lerp(b, f);
    const br = 0.45 + dens * 0.55;
    col[i * 3] = c.r * br;
    col[i * 3 + 1] = c.g * br;
    col[i * 3 + 2] = c.b * br;
  }
  const geo = ctx.bag.add(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = ctx.bag.add(
    new THREE.PointsMaterial({
      map: ctx.sprite,
      size: 0.1,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const ring = new THREE.Points(geo, mat);
  ring.rotation.x = tiltX;
  ctx.g.add(ring);
  return ring;
}

export function displacedRock(bag: DisposalBag, R: number, detail: number, amp: number, elong: THREE.Vector3, color: number) {
  const geo = bag.add(new THREE.IcosahedronGeometry(R, detail));
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const nx = x / len,
      ny = y / len,
      nz = z / len;
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

// ── Builders ────────────────────────────────────────────────────────────────

function buildStar(ctx: Ctx, name: string): DeepScene {
  const red = /betelgeuse|antares|aldebaran|mira|red (giant|dwarf|super)|uy scuti|vy|proxima|wolf|trappist/i.test(name);
  const blue = /rigel|spica|bellatrix|blue|o[- ]type|b[- ]type|neutron|pulsar|psr|white dwarf|sirius b/i.test(name);
  const R = 2.4;
  const cool = blue ? new THREE.Color(0.4, 0.55, 1.0) : red ? new THREE.Color(0.5, 0.06, 0.01) : new THREE.Color(0.85, 0.18, 0.02);
  const mid = blue ? new THREE.Color(0.65, 0.8, 1.0) : red ? new THREE.Color(0.9, 0.28, 0.05) : new THREE.Color(1.0, 0.55, 0.12);
  const hot = blue ? new THREE.Color(0.9, 0.97, 1.0) : red ? new THREE.Color(1.0, 0.62, 0.3) : new THREE.Color(1.0, 0.94, 0.66);

  const mat = shaderMat(ctx.bag, STAR_FRAG, {
    uTime: { value: 0 },
    uCool: { value: cool },
    uMid: { value: mid },
    uHot: { value: hot },
  });
  const star = new THREE.Mesh(ctx.bag.add(new THREE.SphereGeometry(R, 128, 128)), mat);
  ctx.g.add(star);

  const coronaColor = blue ? 0x9fc8ff : red ? 0xff7a3a : 0xffd27a;
  const coronaMat = ctx.bag.add(
    new THREE.SpriteMaterial({ map: ctx.sprite, color: coronaColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }),
  );
  const corona = new THREE.Sprite(coronaMat);
  corona.scale.setScalar(R * 5.0);
  ctx.g.add(corona);

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
  const fgeo = ctx.bag.add(new THREE.BufferGeometry());
  fgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const fmat = ctx.bag.add(
    new THREE.PointsMaterial({ map: ctx.sprite, color: coronaColor, size: 0.18, sizeAttenuation: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const flares = new THREE.Points(fgeo, fmat);
  ctx.g.add(flares);

  return {
    camDist: 9,
    bloom: { strength: 0.7, threshold: 0.62 },
    update: (t) => {
      mat.uniforms.uTime.value = t;
      star.rotation.y += 0.0009;
      flares.rotation.y -= 0.0006;
      const pulse = 1 + Math.sin(t * 1.5) * 0.04;
      corona.scale.setScalar(R * 5.0 * pulse);
      coronaMat.opacity = 0.8 + Math.sin(t * 2.0) * 0.1;
    },
  };
}

function buildPlanet(ctx: Ctx): DeepScene {
  const R = 2.2;
  const mat = shaderMat(ctx.bag, TERRA_FRAG, { uTime: { value: 0 }, uLightDir: { value: ctx.L } });
  const planet = new THREE.Mesh(ctx.bag.add(new THREE.SphereGeometry(R, 128, 128)), mat);
  planet.rotation.z = 0.3;
  ctx.g.add(planet);
  atmoShell(ctx, R * 1.07, 0x6fc0ff);
  return {
    camDist: 7,
    bloom: { strength: 0.45, threshold: 0.62 },
    update: (t) => {
      mat.uniforms.uTime.value = t;
      planet.rotation.y += 0.0015;
    },
  };
}

function buildRinged(ctx: Ctx): DeepScene {
  const R = 2.0;
  const mat = shaderMat(ctx.bag, GAS_FRAG, {
    uTime: { value: 0 },
    uLightDir: { value: ctx.L },
    uA: { value: new THREE.Color(0.32, 0.22, 0.12) },
    uB: { value: new THREE.Color(0.78, 0.62, 0.36) },
    uC: { value: new THREE.Color(0.96, 0.9, 0.72) },
  });
  const planet = new THREE.Mesh(ctx.bag.add(new THREE.SphereGeometry(R, 128, 128)), mat);
  ctx.g.add(planet);
  ctx.g.rotation.z = 0.2;
  atmoShell(ctx, R * 1.05, 0xffcf8a);
  const ring = particleRing(ctx, R * 1.4, R * 2.6, 16000, 0xfff0cf, 0xcfa86a, Math.PI / 2.4);
  return {
    camDist: 8,
    bloom: { strength: 0.5, threshold: 0.62 },
    update: (t) => {
      mat.uniforms.uTime.value = t;
      planet.rotation.y += 0.0014;
      ring.rotation.z += 0.0005;
    },
  };
}

function buildMoon(ctx: Ctx, name: string): DeepScene {
  const icy = /europa|enceladus|ganymede|callisto|mimas|tethys|dione|rhea|titan|triton|charon|pluto|ceres/i.test(name);
  if (icy) {
    const mat = shaderMat(ctx.bag, ICY_FRAG, { uTime: { value: 0 }, uLightDir: { value: ctx.L } });
    const moon = new THREE.Mesh(ctx.bag.add(new THREE.SphereGeometry(2.1, 144, 144)), mat);
    ctx.g.add(moon);
    return {
      camDist: 6.5,
      bloom: { strength: 0.4, threshold: 0.66 },
      update: (t) => {
        mat.uniforms.uTime.value = t;
        moon.rotation.y += 0.0008;
      },
    };
  }
  const moon = displacedRock(ctx.bag, 2.1, 5, 0.07, new THREE.Vector3(1, 1, 1), 0x9aa0a8);
  ctx.g.add(moon);
  return {
    camDist: 6.5,
    bloom: { strength: 0.4, threshold: 0.66 },
    update: () => {
      moon.rotation.y += 0.0008;
    },
  };
}

function buildAsteroid(ctx: Ctx): DeepScene {
  const rock = displacedRock(ctx.bag, 2.0, 4, 0.28, new THREE.Vector3(1.35, 0.85, 1.0), 0x7a6450);
  ctx.g.add(rock);
  const debris: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const d = displacedRock(ctx.bag, 0.18 + Math.random() * 0.18, 2, 0.4, new THREE.Vector3(1.2, 0.9, 1), 0x6f5a47);
    const a = Math.random() * Math.PI * 2;
    d.position.set(Math.cos(a) * 3.4, gauss() * 1.4, Math.sin(a) * 3.4);
    ctx.g.add(d);
    debris.push(d);
  }
  return {
    camDist: 6.5,
    bloom: { strength: 0.35, threshold: 0.7 },
    update: () => {
      rock.rotation.y += 0.0016;
      rock.rotation.x += 0.0006;
      debris.forEach((d, i) => {
        d.rotation.y += 0.01 + i * 0.002;
        d.rotation.x += 0.008;
      });
    },
  };
}

function buildComet(ctx: Ctx): DeepScene {
  const away = ctx.L.clone().multiplyScalar(-1).normalize();
  const perp = new THREE.Vector3(0, 1, 0).cross(away).normalize();
  const nucleus = displacedRock(ctx.bag, 0.55, 3, 0.35, new THREE.Vector3(1.2, 0.9, 1), 0x8a8170);
  ctx.g.add(nucleus);

  const comaMat = ctx.bag.add(
    new THREE.SpriteMaterial({ map: ctx.sprite, color: 0x9fe6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }),
  );
  const coma = new THREE.Sprite(comaMat);
  coma.scale.setScalar(2.6);
  ctx.g.add(coma);

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
      pos[i * 3] = vv.x;
      pos[i * 3 + 1] = vv.y;
      pos[i * 3 + 2] = vv.z;
      const b = 1 - f * 0.85;
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
    }
    const geo = ctx.bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = ctx.bag.add(
      new THREE.PointsMaterial({ map: ctx.sprite, size, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const pts = new THREE.Points(geo, mat);
    ctx.g.add(pts);
    return pts;
  };
  const ion = makeTail(6000, 14, 0.25, 0x6fd0ff, 0.0, 0.16);
  makeTail(5000, 9, 0.6, 0xffd9a0, 1.0, 0.2);

  return {
    camDist: 13,
    bloom: { strength: 0.55, threshold: 0.6 },
    update: (t) => {
      nucleus.rotation.y += 0.004;
      comaMat.opacity = 0.7 + Math.sin(t * 4.0) * 0.08;
      (ion.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(t * 3.0) * 0.1;
    },
  };
}

function buildNebula(ctx: Ctx): DeepScene {
  const SX = 1.18,
    SY = 0.92,
    SZ = 1.0,
    RAD = 5.2;
  const ovoidR = (x: number, y: number, z: number) =>
    Math.sqrt((x / (RAD * SX)) ** 2 + (y / (RAD * SY)) ** 2 + (z / (RAD * SZ)) ** 2);

  const addPoints = (pos: number[], col: number[], size: number, opacity: number, blend: THREE.Blending) => {
    const geo = ctx.bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    const mat = ctx.bag.add(
      new THREE.PointsMaterial({ map: ctx.sprite, size, vertexColors: true, sizeAttenuation: true, transparent: true, opacity, blending: blend, depthWrite: false }),
    );
    ctx.g.add(new THREE.Points(geo, mat));
  };

  // Blue synchrotron body — normal blending, carved with dark bays.
  {
    const target = 15000;
    const pos: number[] = [],
      col: number[] = [];
    const ca = new THREE.Color(0x3a4ec4),
      cb = new THREE.Color(0x6356c6);
    let guard = 0;
    while (pos.length / 3 < target && guard < target * 8) {
      guard++;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const rr = Math.pow(Math.random(), 0.5);
      const x = rr * Math.sin(phi) * Math.cos(theta) * RAD * SX;
      const y = rr * Math.sin(phi) * Math.sin(theta) * RAD * SY;
      const z = rr * Math.cos(phi) * RAD * SZ;
      if (fbm3(x * 0.42 + 2, y * 0.42, z * 0.42 + 7) < 0.52) continue;
      pos.push(x, y, z);
      const c = ca.clone().lerp(cb, Math.random());
      const b = 0.4 + (1 - rr) * 0.45;
      col.push(c.r * b, c.g * b, c.b * b);
    }
    addPoints(pos, col, 0.72, 0.3, THREE.NormalBlending);
  }

  // Filament cage — additive fibrous web with a red belt.
  {
    const beltCols = [0xff3b44, 0xff4d63, 0xff6f93];
    const webCols = [0xc94fd0, 0xe05fb4, 0x9b6fff, 0xff5fa8];
    const strands = 500,
      perStrand = 120,
      step = 0.05;
    const pos: number[] = [],
      col: number[] = [];
    for (let s = 0; s < strands; s++) {
      const belt = Math.random() < 0.4;
      let p: THREE.Vector3;
      if (belt) {
        const a = Math.random() * Math.PI * 2,
          rr = 1.3 + Math.random() * 2.8;
        p = new THREE.Vector3(Math.cos(a) * rr * SX, gauss() * 0.85, Math.sin(a) * rr * SZ);
      } else {
        const theta = Math.random() * Math.PI * 2,
          phi = Math.acos(2 * Math.random() - 1),
          rr = Math.pow(Math.random(), 0.45);
        p = new THREE.Vector3(
          rr * Math.sin(phi) * Math.cos(theta) * RAD * SX,
          rr * Math.sin(phi) * Math.sin(theta) * RAD * SY,
          rr * Math.cos(phi) * RAD * SZ,
        );
      }
      const pool = belt ? beltCols : webCols;
      const baseC = new THREE.Color(pool[Math.floor(Math.random() * pool.length)]);
      const strandBright = (belt ? 0.55 : 0.38) + Math.random() * 0.35;
      for (let i = 0; i < perStrand; i++) {
        const dir = new THREE.Vector3(
          fbm3(p.x * 0.6, p.y * 0.6, p.z * 0.6 + 10) - 0.5,
          fbm3(p.x * 0.6 + 20, p.y * 0.6, p.z * 0.6) - 0.5,
          fbm3(p.x * 0.6, p.y * 0.6 + 30, p.z * 0.6) - 0.5,
        )
          .normalize()
          .multiplyScalar(step);
        p = p.clone().add(dir);
        const rad = ovoidR(p.x, p.y, p.z);
        if (rad > 1.08) break;
        const b = strandBright * (1 - rad * 0.3);
        pos.push(p.x, p.y, p.z);
        col.push(baseC.r * b, baseC.g * b, baseC.b * b);
      }
    }
    addPoints(pos, col, 0.13, 0.5, THREE.AdditiveBlending);
  }

  // Pulsar heart.
  const pulsarMat = ctx.bag.add(
    new THREE.SpriteMaterial({ map: ctx.sprite, color: 0xc8e6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }),
  );
  const pulsar = new THREE.Sprite(pulsarMat);
  pulsar.scale.setScalar(0.4);
  ctx.g.add(pulsar);

  return {
    camDist: 14,
    bloom: { strength: 0.3, threshold: 0.68 },
    update: (t) => {
      ctx.g.rotation.y += 0.0003;
      pulsarMat.opacity = 0.55 + Math.sin(t * 5.0) * 0.35;
    },
  };
}

function buildBlackHole(ctx: Ctx): DeepScene {
  ctx.g.rotation.x = 0.45;

  const eh = new THREE.Mesh(
    ctx.bag.add(new THREE.SphereGeometry(1.2, 64, 64)),
    ctx.bag.add(new THREE.MeshBasicMaterial({ color: 0x000000 })),
  );
  ctx.g.add(eh);

  const photon = new THREE.Mesh(
    ctx.bag.add(new THREE.TorusGeometry(1.35, 0.04, 16, 128)),
    ctx.bag.add(new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, blending: THREE.AdditiveBlending })),
  );
  photon.rotation.x = Math.PI / 2;
  ctx.g.add(photon);

  const count = 24000;
  const inner = 1.5,
    outer = 5.2;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const f = Math.pow(Math.random(), 0.6);
    const rr = inner + f * (outer - inner);
    const ang = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(ang) * rr;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 0.08 * rr;
    pos[i * 3 + 2] = Math.sin(ang) * rr;
    const beam = Math.cos(ang); // relativistic doppler beaming, approaching side brighter
    const heat = 1 - f;
    const c = new THREE.Color().setHSL(0.58 - heat * 0.18 + beam * 0.05, 0.9, 0.5 + beam * 0.18 + heat * 0.15);
    const b = 0.4 + heat * 0.6 + Math.max(beam, 0) * 0.4;
    col[i * 3] = c.r * b;
    col[i * 3 + 1] = c.g * b;
    col[i * 3 + 2] = c.b * b;
  }
  const dgeo = ctx.bag.add(new THREE.BufferGeometry());
  dgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  dgeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const dmat = ctx.bag.add(
    new THREE.PointsMaterial({ map: ctx.sprite, size: 0.11, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const disk = new THREE.Points(dgeo, dmat);
  ctx.g.add(disk);

  // Polar jets
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
  const jgeo = ctx.bag.add(new THREE.BufferGeometry());
  jgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(jpos), 3));
  jgeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(jcol), 3));
  const jmat = ctx.bag.add(
    new THREE.PointsMaterial({ map: ctx.sprite, size: 0.14, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  ctx.g.add(new THREE.Points(jgeo, jmat));

  return {
    camDist: 12,
    bloom: { strength: 0.8, threshold: 0.5 },
    update: () => {
      disk.rotation.y += 0.006;
    },
  };
}

function buildGalaxy(ctx: Ctx): DeepScene {
  ctx.g.rotation.x = 1.1;
  const arms = 4;
  const maxR = 8;
  const count = 55000;
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
    col[i * 3] = c.r * b;
    col[i * 3 + 1] = c.g * b;
    col[i * 3 + 2] = c.b * b;
  }
  const geo = ctx.bag.add(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = ctx.bag.add(
    new THREE.PointsMaterial({ map: ctx.sprite, size: 0.12, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  ctx.g.add(new THREE.Points(geo, mat));

  const coreMat = ctx.bag.add(
    new THREE.SpriteMaterial({ map: ctx.sprite, color: 0xfff0cc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }),
  );
  const bulge = new THREE.Sprite(coreMat);
  bulge.scale.setScalar(3.2);
  ctx.g.add(bulge);

  return {
    camDist: 20,
    bloom: { strength: 0.5, threshold: 0.6 },
    update: () => {
      ctx.g.rotation.z += 0.0006;
    },
  };
}

export function buildDeepScene(
  type: DeepType,
  name: string,
  group: THREE.Group,
  bag: DisposalBag,
  sprite: THREE.Texture,
  lightDir: THREE.Vector3,
): DeepScene {
  const ctx: Ctx = { g: group, bag, sprite, L: lightDir };
  switch (type) {
    case "star":
      return buildStar(ctx, name);
    case "ringed_planet":
      return buildRinged(ctx);
    case "moon":
      return buildMoon(ctx, name);
    case "asteroid":
      return buildAsteroid(ctx);
    case "comet":
      return buildComet(ctx);
    case "nebula":
      return buildNebula(ctx);
    case "black_hole":
      return buildBlackHole(ctx);
    case "galaxy":
      return buildGalaxy(ctx);
    default:
      return buildPlanet(ctx);
  }
}

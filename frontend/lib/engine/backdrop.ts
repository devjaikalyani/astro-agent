// The Journeys departure backdrop: a low sun over the ecliptic, worlds
// strung out toward the ice line, drifting dust — a platform before the
// voyage. Lightweight: sprites and points only, one bloom pass.

import * as THREE from "three";
import { DisposalBag, buildSkySphere, buildStarShell, makeBloom, makeRenderer, radialSprite } from "./core";

export interface Backdrop {
  dispose(): void;
}

const WORLD_TINTS = [0x9a8f80, 0xffd9a0, 0x6fb4ff, 0xd98a5a, 0xd8b48a, 0xe8d3a8, 0x9fd8e8, 0x6f8fff];

export function createBackdrop(canvas: HTMLCanvasElement): Backdrop {
  const bag = new DisposalBag();
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 8000);
  const loader = new THREE.TextureLoader();
  const sprite = bag.add(radialSprite("rgba(255,255,255,0.95)", "rgba(255,255,255,0)"));

  buildSkySphere(scene, bag, loader, 3000, 0.4);
  buildStarShell(scene, bag, 6000, 900, 2000, 2.0, 0.8, 0.8, sprite);

  // The sun, low and heavy on the left
  const sunPos = new THREE.Vector3(-46, -10, -60);
  const mkGlow = (color: number, scale: number, opacity: number) => {
    const m = bag.add(
      new THREE.SpriteMaterial({ map: sprite, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity }),
    );
    const s = new THREE.Sprite(m);
    s.position.copy(sunPos);
    s.scale.setScalar(scale);
    scene.add(s);
    return { s, m };
  };
  const core = mkGlow(0xfff2dc, 26, 0.95);
  const halo = mkGlow(0xffb454, 64, 0.5);
  const veil = mkGlow(0xff7847, 130, 0.22);

  // Worlds strung along the ecliptic, receding right into the dark
  const worlds: Array<{ s: THREE.Sprite; base: THREE.Vector3; ph: number }> = [];
  for (let i = 0; i < 8; i++) {
    const f = i / 7;
    const m = bag.add(
      new THREE.SpriteMaterial({ map: sprite, color: WORLD_TINTS[i], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 - f * 0.25 }),
    );
    const s = new THREE.Sprite(m);
    const base = new THREE.Vector3(-30 + i * 14 + f * f * 24, -9.4 + f * 4.2, -58 - f * 46);
    s.position.copy(base);
    s.scale.setScalar(1.4 - f * 0.75);
    scene.add(s);
    worlds.push({ s, base, ph: Math.random() * Math.PI * 2 });
  }

  // Ecliptic hairline
  {
    const pts = [new THREE.Vector3(-70, -10.4, -56), new THREE.Vector3(96, -3.6, -110)];
    const geo = bag.add(new THREE.BufferGeometry().setFromPoints(pts));
    const mat = bag.add(new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.18 }));
    scene.add(new THREE.Line(geo, mat));
  }

  // Drifting warm dust
  const dust = (() => {
    const count = 700;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 60 - 4;
      pos[i * 3 + 2] = -10 - Math.random() * 110;
    }
    const geo = bag.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = bag.add(
      new THREE.PointsMaterial({ map: sprite, color: 0xffcf9a, size: 0.34, sizeAttenuation: true, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    return pts;
  })();

  const { composer, bloom, finish } = makeBloom(renderer, scene, camera, { strength: 0.6, threshold: 0.5 });

  // Gentle sway + pointer parallax
  let px = 0,
    py = 0;
  const onPointer = (e: PointerEvent) => {
    px = (e.clientX / window.innerWidth) * 2 - 1;
    py = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener("pointermove", onPointer);

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

  const clock = new THREE.Clock();
  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    camera.position.set(Math.sin(t * 0.04) * 2.2 + px * 2.6, Math.cos(t * 0.05) * 1.4 - py * 1.8, 0);
    camera.lookAt(Math.sin(t * 0.03) * 3, -4, -70);

    const pulse = 1 + Math.sin(t * 1.1) * 0.035;
    core.s.scale.setScalar(26 * pulse);
    halo.m.opacity = 0.46 + Math.sin(t * 0.8) * 0.06;
    veil.m.opacity = 0.2 + Math.sin(t * 0.5 + 2) * 0.04;

    for (const w of worlds) {
      w.s.position.y = w.base.y + Math.sin(t * 0.3 + w.ph) * 0.5;
    }
    dust.rotation.y = Math.sin(t * 0.02) * 0.06;
    if (finish) finish.uniforms.uTime.value = t;

    composer.render();
  };
  animate();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      composer.dispose();
      renderer.dispose();
      bag.disposeAll();
    },
  };
}

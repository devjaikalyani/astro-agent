// GLSL chunks for ASTRO's volumetric scenes: Ashima 3D simplex noise,
// fbm/ridged helpers, shared body vertex shader, and surface shaders.

export const SIMPLEX_3D = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){
  float f=0.0; float amp=0.5; float freq=1.0;
  for(int i=0;i<6;i++){ f+=amp*snoise(p*freq); freq*=2.02; amp*=0.5; }
  return f;
}
float ridged(vec3 p){
  float f=0.0; float amp=0.5; float freq=1.0;
  for(int i=0;i<5;i++){ f+=amp*(1.0-abs(snoise(p*freq))); freq*=2.1; amp*=0.5; }
  return f;
}
`;

// Shared body vertex shader: object-space position (stable surface noise),
// world normal, world position (for view/fresnel math).
export const BODY_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  void main() {
    vLocal = position;
    vWorldN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Additive fresnel-rim atmosphere, brightest on the lit limb.
export const ATMO_FRAG = /* glsl */ `
  uniform vec3 uAtmo;
  uniform vec3 uLightDir;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vWorldN);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
    float lightSide = smoothstep(-0.35, 0.7, dot(N, normalize(uLightDir)));
    float a = fres * (0.22 + 0.78 * lightSide);
    gl_FragColor = vec4(uAtmo * a, a);
  }
`;

// Solar surface: granulation + convection cells, limb-darkened, HDR-bright.
export const STAR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCool;
  uniform vec3 uMid;
  uniform vec3 uHot;
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
    vec3 col = mix(uCool, uMid, smoothstep(0.1, 0.5, heat));
    col = mix(col, uHot, smoothstep(0.5, 0.92, heat));
    vec3 N = normalize(vWorldN);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float limb = pow(max(dot(N, V), 0.0), 0.5);
    col *= 0.7 + 0.55 * limb;
    col *= 2.2;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Banded gas giant with storm cells (procedural, for deep-space worlds).
export const GAS_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
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
    vec3 col = mix(uA, uB, smoothstep(-0.8, 0.8, bands));
    col = mix(col, uC, smoothstep(0.55, 0.95, storms) * 0.7);
    vec3 N = normalize(vWorldN);
    float d = dot(N, normalize(uLightDir));
    float day = smoothstep(-0.15, 0.65, d);
    float term = exp(-pow(d * 3.2, 2.0));
    vec3 lit = col * (0.05 + day * 1.1);
    lit += uC * term * 0.35;
    gl_FragColor = vec4(lit, 1.0);
  }
`;

// Terrestrial exoplanet: continents, oceans, ice caps.
export const TERRA_FRAG = /* glsl */ `
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
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── HD solar-system surface shaders ─────────────────────────────────────────

// Body vertex shader with UVs, for texture-mapped worlds.
export const BODY_UV_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vLocal = position;
    vUv = uv;
    vWorldN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Texture-mapped planet/moon lit by the Sun: soft terminator, limb
// darkening, warm terminator glow, optional night-light map (Earth) and
// ocean specular glint derived from the day map itself.
export const SURFACE_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uNight;
  uniform float uHasNight;
  uniform float uOcean;
  uniform vec3 uLightDir;
  uniform float uAmbient;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vec3 base = texture2D(uMap, vUv).rgb;
    vec3 N = normalize(vWorldN);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float d = dot(N, L);
    float day = smoothstep(-0.12, 0.35, d);
    float limb = 0.72 + 0.28 * pow(max(dot(N, V), 0.0), 0.6);
    vec3 col = base * (uAmbient + day * 1.06) * limb;
    // Warm band along the terminator
    float term = exp(-pow(d * 3.4, 2.0));
    col += base * vec3(1.0, 0.62, 0.32) * term * 0.22;
    // Ocean glint (Earth): mask oceans by blue dominance in the day map
    if (uOcean > 0.5) {
      float ocean = smoothstep(0.02, 0.12, base.b - max(base.r, base.g) + 0.02);
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 90.0) * ocean * day;
      col += vec3(1.0, 0.9, 0.7) * spec * 0.9;
    }
    // City lights fade in past the terminator
    if (uHasNight > 0.5) {
      vec3 night = texture2D(uNight, vUv).rgb;
      float dark = smoothstep(0.08, -0.22, d);
      col += night * vec3(1.0, 0.82, 0.55) * dark * 1.9;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

// The Sun: 4K surface map domain-warped by simplex noise, animated
// granulation, limb darkening, HDR-bright for bloom.
export const SUN_SURFACE_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  ${SIMPLEX_3D}
  void main() {
    vec3 p = normalize(vLocal);
    float t = uTime * 0.05;
    // Slow domain warp so the surface churns
    vec2 warp = vec2(
      snoise(p * 3.0 + vec3(t, 0.0, 0.0)),
      snoise(p * 3.0 + vec3(0.0, t, 4.0))
    ) * 0.006;
    vec3 base = texture2D(uMap, vUv + warp).rgb;
    float gran = fbm(p * 14.0 + vec3(uTime * 0.12, 0.0, 0.0));
    float cells = ridged(p * 5.0 - vec3(0.0, uTime * 0.06, 0.0));
    float heat = 0.78 + gran * 0.3 + cells * 0.18;
    vec3 col = base * heat;
    // Hot spots flare toward white
    col = mix(col, vec3(1.0, 0.97, 0.82), smoothstep(0.72, 0.98, gran * cells) * 0.5);
    vec3 N = normalize(vWorldN);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float limbF = pow(max(dot(N, V), 0.0), 0.45);
    col *= 0.62 + 0.58 * limbF;
    col *= 2.4;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Cloud sphere lit by the Sun; alpha from map luminance.
export const CLOUD_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLightDir;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uMap, vUv).rgb;
    float a = smoothstep(0.08, 0.65, dot(c, vec3(0.333)));
    vec3 N = normalize(vWorldN);
    float d = dot(N, normalize(uLightDir));
    float day = smoothstep(-0.12, 0.35, d);
    float term = exp(-pow(d * 3.4, 2.0));
    vec3 col = vec3(1.0) * (0.04 + day * 1.15);
    col += vec3(1.0, 0.6, 0.3) * term * 0.3;
    gl_FragColor = vec4(col, a * 0.92);
  }
`;

// Saturn's rings: radial strip texture, translucent, with the planet's
// shadow cast across the far side.
export const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const RING_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uPlanetPos;
  uniform float uPlanetR;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vec4 tex = texture2D(uMap, vec2(vUv.x, 0.5));
    // Sun sits at the world origin: shadow where the planet blocks the ray
    vec3 toSun = normalize(-vWorldPos);
    vec3 rel = uPlanetPos - vWorldPos;
    float along = dot(rel, toSun);
    float shadow = 1.0;
    if (along > 0.0) {
      float perp = length(rel - toSun * along);
      shadow = smoothstep(uPlanetR * 0.88, uPlanetR * 1.12, perp);
    }
    float lit = 0.28 + 0.72 * shadow;
    vec3 col = tex.rgb * lit;
    gl_FragColor = vec4(col, tex.a * 0.96);
    if (gl_FragColor.a < 0.015) discard;
  }
`;

// Pluto: procedural nitrogen-ice dwarf — bright heart-like plain, dark
// tholin maculae, tan midlands.
export const PLUTO_FRAG = /* glsl */ `
  uniform vec3 uLightDir;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  ${SIMPLEX_3D}
  void main() {
    vec3 p = normalize(vLocal);
    vec3 tan1 = vec3(0.66, 0.52, 0.40);
    vec3 dark = vec3(0.24, 0.15, 0.09);
    vec3 icePlain = vec3(0.85, 0.82, 0.76);
    float mott = fbm(p * 2.6);
    vec3 base = mix(tan1, dark, smoothstep(0.12, 0.5, fbm(p * 1.7 + 4.0)));
    // Sputnik Planitia: one broad smooth bright basin
    vec3 heartDir = normalize(vec3(0.62, 0.1, 0.78));
    float heart = smoothstep(0.34, 0.72, dot(p, heartDir) - fbm(p * 3.0) * 0.18);
    base = mix(base, icePlain, heart);
    base += mott * 0.05;
    vec3 N = normalize(vWorldN);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float d = dot(N, normalize(uLightDir));
    float day = smoothstep(-0.1, 0.4, d);
    float limb = 0.7 + 0.3 * pow(max(dot(N, V), 0.0), 0.6);
    vec3 col = base * (0.05 + day * 0.8) * limb;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Generic icy moon: cratered bright terrain tinted per body.
export const ICY_MOON_FRAG = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uLightDir;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  ${SIMPLEX_3D}
  void main() {
    vec3 p = normalize(vLocal);
    float mott = fbm(p * 3.2) * 0.5 + 0.5;
    float craters = pow(1.0 - abs(snoise(p * 6.5)), 6.0) * 0.5
                  + pow(1.0 - abs(snoise(p * 13.0 + 7.0)), 8.0) * 0.35;
    vec3 base = uBase * (0.78 + mott * 0.34);
    base *= 1.0 - craters * 0.38;
    vec3 N = normalize(vWorldN);
    vec3 L = normalize(uLightDir);
    float d = dot(N, L);
    float day = smoothstep(-0.1, 0.45, d);
    vec3 col = base * (0.05 + day * 1.02);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Final-frame finishing pass: vignette + animated film grain.
export const FINISH_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    vec2 q = vUv - 0.5;
    float vig = 1.0 - dot(q, q) * 0.55;
    c.rgb *= vig;
    float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 43.0) - 0.5;
    c.rgb += g * 0.028;
    gl_FragColor = c;
  }
`;

export const FINISH_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Icy moon: bright ice, rust-colored lineae crack network, chaos terrain.
export const ICY_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  varying vec3 vLocal;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  ${SIMPLEX_3D}
  void main() {
    vec3 p = normalize(vLocal);
    float mott = fbm(p * 3.0) * 0.5 + 0.5;
    vec3 ice = mix(vec3(0.78, 0.83, 0.88), vec3(0.96, 0.92, 0.82), mott);
    float chaos = smoothstep(0.2, 0.55, fbm(p * 2.0 + 10.0));
    vec3 rust = vec3(0.60, 0.40, 0.28);
    vec3 base = mix(ice, mix(ice, rust, 0.6), chaos * 0.5);
    vec3 wp = p + 0.35 * vec3(fbm(p * 1.5), fbm(p * 1.5 + 5.0), fbm(p * 1.5 + 9.0));
    float l1 = 1.0 - smoothstep(0.0, 0.05, abs(fbm(wp * 2.2)));
    float l2 = 1.0 - smoothstep(0.0, 0.035, abs(fbm(wp * 4.5 + 3.0)));
    float l3 = 1.0 - smoothstep(0.0, 0.025, abs(snoise(wp * 8.0)));
    float lineae = clamp(l1 + l2 * 0.7 + l3 * 0.5, 0.0, 1.0);
    base = mix(base, vec3(0.42, 0.16, 0.10), lineae * 0.75);
    vec3 N = normalize(vWorldN);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float d = dot(N, L);
    float day = smoothstep(-0.08, 0.6, d);
    vec3 col = base * (0.05 + day * 1.12);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 36.0) * day * (1.0 - lineae);
    col += vec3(0.8, 0.86, 0.95) * spec * 0.25;
    gl_FragColor = vec4(col, 1.0);
  }
`;

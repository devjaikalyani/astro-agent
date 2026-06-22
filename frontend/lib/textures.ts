// Maps a celestial-body name to its real equirectangular surface texture
// (bundled in /public/textures). Bodies with no entry fall back to the
// procedural shaders in ExploreScene.
//
// Sources (public domain / CC BY 4.0 — see public/textures/CREDITS.txt):
//   Planets, Sun, Moon, Saturn ring — Solar System Scope (CC BY 4.0)
//   Titan — Steve Albers / NASA mosaics (public domain)

export interface TextureSet {
  map: string;
  clouds?: string;
  emissive?: boolean; // self-luminous (the Sun)
  atmosphere?: number; // hex rim-glow colour, if it has a visible atmosphere
}

// First match wins — order specific names before generic ones.
const TABLE: Array<[RegExp, TextureSet]> = [
  [/\bsun\b|\bsol\b|solar/, { map: "/textures/sun.jpg", emissive: true }],
  [/mercury/, { map: "/textures/mercury.jpg" }],
  [/venus/, { map: "/textures/venus.jpg", atmosphere: 0xffd9a0 }],
  [/\bearth\b|terra/, { map: "/textures/earth.jpg", clouds: "/textures/earth_clouds.jpg", atmosphere: 0x6fb4ff }],
  [/\bmoon\b|luna/, { map: "/textures/moon.jpg" }],
  [/mars/, { map: "/textures/mars.jpg", atmosphere: 0xd98a5a }],
  [/jupiter/, { map: "/textures/jupiter.jpg" }],
  [/saturn/, { map: "/textures/saturn.jpg" }],
  [/uranus/, { map: "/textures/uranus.jpg" }],
  [/neptune/, { map: "/textures/neptune.jpg", atmosphere: 0x6f8fff }],
  [/titan/, { map: "/textures/titan.jpg", atmosphere: 0xe8a14a }],
];

export function textureFor(name: string): TextureSet | null {
  const n = name.toLowerCase();
  for (const [re, set] of TABLE) if (re.test(n)) return set;
  return null;
}

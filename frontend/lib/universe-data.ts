// The navigable solar system: stylized-scale orbital dataset plus the
// info card shown when a body is focused. Distances/radii are compressed
// for usability; periods keep true ratios.

export interface MoonDef {
  id: string;
  name: string;
  texture?: string;
  radius: number;
  orbitR: number;
  periodDays: number;
  color: number;
}

export interface PlanetDef {
  id: string;
  name: string;
  texture: string;
  radius: number;
  aAU: number;
  periodYears: number;
  tiltDeg: number;
  atmosphere?: number;
  clouds?: string;
  ring?: boolean;
  moons?: MoonDef[];
}

export const PLANETS: PlanetDef[] = [
  { id: "mercury", name: "Mercury", texture: "/textures/mercury.jpg", radius: 0.55, aAU: 0.39, periodYears: 0.24, tiltDeg: 0.03 },
  { id: "venus", name: "Venus", texture: "/textures/venus.jpg", radius: 0.94, aAU: 0.72, periodYears: 0.62, tiltDeg: 177, atmosphere: 0xffd9a0 },
  {
    id: "earth", name: "Earth", texture: "/textures/earth.jpg", radius: 1.0, aAU: 1.0, periodYears: 1.0, tiltDeg: 23.4,
    atmosphere: 0x6fb4ff, clouds: "/textures/earth_clouds.jpg",
    moons: [{ id: "moon", name: "Moon", texture: "/textures/moon.jpg", radius: 0.27, orbitR: 2.4, periodDays: 27.3, color: 0xb8b8b8 }],
  },
  { id: "mars", name: "Mars", texture: "/textures/mars.jpg", radius: 0.72, aAU: 1.52, periodYears: 1.88, tiltDeg: 25.2, atmosphere: 0xd98a5a },
  {
    id: "jupiter", name: "Jupiter", texture: "/textures/jupiter.jpg", radius: 3.1, aAU: 5.2, periodYears: 11.86, tiltDeg: 3.1,
    moons: [
      { id: "io", name: "Io", texture: "/textures/io.jpg", radius: 0.28, orbitR: 4.8, periodDays: 1.77, color: 0xd8c46a },
      { id: "europa", name: "Europa", texture: "/textures/europa.jpg", radius: 0.25, orbitR: 5.7, periodDays: 3.55, color: 0xcfc6b2 },
      { id: "ganymede", name: "Ganymede", texture: "/textures/ganymede.jpg", radius: 0.41, orbitR: 6.7, periodDays: 7.15, color: 0x9a8f7c },
      { id: "callisto", name: "Callisto", texture: "/textures/callisto.jpg", radius: 0.38, orbitR: 7.9, periodDays: 16.7, color: 0x7a6f60 },
    ],
  },
  {
    id: "saturn", name: "Saturn", texture: "/textures/saturn.jpg", radius: 2.7, aAU: 9.58, periodYears: 29.46, tiltDeg: 26.7, ring: true,
    moons: [{ id: "titan", name: "Titan", texture: "/textures/titan.jpg", radius: 0.4, orbitR: 8.6, periodDays: 15.9, color: 0xd8a24a }],
  },
  { id: "uranus", name: "Uranus", texture: "/textures/uranus.jpg", radius: 1.9, aAU: 19.2, periodYears: 84.0, tiltDeg: 97.8, ring: true },
  { id: "neptune", name: "Neptune", texture: "/textures/neptune.jpg", radius: 1.85, aAU: 30.05, periodYears: 164.8, tiltDeg: 28.3, atmosphere: 0x6f8fff },
];

export const SUN = { id: "sun", name: "Sun", texture: "/textures/sun.jpg", radius: 5.2 };

// Deterministic starting angle per planet so the system opens scattered.
export function phase0(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return (h / 100000) * Math.PI * 2;
}

export function orbitRadius(aAU: number): number {
  return 16 * Math.pow(aAU, 0.62);
}

// ── Focus cards ─────────────────────────────────────────────────────────────

export interface BodyCard {
  cls: string;
  blurb: string;
  stats: Array<[string, string]>;
}

export const BODY_CARDS: Record<string, BodyCard> = {
  sun: {
    cls: "G2V Main-Sequence Star",
    blurb: "The engine of the solar system: 99.86 percent of its mass, fusing 600 million tonnes of hydrogen every second.",
    stats: [["Diameter", "1.39M km"], ["Surface", "5,505 C"], ["Core", "15M C"], ["Age", "4.6 Gyr"]],
  },
  mercury: {
    cls: "Terrestrial Planet",
    blurb: "The smallest planet, an iron relic with the largest temperature swing of any world — and ice in its shadowed craters.",
    stats: [["Distance", "0.39 AU"], ["Diameter", "4,879 km"], ["Day", "176 Earth days"], ["Temp", "-180 to 430 C"]],
  },
  venus: {
    cls: "Terrestrial Planet",
    blurb: "A runaway greenhouse: hotter than Mercury under a crushing CO2 sky, rotating backwards in slow motion.",
    stats: [["Distance", "0.72 AU"], ["Diameter", "12,104 km"], ["Surface", "465 C"], ["Pressure", "92 bar"]],
  },
  earth: {
    cls: "Terrestrial Planet",
    blurb: "The only confirmed living world. Oceans, oxygen, a protective magnetic field — every story so far happened here.",
    stats: [["Distance", "1.00 AU"], ["Diameter", "12,756 km"], ["Ocean cover", "71%"], ["Moons", "1"]],
  },
  moon: {
    cls: "Natural Satellite",
    blurb: "Earth's companion, born of a giant impact. The only other world humans have walked on — twelve of us, so far.",
    stats: [["Distance", "384,400 km"], ["Diameter", "3,475 km"], ["Period", "27.3 days"], ["Visited", "1969-1972"]],
  },
  mars: {
    cls: "Terrestrial Planet",
    blurb: "The unfinished world: dry riverbeds, the tallest volcano in the solar system, and two rovers still driving.",
    stats: [["Distance", "1.52 AU"], ["Diameter", "6,779 km"], ["Day", "24.6 h"], ["Olympus Mons", "21 km"]],
  },
  jupiter: {
    cls: "Gas Giant",
    blurb: "Heavier than every other planet combined. Its Great Red Spot has raged for centuries; its moons are worlds.",
    stats: [["Distance", "5.20 AU"], ["Diameter", "139,820 km"], ["Moons", "95+"], ["Day", "9.9 h"]],
  },
  io: {
    cls: "Galilean Moon",
    blurb: "The most volcanically active body known — hundreds of eruptions, driven by Jupiter's relentless tides.",
    stats: [["Parent", "Jupiter"], ["Diameter", "3,643 km"], ["Volcanoes", "400+"], ["Period", "1.8 days"]],
  },
  europa: {
    cls: "Galilean Moon",
    blurb: "A cracked ice shell over a global ocean holding twice Earth's water. The best place to look for life beyond Earth.",
    stats: [["Parent", "Jupiter"], ["Diameter", "3,122 km"], ["Ocean depth", "60-150 km"], ["Clipper arrives", "2030"]],
  },
  ganymede: {
    cls: "Galilean Moon",
    blurb: "The largest moon in the solar system — bigger than Mercury — and the only one with its own magnetic field.",
    stats: [["Parent", "Jupiter"], ["Diameter", "5,268 km"], ["Period", "7.2 days"], ["JUICE arrives", "2031"]],
  },
  callisto: {
    cls: "Galilean Moon",
    blurb: "The most heavily cratered world known: a four-billion-year-old record of the solar system's bombardment.",
    stats: [["Parent", "Jupiter"], ["Diameter", "4,821 km"], ["Period", "16.7 days"], ["Surface age", "4 Gyr"]],
  },
  saturn: {
    cls: "Ringed Gas Giant",
    blurb: "Rings 280,000 km wide and ten meters thin — nearly pure water ice, shepherded by moons, slowly raining away.",
    stats: [["Distance", "9.58 AU"], ["Diameter", "116,460 km"], ["Moons", "146+"], ["Ring span", "280,000 km"]],
  },
  titan: {
    cls: "Saturnian Moon",
    blurb: "A frozen early Earth with methane rain, rivers and seas under an orange sky. Huygens landed here in 2005.",
    stats: [["Parent", "Saturn"], ["Diameter", "5,150 km"], ["Atmosphere", "1.45 bar"], ["Dragonfly", "2034"]],
  },
  uranus: {
    cls: "Ice Giant",
    blurb: "Knocked onto its side by an ancient impact, it rolls around the Sun with its poles taking 42-year days.",
    stats: [["Distance", "19.2 AU"], ["Diameter", "50,724 km"], ["Axial tilt", "98 deg"], ["Moons", "27"]],
  },
  neptune: {
    cls: "Ice Giant",
    blurb: "The windiest world — 2,100 km/h supersonic storms — found by mathematics before any telescope saw it.",
    stats: [["Distance", "30.1 AU"], ["Diameter", "49,244 km"], ["Winds", "2,100 km/h"], ["Year", "165 yr"]],
  },
};

export const ALL_BODY_IDS: string[] = [
  "sun",
  ...PLANETS.flatMap((p) => [p.id, ...(p.moons ?? []).map((m) => m.id)]),
];

export const BODY_NAMES: Record<string, string> = Object.fromEntries([
  ["sun", "Sun"],
  ...PLANETS.flatMap((p): Array<[string, string]> => [
    [p.id, p.name],
    ...(p.moons ?? []).map((m): [string, string] => [m.id, m.name]),
  ]),
]);

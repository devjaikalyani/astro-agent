// The navigable solar system: stylized-scale orbital dataset plus the
// info card shown when a body is focused. Distances/radii are compressed
// for usability; periods, tilts, inclinations and spins keep true ratios.

export interface MoonDef {
  id: string;
  name: string;
  texture?: string;
  radius: number;
  orbitR: number;
  periodDays: number; // negative = retrograde (Triton)
  color: number;
  rocky?: boolean; // irregular displaced-rock body (Phobos, Deimos)
  icy?: boolean; // procedural icy surface when no texture
}

export interface PlanetDef {
  id: string;
  name: string;
  texture?: string;
  proc?: "pluto"; // procedural surface instead of a texture map
  radius: number;
  aAU: number;
  periodYears: number;
  tiltDeg: number;
  incDeg?: number; // orbital inclination to the ecliptic
  ecc?: number; // orbital eccentricity (visual, compressed)
  spinHours?: number; // sidereal day; sign gives direction
  atmosphere?: number;
  clouds?: string;
  night?: string; // night-side emission map (Earth city lights)
  ring?: "saturn" | "faint";
  dwarf?: boolean;
  scale?: [number, number, number]; // non-spherical bodies (Haumea)
  moons?: MoonDef[];
}

export const PLANETS: PlanetDef[] = [
  {
    id: "mercury", name: "Mercury", texture: "/textures/mercury.jpg", radius: 0.55,
    aAU: 0.39, periodYears: 0.24, tiltDeg: 0.03, incDeg: 7.0, ecc: 0.2, spinHours: 1407,
  },
  {
    id: "venus", name: "Venus", texture: "/textures/venus.jpg", radius: 0.94,
    aAU: 0.72, periodYears: 0.62, tiltDeg: 177, incDeg: 3.4, spinHours: -5832,
    atmosphere: 0xffd9a0,
  },
  {
    id: "earth", name: "Earth", texture: "/textures/earth.jpg", radius: 1.0,
    aAU: 1.0, periodYears: 1.0, tiltDeg: 23.4, spinHours: 24,
    atmosphere: 0x6fb4ff, clouds: "/textures/earth_clouds.jpg", night: "/textures/earth_night.jpg",
    moons: [{ id: "moon", name: "Moon", texture: "/textures/moon.jpg", radius: 0.27, orbitR: 2.4, periodDays: 27.3, color: 0xb8b8b8 }],
  },
  {
    id: "mars", name: "Mars", texture: "/textures/mars.jpg", radius: 0.72,
    aAU: 1.52, periodYears: 1.88, tiltDeg: 25.2, incDeg: 1.9, ecc: 0.09, spinHours: 24.6,
    atmosphere: 0xd98a5a,
    moons: [
      { id: "phobos", name: "Phobos", radius: 0.085, orbitR: 1.35, periodDays: 0.32, color: 0x6e6258, rocky: true },
      { id: "deimos", name: "Deimos", radius: 0.07, orbitR: 1.85, periodDays: 1.26, color: 0x7d7166, rocky: true },
    ],
  },
  {
    id: "ceres", name: "Ceres", texture: "/textures/ceres.jpg", radius: 0.24,
    aAU: 2.77, periodYears: 4.6, tiltDeg: 4, incDeg: 10.6, ecc: 0.08, spinHours: 9.1, dwarf: true,
  },
  {
    id: "jupiter", name: "Jupiter", texture: "/textures/jupiter.jpg", radius: 3.1,
    aAU: 5.2, periodYears: 11.86, tiltDeg: 3.1, incDeg: 1.3, spinHours: 9.9,
    moons: [
      { id: "io", name: "Io", texture: "/textures/io.jpg", radius: 0.28, orbitR: 4.8, periodDays: 1.77, color: 0xd8c46a },
      { id: "europa", name: "Europa", texture: "/textures/europa.jpg", radius: 0.25, orbitR: 5.7, periodDays: 3.55, color: 0xcfc6b2 },
      { id: "ganymede", name: "Ganymede", texture: "/textures/ganymede.jpg", radius: 0.41, orbitR: 6.7, periodDays: 7.15, color: 0x9a8f7c },
      { id: "callisto", name: "Callisto", texture: "/textures/callisto.jpg", radius: 0.38, orbitR: 7.9, periodDays: 16.7, color: 0x7a6f60 },
    ],
  },
  {
    id: "saturn", name: "Saturn", texture: "/textures/saturn.jpg", radius: 2.7,
    aAU: 9.58, periodYears: 29.46, tiltDeg: 26.7, incDeg: 2.5, spinHours: 10.7, ring: "saturn",
    moons: [
      { id: "mimas", name: "Mimas", radius: 0.13, orbitR: 6.9, periodDays: 0.94, color: 0xb9bcc0, icy: true },
      { id: "enceladus", name: "Enceladus", texture: "/textures/enceladus.jpg", radius: 0.17, orbitR: 7.6, periodDays: 1.37, color: 0xeef2f5 },
      { id: "rhea", name: "Rhea", radius: 0.29, orbitR: 9.4, periodDays: 4.5, color: 0xb5aea3, icy: true },
      { id: "titan", name: "Titan", texture: "/textures/titan.jpg", radius: 0.4, orbitR: 11.2, periodDays: 15.9, color: 0xd8a24a },
      { id: "iapetus", name: "Iapetus", radius: 0.27, orbitR: 13.6, periodDays: 79, color: 0x6f6250, icy: true },
    ],
  },
  {
    id: "uranus", name: "Uranus", texture: "/textures/uranus.jpg", radius: 1.9,
    aAU: 19.2, periodYears: 84.0, tiltDeg: 97.8, incDeg: 0.8, spinHours: -17.2, ring: "faint",
    moons: [
      { id: "miranda", name: "Miranda", radius: 0.12, orbitR: 3.1, periodDays: 1.41, color: 0x9aa4ac, icy: true },
      { id: "titania", name: "Titania", radius: 0.25, orbitR: 4.4, periodDays: 8.7, color: 0x8a8580, icy: true },
      { id: "oberon", name: "Oberon", radius: 0.24, orbitR: 5.3, periodDays: 13.5, color: 0x7d7468, icy: true },
    ],
  },
  {
    id: "neptune", name: "Neptune", texture: "/textures/neptune.jpg", radius: 1.85,
    aAU: 30.05, periodYears: 164.8, tiltDeg: 28.3, incDeg: 1.8, spinHours: 16.1,
    atmosphere: 0x6f8fff,
    moons: [{ id: "triton", name: "Triton", radius: 0.28, orbitR: 3.6, periodDays: -5.88, color: 0xd9cfc4, icy: true }],
  },
  {
    id: "pluto", name: "Pluto", proc: "pluto", radius: 0.35,
    aAU: 39.5, periodYears: 248, tiltDeg: 120, incDeg: 17.2, ecc: 0.25, spinHours: -153, dwarf: true,
    moons: [{ id: "charon", name: "Charon", radius: 0.18, orbitR: 1.05, periodDays: 6.4, color: 0x8d8580, icy: true }],
  },
  {
    id: "haumea", name: "Haumea", texture: "/textures/haumea.jpg", radius: 0.24,
    aAU: 43.1, periodYears: 285, tiltDeg: 12, incDeg: 28.2, ecc: 0.19, spinHours: 3.9, dwarf: true,
    scale: [1.62, 0.78, 1.0],
  },
  {
    id: "makemake", name: "Makemake", texture: "/textures/makemake.jpg", radius: 0.23,
    aAU: 45.4, periodYears: 306, tiltDeg: 29, incDeg: 29.0, ecc: 0.16, spinHours: 22.5, dwarf: true,
  },
  {
    id: "eris", name: "Eris", texture: "/textures/eris.jpg", radius: 0.25,
    aAU: 67.8, periodYears: 558, tiltDeg: 61, incDeg: 44.0, ecc: 0.44, spinHours: 25.9, dwarf: true,
  },
];

export const SUN = { id: "sun", name: "Sun", texture: "/textures/sun.jpg", radius: 5.2 };

// Periodic comets: eccentric, inclined, tails always anti-sunward.
export interface CometDef {
  id: string;
  name: string;
  aAU: number; // visual semi-major axis (compressed like planets)
  ecc: number;
  incDeg: number;
  nodeDeg: number;
  periodYears: number;
  retrograde?: boolean;
  ionColor: number;
  dustColor: number;
}

export const COMETS: CometDef[] = [
  {
    id: "halley", name: "1P/Halley", aAU: 17.8, ecc: 0.82, incDeg: 18, nodeDeg: 58,
    periodYears: 76, retrograde: true, ionColor: 0x6fd0ff, dustColor: 0xffe0b0,
  },
  {
    id: "halebopp", name: "Hale-Bopp", aAU: 40, ecc: 0.9, incDeg: 89, nodeDeg: 282,
    periodYears: 200, ionColor: 0x8fb8ff, dustColor: 0xffd9a0,
  },
];

// Deterministic starting angle per body so the system opens scattered.
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
  phobos: {
    cls: "Martian Moon",
    blurb: "A doomed rubble pile skimming Mars every 7.6 hours. Tides pull it 2 meters closer each century — one day it will shatter into a ring.",
    stats: [["Parent", "Mars"], ["Size", "27 x 22 x 18 km"], ["Period", "7.6 h"], ["Fate", "Ring in ~50 Myr"]],
  },
  deimos: {
    cls: "Martian Moon",
    blurb: "The smaller, calmer twin: a captured-asteroid candidate drifting slowly outward, smooth under a blanket of dust.",
    stats: [["Parent", "Mars"], ["Size", "15 x 12 x 11 km"], ["Period", "30.3 h"], ["Discovered", "1877"]],
  },
  ceres: {
    cls: "Dwarf Planet",
    blurb: "The largest object in the asteroid belt and the first dwarf planet visited: bright salt flats mark a buried briny ocean.",
    stats: [["Distance", "2.77 AU"], ["Diameter", "940 km"], ["Belt mass", "~33%"], ["Dawn arrived", "2015"]],
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
  mimas: {
    cls: "Saturnian Moon",
    blurb: "The Death Star moon: crater Herschel spans a third of its face. Under the ice, a surprise — a young hidden ocean.",
    stats: [["Parent", "Saturn"], ["Diameter", "396 km"], ["Herschel", "139 km wide"], ["Ocean found", "2024"]],
  },
  enceladus: {
    cls: "Saturnian Moon",
    blurb: "A snow-white ice world venting its buried ocean into space through tiger-stripe geysers — feeding Saturn's E ring.",
    stats: [["Parent", "Saturn"], ["Diameter", "504 km"], ["Albedo", "0.99"], ["Plumes", "200+ kg/s"]],
  },
  rhea: {
    cls: "Saturnian Moon",
    blurb: "Saturn's second-largest moon, an ancient dirty snowball — and possibly the only moon that once had rings of its own.",
    stats: [["Parent", "Saturn"], ["Diameter", "1,527 km"], ["Period", "4.5 days"], ["Ice fraction", "~75%"]],
  },
  titan: {
    cls: "Saturnian Moon",
    blurb: "A frozen early Earth with methane rain, rivers and seas under an orange sky. Huygens landed here in 2005.",
    stats: [["Parent", "Saturn"], ["Diameter", "5,150 km"], ["Atmosphere", "1.45 bar"], ["Dragonfly", "2034"]],
  },
  iapetus: {
    cls: "Saturnian Moon",
    blurb: "The two-faced moon: one hemisphere coal-black, the other bright ice, with a mysterious equatorial mountain ridge.",
    stats: [["Parent", "Saturn"], ["Diameter", "1,469 km"], ["Ridge height", "13 km"], ["Period", "79 days"]],
  },
  uranus: {
    cls: "Ice Giant",
    blurb: "Knocked onto its side by an ancient impact, it rolls around the Sun with its poles taking 42-year days.",
    stats: [["Distance", "19.2 AU"], ["Diameter", "50,724 km"], ["Axial tilt", "98 deg"], ["Moons", "27"]],
  },
  miranda: {
    cls: "Uranian Moon",
    blurb: "The Frankenstein moon: shattered and refrozen terrain with Verona Rupes, a 20 km cliff — the tallest known drop.",
    stats: [["Parent", "Uranus"], ["Diameter", "472 km"], ["Verona Rupes", "20 km"], ["Fall time", "~12 min"]],
  },
  titania: {
    cls: "Uranian Moon",
    blurb: "The largest moon of Uranus, canyon-scarred and silent — seen up close exactly once, by Voyager 2 in 1986.",
    stats: [["Parent", "Uranus"], ["Diameter", "1,578 km"], ["Period", "8.7 days"], ["Visited", "1986"]],
  },
  oberon: {
    cls: "Uranian Moon",
    blurb: "The outermost of the great Uranian moons, its old cratered face streaked with mysterious dark deposits.",
    stats: [["Parent", "Uranus"], ["Diameter", "1,523 km"], ["Period", "13.5 days"], ["Named for", "A fairy king"]],
  },
  neptune: {
    cls: "Ice Giant",
    blurb: "The windiest world — 2,100 km/h supersonic storms — found by mathematics before any telescope saw it.",
    stats: [["Distance", "30.1 AU"], ["Diameter", "49,244 km"], ["Winds", "2,100 km/h"], ["Year", "165 yr"]],
  },
  triton: {
    cls: "Neptunian Moon",
    blurb: "A captured Kuiper Belt world orbiting backwards, with nitrogen geysers erupting through pink ice at -235 C.",
    stats: [["Parent", "Neptune"], ["Diameter", "2,707 km"], ["Orbit", "Retrograde"], ["Surface", "-235 C"]],
  },
  pluto: {
    cls: "Dwarf Planet",
    blurb: "The heart-marked king of the Kuiper Belt: nitrogen glaciers, blue haze, and mountains of water ice at the edge of night.",
    stats: [["Distance", "39.5 AU"], ["Diameter", "2,377 km"], ["Heart", "Sputnik Planitia"], ["Flyby", "2015"]],
  },
  charon: {
    cls: "Plutonian Moon",
    blurb: "Half the size of Pluto itself — a true binary partner. The pair orbit a point in the space between them, faces locked forever.",
    stats: [["Parent", "Pluto"], ["Diameter", "1,212 km"], ["Period", "6.4 days"], ["Mordor Macula", "Red pole"]],
  },
  haumea: {
    cls: "Dwarf Planet",
    blurb: "An egg-shaped world spinning end over end every four hours — fast enough to stretch itself — with its own thin ring.",
    stats: [["Distance", "43.1 AU"], ["Day", "3.9 h"], ["Shape", "2,100 x 1,000 km"], ["Ring found", "2017"]],
  },
  makemake: {
    cls: "Dwarf Planet",
    blurb: "A frigid red world of frozen methane in the classical Kuiper Belt, bright enough to help demote Pluto.",
    stats: [["Distance", "45.4 AU"], ["Diameter", "1,430 km"], ["Surface", "-239 C"], ["Discovered", "2005"]],
  },
  eris: {
    cls: "Dwarf Planet",
    blurb: "The world that ended the nine-planet era: more massive than Pluto, flung to the scattered disc on a 44-degree tilt.",
    stats: [["Distance", "67.8 AU"], ["Diameter", "2,326 km"], ["Year", "558 yr"], ["Tilt", "44 deg"]],
  },
  halley: {
    cls: "Periodic Comet",
    blurb: "Humanity's comet: recorded since 240 BC, back every 76 years. Each pass boils another meter of ice into its tails.",
    stats: [["Period", "76 yr"], ["Nucleus", "15 x 8 km"], ["Last seen", "1986"], ["Returns", "2061"]],
  },
  halebopp: {
    cls: "Long-Period Comet",
    blurb: "The great comet of 1997: visible to the naked eye for a record 18 months, with a nucleus far larger than most.",
    stats: [["Nucleus", "~60 km"], ["Seen for", "18 months"], ["Perihelion", "1997"], ["Returns", "~4385"]],
  },
};

export const ALL_BODY_IDS: string[] = [
  "sun",
  ...PLANETS.flatMap((p) => [p.id, ...(p.moons ?? []).map((m) => m.id)]),
  ...COMETS.map((c) => c.id),
];

export const BODY_NAMES: Record<string, string> = Object.fromEntries([
  ["sun", "Sun"],
  ...PLANETS.flatMap((p): Array<[string, string]> => [
    [p.id, p.name],
    ...(p.moons ?? []).map((m): [string, string] => [m.id, m.name]),
  ]),
  ...COMETS.map((c): [string, string] => [c.id, c.name]),
]);

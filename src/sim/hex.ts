// Hex-Gitter mit axialen Koordinaten, Spitze nach oben (wie die KayKit-Kacheln).
// Welt: x nach rechts, z nach unten (Bildschirm), Kantenabstand Mitte–Kante = 1.

export interface Hex {
  q: number;
  r: number;
}

/** Richtungen gegen den Uhrzeigersinn ab Osten: 0=O, 1=NO, 2=NW, 3=W, 4=SW, 5=SO */
export const DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const SQRT3 = Math.sqrt(3);

export const hexKey = (h: Hex): string => `${h.q},${h.r}`;
export const hexEq = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;
export const neighbor = (h: Hex, d: number): Hex => ({ q: h.q + DIRS[d].q, r: h.r + DIRS[d].r });
export const opposite = (d: number): number => (d + 3) % 6;
export const mod6 = (d: number): number => ((d % 6) + 6) % 6;

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export interface Vec2 {
  x: number;
  z: number;
}

export function hexToWorld(h: Hex): Vec2 {
  return { x: 2 * h.q + h.r, z: SQRT3 * h.r };
}

/** Einheitsvektor zur Kante d */
export function dirVec(d: number): Vec2 {
  const a = (d * Math.PI) / 3;
  return { x: Math.cos(a), z: -Math.sin(a) };
}

/** Mittelpunkt der Kante d einer Kachel */
export function edgeMid(h: Hex, d: number): Vec2 {
  const c = hexToWorld(h);
  const v = dirVec(d);
  return { x: c.x + v.x, z: c.z + v.z };
}

export function worldToHex(x: number, z: number): Hex {
  const r = z / SQRT3;
  const q = (x - r) / 2;
  return hexRound(q, r);
}

function hexRound(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

export const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

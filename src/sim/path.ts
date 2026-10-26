// Wegverlauf als Polylinie: Gegner laufen vom offenen Ende zur Burg.
import { type Hex, type Vec2, edgeMid, hexToWorld } from './hex';

export interface PathTile {
  cell: Hex;
  /** Kante Richtung Burg */
  toCastle: number;
  /** Kante Richtung offenes Ende */
  toEnd: number;
}

export class Polyline {
  readonly pts: Vec2[];
  readonly cum: number[];
  readonly length: number;

  constructor(pts: Vec2[]) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.cum[this.cum.length - 1];
  }

  at(s: number): Vec2 {
    const { pts, cum } = this;
    if (s <= 0) return { ...pts[0] };
    if (s >= this.length) return { ...pts[pts.length - 1] };
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, z: pts[lo].z + (pts[hi].z - pts[lo].z) * t };
  }

  /** Laufrichtung (Winkel um Y, Three.js-Konvention) an Stelle s */
  heading(s: number): number {
    const a = this.at(s - 0.15);
    const b = this.at(s + 0.15);
    return Math.atan2(b.x - a.x, b.z - a.z);
  }
}

const SAMPLES = 10;

/**
 * Baut den Laufweg. tiles[0] grenzt an die Burg, das letzte Element ist das offene Ende.
 * Pro Kachel eine quadratische Kurve von Kante zu Kante mit der Kachelmitte als Kontrollpunkt,
 * das passt zur Form der KayKit-Straßen.
 */
export function buildPolyline(castle: Hex, tiles: readonly PathTile[]): Polyline {
  const pts: Vec2[] = [];
  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    const a = edgeMid(t.cell, t.toEnd);
    const c = hexToWorld(t.cell);
    const b = edgeMid(t.cell, t.toCastle);
    for (let k = i === tiles.length - 1 ? 0 : 1; k <= SAMPLES; k++) {
      const u = k / SAMPLES;
      const w0 = (1 - u) * (1 - u);
      const w1 = 2 * u * (1 - u);
      const w2 = u * u;
      pts.push({ x: w0 * a.x + w1 * c.x + w2 * b.x, z: w0 * a.z + w1 * c.z + w2 * b.z });
    }
  }
  const castlePos = hexToWorld(castle);
  pts.push({ x: castlePos.x, z: castlePos.z });
  return new Polyline(pts);
}

// Insel, Weg, Gelände, Türme und Vorschauen.
import * as THREE from 'three';
import type { Card, Cell, Game, Tower } from '../sim/game';
import { type Hex, hexDistance, hexKey, hexToWorld, mod6, neighbor } from '../sim/hex';
import type { PathTile } from '../sim/path';
import type { Assets } from './assets';

interface Drop {
  obj: THREE.Object3D;
  delay: number;
  t: number;
  dur: number;
  fromY: number;
}

interface TowerView {
  tower: Tower;
  root: THREE.Object3D;
  head?: THREE.Object3D;
  arm?: THREE.Object3D;
  recoil: number;
  pop: number;
}

/** Straßenmodelle mit ihren Anschlusskanten in Grundstellung */
const ROADS: { name: string; edges: [number, number] }[] = [
  { name: 'hex_road_A', edges: [3, 0] },
  { name: 'hex_road_B', edges: [3, 1] },
  { name: 'hex_road_C', edges: [3, 2] },
];

export function roadFor(a: number, b: number): { name: string; rot: number } {
  for (const r of ROADS) {
    for (let k = 0; k < 6; k++) {
      const e0 = mod6(r.edges[0] + k);
      const e1 = mod6(r.edges[1] + k);
      if ((e0 === a && e1 === b) || (e0 === b && e1 === a)) return { name: r.name, rot: (k * Math.PI) / 3 };
    }
  }
  throw new Error(`keine Straße für ${a}/${b}`);
}

const FOREST = ['trees_A_medium', 'trees_B_large', 'trees_A_large', 'trees_B_medium'];
const MOUNTAIN = ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees'];
/** Unbebaubarer Rand um die Insel: Wälder, Hügel, Berge */
const RING = [
  'hills_A_trees', 'hills_B_trees', 'mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees',
  'trees_A_large', 'trees_B_large', 'trees_A_medium', 'hills_A_trees', 'trees_B_large', 'trees_A_medium',
];
const SMALL_DECOR = ['rock_single_A', 'rock_single_B', 'tree_single_A', 'tree_single_B', 'trees_A_small', 'rock_single_C'];

export class World {
  readonly group = new THREE.Group();
  private cellObjs = new Map<string, THREE.Object3D>();
  private decor = new Map<string, THREE.Object3D>();
  private ring = new Map<string, { hex: Hex; obj: THREE.Object3D | null }>();
  private drops: Drop[] = [];
  private towers = new Map<number, TowerView>();
  private ghost: THREE.Group | null = null;
  private portal: THREE.Group;
  private highlight: THREE.Mesh;
  private range: THREE.Mesh;
  castle!: THREE.Object3D;
  private castleFlash = 0;
  private time = 0;

  constructor(
    private assets: Assets,
    private game: Game,
  ) {
    this.portal = this.makePortal();
    this.group.add(this.portal);

    const hexShape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const r = 1.1;
      if (i === 0) hexShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else hexShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const hole = new THREE.Path();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const r = 0.95;
      if (i === 0) hole.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else hole.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    hexShape.holes.push(hole);
    this.highlight = new THREE.Mesh(
      new THREE.ShapeGeometry(hexShape),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.visible = false;
    this.group.add(this.highlight);

    this.range = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.range.rotation.x = -Math.PI / 2;
    this.range.position.y = 0.06;
    this.range.visible = false;
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(0.96, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    this.range.add(fill);
    this.group.add(this.range);

    this.buildInitial();
  }

  private buildInitial(): void {
    const g = this.game;
    // Insel fällt zum Start Kachel für Kachel ins Meer
    for (const c of g.cells.values()) this.addCell(c, 0.2 + hexDistance(c.hex, g.castle) * 0.12);
    this.refreshRing(0.6);
    this.castle = this.assets.model('building_castle_blue');
    const cp = hexToWorld(g.castle);
    this.castle.position.set(cp.x, 0, cp.z);
    this.castle.rotation.y = Math.PI / 2;
    this.castle.scale.setScalar(0.85);
    this.group.add(this.castle);
    // Fahne und Kisten neben der Burg
    this.placePortal();
  }

  /** Kachel neu aufbauen (Gelände kann sich geändert haben) */
  private addCell(c: Cell, delay: number): void {
    const k = hexKey(c.hex);
    this.cellObjs.get(k)?.removeFromParent();
    this.decor.get(k)?.removeFromParent();
    this.decor.delete(k);
    const p = hexToWorld(c.hex);
    let obj: THREE.Object3D;
    if (c.kind === 'path') {
      const tile = this.game.path.find((t) => hexKey(t.cell) === k)!;
      const road = roadFor(tile.toCastle, tile.toEnd);
      obj = this.assets.model(road.name);
      obj.rotation.y = road.rot;
    } else {
      obj = this.assets.model('hex_grass');
      obj.rotation.y = (Math.floor(hash(c.hex) * 6) * Math.PI) / 3;
    }
    obj.position.set(p.x, 0, p.z);
    this.group.add(obj);
    this.cellObjs.set(k, obj);

    let deco: THREE.Object3D | null = null;
    const h = hash(c.hex);
    if (c.kind === 'forest') deco = this.assets.model(FOREST[Math.floor(h * FOREST.length)]);
    else if (c.kind === 'mountain') deco = this.assets.model(MOUNTAIN[Math.floor(h * MOUNTAIN.length)]);
    else if (c.kind === 'grass' && h < 0.4 && c.towerId === undefined) {
      deco = this.assets.model(SMALL_DECOR[Math.floor(hash({ q: c.hex.r, r: c.hex.q }) * SMALL_DECOR.length)]);
      const a = h * 40;
      deco.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    }
    if (deco) {
      const holder = new THREE.Group();
      holder.add(deco);
      holder.position.set(p.x, 0, p.z);
      holder.rotation.y = h * Math.PI * 2;
      this.group.add(holder);
      this.decor.set(k, holder);
      if (delay >= 0) this.drop(holder, delay + 0.25, 0.5, 2.5);
    }
    if (delay >= 0) this.drop(obj, delay, 0.55, 5);
  }

  /** Randkacheln um alle Inselfelder pflegen; das Feld vor dem Wegende bleibt Wasser */
  private refreshRing(delay: number): void {
    const g = this.game;
    const end = g.pathEnd;
    const ahead = hexKey(neighbor(end.cell, end.toEnd));
    const want = new Map<string, Hex>();
    for (const c of g.cells.values()) {
      for (let d = 0; d < 6; d++) {
        const n = neighbor(c.hex, d);
        const k = hexKey(n);
        if (!g.cells.has(k) && k !== ahead) want.set(k, n);
      }
    }
    for (const [k, r] of this.ring) {
      if (!want.has(k)) {
        r.obj?.removeFromParent();
        this.ring.delete(k);
      }
    }
    let i = 0;
    for (const [k, h] of want) {
      if (this.ring.has(k)) continue;
      const v = hash({ q: h.q * 3 + 1, r: h.r * 7 - 2 });
      // Freie Sicht aufs Meer an manchen Stellen
      if (v < 0.3) {
        this.ring.set(k, { hex: h, obj: null });
        continue;
      }
      const p = hexToWorld(h);
      const holder = new THREE.Group();
      const base = this.assets.model('hex_grass');
      base.rotation.y = (Math.floor(v * 60) % 6) * (Math.PI / 3);
      const deco = this.assets.model(RING[Math.floor(hash({ q: h.r, r: h.q * 5 }) * RING.length)]);
      deco.rotation.y = v * Math.PI * 8;
      holder.add(base, deco);
      holder.position.set(p.x, 0, p.z);
      this.group.add(holder);
      this.ring.set(k, { hex: h, obj: holder });
      this.drop(holder, delay + i * 0.04, 0.6, 6);
      i++;
    }
  }

  /** Alle Felder mit Land, für die Wassermaske */
  landHexes(): Hex[] {
    const out = [...this.game.cells.values()].map((c) => c.hex);
    for (const r of this.ring.values()) if (r.obj) out.push(r.hex);
    return out;
  }

  private drop(obj: THREE.Object3D, delay: number, dur: number, fromY: number): void {
    if (delay <= 0 && dur <= 0) return;
    obj.visible = delay <= 0;
    this.drops.push({ obj, delay, t: 0, dur, fromY });
    obj.position.y = fromY;
  }

  onTilePlaced(tile: PathTile, newCells: Cell[]): void {
    const c = this.game.cell(tile.cell)!;
    this.addCell(c, 0);
    newCells.forEach((nc, i) => this.addCell(nc, 0.15 + i * 0.07));
    this.refreshRing(0.5);
    this.placePortal();
    this.clearGhost();
  }

  onTowerBuilt(t: Tower): void {
    const k = hexKey(t.cell);
    // Kleine Deko weicht dem Turm
    this.decor.get(k)?.removeFromParent();
    this.decor.delete(k);
    const root = new THREE.Group();
    const p = hexToWorld(t.cell);
    root.position.set(p.x, 0, p.z);
    let head: THREE.Object3D | undefined;
    let arm: THREE.Object3D | undefined;
    if (t.type === 'archer') {
      const m = this.assets.model('building_tower_A_blue');
      root.add(m);
      head = m.getObjectByName('building_tower_A_top_blue') ?? undefined;
    } else {
      const m = this.assets.model('building_tower_catapult_blue');
      root.add(m);
      head = m.getObjectByName('catapult_turret_blue') ?? undefined;
      arm = m.getObjectByName('catapult_arm_blue') ?? undefined;
    }
    this.group.add(root);
    // Ausgangslage merken: die Knoten tragen eigene Skalierung und Drehung
    for (const o of [head, arm]) if (o) o.userData.base = { scale: o.scale.clone(), rot: o.rotation.clone() };
    this.towers.set(t.id, { tower: t, root, head, arm, recoil: 0, pop: 0 });
  }

  onTowerFired(t: Tower): void {
    const v = this.towers.get(t.id);
    if (v) v.recoil = 1;
  }

  /** Höhe, aus der ein Turm schießt */
  muzzle(t: Tower): THREE.Vector3 {
    const p = hexToWorld(t.cell);
    return new THREE.Vector3(p.x, t.type === 'archer' ? 2.3 : 1.5, p.z);
  }

  flashCastle(): void {
    this.castleFlash = 1;
  }

  showGhost(card: Card | null): void {
    this.clearGhost();
    if (!card) return;
    const tile = this.game.cardTile(card);
    const road = roadFor(tile.toCastle, tile.toEnd);
    const g = new THREE.Group();
    const m = this.assets.model(road.name);
    m.rotation.y = road.rot;
    m.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.transparent = true;
        mat.opacity = 0.72;
        mat.emissive = new THREE.Color(0xffd27a);
        mat.emissiveIntensity = 0.35;
        mesh.material = mat;
        mesh.castShadow = false;
      }
    });
    g.add(m);
    const p = hexToWorld(tile.cell);
    g.position.set(p.x, 0.35, p.z);
    this.ghost = g;
    this.group.add(g);
  }

  private clearGhost(): void {
    if (!this.ghost) return;
    this.ghost.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
    });
    this.ghost.removeFromParent();
    this.ghost = null;
  }

  select(h: Hex | null, range = 0): void {
    if (!h) {
      this.highlight.visible = false;
      this.range.visible = false;
      return;
    }
    const p = hexToWorld(h);
    this.highlight.visible = true;
    this.highlight.position.set(p.x, 0.04, p.z);
    this.range.visible = range > 0;
    this.range.position.set(p.x, 0.06, p.z);
    this.range.scale.setScalar(range);
  }

  private makePortal(): THREE.Group {
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xb04dff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75 - i * 0.2, 0.045, 6, 6 + i), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1 + i * 0.03;
      ring.userData.spin = (i % 2 ? -1 : 1) * (1.2 + i * 0.6);
      g.add(ring);
    }
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 6),
      new THREE.MeshBasicMaterial({ color: 0x3a0a66, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.rotation.z = Math.PI / 6;
    glow.position.y = 0.06;
    g.add(glow);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.75, 2.2, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xa040ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 1.1;
    g.add(beam);
    return g;
  }

  /** Portal sitzt auf dem offenen Ende, dort tauchen die Skelette auf */
  private placePortal(): void {
    const end = this.game.pathEnd;
    const p = this.game.polyline.at(0.55);
    this.portal.position.set(p.x, 0, p.z);
    void end;
  }

  update(dt: number): void {
    this.time += dt;
    for (const d of this.drops) {
      if (d.delay > 0) {
        d.delay -= dt;
        if (d.delay <= 0) d.obj.visible = true;
        continue;
      }
      d.t += dt;
      const u = Math.min(1, d.t / d.dur);
      d.obj.position.y = d.fromY * (1 - easeOutBounce(u));
    }
    this.drops = this.drops.filter((d) => d.t < d.dur);

    for (const ring of this.portal.children) {
      if (ring.userData.spin) ring.rotation.z += ring.userData.spin * dt;
    }
    const pulse = 1 + Math.sin(this.time * 3) * 0.06;
    this.portal.scale.set(pulse, 1, pulse);

    for (const v of this.towers.values()) {
      v.pop = Math.min(1, v.pop + dt * 2.6);
      const s = easeOutBack(v.pop);
      v.root.scale.set(s, s * (1 + Math.sin(v.pop * Math.PI) * 0.15), s);
      if (v.head) {
        // Turmkopf dreht sich weich zum Ziel (Modell schaut in Grundstellung nach +Z)
        const want = v.tower.aim;
        const cur = v.head.rotation.y;
        const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        v.head.rotation.y = cur + diff * Math.min(1, dt * 10);
      }
      if (v.arm) v.arm.rotation.x = v.arm.userData.base.rot.x - v.recoil * 1.4;
      else if (v.head) v.head.scale.copy(v.head.userData.base.scale).multiplyScalar(1 + v.recoil * 0.12);
      v.recoil = Math.max(0, v.recoil - dt * 3.5);
    }

    if (this.castleFlash > 0) {
      this.castleFlash = Math.max(0, this.castleFlash - dt * 3);
      const s = 0.85 * (1 + this.castleFlash * 0.08);
      this.castle.scale.set(s, 0.85 * (1 - this.castleFlash * 0.06), s);
    }
    if (this.highlight.visible) {
      (this.highlight.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(this.time * 6) * 0.3;
    }
    if (this.ghost) this.ghost.position.y = 0.35 + Math.sin(this.time * 4) * 0.12;
  }

  /** Mittelpunkt und Radius der Insel für Kamera und Schatten */
  bounds(): { center: THREE.Vector3; radius: number } {
    const box = new THREE.Box3();
    for (const c of this.game.cells.values()) {
      const p = hexToWorld(c.hex);
      box.expandByPoint(new THREE.Vector3(p.x, 0, p.z));
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    return { center, radius: Math.max(size.x, size.z) / 2 + 2.5 };
  }
}

function hash(h: Hex): number {
  const s = Math.sin(h.q * 127.1 + h.r * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function easeOutBounce(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

export function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

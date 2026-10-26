// Spielzustand und Regeln. Rein deterministisch, kein Rendering, kein DOM.
import { type Hex, type Vec2, dist2, hexDistance, hexKey, hexToWorld, mod6, neighbor, opposite } from './hex';
import { type PathTile, Polyline, buildPolyline } from './path';
import { Rng } from './rng';

export const TICK = 1 / 60;
const TURNS = [-2, -1, 0, 1, 2] as const;

export type CellKind = 'grass' | 'path' | 'castle' | 'forest' | 'mountain';
export type TowerType = 'archer' | 'catapult';
export type EnemyType = 'minion' | 'warrior' | 'boss';
export type Phase = 'draft' | 'build' | 'wave' | 'over';
export type Feature = 'none' | 'forest' | 'mountain' | 'gold';

export interface Cell {
  hex: Hex;
  kind: CellKind;
  towerId?: number;
}

/** Wegkarte: Abbiegung relativ zur Geradeaus-Richtung (0 = gerade, ±1 = weite Kurve, ±2 = enge Kurve) */
export interface Card {
  turn: -2 | -1 | 0 | 1 | 2;
  feature: Feature;
}

export interface TowerStats {
  cost: number;
  range: number;
  damage: number;
  cooldown: number;
  splash: number;
}

export const TOWERS: Record<TowerType, TowerStats> = {
  archer: { cost: 40, range: 4.4, damage: 7, cooldown: 0.65, splash: 0 },
  catapult: { cost: 70, range: 6.2, damage: 15, cooldown: 2.4, splash: 1.6 },
};

interface EnemyStats {
  hp: number;
  speed: number;
  gold: number;
  leak: number;
  radius: number;
}

const ENEMIES: Record<EnemyType, EnemyStats> = {
  minion: { hp: 22, speed: 1.55, gold: 4, leak: 1, radius: 0.35 },
  warrior: { hp: 75, speed: 1.1, gold: 9, leak: 2, radius: 0.45 },
  boss: { hp: 900, speed: 0.75, gold: 60, leak: 8, radius: 0.8 },
};

export interface Tower {
  id: number;
  type: TowerType;
  cell: Hex;
  pos: Vec2;
  cooldown: number;
  /** Bonus durch Gelände in der Nachbarschaft */
  rangeBonus: number;
  rateBonus: number;
  aim: number;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  hp: number;
  maxHp: number;
  s: number;
  speed: number;
  /** Zeit bis zum Loslaufen (Auftauch-Animation) */
  rise: number;
  alive: boolean;
}

export interface Projectile {
  id: number;
  kind: TowerType;
  targetId: number;
  from: Vec2;
  to: Vec2;
  t: number;
  flight: number;
  damage: number;
  splash: number;
}

export type GameEvent =
  | { type: 'shoot'; tower: Tower; proj: Projectile }
  | { type: 'hit'; enemy: Enemy; damage: number; pos: Vec2; kind: TowerType }
  | { type: 'impact'; pos: Vec2; kind: TowerType }
  | { type: 'kill'; enemy: Enemy; pos: Vec2; gold: number }
  | { type: 'spawn'; enemy: Enemy }
  | { type: 'leak'; enemy: Enemy; damage: number }
  | { type: 'tilePlaced'; tile: PathTile; card: Card; newCells: Cell[] }
  | { type: 'towerBuilt'; tower: Tower }
  | { type: 'waveStart'; wave: number }
  | { type: 'waveEnd'; wave: number; bonus: number }
  | { type: 'gameOver'; wave: number };

interface SpawnEntry {
  type: EnemyType;
  at: number;
}

export class Game {
  readonly rng: Rng;
  readonly castle: Hex = { q: 0, r: 0 };
  readonly cells = new Map<string, Cell>();
  readonly path: PathTile[] = [];
  readonly towers: Tower[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  polyline!: Polyline;

  phase: Phase = 'draft';
  wave = 0;
  gold = 100;
  lives = 20;
  readonly maxLives = 20;
  cards: Card[] = [];
  time = 0;

  private nextId = 1;
  private spawnQueue: SpawnEntry[] = [];
  private waveTime = 0;
  events: GameEvent[] = [];

  constructor(seed = 1) {
    this.rng = new Rng(seed);
    this.setCell(this.castle, 'castle');
    for (let d = 0; d < 6; d++) this.ensureGrass(neighbor(this.castle, d));
    // Startweg: drei Kacheln nach Osten, mit leichtem Schwung
    let toCastle = 3;
    let cell = neighbor(this.castle, 0);
    for (const turn of [0, 1, 0] as const) {
      const toEnd = mod6(opposite(toCastle) + turn);
      this.layTile({ cell, toCastle, toEnd });
      cell = neighbor(cell, toEnd);
      toCastle = opposite(toEnd);
    }
    this.polyline = buildPolyline(this.castle, this.path);
    this.events = [];
    this.dealCards();
  }

  // ---------- Abfragen ----------

  get pathEnd(): PathTile {
    return this.path[this.path.length - 1];
  }

  cell(h: Hex): Cell | undefined {
    return this.cells.get(hexKey(h));
  }

  /** Wohin eine Karte die nächste Kachel legen würde */
  cardTile(card: Card): PathTile {
    const end = this.pathEnd;
    const cell = neighbor(end.cell, end.toEnd);
    const toCastle = opposite(end.toEnd);
    const toEnd = mod6(opposite(toCastle) + card.turn);
    return { cell, toCastle, toEnd };
  }

  /** Feld ist schon Weg, Burg oder Turm (extra: gedanklich schon gelegte Wegfelder) */
  private blocked(h: Hex, extra: ReadonlySet<string>): boolean {
    const k = hexKey(h);
    if (extra.has(k)) return true;
    const c = this.cells.get(k);
    return !!c && (c.kind === 'path' || c.kind === 'castle' || c.towerId !== undefined);
  }

  /** Kann der Weg von dieser Kachel aus noch depth Schritte weiterwachsen? */
  private canGrow(tile: PathTile, extra: Set<string>, depth: number): boolean {
    const cell = neighbor(tile.cell, tile.toEnd);
    if (this.blocked(cell, extra)) return false;
    if (depth === 0) return true;
    const k = hexKey(cell);
    const toCastle = opposite(tile.toEnd);
    extra.add(k);
    const ok = TURNS.some((turn) => this.canGrow({ cell, toCastle, toEnd: mod6(opposite(toCastle) + turn) }, extra, depth - 1));
    extra.delete(k);
    return ok;
  }

  private canPlace(turn: Card['turn']): boolean {
    const t = this.cardTile({ turn, feature: 'none' });
    if (this.blocked(t.cell, new Set())) return false;
    // Vorausschau, damit der Weg nicht in eine Sackgasse läuft
    return this.canGrow(t, new Set([hexKey(t.cell)]), 3);
  }

  canBuild(h: Hex): boolean {
    const c = this.cell(h);
    if (!c || c.kind !== 'grass' || c.towerId !== undefined || this.phase === 'over') return false;
    // Das Feld vor dem offenen Ende und seine Nachbarn bleiben frei, sonst kann der Weg nicht weiterwachsen
    const end = this.pathEnd;
    return hexDistance(neighbor(end.cell, end.toEnd), h) > 1;
  }

  towerStats(t: Tower): { range: number; cooldown: number } {
    const s = TOWERS[t.type];
    return { range: s.range + t.rangeBonus, cooldown: s.cooldown / (1 + t.rateBonus) };
  }

  /** Geländeboni: Wald beschleunigt, Berge erhöhen die Reichweite */
  terrainBonus(h: Hex): { range: number; rate: number } {
    let range = 0;
    let rate = 0;
    for (let d = 0; d < 6; d++) {
      const c = this.cell(neighbor(h, d));
      if (c?.kind === 'forest') rate += 0.15;
      if (c?.kind === 'mountain') range += 0.7;
    }
    return { range, rate };
  }

  // ---------- Befehle ----------

  pickCard(index: number): boolean {
    if (this.phase !== 'draft') return false;
    const card = this.cards[index];
    if (!card) return false;
    const tile = this.cardTile(card);
    const newCells = this.layTile(tile);
    if (card.feature === 'gold') this.gold += 30;
    if (card.feature === 'forest' || card.feature === 'mountain') {
      const candidates = newCells.filter((c) => c.kind === 'grass');
      const n = Math.min(candidates.length, card.feature === 'forest' ? 2 : 1);
      for (let i = 0; i < n; i++) {
        const c = candidates.splice(this.rng.int(candidates.length), 1)[0];
        c.kind = card.feature;
      }
    }
    this.polyline = buildPolyline(this.castle, this.path);
    this.events.push({ type: 'tilePlaced', tile, card, newCells });
    this.refreshTowerBonuses();
    this.cards = [];
    this.phase = 'build';
    return true;
  }

  build(h: Hex, type: TowerType): Tower | null {
    const stats = TOWERS[type];
    if (!this.canBuild(h) || this.gold < stats.cost) return null;
    this.gold -= stats.cost;
    const tower: Tower = {
      id: this.nextId++,
      type,
      cell: h,
      pos: hexToWorld(h),
      cooldown: 0.3,
      rangeBonus: 0,
      rateBonus: 0,
      aim: Math.PI,
    };
    this.cell(h)!.towerId = tower.id;
    this.towers.push(tower);
    this.refreshTowerBonuses();
    this.events.push({ type: 'towerBuilt', tower });
    return tower;
  }

  startWave(): boolean {
    if (this.phase !== 'build') return false;
    this.wave++;
    this.phase = 'wave';
    this.waveTime = 0;
    this.spawnQueue = this.composeWave(this.wave);
    this.events.push({ type: 'waveStart', wave: this.wave });
    return true;
  }

  // ---------- Simulation ----------

  step(dt: number = TICK): void {
    this.time += dt;
    if (this.phase !== 'wave') {
      this.stepProjectiles(dt);
      return;
    }
    this.waveTime += dt;
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveTime) {
      this.spawn(this.spawnQueue.shift()!.type);
    }
    this.stepEnemies(dt);
    this.stepTowers(dt);
    this.stepProjectiles(dt);
    this.enemies = this.enemies.filter((e) => e.alive);

    if (this.lives <= 0) {
      this.phase = 'over';
      this.events.push({ type: 'gameOver', wave: this.wave });
      return;
    }
    if (!this.spawnQueue.length && !this.enemies.length) {
      const bonus = 20 + this.wave * 5;
      this.gold += bonus;
      this.phase = 'draft';
      this.dealCards();
      this.events.push({ type: 'waveEnd', wave: this.wave, bonus });
    }
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- intern ----------

  private setCell(h: Hex, kind: CellKind): Cell {
    const k = hexKey(h);
    let c = this.cells.get(k);
    if (!c) {
      c = { hex: h, kind };
      this.cells.set(k, c);
    } else c.kind = kind;
    return c;
  }

  private ensureGrass(h: Hex): Cell | null {
    if (this.cells.has(hexKey(h))) return null;
    return this.setCell(h, 'grass');
  }

  private layTile(tile: PathTile): Cell[] {
    this.setCell(tile.cell, 'path');
    this.path.push(tile);
    const added: Cell[] = [];
    for (let d = 0; d < 6; d++) {
      if (d === tile.toEnd) continue;
      const c = this.ensureGrass(neighbor(tile.cell, d));
      if (c) added.push(c);
    }
    return added;
  }

  /** Teilt bis zu drei Karten aus; ist kein Anlegen möglich, gibt es keine Karten und die Wahl entfällt */
  private dealCards(): void {
    const turns = TURNS.filter((t) => this.canPlace(t));
    const features: Feature[] = ['forest', 'mountain', 'gold', 'none'];
    this.cards = [];
    if (!turns.length) {
      this.phase = 'build';
      return;
    }
    const pool = [...turns];
    for (let i = 0; i < 3; i++) {
      if (!pool.length) pool.push(...turns);
      const turn = pool.splice(this.rng.int(pool.length), 1)[0];
      this.cards.push({ turn, feature: this.rng.pick(features) });
    }
  }

  private refreshTowerBonuses(): void {
    for (const t of this.towers) {
      const b = this.terrainBonus(t.cell);
      t.rangeBonus = b.range;
      t.rateBonus = b.rate;
    }
  }

  private composeWave(n: number): SpawnEntry[] {
    const list: SpawnEntry[] = [];
    let at = 1.2;
    const minions = 4 + Math.floor(n * 1.8);
    const warriors = n >= 3 ? Math.floor((n - 1) / 2) : 0;
    for (let i = 0; i < minions; i++) {
      list.push({ type: 'minion', at });
      at += Math.max(0.45, 1.1 - n * 0.05);
      if (warriors && i % Math.max(2, Math.floor(minions / warriors)) === 1) {
        list.push({ type: 'warrior', at });
        at += 0.9;
      }
    }
    if (n % 5 === 0) list.push({ type: 'boss', at: at + 2 });
    return list;
  }

  private spawn(type: EnemyType): void {
    const st = ENEMIES[type];
    const scale = Math.pow(1.17, this.wave - 1);
    const hp = Math.round(st.hp * scale);
    const e: Enemy = {
      id: this.nextId++,
      type,
      hp,
      maxHp: hp,
      s: 0,
      speed: st.speed * (1 + this.rng.range(-0.06, 0.06)),
      rise: 0.9,
      alive: true,
    };
    this.enemies.push(e);
    this.events.push({ type: 'spawn', enemy: e });
  }

  enemyPos(e: Enemy): Vec2 {
    return this.polyline.at(e.s);
  }

  private stepEnemies(dt: number): void {
    const end = this.polyline.length - 1.05;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.rise > 0) {
        e.rise -= dt;
        continue;
      }
      e.s += e.speed * dt;
      if (e.s >= end) {
        e.alive = false;
        const dmg = ENEMIES[e.type].leak;
        this.lives = Math.max(0, this.lives - dmg);
        this.events.push({ type: 'leak', enemy: e, damage: dmg });
      }
    }
  }

  private stepTowers(dt: number): void {
    for (const t of this.towers) {
      t.cooldown -= dt;
      const { range, cooldown } = this.towerStats(t);
      // Ziel: der Gegner, der am weitesten gekommen ist
      let best: Enemy | null = null;
      for (const e of this.enemies) {
        if (!e.alive || e.rise > 0.3) continue;
        if (dist2(this.enemyPos(e), t.pos) > range * range) continue;
        if (!best || e.s > best.s) best = e;
      }
      if (!best) continue;
      const p = this.enemyPos(best);
      t.aim = Math.atan2(p.x - t.pos.x, p.z - t.pos.z);
      if (t.cooldown > 0) continue;
      t.cooldown = cooldown;
      this.fire(t, best);
    }
  }

  private fire(t: Tower, target: Enemy): void {
    const st = TOWERS[t.type];
    const from = { ...t.pos };
    let to: Vec2;
    let flight: number;
    if (t.type === 'archer') {
      to = this.enemyPos(target);
      flight = Math.sqrt(dist2(from, to)) / 16 + 0.08;
    } else {
      flight = 1.05;
      // Vorhalten: dorthin zielen, wo der Gegner beim Einschlag sein wird
      to = this.polyline.at(target.s + (target.rise > 0 ? 0 : target.speed * flight));
    }
    const proj: Projectile = {
      id: this.nextId++,
      kind: t.type,
      targetId: target.id,
      from,
      to,
      t: 0,
      flight,
      damage: st.damage * (1 + (this.wave - 1) * 0.04),
      splash: st.splash,
    };
    this.projectiles.push(proj);
    this.events.push({ type: 'shoot', tower: t, proj });
  }

  private stepProjectiles(dt: number): void {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.t += dt;
      const target = this.enemies.find((e) => e.id === p.targetId);
      if (p.kind === 'archer' && target?.alive) p.to = this.enemyPos(target);
      if (p.t < p.flight) {
        keep.push(p);
        continue;
      }
      if (p.kind === 'archer') {
        if (target?.alive) this.damage(target, p.damage, p.kind);
        else this.events.push({ type: 'impact', pos: p.to, kind: p.kind });
      } else {
        this.events.push({ type: 'impact', pos: p.to, kind: p.kind });
        for (const e of this.enemies) {
          // Noch auftauchende Skelette sind wie beim Zielen nicht treffbar
          if (!e.alive || e.rise > 0.3) continue;
          const d2 = dist2(this.enemyPos(e), p.to);
          const r = p.splash + ENEMIES[e.type].radius;
          if (d2 <= r * r) this.damage(e, p.damage * (d2 < 0.36 ? 1.3 : 1), p.kind);
        }
      }
    }
    this.projectiles = keep;
  }

  private damage(e: Enemy, amount: number, kind: TowerType): void {
    const dmg = Math.round(amount);
    e.hp -= dmg;
    const pos = this.enemyPos(e);
    this.events.push({ type: 'hit', enemy: e, damage: dmg, pos, kind });
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      const gold = ENEMIES[e.type].gold;
      this.gold += gold;
      this.events.push({ type: 'kill', enemy: e, pos, gold });
    }
  }
}

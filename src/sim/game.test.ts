import { describe, expect, it } from 'vitest';
import { Game, TICK } from './game';
import { hexKey, neighbor } from './hex';

function runWave(g: Game, maxSeconds = 300): void {
  g.startWave();
  for (let i = 0; i < maxSeconds / TICK && g.phase === 'wave'; i++) g.step();
}

describe('Game', () => {
  it('startet mit Burg, drei Wegkacheln und drei Karten', () => {
    const g = new Game(1);
    expect(g.path).toHaveLength(3);
    expect(g.cards).toHaveLength(3);
    expect(g.phase).toBe('draft');
  });

  it('legt eine Karte an das offene Ende und verlängert den Weg', () => {
    const g = new Game(2);
    const before = g.polyline.length;
    const expected = neighbor(g.pathEnd.cell, g.pathEnd.toEnd);
    expect(g.pickCard(0)).toBe(true);
    expect(g.path).toHaveLength(4);
    expect(hexKey(g.pathEnd.cell)).toBe(hexKey(expected));
    expect(g.polyline.length).toBeGreaterThan(before);
    expect(g.phase).toBe('build');
  });

  it('ist deterministisch bei gleichem Seed', () => {
    const play = (seed: number) => {
      const g = new Game(seed);
      g.pickCard(1);
      const grass = [...g.cells.values()].find((c) => g.canBuild(c.hex))!;
      g.build(grass.hex, 'archer');
      runWave(g);
      return [g.lives, g.gold, g.time.toFixed(3)].join('|');
    };
    expect(play(7)).toBe(play(7));
  });

  it('Gegner ohne Türme kosten Leben, Wellenende teilt neue Karten aus', () => {
    const g = new Game(3);
    g.pickCard(0);
    runWave(g);
    expect(g.lives).toBeLessThan(g.maxLives);
    expect(g.phase).toBe('draft');
    expect(g.cards).toHaveLength(3);
  });

  it('Türme töten Gegner und bringen Gold', () => {
    const g = new Game(4);
    g.pickCard(0);
    const spots = [...g.cells.values()].filter((c) => g.canBuild(c.hex));
    g.build(spots[0].hex, 'archer');
    g.build(spots[spots.length - 1].hex, 'archer');
    const goldBefore = g.gold;
    let kills = 0;
    g.startWave();
    for (let i = 0; i < 300 / TICK && g.phase === 'wave'; i++) {
      g.step();
      kills += g.drainEvents().filter((e) => e.type === 'kill').length;
    }
    expect(kills).toBeGreaterThan(0);
    expect(g.gold).toBeGreaterThan(goldBefore);
  });

  it('Bauen kostet Gold und blockiert das Feld', () => {
    const g = new Game(5);
    g.pickCard(0);
    const spot = [...g.cells.values()].find((c) => g.canBuild(c.hex))!;
    const gold = g.gold;
    expect(g.build(spot.hex, 'catapult')).not.toBeNull();
    expect(g.gold).toBe(gold - 70);
    expect(g.canBuild(spot.hex)).toBe(false);
  });

  it('Weg wächst über viele Runden, ohne sich selbst oder Türme zu überlagern', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = new Game(seed);
      for (let w = 0; w < 30; w++) {
        if (g.phase === 'draft') expect(g.pickCard(g.rng.int(g.cards.length))).toBe(true);
        // Zufällig Türme setzen, auch direkt neben dem Wegende
        g.gold = 1000;
        const spots = [...g.cells.values()].filter((c) => g.canBuild(c.hex));
        for (let i = 0; i < 2 && spots.length; i++) g.build(spots.splice(g.rng.int(spots.length), 1)[0].hex, 'archer');
        // Welle überspringen: nur das Wachsen des Weges zählt
        (g as unknown as { phase: string }).phase = 'draft';
        (g as unknown as { dealCards(): void }).dealCards();
        const keys = g.path.map((t) => hexKey(t.cell));
        expect(new Set(keys).size).toBe(keys.length);
        for (const k of keys) expect(g.cells.get(k)!.towerId).toBeUndefined();
      }
      expect(g.path.length).toBeGreaterThan(15);
    }
  });
});

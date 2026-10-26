// Einstieg: verbindet Simulation, Darstellung, Eingabe und Oberfläche.
import * as THREE from 'three';
import { type Card, Game, type GameEvent, TICK, TOWERS, type TowerType } from './sim/game';
import { type Hex, hexEq, hexToWorld, worldToHex } from './sim/hex';
import { Assets } from './render/assets';
import { Enemies } from './render/enemies';
import { Fx } from './render/fx';
import { Stage } from './render/stage';
import { Thumbs } from './render/thumbs';
import { World, roadFor } from './render/world';
import { Sfx } from './ui/audio';
import { Hud } from './ui/hud';
import { Input } from './ui/input';

const params = new URLSearchParams(location.search);

class App {
  stage = new Stage(document.getElementById('game')!);
  assets = new Assets();
  sfx = new Sfx();
  hud = new Hud();
  game!: Game;
  world!: World;
  enemies!: Enemies;
  fx!: Fx;
  thumbs!: Thumbs;
  towerThumbs: Record<TowerType, string> = { archer: '', catapult: '' };

  private acc = 0;
  private last = performance.now();
  private hitStop = 0;
  private selectedCard = -1;
  private selectedCell: Hex | null = null;
  private camGoal = new THREE.Vector3(3, 0, 0);
  private distGoal = 24;
  private userMovedCam = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private slowFrames = 0;
  private time = 0;
  private speed = 1;
  private cardThumbs = new WeakMap<Card, string>();

  async start(): Promise<void> {
    const bar = document.querySelector<HTMLElement>('#loading .bar i')!;
    await this.assets.load((p) => (bar.style.width = `${Math.round(p * 100)}%`));
    this.thumbs = new Thumbs(this.stage.renderer);
    this.towerThumbs.archer = this.thumbs.render(this.assets.model('building_tower_A_blue'), 192, 25);
    this.towerThumbs.catapult = this.thumbs.render(this.assets.model('building_tower_catapult_blue'), 192, 30);
    this.stage.addClouds((n) => this.assets.model(n));

    new Input(this.stage.renderer.domElement, {
      pan: (dx, dy) => this.pan(dx, dy),
      zoom: (f) => {
        this.distGoal = THREE.MathUtils.clamp(this.distGoal * f, this.stage.minDistance, this.stage.maxDistance);
        this.userMovedCam = 4;
      },
      tap: (x, y) => this.tap(x, y),
      any: () => this.sfx.unlock(),
    });
    this.hud.onMute = () => {
      this.sfx.unlock();
      this.sfx.setMuted(!this.sfx.muted);
      this.hud.setMuted(this.sfx.muted);
    };
    this.hud.setMuted(this.sfx.muted);
    if (params.has('fps')) document.getElementById('fps')!.style.display = 'block';
    if (params.has('fast')) this.speed = 3;

    this.newGame(Number(params.get('seed')) || Math.floor(Math.random() * 1e9));
    document.getElementById('loading')!.classList.add('done');
    requestAnimationFrame(() => this.frame());
  }

  newGame(seed: number): void {
    this.game = new Game(seed);
    this.world = new World(this.assets, this.game);
    this.enemies = new Enemies(this.assets, this.game, this.stage.camera);
    this.fx = new Fx(this.assets);
    this.stage.scene.add(this.world.group, this.enemies.group, this.fx.group);
    this.selectedCard = -1;
    this.selectedCell = null;
    this.refocus(true);
    this.stage.updateIslandMask(this.world.landHexes());
    this.hud.reset();
    this.showPhase();
  }

  // ---------- Kamera ----------

  private pan(dx: number, dy: number): void {
    // Pixel in Weltmaß umrechnen: Höhe des sichtbaren Bodens grob über die Distanz
    const k = (this.stage.distance * 1.15) / innerHeight;
    this.camGoal.x -= dx * k;
    this.camGoal.z -= dy * k * 1.25;
    const b = this.world.bounds();
    this.camGoal.x = THREE.MathUtils.clamp(this.camGoal.x, b.center.x - b.radius, b.center.x + b.radius);
    this.camGoal.z = THREE.MathUtils.clamp(this.camGoal.z, b.center.z - b.radius, b.center.z + b.radius);
    this.stage.target.copy(this.camGoal);
    this.userMovedCam = 4;
  }

  /** Kamera so setzen, dass die ganze Insel sichtbar ist */
  private refocus(instant = false): void {
    const b = this.world.bounds();
    this.camGoal.copy(b.center);
    // Im Hochformat schmaler Bildschirm: mehr Abstand
    const aspect = innerWidth / innerHeight;
    const fit = b.radius / Math.min(1, aspect * 1.25);
    this.distGoal = THREE.MathUtils.clamp(fit * 1.7 + 3, this.stage.minDistance, this.stage.maxDistance);
    this.stage.fitShadow(b.center, b.radius + 3);
    if (instant) {
      this.stage.target.copy(this.camGoal);
      this.stage.distance = this.distGoal;
    }
  }

  // ---------- Eingabe ----------

  private tap(x: number, y: number): void {
    this.sfx.unlock();
    const p = this.stage.pickGround(x, y);
    if (!p) return;
    const h = worldToHex(p.x, p.z);
    const g = this.game;
    if (g.phase === 'draft') {
      if (this.selectedCard >= 0 && hexEq(h, g.cardTile(g.cards[this.selectedCard]).cell)) this.placeCard();
      return;
    }
    if (g.phase === 'over') return;
    const cell = g.cell(h);
    if (cell?.towerId !== undefined) {
      const t = g.towers.find((tt) => tt.id === cell.towerId)!;
      this.selectedCell = h;
      this.world.select(h, g.towerStats(t).range);
      this.hud.towerInfo(t, g.towerStats(t), this.towerThumbs[t.type], () => this.deselect());
      this.sfx.click();
      return;
    }
    if (g.canBuild(h)) {
      this.selectedCell = h;
      this.world.select(h, TOWERS.archer.range + g.terrainBonus(h).range);
      this.hud.buildMenu(
        g.gold,
        g.terrainBonus(h),
        this.towerThumbs,
        (type) => this.build(type),
        (type) => this.world.select(h, TOWERS[type].range + g.terrainBonus(h).range),
        () => this.deselect(),
      );
      this.sfx.click();
      return;
    }
    this.deselect();
  }

  private deselect(): void {
    this.selectedCell = null;
    this.world.select(null);
    this.showPhase();
  }

  private selectCard(i: number): void {
    if (this.selectedCard === i) {
      this.placeCard();
      return;
    }
    this.selectedCard = i;
    this.world.showGhost(this.game.cards[i]);
    this.hud.markCard(i);
    this.sfx.click();
    // Kamera zum Ziel schwenken, falls es außerhalb liegt
    const t = hexToWorld(this.game.cardTile(this.game.cards[i]).cell);
    const s = this.stage.toScreen(new THREE.Vector3(t.x, 0, t.z));
    if (s.x < 30 || s.x > innerWidth - 30 || s.y < 80 || s.y > innerHeight * 0.62) {
      this.camGoal.set(t.x, 0, t.z + 2);
      this.userMovedCam = 0;
    }
  }

  private placeCard(): void {
    if (this.selectedCard < 0) return;
    this.game.pickCard(this.selectedCard);
    this.selectedCard = -1;
    this.processEvents();
  }

  private build(type: TowerType): void {
    if (!this.selectedCell) return;
    const t = this.game.build(this.selectedCell, type);
    if (!t) {
      this.hud.shake('#gold');
      return;
    }
    this.processEvents();
    this.deselect();
  }

  // ---------- Ablauf ----------

  private showPhase(): void {
    const g = this.game;
    this.hud.stats(g);
    if (g.phase === 'draft') {
      // Vorschaubilder einmal pro Austeilen erzeugen, nicht bei jedem Neuzeichnen
      const imgs = g.cards.map((c) => {
        let url = this.cardThumbs.get(c);
        if (!url) this.cardThumbs.set(c, (url = this.cardThumb(c)));
        return url;
      });
      this.hud.draft(g.cards, imgs, (i) => this.selectCard(i), this.selectedCard, g.wave + 1);
    } else if (g.phase === 'build') {
      this.hud.buildPhase(g.wave + 1, g.towers.length === 0, () => {
        this.sfx.unlock();
        this.deselect();
        if (g.startWave()) this.processEvents();
      });
    } else if (g.phase === 'wave') {
      this.hud.wavePhase(g.wave);
    }
  }

  private cardThumb(c: Card): string {
    const g = this.game;
    const tile = g.cardTile(c);
    const holder = new THREE.Group();
    // Kachel so drehen, dass "vom Weg kommend" unten liegt: Ansicht wie auf der Karte
    const road = roadFor(tile.toCastle, tile.toEnd);
    const m = this.assets.model(road.name);
    m.rotation.y = road.rot;
    holder.add(m);
    if (c.feature === 'forest' || c.feature === 'mountain') {
      const deco = this.assets.model(c.feature === 'forest' ? 'trees_B_large' : 'mountain_A_grass_trees');
      const side = new THREE.Group();
      const grass = this.assets.model('hex_grass');
      side.add(grass, deco);
      side.position.set(1.6, -0.3, 1.9);
      side.scale.setScalar(0.62);
      holder.add(side);
    } else if (c.feature === 'gold') {
      const sack = this.assets.model('sack');
      sack.position.set(0.55, 0, 0.45);
      const barrel = this.assets.model('barrel');
      barrel.position.set(-0.5, 0, 0.55);
      holder.add(sack, barrel);
    }
    return this.thumbs.render(holder, 200, 58);
  }

  private processEvents(): void {
    const g = this.game;
    let phaseChanged = false;
    for (const e of g.drainEvents()) {
      this.handle(e);
      if (e.type === 'tilePlaced' || e.type === 'waveStart' || e.type === 'waveEnd' || e.type === 'gameOver') phaseChanged = true;
    }
    this.hud.stats(g);
    if (!phaseChanged) return;
    // Ein offenes Menü darf die Kartenwahl nicht verdecken
    if (g.phase === 'draft' || g.phase === 'over' || !this.selectedCell) {
      this.selectedCell = null;
      this.world.select(null);
      this.showPhase();
    }
  }

  private handle(e: GameEvent): void {
    const g = this.game;
    switch (e.type) {
      case 'tilePlaced': {
        this.world.onTilePlaced(e.tile, e.newCells);
        const p = hexToWorld(e.tile.cell);
        setTimeout(() => {
          this.fx.landing(new THREE.Vector3(p.x, 0, p.z));
          this.stage.addShake(0.35);
        }, 400);
        this.sfx.place();
        if (e.card.feature === 'gold') this.hud.floatText(this.stage.toScreen(new THREE.Vector3(p.x, 1, p.z)), '+30', 'gold');
        this.stage.updateIslandMask(this.world.landHexes());
        this.refocus();
        this.userMovedCam = 0;
        break;
      }
      case 'towerBuilt': {
        this.world.onTowerBuilt(e.tower);
        const p = hexToWorld(e.tower.cell);
        this.fx.landing(new THREE.Vector3(p.x, 0, p.z));
        this.stage.addShake(0.25);
        this.sfx.build();
        break;
      }
      case 'waveStart':
        this.hud.banner(`Welle ${e.wave}`, e.wave % 5 === 0 ? 'Ein Knochenfürst erwacht!' : 'Die Toten erheben sich');
        this.sfx.horn();
        break;
      case 'waveEnd':
        this.hud.banner('Welle geschafft!', g.cards.length ? `+${e.bonus} Gold` : `+${e.bonus} Gold · kein Platz für neuen Weg`);
        this.sfx.fanfare();
        break;
      case 'gameOver':
        // Neustart lädt die Seite neu: einfacher als jede GPU-Ressource einzeln freizugeben
        this.hud.gameOver(e.wave, () => {
          const url = new URL(location.href);
          url.searchParams.delete('seed');
          location.replace(url);
        });
        break;
      case 'spawn':
        this.enemies.spawn(e.enemy);
        this.fx.puff(new THREE.Vector3(g.enemyPos(e.enemy).x, 0, g.enemyPos(e.enemy).z), 6, 0.6);
        break;
      case 'shoot': {
        this.world.onTowerFired(e.tower);
        this.fx.shoot(e.proj, this.world.muzzle(e.tower));
        if (e.tower.type === 'archer') this.sfx.bow();
        else this.sfx.catapult();
        break;
      }
      case 'hit': {
        const pos = new THREE.Vector3(e.pos.x, 0, e.pos.z);
        this.enemies.hit(e.enemy, e.kind === 'catapult');
        if (e.kind === 'archer') {
          this.fx.hitSpark(pos);
          this.sfx.arrowHit();
        }
        this.hud.floatText(this.stage.toScreen(pos.clone().setY(1.6)), String(e.damage), e.kind === 'catapult' ? 'big' : '');
        break;
      }
      case 'impact': {
        const pos = new THREE.Vector3(e.pos.x, 0, e.pos.z);
        if (e.kind === 'catapult') {
          this.fx.impact(pos, TOWERS.catapult.splash);
          this.stage.addShake(0.3);
          this.sfx.boom();
        }
        break;
      }
      case 'kill': {
        const pos = new THREE.Vector3(e.pos.x, 0, e.pos.z);
        const big = e.enemy.type !== 'minion';
        this.enemies.kill(e.enemy);
        this.fx.boneBurst(pos, big);
        this.sfx.boneBreak(big);
        this.hitStop = Math.max(this.hitStop, e.enemy.type === 'boss' ? 0.25 : big ? 0.06 : 0.03);
        if (e.enemy.type === 'boss') this.stage.addShake(0.9);
        this.hud.flyCoins(this.stage.toScreen(pos.clone().setY(1)), e.gold, () => this.sfx.coin());
        break;
      }
      case 'leak':
        this.enemies.remove(e.enemy);
        this.world.flashCastle();
        this.stage.addShake(0.55);
        this.hitStop = Math.max(this.hitStop, 0.08);
        this.sfx.castleHit();
        this.hud.hurt();
        this.fx.boneBurst(this.world.castle.position.clone().add(new THREE.Vector3(0.8, 0, 0)), false);
        break;
    }
  }

  // ---------- Hauptschleife ----------

  private frame(): void {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      const fps = this.fpsFrames / this.fpsTime;
      document.getElementById('fps')!.textContent = `${Math.round(fps)} fps · ${this.stage.renderer.info.render.calls} dc · ${this.stage.renderer.getPixelRatio()}x`;
      // Bei Ruckeln die Auflösung senken (nur nach unten, damit es nicht pendelt)
      this.slowFrames = fps < 48 && document.visibilityState === 'visible' ? this.slowFrames + 1 : 0;
      if (this.slowFrames >= 4) {
        this.slowFrames = 0;
        const pr = this.stage.renderer.getPixelRatio();
        if (pr > 1.25) {
          this.stage.renderer.setPixelRatio(Math.max(1.25, pr - 0.375));
          this.stage.resize();
        }
      }
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    // Trefferstopp: kurz einfrieren, damit Treffer Gewicht haben
    let simDt = dt * this.speed;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      simDt *= 0.08;
    }

    this.acc += simDt;
    let steps = 0;
    while (this.acc >= TICK && steps < 12) {
      this.game.step(TICK);
      this.acc -= TICK;
      steps++;
      this.processEvents();
    }

    // Kamera gleitet zum Ziel
    this.userMovedCam = Math.max(0, this.userMovedCam - dt);
    const k = 1 - Math.exp(-dt * 4);
    this.stage.target.lerp(this.camGoal, k);
    this.stage.distance += (this.distGoal - this.stage.distance) * k;

    const animDt = this.hitStop > 0 ? dt * 0.08 : simDt;
    this.world.update(dt);
    this.enemies.update(animDt);
    this.fx.update(animDt);
    this.stage.update(dt, this.time);
    this.stage.render();
  }
}

const app = new App();
// Für automatisierte Sichtprüfungen erreichbar machen
if (params.has('debug')) (window as unknown as { app: App }).app = app;
app.start().catch((err) => {
  console.error(err);
  document.querySelector('#loading p')!.textContent = 'Fehler beim Laden: ' + String(err);
});

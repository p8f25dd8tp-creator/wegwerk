// Skelette: Animation, Trefferblitz, Lebensbalken, Tod.
import * as THREE from 'three';
import type { Enemy, Game } from '../sim/game';
import type { Assets } from './assets';

interface EnemyView {
  enemy: Enemy;
  root: THREE.Object3D;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  walk: THREE.AnimationAction;
  mats: THREE.MeshStandardMaterial[];
  flash: number;
  squash: number;
  scale: number;
  dying: number;
  heading: number;
  barShown: number;
}

const BASE_SCALE = 0.52;
const MAX_BARS = 128;

export class Enemies {
  readonly group = new THREE.Group();
  private views = new Map<number, EnemyView>();
  private dead: EnemyView[] = [];
  private barBg: THREE.InstancedMesh;
  private barFg: THREE.InstancedMesh;
  private tmp = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(
    private assets: Assets,
    private game: Game,
    private camera: THREE.Camera,
  ) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0.5, 0, 0);
    this.barBg = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x1a1020, transparent: true, opacity: 0.75, depthTest: false }), MAX_BARS);
    this.barFg = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }), MAX_BARS);
    this.barBg.renderOrder = 10;
    this.barFg.renderOrder = 11;
    this.barBg.frustumCulled = this.barFg.frustumCulled = false;
    this.barFg.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BARS * 3), 3);
    this.group.add(this.barBg, this.barFg);
  }

  spawn(e: Enemy): void {
    const kind = e.type === 'minion' ? 'minion' : 'warrior';
    const { root: model, clips } = this.assets.character(kind);
    const mats: THREE.MeshStandardMaterial[] = [];
    const matMap = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    model.traverse((n) => {
      const m = n as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      const src = m.material as THREE.MeshStandardMaterial;
      let mat = matMap.get(src);
      if (!mat) {
        mat = src.clone();
        if (e.type === 'boss') {
          mat.color.multiply(new THREE.Color(1, 0.75, 0.75));
        }
        matMap.set(src, mat);
        mats.push(mat);
      }
      m.material = mat;
    });
    const scale = BASE_SCALE * (e.type === 'boss' ? 1.9 : e.type === 'warrior' ? 1.12 : 1);
    model.scale.setScalar(scale);
    const root = new THREE.Group();
    root.add(model);
    this.group.add(root);

    const mixer = new THREE.AnimationMixer(model);
    const walkClip = clips.get(e.type === 'minion' ? 'Walking_D_Skeletons' : 'Walking_A') ?? clips.get('Walking_A')!;
    const walk = mixer.clipAction(walkClip);
    walk.timeScale = e.speed / (e.type === 'boss' ? 0.9 : 1.25);
    const rise = mixer.clipAction(clips.get('Spawn_Ground_Skeletons')!);
    rise.setLoop(THREE.LoopOnce, 1);
    rise.clampWhenFinished = true;
    rise.timeScale = 1.6;
    rise.play();
    walk.time = Math.random() * walkClip.duration;

    const p = this.game.enemyPos(e);
    root.position.set(p.x, 0, p.z);
    const heading = this.game.polyline.heading(e.s + 0.3);
    root.rotation.y = heading;

    this.views.set(e.id, { enemy: e, root, model, mixer, walk, mats, flash: 0, squash: 0, scale, dying: 0, heading, barShown: 0 });
  }

  hit(e: Enemy, strong: boolean): void {
    const v = this.views.get(e.id);
    if (!v) return;
    v.flash = 1;
    v.squash = strong ? 1 : 0.6;
    v.barShown = 3;
  }

  kill(e: Enemy, clips = this.assets.chars.get(e.type === 'minion' ? 'minion' : 'warrior')!.clips): void {
    const v = this.views.get(e.id);
    if (!v) return;
    this.views.delete(e.id);
    v.mixer.stopAllAction();
    const death = v.mixer.clipAction(clips.get(Math.random() < 0.5 ? 'Death_A' : 'Death_B')!);
    death.setLoop(THREE.LoopOnce, 1);
    death.clampWhenFinished = true;
    death.timeScale = 1.5;
    death.play();
    v.dying = 0.0001;
    v.flash = 1;
    for (const m of v.mats) {
      m.transparent = true;
    }
    this.dead.push(v);
  }

  /** Gegner hat die Burg erreicht: verschwindet ohne Todesanimation */
  remove(e: Enemy): void {
    const v = this.views.get(e.id);
    if (!v) return;
    this.views.delete(e.id);
    v.root.removeFromParent();
    for (const m of v.mats) m.dispose();
  }

  worldPos(e: Enemy): THREE.Vector3 | null {
    const v = this.views.get(e.id);
    return v ? v.root.position.clone() : null;
  }

  update(dt: number): void {
    const camQuat = this.camera.quaternion;
    let bars = 0;
    for (const v of this.views.values()) {
      const e = v.enemy;
      if (e.rise <= 0 && !v.walk.isRunning()) {
        v.mixer.stopAllAction();
        v.walk.play();
      }
      v.mixer.update(dt);
      const p = this.game.enemyPos(e);
      v.root.position.set(p.x, 0, p.z);
      const want = this.game.polyline.heading(e.s + 0.2);
      const diff = Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading));
      v.heading += diff * Math.min(1, dt * 8);
      v.root.rotation.y = v.heading;

      v.flash = Math.max(0, v.flash - dt * 7);
      v.squash = Math.max(0, v.squash - dt * 5);
      const sq = Math.sin(v.squash * Math.PI) * 0.18 * v.squash;
      v.model.scale.set(v.scale * (1 + sq), v.scale * (1 - sq), v.scale * (1 + sq));
      for (const m of v.mats) m.emissive.setRGB(v.flash * 1.4, v.flash * 1.2, v.flash * 1.1);

      // Lebensbalken nur bei Verletzten
      v.barShown = Math.max(0, v.barShown - dt);
      const frac = e.hp / e.maxHp;
      if ((frac < 1 || e.type === 'boss') && bars < MAX_BARS) {
        const width = e.type === 'boss' ? 1.6 : 0.8;
        const y = v.scale * (e.type === 'boss' ? 2.9 : 3.0) + 0.2;
        this.tmp.position.set(p.x, y, p.z);
        this.tmp.quaternion.copy(camQuat);
        this.tmp.scale.set(width, 0.13, 1);
        this.tmp.updateMatrix();
        // Balken mittig ausrichten
        this.tmp.translateX(-width / 2);
        this.tmp.updateMatrix();
        this.barBg.setMatrixAt(bars, this.tmp.matrix);
        this.tmp.scale.set(width * Math.max(0, frac), 0.13, 1);
        this.tmp.updateMatrix();
        this.barFg.setMatrixAt(bars, this.tmp.matrix);
        this.color.setHSL(0.33 * frac, 0.85, 0.5);
        this.barFg.setColorAt(bars, this.color);
        bars++;
      }
    }
    this.barBg.count = this.barFg.count = bars;
    this.barBg.instanceMatrix.needsUpdate = true;
    this.barFg.instanceMatrix.needsUpdate = true;
    if (this.barFg.instanceColor) this.barFg.instanceColor.needsUpdate = true;

    for (const v of this.dead) {
      v.dying += dt;
      v.mixer.update(dt);
      v.flash = Math.max(0, v.flash - dt * 5);
      const fade = Math.max(0, (v.dying - 1.1) / 0.6);
      for (const m of v.mats) {
        m.emissive.setRGB(v.flash, v.flash * 0.9, v.flash * 0.8);
        m.opacity = 1 - fade;
      }
      v.root.position.y = -fade * 0.5;
    }
    this.dead = this.dead.filter((v) => {
      if (v.dying < 1.7) return true;
      v.root.removeFromParent();
      for (const m of v.mats) m.dispose();
      return false;
    });
  }
}

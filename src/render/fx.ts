// Geschosse und Partikel: Pfeile, Steine, Knochensplitter, Staub, Druckwellen.
import * as THREE from 'three';
import type { Projectile } from '../sim/game';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Assets } from './assets';

interface ProjView {
  proj: Projectile;
  obj: THREE.Object3D;
  from: THREE.Vector3;
  arc: number;
  spin: THREE.Vector3;
}

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  gravity: number;
  bounce: boolean;
  color: THREE.Color;
}

class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private items: Particle[] = [];
  private tmp = new THREE.Object3D();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, private max: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
  }

  add(p: Omit<Particle, 'rot' | 'maxLife'>): void {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ ...p, rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), maxLife: p.life });
  }

  update(dt: number): void {
    let n = 0;
    const keep: Particle[] = [];
    for (const p of this.items) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.bounce && p.pos.y < 0.05) {
        p.pos.y = 0.05;
        p.vel.y *= -0.35;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
        p.spin.multiplyScalar(0.6);
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      const u = 1 - p.life / p.maxLife;
      const s = p.size * (1 + p.grow * u) * Math.min(1, (p.life / p.maxLife) * 3);
      this.tmp.position.copy(p.pos);
      this.tmp.rotation.copy(p.rot);
      this.tmp.scale.setScalar(Math.max(0.0001, s));
      this.tmp.updateMatrix();
      this.mesh.setMatrixAt(n, this.tmp.matrix);
      this.mesh.setColorAt(n, p.color);
      n++;
      keep.push(p);
    }
    this.items = keep;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

interface Ring {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  t: number;
  dur: number;
  size: number;
}

const BONE = new THREE.Color(0xf2ead8);
const BONE_DARK = new THREE.Color(0xc9bfa6);
const DUST = new THREE.Color(0xf3ead6);
const DIRT = new THREE.Color(0xb59a6a);
const SPARK = new THREE.Color(0xffd36b);
const SOUL = new THREE.Color(0x9fe8ff);

export class Fx {
  readonly group = new THREE.Group();
  private projs = new Map<number, ProjView>();
  private bones: ParticlePool;
  private dust: ParticlePool;
  private sparks: ParticlePool;
  private rings: Ring[] = [];
  private arrowGeo: THREE.BufferGeometry;
  private arrowMat: THREE.MeshStandardMaterial;

  constructor(private assets: Assets) {
    this.bones = new ParticlePool(
      new THREE.BoxGeometry(0.16, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      500,
    );
    this.bones.mesh.castShadow = true;
    this.dust = new ParticlePool(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshStandardMaterial({ roughness: 1, emissive: 0x403a30 }),
      300,
    );
    this.sparks = new ParticlePool(
      new THREE.OctahedronGeometry(0.08, 0),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      300,
    );
    this.group.add(this.bones.mesh, this.dust.mesh, this.sparks.mesh);

    // Pfeil: Schaft, Spitze, Federn
    const shaft = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5);
    shaft.rotateX(Math.PI / 2);
    const tip = new THREE.ConeGeometry(0.06, 0.16, 5);
    tip.rotateX(Math.PI / 2);
    tip.translate(0, 0, 0.42);
    const fletch = new THREE.BoxGeometry(0.14, 0.01, 0.16);
    fletch.translate(0, 0, -0.3);
    this.arrowGeo = mergeGeometries([shaft, tip, fletch])!;
    this.arrowMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7, emissive: 0x332211 });
  }

  shoot(proj: Projectile, from: THREE.Vector3): void {
    let obj: THREE.Object3D;
    if (proj.kind === 'archer') {
      obj = new THREE.Mesh(this.arrowGeo, this.arrowMat);
      obj.castShadow = true;
    } else {
      obj = this.assets.model('projectile_catapult');
      obj.scale.setScalar(1.5);
      this.puff(from, 4, 0.5);
    }
    obj.position.copy(from);
    this.group.add(obj);
    const dist = Math.hypot(proj.to.x - proj.from.x, proj.to.z - proj.from.z);
    this.projs.set(proj.id, {
      proj,
      obj,
      from: from.clone(),
      arc: proj.kind === 'archer' ? 0.6 + dist * 0.08 : 3.5 + dist * 0.25,
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0),
    });
  }

  removeProjectile(id: number): void {
    const v = this.projs.get(id);
    if (!v) return;
    v.obj.removeFromParent();
    this.projs.delete(id);
  }

  /** Knochen fliegen, Seele steigt auf */
  boneBurst(at: THREE.Vector3, big: boolean): void {
    const n = big ? 34 : 16;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * (big ? 4.5 : 3);
      this.bones.add({
        pos: at.clone().add(new THREE.Vector3(0, 0.5 + Math.random() * 0.6, 0)),
        vel: new THREE.Vector3(Math.cos(a) * sp, 2.5 + Math.random() * 3.5, Math.sin(a) * sp),
        spin: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
        life: 1.6 + Math.random() * 0.8,
        size: (big ? 1.4 : 1) * (0.7 + Math.random() * 0.8),
        grow: 0,
        gravity: 14,
        bounce: true,
        color: Math.random() < 0.7 ? BONE : BONE_DARK,
      });
    }
    for (let i = 0; i < (big ? 14 : 6); i++) {
      this.sparks.add({
        pos: at.clone().add(new THREE.Vector3(rand(-0.3, 0.3), 0.6 + Math.random() * 0.5, rand(-0.3, 0.3))),
        vel: new THREE.Vector3(rand(-0.4, 0.4), 1.6 + Math.random() * 1.4, rand(-0.4, 0.4)),
        spin: new THREE.Vector3(2, 3, 1),
        life: 0.9 + Math.random() * 0.5,
        size: 1 + Math.random(),
        grow: -0.5,
        gravity: -0.6,
        bounce: false,
        color: SOUL,
      });
    }
    this.puff(at, big ? 10 : 5, big ? 1.2 : 0.7);
  }

  hitSpark(at: THREE.Vector3): void {
    for (let i = 0; i < 7; i++) {
      this.sparks.add({
        pos: at.clone().add(new THREE.Vector3(0, 0.7, 0)),
        vel: new THREE.Vector3(rand(-3, 3), rand(0.5, 3.5), rand(-3, 3)),
        spin: new THREE.Vector3(5, 5, 5),
        life: 0.25 + Math.random() * 0.2,
        size: 0.8 + Math.random() * 0.6,
        grow: -0.6,
        gravity: 9,
        bounce: false,
        color: SPARK,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.bones.add({
        pos: at.clone().add(new THREE.Vector3(0, 0.8, 0)),
        vel: new THREE.Vector3(rand(-2, 2), rand(1.5, 3.5), rand(-2, 2)),
        spin: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
        life: 1,
        size: 0.5,
        grow: 0,
        gravity: 14,
        bounce: true,
        color: BONE,
      });
    }
  }

  /** Einschlag eines Katapultsteins */
  impact(at: THREE.Vector3, radius: number): void {
    this.ring(at, radius * 1.1, 0.45, 0xfff1d0);
    this.puff(at, 14, 1.4);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this.bones.add({
        pos: at.clone().add(new THREE.Vector3(0, 0.2, 0)),
        vel: new THREE.Vector3(Math.cos(a) * 3, 3 + Math.random() * 3, Math.sin(a) * 3),
        spin: new THREE.Vector3(rand(-10, 10), rand(-10, 10), rand(-10, 10)),
        life: 1.2,
        size: 0.8,
        grow: 0,
        gravity: 14,
        bounce: true,
        color: DIRT,
      });
    }
  }

  puff(at: THREE.Vector3, n: number, spread: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = spread * (0.6 + Math.random() * 0.8);
      this.dust.add({
        pos: at.clone().add(new THREE.Vector3(Math.cos(a) * 0.2, 0.15, Math.sin(a) * 0.2)),
        vel: new THREE.Vector3(Math.cos(a) * sp * 2, 0.6 + Math.random() * 1.2, Math.sin(a) * sp * 2),
        spin: new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2)),
        life: 0.45 + Math.random() * 0.35,
        size: 0.35 + Math.random() * 0.4,
        grow: 1.2,
        gravity: -0.5,
        bounce: false,
        color: DUST,
      });
    }
  }

  ring(at: THREE.Vector3, size: number, dur: number, color: number): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.1, at.z);
    this.group.add(mesh);
    this.rings.push({ mesh, t: 0, dur, size });
  }

  /** Staubring beim Bauen und Anlegen */
  landing(at: THREE.Vector3): void {
    this.ring(at, 1.8, 0.4, 0xffffff);
    this.puff(at, 10, 0.9);
  }

  update(dt: number): void {
    for (const [id, v] of this.projs) {
      // v.proj ist dasselbe Objekt, das die Simulation fortschreibt
      const p = v.proj;
      const u = Math.min(1, p.t / p.flight);
      const to = new THREE.Vector3(p.to.x, p.kind === 'archer' ? 0.7 : 0.1, p.to.z);
      const pos = v.from.clone().lerp(to, u);
      pos.y += Math.sin(u * Math.PI) * v.arc;
      if (p.kind === 'archer') {
        // Pfeil schaut in Flugrichtung
        const u2 = Math.min(1, u + 0.05);
        const next = v.from.clone().lerp(to, u2);
        next.y += Math.sin(u2 * Math.PI) * v.arc;
        if (next.distanceToSquared(pos) > 1e-6) v.obj.lookAt(next);
        v.obj.position.copy(pos);
        if (u >= 1) this.removeProjectile(id);
      } else {
        v.obj.position.copy(pos);
        v.obj.rotation.x += v.spin.x * dt;
        v.obj.rotation.y += v.spin.y * dt;
        if (u >= 1) this.removeProjectile(id);
      }
    }
    this.bones.update(dt);
    this.dust.update(dt);
    this.sparks.update(dt);
    for (const r of this.rings) {
      r.t += dt;
      const u = Math.min(1, r.t / r.dur);
      const s = r.size * (0.3 + 0.7 * (1 - Math.pow(1 - u, 3)));
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = 0.9 * (1 - u);
    }
    this.rings = this.rings.filter((r) => {
      if (r.t < r.dur) return true;
      r.mesh.removeFromParent();
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      return false;
    });
  }
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

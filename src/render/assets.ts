// Lädt die KayKit-Modelle einmal und liefert Kopien.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export interface CharacterAsset {
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
}

export class Assets {
  private hex = new Map<string, THREE.Object3D>();
  chars = new Map<string, CharacterAsset>();

  async load(onProgress: (p: number) => void): Promise<void> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const files = ['hex.glb', 'Skeleton_Minion.glb', 'Skeleton_Warrior.glb'];
    const progress = files.map(() => 0);
    const report = () => onProgress(progress.reduce((a, b) => a + b, 0) / files.length);
    const results = await Promise.all(
      files.map(
        (f, i) =>
          new Promise<GLTF>((resolve, reject) =>
            loader.load(
              `${import.meta.env.BASE_URL}assets/${f}`,
              (g) => {
                progress[i] = 1;
                report();
                resolve(g);
              },
              (e) => {
                if (e.total) progress[i] = e.loaded / e.total;
                report();
              },
              reject,
            ),
          ),
      ),
    );
    const [hex, minion, warrior] = results;
    // Knoten tragen durch die Kompression eigene Verschiebung und Skalierung, daher in eine Gruppe hüllen
    for (const child of [...hex.scene.children]) {
      prepare(child);
      const holder = new THREE.Group();
      holder.name = child.name;
      holder.add(child);
      this.hex.set(child.name, holder);
    }
    for (const [name, g] of [
      ['minion', minion],
      ['warrior', warrior],
    ] as const) {
      prepare(g.scene);
      this.chars.set(name, { scene: g.scene, clips: new Map(g.animations.map((a) => [a.name, a])) });
    }
  }

  /** Kopie eines Hex-Pack-Modells (Geometrie und Material werden geteilt) */
  model(name: string): THREE.Object3D {
    const src = this.hex.get(name);
    if (!src) throw new Error(`Modell fehlt: ${name}`);
    return src.clone();
  }

  character(name: 'minion' | 'warrior'): { root: THREE.Object3D; clips: Map<string, THREE.AnimationClip> } {
    const a = this.chars.get(name)!;
    return { root: cloneSkinned(a.scene), clips: a.clips };
  }
}

function prepare(o: THREE.Object3D): void {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.map) mat.map.anisotropy = 4;
    }
  });
}

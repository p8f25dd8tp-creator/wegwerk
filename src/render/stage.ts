// Renderer, Licht, Himmel, Meer und Kamera.
import * as THREE from 'three';
import { type Hex, hexToWorld } from '../sim/hex';

const MASK_SIZE = 256;
const MASK_WORLD = 96;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly target = new THREE.Vector3(3, 0, 0);
  distance = 24;
  minDistance = 11;
  maxDistance = 46;
  private pitch = THREE.MathUtils.degToRad(49);
  private shake = 0;
  private shakeTime = 0;
  private water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private maskCanvas: HTMLCanvasElement;
  private maskTex: THREE.CanvasTexture;
  private clouds: THREE.Object3D[] = [];

  constructor(canvasHost: HTMLElement) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    canvasHost.appendChild(r.domElement);
    this.renderer = r;

    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 300);

    const sky = new THREE.Color(0x9fd6e8);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(0x9fd6e8, 55, 120);

    const hemi = new THREE.HemisphereLight(0xeaf6ff, 0xa89a70, 1.6);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.fitShadow(new THREE.Vector3(3, 0, 0), 14);

    // Maske der Insel für Flachwasser und Gischt
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = this.maskCanvas.height = MASK_SIZE;
    this.maskTex = new THREE.CanvasTexture(this.maskCanvas);
    this.maskTex.colorSpace = THREE.NoColorSpace;
    this.maskTex.flipY = false;
    this.water = this.makeWater();
    this.scene.add(this.water);

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    // Im Hochformat weiter weg, damit die Insel in die Breite passt
    this.camera.fov = this.camera.aspect < 0.8 ? 46 : 36;
    this.camera.updateProjectionMatrix();
  }

  addClouds(make: (name: string) => THREE.Object3D): void {
    for (let i = 0; i < 7; i++) {
      const c = make(i % 2 ? 'cloud_big' : 'cloud_small');
      const s = 1.4 + Math.random() * 1.4;
      c.scale.setScalar(s);
      // Wolken nur am Rand und hinten, damit sie nie die Insel verdecken
      const a = Math.PI * (1.1 + Math.random() * 0.8);
      const d = 22 + Math.random() * 18;
      c.position.set(Math.cos(a) * d, 5 + Math.random() * 3, Math.sin(a) * d * 0.8 - 6);
      c.rotation.y = Math.random() * Math.PI * 2;
      c.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.isMesh) {
          m.receiveShadow = false;
          m.castShadow = true;
        }
      });
      c.userData.speed = 0.25 + Math.random() * 0.35;
      this.clouds.push(c);
      this.scene.add(c);
    }
  }

  /** Schattenkamera an die Inselgröße anpassen */
  fitShadow(center: THREE.Vector3, radius: number): void {
    const s = this.sun;
    s.target.position.copy(center);
    s.position.copy(center).add(new THREE.Vector3(-10, 22, 12));
    const cam = s.shadow.camera;
    cam.left = cam.bottom = -radius;
    cam.right = cam.top = radius;
    cam.near = 1;
    cam.far = 70;
    cam.updateProjectionMatrix();
  }

  updateIslandMask(cells: Iterable<Hex>): void {
    const ctx = this.maskCanvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
    ctx.globalCompositeOperation = 'lighter';
    const k = MASK_SIZE / MASK_WORLD;
    for (const h of cells) {
      const p = hexToWorld(h);
      const x = (p.x + MASK_WORLD / 2) * k;
      const y = (p.z + MASK_WORLD / 2) * k;
      const rad = 3.0 * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.32)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    this.maskTex.needsUpdate = true;
  }

  private makeWater(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMask: { value: this.maskTex },
        uMaskWorld: { value: MASK_WORLD },
        uDeep: { value: new THREE.Color(0x2f8fd6) },
        uShallow: { value: new THREE.Color(0x5fd6e6) },
        uFoam: { value: new THREE.Color(0xf4fffb) },
        uFog: { value: new THREE.Color(0x9fd6e8) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform sampler2D uMask;
        uniform float uMaskWorld;
        uniform vec3 uDeep, uShallow, uFoam, uFog;
        varying vec3 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        void main() {
          vec2 uv = vWorld.xz / uMaskWorld + 0.5;
          float m = texture2D(uMask, uv).r;
          float n = noise(vWorld.xz * 0.55 + vec2(uTime * 0.25, uTime * 0.18));
          float n2 = noise(vWorld.xz * 1.7 - vec2(uTime * 0.4, -uTime * 0.3));
          vec3 col = mix(uDeep, uShallow, smoothstep(0.05, 0.75, m + (n - 0.5) * 0.12));
          // Gischt als wandernde Linien um die Insel
          float band = m + (n2 - 0.5) * 0.08;
          float waves = sin(band * 38.0 - uTime * 2.2) * 0.5 + 0.5;
          float foam = smoothstep(0.78, 0.95, band) * 0.85 + smoothstep(0.45, 0.7, band) * smoothstep(0.86, 0.98, waves) * 0.45;
          // Glitzern
          float sparkle = step(0.992, noise(vWorld.xz * 5.0 + uTime * 0.5)) * (1.0 - m) * 0.35;
          col = mix(col, uFoam, clamp(foam + sparkle, 0.0, 1.0));
          float dist = length(vWorld.xz - cameraPosition.xz);
          col = mix(col, uFog, smoothstep(45.0, 110.0, dist));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.32;
    return mesh;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  update(dt: number, time: number): void {
    this.water.material.uniforms.uTime.value = time;
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 50) c.position.x = -50;
    }
    this.distance = THREE.MathUtils.clamp(this.distance, this.minDistance, this.maxDistance);
    const off = new THREE.Vector3(0, Math.sin(this.pitch), Math.cos(this.pitch)).multiplyScalar(this.distance);
    this.camera.position.copy(this.target).add(off);
    this.camera.lookAt(this.target);
    if (this.shake > 0) {
      this.shakeTime += dt * 38;
      const s = this.shake * this.shake * 0.35;
      this.camera.position.x += Math.sin(this.shakeTime * 1.1) * s;
      this.camera.position.y += Math.sin(this.shakeTime * 1.7 + 1) * s * 0.6;
      this.camera.rotation.z += Math.sin(this.shakeTime * 0.9 + 2) * s * 0.03;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Bildschirmpunkt auf die Bodenebene y=0 projizieren */
  pickGround(clientX: number, clientY: number, y = 0): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  }

  toScreen(p: THREE.Vector3): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }
}

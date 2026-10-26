// Kleine Vorschaubilder echter 3D-Modelle für Karten und Baumenü.
import * as THREE from 'three';

export class Thumbs {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  private out = document.createElement('canvas');

  constructor(private renderer: THREE.WebGLRenderer) {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a50, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(-3, 6, 4);
    this.scene.add(sun);
  }

  /** Rendert obj und liefert eine Data-URL (transparenter Hintergrund) */
  render(obj: THREE.Object3D, size = 192, pitchDeg = 50): string {
    const r = this.renderer;
    this.scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const pitch = THREE.MathUtils.degToRad(pitchDeg);
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.98;
    this.camera.position.copy(center).add(new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(dist));
    this.camera.lookAt(center);

    const pr = r.getPixelRatio();
    const px = Math.round(size / pr);
    const prevClear = r.getClearAlpha();
    const prevAuto = r.autoClear;
    r.setClearColor(0x000000, 0);
    r.setScissorTest(true);
    r.setViewport(0, 0, px, px);
    r.setScissor(0, 0, px, px);
    r.autoClear = true;
    r.render(this.scene, this.camera);

    const src = r.domElement;
    const real = Math.round(px * pr);
    this.out.width = this.out.height = real;
    const ctx = this.out.getContext('2d')!;
    ctx.clearRect(0, 0, real, real);
    ctx.drawImage(src, 0, src.height - real, real, real, 0, 0, real, real);
    const url = this.out.toDataURL('image/png');

    r.setScissorTest(false);
    r.setViewport(0, 0, src.width / pr, src.height / pr);
    r.setClearColor(0x000000, prevClear);
    r.autoClear = prevAuto;
    this.scene.remove(obj);
    return url;
  }
}

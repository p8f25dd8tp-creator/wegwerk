// Touch- und Maussteuerung: Ziehen verschiebt, Zwei-Finger-Pinch und Mausrad zoomen, kurzes Tippen wählt aus.

interface Handlers {
  pan(dx: number, dy: number): void;
  zoom(factor: number): void;
  tap(x: number, y: number): void;
  any(): void;
}

export class Input {
  private pointers = new Map<number, { x: number; y: number }>();
  private downAt = { x: 0, y: 0, t: 0 };
  private moved = 0;
  private pinchDist = 0;

  constructor(el: HTMLElement, private h: Handlers) {
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      h.zoom(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
    // iOS gibt Audio nur innerhalb von touchend/click frei
    for (const ev of ['touchend', 'click'] as const) document.addEventListener(ev, () => h.any(), { passive: true });
    // iOS: Doppeltipp-Zoom und Gesten der Seite unterbinden
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  private down(e: PointerEvent): void {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.h.any();
    if (this.pointers.size === 1) {
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.moved = 0;
    } else if (this.pointers.size === 2) {
      this.pinchDist = this.spread();
      this.moved = 999;
    }
  }

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.moved > 8) this.h.pan(dx, dy);
    } else if (this.pointers.size === 2) {
      const d = this.spread();
      if (this.pinchDist > 0 && d > 0) this.h.zoom(this.pinchDist / d);
      this.pinchDist = d;
      // Beide Finger gemeinsam verschieben
      this.h.pan(dx / 2, dy / 2);
    }
  }

  private up(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0 && this.moved <= 8 && performance.now() - this.downAt.t < 500) {
      this.h.tap(e.clientX, e.clientY);
    }
    if (this.pointers.size < 2) this.pinchDist = 0;
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}

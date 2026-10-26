// Synthetische Klänge per WebAudio, keine Dateien nötig.
// iOS gibt Audio erst nach einer Berührung frei, daher unlock() beim ersten Tippen.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private lastPlay = new Map<string, number>();
  muted = localStorage.getItem('wegwerk-muted') === '1';

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    localStorage.setItem('wegwerk-muted', m ? '1' : '0');
    if (this.ctx) this.master.gain.value = m ? 0 : 0.55;
  }

  /** Gleiche Klänge nicht öfter als alle minGap Sekunden */
  private gate(name: string, minGap: number): boolean {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlay.get(name) ?? -1) < minGap) return false;
    this.lastPlay.set(name, now);
    return true;
  }

  private noiseBurst(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 1): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(t: number, dur: number, type: OscillatorType, f0: number, f1: number, vol: number, attack = 0.005): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  bow(): void {
    if (!this.gate('bow', 0.05)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 0.09, 'triangle', 420 + Math.random() * 80, 160, 0.12);
    this.noiseBurst(t, 0.12, 'bandpass', 3000, 900, 0.18, 2);
  }

  arrowHit(): void {
    if (!this.gate('arrowHit', 0.04)) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.05, 'highpass', 2500, 1800, 0.25);
    this.tone(t, 0.08, 'square', 300, 120, 0.05);
  }

  /** Knochen klappern auseinander */
  boneBreak(big = false): void {
    if (!this.gate('bone', 0.03)) return;
    const t = this.ctx!.currentTime;
    const n = big ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.025 + Math.random() * 0.03);
      this.noiseBurst(tt, 0.035, 'bandpass', 1800 + Math.random() * 2400, 1200, 0.32, 6);
      this.tone(tt, 0.04, 'square', 900 + Math.random() * 900, 500, 0.03);
    }
    this.tone(t, 0.18, 'sine', 180, 70, big ? 0.35 : 0.18);
  }

  catapult(): void {
    if (!this.gate('cat', 0.08)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 0.12, 'square', 140, 60, 0.08);
    this.noiseBurst(t + 0.02, 0.35, 'bandpass', 500, 1600, 0.2, 1.5);
  }

  boom(): void {
    if (!this.gate('boom', 0.06)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 0.5, 'sine', 110, 38, 0.7);
    this.noiseBurst(t, 0.45, 'lowpass', 1200, 120, 0.6);
  }

  coin(): void {
    if (!this.gate('coin', 0.06)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 0.08, 'square', 1318, 1318, 0.05);
    this.tone(t + 0.07, 0.22, 'square', 1975, 1975, 0.05);
  }

  place(): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.4;
    this.tone(t, 0.25, 'sine', 160, 60, 0.6);
    this.noiseBurst(t, 0.2, 'lowpass', 900, 200, 0.45);
  }

  build(): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.noiseBurst(t + i * 0.11, 0.06, 'bandpass', 1400, 700, 0.4, 3);
      this.tone(t + i * 0.11, 0.08, 'triangle', 520, 300, 0.15);
    }
    this.tone(t + 0.36, 0.3, 'sine', 140, 60, 0.4);
  }

  castleHit(): void {
    if (!this.gate('castle', 0.15)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 0.7, 'triangle', 98, 70, 0.45);
    this.tone(t, 0.7, 'sine', 147, 100, 0.25);
    this.noiseBurst(t, 0.3, 'lowpass', 800, 100, 0.5);
  }

  horn(): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    for (const [i, f] of [196, 262].entries()) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = this.ctx.createGain();
      const s = t + i * 0.32;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.16, s + 0.06);
      g.gain.setValueAtTime(0.16, s + (i ? 0.55 : 0.25));
      g.gain.exponentialRampToValueAtTime(0.001, s + (i ? 0.9 : 0.32));
      o.connect(lp).connect(g).connect(this.master);
      o.start(s);
      o.stop(s + 1);
    }
  }

  click(): void {
    if (!this.ctx || this.muted) return;
    this.tone(this.ctx.currentTime, 0.05, 'sine', 900, 600, 0.12);
  }

  fanfare(): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.09, 0.3, 'triangle', f, f, 0.14));
  }
}

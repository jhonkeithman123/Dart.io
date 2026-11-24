/** Zero-asset procedural sound effects via the browser Web Audio API (§2). */

type Wave = OscillatorType;

export class SoundFX {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, wave: Wave, gain: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hiss(dur: number, gain: number, filterFreq: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || !this.enabled) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  shoot(weapon: string): void {
    switch (weapon) {
      case 'bow': this.tone(320, 0.14, 'sawtooth', 0.18, 110); break;
      case 'bolt': this.tone(180, 0.16, 'square', 0.16, 70); break;
      case 'shuriken': this.tone(880, 0.1, 'triangle', 0.12, 520); break;
      case 'scythe': this.hiss(0.16, 0.12, 700); break;
      case 'laser': this.tone(1300, 0.12, 'sawtooth', 0.14, 220); break;
      default: this.tone(300, 0.12, 'triangle', 0.12, 120);
    }
  }

  hit(crit = false): void {
    this.tone(crit ? 920 : 520, 0.08, 'sine', crit ? 0.2 : 0.12, crit ? 1400 : 700);
  }

  bounce(): void {
    this.tone(820, 0.09, 'sine', 0.1, 1280);
  }

  xp(value: number): void {
    const base = 540 + Math.min(8, value) * 26;
    this.tone(base, 0.08, 'sine', 0.09);
    this.tone(base * 1.5, 0.1, 'sine', 0.07, undefined, 0.06);
  }

  levelUp(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone(n, 0.18, 'triangle', 0.14, undefined, i * 0.09));
  }

  death(): void {
    this.tone(260, 0.4, 'sawtooth', 0.18, 50);
    this.hiss(0.28, 0.1, 300);
  }

  heart(): void {
    this.tone(480, 0.16, 'sine', 0.12, 720);
  }

  orbPickup(size: string): void {
    const base = size === 'large' ? 720 : size === 'medium' ? 600 : 500;
    this.tone(base, 0.1, 'sine', 0.12, base * 1.35);
    this.tone(base * 1.5, 0.13, 'triangle', 0.07, undefined, 0.05);
  }

  zone(): void {
    this.tone(90, 0.25, 'sawtooth', 0.1, 60);
  }

  draft(): void {
    this.tone(660, 0.12, 'triangle', 0.12, 990);
  }

  gameOver(win: boolean): void {
    const notes = win ? [523, 659, 784, 1047, 1319] : [440, 392, 330, 262];
    notes.forEach((n, i) => this.tone(n, 0.3, 'triangle', 0.13, undefined, i * 0.16));
  }
}

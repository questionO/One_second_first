import { HZ } from './balance';
export class FixedClock {
  private accumulator = 0;
  reset() { this.accumulator = 0; }
  advance(deltaMs: number, update: () => void): boolean {
    if (!Number.isFinite(deltaMs) || deltaMs > 250 || deltaMs < 0) { this.reset(); return false; }
    this.accumulator += deltaMs;
    const dt = 1000 / HZ;
    while (this.accumulator + 1e-7 >= dt) { this.accumulator -= dt; update(); }
    return true;
  }
}

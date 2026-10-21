import type { InputFrame } from './game/types';
export class InputController {
  private keys = new Set<string>();
  private borrow = false;
  private repay = false;
  private touch: number | null = null;
  private vector = { x: 0, y: 0 };
  private enabled = false;
  private cleanup = new AbortController();
  constructor(private joystick: HTMLElement, private thumb: HTMLElement, borrowButton: HTMLButtonElement, repayButton: HTMLButtonElement, private pause: () => void, private enter: () => void, private rotated: () => boolean) {
    const signal = this.cleanup.signal;
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space' && e.target instanceof HTMLButtonElement) return;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code) && this.enabled) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape') this.pause();
      if (e.code === 'Enter' && !(e.target instanceof HTMLButtonElement)) this.enter();
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.borrow = true;
      if (e.code === 'KeyE') this.repay = true;
    }, { signal });
    window.addEventListener('keyup', e => this.keys.delete(e.code), { signal });
    borrowButton.addEventListener('pointerdown', e => { if (!borrowButton.disabled && this.enabled) { e.preventDefault(); this.borrow = true; } }, { signal });
    repayButton.addEventListener('pointerdown', e => { if (!repayButton.disabled && this.enabled) { e.preventDefault(); this.repay = true; } }, { signal });
    // Keyboard/screen-reader click activation has detail 0, pointer activation is already handled.
    borrowButton.addEventListener('click', e => { if (e.detail === 0 && this.enabled) this.borrow = true; }, { signal });
    repayButton.addEventListener('click', e => { if (e.detail === 0 && this.enabled) this.repay = true; }, { signal });
    joystick.addEventListener('pointerdown', e => {
      if (!this.enabled || this.touch !== null) return;
      e.preventDefault(); this.touch = e.pointerId; joystick.setPointerCapture(e.pointerId); this.move(e);
    }, { signal });
    joystick.addEventListener('pointermove', e => { if (e.pointerId === this.touch) this.move(e); }, { signal });
    const release = (e: PointerEvent) => { if (e.pointerId === this.touch) { this.touch = null; this.vector = {x:0,y:0}; this.thumb.style.transform = ''; } };
    joystick.addEventListener('pointerup', release, { signal });
    joystick.addEventListener('pointercancel', release, { signal });
    joystick.addEventListener('lostpointercapture', release, { signal });
    window.addEventListener('blur', () => this.clear(), { signal });
  }
  private move(e: PointerEvent) {
    const r = this.joystick.getBoundingClientRect(), radius = r.width * 0.33;
    const horizontal = (e.clientX - r.left - r.width / 2) / radius, vertical = (e.clientY - r.top - r.height / 2) / radius;
    // Undo the page's clockwise rotation so the stick follows the visible arena axes.
    let x = this.rotated() ? vertical : horizontal, y = this.rotated() ? -horizontal : vertical;
    const l = Math.hypot(x,y); if (l > 1) { x /= l; y /= l; }
    this.vector = l < 0.12 ? {x:0,y:0} : {x,y};
    this.thumb.style.transform = 'translate(' + (x * radius) + 'px,' + (y * radius) + 'px)';
  }
  setEnabled(value: boolean) { if (this.enabled !== value) this.clear(); this.enabled = value; }
  clear() { this.keys.clear(); this.borrow = false; this.repay = false; this.vector = {x:0,y:0}; this.touch = null; this.thumb.style.transform = ''; }
  read(): InputFrame {
    if (!this.enabled) return {x:0,y:0};
    const has = (...codes: string[]) => codes.some(c => this.keys.has(c)) ? 1 : 0;
    const x = has('KeyD','ArrowRight') - has('KeyA','ArrowLeft') + this.vector.x;
    const y = has('KeyS','ArrowDown') - has('KeyW','ArrowUp') + this.vector.y;
    const result = { x, y, borrow:this.borrow, repay:this.repay };
    this.borrow = false; this.repay = false; return result;
  }
  destroy() { this.cleanup.abort(); this.clear(); }
}

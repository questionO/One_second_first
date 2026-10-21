import type { Point } from './types';
// Relative swept motion also catches a player walking into a frozen bullet.
export function sweptCircle(a: Point, b: Point, c: Point, d: Point, radius: number): boolean {
  const x = a.x - c.x, y = a.y - c.y;
  const vx = (b.x - a.x) - (d.x - c.x), vy = (b.y - a.y) - (d.y - c.y);
  const length = vx * vx + vy * vy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(x * vx + y * vy) / length));
  return (x + vx * t) ** 2 + (y + vy * t) ** 2 <= radius ** 2;
}
export function sweptRect(a: Point, b: Point, x: number, y: number, width: number, height: number, radius: number): boolean {
  // Expanded slab with rounded corners: no false hit in the square outside a rounded corner.
  const rect = (l: number, t: number, r: number, bottom: number) => {
    let enter = 0, exit = 1;
    for (const [p, v, lo, hi] of [[a.x, b.x - a.x, l, r], [a.y, b.y - a.y, t, bottom]]) {
      if (Math.abs(v) < 1e-9) { if (p < lo || p > hi) return false; }
      else { const t1 = (lo - p) / v, t2 = (hi - p) / v; enter = Math.max(enter, Math.min(t1, t2)); exit = Math.min(exit, Math.max(t1, t2)); if (enter > exit) return false; }
    }
    return true;
  };
  if (rect(x - radius, y, x + width + radius, y + height) || rect(x, y - radius, x + width, y + height + radius)) return true;
  return [{x,y}, {x:x+width,y}, {x,y:y+height}, {x:x+width,y:y+height}].some(p => sweptCircle(a,b,p,p,radius));
}

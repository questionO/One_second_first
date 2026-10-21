import { RULES, difficulty } from './balance';
import type { Pattern, RunSnapshot } from './types';
export const PATTERNS: Pattern[] = [
  { id: 'cross-left', name: '左侧来信', kind: 'rows', variant: 0, safeRoute: '停留在预警标记的水平安全带中央' },
  { id: 'cross-right', name: '右侧来信', kind: 'rows', variant: 1, safeRoute: '停留在预警标记的水平安全带中央' },
  { id: 'fan-left', name: '散开的秒针', kind: 'fan', variant: 0, safeRoute: '沿水平安全带移动，避开上、下两侧扇面' },
  { id: 'fan-right', name: '逆向秒针', kind: 'fan', variant: 1, safeRoute: '沿水平安全带移动，避开上、下两侧扇面' },
  { id: 'laser-top', name: '刻度切割', kind: 'laser', variant: 0, safeRoute: '预警后在安全带内向上错开横向激光，再沿通道横移' },
  { id: 'laser-bottom', name: '错位时针', kind: 'laser', variant: 1, safeRoute: '预警后在安全带内向上错开横向激光，再沿通道横移' },
  { id: 'cross-laser', name: '双重催款', kind: 'combo', variant: 0, safeRoute: '先拿通道内金币，预警后向上错开横线，留在弹列间隙内' },
  { id: 'fan-laser', name: '时间夹缝', kind: 'combo', variant: 1, safeRoute: '预警后向上错开横线，保持在扇面之间的通道内' },
  { id: 'double-cross', name: '最后通牒', kind: 'combo', variant: 2, safeRoute: '保持在安全带中央，穿行时留意双向弹列' },
];
export function random(state: RunSnapshot): number {
  let x = state.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0; return state.rng / 4294967296;
}
export function spawnWave(s: RunSnapshot, forced?: string): void {
  const d = difficulty(s.worldTick);
  const pool = PATTERNS.slice(0, d.stage === 0 ? 2 : d.stage === 1 ? 4 : 9);
  let p = forced ? PATTERNS.find(p => p.id === forced)! : pool[Math.floor(random(s) * pool.length)];
  if (!p) throw new Error('Unknown pattern: ' + forced);
  if (!forced && p.id === s.patternId) p = pool[(pool.indexOf(p) + 1) % pool.length];
  const mirror = random(s) < 0.5;
  // Anchor to the current row before any telegraph appears. No tracking after this point.
  s.safeY = Math.max(140, Math.min(336, s.player.y));
  const gap = 51, f = RULES.field;
  s.bullets = []; s.lasers = []; s.coins = [];
  s.wave++; s.patternId = p.id; s.waveLeft = d.duration;
  const addRows = (right: boolean) => {
    for (let y = f.top + 8; y < f.bottom; y += 30) {
      if (Math.abs(y - s.safeY) < gap) continue;
      for (let column = 0; column < 2; column++) {
        s.bullets.push({ id: s.nextId++, x: right ? f.right + 30 + column * 60 : f.left - 30 - column * 60, y,
          vx: (right ? -1 : 1) * d.speed, vy: 0, radius: RULES.bulletRadius });
      }
    }
  };
  const addFan = (right: boolean) => {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const y = s.safeY + side * (gap + 10);
        s.bullets.push({ id: s.nextId++, x: right ? f.right + 25 : f.left - 25, y,
          vx: (right ? -1 : 1) * d.speed * (0.85 + k * 0.035), vy: side * (k * 12), radius: RULES.bulletRadius });
      }
    }
  };
  const addLasers = () => {
    // A telegraphed cross-beam requires a deliberate sidestep; camping is not a survival strategy.
    s.lasers.push({ id: s.nextId++, x: f.left, y: s.safeY-6, width: f.right-f.left, height: 12,
      warn: RULES.laserWarn, active: RULES.laserActive });
    for (const x of [285, 645]) {
      for (const [y, height] of [[f.top, s.safeY - gap - f.top], [s.safeY + gap, f.bottom - s.safeY - gap]]) {
        if (height > 0) s.lasers.push({ id: s.nextId++, x: x + (p.variant === 1 ? 85 : 0), y,
          width: 12, height, warn: RULES.laserWarn, active: RULES.laserActive });
      }
    }
  };
  const right = (p.variant % 2 === 1) !== mirror;
  if (p.kind === 'rows') addRows(right);
  if (p.kind === 'fan') addFan(right);
  if (p.kind === 'laser') addLasers();
  if (p.kind === 'combo') {
    if (p.variant === 1) addFan(right); else addRows(right);
    if (p.variant === 2) addRows(!right); else addLasers();
  }
  s.bullets = s.bullets.slice(0, RULES.maxHazards - s.lasers.length);
  // Safe coins lead horizontally; risky coins tempt a departure from the safe band.
  const near = Math.max(130, Math.min(760, s.player.x + (mirror ? -100 : 70)));
  for (let i = 0; i < 3; i++) s.coins.push({ id: s.nextId++, x: Math.min(850, near + i * 42), y: s.safeY, risk: false });
  const riskyY = s.safeY < 238 ? Math.min(f.bottom - 20, s.safeY + 84) : Math.max(f.top + 20, s.safeY - 84);
  for (let i = 0; i < 3; i++) s.coins.push({ id: s.nextId++, x: 350 + i * 72 + (mirror ? 100 : 0), y: riskyY, risk: true });
  s.events.push({ type: 'wave' });
}

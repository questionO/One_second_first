import { HZ, RULES, RULES_VERSION } from './balance';
import { sweptCircle, sweptRect } from './collision';
import { spawnWave } from './patterns';
import type { InputFrame, Point, RunSnapshot, RunSummary } from './types';
export const EMPTY_INPUT: InputFrame = { x: 0, y: 0 };
export function createRun(seed: number, rulesVersion = RULES_VERSION): RunSnapshot {
  if (rulesVersion !== RULES_VERSION) throw new Error('Unsupported rules version');
  const s: RunSnapshot = {
    seed: seed >>> 0, rng: (seed >>> 0) || 0x6d2b79f5, rulesVersion, tick: 0, worldTick: 0,
    mode: 'normal', debt: 0, dueAt: null, borrowLeft: 0, score: 0, pending: 0,
    player: { x: 480, y: 238 }, alive: true, paused: false, bullets: [], lasers: [], mines: [], coins: [],
    nextId: 1, wave: 0, waveLeft: 0, patternId: '', safeY: 238,
    borrowCount: 0, settlements: 0, events: [], deathReason: '', deathAt: null, summary: null,
    tutorial: false, wavesEnabled: true,
  };
  spawnWave(s); return s;
}
export function borrowBlockReason(s: RunSnapshot): string {
  if (!s.alive || s.paused) return '当前不可操作';
  if (s.mode === 'borrow') return '冻结中';
  if (s.mode === 'repay') return '正在还债';
  if (s.debt + RULES.borrowTicks > RULES.maxDebt) return '已欠满 3 秒';
  if (s.dueAt !== null && s.dueAt - s.tick < s.debt + 2 * RULES.borrowTicks) return '即将到期';
  return '';
}
export function canRepay(s: RunSnapshot): boolean { return s.alive && !s.paused && s.mode === 'normal' && s.debt > 0; }
export function latestRepayIn(s: RunSnapshot): number { return s.dueAt === null ? 0 : Math.max(0, s.dueAt - s.tick - s.debt); }
export function summary(s: RunSnapshot): RunSummary {
  return { seed: s.seed, rulesVersion: s.rulesVersion, score: s.score, ticks: s.tick, borrowCount: s.borrowCount,
    settlements: s.settlements, lostPending: s.pending * 2, deathReason: s.deathReason, wave: s.wave };
}
function die(s: RunSnapshot, reason: string, at: Point): void {
  s.alive = false; s.deathReason = reason; s.deathAt = { ...at };
  s.summary = summary(s); s.pending = 0; s.events.push({ type: 'death' });
}
function startRepay(s: RunSnapshot, automatic: boolean) { s.mode = 'repay'; s.events.push({ type: 'repay', automatic }); }
export function step(s: RunSnapshot, input: InputFrame = EMPTY_INPUT): void {
  s.events = [];
  if (!s.alive || s.paused) return;
  if (s.mode === 'normal' && s.debt > 0 && s.dueAt !== null && s.dueAt - s.tick <= s.debt) startRepay(s, true);
  if (input.repay && canRepay(s)) startRepay(s, false);
  if (input.borrow && !borrowBlockReason(s)) {
    s.mode = 'borrow'; s.borrowLeft = RULES.borrowTicks;
    if (s.dueAt === null) s.dueAt = s.tick + RULES.deadlineTicks;
    s.borrowCount++; s.events.push({ type: 'borrow' });
  }
  const mode = s.mode, worldSteps = mode === 'borrow' ? 0 : mode === 'repay' ? 2 : 1;
  const divisions = Math.max(1, worldSteps);
  const x = Number.isFinite(input.x) ? input.x : 0, y = Number.isFinite(input.y) ? input.y : 0;
  const length = Math.hypot(x, y), scale = length > 1 ? 1 / length : 1;
  const dx = x * scale * RULES.playerSpeed / HZ / divisions;
  const dy = y * scale * RULES.playerSpeed / HZ / divisions;
  const picked = new Set<number>();
  const disarmed = new Set<number>();
  s.tick++;
  if (mode === 'borrow') { s.debt++; s.borrowLeft--; }
  if (mode === 'repay') s.debt = Math.max(0, s.debt - 1);
  for (let part = 0; part < divisions; part++) {
    const old = { ...s.player }, f = RULES.field, r = RULES.playerRadius;
    s.player.x = Math.max(f.left + r, Math.min(f.right - r, old.x + dx));
    s.player.y = Math.max(f.top + r, Math.min(f.bottom - r, old.y + dy));
    for (const bullet of s.bullets) {
      const previous = { x: bullet.x, y: bullet.y };
      if (worldSteps > 0) { bullet.x += bullet.vx / HZ; bullet.y += bullet.vy / HZ; }
      if (sweptCircle(old, s.player, previous, bullet, r + bullet.radius)) {
        die(s, mode === 'borrow' ? '撞上冻结的弹幕' : mode === 'repay' ? '被加速弹幕击中' : '被横穿弹幕击中', bullet); return;
      }
    }
    for (const laser of s.lasers) {
      if (laser.delay && laser.delay > 0) { if (worldSteps > 0) laser.delay--; continue; }
      // The final warning interval is harmless; the next interval starts the beam.
      const wasActive = laser.warn <= 0 && laser.active > 0;
      if (worldSteps > 0) { if (laser.warn > 0) laser.warn--; else if (laser.active > 0) laser.active--; }
      if (wasActive && sweptRect(old, s.player, laser.x, laser.y, laser.width, laser.height, r)) {
        die(s, laser.gate ? '没能及时换到下一条安全带' : mode === 'borrow' ? '碰到了仍在发射的冻结激光' : '被激光切中', s.player); return;
      }
    }
    for (const mine of s.mines) {
      const wasActive = mine.warn <= 0 && mine.active > 0;
      if (mode === 'borrow' && mine.warn > 0 && sweptCircle(old, s.player, mine, mine, r + RULES.mineCoreRadius)) disarmed.add(mine.id);
      if (worldSteps > 0) { if (mine.warn > 0) mine.warn--; else if (mine.active > 0) mine.active--; }
      if (wasActive && sweptCircle(old, s.player, mine, mine, r + mine.radius)) {
        die(s, mode === 'borrow' ? '闯入了冻结中的爆炸区域' : '被定时爆雷波及', mine); return;
      }
    }
    for (const coin of s.coins) if (sweptCircle(old, s.player, coin, coin, r + 9)) picked.add(coin.id);
    if (worldSteps > 0) {
      s.worldTick++; s.waveLeft--;
      if (s.wavesEnabled && s.waveLeft <= 0) spawnWave(s);
    }
  }
  // Defer pickups and settlement until all collision substeps have passed.
  if (disarmed.size > 0) {
    const reward = disarmed.size * RULES.disarmValue;
    s.pending += reward; s.events.push({ type: 'disarm', value: reward });
  }
  if (picked.size > 0) {
    if (mode === 'borrow') s.pending += picked.size * RULES.coinValue; else s.score += picked.size * RULES.coinValue;
    s.coins = s.coins.filter(c => !picked.has(c.id)); s.events.push({ type: 'coin', value: picked.size });
  }
  s.bullets = s.bullets.filter(b => b.x > -180 && b.x < 1140 && b.y > -180 && b.y < 720);
  s.lasers = s.lasers.filter(l => l.warn > 0 || l.active > 0);
  s.mines = s.mines.filter(m => !disarmed.has(m.id) && (m.warn > 0 || m.active > 0));
  if (mode === 'borrow' && s.borrowLeft === 0) s.mode = 'normal';
  if (mode === 'repay' && s.debt === 0) {
    const earned = s.pending * 2;
    s.score += earned; s.pending = 0; s.mode = 'normal'; s.dueAt = null;
    if (earned > 0) s.settlements++;
    s.events.push({ type: 'settle', value: earned });
  }
}

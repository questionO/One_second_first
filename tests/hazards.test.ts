import { describe, expect, it } from 'vitest';
import { HZ, RULES } from '../src/game/balance';
import { PATTERNS, spawnWave } from '../src/game/patterns';
import { createRun, step } from '../src/game/simulation';
import type { RunSnapshot } from '../src/game/types';

function empty() {
  const s = createRun(42);
  s.wavesEnabled = false; s.bullets = []; s.lasers = []; s.mines = []; s.coins = [];
  return s;
}
function mine(s: RunSnapshot, warn: number = RULES.mineWarn) {
  return { id: 999, ...s.player, radius: RULES.mineRadius, warn, active: RULES.mineActive };
}

describe('冻结拆弹', () => {
  it('普通接触不能拆弹，冻结接触只奖励一次，清债后翻倍', () => {
    const s = empty(); s.mines = [mine(s)];
    step(s); expect(s.mines).toHaveLength(1); expect(s.pending).toBe(0);
    step(s, { x: 0, y: 0, borrow: true });
    expect(s.mines).toHaveLength(0); expect(s.pending).toBe(30); expect(s.score).toBe(0);
    expect(s.events).toContainEqual({ type: 'disarm', value: 30 });
    for (let i = 1; i < 60; i++) step(s);
    expect(s.pending).toBe(30);
    step(s, { x: 0, y: 0, repay: true });
    for (let i = 1; i < 60; i++) step(s);
    expect(s.score).toBe(60); expect(s.pending).toBe(0); expect(s.settlements).toBe(1);
    expect(s.tick - s.worldTick).toBe(s.debt);
  });
  it('扫掠触碰核心边缘可以拆弹，远处冻结不推进倒计时', () => {
    const s = empty(); s.mines = [{ ...mine(s), x: s.player.x + 22 }];
    step(s, { x: 0, y: 0, borrow: true });
    expect(s.mines[0].warn).toBe(RULES.mineWarn);
    step(s, { x: 1, y: 0 });
    expect(s.mines).toHaveLength(0); expect(s.pending).toBe(30);
  });
  it('冻结爆炸不能拆除，也不能免疫爆炸', () => {
    const s = empty(); s.mines = [mine(s, 0)];
    step(s, { x: 0, y: 0, borrow: true });
    expect(s.alive).toBe(false); expect(s.deathReason).toContain('冻结');
    expect(s.mines[0].active).toBe(RULES.mineActive); expect(s.pending).toBe(0);
  });
  it('预警最后一步无伤害，下一步才引爆；还债的第二子步也检查', () => {
    const s = empty(); s.mines = [mine(s, 1)];
    step(s); expect(s.alive).toBe(true); step(s); expect(s.alive).toBe(false);
    const fast = empty(); fast.mode = 'repay'; fast.debt = 2; fast.dueAt = 480; fast.mines = [mine(fast, 1)];
    fast.coins = [{ id: 998, ...fast.player, risk: false }];
    step(fast); expect(fast.alive).toBe(false); expect(fast.score).toBe(0);
  });
  it('死亡取消同一步的拆弹收益，爆炸结束后不再碰撞', () => {
    const s = empty(); s.mines = [mine(s), { ...mine(s, 0), id: 1000 }];
    step(s, { x: 0, y: 0, borrow: true });
    expect(s.alive).toBe(false); expect(s.summary?.lostPending).toBe(0);
    expect(s.events.some(e => e.type === 'disarm')).toBe(false);
    const expired = empty(); expired.mines = [{ ...mine(expired, 0), active: 0 }];
    step(expired); expect(expired.alive).toBe(true); expect(expired.mines).toHaveLength(0);
  });
  it('欠满时按借时不能绕过拆弹条件；暂停不推进机关', () => {
    const s = empty(); s.debt = 180; s.dueAt = 480; s.mines = [mine(s)];
    step(s, { x: 0, y: 0, borrow: true });
    expect(s.pending).toBe(0); expect(s.mines).toHaveLength(1);
    s.paused = true; const before = structuredClone(s);
    step(s); expect(s).toEqual(before);
  });
});

describe('换轨与可达路线', () => {
  it('延迟阶段完全无碰撞，冻结保持延迟，完整预警之后才生效', () => {
    const s = empty();
    s.lasers = [{ id: 1, x: 400, y: 200, width: 160, height: 76, delay: 1, warn: 1, active: 2, gate: true }];
    step(s, { x: 0, y: 0, borrow: true });
    for (let i = 1; i < 60; i++) step(s);
    expect(s.lasers[0].delay).toBe(1); expect(s.lasers[0].warn).toBe(1);
    step(s); expect(s.alive).toBe(true); expect(s.lasers[0].warn).toBe(1);
    step(s); expect(s.alive).toBe(true);
    step(s); expect(s.alive).toBe(false); expect(s.deathReason).toContain('换到');
  });
  it.each([188, 238, 288])('固定停在 y=%i 无法躲过两段封锁', y => {
    const s = empty(); s.player.y = y; spawnWave(s, 'shutters');
    const duration = s.waveLeft;
    for (let i = 0; i < duration && s.alive; i++) step(s);
    expect(s.alive).toBe(false);
  });
  for (const id of ['minefield', 'shutters']) {
    it.each([false, true])(`${id} 从边界和中央出发有可行路线，还债=%s`, accelerated => {
      for (const x of [44, 480, 916]) for (const y of [92, 188, 238, 288, 384]) {
        const s = empty(); s.worldTick = 120 * HZ; s.player = { x, y }; spawnWave(s, id);
        const end = s.worldTick + s.waveLeft, start = s.worldTick;
        if (accelerated) { s.mode = 'repay'; s.debt = 180; s.dueAt = 480; }
        const escapeY = id === 'minefield' ? (y <= 238 ? 92 : 384) : s.safeY;
        const escapeX = id === 'minefield' ? (s.mines[1].x < s.mines[0].x ? 916 : 44) : x;
        while (s.worldTick < end && s.alive) {
          const elapsed = s.worldTick - start;
          const secondPhase = elapsed >= RULES.gateWarn + RULES.gateActive;
          const target = id === 'shutters' && secondPhase ? 476 - s.safeY : escapeY;
          // Leave 0.2 seconds to react to each newly visible warning.
          const reacting = elapsed < (accelerated ? 24 : 12) || (id === 'shutters' && secondPhase && elapsed < 138 + (accelerated ? 24 : 12));
          const dx = escapeX - s.player.x, dy = target - s.player.y, distance = Math.hypot(dx, dy);
          const speed = Math.max(RULES.playerSpeed / HZ, distance);
          step(s, { x: reacting ? 0 : dx / speed, y: reacting ? 0 : dy / speed });
        }
        expect(s.alive, `${id}: ${x},${y}`).toBe(true); expect(s.worldTick).toBeGreaterThanOrEqual(end);
      }
    });
  }
});

describe('波次节奏与实体边界', () => {
  it('第二波必有拆弹，第三波必有换轨，后续至少隔波出现新机关', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = createRun(seed);
      for (let wave = 2; wave <= 30; wave++) {
        s.worldTick += s.waveLeft; spawnWave(s);
        if (wave === 2) expect(s.patternId).toBe('minefield');
        if (wave === 3) expect(s.patternId).toBe('shutters');
        if (wave % 2 === 0) expect(['minefield', 'shutters']).toContain(s.patternId);
        expect(s.bullets.length + s.lasers.length + s.mines.length).toBeLessThanOrEqual(RULES.maxHazards);
      }
    }
  });
  it('所有阶段的机关在换波前完成，爆雷在场内且不会追踪玩家', () => {
    for (const worldTick of [0, 6 * HZ, 24 * HZ, 60 * HZ]) for (const x of [44, 479, 480, 916]) {
      const s = empty(); s.worldTick = worldTick; s.player.x = x; spawnWave(s, 'minefield');
      for (const m of s.mines) {
        expect(m.x - m.radius).toBeGreaterThanOrEqual(RULES.field.left);
        expect(m.x + m.radius).toBeLessThanOrEqual(RULES.field.right);
        expect(m.warn + m.active).toBeLessThanOrEqual(s.waveLeft);
      }
      const positions = s.mines.map(m => [m.x, m.y]); step(s, { x: 1, y: 1 });
      expect(s.mines.map(m => [m.x, m.y])).toEqual(positions);
      spawnWave(s, 'shutters');
      expect(Math.max(...s.lasers.map(l => (l.delay ?? 0) + l.warn + l.active))).toBeLessThanOrEqual(s.waveLeft);
    }
  });
  it('相同种子可复现全部新旧编排，重开清空拆弹状态', () => {
    const a = empty(), b = empty();
    for (const p of PATTERNS) {
      spawnWave(a, p.id); spawnWave(b, p.id);
      step(a, { x: 0, y: 0, borrow: true }); step(b, { x: 0, y: 0, borrow: true });
      expect(a).toEqual(b);
    }
    expect(createRun(42).mines).toEqual([]); expect(createRun(42).pending).toBe(0);
  });
});

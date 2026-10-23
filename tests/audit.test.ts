import { describe, expect, it } from 'vitest';
import { HZ, RULES } from '../src/game/balance';
import { FixedClock } from '../src/game/clock';
import { createRun, step, summary } from '../src/game/simulation';
import { defaults, SAVE_KEY, SaveStore } from '../src/storage';

function empty() {
  const s = createRun(42); s.hp = 1; // Exercise lethal hazard boundaries at the final heart.
  s.wavesEnabled = false; s.bullets = []; s.lasers = []; s.coins = [];
  return s;
}

describe('审计：模拟边界', () => {
  it('临界期限追加借时后恰好按期清债', () => {
    const s = empty(); step(s, { x: 0, y: 0, borrow: true });
    while (s.tick < 300) step(s);
    step(s, { x: 0, y: 0, borrow: true });
    while (s.tick < 480) step(s);
    expect(s.borrowCount).toBe(2); expect(s.debt).toBe(0); expect(s.dueAt).toBeNull();
    expect(s.worldTick).toBe(480);
  });
  it('冻结不会推进预警中的激光', () => {
    const s = empty(); s.lasers = [{ id: 1, x: 450, y: 230, width: 100, height: 16, warn: 1, active: 36 }];
    step(s, { x: 0, y: 0, borrow: true });
    for (let i = 1; i < 60; i++) step(s);
    expect(s.alive).toBe(true); expect(s.lasers[0].warn).toBe(1);
    step(s); expect(s.alive).toBe(true);
    step(s); expect(s.alive).toBe(false);
  });
  it.each([35, 36])('激光激活后第 %i 步的结束边界', elapsed => {
    const s = empty(); s.lasers = [{ id: 1, x: 450, y: 230, width: 100, height: 16, warn: 0, active: 36 }];
    s.player.y = 100;
    for (let i = 0; i < elapsed; i++) step(s);
    s.player.y = 238; step(s);
    expect(s.alive).toBe(elapsed === 36);
  });
  it('激光完整预警 108 步后才开始伤害', () => {
    const s = empty();
    s.lasers = [{ id: 1, x: 450, y: 230, width: 100, height: 16, warn: RULES.laserWarn, active: RULES.laserActive }];
    for (let i = 0; i < RULES.laserWarn; i++) step(s);
    expect(s.alive).toBe(true);
    expect(s.lasers[0].warn).toBe(0);
    step(s);
    expect(s.alive).toBe(false);
  });
  it('2.0 补怪不清空弹体，加速第二子步仍可造成致命伤', () => {
    const s = empty(); s.wavesEnabled = true; s.waveLeft = 1; s.mode = 'repay'; s.debt = 2; s.dueAt = 480;
    s.bullets = [{ id: 999, x: 521, y: 238, vx: -900, vy: 0, radius: 6 }];
    step(s);
    expect(s.alive).toBe(false);
    expect(s.bullets[0].id).toBe(999);
    expect(s.enemies).toHaveLength(0);
  });
  it('2.0 补怪不再取消第二子步的拾取', () => {
    const s = empty(); s.wavesEnabled = true; s.waveLeft = 1; s.mode = 'repay'; s.debt = 2; s.dueAt = 480;
    s.player.x = 100;
    s.coins = [{ id: 999, x: 120, y: 238, risk: false }];
    step(s, { x: 1, y: 0 });
    expect(s.score).toBe(10);
  });
  it.each([NaN, Infinity, -Infinity])('异常方向 %s 不影响另一轴限速', value => {
    const s = empty(), before = { ...s.player };
    step(s, { x: 2, y: value });
    expect(s.player.x - before.x).toBeCloseTo(RULES.playerSpeed / HZ);
    expect(s.player.y).toBe(before.y);
  });
  it.each([0, 1, 59, 60, 61, 120, 179, 180, 299, 300, 419, 420, 479])('第 %i 步暂停不消耗期限和债务', tick => {
    const s = empty(); step(s, { x: 0, y: 0, borrow: true });
    while (s.tick < tick) step(s);
    s.paused = true;
    const before = { ...structuredClone(s), events: [] };
    for (let i = 0; i < 600; i++) step(s, { x: 1, y: 1, borrow: true, repay: true });
    expect(s).toEqual(before);
  });
  it.each([NaN, Infinity, -1, 250.01])('无效帧间隔 %s 清空积压', delta => {
    const clock = new FixedClock(); let ticks = 0;
    clock.advance(10, () => ticks++);
    expect(clock.advance(delta, () => ticks++)).toBe(false);
    clock.advance(10, () => ticks++);
    expect(ticks).toBe(0);
  });
  it('固定时钟在回调重置后不继续推进新局', () => {
    const clock = new FixedClock(); let ticks = 0;
    clock.advance(250, () => { ticks++; clock.reset(); });
    expect(ticks).toBe(1);
  });
});

describe('审计：存档边界', () => {
  it('不覆盖无法识别的新版本存档', () => {
    let text = JSON.stringify({ ...defaults(), version: 4 }); const original = text;
    const store = new SaveStore({ getItem: () => text, setItem: (_key, value) => { text = value; } });
    store.record(summary(createRun(1)));
    expect(text).toBe(original); expect(store.persistent).toBe(false);
    expect(store.data.recent).toHaveLength(1);
  });
  it('旧页面保存成绩时不撤销另一页修改的设置', () => {
    let text: string | null = null;
    const storage = { getItem: () => text, setItem: (_key: string, value: string) => { text = value; } };
    const a = new SaveStore(storage), b = new SaveStore(storage);
    a.data.settings.muted = true; a.persist(); b.record(summary(createRun(2)));
    expect(new SaveStore(storage).data.settings.muted).toBe(true);
  });
  it('读取临时失败时不会用默认数据覆盖原存档', () => {
    let writes = 0;
    const store = new SaveStore({ getItem: () => { throw Error('read denied'); }, setItem: () => { writes++; } });
    expect(writes).toBe(0);
    expect(store.persistent).toBe(false);
  });
  it('写入恢复后更新持久化状态', () => {
    let blocked = true, text: string | null = null;
    const store = new SaveStore({ getItem: () => text, setItem: (_key, value) => { if (blocked) throw Error('quota'); text = value; } });
    expect(store.persistent).toBe(false);
    blocked = false; store.persist();
    expect(store.persistent).toBe(true);
  });
  it('两个已打开页面依次记录和修改设置，不覆盖另一页的纪录', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const a = new SaveStore(storage), b = new SaveStore(storage);
    a.data.tutorialDone = true;
    a.record({ ...summary(createRun(1)), score: 100 });
    b.record({ ...summary(createRun(2)), score: 50 });
    a.data.settings.muted = true; a.persist();
    const loaded = new SaveStore(storage);
    expect(loaded.data.best?.score).toBe(100);
    expect(loaded.data.recent.map(s => s.seed)).toEqual([2, 1]);
    expect(loaded.data.tutorialDone).toBe(true);
    expect(loaded.data.settings.muted).toBe(true);
  });
  it('相同种子和成绩的两局仍各自保留', () => {
    const data = new Map<string, string>();
    const store = new SaveStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } });
    const run = summary(createRun(1)); store.record(run); store.record(run);
    expect(JSON.parse(data.get(SAVE_KEY)!).recent).toHaveLength(2);
  });
  it('持久化失败的局次在恢复后仍能保存', () => {
    let text = JSON.stringify(defaults()), blocked = false;
    const store = new SaveStore({ getItem: () => text, setItem: (_key, value) => { if (blocked) throw Error('quota'); text = value; } });
    blocked = true; store.record(summary(createRun(1))); store.record(summary(createRun(2)));
    blocked = false; store.persist();
    expect(JSON.parse(text).recent.map((s: {seed: number}) => s.seed)).toEqual([2, 1]);
  });
});

export type Mode = 'normal' | 'borrow' | 'repay';
export type Point = { x: number; y: number };
export type InputFrame = { x: number; y: number; borrow?: boolean; repay?: boolean };
export type Bullet = Point & { id: number; vx: number; vy: number; radius: number };
export type Laser = { id: number; x: number; y: number; width: number; height: number; warn: number; active: number };
export type Coin = Point & { id: number; risk: boolean };
export type RunEvent = { type: 'borrow' | 'repay' | 'coin' | 'settle' | 'death' | 'wave'; value?: number; automatic?: boolean };
export type RunSummary = {
  seed: number; rulesVersion: string; score: number; ticks: number; borrowCount: number;
  settlements: number; lostPending: number; deathReason: string; wave: number;
};
export type RunSnapshot = {
  seed: number; rng: number; rulesVersion: string; tick: number; worldTick: number;
  mode: Mode; debt: number; dueAt: number | null; borrowLeft: number; score: number; pending: number;
  player: Point; alive: boolean; paused: boolean; bullets: Bullet[]; lasers: Laser[]; coins: Coin[];
  nextId: number; wave: number; waveLeft: number; patternId: string; safeY: number;
  borrowCount: number; settlements: number; events: RunEvent[];
  deathReason: string; deathAt: Point | null; summary: RunSummary | null;
  tutorial: boolean; wavesEnabled: boolean;
};
export type Pattern = { id: string; name: string; kind: 'rows' | 'fan' | 'laser' | 'combo'; variant: number; safeRoute: string };

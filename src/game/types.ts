export type Mode = 'normal' | 'borrow' | 'repay';
export type Point = { x: number; y: number };
export type InputFrame = { x: number; y: number; borrow?: boolean; repay?: boolean; switch?:boolean };
export type Bullet = Point & { id: number; vx: number; vy: number; radius: number };
export type Laser = { id: number; x: number; y: number; width: number; height: number; warn: number; active: number; delay?: number; gate?: boolean };
export type Mine = Point & { id: number; radius: number; warn: number; active: number };
export type Coin = Point & { id: number; risk: boolean };
export type EnemyKind = 'chaser'|'charger'|'shooter'|'shield'|'medic'|'splitter'|'miner'|'larva'|'breaker'|'artillery'|'weaver';
export type WeaponKind = 'gun'|'bow'|'sword'|'spear'|'hammer'|'lightning';
export type UpgradeId = `train_${WeaponKind}` | `mod_${WeaponKind}_${1|2}` |
  'damage'|'rhythm'|'range'|'crit'|'knockback'|'pickup'|'health'|'shield'|'sustain'|'revive'|
  'cold'|'echo'|'stride'|'marks'|'reload'|'swap'|'heal'|'supply'|
  'doublePick'|'triplePick'|'expand'|'survey'|'overclock'|'reroll'|'focus';
export type WeaponState = { kind:WeaponKind; ammo:number; reserve:number; cooldown:number; reload:number; burst:number; burstIn:number; sequence:number };
export type Growth = { rank:number; branch:0|1|null };
export type Card = { uid:number; id:UpgradeId; target?:WeaponKind };
export type Draft = { id:number; options:Card[]; selected:UpgradeId[]; remaining:number; rerolls:number; doubled:boolean; focus?:WeaponKind };
export type DraftBonuses = { options:number; picks:number; doubles:number; rerolls:number; focus:WeaponKind[] };
export type Zone = Point & { id:number; radius:number; warn:number; life:number; friendly:boolean; damage:number; hitIds:number[]; angle?:number; arc?:number };
export type Mark = { target:number; damage:number };
export type Enemy = Point & { id: number; kind: EnemyKind; hp: number; maxHp: number; speed: number; radius: number;
  elite: boolean; cost: number; phase: 'spawn' | 'move' | 'warn' | 'charge' | 'recover'; timer: number;
  dx: number; dy: number; hitIds: number[]; boss?:boolean; cycle?:number; skill?:number; attacks?:number; slow?:number; overload?:number; aim?:Point };
export type Shot = Bullet & { kind: WeaponKind | 'base' | 'echo'; damage: number; life: number; remaining: number;
  hitIds: number[]; frozen: boolean; released: boolean; cold: number; exploded: boolean; range?:number; chain?:number; bounce?:number; armor?:boolean; knockback?:number; overload?:number };
export type WeaponDrop = Point & { id: number; kind: WeaponKind|'ammo'|'medical'; life: number };
export type RunEvent = { type: 'borrow' | 'repay' | 'coin' | 'disarm' | 'settle' | 'death' | 'wave' | 'hurt' | 'kill' | 'weapon' | 'volley' | 'upgrade' | 'blast' | 'chain' | 'melee' | 'switch' | 'boss'; value?: number; automatic?: boolean; at?: Point; from?: Point };
export type RunSummary = {
  seed: number; rulesVersion: string; score: number; ticks: number; borrowCount: number;
  settlements: number; lostPending: number; deathReason: string; wave: number; kills: number; level: number;
};
export type RunSnapshot = {
  seed: number; rng: number; rulesVersion: string; tick: number; worldTick: number;
  mode: Mode; debt: number; dueAt: number | null; borrowLeft: number; score: number; pending: number;
  player: Point; alive: boolean; paused: boolean; bullets: Bullet[]; lasers: Laser[]; mines: Mine[]; coins: Coin[];
  nextId: number; wave: number; waveLeft: number; patternId: string; safeY: number;
  borrowCount: number; settlements: number; events: RunEvent[];
  deathReason: string; deathAt: Point | null; summary: RunSummary | null;
  tutorial: boolean; wavesEnabled: boolean;
  hp:number; maxHp:number; invulnerable:number; shieldReady:boolean; shieldTicks:number; sustainKills:number; reviveUsed:boolean;
  enemies: Enemy[]; shots: Shot[]; drops: WeaponDrop[];
  weapons:WeaponState[]; activeWeapon:number; growth:Record<WeaponKind,Growth>; switchCooldown:number; swapReadyAt:number; swapUntil:number; emergencyCooldown:number;
  kills: number; level: number; xp: number;
  upgrades:Record<UpgradeId,number>; choices:UpgradeId[]; draft:Draft|null; bonuses:DraftBonuses; evolution:WeaponKind[]; replacement:WeaponKind|null; marks:Mark[]; zones:Zone[]; repaidTicks:number;
  director: { spawnIn:number; weaponIn:number; eliteAt:number; eliteKind:EnemyKind|null; mineIn:number; weaponHistory:WeaponKind[];
    pendingDrops:(Point & {kind?:WeaponDrop['kind']})[]; supplyIn:number; emptyIn:number; bossAt:number; bossIndex:number; bossQueue:number; bossWarning:number };
  feedback: { type: 'slash' | 'thrust' | 'blast' | 'chain' | 'hurt' | 'kill' | 'volley'; at: Point; from?: Point; radius: number; until: number; angle?:number; arc?:number }[];
};
export type Pattern = { id: string; name: string; kind: 'rows' | 'fan' | 'laser' | 'combo' | 'mines' | 'gates'; variant: number; safeRoute: string };

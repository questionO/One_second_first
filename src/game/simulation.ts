import { COMBAT, HZ, RULES, RULES_VERSION } from './balance';
import { sweptCircle, sweptRect } from './collision';
import { advanceDirector, dropWeapon, dropSupply, makeEnemy } from './director';
import { advanceEnemies } from './enemies';
import { advanceShots, collectWeapon, echo, fire, releaseVolley, advancePersonal, switchWeapon } from './weapons';
import { ARSENAL, createWeapon, decisionsPending, FAMILIES } from './arsenal';
import { random } from './patterns';
import { advanceZones } from './skills';
import { initialUpgrades, prepareUpgrade } from './upgrades';
import type { InputFrame, Point, RunSnapshot, RunSummary, WeaponKind, Growth } from './types';
export const EMPTY_INPUT: InputFrame = { x: 0, y: 0 };
export function createRun(seed: number, rulesVersion = RULES_VERSION, starter:WeaponKind='gun'): RunSnapshot {
  if (rulesVersion !== RULES_VERSION) throw new Error('Unsupported rules version');
  const s: RunSnapshot = {
    seed: seed >>> 0, rng: (seed >>> 0) || 0x6d2b79f5, rulesVersion, tick: 0, worldTick: 0,
    mode: 'normal', debt: 0, dueAt: null, borrowLeft: 0, score: 0, pending: 0,
    player: { x: 480, y: 238 }, alive: true, paused: false, bullets: [], lasers: [], mines: [], coins: [],
    nextId: 1, wave: 0, waveLeft: 0, patternId: '', safeY: 238,
    borrowCount: 0, settlements: 0, events: [], deathReason: '', deathAt: null, summary: null,
    tutorial: false, wavesEnabled: true,
    hp:COMBAT.maxHp,maxHp:COMBAT.maxHp,invulnerable:0,shieldReady:false,shieldTicks:0,sustainKills:0,reviveUsed:false,enemies:[],shots:[],drops:[],
    weapons:[createWeapon(starter)],activeWeapon:0,growth:Object.fromEntries(FAMILIES.map(k=>[k,{rank:1,branch:null}])) as Record<WeaponKind,Growth>,switchCooldown:0,swapReadyAt:0,swapUntil:0,emergencyCooldown:0,
    kills: 0, level: 1, xp: 0, upgrades:initialUpgrades(),choices:[],draft:null,bonuses:{options:0,picks:0,doubles:0,rerolls:0,focus:[]},evolution:[],replacement:null,marks:[],zones:[],repaidTicks:0,
    director: {spawnIn:1,weaponIn:COMBAT.weaponTicks,eliteAt:COMBAT.eliteTicks,eliteKind:null,mineIn:COMBAT.mineTicks,weaponHistory:[],pendingDrops:[],supplyIn:900,emptyIn:300,bossAt:10800,bossIndex:0,bossQueue:0,bossWarning:-1}, feedback: [],
  };
  return s;
}
export function borrowBlockReason(s: RunSnapshot): string {
  if (!s.alive || s.paused || decisionsPending(s)) return '当前不可操作';
  if (s.mode === 'borrow') return '冻结中';
  if (s.mode === 'repay') return '正在还债';
  if (s.debt + RULES.borrowTicks > RULES.maxDebt) return '已欠满 3 秒';
  if (s.dueAt !== null && s.dueAt - s.tick < s.debt + 2 * RULES.borrowTicks) return '即将到期';
  return '';
}
export function canRepay(s: RunSnapshot): boolean { return s.alive && !s.paused && !decisionsPending(s) && s.debt > 0 &&
  (s.mode === 'normal' || s.mode === 'borrow' && RULES.borrowTicks-s.borrowLeft>=COMBAT.earlyRepayTicks); }
export function latestRepayIn(s: RunSnapshot): number { return s.dueAt === null ? 0 : Math.max(0, s.dueAt - s.tick - s.debt); }
export function summary(s: RunSnapshot): RunSummary {
  return { seed: s.seed, rulesVersion: s.rulesVersion, score: s.score, ticks: s.tick, borrowCount: s.borrowCount,
    settlements: s.settlements, lostPending: s.pending * 2, deathReason: s.deathReason, wave: s.wave, kills:s.kills,level:s.level };
}
function die(s: RunSnapshot, reason: string, at: Point): void {
  s.alive = false; s.deathReason = reason; s.deathAt = { ...at };
  s.summary = summary(s); s.pending = 0; s.events.push({ type: 'death' });
}
function startRepay(s: RunSnapshot, automatic: boolean) {
  if(s.mode==='borrow') {releaseVolley(s);s.borrowLeft=0;}
  s.mode = 'repay'; s.events.push({ type: 'repay', automatic });
}
export function step(s: RunSnapshot, input: InputFrame = EMPTY_INPUT): void {
  s.events = [];
  if (!s.alive || s.paused || decisionsPending(s)) return;
  if(s.invulnerable>0) s.invulnerable--;
  s.feedback=s.feedback.filter(f=>f.until>s.tick);
  if (s.mode === 'normal' && s.debt > 0 && s.dueAt !== null && s.dueAt - s.tick <= s.debt) startRepay(s, true);
  if (input.repay && canRepay(s)) startRepay(s, false);
  if (input.borrow && !borrowBlockReason(s)) {
    s.mode = 'borrow'; s.borrowLeft = RULES.borrowTicks;
    if (s.dueAt === null) {s.dueAt = s.tick + RULES.deadlineTicks;s.repaidTicks=0;}
    s.borrowCount++; s.events.push({ type: 'borrow' });
  }
  const mode = s.mode, worldSteps = mode === 'borrow' ? 0 : mode === 'repay' ? 2 : 1;
  const divisions = Math.max(1, worldSteps);
  const x = Number.isFinite(input.x) ? input.x : 0, y = Number.isFinite(input.y) ? input.y : 0;
  const length = Math.hypot(x, y), scale = length > 1 ? 1 / length : 1;
  const movement=RULES.playerSpeed*(mode==='repay'?1+0.08*s.upgrades.stride:1);
  const dx = x * scale * movement / HZ / divisions;
  const dy = y * scale * movement / HZ / divisions;
  const picked = new Set<number>();
  const disarmed = new Set<number>();
  const weapons = new Set<number>();
  const hadDebt=s.debt>0||mode==='borrow';
  const hurt=(reason:string,at:Point)=>{
    if(s.invulnerable>0 || !s.alive) return;
    if(s.shieldReady){s.shieldReady=false;s.shieldTicks=[0,1200,960,720][s.upgrades.shield];s.invulnerable=60;return;}
    s.hp--;if(s.hp<=0&&s.upgrades.revive&&!s.reviveUsed){s.hp=1;s.reviveUsed=true;s.invulnerable=120;return;}
    s.invulnerable=COMBAT.invulnerableTicks;s.events.push({type:'hurt'});
    s.feedback.push({type:'hurt',at:{...s.player},radius:30,until:s.tick+20});
    if(s.hp<=0) die(s,reason,at);
  };
  advancePersonal(s);if(input.switch)switchWeapon(s);
  s.tick++;
  if (mode === 'borrow') { s.debt++; s.borrowLeft--; }
  if (mode === 'repay') {s.debt = Math.max(0, s.debt - 1);s.repaidTicks++;}
  for (let part = 0; part < divisions; part++) {
    const old = { ...s.player }, f = RULES.field, r = RULES.playerRadius;
    s.player.x = Math.max(f.left + r, Math.min(f.right - r, old.x + dx));
    s.player.y = Math.max(f.top + r, Math.min(f.bottom - r, old.y + dy));
    const previousEnemies=advanceEnemies(s,worldSteps>0,old,hurt);
    if(!s.alive) return;
    for (const bullet of s.bullets) {
      const previous = { x: bullet.x, y: bullet.y };
      if (worldSteps > 0) { bullet.x += bullet.vx / HZ; bullet.y += bullet.vy / HZ; }
      if (sweptCircle(old, s.player, previous, bullet, r + bullet.radius)) {
        hurt(mode === 'borrow' ? '撞上冻结的弹幕' : mode === 'repay' ? '被加速弹幕击中' : '被横穿弹幕击中', bullet); if(!s.alive) return;
      }
    }
    for (const laser of s.lasers) {
      if (laser.delay && laser.delay > 0) { if (worldSteps > 0) laser.delay--; continue; }
      // The final warning interval is harmless; the next interval starts the beam.
      const wasActive = laser.warn <= 0 && laser.active > 0;
      if (worldSteps > 0) { if (laser.warn > 0) laser.warn--; else if (laser.active > 0) laser.active--; }
      if (wasActive && sweptRect(old, s.player, laser.x, laser.y, laser.width, laser.height, r)) {
        hurt(laser.gate ? '没能及时换到下一条安全带' : mode === 'borrow' ? '碰到了仍在发射的冻结激光' : '被激光切中', s.player); if(!s.alive) return;
      }
    }
    for (const mine of s.mines) {
      const wasActive = mine.warn <= 0 && mine.active > 0;
      if (mode === 'borrow' && mine.warn > 0 && sweptCircle(old, s.player, mine, mine, r + RULES.mineCoreRadius)) disarmed.add(mine.id);
      if (worldSteps > 0) { if (mine.warn > 0) mine.warn--; else if (mine.active > 0) mine.active--; }
      if (wasActive && sweptCircle(old, s.player, mine, mine, r + mine.radius)) {
        hurt(mode === 'borrow' ? '闯入了冻结中的爆炸区域' : '被定时爆雷波及', mine); if(!s.alive) return;
      }
    }
    advanceZones(s,worldSteps>0,old,hurt);if(!s.alive)return;
    for (const coin of s.coins) if (sweptCircle(old, s.player, coin, coin, r + 9)) picked.add(coin.id);
    for (const drop of s.drops) if(sweptCircle(old,s.player,drop,drop,(r+12)*(1+.25*s.upgrades.pickup))) weapons.add(drop.id);
    if (worldSteps > 0) {
      advanceShots(s,previousEnemies);
      for(const drop of s.drops) drop.life--;
      s.worldTick++; s.waveLeft--;
    }
  }
  // Defer pickups and settlement until all collision substeps have passed.
  const rewardKills=()=>{
   const dead=s.enemies.filter(e=>e.hp<=0);s.enemies=s.enemies.filter(e=>e.hp>0);
   for(const enemy of dead){
    const base=COMBAT.enemies[enemy.kind],reward=enemy.boss?300:enemy.elite?100:base.score;
    if(hadDebt)s.pending+=reward;else s.score+=reward;
    s.xp+=enemy.boss?12:enemy.elite?8:base.xp;s.kills++;s.sustainKills++;
    if(s.upgrades.sustain&&s.sustainKills>=[0,60,45,30][s.upgrades.sustain]){s.sustainKills=0;s.hp=Math.min(s.maxHp,s.hp+1);}
    s.events.push({type:'kill',at:{x:enemy.x,y:enemy.y}});s.feedback.push({type:'kill',at:{x:enemy.x,y:enemy.y},radius:enemy.radius+10,until:s.tick+15});
    const guaranteed=(kind:'medical'|'ammo')=>{if(!dropSupply(s,kind,enemy))s.director.pendingDrops.push({x:enemy.x,y:enemy.y,kind});};
    if(enemy.boss){guaranteed('medical');guaranteed('ammo');}
    else if(enemy.elite){guaranteed('ammo');if(!dropWeapon(s,enemy))s.director.pendingDrops.push({x:enemy.x,y:enemy.y});}
    else if(random(s)<.04)dropSupply(s,'medical',enemy);
    if(enemy.kind==='splitter')for(let i=0;i<2&&s.enemies.length<COMBAT.maxEnemies;i++){const e=makeEnemy(s,'larva',{x:enemy.x+(i?16:-16),y:enemy.y});e.hp=2;e.maxHp=2;s.enemies.push(e);}
   }
  };
  rewardKills();
  s.drops=s.drops.filter(d=>!(weapons.has(d.id)&&collectWeapon(s,d))&&d.life>0);
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
  fire(s);rewardKills();
  if (mode === 'borrow' && s.borrowLeft === 0) {releaseVolley(s);s.mode = 'normal';rewardKills();}
  if (mode === 'repay' && s.debt === 0) {
    const earned = s.pending * 2;
    s.score += earned; s.pending = 0; s.mode = 'normal'; s.dueAt = null;
    s.settlements++;echo(s);s.repaidTicks=0;
    s.events.push({ type: 'settle', value: earned });
  }
  if(s.wavesEnabled && worldSteps>0) {
    // Timers run once per world substep; spawning only after damage/rewards keeps lethal steps final.
    for(let part=0;part<worldSteps;part++) advanceDirector(s);
  }
  s.feedback=s.feedback.slice(-64);
  prepareUpgrade(s);
}

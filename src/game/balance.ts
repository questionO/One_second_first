export const RULES_VERSION = '3.0.0';
export const HZ = 60;
export const RULES = Object.freeze({
  width: 960, height: 540, playerSpeed: 230, playerRadius: 8, bulletRadius: 6,
  borrowTicks: 60, maxDebt: 180, deadlineTicks: 480, coinValue: 10,
  laserWarn: 108, laserActive: 36, maxHazards: 48,
  mineWarn: 108, mineActive: 48, mineRadius: 88, mineCoreRadius: 12, disarmValue: 30,
  gateWarn: 108, gateActive: 30, gateGap: 36,
  field: { left: 36, right: 924, top: 84, bottom: 392 },
});
export const COMBAT = Object.freeze({
  maxHp: 3, invulnerableTicks: 60, earlyRepayTicks: 15, fireTicks: 24, range: 620,
  shotSpeed: 480, shotLife: 120, magazine: 12, maxEnemies: 16, maxBullets: 96, maxShots: 128,
  maxDrops: 8, spawnWarn: 90, spawnDistance: 180, activateDistance: 96, attackWarn: 90,
  chargeSpeed: 420, chargeTicks: 27, friendlyDamage: 3, chainRadius: 120,
  weaponTicks: 1080, dropLife: 3600, eliteTicks: 5400, mineTicks: 2700,
  enemies: {
    chaser: { hp: 4, speed: 80, cost: 1, score: 10, xp: 1 },
    charger: { hp: 6, speed: 55, cost: 2, score: 20, xp: 2 },
    shooter: { hp: 4, speed: 45, cost: 3, score: 20, xp: 2 },
    shield: {hp:12,speed:38,cost:3,score:30,xp:3},
    medic: {hp:6,speed:42,cost:3,score:30,xp:3},
    splitter: {hp:9,speed:60,cost:2,score:20,xp:2},
    miner: {hp:8,speed:40,cost:3,score:30,xp:3},
    larva: {hp:2,speed:95,cost:1,score:5,xp:0},
    breaker: {hp:100,speed:50,cost:0,score:300,xp:12},
    artillery: {hp:120,speed:24,cost:0,score:300,xp:12},
    weaver: {hp:140,speed:35,cost:0,score:300,xp:12},
  },
});
export function difficulty(worldTick: number) {
  if (worldTick < 6 * HZ) return { stage: 0, speed: 135, duration: 360 };
  if (worldTick < 24 * HZ) return { stage: 1, speed: 170, duration: 300 };
  if (worldTick < 60 * HZ) return { stage: 2, speed: 200, duration: 288 };
  return { stage: 3, speed: 220, duration: 276 };
}

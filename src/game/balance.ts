export const RULES_VERSION = '1.1.0';
export const HZ = 60;
export const RULES = Object.freeze({
  width: 960, height: 540, playerSpeed: 230, playerRadius: 8, bulletRadius: 6,
  borrowTicks: 60, maxDebt: 180, deadlineTicks: 480, coinValue: 10,
  laserWarn: 108, laserActive: 36, maxHazards: 48,
  mineWarn: 108, mineActive: 48, mineRadius: 88, mineCoreRadius: 12, disarmValue: 30,
  gateWarn: 108, gateActive: 30, gateGap: 36,
  field: { left: 36, right: 924, top: 84, bottom: 392 },
});
export function difficulty(worldTick: number) {
  if (worldTick < 6 * HZ) return { stage: 0, speed: 135, duration: 360 };
  if (worldTick < 24 * HZ) return { stage: 1, speed: 170, duration: 300 };
  if (worldTick < 60 * HZ) return { stage: 2, speed: 200, duration: 288 };
  return { stage: 3, speed: 220, duration: 276 };
}

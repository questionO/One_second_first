export const RULES_VERSION = '1.0.1';
export const HZ = 60;
export const RULES = Object.freeze({
  width: 960, height: 540, playerSpeed: 230, playerRadius: 8, bulletRadius: 6,
  borrowTicks: 60, maxDebt: 180, deadlineTicks: 480, coinValue: 10,
  laserWarn: 108, laserActive: 36, maxHazards: 48,
  field: { left: 36, right: 924, top: 84, bottom: 392 },
});
export function difficulty(worldTick: number) {
  if (worldTick < 20 * HZ) return { stage: 0, speed: 110, duration: 360 };
  if (worldTick < 60 * HZ) return { stage: 1, speed: 150, duration: 300 };
  if (worldTick < 120 * HZ) return { stage: 2, speed: 180, duration: 270 };
  return { stage: 3, speed: 200, duration: 240 };
}

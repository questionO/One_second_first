import type { RunSnapshot, WeaponKind, WeaponState } from './types';

export const FAMILIES:WeaponKind[]=['gun','bow','sword','spear','hammer','lightning'];
export const ARSENAL = {
  gun:{names:['手枪','冲锋枪','机枪','穿甲步枪'],damage:1,interval:24,range:400,initial:60,magazine:12,reload:72},
  bow:{names:['短弓','复合弓','连珠弓','重弩'],damage:2,interval:42,range:500,initial:36,magazine:0,reload:0},
  sword:{names:['短剑','长刀','双刃','环刃'],damage:2.5,interval:30,range:65,initial:0,magazine:0,reload:0},
  spear:{names:['短矛','长枪','穿阵枪','回旋枪'],damage:3,interval:40,range:110,initial:0,magazine:0,reload:0},
  hammer:{names:['木槌','重锤','震地锤','破城锤'],damage:5,interval:65,range:70,initial:0,magazine:0,reload:0},
  lightning:{names:['电火花器','电弧器','连锁电杖','雷矛'],damage:1.5,interval:36,range:330,initial:40,magazine:0,reload:0},
} as const;
export const WEAPON_NAMES=Object.fromEntries(FAMILIES.map(k=>[k,ARSENAL[k].names[0]])) as Record<WeaponKind,string>;
export function weaponName(s:RunSnapshot,k:WeaponKind):string {
  const g=s.growth[k];return ARSENAL[k].names[g.branch===null?(g.rank>=3?1:0):g.branch+2];
}
export function createWeapon(kind:WeaponKind):WeaponState {
  const a=ARSENAL[kind];return {kind,ammo:a.magazine||a.initial,reserve:a.magazine?a.initial-a.magazine:0,cooldown:0,reload:0,burst:0,burstIn:0,sequence:0};
}
export function magazineSize(s:RunSnapshot):number {
  return Math.round(12*(1+.25*s.upgrades.mod_gun_1)*(s.growth.gun.branch===0?2:1));
}
export function canSupply(s:RunSnapshot):boolean {
  return s.weapons.some(w=>ARSENAL[w.kind].initial>0&&(w.kind==='gun'?w.reserve<180:w.ammo<ARSENAL[w.kind].initial*3));
}
export function supply(s:RunSnapshot,kind?:WeaponKind):void {
  for(const w of s.weapons) {
    if(kind&&w.kind!==kind)continue;
    const initial=ARSENAL[w.kind].initial;
    if(w.kind==='gun')w.reserve=Math.min(initial*3,w.reserve+Math.ceil(initial*.25));
    else w.ammo=Math.min(initial*3,w.ammo+Math.ceil(initial*.25));
  }
}
export function stats(s:RunSnapshot,w:WeaponState) {
  const a=ARSENAL[w.kind],g=s.growth[w.kind];
  let damage=a.damage*(1+.1*(g.rank-1))*(1+.12*s.upgrades.damage);
  let interval=a.interval*(g.rank>=3?.85:1)*(1-.08*s.upgrades.rhythm),range=a.range*(1+.15*s.upgrades.range);
  if(w.kind==='gun'&&g.rank>=3)interval*=.6;
  if(w.kind==='gun'&&g.branch===0)interval*=.7;
  if(w.kind==='gun'&&g.branch===1){interval*=2.5;damage*=3;range*=1.3;}
  if(w.kind==='bow'&&g.branch===1){interval*=1.5;damage*=2.5;range*=1.2;}
  if(w.kind==='hammer'&&g.branch===1){damage*=1.8;interval*=1.25;}
  if(w.kind==='spear'&&g.branch===0){range*=1.5;damage*=1.3;}
  if(w.kind==='sword')range*=1+.12*s.upgrades.mod_sword_1;
  if(w.kind==='lightning'&&g.branch===1){damage*=1.5;range*=1.25;}
  return {damage,interval:Math.max(3,Math.round(interval)),range};
}
export function decisionsPending(s:RunSnapshot):boolean {return !!s.draft||s.evolution.length>0||s.replacement!==null;}

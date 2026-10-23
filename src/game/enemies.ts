import { COMBAT, HZ, RULES } from './balance';
import { sweptCircle } from './collision';
import { specialAttack } from './skills';
import type { Point, RunSnapshot } from './types';

export function advanceEnemies(s: RunSnapshot, moving: boolean, oldPlayer: Point, hurt: (reason: string, at: Point) => void): Map<number, Point> {
  const previous=new Map(s.enemies.map(e=>[e.id,{x:e.x,y:e.y}]));
  const cancelled=new Set<number>(), charging=new Set<number>(), f=RULES.field;
  for(const e of s.enemies) {
    if(e.hp<=0) continue;
    if(e.phase==='spawn') {
      if(moving && --e.timer<=0) {
        if(Math.hypot(e.x-s.player.x,e.y-s.player.y)<COMBAT.activateDistance) { cancelled.add(e.id); if(e.boss){s.director.bossQueue++;s.director.bossIndex--;s.director.bossWarning=-1;} s.director.spawnIn=Math.min(s.director.spawnIn,60); }
        else { e.phase='move';e.timer=120; }
      }
      continue;
    }
    if(moving) {
      if(e.slow)e.slow--;
      const dx=s.player.x-e.x,dy=s.player.y-e.y,distance=Math.hypot(dx,dy)||1;
      if(e.phase==='move') {
        const ranged=['shooter','medic','miner','artillery','weaver'].includes(e.kind);
        const direction=ranged?(distance>260?1:distance<200?-1:0):1;
        const speed=e.speed*((e.slow??0)>0?.7:1);
        e.x+=dx/distance*speed/HZ*direction;e.y+=dy/distance*speed/HZ*direction;
        if(e.kind==='shield'){const current=Math.atan2(e.dy,e.dx),wanted=Math.atan2(dy,dx),delta=Math.atan2(Math.sin(wanted-current),Math.cos(wanted-current)),a=current+Math.max(-.025,Math.min(.025,delta));e.dx=Math.cos(a);e.dy=Math.sin(a);}
        if(!['chaser','splitter','larva'].includes(e.kind) && (e.kind!=='shield'||s.worldTick>=360*HZ) && --e.timer<=0) {
          e.phase='warn';e.timer=COMBAT.attackWarn;
          e.aim={...s.player};const angle=Math.atan2(s.player.y-e.y,s.player.x-e.x);e.dx=Math.cos(angle);e.dy=Math.sin(angle);
        }
      } else if(e.phase==='warn' && --e.timer<=0) {
        if(e.kind==='charger'||e.kind==='breaker'&&(e.skill??0)%2===0) { e.phase='charge';e.timer=COMBAT.chargeTicks;e.hitIds=[]; }
        else {
          specialAttack(s,e);
          e.phase='recover';e.timer=75;
        }
      } else if(e.phase==='charge') {
        charging.add(e.id);e.x+=e.dx*COMBAT.chargeSpeed/HZ;e.y+=e.dy*COMBAT.chargeSpeed/HZ;
        if(--e.timer<=0 || e.x<=f.left+e.radius || e.x>=f.right-e.radius || e.y<=f.top+e.radius || e.y>=f.bottom-e.radius) { e.phase='recover';e.timer=75;if(e.kind==='breaker')e.skill=(e.skill??0)+1; }
      } else if(e.phase==='recover' && --e.timer<=0) {
        if(e.kind==='charger'&&s.worldTick>=360*HZ&&(e.attacks??0)%2===0){e.attacks=(e.attacks??0)+1;e.phase='warn';e.timer=90;const a=Math.atan2(dy,dx);e.dx=Math.cos(a);e.dy=Math.sin(a);}
        else {e.attacks=(e.attacks??0)+1;e.phase='move';e.timer=e.elite?90:120;}
      }
      e.x=Math.max(f.left+e.radius,Math.min(f.right-e.radius,e.x));e.y=Math.max(f.top+e.radius,Math.min(f.bottom-e.radius,e.y));
    }
    if(sweptCircle(oldPlayer,s.player,previous.get(e.id)!,e,RULES.playerRadius+e.radius)) hurt(e.kind==='charger'?'撞上冲锋怪':e.kind==='shooter'?'撞上炮手怪':'被追猎怪碰到',e);
  }
  // Resolve all movement before charge collisions, independent of array ordering.
  for(const e of s.enemies) if(charging.has(e.id)) {
    for(const target of s.enemies) {
      if(target===e || target.phase==='spawn' || target.hp<=0 || e.hitIds.includes(target.id)) continue;
      if(sweptCircle(previous.get(e.id)!,e,previous.get(target.id)!,target,e.radius+target.radius)) {
        target.hp-=COMBAT.friendlyDamage;e.hitIds.push(target.id);
      }
    }
  }
  s.enemies=s.enemies.filter(e=>!cancelled.has(e.id)); return previous;
}

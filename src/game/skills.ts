import { COMBAT, HZ, RULES } from './balance';
import { sweptCircle } from './collision';
import { damageEnemy } from './weapons';
import type { Enemy, Point, RunSnapshot } from './types';
export function zone(s:RunSnapshot,p:Point,radius:number,warn=90,angle?:number,arc?:number):boolean{
 if(s.zones.length>=12)return false;const f=RULES.field;
 s.zones.push({id:s.nextId++,x:Math.max(f.left+radius,Math.min(f.right-radius,p.x)),y:Math.max(f.top+radius,Math.min(f.bottom-radius,p.y)),radius,warn,life:24,friendly:false,damage:1,hitIds:[],angle,arc});return true;
}
export function fan(s:RunSnapshot,e:Enemy,count:number,spread:number,ring=false):void{
 if(s.bullets.length+count>COMBAT.maxBullets)return;
 const angle=Math.atan2(e.dy,e.dx);
 for(let i=0;i<count;i++){
  const a=ring?angle+.6+i*(Math.PI*2-1.2)/Math.max(1,count-1):angle+(i-(count-1)/2)*spread;
  s.bullets.push({id:s.nextId++,x:e.x,y:e.y,vx:Math.cos(a)*190,vy:Math.sin(a)*190,radius:6});
 }
}
export function specialAttack(s:RunSnapshot,e:Enemy):void{
 const skill=e.skill??0;
 if(e.kind==='medic'){
  const targets=s.enemies.filter(t=>t.id!==e.id&&t.kind!=='medic'&&!t.boss&&t.phase!=='spawn'&&t.hp>0&&t.hp<t.maxHp&&Math.hypot(t.x-e.x,t.y-e.y)<=180).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id).slice(0,3);
  for(const t of targets){t.hp=Math.min(t.maxHp,t.hp+t.maxHp*.15);s.feedback.push({type:'chain',from:{x:e.x,y:e.y},at:{x:t.x,y:t.y},radius:0,until:s.tick+15});}
 }else if(e.kind==='miner')zone(s,e.aim??s.player,45);
 else if(e.kind==='shield')zone(s,{x:e.x+e.dx*30,y:e.y+e.dy*30},48,90,Math.atan2(e.dy,e.dx),1.1);
 else if(e.kind==='breaker')zone(s,e,90,90,Math.atan2(e.dy,e.dx),1.1);
 else if(e.kind==='artillery'){
  if(skill%2===0)fan(s,e,5,0.22);
  else for(let i=0;i<Math.min(5,3+(e.cycle??0));i++)zone(s,{x:(e.aim?.x??s.player.x)+(i-1)*75,y:e.aim?.y??s.player.y},38,90+i*24);
 }else if(e.kind==='weaver'){
  if(skill%2===0)fan(s,e,16,0,true);
  else for(let i=0;i<Math.min(5,2+(e.cycle??0));i++)zone(s,{x:(e.aim?.x??s.player.x)+(i%2?85:-85),y:(e.aim?.y??s.player.y)+(Math.floor(i/2)*65-30)},40,90+i*20);
 }else fan(s,e,s.worldTick>=360*HZ?3:1,.25);
 e.skill=skill+1;
}
export function advanceZones(s:RunSnapshot,moving:boolean,old:Point,hurt:(reason:string,at:Point)=>void):void{
 for(const z of s.zones){
 const active=z.warn<=0&&z.life>0;
 if(moving){if(z.warn>0)z.warn--;else z.life--;}
 if(!active)continue;
 if(z.friendly){if(moving)for(const e of s.enemies)if(!z.hitIds.includes(e.id)&&e.phase!=='spawn'&&Math.hypot(e.x-z.x,e.y-z.y)<=z.radius+e.radius){damageEnemy(s,e,z.damage,z);z.hitIds.push(e.id);}}
 else if(sweptCircle(old,s.player,z,z,z.radius+RULES.playerRadius)){
  const angle=Math.atan2(s.player.y-z.y,s.player.x-z.x),difference=Math.atan2(Math.sin(angle-(z.angle??angle)),Math.cos(angle-(z.angle??angle)));
  if(z.arc===undefined||Math.abs(difference)<=z.arc)hurt('闯入了技能危险区',z);
 }
 }s.zones=s.zones.filter(z=>z.warn>0||z.life>0);
}

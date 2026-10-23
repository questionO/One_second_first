import { COMBAT, HZ, RULES } from './balance';
import { sweptCircle } from './collision';
import { ARSENAL, createWeapon, magazineSize, stats, supply } from './arsenal';
import { random } from './patterns';
import type { Enemy, Point, RunSnapshot, Shot, WeaponDrop, WeaponState } from './types';
export { WEAPON_NAMES } from './arsenal';
export function nearest(s:RunSnapshot,p:Point,radius:number,exclude:number[]=[]):Enemy|undefined{
 return s.enemies.filter(e=>e.hp>0&&e.phase!=='spawn'&&!exclude.includes(e.id)&&Math.hypot(e.x-p.x,e.y-p.y)<=radius)
 .sort((a,b)=>(a.x-p.x)**2+(a.y-p.y)**2-((b.x-p.x)**2+(b.y-p.y)**2)||a.id-b.id)[0];
}
export function damageEnemy(s:RunSnapshot,e:Enemy,damage:number,from:Point,armor=0,knockback=0):number{
 if(e.hp<=0||e.phase==='spawn')return 0;
 const dx=from.x-e.x,dy=from.y-e.y,len=Math.hypot(dx,dy)||1;
 const frontal=e.kind==='shield'&&(dx*e.dx+dy*e.dy)/len>0;
 const actual=damage*(frontal?1-.6*(1-armor):1);e.hp-=actual;
 if(e.kind==='medic'&&e.phase==='warn'){e.phase='recover';e.timer=90;}
 if(knockback&&!e.boss&&e.phase!=='charge'){
 const f=RULES.field;e.x=Math.max(f.left+e.radius,Math.min(f.right-e.radius,e.x-dx/len*knockback));e.y=Math.max(f.top+e.radius,Math.min(f.bottom-e.radius,e.y-dy/len*knockback));}
 return actual;
}
function blast(s:RunSnapshot,p:Point,radius:number,damage:number,exclude:number=-1){
 for(const e of s.enemies)if(e.id!==exclude&&Math.hypot(e.x-p.x,e.y-p.y)<=radius)damageEnemy(s,e,damage,p);
 s.feedback.push({type:'blast',at:{...p},radius,until:s.tick+18});s.events.push({type:'blast',at:{...p}});
}
function makeShot(s:RunSnapshot,angle:number,kind:Shot['kind'],damage:number,remaining:number,range=960):Shot{
 return {id:s.nextId++,...s.player,vx:Math.cos(angle)*COMBAT.shotSpeed,vy:Math.sin(angle)*COMBAT.shotSpeed,radius:3,kind,damage,remaining,hitIds:[],life:COMBAT.shotLife,
 frozen:s.mode==='borrow',released:s.mode!=='borrow',cold:kind==='echo'?0:s.upgrades.cold,exploded:false,range,knockback:kind==='echo'?0:8*(1+.2*s.upgrades.knockback)};
}
export function switchWeapon(s:RunSnapshot):boolean{
 if(s.weapons.length<2||s.switchCooldown>0)return false;
 s.weapons[s.activeWeapon].burst=0;s.activeWeapon=1-s.activeWeapon;s.switchCooldown=18;
 if(s.tick>=s.swapReadyAt){s.swapUntil=s.tick+120;s.swapReadyAt=s.tick+180;}
 s.events.push({type:'switch'});return true;
}
export function advancePersonal(s:RunSnapshot):void{
 if(s.switchCooldown>0)s.switchCooldown--;if(s.emergencyCooldown>0)s.emergencyCooldown--;
 if(!s.shieldReady&&s.upgrades.shield&&--s.shieldTicks<=0)s.shieldReady=true;
 for(const w of s.weapons){
 if(w.cooldown>0)w.cooldown--;if(w.burstIn>0)w.burstIn--;
 if(w.reload>0&&--w.reload===0){const n=Math.min(magazineSize(s)-w.ammo,w.reserve);w.ammo+=n;w.reserve-=n;}
 if(w.kind==='gun'&&w.ammo===0&&w.reserve>0&&w.reload===0)w.reload=ARSENAL.gun.reload;
 }
}
function melee(s:RunSnapshot,w:WeaponState,target:Enemy,damage:number,range:number,emergency=false):void{
 const kind=emergency?'sword':w.kind,branch=emergency?null:s.growth[w.kind].branch;
 let angle=Math.atan2(target.y-s.player.y,target.x-s.player.x);
 if(kind==='sword'&&branch===0&&w.sequence%2)angle+=Math.PI;
 const all=kind==='sword'&&branch===1||kind==='spear'&&branch===1;
 const center={...s.player};
 for(const e of s.enemies){
 const dx=e.x-center.x,dy=e.y-center.y,distance=Math.hypot(dx,dy),projection=dx*Math.cos(angle)+dy*Math.sin(angle),side=Math.abs(dx*Math.sin(angle)-dy*Math.cos(angle));
 if(distance>range+e.radius)continue;
 const front=all||(kind==='spear'?projection>=0&&side<18+e.radius:projection>=distance*Math.cos(kind==='hammer'?1:1.2));
 const back=!emergency&&kind==='spear'&&!front&&s.upgrades.mod_spear_1>0&&projection<0&&side<18+e.radius;
 if(!front&&!back)continue;
 const amount=damageEnemy(s,e,damage*(back?.25*s.upgrades.mod_spear_1:1),center,kind==='spear'?s.upgrades.mod_spear_2/3:0,(kind==='hammer'?24:10)*(1+.2*s.upgrades.knockback));
 if(amount&&s.mode==='borrow'&&s.upgrades.marks&&s.marks.length<64)s.marks.push({target:e.id,damage:amount*.25*s.upgrades.marks});
 if(kind==='hammer'&&s.upgrades.mod_hammer_2)e.slow=60*s.upgrades.mod_hammer_2;
 }
 if(kind==='sword'&&s.upgrades.mod_sword_2){let count=s.upgrades.mod_sword_2;s.bullets=s.bullets.filter(b=>!(count>0&&Math.hypot(b.x-center.x,b.y-center.y)<=range&&count--));}
 if(kind==='hammer'&&!emergency&&(s.upgrades.mod_hammer_1||branch===0)&&s.zones.length<12){s.zones.push({id:s.nextId++,...center,radius:range,warn:18,life:1,friendly:true,damage:damage*(.25*s.upgrades.mod_hammer_1+(branch===0?.5:0)),hitIds:[]});}
 s.feedback.push({type:kind==='spear'&&!all?'thrust':kind==='hammer'?'blast':'slash',at:center,radius:range,until:s.tick+10,angle,arc:all?Math.PI:1.2});s.events.push({type:'melee',at:center});w.sequence++;
}
export function fire(s:RunSnapshot):void{
 const w=s.weapons[s.activeWeapon];if(!w)return;
 const a=ARSENAL[w.kind],v=stats(s,w),ranged=a.initial>0,empty=ranged&&w.ammo+w.reserve===0;
 if(empty){w.burst=0;if(s.emergencyCooldown)return;const target=nearest(s,s.player,48);if(target){melee(s,w,target,1.5,48,true);s.emergencyCooldown=36;}return;}
 if(w.reload||w.cooldown>0&&!(w.burst>0&&w.burstIn===0))return;
 const target=nearest(s,s.player,v.range);if(!target)return;
 const count=w.kind==='bow'?1+s.upgrades.mod_bow_1:1;
 if(ranged&&(w.ammo<=0||s.shots.length+count>COMBAT.maxShots))return;
 let damage=v.damage;if(random(s)<.05+.05*s.upgrades.crit)damage*=1.75;
 if(s.swapUntil>s.tick){damage*=1+.2*s.upgrades.swap;s.swapUntil=0;}
 const g=s.growth[w.kind];
 if(!ranged)melee(s,w,target,damage,v.range);
 else {
 const angle=Math.atan2(target.y-s.player.y,target.x-s.player.x);
 for(let i=0;i<count;i++){
 const remaining=w.kind==='bow'?1+s.upgrades.mod_bow_2+(g.branch===1?3:0):w.kind==='gun'&&g.branch===1?4:w.kind==='lightning'?3+s.upgrades.mod_lightning_1+(g.branch===0?3:0):1;
 const b=makeShot(s,angle+(i-(count-1)/2)*.13,w.kind,damage,remaining,v.range);
 b.bounce=w.kind==='gun'?s.upgrades.mod_gun_2:0;b.armor=w.kind==='gun'&&g.branch===1;
 b.chain=120*(1+.15*s.upgrades.range);b.overload=w.kind==='lightning'?s.upgrades.mod_lightning_2:0;
 if(w.kind==='lightning'&&g.branch===1){b.armor=true;b.remaining+=2;}
 s.shots.push(b);
 }w.ammo--;
 }
 if(w.burst>0){w.burst--;w.burstIn=6;}
 else {w.cooldown=v.interval;if(w.kind==='bow'&&g.branch===0){w.burst=2;w.burstIn=6;}}
}
export function collectWeapon(s:RunSnapshot,drop:WeaponDrop):boolean{
 if(drop.kind==='medical'){if(s.hp>=s.maxHp)return false;s.hp=Math.min(s.maxHp,s.hp+1);}
 else if(drop.kind==='ammo')supply(s);
 else if(s.weapons.some(w=>w.kind===drop.kind))supply(s,ARSENAL[drop.kind].initial?drop.kind:undefined);
 else if(s.weapons.length<2)s.weapons.push(createWeapon(drop.kind));
 else {if(s.replacement)return false;s.replacement=drop.kind;}
 s.events.push({type:'weapon'});return true;
}
export function releaseVolley(s:RunSnapshot):void{
 const count=s.shots.filter(b=>!b.released).length+s.marks.length;s.shots.forEach(b=>b.released=true);
 // Marks already contain resolved direct damage, so shield/critical modifiers must not run twice.
 for(const m of s.marks){const e=s.enemies.find(e=>e.id===m.target);if(e&&e.hp>0)e.hp-=m.damage;}s.marks=[];
 if(count){s.events.push({type:'volley',value:count});s.feedback.push({type:'volley',at:{...s.player},radius:60,until:s.tick+18});}
}
export function echo(s:RunSnapshot):void{
 const gun=s.weapons.find(w=>w.kind==='gun');
 if(gun&&s.upgrades.reload){const n=Math.min(gun.reserve,magazineSize(s)-gun.ammo,Math.ceil(magazineSize(s)*[0,.25,.5,1][s.upgrades.reload]));gun.ammo+=n;gun.reserve-=n;if(gun.ammo)gun.reload=0;}
 if(!s.upgrades.echo||s.shots.length+8>COMBAT.maxShots)return;
 for(let i=0;i<8;i++)s.shots.push(makeShot(s,i*Math.PI/4,'echo',s.repaidTicks/HZ*.5*s.upgrades.echo,1));
}
export function advanceShots(s:RunSnapshot,previous:Map<number,Point>):void{
 for(const b of s.shots){
 const old={x:b.x,y:b.y};b.x+=b.vx/HZ;b.y+=b.vy/HZ;b.life--;if(b.range!==undefined)b.range-=Math.hypot(b.vx,b.vy)/HZ;
 const targets=s.enemies.filter(e=>e.hp>0&&e.phase!=='spawn'&&!b.hitIds.includes(e.id)&&sweptCircle(old,b,previous.get(e.id)??e,e,b.radius+e.radius))
 .sort((a,c)=>((a.x-old.x)*b.vx+(a.y-old.y)*b.vy)-((c.x-old.x)*b.vx+(c.y-old.y)*b.vy)||a.id-c.id);
 for(const target of targets){
 if(b.remaining<=0||target.hp<=0)continue;
 damageEnemy(s,target,b.damage,old,b.armor?1:0,b.knockback);b.hitIds.push(target.id);b.remaining--;
 if(b.frozen&&b.cold>0&&!b.exploded){b.exploded=true;blast(s,target,32+8*b.cold,b.damage*.5*b.cold,target.id);}
 if(b.overload){target.overload=(target.overload??0)+1;if(target.overload>=3){target.overload=0;blast(s,target,55,b.damage*.25*b.overload);}}
 if(b.kind==='lightning'){
 let from:Point=target;
 while(b.remaining>0){const next=nearest(s,from,b.chain??COMBAT.chainRadius,b.hitIds);if(!next)break;damageEnemy(s,next,b.damage,from);b.hitIds.push(next.id);b.remaining--;
 s.feedback.push({type:'chain',from:{x:from.x,y:from.y},at:{x:next.x,y:next.y},radius:0,until:s.tick+12});from=next;}
 s.events.push({type:'chain'});b.remaining=0;
 }else if(b.remaining===0&&b.bounce){const next=nearest(s,target,120,b.hitIds);if(next){const angle=Math.atan2(next.y-target.y,next.x-target.x);b.x=target.x;b.y=target.y;b.vx=Math.cos(angle)*COMBAT.shotSpeed;b.vy=Math.sin(angle)*COMBAT.shotSpeed;b.bounce--;b.remaining=1;break;}}
 }
 }
 s.shots=s.shots.filter(b=>b.life>0&&b.remaining>0&&(b.range===undefined||b.range>0)&&b.x>-50&&b.x<1010&&b.y>20&&b.y<460);
}

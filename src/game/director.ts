import { COMBAT, HZ, RULES } from './balance';
import { random } from './patterns';
import { ARSENAL, FAMILIES } from './arsenal';
import type { Enemy, EnemyKind, Point, RunSnapshot, WeaponKind, WeaponDrop } from './types';

export function threatLimit(tick: number): number { return tick < 60*HZ ? 4 : tick < 180*HZ ? 8 : Math.min(32,8+4*Math.floor(tick/(180*HZ))); }
export const threatUsed = (s: RunSnapshot) => s.enemies.reduce((sum, e) => sum + (e.boss?0:e.cost), 0);
export function makeEnemy(s: RunSnapshot, kind: EnemyKind, at: Point, elite = false): Enemy {
  const base = COMBAT.enemies[kind], growth = Math.max(0, Math.floor(s.worldTick / (60*HZ)) - 2);
  const hp = base.hp * (1 + growth * 0.12) * (elite ? 3 : 1);
  return { ...at, id: s.nextId++, kind, hp, maxHp: hp, speed: base.speed * (1 + Math.min(0.35, growth*0.025)) * (elite ? 1.15 : 1),
    radius: elite ? 18 : 12, elite, cost: base.cost * (elite ? 4 : 1), phase: 'spawn', timer: COMBAT.spawnWarn, dx: 0, dy: 0, hitIds: [] };
}
function edgePoint(s: RunSnapshot, edges: number[]): Point | null {
  const f = RULES.field;
  for (let i=0; i<16; i++) {
    const edge = edges[Math.floor(random(s)*edges.length)], t = random(s);
    const p = edge < 2 ? { x: edge ? f.right-20 : f.left+20, y: f.top+20+t*(f.bottom-f.top-40) }
      : { x: f.left+20+t*(f.right-f.left-40), y: edge===2 ? f.top+20 : f.bottom-20 };
    if (Math.hypot(p.x-s.player.x,p.y-s.player.y)>=COMBAT.spawnDistance) return p;
  }
  return null;
}
function kinds(s:RunSnapshot):EnemyKind[]{
 const list:EnemyKind[]=['chaser'];for(const [kind,seconds] of [['charger',30],['shooter',60],['shield',120],['medic',240],['splitter',300],['miner',420]] as const)if(s.worldTick>=seconds*HZ)list.push(kind);return list;
}
function pickKind(s: RunSnapshot, pool: EnemyKind[]): EnemyKind {
  const weights:Record<EnemyKind,number> = {chaser:50,charger:30,shooter:20,shield:18,medic:12,splitter:20,miner:15,larva:0,breaker:0,artillery:0,weaver:0}; let value=random(s)*pool.reduce((n,k)=>n+weights[k],0);
  for (const k of pool) { value-=weights[k]; if (value<0) return k; } return pool[pool.length-1];
}
export function dropWeapon(s: RunSnapshot, at?: Point): boolean {
  if (s.drops.length >= COMBAT.maxDrops) return false;
  const history=s.director.weaponHistory;
  const pool: WeaponKind[] = [...FAMILIES];
  if (history.length>=2 && history[0]===history[1]) pool.splice(pool.indexOf(history[0]),1);
  const kind=pool[Math.floor(random(s)*pool.length)], f=RULES.field;
  const p=at??{x:f.left+60+random(s)*(f.right-f.left-120),y:f.top+40+random(s)*(f.bottom-f.top-80)};
  s.drops.push({...p,id:s.nextId++,kind,life:COMBAT.dropLife});
  s.director.weaponHistory=[history.at(-1)??kind,kind].slice(history.length?0:1); return true;
}
export function dropSupply(s:RunSnapshot,kind:WeaponDrop['kind'],at:Point=s.player):boolean{
 if(s.drops.length>=COMBAT.maxDrops)return false;
 const f=RULES.field;s.drops.push({id:s.nextId++,kind,x:Math.max(f.left+20,Math.min(f.right-20,at.x)),y:Math.max(f.top+20,Math.min(f.bottom-20,at.y)),life:COMBAT.dropLife});return true;
}
export function advanceDirector(s: RunSnapshot): void {
  const d=s.director;
  while(s.worldTick>=d.bossAt){d.bossQueue++;d.bossAt+=180*HZ;}
  const boss=s.enemies.some(e=>e.boss);
  if(d.bossQueue&&!boss){
   if(d.bossWarning<0){d.bossWarning=180;s.events.push({type:'boss'});}
   if(d.bossWarning>0)d.bossWarning--;
   else if(s.enemies.length<COMBAT.maxEnemies){
    const at=edgePoint(s,[0,1,2,3]);if(at){const kind=(['breaker','artillery','weaver'] as const)[d.bossIndex%3];const e=makeEnemy(s,kind,at);e.boss=true;e.cycle=Math.floor(d.bossIndex/3);e.hp=COMBAT.enemies[kind].hp*(1+.25*e.cycle);e.maxHp=e.hp;e.radius=25;e.timer=90;s.enemies.push(e);d.bossQueue--;d.bossIndex++;d.bossWarning=-1;}
   }
  }
  const limit=s.enemies.some(e=>e.boss)?Math.floor(threatLimit(s.worldTick)/2):threatLimit(s.worldTick);
  if(d.pendingDrops.length){const p=d.pendingDrops[0];if(p.kind?dropSupply(s,p.kind,p):dropWeapon(s,p))d.pendingDrops.shift();}
  const remote=s.weapons.filter(w=>ARSENAL[w.kind].initial>0),empty=remote.length>0&&remote.every(w=>w.ammo+w.reserve===0);
  d.emptyIn=empty?Math.max(0,d.emptyIn-1):300;
  if(--d.supplyIn<=0||empty&&d.emptyIn===0){
   if(s.drops.some(v=>v.kind==='ammo')||dropSupply(s,'ammo',{x:s.player.x+(s.player.x<480?70:-70),y:s.player.y})){d.supplyIn=900;d.emptyIn=300;}else d.supplyIn=1;
  }

  if (d.bossWarning<0 && s.worldTick>=d.eliteAt && !d.eliteKind && !s.enemies.some(e=>e.elite)) {
    const pool=kinds(s).filter(k=>COMBAT.enemies[k].cost*4<=limit);
    d.eliteKind=pool[Math.floor(random(s)*pool.length)];
  }
  if (d.bossWarning<0 && d.eliteKind && s.enemies.length<COMBAT.maxEnemies && threatUsed(s)+COMBAT.enemies[d.eliteKind].cost*4<=limit) {
    const at=edgePoint(s,[0,1,2,3]);
    if (at) { s.enemies.push(makeEnemy(s,d.eliteKind,at,true)); d.eliteKind=null; d.eliteAt=s.worldTick+COMBAT.eliteTicks; }
  }
  if (d.bossWarning<0 && --d.spawnIn<=0) {
    d.spawnIn=s.worldTick<60*HZ?240:s.worldTick<180*HZ?180:s.worldTick<360*HZ?150:120;
    const first=Math.floor(random(s)*4), edges=[first,(first+1+Math.floor(random(s)*3))%4];
    const count=1+Math.floor(random(s)*3);
    for (let i=0;i<count && s.enemies.length<COMBAT.maxEnemies;i++) {
      const free=limit-threatUsed(s)-(d.eliteKind?COMBAT.enemies[d.eliteKind].cost*4:0);
      const pool=kinds(s).filter(k=>COMBAT.enemies[k].cost<=free); if(!pool.length) break;
      const kind=pickKind(s,pool), at=edgePoint(s,edges); if(at) s.enemies.push(makeEnemy(s,kind,at));
    }
    s.wave++; s.patternId='combat'; s.events.push({type:'wave'});
  }
  if (--d.weaponIn<=0) d.weaponIn=dropWeapon(s)?COMBAT.weaponTicks:60;
  if (s.worldTick>=180*HZ && --d.mineIn<=0) {
    if (!s.mines.length) {
      const at=edgePoint(s,[0,1,2,3]);
      if(at) {
        const f=RULES.field,radius=54;
        at.x=Math.max(f.left+radius,Math.min(f.right-radius,at.x));at.y=Math.max(f.top+radius,Math.min(f.bottom-radius,at.y));
        s.mines.push({...at,id:s.nextId++,radius,warn:RULES.mineWarn,active:RULES.mineActive});
      }
      d.mineIn=COMBAT.mineTicks;
    } else d.mineIn=60;
  }
}

import { describe, expect, it } from 'vitest';
import assert from 'node:assert/strict';
import { COMBAT, HZ } from '../src/game/balance';
import { createRun, step, canRepay } from '../src/game/simulation';
import { advanceDirector, dropWeapon, makeEnemy, threatLimit, threatUsed } from '../src/game/director';
import { chooseUpgrade as chooseCard, prepareUpgrade, xpNeeded, chooseEvolution, chooseReplacement } from '../src/game/upgrades';
import { createWeapon, magazineSize } from '../src/game/arsenal';
import { advanceShots, collectWeapon, fire } from '../src/game/weapons';
import { advanceEnemies } from '../src/game/enemies';
import { SaveStore, SAVE_KEY, LEGACY_SAVE_KEY, defaults } from '../src/storage';
import type { EnemyKind, RunSnapshot, Shot, UpgradeId } from '../src/game/types';

function chooseUpgrade(s:RunSnapshot,id:UpgradeId,target?:RunSnapshot["weapons"][number]["kind"]){return chooseCard(s,id,target,s.draft?.options.find(c=>c.id===id)?.uid);}
function resolve(s:RunSnapshot){if(s.evolution.length)chooseEvolution(s,s.evolution[0],0);if(s.replacement)chooseReplacement(s,s.replacement,-1);if(s.choices.length)chooseUpgrade(s,s.choices[0],s.weapons[0].kind);}
function empty(seed=42) {const s=createRun(seed);s.wavesEnabled=false;return s;}
function ticks(s:RunSnapshot,count:number) {for(let i=0;i<count;i++)step(s);}
function enemy(s:RunSnapshot,x=650,y=238,kind:EnemyKind='chaser') {
  const e=makeEnemy(s,kind,{x,y});e.phase='move';e.speed=0;e.timer=10000;s.enemies.push(e);return e;
}
function shot(s:RunSnapshot,extra:Partial<Shot>={}):Shot {
  return {id:s.nextId++,x:600,y:238,vx:480,vy:0,radius:3,damage:1,remaining:1,kind:'base',life:120,
    hitIds:[],frozen:false,released:true,cold:0,exploded:false,...extra};
}
describe('生命与稳定伤害',()=>{
  it('三格生命，同步多个危险只扣一格，无敌精确持续一个人秒',()=>{
    const s=empty();s.bullets=[1,2,3].map(id=>({id,...s.player,vx:0,vy:0,radius:6}));
    step(s);expect(s.hp).toBe(2);expect(s.invulnerable).toBe(60);ticks(s,59);expect(s.hp).toBe(2);
    step(s);expect(s.hp).toBe(1);ticks(s,60);expect(s.alive).toBe(false);expect(s.summary?.level).toBe(1);
  });
  it('冻结接触怪物仍受伤，出生预警无接触伤害',()=>{
    const s=empty();const e=enemy(s,480);step(s,{x:0,y:0,borrow:true});expect(s.hp).toBe(2);expect(e.x).toBe(480);
    const b=empty();const spawn=makeEnemy(b,'chaser',b.player);b.enemies=[spawn];step(b);expect(b.hp).toBe(3);
  });
  it('还债第二子步致命时不发放击杀、经验、武器或清债收益',()=>{
    const s=empty();s.hp=1;s.mode='repay';s.debt=1;s.dueAt=100;s.pending=20;
    const e=enemy(s,610);e.hp=1;s.shots=[shot(s)];
    s.bullets=[{id:s.nextId++,x:521,y:238,vx:-900,vy:0,radius:6}];
    s.drops=[{id:s.nextId++,...s.player,kind:'gun',life:120}];step(s);
    expect(s.alive).toBe(false);expect(s.kills).toBe(0);expect(s.xp).toBe(0);expect(s.weapons[0].ammo).toBe(12);
    expect(s.score).toBe(0);expect(s.summary?.lostPending).toBe(40);expect(s.settlements).toBe(0);
  });
  it('冲锋互伤一次一个目标，击杀归属玩家，撞墙结束',()=>{
    const s=empty();s.player.y=100;const charger=enemy(s,590,238,'charger');charger.phase='charge';charger.timer=27;charger.dx=1;
    const target=enemy(s,610);target.hp=3;
    step(s);expect(s.kills).toBe(1);expect(s.score).toBe(10);expect(s.xp).toBe(1);
    const victim=enemy(s,charger.x+5);victim.hp=20;victim.maxHp=20;
    ticks(s,3);expect(victim.hp).toBe(17);
    charger.x=910;charger.phase='charge';charger.timer=20;step(s);expect(charger.phase).toBe('recover');
  });
  it('炮手和冲锋预警锁定方向，冻结不缩短预警',()=>{
    for(const kind of ['charger','shooter'] as const) {
      const s=empty();const e=enemy(s,650,238,kind);e.hp=1000;e.timer=1;step(s);expect(e.timer).toBe(90);expect(e.phase).toBe('warn');
      const direction=[e.dx,e.dy];step(s,{x:0,y:1,borrow:true});ticks(s,59);expect(e.timer).toBe(90);
      s.player.y=100;ticks(s,89);expect(e.phase).toBe('warn');expect([e.dx,e.dy]).toEqual(direction);
      step(s);expect(e.phase).toBe(kind==='charger'?'charge':'recover');
    }
  });
});
describe('冻结布弹和武器',()=>{
  it('第 14 帧拒绝提前还债，第 15 帧允许；守恒且齐射只释放一次',()=>{
    const s=empty();enemy(s).hp=100;s.weapons=[createWeapon('bow')];s.weapons[0].ammo=12;s.upgrades.mod_bow_1=3;
    step(s,{x:0,y:0,borrow:true});const b=structuredClone(s.shots[0]);ticks(s,13);expect(canRepay(s)).toBe(false);
    step(s,{x:0,y:0,repay:true});expect(s.mode).toBe('borrow');expect(s.debt).toBe(15);expect(canRepay(s)).toBe(true);
    expect(s.shots[0]).toEqual(b);expect(s.weapons[0].ammo).toBe(11);
    step(s,{x:0,y:0,repay:true});expect(s.mode).toBe('repay');expect(s.debt).toBe(14);
    expect(s.events.filter(e=>e.type==='volley')).toHaveLength(1);expect(s.shots[0].life).toBe(118);
    ticks(s,14);expect(s.debt).toBe(0);expect(s.tick-s.worldTick).toBe(0);expect(s.events.some(e=>e.type==='volley')).toBe(false);
    s.weapons[0].cooldown=0;step(s,{x:0,y:0,borrow:true});ticks(s,14);step(s,{x:0,y:0,repay:true});
    expect(s.events.find(e=>e.type==='volley')?.value).toBe(4);
  });
  it('冻结移动布弹保持每枚原点和方向，个人冷却不受还债加速影响',()=>{
    const s=empty();enemy(s);step(s,{x:0,y:0,borrow:true});const first=structuredClone(s.shots[0]);
    for(let i=0;i<48;i++)step(s,{x:0,y:1});expect(s.shots).toHaveLength(3);expect(s.shots[0]).toEqual(first);
    expect(s.shots[2].y).toBeGreaterThan(s.shots[1].y);expect(s.shots.every(b=>b.life===120)).toBe(true);
    const a=empty(),b=empty();enemy(a).hp=100;enemy(b).hp=100;b.mode='repay';b.debt=100;b.dueAt=480;
    ticks(a,48);ticks(b,48);expect(a.weapons[0].cooldown).toBe(b.weapons[0].cooldown);
  });
  it('无目标和容量不足不扣弹，散射一组扣一发，耗尽回基础弹',()=>{
    const s=empty();s.weapons=[createWeapon('bow')];s.weapons[0].ammo=1;s.upgrades.mod_bow_1=3;fire(s);expect(s.weapons[0].ammo).toBe(1);enemy(s);
    s.shots=Array.from({length:125},()=>shot(s));fire(s);expect(s.weapons[0].ammo).toBe(1);expect(s.weapons[0].cooldown).toBe(0);
    s.shots=[];fire(s);expect(s.shots).toHaveLength(4);expect(s.weapons[0].ammo).toBe(0);expect(s.weapons[0].kind).toBe('bow');
  });
  it('同距离目标按 ID 固定方向；同武器补弹封顶，异类替换',()=>{
    const s=empty();const left=enemy(s,400);enemy(s,560);s.enemies.reverse();fire(s);expect(s.shots[0].vx).toBeLessThan(0);expect(left.id).toBeLessThan(s.enemies[0].id);
    const d={id:90,x:0,y:0,kind:'gun' as const,life:120};collectWeapon(s,d);collectWeapon(s,d);collectWeapon(s,d);expect(s.weapons[0].reserve).toBe(93);
    expect(magazineSize(s)).toBe(12);
  });
  it('扫掠穿透不重复伤害；雷击从命中点链到三个不同目标',()=>{
    const s=empty();const e=enemy(s,650);s.shots=[shot(s,{vx:12000,kind:'gun',remaining:3,damage:2})];advanceShots(s,new Map());expect(e.hp).toBe(2);
    s.shots[0].x=600;advanceShots(s,new Map());expect(e.hp).toBe(2);
    const b=empty();[610,700,790,880].forEach(x=>enemy(b,x));b.shots=[shot(b,{kind:'lightning',remaining:3})];advanceShots(b,new Map());
    expect(b.enemies.map(e=>e.hp)).toEqual([3,3,3,4]);expect(b.shots).toHaveLength(0);
  });
  it('冷凝爆破只触发一次，不重复打直接目标；回响不爆炸',()=>{
    const s=empty();const a=enemy(s,610),b=enemy(s,635);s.shots=[shot(s,{frozen:true,cold:2,remaining:3})];
    advanceShots(s,new Map());expect(a.hp).toBe(3);expect(b.hp).toBe(3);expect(s.feedback.filter(f=>f.type==='blast')).toHaveLength(1);
    advanceShots(s,new Map());expect(s.feedback.filter(f=>f.type==='blast')).toHaveLength(1);
    const e=empty();e.upgrades.echo=2;e.upgrades.cold=3;step(e,{x:0,y:0,borrow:true});ticks(e,14);step(e,{x:0,y:0,repay:true});ticks(e,14);
    expect(e.shots).toHaveLength(8);expect(e.shots.every(b=>b.kind==='echo'&&b.damage===0.25&&b.cold===0)).toBe(true);
  });
  it('欠债击杀暂存，最后还债步击杀也翻倍，无债直接到账',()=>{
    const s=empty();s.mode='repay';s.debt=1;s.dueAt=100;const e=enemy(s,610);e.hp=1;s.shots=[shot(s)];step(s);
    expect(s.score).toBe(20);expect(s.pending).toBe(0);expect(s.xp).toBe(1);
    const a=empty();enemy(a,610).hp=1;a.shots=[shot(a)];step(a);expect(a.score).toBe(10);
  });
});
describe('升级与存档',()=>{
  it('选卡冻结所有时钟，不重复不含满级卡，多次升级排队',()=>{
    const s=empty();s.hp=1;s.upgrades.cold=3;s.xp=20;prepareUpgrade(s);
    expect(s.level).toBe(2);expect(new Set(s.choices).size).toBe(3);expect(s.choices).not.toContain('cold');
    const before={...structuredClone(s),events:[]};ticks(s,180);expect(s).toEqual(before);
    expect(chooseUpgrade(s,'cold')).toBe(false);expect(chooseUpgrade(s,s.choices[0])).toBe(true);expect(s.hp).toBeGreaterThanOrEqual(1);expect(s.level).toBe(3);expect(s.choices.length).toBe(3);
    chooseUpgrade(s,s.choices[0]);expect(s.hp).toBeGreaterThanOrEqual(1);expect(s.choices).toEqual([]);expect(s.xp).toBe(0);
  });
  it('v2 只导入 v1 设置，不改旧记录，新教学与分数独立',()=>{
    const legacy=JSON.stringify({...defaults(),version:1,tutorialDone:true,settings:{volume:0.7,muted:true,reducedMotion:true,lowQuality:true},best:{score:999},recent:[{score:999}]});
    const data=new Map([[LEGACY_SAVE_KEY,legacy]]),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
    const store=new SaveStore(storage);expect(store.data.settings.volume).toBe(0.7);expect(store.data.settings.muted).toBe(true);
    expect(store.data.tutorialDone).toBe(false);expect(store.data.best).toBeNull();expect(store.data.recent).toEqual([]);expect(data.get(LEGACY_SAVE_KEY)).toBe(legacy);
    expect(JSON.parse(data.get(SAVE_KEY)!).settings).toEqual(store.data.settings);expect(new SaveStore(storage).data).toEqual(store.data);
  });
});
describe('随机调度和长局边界',()=>{
  it('精英掉落满额时延后补发，爆雷仅在晚期出现且范围位于场内',()=>{
    const s=empty();s.drops=Array.from({length:8},()=>({id:s.nextId++,x:80,y:120,kind:'bow' as const,life:3600}));
    const e=enemy(s,610);e.elite=true;e.hp=1;s.shots=[shot(s)];step(s);
    expect(s.drops).toHaveLength(8);expect(s.director.pendingDrops).toHaveLength(2);
    s.drops.shift();advanceDirector(s);expect(s.director.pendingDrops).toHaveLength(1);expect(s.drops).toHaveLength(8);
    s.director.mineIn=1;s.worldTick=179*HZ;advanceDirector(s);expect(s.mines).toHaveLength(0);
    s.worldTick=225*HZ;advanceDirector(s);expect(s.mines).toHaveLength(1);
    const m=s.mines[0];expect(m.x-m.radius).toBeGreaterThanOrEqual(36);expect(m.y-m.radius).toBeGreaterThanOrEqual(84);expect(m.y+m.radius).toBeLessThanOrEqual(392);
  });
  it('地面武器寿命按世界时间推进，冻结保留，正常与还债按 1 / 2 步消耗',()=>{
    const s=empty();s.drops=[{id:90,x:80,y:120,kind:'bow',life:120}];step(s,{x:0,y:0,borrow:true});ticks(s,14);expect(s.drops[0].life).toBe(120);
    step(s,{x:0,y:0,repay:true});expect(s.drops[0].life).toBe(118);ticks(s,14);expect(s.drops[0].life).toBe(90);ticks(s,90);expect(s.drops).toHaveLength(0);
  });
  it('出生时靠近标记取消生成，保留延迟重选；精英预警不缩短',()=>{
    const s=empty();const e=makeEnemy(s,'chaser',{...s.player});e.timer=1;s.enemies=[e];advanceEnemies(s,true,s.player,()=>{});expect(s.enemies).toHaveLength(0);
    s.worldTick=20*60*HZ;const elite=makeEnemy(s,'charger',{x:80,y:130},true);expect(elite.timer).toBe(90);expect(elite.speed).toBeCloseTo(55*1.35*1.15);expect(elite.cost).toBe(8);
  });
  it('100 个种子跨 12 分钟调度：距离、预算、上限、精英与武器种类覆盖',()=>{
    const kinds=new Set<string>(),weapons=new Set<string>();let elites=0;
    for(let seed=0;seed<100;seed++) {
      const s=createRun(seed);let prior=new Set<number>();
      for(let second=0;second<720;second++) {
        s.worldTick=second*HZ;if(s.director.bossWarning>0)s.director.bossWarning=0;s.director.spawnIn=1;s.director.weaponIn=1;
        advanceDirector(s);
        assert.ok(threatUsed(s)<=threatLimit(s.worldTick));assert.ok(s.enemies.length<=16);assert.ok(s.drops.length<=8);assert.ok(s.mines.length<=1);
        assert.ok(s.enemies.filter(e=>e.elite).length<=1);
        for(const e of s.enemies) {kinds.add(e.kind);if(!prior.has(e.id)){assert.ok(Math.hypot(e.x-s.player.x,e.y-s.player.y)>=180);if(e.elite)elites++;}}
        prior=new Set(s.enemies.map(e=>e.id));
        for(const d of s.drops)weapons.add(d.kind);
        if(second%3===0)s.enemies.shift();s.drops=[];if(second%60===0)s.mines=[];
      }
    }
    expect(kinds.has('shield')).toBe(true);expect(kinds.has('weaver')).toBe(true);expect(weapons.size).toBeGreaterThanOrEqual(6);expect(elites).toBeGreaterThan(100);
  });
  it('武器不会连续三次相同，满地面时保持随机状态并推迟',()=>{
    const s=empty();let history:string[]=[];for(let i=0;i<200;i++){s.drops=[];dropWeapon(s);history.push(s.drops[0].kind);if(history.length>=3)expect(new Set(history.slice(-3)).size).toBeGreaterThan(1);}
    while(s.drops.length<8)dropWeapon(s);const rng=s.rng;expect(dropWeapon(s)).toBe(false);expect(s.rng).toBe(rng);
  });
  it('100 个种子同操作复现完整战斗，暂停、选卡、弹体数量和时间守恒',()=>{
    for(let seed=1;seed<=100;seed++) {
      const a=createRun(seed),b=createRun(seed);
      for(let tick=0;tick<1800;tick++) {
        const input={x:Math.cos(tick/140),y:Math.sin(tick/140),borrow:tick%180===0,repay:tick%180===25};
        for(const s of [a,b]) {
          resolve(s);
          step(s,input);
          assert.ok(s.enemies.length<=16&&s.shots.length<=128&&s.bullets.length<=96&&s.drops.length<=8&&s.mines.length<=1);
          if(s.alive)assert.equal(s.tick-s.worldTick,s.debt);
        }
      }
      expect(a).toEqual(b);
    }
  },30000);
  it('十五分钟完整模拟：成长、精英、稀疏爆雷与实体持续有界',()=>{
    const s=createRun(20261023);s.invulnerable=100000;const seen=new Set<string>();let elites=0,mines=0;
    for(let i=0;i<15*60*HZ;i++) {
      resolve(s);
      step(s,{x:Math.cos(i/180),y:Math.sin(i/180),borrow:i%240===0,repay:i%240===35});
      for(const e of s.enemies){seen.add(e.kind);if(e.elite)elites++;}if(s.mines.length)mines++;
      assert.ok(threatUsed(s)<=threatLimit(s.worldTick));assert.ok(s.enemies.length<=16&&s.shots.length<=128&&s.bullets.length<=96&&s.drops.length<=8&&s.mines.length<=1);
      assert.ok(s.director.pendingDrops.length<=8);assert.equal(s.tick-s.worldTick,s.debt);
    }
    expect(seen.size).toBeGreaterThanOrEqual(7);expect(elites).toBeGreaterThan(0);expect(mines).toBeGreaterThan(0);expect(s.level).toBeGreaterThan(3);expect(s.kills).toBeGreaterThan(30);
  });
});

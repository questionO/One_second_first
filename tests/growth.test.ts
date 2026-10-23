import {describe,it,expect} from 'vitest';
import {createRun,step} from '../src/game/simulation';
import {ARSENAL,createWeapon,FAMILIES,magazineSize} from '../src/game/arsenal';
import {chooseUpgrade,chooseEvolution,chooseReplacement,prepareUpgrade,rerollUpgrade,UPGRADES,legalCards,xpNeeded} from '../src/game/upgrades';
import {advancePersonal,fire,releaseVolley,switchWeapon,collectWeapon,advanceShots} from '../src/game/weapons';
import {advanceDirector,makeEnemy,dropSupply} from '../src/game/director';
import {advanceEnemies} from '../src/game/enemies';
import {advanceZones,specialAttack} from '../src/game/skills';
import {SaveStore,SAVE_KEY,PREVIOUS_SAVE_KEY,LEGACY_SAVE_KEY,defaults} from '../src/storage';
import type {RunSnapshot,UpgradeId,WeaponKind} from '../src/game/types';
const run=(kind:WeaponKind='gun')=>{const s=createRun(17,undefined,kind);s.wavesEnabled=false;return s;};
function draft(s:RunSnapshot,ids:UpgradeId[],picks=1,doubled=false){s.draft={id:s.nextId++,options:ids.map(id=>({id,uid:s.nextId++})),selected:[],remaining:picks,rerolls:1,doubled};s.choices=ids;}
function pick(s:RunSnapshot,id:UpgradeId,target?:WeaponKind){return chooseUpgrade(s,id,target,s.draft?.options.find(c=>c.id===id)?.uid);}
function target(s:RunSnapshot,x=520,y=238){const e=makeEnemy(s,'chaser',{x,y});e.phase='move';e.hp=100;e.maxHp=100;e.speed=0;e.timer=1000;s.enemies.push(e);return e;}
describe('43 张卡牌与确定性选卡',()=>{
 it('目录数量、随身武器约束、满级和无收益排除',()=>{const s=run();expect(Object.keys(UPGRADES)).toHaveLength(43);expect(legalCards(s)).toContain('train_gun');expect(legalCards(s)).not.toContain('train_bow');expect(legalCards(s)).not.toContain('heal');expect(legalCards(s)).not.toContain('overclock');s.upgrades.damage=3;expect(legalCards(s)).not.toContain('damage');});
 it('七选三双份提升，第三次才结束，无自动回血',()=>{const s=run();s.hp=1;draft(s,['damage','rhythm','range','crit','knockback','expand','doublePick'],3,true);const initial=s.tick;
 for(const id of ['damage','rhythm'] as const){expect(pick(s,id)).toBe(true);step(s);expect(s.tick).toBe(initial);expect(s.upgrades[id]).toBe(2);}
 expect(s.draft?.remaining).toBe(1);pick(s,'range');expect(s.draft).toBeNull();expect(s.upgrades.range).toBe(2);expect(s.hp).toBe(1);});
 it('策略卡只投资下一轮，不受超频复制；超限额度和超频顺延',()=>{const s=run();s.level=6;draft(s,['triplePick','survey','overclock'],3,true);pick(s,'triplePick');pick(s,'survey');pick(s,'overclock');expect(s.bonuses).toMatchObject({picks:2,options:4,doubles:1});s.bonuses.picks+=2;s.bonuses.options+=2;s.bonuses.doubles++;s.xp=xpNeeded(s.level);prepareUpgrade(s);expect(s.draft?.options).toHaveLength(7);expect(s.draft?.remaining).toBe(3);expect(s.draft?.doubled).toBe(true);expect(s.bonuses).toMatchObject({picks:2,options:2,doubles:1});});
 it('翻倍不会越过等级上限，不复制复活，双份补给不超过容量',()=>{const s=run();s.upgrades.damage=2;draft(s,['damage','revive','supply'],3,true);pick(s,'damage');pick(s,'revive');s.weapons[0].reserve=179;pick(s,'supply');expect(s.upgrades.damage).toBe(3);expect(s.upgrades.revive).toBe(1);expect(s.weapons[0].reserve).toBe(180);});
 it('武器双阶成长只产生一次进化，分支不消耗剩余选卡次数',()=>{const s=run();s.growth.gun.rank=5;draft(s,['train_gun','damage'],2,true);pick(s,'train_gun');expect(s.evolution).toEqual(['gun']);expect(s.draft?.remaining).toBe(1);expect(pick(s,'damage')).toBe(false);expect(chooseEvolution(s,'gun',8)).toBe(false);chooseEvolution(s,'gun',1);expect(s.growth.gun).toEqual({rank:6,branch:1});expect(chooseEvolution(s,'gun',0)).toBe(false);pick(s,'damage');expect(s.draft).toBeNull();});
 it('无效和重复实例调用不改变随机数或次数；重掷保留已选结果',()=>{const s=run();draft(s,['damage','rhythm','range'],2,true);const id=s.draft!.id,uid=s.draft!.options[0].uid;pick(s,'damage');const before=structuredClone(s);expect(chooseUpgrade(s,'damage',undefined,uid)).toBe(false);expect(s).toEqual(before);expect(rerollUpgrade(s,id+1)).toBe(false);expect(rerollUpgrade(s,id)).toBe(true);expect(s.upgrades.damage).toBe(2);expect(s.draft?.remaining).toBe(1);expect(s.draft?.doubled).toBe(true);expect(s.choices).not.toContain('damage');expect(rerollUpgrade(s,id)).toBe(false);});
 it('定向目标离场时使用当前合法武器；无合法成长则保留额度',()=>{const s=run();s.level=6;s.bonuses.focus=['bow'];s.xp=xpNeeded(s.level);prepareUpgrade(s);expect(s.draft?.options.some(c=>UPGRADES[c.id].family==='gun')).toBe(true);expect(s.bonuses.focus).toEqual([]);const b=run();b.growth.gun.rank=6;b.upgrades.mod_gun_1=b.upgrades.mod_gun_2=3;b.bonuses.focus=['bow'];b.xp=8;prepareUpgrade(b);expect(b.bonuses.focus).toEqual(['bow']);});
 it('100 种子：候选唯一、合法、策略不超过两张、过半战斗、结果复现',()=>{
 for(let seed=0;seed<100;seed++){const a=createRun(seed),b=createRun(seed);for(const s of [a,b]){s.level=6;s.hp=2;s.weapons.push(createWeapon('bow'));s.bonuses={options:4,picks:2,doubles:1,rerolls:1,focus:[]};s.xp=xpNeeded(6);prepareUpgrade(s);expect(s.choices.length).toBe(7);expect(new Set(s.choices).size).toBe(7);expect(s.choices.filter(id=>UPGRADES[id].strategy).length).toBeLessThanOrEqual(2);for(const id of s.choices)expect(legalCards(s)).toContain(id);}expect(a).toEqual(b);}
 });
});
describe('双武器、弹药和近战',()=>{
 it('六系均可攻击，近战冻结立即伤害且不耗弹药',()=>{for(const kind of FAMILIES){const s=run(kind),e=target(s);s.mode='borrow';fire(s);if(ARSENAL[kind].initial){expect(s.shots.length).toBeGreaterThan(0);expect(s.weapons[0].ammo).toBe(createWeapon(kind).ammo-1);}else {expect(e.hp).toBeLessThan(100);expect(s.weapons[0].ammo).toBe(0);}}});
 it('装填守恒、两个槽位冷却推进、切换不重置且取消未发连珠',()=>{const s=run();s.weapons.push(createWeapon('bow'));const w=s.weapons[0];w.ammo=0;w.reserve=20;w.cooldown=35;advancePersonal(s);expect(w.reload).toBe(72);switchWeapon(s);expect(w.cooldown).toBe(34);for(let i=0;i<72;i++)advancePersonal(s);expect(w.ammo).toBe(12);expect(w.reserve).toBe(8);expect(w.cooldown).toBe(0);const b=s.weapons[1];b.burst=2;switchWeapon(s);expect(b.burst).toBe(0);expect(switchWeapon(s)).toBe(false);});
 it('容量不足不扣弹、不消耗随机数，多重箭整组消耗一发',()=>{const s=run('bow');target(s);s.upgrades.mod_bow_1=3;fire(s);expect(s.shots).toHaveLength(4);expect(s.weapons[0].ammo).toBe(35);s.weapons[0].cooldown=0;s.shots=Array.from({length:125},(_,i)=>({...s.shots[0],id:100+i}));const before=s.rng;fire(s);expect(s.rng).toBe(before);expect(s.weapons[0].ammo).toBe(35);});
 it('耗尽时应急近战，所有远程耗尽五秒内生成补给',()=>{const s=run();const e=target(s);s.weapons[0].ammo=0;s.weapons[0].reserve=0;fire(s);expect(e.hp).toBeLessThan(100);expect(s.weapons[0].kind).toBe('gun');for(let i=0;i<300;i++)advanceDirector(s);expect(s.drops.filter(d=>d.kind==='ammo')).toHaveLength(1);});
 it('重复武器变补给，第三把暂停替换，成长保留',()=>{const s=run();collectWeapon(s,{id:1,kind:'bow',x:0,y:0,life:1});const ammo=s.weapons[1].ammo;collectWeapon(s,{id:2,kind:'bow',x:0,y:0,life:1});expect(s.weapons[1].ammo).toBe(ammo+9);s.growth.gun.rank=4;collectWeapon(s,{id:3,kind:'sword',x:0,y:0,life:1});step(s);expect(s.tick).toBe(0);expect(chooseReplacement(s,'sword',0)).toBe(true);expect(s.growth.gun.rank).toBe(4);expect(chooseReplacement(s,'sword',0)).toBe(false);});
 it('冻结斩痕解冻一次，护甲不重复计算，不递归',()=>{const s=run('sword'),e=target(s);s.mode='borrow';s.upgrades.marks=2;fire(s);const hit=100-e.hp;expect(s.marks).toHaveLength(1);releaseVolley(s);expect(e.hp).toBeCloseTo(100-hit*1.5);const hp=e.hp;releaseVolley(s);expect(e.hp).toBe(hp);});
 it('清债装填只转移备弹，医疗满血不拾取',()=>{const s=run();s.upgrades.reload=3;s.weapons[0].ammo=0;s.weapons[0].reserve=5;s.mode='repay';s.debt=1;s.dueAt=100;step(s);expect(s.weapons[0].ammo).toBe(5);expect(s.weapons[0].reserve).toBe(0);expect(collectWeapon(s,{id:1,kind:'medical',x:0,y:0,life:10})).toBe(false);});
 it('每轮攻击不重复近战伤害，冷却由个人时间决定',()=>{const s=run('sword'),e=target(s);fire(s);const hp=e.hp;fire(s);expect(e.hp).toBe(hp);expect(s.weapons[0].cooldown).toBeGreaterThan(0);});
});
describe('生命与敌人技能',()=>{
 it('护盾先吸收，最后一秒只生效一次',()=>{const s=run();s.shieldReady=true;s.upgrades.shield=1;s.hp=1;s.upgrades.revive=1;s.bullets=[{id:1,...s.player,vx:0,vy:0,radius:6}];step(s);expect(s.hp).toBe(1);expect(s.shieldReady).toBe(false);s.invulnerable=0;step(s);expect(s.reviveUsed).toBe(true);expect(s.invulnerable).toBe(120);s.invulnerable=0;step(s);expect(s.alive).toBe(false);});
 it('医师只治疗三个非医师普通目标，直接命中打断治疗',()=>{const s=run();const m=makeEnemy(s,'medic',{x:600,y:238});m.phase='warn';s.enemies.push(m);for(let i=0;i<5;i++){const e=target(s,610+i*10);e.hp=20;}specialAttack(s,m);expect(s.enemies.filter(e=>e.hp===35)).toHaveLength(3);});
 it('首领排队、唯一登场、冻结保持技能计时，击杀奖励暂存',()=>{const s=run();s.worldTick=10800;advanceDirector(s);expect(s.director.bossWarning).toBe(179);for(let i=0;i<180;i++)advanceDirector(s);const boss=s.enemies.find(e=>e.boss)!;expect(boss.kind).toBe('breaker');s.worldTick=32400;advanceDirector(s);expect(s.director.bossQueue).toBe(2);expect(s.enemies.filter(e=>e.boss)).toHaveLength(1);boss.phase='warn';boss.timer=90;advanceEnemies(s,false,s.player,()=>{});expect(boss.timer).toBe(90);s.drops=Array.from({length:8},(_,i)=>({id:100+i,x:60,y:100,kind:'ammo' as const,life:100}));boss.hp=0;step(s);expect(s.director.pendingDrops.filter(d=>d.kind)).toHaveLength(2);});
 it('分裂幼体不再分裂，范围危险同一步只扣一次',()=>{const s=run();const e=makeEnemy(s,'splitter',{x:700,y:238});e.hp=0;s.enemies=[e];step(s);expect(s.enemies.filter(e=>e.kind==='larva')).toHaveLength(2);s.zones=[1,2].map(id=>({id,...s.player,radius:30,warn:0,life:20,friendly:false,damage:1,hitIds:[]}));step(s);expect(s.hp).toBe(2);});
 it('100 种子十二分钟推进：出生安全、实体上限与首领技能覆盖',()=>{
 const seen=new Set<string>();for(let seed=0;seed<100;seed++){const s=createRun(seed);for(let sec=0;sec<720;sec++){
 s.worldTick=sec*60;s.director.spawnIn=1;if(s.director.bossWarning>0)s.director.bossWarning=0;advanceDirector(s);
 for(const e of s.enemies){seen.add(e.kind);expect(Math.hypot(e.x-s.player.x,e.y-s.player.y)).toBeGreaterThanOrEqual(180);}
 expect(s.enemies.length).toBeLessThanOrEqual(16);expect(s.drops.length).toBeLessThanOrEqual(8);expect(s.enemies.filter(e=>e.boss).length).toBeLessThanOrEqual(1);
 if(sec%5===0)s.enemies=[];s.drops=[];
 }}expect(seen.has('weaver')).toBe(true);expect(seen.has('miner')).toBe(true);
 },30000);
});
it('v3 优先导入 v2 设置，旧成绩与存档不修改，缺少 v2 时导入 v1',()=>{for(const useV2 of [true,false]){
 const data=new Map<string,string>();data.set(LEGACY_SAVE_KEY,JSON.stringify({...defaults(),version:1,settings:{volume:.1}}));if(useV2)data.set(PREVIOUS_SAVE_KEY,JSON.stringify({...defaults(),version:2,tutorialDone:true,settings:{volume:.8},best:{score:999}}));
 const before=new Map(data),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};const store=new SaveStore(storage);expect(store.data.settings.volume).toBe(useV2?.8:.1);expect(store.data.version).toBe(3);expect(store.data.best).toBeNull();expect(store.data.tutorialDone).toBe(false);for(const [k,v]of before)expect(data.get(k)).toBe(v);expect(new SaveStore(storage).data).toEqual(store.data);
}});

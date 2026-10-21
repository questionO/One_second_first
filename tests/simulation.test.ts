import { describe,it,expect } from 'vitest';
import assert from 'node:assert/strict';
import { createRun,step,borrowBlockReason,latestRepayIn } from '../src/game/simulation';
import { RULES, HZ } from '../src/game/balance';
import { PATTERNS,spawnWave } from '../src/game/patterns';
import { FixedClock } from '../src/game/clock';
import { sweptCircle,sweptRect } from '../src/game/collision';
import type { InputFrame,RunSnapshot } from '../src/game/types';

function empty() { const s=createRun(42);s.wavesEnabled=false;s.bullets=[];s.lasers=[];s.mines=[];s.coins=[];return s; }
function ticks(s:RunSnapshot,n:number,input:InputFrame={x:0,y:0}) { for(let i=0;i<n;i++)step(s,i===0?input:{x:input.x,y:input.y}); }
describe('时间借贷与收益',()=>{
 it('零收益还清不计为成功兑现',()=>{const s=empty();ticks(s,60,{x:0,y:0,borrow:true});ticks(s,60,{x:0,y:0,repay:true});expect(s.debt).toBe(0);expect(s.settlements).toBe(0);expect(s.score).toBe(0);});
 it('冻结一秒，玩家正常移动，机关不推进',()=>{
  const s=empty();s.bullets=[{id:8,x:100,y:100,vx:100,vy:0,radius:6}];const x=s.player.x;
  ticks(s,60,{x:1,y:0,borrow:true});
  expect(s.debt).toBe(60);expect(s.mode).toBe('normal');expect(s.player.x-x).toBeCloseTo(230);expect(s.worldTick).toBe(0);expect(s.bullets[0].x).toBe(100);expect(s.dueAt).toBe(480);
 });
 it('三次借时达到上限，不刷新期限，不允许第四次',()=>{
  const s=empty();for(let i=0;i<3;i++)ticks(s,60,{x:0,y:0,borrow:true});
  expect(s.debt).toBe(180);expect(s.dueAt).toBe(480);expect(borrowBlockReason(s)).toContain('已欠满');
  step(s,{x:0,y:0,borrow:true});expect(s.mode).toBe('normal');expect(s.borrowCount).toBe(3);
 });
 it('冻结期间连点不能延长本次冻结',()=>{const s=empty();for(let i=0;i<60;i++)step(s,{x:0,y:0,borrow:true});expect(s.borrowCount).toBe(1);expect(s.mode).toBe('normal');});
 it('五秒自动开始还债，八秒完全清零',()=>{
  const s=empty();for(let i=0;i<3;i++)ticks(s,60,{x:0,y:0,borrow:true});ticks(s,120);
  expect(s.tick).toBe(300);expect(latestRepayIn(s)).toBe(0);
  step(s,{x:0,y:0,borrow:true});expect(s.mode).toBe('repay');expect(s.events).toContainEqual({type:'repay',automatic:true});
  ticks(s,179);expect(s.tick).toBe(480);expect(s.debt).toBe(0);expect(s.mode).toBe('normal');expect(s.worldTick).toBe(480);
 });
 it('来不及新增冻结及还债时拒绝借时；边界恰好可借',()=>{
  const s=empty();ticks(s,60,{x:0,y:0,borrow:true});ticks(s,240);expect(s.tick).toBe(300);expect(borrowBlockReason(s)).toBe('');
  step(s);expect(borrowBlockReason(s)).toBe('即将到期');step(s,{x:0,y:0,borrow:true});expect(s.borrowCount).toBe(1);
 });
 it('主动还债连续执行，期间不能借时或取消',()=>{
  const s=empty();ticks(s,60,{x:0,y:0,borrow:true});
  const x=s.player.x;step(s,{x:1,y:0,repay:true,borrow:true});
  for(let i=1;i<60;i++)step(s,{x:1,y:0,borrow:true,repay:true});
  expect(s.worldTick).toBe(120);expect(s.player.x-x).toBeCloseTo(230);expect(s.debt).toBe(0);expect(s.borrowCount).toBe(1);
 });
 it('冻结金币暂存，清债后翻倍，重复拾取无效',()=>{
  const s=empty();s.coins=[0,1,2].map(id=>({id,x:480,y:238,risk:true}));ticks(s,60,{x:0,y:0,borrow:true});
  expect(s.score).toBe(0);expect(s.pending).toBe(30);expect(s.coins).toHaveLength(0);
  ticks(s,60,{x:0,y:0,repay:true});expect(s.score).toBe(60);expect(s.pending).toBe(0);expect(s.settlements).toBe(1);
  ticks(s,60);expect(s.score).toBe(60);
 });
 it('普通与还债拾取均为十分',()=>{
  const s=empty();s.coins=[{id:1,x:480,y:238,risk:false}];step(s);expect(s.score).toBe(10);
  ticks(s,60,{x:0,y:0,borrow:true});s.coins=[{id:2,x:480,y:238,risk:false}];step(s,{x:0,y:0,repay:true});expect(s.score).toBe(20);
 });
 it('死亡优先于拾取与同一步清债，保留已经到账分数',()=>{
  const s=empty();s.score=90;s.pending=30;s.mode='repay';s.debt=1;s.dueAt=30;
  s.coins=[{id:1,x:480,y:238,risk:false}];s.bullets=[{id:2,x:480,y:238,vx:0,vy:0,radius:6}];step(s);
  expect(s.alive).toBe(false);expect(s.score).toBe(90);expect(s.pending).toBe(0);expect(s.summary?.lostPending).toBe(60);expect(s.settlements).toBe(0);
 });
 it('冻结弹幕依旧致命',()=>{const s=empty();s.bullets=[{id:1,x:500,y:238,vx:0,vy:0,radius:6}];ticks(s,15,{x:1,y:0,borrow:true});expect(s.alive).toBe(false);expect(s.deathReason).toContain('冻结');});
 it('冻结中的活跃激光依旧致命',()=>{const s=empty();s.lasers=[{id:1,x:500,y:200,width:12,height:100,warn:0,active:36}];ticks(s,15,{x:1,y:0,borrow:true});expect(s.alive).toBe(false);expect(s.lasers[0].active).toBe(36);});
 it('高速弹幕跨越角色仍命中',()=>{const s=empty();s.bullets=[{id:1,x:400,y:238,vx:12000,vy:0,radius:6}];step(s);expect(s.alive).toBe(false);});
 it('暂停保持所有计时与实体不变',()=>{const s=empty();ticks(s,60,{x:0,y:0,borrow:true});s.paused=true;const before=structuredClone(s);ticks(s,600,{x:1,y:1,repay:true});expect({...s,events:[]}).toEqual({...before,events:[]});});
 it('斜向移动归一化',()=>{const s=empty(),x=s.player.x,y=s.player.y;ticks(s,10,{x:1,y:1});expect(Math.hypot(s.player.x-x,s.player.y-y)).toBeCloseTo(230/6);});
 it('每局重置所有债务、收益和实体',()=>{const a=empty();a.pending=999;a.debt=180;expect(createRun(42)).toEqual(createRun(42));expect(createRun(42).pending).toBe(0);});
 it('规则版本必须匹配',()=>expect(()=>createRun(1,'unknown')).toThrow());
});
describe('几何碰撞',()=>{
 it('扫掠圆检测相对移动',()=>{expect(sweptCircle({x:0,y:0},{x:100,y:0},{x:70,y:0},{x:20,y:0},2)).toBe(true);expect(sweptCircle({x:0,y:4},{x:100,y:4},{x:70,y:0},{x:20,y:0},2)).toBe(false);});
 it('矩形圆角不误判，穿越激光能检测',()=>{expect(sweptRect({x:0,y:5},{x:30,y:5},10,0,2,10,2)).toBe(true);expect(sweptRect({x:8.1,y:-1.9},{x:8.1,y:-1.9},10,0,2,10,2)).toBe(false);});
});
describe('帧率与确定性',()=>{
 it('随机借还序列始终守恒时间且不超额、不逾期',()=>{
  for(let seed=1;seed<=20;seed++) {
   const s=empty();let rng=seed;
   for(let i=0;i<3000;i++) {
    rng=(Math.imul(rng,1664525)+1013904223)>>>0;
    step(s,{x:0,y:0,borrow:rng%7===0,repay:rng%13===0});
    assert.equal(s.tick-s.worldTick,s.debt);
    assert.ok(s.debt>=0&&s.debt<=180);
    if(s.dueAt!==null)assert.ok(s.dueAt-s.tick>=s.debt);
   }
  }
 });
 it('冻结期间波次与金币有效期不流逝',()=>{
  const s=empty();s.wavesEnabled=true;s.waveLeft=1;s.coins=[{id:1,x:100,y:100,risk:false}];
  ticks(s,60,{x:0,y:0,borrow:true});expect(s.waveLeft).toBe(1);expect(s.coins[0].id).toBe(1);
  step(s);expect(s.coins).toHaveLength(6);expect(s.wave).toBe(2);
 });
 it('第二个加速子步死亡会取消第一个子步拾取',()=>{
  const s=empty();s.mode='repay';s.debt=2;s.dueAt=480;
  s.coins=[{id:1,x:480,y:238,risk:false}];s.bullets=[{id:2,x:510,y:238,vx:-900,vy:0,radius:6}];
  step(s);expect(s.alive).toBe(false);expect(s.score).toBe(0);expect(s.coins).toHaveLength(1);expect(s.events.some(e=>e.type==='coin')).toBe(false);
 });
 it('上轮清债后下一轮获得新的期限',()=>{
  const s=empty();ticks(s,60,{x:0,y:0,borrow:true});ticks(s,60,{x:0,y:0,repay:true});
  step(s,{x:0,y:0,borrow:true});expect(s.dueAt).toBe(600);expect(s.borrowCount).toBe(2);
 });
 function simulate(fps:number) {const s=empty(),c=new FixedClock();for(let i=0;i<fps*8;i++)c.advance(1000/fps,()=>step(s,{x:0,y:0,borrow:s.tick===0||s.tick===60||s.tick===120}));return s;}
 it('30/60/120 帧结果一致',()=>{expect(simulate(30)).toEqual(simulate(60));expect(simulate(120)).toEqual(simulate(60));});
 it('中断不补算，恢复不保留积压',()=>{const c=new FixedClock();let n=0;c.advance(10,()=>n++);expect(c.advance(300,()=>n++)).toBe(false);c.advance(10,()=>n++);expect(n).toBe(0);});
 it('相同种子和输入可复现波次',()=>{const a=createRun(99),b=createRun(99);for(let i=0;i<12000;i++){const input={x:0,y:0};step(a,input);step(b,input);}expect(a).toEqual(b);});
});
describe.each(PATTERNS.filter(p=>p.kind!=='mines'&&p.kind!=='gates'))('$name 的传统安全带路线',p=>{
 it.each([false,true])('安全带横穿路线，加速=%s',accelerated=>{
  const s=empty();s.worldTick=120*HZ;spawnWave(s,p.id);
  const duration=s.waveLeft;
  for(let i=0;i<duration;i++){
    if(accelerated && s.mode==='normal'){s.mode='repay';s.debt=180;s.dueAt=s.tick+480;}
    const targetY=i<30?s.safeY:s.safeY-28;
    step(s,{x:s.player.x>850?-1:s.player.x<100?1:(i<120?1:-1),y:Math.max(-1,Math.min(1,(targetY-s.player.y)/3))});
    expect(s.alive).toBe(true);expect(s.bullets.length+s.lasers.length).toBeLessThanOrEqual(48);
  }
  expect(s.score).toBeGreaterThan(0);
 });
});
it.each(PATTERNS)('$name 换波清理所有旧机关，保留新波六枚金币',p=>{
 const s=empty();s.worldTick=120*HZ;spawnWave(s,p.id);const ids=new Set([...s.bullets,...s.lasers,...s.mines,...s.coins].map(e=>e.id));
 spawnWave(s);expect([...s.bullets,...s.lasers,...s.mines,...s.coins].every(e=>!ids.has(e.id))).toBe(true);expect(s.coins).toHaveLength(6);
});

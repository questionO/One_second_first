import {it,expect} from 'vitest';
import {SaveStore,SAVE_KEY} from '../src/storage';
import {createRun,summary} from '../src/game/simulation';
function memory(initial?:string){const data=new Map<string,string>();if(initial)data.set(SAVE_KEY,initial);return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};}
it('损坏存储恢复默认',()=>{const s=new SaveStore(memory('{invalid'));expect(s.data.best).toBeNull();expect(s.persistent).toBe(true);});
it('存储被阻止时仍能记录到内存',()=>{const s=new SaveStore({getItem:()=>{throw Error();},setItem:()=>{throw Error();}});s.record(summary(createRun(1)));expect(s.persistent).toBe(false);expect(s.data.recent).toHaveLength(1);});
it('按分数、时长排序，只保留最近二十局',()=>{const s=new SaveStore(memory());for(let i=0;i<30;i++)s.record({...summary(createRun(i)),score:i,ticks:i*60});expect(s.data.recent).toHaveLength(20);expect(s.data.best?.score).toBe(29);s.record({...summary(createRun(1)),score:29,ticks:3000});expect(s.data.best?.ticks).toBe(3000);});
it('无效历史和设置不会污染游戏',()=>{const s=new SaveStore(memory(JSON.stringify({version:1,tutorialDone:true,settings:{volume:-20},recent:[{score:'x'}],best:{score:2}})));expect(s.data.settings.volume).toBe(0);expect(s.data.recent).toEqual([]);expect(s.data.best).toBeNull();});
it('刷新后恢复设置、教学状态和正式纪录',()=>{const m=memory(),a=new SaveStore(m);a.data.settings.muted=true;a.data.settings.lowQuality=true;a.data.tutorialDone=true;a.record({...summary(createRun(99)),score:120});const b=new SaveStore(m);expect(b.data).toEqual(a.data);});
it('较低分数即使存活更久也不会替换最佳纪录',()=>{const s=new SaveStore(memory());s.record({...summary(createRun(1)),score:200,ticks:10});s.record({...summary(createRun(2)),score:100,ticks:60000});expect(s.data.best?.seed).toBe(1);});

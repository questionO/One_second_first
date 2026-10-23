import { random } from './patterns';
import { ARSENAL, canSupply, FAMILIES, supply, WEAPON_NAMES } from './arsenal';
import type { Card, RunSnapshot, UpgradeId, WeaponKind } from './types';
export { magazineSize } from './arsenal';
type Definition={name:string;description:string;max:number;family?:WeaponKind;strategy?:boolean;rare?:boolean};
export const UPGRADES={} as Record<UpgradeId,Definition>;
const mods:Record<WeaponKind,[string,string,string,string]>={
 gun:['扩容弹匣','弹匣容量每级 +25%。','跳弹弹头','每级增加一次跳弹，跳向 120 距离内未命中的目标。'],
 bow:['多重箭','每级额外一支扇形箭，整组消耗一支箭矢。','贯穿箭','每级多贯穿一个目标。'],
 sword:['延伸刀锋','每级斩击半径 +12%。','斩弹格挡','每次挥击清除范围内最多一级数量的敌弹。'],
 spear:['背向突刺','背后同步突刺，每级造成主攻击 25% 的伤害。','破甲枪尖','每级忽略盾卫减伤的三分之一。'],
 hammer:['震荡余波','延迟 0.3 世界秒产生余震，每级造成原伤害的 25%。','沉重打击','命中使敌人减速 30%，每级持续一世界秒。'],
 lightning:['电弧延伸','每级增加一个连锁目标。','过载电容','同一目标累计三次直接命中后爆炸，每级造成原伤害的 25%。'],
};
for(const family of FAMILIES){
 UPGRADES[`train_${family}`]={name:WEAPON_NAMES[family]+'研修',description:'武器升一阶；三阶进化，六阶选择终极分支。',max:5,family};
 for(const n of [1,2] as const)UPGRADES[`mod_${family}_${n}`]={name:mods[family][(n-1)*2],description:mods[family][(n-1)*2+1],max:3,family};
}
const add=(id:UpgradeId,name:string,description:string,max=3)=>UPGRADES[id]={name,description,max};
add('damage','强化打击','每级直接攻击伤害 +12%。');add('rhythm','稳态节拍','每级攻击间隔缩短 8%。');
add('range','延伸战线','每级索敌与射程、近战范围、电弧跳跃距离 +15%。');add('crit','精准破绽','每级暴击率 +5%，暴击伤害为 1.75 倍。');
add('knockback','冲击强化','每级击退距离 +20%。');add('pickup','磁力拾取','每级拾取范围 +25%。');
add('health','生命容器','生命上限 +1；不立即治疗。',2);add('shield','再生护盾','抵挡一次伤害；20 / 16 / 12 个人秒后再生。');
add('sustain','浴血恢复','每 60 / 45 / 30 次击杀恢复一格生命。');add('revive','最后一秒','本局一次：致命伤保留一格生命，无敌两个人秒。',1);
add('cold','冷凝爆破','冻结弹首次命中爆炸，每级增加范围和伤害，不重复伤害直接目标。');
add('echo','清债回响','清债时八向反击，伤害随偿还时长与等级增加。');add('stride','还债步伐','每级还债移动速度 +8%。');
add('marks','冻结斩痕','冻结近战留下 25% / 50% / 75% 伤害的斩痕，解冻结算。');
add('reload','清债装填','清债从备弹填充弹匣的 25% / 50% / 100%。');add('swap','切换强击','切换后首次攻击 +20% / 40% / 60%，两秒有效，三秒触发间隔。');
add('heal','紧急医疗','恢复两格生命。',Infinity);add('supply','战地补给','为携带的远程武器补充一份弹药。',Infinity);
for(const [id,name,description,rare] of [
 ['doublePick','双选契约','下一轮多选一张。',false],['triplePick','连选契约','下一轮多选两张。',true],
 ['expand','拓展视野','下一轮增加两个候选。',false],['survey','博览契约','下一轮增加四个候选。',true],
 ['overclock','超频成长','下一轮全部战斗卡双份提升；受上限约束，不强化策略卡与一次性能力。',true],
 ['reroll','命运重掷','下一轮获得一次免费重掷。',false],['focus','定向研修','指定携带武器，下一轮保证一张该系成长卡。',false],
] as const)UPGRADES[id]={name,description,max:Infinity,strategy:true,rare};
export const xpNeeded=(level:number)=>8+4*(level-1);
export const initialUpgrades=()=>Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0])) as Record<UpgradeId,number>;
export function legalCards(s:RunSnapshot):UpgradeId[]{return (Object.keys(UPGRADES) as UpgradeId[]).filter(id=>{
 const d=UPGRADES[id];if(d.rare&&s.level<5)return false;
 if(d.family&&!s.weapons.some(w=>w.kind===d.family))return false;
 if(id.startsWith('train_'))return s.growth[d.family!].rank<6;
 if(id==='heal')return s.hp<s.maxHp;
 if(id==='supply')return canSupply(s);
 if(id==='focus')return s.weapons.some(w=>hasGrowth(s,w.kind));
 return s.upgrades[id]<d.max;
});}
function hasGrowth(s:RunSnapshot,k:WeaponKind){return s.growth[k].rank<6||s.upgrades[`mod_${k}_1`]<3||s.upgrades[`mod_${k}_2`]<3;}
function draw(s:RunSnapshot,pool:UpgradeId[]):UpgradeId{
 let value=random(s)*pool.reduce((n,id)=>n+(UPGRADES[id].strategy?(UPGRADES[id].rare?.25:1):4),0);
 for(const id of pool){value-=UPGRADES[id].strategy?(UPGRADES[id].rare?.25:1):4;if(value<0)return id;}return pool[pool.length-1];
}
function options(s:RunSnapshot,count:number,exclude:UpgradeId[]=[],avoid:UpgradeId[]=[],focus?:WeaponKind):Card[]{
 let pool=legalCards(s).filter(id=>!exclude.includes(id));const fresh=pool.filter(id=>!avoid.includes(id));
 if(fresh.length>=count&&fresh.filter(id=>!UPGRADES[id].strategy).length>=Math.ceil(count/2))pool=fresh;
 const result:Card[]=[];
 const strategyLimit=Math.max(0,Math.min(2-exclude.filter(id=>UPGRADES[id].strategy).length,Math.floor(count/2),pool.filter(id=>!UPGRADES[id].strategy).length));
 const take=(id:UpgradeId)=>{result.push({uid:s.nextId++,id});pool=pool.filter(k=>k!==id);};
 if(focus){const wanted=pool.filter(id=>UPGRADES[id].family===focus);if(wanted.length)take(draw(s,wanted));}
 while(result.length<count&&pool.length){
   const strategies=result.filter(c=>UPGRADES[c.id].strategy).length;
   const candidates=pool.filter(id=>!UPGRADES[id].strategy||strategies<strategyLimit);
   if(!candidates.length)break;take(draw(s,candidates));
 }return result;
}
function sync(s:RunSnapshot){s.choices=s.draft?.options.map(c=>c.id)??[];}
export function prepareUpgrade(s:RunSnapshot):void{
 if(s.draft||s.evolution.length||s.replacement||!s.alive||s.xp<xpNeeded(s.level))return;
 if(!legalCards(s).some(id=>!UPGRADES[id].strategy))return;
 s.xp-=xpNeeded(s.level);s.level++;
 const b=s.bonuses,extra=Math.min(4,b.options),picks=Math.min(2,b.picks);
 let focus:WeaponKind|undefined;
 if(b.focus.length){const requested=b.focus[0];focus=s.weapons.some(w=>w.kind===requested)&&hasGrowth(s,requested)?requested:s.weapons.find(w=>hasGrowth(s,w.kind))?.kind;if(focus)b.focus.shift();}
 const cards=options(s,3+extra,[],[],focus);
 const usedOptions=Math.max(0,cards.length-3),usedPicks=Math.min(picks,Math.max(0,cards.length-1));
 b.options-=usedOptions;b.picks-=usedPicks;
 s.draft={id:s.nextId++,options:cards,selected:[],remaining:1+usedPicks,rerolls:b.rerolls,doubled:b.doubles>0,focus};
 b.rerolls=0;if(b.doubles)b.doubles--;sync(s);s.events.push({type:'upgrade'});
}
export function cardPreview(s:RunSnapshot,c:Card):string{
 const d=UPGRADES[c.id];if(d.strategy)return d.description;
 const times=s.draft?.doubled&&c.id!=='revive'?2:1;
 if(c.id==='heal')return `恢复 ${Math.min(s.maxHp-s.hp,2*times)} 格生命`;
 if(c.id==='supply')return `补充 ${times} 份弹药（不超过容量）`;
 const before=c.id.startsWith('train_')?s.growth[d.family!].rank:s.upgrades[c.id];
 const max=c.id.startsWith('train_')?6:d.max;return `${before} → ${Math.min(max,before+times)} 级 · ${d.description}`;
}
function apply(s:RunSnapshot,id:UpgradeId,target?:WeaponKind){
 if(id==='doublePick')s.bonuses.picks++;else if(id==='triplePick')s.bonuses.picks+=2;
 else if(id==='expand')s.bonuses.options+=2;else if(id==='survey')s.bonuses.options+=4;
 else if(id==='overclock')s.bonuses.doubles++;else if(id==='reroll')s.bonuses.rerolls++;
 else if(id==='focus')s.bonuses.focus.push(target!);
 else if(id==='heal')s.hp=Math.min(s.maxHp,s.hp+2);else if(id==='supply')supply(s);
 else if(id.startsWith('train_')){const k=UPGRADES[id].family!,g=s.growth[k];g.rank=Math.min(6,g.rank+1);s.upgrades[id]=g.rank-1;if(g.rank===6&&g.branch===null&&!s.evolution.includes(k))s.evolution.push(k);}
 else if(s.upgrades[id]<UPGRADES[id].max){s.upgrades[id]++;if(id==='health')s.maxHp++;if(id==='sustain'&&s.upgrades.sustain===1)s.sustainKills=0;if(id==='shield'&&s.upgrades.shield===1)s.shieldReady=true;}
}
export function chooseUpgrade(s:RunSnapshot,id:UpgradeId,target?:WeaponKind,uid?:number):boolean{
 const d=s.draft,c=d?.options.find(c=>c.id===id&&c.uid===uid);
 if(!s.alive||!d||!c||s.evolution.length||s.replacement||!legalCards(s).includes(id))return false;
 if(id==='focus'&&(!target||!s.weapons.some(w=>w.kind===target)||!hasGrowth(s,target)))return false;
 const times=d.doubled&&!UPGRADES[id].strategy&&id!=='revive'?2:1;
 for(let i=0;i<times;i++)apply(s,id,target);
 d.selected.push(id);d.options=d.options.filter(c=>c.id!==id);d.remaining--;
 // Dependent consumables can become useless after a previous pick.
 d.options=d.options.filter(c=>legalCards(s).includes(c.id));
 if(d.remaining>0&&d.options.length<d.remaining){const extra=options(s,d.remaining-d.options.length,[...d.selected,...d.options.map(c=>c.id)]);d.options.push(...extra);}
 if(d.remaining<=0||!d.options.length)s.draft=null;
 sync(s);prepareUpgrade(s);return true;
}
export function rerollUpgrade(s:RunSnapshot,draftId:number):boolean{
 const d=s.draft;if(!s.alive||!d||d.id!==draftId||d.rerolls<=0||s.evolution.length||s.replacement)return false;
 d.options=options(s,d.options.length,d.selected,d.options.map(c=>c.id),d.focus);d.rerolls--;sync(s);return true;
}
export function chooseEvolution(s:RunSnapshot,kind:WeaponKind,branch:number):boolean{
 if(!s.alive||s.evolution[0]!==kind||(branch!==0&&branch!==1)||s.growth[kind].branch!==null)return false;
 s.growth[kind].branch=branch;s.evolution.shift();prepareUpgrade(s);return true;
}
export function chooseReplacement(s:RunSnapshot,kind:WeaponKind,slot:number):boolean{
 if(!s.alive||s.replacement!==kind||![-1,0,1].includes(slot)||slot>=s.weapons.length)return false;
 if(slot<0)supply(s);else {const a=ARSENAL[kind];s.weapons[slot]={kind,ammo:a.magazine||a.initial,reserve:a.magazine?a.initial-a.magazine:0,cooldown:0,reload:0,burst:0,burstIn:0,sequence:0};}
 s.replacement=null;prepareUpgrade(s);return true;
}

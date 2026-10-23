import Phaser from 'phaser';
import './style.css';
import { createRun, step, borrowBlockReason, canRepay, latestRepayIn } from './game/simulation';
import { HZ, RULES_VERSION } from './game/balance';
import { PATTERNS, spawnWave } from './game/patterns';
import { FixedClock } from './game/clock';
import type { RunSnapshot, InputFrame } from './game/types';
import { SaveStore } from './storage';
import { GameAudio } from './audio';
import { InputController } from './input';
import { ArenaScene } from './scene';
import { digits } from './digits';
import { chooseUpgrade, UPGRADES, xpNeeded, cardPreview, chooseEvolution, chooseReplacement, rerollUpgrade, prepareUpgrade } from './game/upgrades';
import { ARSENAL, createWeapon, decisionsPending, weaponName, WEAPON_NAMES } from './game/arsenal';
import { makeEnemy } from './game/director';
import type { UpgradeId, WeaponKind } from './game/types';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '<header class="site-header"><a class="brand" href="./" aria-label="先欠一秒首页"><span class="brand-icon">↶</span><span>先欠一秒<small>借来的奖励，要活着兑现。</small></span></a><div class="personal-best"><span>个人最佳</span><strong id="header-best">00000</strong></div></header>' +
 '<main><div id="cabinet" class="cabinet" data-mode="normal"><div id="canvas-host"></div><div id="time-veil" class="time-veil" aria-hidden="true" hidden></div>' +
 '<div class="hud" id="hud"><div class="score"><span class="eyebrow">本局得分</span><div id="score-number"></div></div><div class="escrow"><span class="eyebrow">待兑现</span><strong id="pending">0 <i>→</i> 0</strong></div><div class="debt"><div><span id="mode-label">时间正常</span><strong id="debt-number">0.0 秒</strong></div><div class="debt-meter"><i id="debt-fill"></i><b></b><b></b></div><small id="deadline">随时可以借一秒</small></div><button id="pause-button" class="icon-button" aria-label="暂停游戏">Ⅱ</button></div>' +
 '<div class="field-caption"><span id="wave-label">准备出发</span><span id="pattern-hint"></span><span id="world-label">00:00</span></div>' +
 '<div class="controls" id="controls"><div class="movement"><div id="joystick" class="joystick" aria-label="移动摇杆"><span class="joystick-cross"></span><i id="thumb"></i></div><div class="keyboard-hint"><kbd>W</kbd><div><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><small>移动</small></div></div><div class="action-buttons"><button id="switch-button" class="switch-button"><strong>切换武器</strong><small>Q</small></button><button id="borrow-button" class="borrow-button"><span class="button-symbol">❄</span><span><strong>借 1 秒</strong><small id="borrow-hint">空格</small></span></button><button id="repay-button" class="repay-button"><span class="button-symbol">»</span><span><strong>开始还债</strong><small id="repay-hint">E</small></span></button></div></div>' +
 '<div id="time-readout" class="time-readout" aria-hidden="true" hidden><strong id="time-state-label"></strong><div><b id="time-remaining"></b><span>秒</span><em id="time-rate"></em></div><small id="time-state-note"></small></div>' +
 '<div id="tutorial-banner" class="tutorial-banner" hidden></div><div id="toast" class="toast" role="status" aria-live="polite" hidden></div>' +
 '<div id="overlay" class="overlay"><section id="panel" class="panel" aria-label="游戏菜单"></section></div>' +
 '<div id="orientation" class="orientation" hidden><span>↻</span><h2>横过来，借一秒</h2><p>浏览器没有自动旋转？<br>点击下方按钮，再把手机横着拿。</p><button class="primary" data-action="landscape">直接横屏试玩</button><small>左手移动，右手掌控时间。</small></div>' +
 '<div id="debug" class="debug" hidden></div></div><div class="below"><span><i></i> 单人街机挑战</span><span id="storage-note">纪录保存在当前浏览器</span><button data-action="settings">声音与显示</button></div></main>' +
 '<footer>现在的一秒，未来来还。<span>移动 · 借时 · 活着兑现</span></footer>';
const el = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
el('cabinet').insertAdjacentHTML('beforeend','<div id="boss-label" class="boss-label" hidden></div><div class="combat-hud" id="combat-hud"><span id="health" aria-label="生命"></span><span id="weapon-label"></span><span id="level-label"></span><span id="combat-time"></span><span id="next-draft"></span><div class="xp-track"><i id="xp-fill"></i></div></div>');
let storage: Storage | null = null;
try { storage = window.localStorage; } catch {}
const saves = new SaveStore(storage);
if (matchMedia('(prefers-reduced-motion: reduce)').matches) saves.data.settings.reducedMotion = true;
const audio = new GameAudio(() => saves.data.settings);
const clock = new FixedClock();
let run = createRun(20261021);
let starter:WeaponKind='gun';
let focusCard:number|null=null;
type Screen = 'menu'|'play'|'tutorial'|'tutorial-failed'|'tutorial-complete'|'pause'|'result'|'settings'|'resume'|'upgrade'|'starter';
let screen: Screen = 'menu', returnFromSettings: Screen = 'menu';
let tutorialStep = 0, resumeAt = 0, unlockAt = 0, toastUntil = 0, lastHud = 0, lastScore = -1;
let lastDelta = 0, disposed = false, resultIsBest = false;
let forceLandscape = false, lastPortrait = isPortrait();
const overlay = el('overlay'), panel = el('panel'), borrowButton = el<HTMLButtonElement>('borrow-button'), repayButton = el<HTMLButtonElement>('repay-button');
const params = new URLSearchParams(location.search);
let debugEnabled = import.meta.env.DEV && params.has('debug');
const input = new InputController(el('joystick'),el('thumb'),borrowButton,repayButton,
  () => { if (screen==='play'||screen==='tutorial'||screen==='resume') pause('先喘口气'); else if(screen==='pause') resume(); },
  () => { if(screen==='menu') start(); else if(screen==='tutorial-complete'||(screen==='result'&&performance.now()>=unlockAt)) showStarter(); else if(screen==='pause') resume(); },
  () => document.body.classList.contains('forced-landscape'),el<HTMLButtonElement>('switch-button'));
const scene = new ArenaScene(() => run, () => saves.data.settings, frame, () => debugEnabled);
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'canvas-host', width: 960, height: 540, backgroundColor: '#101a3a',
  scene: [scene], audio: { noAudio: true }, render: { antialias: true, pixelArt: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60, smoothStep: false }, banner: false,
});
function newSeed(): number { return crypto.getRandomValues(new Uint32Array(1))[0]; }
function playing() { return screen==='play'||screen==='tutorial'; }
function formatTime(ticks:number) { const seconds=Math.floor(ticks/HZ); return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'); }
function refreshStorageNote() {
  el('storage-note').textContent = saves.persistent ? '纪录保存在当前浏览器' : '无法保存：纪录仅在本次打开期间保留';
  applySettings();
}
function toast(text:string, duration=1800) { el('toast').textContent=text; el('toast').hidden=false; toastUntil=performance.now()+duration; }
function setOverlay(content:string, compact=false) {
  input.setEnabled(false); run.paused=true; clock.reset(); overlay.hidden=false;
  panel.className='panel'+(compact?' compact':''); panel.innerHTML=content;
  panel.tabIndex=-1;
  requestAnimationFrame(()=>{
    if(overlay.hidden) return;
    const first=panel.querySelector<HTMLButtonElement>('button');
    (first&&!first.disabled?first:panel).focus({preventScroll:true});
  });
  updateHud();
}
function hideOverlay() { overlay.hidden=true; panel.innerHTML=''; }
function showMenu() {
  screen='menu'; run=createRun(20261021); run.paused=true; audio.stop(); input.clear();
  el('tutorial-banner').hidden=true;
  setOverlay('<div class="menu-layout"><div class="menu-copy"><div class="game-category"><span></span> 时间生存挑战</div><h1>先欠一秒</h1><p class="slogan">时间会来讨债。</p><p class="intro">冻结穿行布弹，解冻一瞬齐射。<br>击败怪群，选出属于你的时间流派。</p><div class="menu-actions"><button class="primary" data-action="start">开始挑战 <span>↗</span></button><button class="text-button" data-action="tutorial">练习一下</button></div><div class="menu-record">个人最佳 <b>'+String(saves.data.best?.score??0).padStart(5,'0')+'</b><span>三格生命 · 每局重新成长</span></div></div><div class="clock-art" aria-hidden="true"><div class="clock-orbit"></div><div class="clock-face"><small>可借时间</small>'+digits(1,2)+'<span class="clock-unit">秒</span><div class="clock-divider"></div><div class="clock-bottom"><span>现在<br><b>暂停</b></span><i>⇄</i><span>未来<br><b>加速 ×2</b></span></div></div><span class="orbit-chip chip-blue">借 1 秒</span><span class="orbit-chip chip-gold">活着兑现 ×2</span></div></div><div class="menu-rules"><span><b>01</b> 移动自动攻击</span><span><b>02</b> 冻结布弹</span><span><b>03</b> 清债升级</span><button class="text-button" data-action="settings">设置</button></div>');
  updateHud();
}
function start() { audio.unlock().catch(()=>{}); if(!saves.data.tutorialDone) startTutorial(0); else showStarter(); }
function showStarter(){
 if(orientationBlocked())return;el('tutorial-banner').hidden=true;
 screen='starter';setOverlay('<span class="section-marker">选择开局武器</span><h2>这次，用什么开场？</h2><div class="upgrade-cards">'+(['gun','bow','sword'] as const).map(k=>'<button class="upgrade-card" data-action="starter" data-kind="'+k+'"><strong>'+WEAPON_NAMES[k]+'</strong><span>'+(k==='sword'?'近身挥击，无需弹药':k==='bow'?'远距离强击，有限箭矢':'自动射击，弹匣自动装填')+'</span></button>').join('')+'</div>');panel.classList.add('upgrade-panel');
}
function startRun(seed=newSeed()) {
  if(orientationBlocked()) return;
  audio.unlock().catch(()=>{}); run=createRun(seed,RULES_VERSION,starter); screen='play'; input.clear(); input.setEnabled(true); hideOverlay(); clock.reset();
  el('tutorial-banner').hidden=true; el('toast').hidden=true; lastScore=-1; updateHud();
}
function tutorialSetup(index:number) {
  run=createRun(12345); run.tutorial=true; run.wavesEnabled=false;
  run.bullets=[]; run.lasers=[]; run.mines=[]; run.coins=[]; run.player={x:300,y:238}; run.waveLeft=999999;
  if(index===0) {
    const enemy=makeEnemy(run,'chaser',{x:580,y:270});enemy.phase='move';enemy.hp=2;enemy.speed=30;run.enemies=[enemy];
  }
  if(index===1) {
    run.drops=[{id:run.nextId++,kind:'bow',x:420,y:238,life:36000}];
  }
  if(index===2) {
    run.weapons=[createWeapon('gun'),createWeapon('bow')];
    const enemy=makeEnemy(run,'charger',{x:620,y:280});enemy.phase='move';enemy.speed=20;enemy.hp=80;enemy.maxHp=80;enemy.timer=180;run.enemies=[enemy];
  }
  if(index===3){run.xp=8;run.growth.gun.rank=2;prepareUpgrade(run);run.draft!.options=[{uid:run.nextId++,id:'train_gun'}];run.choices=['train_gun'];}
  if(index===4){run.level=5;run.xp=xpNeeded(5);prepareUpgrade(run);run.draft!.options=[{uid:run.nextId++,id:'expand'}];run.choices=['expand'];}
}
function startTutorial(index=0) {
  if(orientationBlocked()) return;
  audio.unlock().catch(()=>{}); tutorialStep=index; tutorialSetup(index); screen='tutorial';
  input.clear();input.setEnabled(true);hideOverlay();clock.reset(); tutorialBanner();lastScore=-1;updateHud();if(index>=3)showUpgrade();
}
function tutorialBanner() {
  const messages=[
    '<b>1 / 5　先动起来</b><span>移动躲开怪物，靠近后会自动瞄准射击，击败眼前的追猎怪。</span>',
    '<b>2 / 5　拾取武器</b><span>走向右侧短弓道具，按 Q 或切换按钮使用副武器。远程耗尽时使用应急挥击。</span>',
    '<b>3 / 5　冻结布弹</b><span>借时后移动布弹，0.25 秒后可按 E 提前解冻还债。碰到怪物仍会受伤。</span>',
    '<b>4 / 5　武器成长</b><span>选择研修提升武器阶级，三阶进化、六阶选择分支。升级不再自动回血。</span>',
    '<b>5 / 5　投资下一轮</b><span>先选策略卡，再体验扩展候选、多选与超频。策略卡不增加当前轮的选择次数。</span>',
  ];
  el('tutorial-banner').innerHTML=messages[tutorialStep]+'<button data-action="skip-tutorial">跳过教学</button>';
  el('tutorial-banner').hidden=false;
}
function finishTutorial() {
  saves.data.tutorialDone=true;saves.persist();refreshStorageNote();screen='tutorial-complete';el('tutorial-banner').hidden=true;
  setOverlay('<div class="completion-icon">✓</div><h2>这笔时间，还清了。</h2><p>你已经学会了自动攻击、武器和冻结布弹。<br>真正的挑战，是知道什么时候该收手。</p><button class="primary" data-action="new-run">进入正式挑战</button>',true);
}
function showTutorialFailure() {
  screen='tutorial-failed';
  setOverlay('<span class="section-marker">练习不会影响纪录</span><h2>再试一次就好</h2><p>'+run.deathReason+'</p><button class="primary" data-action="retry-tutorial">重试当前步骤</button><button class="text-button" data-action="skip-tutorial">跳过教学</button>',true);
}
function pause(reason:string) {
  if(!playing() && screen!=='resume') return;
  screen='pause';run.paused=true;input.clear();audio.stop();clock.reset();
  setOverlay('<span class="section-marker">时间已暂停</span><h2>'+reason+'</h2><p>怪物、弹体、欠债和还债期限都会等你。</p><div class="stack-buttons"><button class="primary" data-action="resume">继续挑战</button><button class="secondary" data-action="settings">声音与显示</button><button class="text-button" data-action="home">返回首页</button></div>',true);
  updateHud();
}
function resume() {
  if(orientationBlocked()||screen!=='pause'||!run.alive) return;
  audio.unlock().catch(()=>{});
  screen='resume';resumeAt=performance.now()+1000;clock.reset();input.clear();
  setOverlay('<div class="resume-count">1</div><p>准备继续</p>',true);
}
function afterDecision(){
 if(decisionsPending(run)){showUpgrade();return;}
 if(run.tutorial&&tutorialStep===3){startTutorial(4);return;}
 if(run.tutorial&&tutorialStep===4){
  if(run.level===6){run.bonuses.picks=2;run.bonuses.doubles=1;run.xp=xpNeeded(run.level);prepareUpgrade(run);showUpgrade();return;}
  finishTutorial();return;
 }
 screen='pause';resume();
}
function showUpgrade(){
 if(!decisionsPending(run))return;
 screen='upgrade';input.clear();audio.stop();focusCard=null;
 let content='';
 if(run.evolution.length){const k=run.evolution[0];content='<span class="section-marker">六阶进化 · 不消耗选卡次数</span><h2>决定武器的终极形态</h2><div class="upgrade-cards">'+[0,1].map(b=>'<button class="upgrade-card" data-action="evolve" data-kind="'+k+'" data-branch="'+b+'"><strong>'+ARSENAL[k].names[b+2]+'</strong><span>'+branchDescription(k,b)+'</span></button>').join('')+'</div>';}
 else if(run.replacement){const k=run.replacement;content='<span class="section-marker">拾取 '+WEAPON_NAMES[k]+'</span><h2>留下哪两把？</h2><div class="upgrade-cards">'+run.weapons.map((w,i)=>'<button class="upgrade-card" data-action="replace" data-kind="'+k+'" data-slot="'+i+'"><strong>替换 '+weaponName(run,w.kind)+'</strong><span>已投资的阶级与强化在本局保留。</span></button>').join('')+'<button class="upgrade-card" data-action="replace" data-kind="'+k+'" data-slot="-1"><strong>分解为补给</strong><span>为携带的远程武器补充弹药。</span></button></div>';}
 else if(run.draft){const d=run.draft;content='<span class="section-marker">时间暂停 · Lv.'+run.level+'</span><h2>还可选 <b id="picks-left">'+d.remaining+'</b> 张'+(d.doubled?' · 战斗卡双份提升':'')+'</h2><p>已选 '+d.selected.length+' 张。'+(d.doubled?'本轮结束消耗超频，策略卡与一次性能力不翻倍。':'策略卡投资下一轮；升级不自动回血。')+'</p><div class="upgrade-cards '+(d.options.length>4?'many-cards':'')+'">'+d.options.map(c=>'<button class="upgrade-card '+(UPGRADES[c.id].strategy?'strategy-card':'')+'" data-action="upgrade" data-upgrade="'+c.id+'" data-uid="'+c.uid+'"><small>'+ (UPGRADES[c.id].strategy?'下一轮 · '+(UPGRADES[c.id].rare?'稀有策略':'策略'):d.doubled?'双份成长':'本局成长')+'</small><strong>'+UPGRADES[c.id].name+'</strong><span>'+cardPreview(run,c)+'</span></button>').join('')+'</div><div class="draft-actions"><button class="secondary" data-action="reroll" data-draft="'+d.id+'" '+(d.rerolls?'':'disabled')+'>重掷剩余候选 '+d.rerolls+'</button><span>下轮奖励：候选 +'+run.bonuses.options+' · 多选 +'+run.bonuses.picks+' · 超频 '+run.bonuses.doubles+'</span></div>';}
 setOverlay(content+(run.tutorial?'<button class="text-button" data-action="retry-tutorial">重试这一步</button><button class="text-button" data-action="skip-tutorial">跳过教学</button>':'')+'<button class="text-button" data-action="settings">声音与显示</button>');panel.classList.add('upgrade-panel');
}
function branchDescription(k:WeaponKind,b:number):string{
 const descriptions:Record<WeaponKind,string[]>={gun:['扩大弹匣，高速连续压制','提高伤害与射程，贯穿四个目标，忽略盾卫护甲'],bow:['每次连续发射三组箭，逐组消耗箭矢','射速降低，伤害与射程提高，额外贯穿三个目标'],sword:['前后交替挥击','攻击周身一整圈'],spear:['直线刺穿，保持长距离与背向突刺','枪尖绕身攻击'],hammer:['命中区域延迟产生额外余震','重击伤害增加，射速降低'],lightning:['额外连锁三个目标','电矛穿甲，命中后向额外两个目标放电']};return descriptions[k][b];
}
function showResult(record=true) {
  const result=run.summary!;
  if(record) resultIsBest=saves.record(result);refreshStorageNote();screen='result';unlockAt=performance.now()+400;
  el('tutorial-banner').hidden=true;
  const best = resultIsBest;
  setOverlay('<span class="section-marker">'+(best?'刷新个人纪录':'这一秒，没躲过去')+'</span><h2>下次，早点还。</h2><div class="result-digits">'+digits(result.score)+'</div><p class="death-reason">'+result.deathReason+'</p><div class="result-stats"><div><span>存活时间</span><b>'+formatTime(result.ticks)+'</b></div><div><span>成功兑现</span><b>'+result.settlements+' 次</b></div><div><span>未能带走</span><b class="gold">'+result.lostPending+' 分</b></div></div><p class=combat-result>击杀 '+result.kills+' · 最终等级 '+result.level+'</p><div class="stack-buttons"><button class="primary" data-action="new-run" disabled>再来一局</button><button class="secondary" data-action="same-run" disabled>重试同一局面</button><button class="text-button" data-action="home">返回首页</button></div><small class="result-best">个人最佳 '+(saves.data.best?.score??0)+' 分</small>',true);
}
function showSettings() {
  if(screen==='settings') return;
  if(playing()||screen==='resume') pause('调整一下节奏');
  returnFromSettings=screen;
  screen='settings';const s=saves.data.settings;
  setOverlay('<span class="section-marker">声音与显示</span><h2>按你的节奏来</h2><div class="settings-list"><label>音量<input id="volume" aria-label="音量" type="range" min="0" max="100" value="'+Math.round(s.volume*100)+'"></label><label>静音<input id="muted" type="checkbox" '+(s.muted?'checked':'')+'></label><label><span>减少动态效果<small>关闭震动感和强烈脉冲</small></span><input id="reducedMotion" type="checkbox" '+(s.reducedMotion?'checked':'')+'></label><label><span>轻量画面<small>减少粒子，降低渲染分辨率</small></span><input id="lowQuality" type="checkbox" '+(s.lowQuality?'checked':'')+'></label></div><button class="primary" data-action="close-settings">保存并返回</button>',true);
  for(const key of ['volume','muted','reducedMotion','lowQuality'] as const) el<HTMLInputElement>(key).addEventListener('input',()=>{
    if(key==='volume') saves.data.settings.volume=Number(el<HTMLInputElement>(key).value)/100;
    else saves.data.settings[key]=el<HTMLInputElement>(key).checked;
    if(saves.data.settings.muted) audio.stop();
    saves.persist();refreshStorageNote();
  });
}
function applySettings() {
  document.body.classList.toggle('reduced-motion',saves.data.settings.reducedMotion);
  el('cabinet').classList.toggle('low-quality',saves.data.settings.lowQuality);
  // Lower backing resolution while preserving the 960×540 world coordinates.
  const resolution=saves.data.settings.lowQuality?0.75:1;
  if(game.isBooted && game.renderer && game.canvas.width!==960*resolution) game.scale.setGameSize(960*resolution,540*resolution);
}
function isPortrait() { return matchMedia('(pointer: coarse)').matches && innerHeight>innerWidth; }
function orientationBlocked() { return isPortrait() && !forceLandscape; }
function checkOrientation() {
  const portrait=isPortrait(), blocked=orientationBlocked(), changed=portrait!==lastPortrait;
  lastPortrait=portrait;
  document.body.classList.toggle('forced-landscape',portrait&&forceLandscape);
  el('orientation').hidden=!blocked;
  panel.inert=blocked;
  if((blocked||changed) && (playing()||screen==='resume')) pause('调整握持后继续');
  if(game.isBooted && game.canvas) game.scale.refresh();
  updateHud();
}
function updateHud() {
  const boss=run.enemies.find(e=>e.boss);
  el('boss-label').hidden=!playing()||(!boss&&run.director.bossWarning<0);
  el('boss-label').textContent=boss?({breaker:'破阵者',artillery:'围猎炮台',weaver:'裂隙织者'} as Record<string,string>)[boss.kind]+' · '+Math.ceil(Math.max(0,boss.hp))+' / '+Math.ceil(boss.maxHp):'首领即将登场 · '+Math.ceil(run.director.bossWarning/60);
  el('combat-hud').hidden=!playing()||!!PATTERNS.find(p=>p.id===run.patternId);
  el('health').textContent='♥'.repeat(Math.max(0,run.hp))+'♡'.repeat(Math.max(0,run.maxHp-run.hp));
  el('health').setAttribute('aria-label','生命 '+run.hp+' / '+run.maxHp);
  el('weapon-label').textContent=run.weapons.map((w,i)=>(i===run.activeWeapon?'▶ ':'')+weaponName(run,w.kind)+' '+run.growth[w.kind].rank+'阶 '+(ARSENAL[w.kind].initial?(w.reload?'装填中':w.ammo+(w.kind==='gun'?'/'+w.reserve:'')):'∞')).join(' ｜ ');
  el<HTMLButtonElement>('switch-button').disabled=run.weapons.length<2||run.switchCooldown>0;
  el('level-label').textContent='Lv.'+run.level+' · '+run.kills+' 击杀';
  const next=run.bonuses;el('weapon-label').title='下轮：候选 +'+next.options+'，多选 +'+next.picks+'，超频 '+next.doubles;
  el('next-draft').textContent=next.options||next.picks||next.doubles?'下轮 '+Math.min(7,3+next.options)+'选'+Math.min(3,1+next.picks)+(next.doubles?' ×2':''):'';
  el('combat-time').textContent=formatTime(run.tick);
  el('xp-fill').style.width=Math.min(100,run.xp/xpNeeded(run.level)*100)+'%';
  if(lastScore!==run.score) { el('score-number').innerHTML=digits(run.score);lastScore=run.score; }
  el('pending').innerHTML=run.pending+' <i>→</i> '+run.pending*2;
  el('debt-number').textContent=(run.debt/HZ).toFixed(1)+' 秒';
  el('debt-fill').style.width=100*run.debt/180+'%';
  el('mode-label').textContent=run.mode==='borrow'?'❄ 时间已冻结':run.mode==='repay'?'» 正在还债':'时间正常';
  el('deadline').textContent=run.mode==='repay'?'危险加速 ×2，活着兑现':run.debt>0?'最迟 '+(latestRepayIn(run)/HZ).toFixed(1)+' 秒后开始还债':'随时可以借一秒';
  el('cabinet').dataset.mode=run.mode;
  const timeActive=playing()&&run.alive&&run.mode!=='normal', frozen=run.mode==='borrow';
  el('time-veil').hidden=!timeActive;el('time-readout').hidden=!timeActive;
  if(timeActive) {
    el('time-state-label').textContent=frozen?'时间冻结':'危险加速';
    el('time-remaining').textContent=((frozen?run.borrowLeft:run.debt)/HZ).toFixed(1);
    el('time-rate').textContent=frozen?'×0':'×2';
    el('time-state-note').textContent=frozen?'移动布弹 · 提前还债齐射':'撑到清零，奖励兑现';
  }
  borrowButton.querySelector('strong')!.textContent=frozen?'时间冻结':'借 1 秒';
  repayButton.querySelector('strong')!.textContent=run.mode==='repay'?'偿还中 ×2':'开始还债';
  el('cabinet').classList.toggle('not-playing',!playing());
  for(const id of ['hud','controls','tutorial-banner']) el(id).inert=!playing()||run.paused||orientationBlocked();
  el('header-best').textContent=String(saves.data.best?.score??0).padStart(5,'0');
  const reason=borrowBlockReason(run);
  borrowButton.disabled=!playing()||!!reason;repayButton.disabled=!playing()||!canRepay(run);
  el('borrow-hint').textContent=reason||'空格';
  el('repay-hint').textContent=run.mode==='repay'?'不可中断':frozen&&run.borrowLeft>45?'冻结至少 0.25 秒':frozen?'E · 解冻齐射':run.debt>0?'E · 全部偿还':'暂无欠债';
  const pattern = PATTERNS.find(p=>p.id===run.patternId);
  el('wave-label').parentElement!.hidden=!pattern;
  el('wave-label').textContent=pattern?'第 '+run.wave+' 波 / '+pattern.name:'无尽生存 · '+run.enemies.length+' 个威胁';
  el('pattern-hint').textContent=run.tutorial?'':pattern?.kind==='mines'?'借时触碰菱形拆弹 · 每枚暂存 +30':pattern?.kind==='gates'?'封锁消失后，立刻换到下一条空白带':run.enemies.some(e=>e.elite)?'精英出现 · 借时布弹，清债反击':run.mines.length?'冻结碰核心可拆弹':'自动射击 · 冲锋怪能撞伤同伴';
  el('world-label').textContent=formatTime(run.tick);
  el('debug').hidden=!debugEnabled;
  if(debugEnabled) el('debug').textContent='seed '+run.seed+' | tick '+run.tick+' | world '+run.worldTick+' | debt '+run.debt+' | '+lastDelta.toFixed(1)+'ms | entities '+(run.bullets.length+run.lasers.length+run.mines.length);
}
function handleStep(frameInput:InputFrame) {
  step(run,frameInput);
  for(const event of run.events) {
    audio.play(event);
    if(event.type==='wave'&&run.patternId==='minefield') toast('借时触碰核心拆弹，清债后每枚 +60',2200);
    if(event.type==='wave'&&run.patternId==='shutters') toast('进入蓝边通道，等封锁消失再换轨',2200);
    if(event.type==='settle') { scene.celebrate();toast(event.value?'成功兑现 +'+event.value+' 分':'时间已还清',1400); }
    if(event.type==='disarm'&&event.value) { scene.celebrate();toast('拆弹成功！暂存 +'+event.value+'，还清后翻倍'); }
    if(event.type==='repay'&&event.automatic) toast('到期了，自动开始还债',1100);
    if(event.type==='weapon')toast('武器 / 补给已拾取',1000);
    if(event.type==='boss')toast('阶段首领即将登场！',3000);
    if(event.type==='volley') toast('解冻齐射！'+event.value+' 枚布弹释放',1000);
    if(event.type==='hurt'&&run.alive) toast('受到伤害 · 剩余 '+run.hp+' 格生命',1000);
  }
  if(!run.alive) {
    input.clear();
    if(screen==='tutorial') showTutorialFailure(); else showResult();
    return;
  }
  if(screen==='tutorial') {
    if(tutorialStep===0 && run.kills>0) { startTutorial(1);toast('自动攻击就是这么简单，现在去拾取武器。'); }
    else if(tutorialStep===1 && run.activeWeapon===1) { startTutorial(2);toast('已切换副武器！试试冻结布弹。'); }
    else if(tutorialStep===2 && run.settlements>0) startTutorial(3);
  }
  if(screen==='play'&&decisionsPending(run)) showUpgrade();
}
function frame(delta:number) {
  if(disposed) return;lastDelta=delta;
  const now=performance.now();
  if(screen==='resume' && now>=resumeAt) { screen=run.tutorial?'tutorial':'play';run.paused=false;hideOverlay();clock.reset();updateHud(); }
  input.setEnabled(playing()&&!run.paused);
  if(playing()&&!run.paused) {
    if(!clock.advance(delta,()=>{if(playing()&&!run.paused)handleStep(input.read());})) pause('画面刚刚中断了');
  } else clock.reset();
  if(screen==='result'&&now>=unlockAt) {
    const locked=panel.querySelectorAll<HTMLButtonElement>('button[disabled]');
    locked.forEach(b=>b.disabled=false);
    if(locked.length&&document.activeElement===panel) locked[0].focus({preventScroll:true});
  }
  if(now>=toastUntil) el('toast').hidden=true;
  if(now-lastHud>=70) { updateHud();lastHud=now; }
}
app.addEventListener('click',e=>{
  const target=(e.target as HTMLElement).closest<HTMLElement>('[data-action]');if(!target)return;
  const action=target.dataset.action;
  if((target as HTMLButtonElement).disabled)return;
  audio.unlock().catch(()=>{});
  if(action==='landscape'){forceLandscape=true;input.clear();checkOrientation();}
  if(action==='start')start();
  if(action==='new-run'&&(screen!=='result'||performance.now()>=unlockAt))showStarter();
  if(action==='starter'&&screen==='starter'){starter=target.dataset.kind as WeaponKind;startRun();}
  if(action==='same-run'&&performance.now()>=unlockAt)startRun(run.seed);
  if(action==='home')showMenu();
  if(action==='tutorial')startTutorial();
  if(action==='retry-tutorial')startTutorial(tutorialStep);
  if(action==='skip-tutorial'){saves.data.tutorialDone=true;saves.persist();refreshStorageNote();showStarter();}
  if(action==='resume')resume();
  if(action==='settings')showSettings();
  if(action==='upgrade'&&screen==='upgrade'){
    const id=target.dataset.upgrade as UpgradeId,uid=Number(target.dataset.uid);
    if(id==='focus'){
      focusCard=uid;setOverlay('<h2>指定下轮成长方向</h2><div class="upgrade-cards">'+run.weapons.filter(w=>run.growth[w.kind].rank<6||run.upgrades[`mod_${w.kind}_1`]<3||run.upgrades[`mod_${w.kind}_2`]<3).map(w=>'<button class="upgrade-card" data-action="focus-target" data-kind="'+w.kind+'"><strong>'+weaponName(run,w.kind)+'</strong><span>下一轮保证出现该系成长卡</span></button>').join('')+'</div><button class="text-button" data-action="back-cards">返回卡牌</button>');panel.classList.add('upgrade-panel');
    }else if(chooseUpgrade(run,id,undefined,uid))afterDecision();
  }
  if(action==='back-cards'&&screen==='upgrade')showUpgrade();
  if(action==='focus-target'&&screen==='upgrade'&&focusCard!==null&&chooseUpgrade(run,'focus',target.dataset.kind as WeaponKind,focusCard))afterDecision();
  if(action==='reroll'&&screen==='upgrade'&&rerollUpgrade(run,Number(target.dataset.draft)))showUpgrade();
  if(action==='evolve'&&screen==='upgrade'&&chooseEvolution(run,target.dataset.kind as WeaponKind,Number(target.dataset.branch)))afterDecision();
  if(action==='replace'&&screen==='upgrade'&&chooseReplacement(run,target.dataset.kind as WeaponKind,Number(target.dataset.slot)))afterDecision();
  if(action==='close-settings'){
    if(returnFromSettings==='upgrade') showUpgrade();
    else if(returnFromSettings==='pause'){screen=run.tutorial?'tutorial':'play';pause('先喘口气');}
    else if(returnFromSettings==='result') showResult(false);
    else if(returnFromSettings==='tutorial-failed') showTutorialFailure();
    else if(returnFromSettings==='tutorial-complete') finishTutorial();
    else showMenu();
  }
});
el('pause-button').addEventListener('click',()=>pause('先喘口气'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('回来再继续');});
window.addEventListener('blur',()=>pause('回来再继续'));
window.addEventListener('resize',checkOrientation);
window.addEventListener('pagehide',()=>{disposed=true;audio.destroy();input.destroy();game.destroy(true);});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
window.addEventListener('keydown',e=>{if(import.meta.env.DEV&&e.code==='Backquote'){debugEnabled=!debugEnabled;updateHud();}});
game.events.once('ready',applySettings);
if(import.meta.env.DEV && params.has('test')) {
  Object.assign(window,{__game:{
    snapshot:()=>structuredClone(run), screen:()=>screen, start:(seed=42)=>startRun(seed), pause:()=>pause('测试暂停'),
    patch:(v:Partial<RunSnapshot>)=>{Object.assign(run,v);updateHud();},
    advance:(count:number,frameInput:InputFrame={x:0,y:0})=>{for(let i=0;i<count&&playing();i++)handleStep(i===0?frameInput:{x:frameInput.x,y:frameInput.y});updateHud();},
    wave:(id:string)=>{spawnWave(run,id);updateHud();},
    tutorial:()=>startTutorial(), diagnostics:()=>({entities:run.bullets.length+run.lasers.length+run.mines.length+run.coins.length+run.enemies.length+run.shots.length+run.drops.length+run.zones.length+run.marks.length,scenes:game.scene.scenes.length,canvas:document.querySelectorAll('canvas').length,recent:saves.data.recent.length,renderer:game.renderer.type,frameMs:lastDelta,canvasWidth:game.canvas.width}),
  }});
}
showMenu();checkOrientation();refreshStorageNote();

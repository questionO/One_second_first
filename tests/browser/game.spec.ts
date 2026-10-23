import {test,expect,type Page} from '@playwright/test';
const pageErrors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{const errors:string[]=[];pageErrors.set(page,errors);page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(async({page})=>expect(pageErrors.get(page)).toEqual([]));
async function boot(page:Page) {
 await page.goto('/?test=1');await page.waitForFunction(()=>!!(window as any).__game);
 await page.locator('canvas').waitFor();
 // Diagnostic hooks exist before Phaser's first rendered frame; finish renderer startup before playing.
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))));
}
async function cleanRun(page:Page,seed=42) { await page.evaluate(seed=>{const g=(window as any).__game;g.start(seed);g.patch({wavesEnabled:false,bullets:[],lasers:[],mines:[],coins:[]});},seed); }
test('首页、实际 Phaser 画布与开始教学',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page);await expect(page.getByRole('heading',{name:'先欠一秒',exact:true})).toBeVisible();
 await expect(page.locator('canvas')).toHaveCount(1);
 await page.screenshot({path:'test-results/home-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'开始挑战'}).click();
 await expect(page.locator('#tutorial-banner')).toContainText('先动起来');
 expect(errors).toEqual([]);
});
test('键盘移动、借时、手动还债和暂停恢复',async({page})=>{
 await boot(page);await cleanRun(page);
 await page.keyboard.down('KeyD');await page.waitForTimeout(350);await page.keyboard.up('KeyD');
 const moved=await page.evaluate(()=>(window as any).__game.snapshot().player.x);
 expect(moved).toBeGreaterThan(500);
 await page.keyboard.press('Space');await expect(page.locator('#mode-label')).toContainText('冻结');
 await page.waitForFunction(()=>{const s=(window as any).__game.snapshot();return s.mode==='normal'&&s.debt===60;});await page.keyboard.press('KeyE');
 await expect(page.locator('#mode-label')).toContainText('还债');
 await expect(page.locator('#debt-number')).toHaveText('0.0 秒');
 await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'先喘口气'})).toBeVisible();
 const tick=await page.evaluate(()=>(window as any).__game.snapshot().tick);
 await page.waitForTimeout(200);expect(await page.evaluate(()=>(window as any).__game.snapshot().tick)).toBe(tick);
 await page.getByRole('button',{name:'继续挑战'}).click();await page.waitForTimeout(1200);
 expect(await page.evaluate(()=>(window as any).__game.screen())).toBe('play');
});
test('死亡结算、同种子重试、纪录与重开不泄漏',async({page})=>{
 await boot(page);
 await page.evaluate(()=>{const g=(window as any).__game;g.start(98765);g.patch({wavesEnabled:false,hp:1,score:90,pending:30,bullets:[{id:7,x:g.snapshot().player.x,y:g.snapshot().player.y,vx:0,vy:0,radius:6}]});g.advance(1);});
 await expect(page.getByRole('heading',{name:'下次，早点还。'})).toBeVisible();
 await expect(page.locator('.result-stats')).toContainText('60 分');
 await expect(page.getByRole('button',{name:'重试同一局面'})).toBeEnabled();
 await page.getByRole('button',{name:'重试同一局面'}).click();
 expect(await page.evaluate(()=>(window as any).__game.snapshot().seed)).toBe(98765);
 for(let i=0;i<30;i++) await cleanRun(page,i+1);
 const d=await page.evaluate(()=>(window as any).__game.diagnostics());
 expect(d.canvas).toBe(1);expect(d.scenes).toBe(1);expect(d.entities).toBeLessThan(55);expect(d.recent).toBe(1);
 await page.reload();await page.waitForFunction(()=>!!(window as any).__game);
 await expect(page.locator('#header-best')).toHaveText('00090');
});
test('互动教学完成后不写入正式纪录',async({page})=>{
 await boot(page);await page.getByRole('button',{name:'练习一下'}).click();
 await page.evaluate(()=>{const g=(window as any).__game;g.advance(120);});
 await expect(page.locator('#tutorial-banner')).toContainText('2 / 5');
 await page.evaluate(()=>{const g=(window as any).__game;g.patch({player:{x:420,y:238}});g.advance(1);g.advance(1,{x:0,y:0,switch:true});});
 await expect(page.locator('#tutorial-banner')).toContainText('3 / 5');
 await page.evaluate(()=>{const g=(window as any).__game;g.advance(15,{x:0,y:0,borrow:true});g.advance(15,{x:0,y:0,repay:true});});
 await page.locator('[data-upgrade=train_gun]').click();await page.locator('[data-upgrade=expand]').click();
 while(await page.locator('.upgrade-card:not(.strategy-card)').count()){await page.locator('.upgrade-card:not(.strategy-card)').first().click();}
 await expect(page.getByRole('heading',{name:'这笔时间，还清了。'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('one-second-first.save.v3')!).recent.length)).toBe(0);
});
test('存储不可用仍可开始与设置',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}}));
 await boot(page);await expect(page.locator('#storage-note')).toContainText('仅在本次');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.locator('#lowQuality').check();await page.locator('#muted').check();
 expect(await page.evaluate(()=>(window as any).__game.diagnostics().canvasWidth)).toBe(720);
 await page.getByRole('button',{name:'保存并返回'}).click();await cleanRun(page);
 await expect(page.locator('#borrow-button')).toBeEnabled();
});
test('桌面战斗与设置视觉截图',async({page})=>{
 await boot(page);await page.evaluate(()=>{const g=(window as any).__game;g.start(444);g.patch({score:120,pending:30,debt:90,dueAt:480,paused:true});});
 await page.screenshot({path:'test-results/game-desktop.png',fullPage:true});
 await page.evaluate(()=>(window as any).__game.pause());
 await page.getByRole('button',{name:'声音与显示',exact:true}).first().click();
 await page.screenshot({path:'test-results/settings-desktop.png',fullPage:true});
});
test('奔跑小人移动时换姿势，暂停保持画面，重开恢复站姿',async({page})=>{
 await boot(page);await cleanRun(page);
 const snapshot=async(path?:string)=>{
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const canvas=(await page.locator('canvas').boundingBox())!, scale=canvas.width/960;
  const picture=await page.screenshot({path,clip:{x:canvas.x+455*scale,y:canvas.y+213*scale,width:50*scale,height:50*scale}});
  // Let the screenshot's slow software-rendered frame finish while the simulation is paused.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  return picture;
 };
 await page.evaluate(()=>(window as any).__game.patch({paused:true}));
 const idle=await snapshot('test-results/runner-idle.png');
 const tick=await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:false});return g.snapshot().tick;});
 await page.waitForFunction(tick=>(window as any).__game.snapshot().tick>tick+3,tick);
 await page.keyboard.down('KeyD');
 await page.waitForFunction(()=>(window as any).__game.snapshot().player.x>500);
 await page.evaluate(()=>(window as any).__game.patch({paused:true,player:{x:480,y:238}}));
 await page.keyboard.up('KeyD');
 const running=await snapshot('test-results/runner-running.png');
 expect(running.equals(idle)).toBe(false);
 await page.waitForTimeout(150);expect((await snapshot()).equals(running)).toBe(true);
 await cleanRun(page);await page.evaluate(()=>(window as any).__game.patch({paused:true}));
 expect((await snapshot()).equals(idle)).toBe(true);
});
for(const reducedMotion of [false,true]) test(`小人四向姿势、斜向保持朝向与停步（减少动态效果=${reducedMotion}）`,async({page})=>{
 await boot(page);
 if(reducedMotion) {
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.locator('#reducedMotion').check();await page.locator('#lowQuality').check();
  await page.getByRole('button',{name:'保存并返回'}).click();
 }
 const capture=async(name:string)=>{
  await page.evaluate(()=>(window as any).__game.patch({paused:true,player:{x:480,y:238}}));
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const canvas=(await page.locator('canvas').boundingBox())!, scale=canvas.width/960;
  const picture=await page.screenshot({path:`test-results/runner-${name}-${reducedMotion}.png`,clip:{x:canvas.x+455*scale,y:canvas.y+213*scale,width:50*scale,height:50*scale}});
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  return picture;
 };
 const settle=async()=>{
  const tick=await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:false});return g.snapshot().tick;});
  await page.waitForFunction(tick=>(window as any).__game.snapshot().tick>tick+3,tick);
 };
 const idle:Record<string,Buffer>={};
 for(const [direction,key,axis,sign] of [['right','KeyD','x',1],['up','KeyW','y',-1],['down','KeyS','y',1],['left','KeyA','x',-1]] as const) {
  await cleanRun(page);await settle();
  await page.keyboard.down(key);
  await page.waitForFunction(({axis,sign})=>((window as any).__game.snapshot().player[axis]-(axis==='x'?480:238))*sign>25,{axis,sign});
  const running=await capture(`${direction}-run`);await page.keyboard.up(key);
  await settle();idle[direction]=await capture(`${direction}-idle`);
  expect(running.equals(idle[direction])).toBe(false);
  if(direction==='up') {
   await settle();
   await page.keyboard.down('KeyW');await page.keyboard.down('KeyD');
   await page.waitForFunction(()=>{const p=(window as any).__game.snapshot().player;return p.x>490&&p.y<228;});
   await page.evaluate(()=>(window as any).__game.patch({paused:true}));
   await page.keyboard.up('KeyW');await page.keyboard.up('KeyD');
   await settle();expect((await capture('diagonal-idle')).equals(idle.up)).toBe(true);
  }
 }
 const poses=Object.values(idle);
 for(let i=0;i<poses.length;i++) for(let j=i+1;j<poses.length;j++) expect(poses[i].equals(poses[j])).toBe(false);
});
for(const reducedMotion of [false,true]) test(`时间视觉反馈跟随冻结、还债、暂停、清债和死亡（减少动态效果=${reducedMotion}）`,async({page})=>{
 await boot(page);
 if(reducedMotion) {
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.locator('#reducedMotion').check();await page.locator('#lowQuality').check();
  await page.getByRole('button',{name:'保存并返回'}).click();
 }
 await cleanRun(page);await page.waitForFunction(()=>(window as any).__game.snapshot().tick>3);
 await page.evaluate(()=>(window as any).__game.patch({bullets:[{id:900,x:720,y:180,vx:-120,vy:0,radius:6},{id:901,x:760,y:300,vx:-120,vy:0,radius:6}]}));
 await page.keyboard.press('Space');
 await expect(page.locator('#time-state-label')).toHaveText('时间冻结');
 await expect(page.locator('#time-rate')).toHaveText('×0');
 await page.evaluate(()=>(window as any).__game.patch({paused:true}));
 const frozen=await page.evaluate(()=>(window as any).__game.snapshot());
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await page.screenshot({path:`test-results/time-freeze-${reducedMotion}.png`,fullPage:true,animations:'disabled'});
 const picture=await page.locator('canvas').screenshot({animations:'disabled'});
 await page.waitForTimeout(150);expect((await page.locator('canvas').screenshot({animations:'disabled'})).equals(picture)).toBe(true);
 await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:false});g.advance(6,{x:0,y:1});g.patch({paused:true});});
 const moved=await page.evaluate(()=>(window as any).__game.snapshot());
 expect(moved.worldTick).toBe(frozen.worldTick);expect(moved.bullets).toEqual(frozen.bullets);expect(moved.player.y).toBeGreaterThan(frozen.player.y);
 expect(Number(await page.locator('#time-remaining').textContent())).toBeLessThanOrEqual(frozen.borrowLeft/60);
 await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:false});g.advance(g.snapshot().borrowLeft);g.patch({debt:180,dueAt:g.snapshot().tick+500});g.advance(1,{x:0,y:0,repay:true});g.patch({paused:true});});
 await expect(page.locator('#time-state-label')).toHaveText('危险加速');await expect(page.locator('#time-rate')).toHaveText('×2');
 await expect(page.locator('#time-remaining')).toHaveText('3.0');
 await page.screenshot({path:`test-results/time-repay-${reducedMotion}.png`,fullPage:true,animations:'disabled'});
 const repaying=await page.locator('canvas').screenshot({animations:'disabled'});
 await page.waitForTimeout(150);expect((await page.locator('canvas').screenshot({animations:'disabled'})).equals(repaying)).toBe(true);
 await page.evaluate(()=>(window as any).__game.pause());await expect(page.locator('#time-readout')).toBeHidden();
 await cleanRun(page);
 await page.evaluate(()=>{const g=(window as any).__game;g.patch({debt:60,dueAt:g.snapshot().tick});g.advance(1);g.patch({paused:true});});
 await expect(page.locator('#time-state-label')).toHaveText('危险加速');
 await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:false});g.advance(60);g.patch({paused:true});});
 await expect(page.locator('#time-readout')).toBeHidden();await expect(page.locator('#time-veil')).toBeHidden();
 await cleanRun(page);await page.evaluate(()=>{const g=(window as any).__game;g.patch({hp:1,bullets:[{id:999,...g.snapshot().player,vx:0,vy:0,radius:6}]});g.advance(1,{x:0,y:0,borrow:true});});
 await expect(page.locator('#time-readout')).toBeHidden();await expect(page.locator('#time-veil')).toBeHidden();
});
test('拆弹提示、真实键盘冻结拆弹、还债兑现',async({page})=>{
 await boot(page);
 await page.evaluate(()=>{const g=(window as any).__game;g.start(42);g.wave('minefield');g.patch({wavesEnabled:false,paused:true});});
 await expect(page.locator('#pattern-hint')).toContainText('借时触碰菱形拆弹');
 await page.screenshot({path:'test-results/minefield-desktop.png',fullPage:true});
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await page.evaluate(()=>(window as any).__game.patch({paused:false}));
 await expect(page.locator('#borrow-button')).toBeEnabled();
 await page.waitForFunction(()=>(window as any).__game.snapshot().tick>2);
 await page.keyboard.press('Space');
 await expect(page.locator('#toast')).toContainText('拆弹成功');
 const frozen=await page.evaluate(()=>(window as any).__game.snapshot());
 expect(frozen.mines).toHaveLength(2);expect(frozen.pending).toBeGreaterThanOrEqual(30);
 await expect(page.locator('#repay-button')).toBeEnabled();
 await page.keyboard.press('KeyE');
 await expect(page.locator('#debt-number')).toHaveText('0.0 秒');
 const settled=await page.evaluate(()=>(window as any).__game.snapshot());
 expect(settled.score).toBe(frozen.score+frozen.pending*2);expect(settled.alive).toBe(true);
});
test('换轨封锁的两段画面及低画质渲染',async({page})=>{
 await boot(page);
 await page.evaluate(()=>{const g=(window as any).__game;g.start(42);g.wave('shutters');g.patch({paused:true,wavesEnabled:false});});
 await expect(page.locator('#pattern-hint')).toContainText('立刻换到下一条空白带');
 await page.screenshot({path:'test-results/shutters-warning.png',fullPage:true});
 await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:false});g.advance(14,{x:0,y:1});g.advance(95);g.patch({paused:true});});
 expect(await page.evaluate(()=>(window as any).__game.snapshot().alive)).toBe(true);
 await page.screenshot({path:'test-results/shutters-active.png',fullPage:true});
 await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:false});g.advance(29);g.patch({paused:true});});
 await page.screenshot({path:'test-results/shutters-next.png',fullPage:true});
 await page.evaluate(()=>(window as any).__game.pause());
 await page.getByRole('button',{name:'声音与显示',exact:true}).first().click();
 await page.locator('#lowQuality').check();await page.locator('#reducedMotion').check();
 await page.getByRole('button',{name:'保存并返回'}).click();
 await page.evaluate(()=>{const g=(window as any).__game;g.start(42);g.wave('minefield');g.patch({paused:true});});
 await page.screenshot({path:'test-results/minefield-low-quality.png',fullPage:true});
 expect(await page.evaluate(()=>(window as any).__game.diagnostics().canvasWidth)).toBe(720);
});
test.describe('手机横屏',()=>{
 test.use({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 test('按钮尺寸、双指输入与旋转暂停',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page);await page.screenshot({path:'test-results/home-mobile.png',fullPage:true});await cleanRun(page);
  for(const id of ['borrow-button','repay-button','pause-button']){
   const box=await page.locator('#'+id).boundingBox();expect(box!.width).toBeGreaterThanOrEqual(48);expect(box!.height).toBeGreaterThanOrEqual(48);
  }
  const joystick=(await page.locator('#joystick').boundingBox())!,borrow=(await page.locator('#borrow-button').boundingBox())!;
  const cdp=await page.context().newCDPSession(page);
  const start={x:joystick.x+joystick.width/2,y:joystick.y+joystick.height/2,id:1};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...start,x:start.x+25}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,x:start.x+25},{x:borrow.x+borrow.width/2,y:borrow.y+borrow.height/2,id:2}]});
  await page.waitForTimeout(200);
  const s=await page.evaluate(()=>(window as any).__game.snapshot());expect(s.player.x).toBeGreaterThan(490);expect(s.mode).toBe('borrow');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  const x=await page.evaluate(()=>(window as any).__game.snapshot().player.x);await page.waitForTimeout(200);
  expect(await page.evaluate(()=>(window as any).__game.snapshot().player.x)).toBeCloseTo(x);
  await page.screenshot({path:'test-results/game-mobile.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#orientation')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__game.screen())).toBe('pause');
  await page.setViewportSize({width:844,height:390});await expect(page.locator('#orientation')).toBeHidden();
  expect(await page.evaluate(()=>(window as any).__game.screen())).toBe('pause');expect(errors).toEqual([]);
 });
 test('640×360 最小布局不横向溢出',async({page})=>{
  await page.setViewportSize({width:640,height:360});await boot(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
  await page.screenshot({path:'test-results/home-minimum.png',fullPage:true});
  await cleanRun(page);
  for(const id of ['joystick','borrow-button','repay-button']){const box=(await page.locator('#'+id).boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(360);expect(box.height).toBeGreaterThanOrEqual(48);}
 });
 test('新机关提示在最小横屏不遮挡操作区',async({page})=>{
  await page.setViewportSize({width:640,height:360});await boot(page);
  for(const id of ['minefield','shutters']) {
   await page.evaluate(id=>{const g=(window as any).__game;g.start(42);g.wave(id);g.patch({paused:true});},id);
   const hint=(await page.locator('#pattern-hint').boundingBox())!, wave=(await page.locator('#wave-label').boundingBox())!, clock=(await page.locator('#world-label').boundingBox())!;
   expect(hint.x).toBeGreaterThanOrEqual(wave.x+wave.width);
   expect(hint.x+hint.width).toBeLessThanOrEqual(clock.x);
   expect(hint.y+hint.height).toBeLessThanOrEqual((await page.locator('#borrow-button').boundingBox())!.y);
   await page.screenshot({path:'test-results/'+id+'-mobile.png',fullPage:true});
  }
 });
});
test.describe('浏览器锁定竖屏时的横屏试玩',()=>{
 test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 async function rotatePage(page:Page) {
  await boot(page);
  await page.getByRole('button',{name:'直接横屏试玩'}).tap();
  await expect(page.locator('#orientation')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/forced-landscape/);
 }
 test('不依赖系统旋转即可开始教学，双指操作和摇杆两个轴方向正确',async({page})=>{
  await rotatePage(page);
  expect(await page.evaluate(()=>innerHeight>innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/forced-landscape-home.png',fullPage:true});
  await page.getByRole('button',{name:'开始挑战'}).tap();
  await expect(page.locator('#tutorial-banner')).toContainText('先动起来');
  await page.getByRole('button',{name:'跳过教学'}).tap();
  await cleanRun(page);
  const joystick=(await page.locator('#joystick').boundingBox())!, borrow=(await page.locator('#borrow-button').boundingBox())!;
  const cdp=await page.context().newCDPSession(page);
  const start={x:joystick.x+joystick.width/2,y:joystick.y+joystick.height/2,id:1};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...start,y:start.y+25}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,y:start.y+25},{x:borrow.x+borrow.width/2,y:borrow.y+borrow.height/2,id:2}]});
  await page.waitForTimeout(200);
  const moved=await page.evaluate(()=>(window as any).__game.snapshot());
  expect(moved.player.x).toBeGreaterThan(490);expect(moved.player.y).toBeCloseTo(238);expect(moved.mode).toBe('borrow');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  for (const [dx,dy,axis,sign] of [[-25,0,'y',1],[25,0,'y',-1],[0,-25,'x',-1]] as const) {
   await page.evaluate(()=>(window as any).__game.patch({player:{x:480,y:238}}));
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...start,x:start.x+dx,y:start.y+dy}]});
   await page.waitForTimeout(120);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   const p=await page.evaluate(()=>(window as any).__game.snapshot().player);
   expect((p[axis]-(axis==='x'?480:238))*sign).toBeGreaterThan(10);
   expect(p[axis==='x'?'y':'x']).toBeCloseTo(axis==='x'?238:480);
  }
  await page.screenshot({path:'test-results/forced-landscape-game.png',fullPage:true});
 });
 test('小屏与画质切换后画布仍铺满，按钮在屏幕内',async({page})=>{
  await rotatePage(page);
  await page.getByRole('button',{name:'设置',exact:true}).tap();
  await page.locator('#lowQuality').check();
  await page.getByRole('button',{name:'保存并返回'}).tap();
  await cleanRun(page);
  for (const [width,height] of [[320,568],[360,780],[390,844]]) {
   await page.setViewportSize({width,height});
   await expect.poll(()=>page.locator('canvas').boundingBox().then(b=>Math.round(b!.width))).toBe(width);
   const cabinet=(await page.locator('#cabinet').boundingBox())!, canvas=(await page.locator('canvas').boundingBox())!;
   expect(canvas.height).toBeCloseTo(cabinet.height,0);expect(canvas.x).toBeCloseTo(cabinet.x,0);expect(canvas.y).toBeCloseTo(cabinet.y,0);
   for(const id of ['joystick','borrow-button','repay-button','pause-button']) {
    const box=(await page.locator('#'+id).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(height);
    expect(box.width).toBeGreaterThanOrEqual(48);expect(box.height).toBeGreaterThanOrEqual(48);
   }
   await page.screenshot({path:'test-results/forced-landscape-'+width+'.png',fullPage:true});
  }
  expect(await page.evaluate(()=>(window as any).__game.diagnostics().canvasWidth)).toBe(720);
 });
 test('时间倒计时在旋转小屏上不遮挡操作，状态层不拦截触控',async({page})=>{
  await rotatePage(page);
  for(const [width,height] of [[320,568],[390,844]]) {
   await page.setViewportSize({width,height});
   await expect.poll(()=>page.locator('canvas').boundingBox().then(b=>Math.round(b!.width))).toBe(width);
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   await cleanRun(page);
   await page.locator('#borrow-button').tap();await expect(page.locator('#time-state-label')).toHaveText('时间冻结');
   await page.evaluate(()=>(window as any).__game.patch({paused:true}));
   const readout=(await page.locator('#time-readout').boundingBox())!;
   expect(readout.x).toBeGreaterThanOrEqual(0);expect(readout.y+readout.height).toBeLessThanOrEqual(height);
   for(const id of ['borrow-button','repay-button','joystick']) {
    const control=(await page.locator('#'+id).boundingBox())!;
    expect(readout.x+readout.width<=control.x||control.x+control.width<=readout.x||readout.y+readout.height<=control.y||control.y+control.height<=readout.y).toBe(true);
   }
   await expect(page.locator('#time-veil')).toHaveCSS('pointer-events','none');
   await page.screenshot({path:`test-results/time-freeze-mobile-${width}.png`,fullPage:true});
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:false});g.advance(g.snapshot().borrowLeft);});
   await page.locator('#repay-button').tap();await expect(page.locator('#time-state-label')).toHaveText('危险加速');
   await page.evaluate(()=>(window as any).__game.patch({paused:true}));
   await page.screenshot({path:`test-results/time-repay-mobile-${width}.png`,fullPage:true});
  }
 });
 test('原生方向变化仍暂停，恢复后不丢失局面，地址栏缩放不额外暂停',async({page})=>{
  await rotatePage(page);await cleanRun(page,123);
  await page.setViewportSize({width:390,height:780});
  expect(await page.evaluate(()=>(window as any).__game.screen())).toBe('play');
  await page.setViewportSize({width:844,height:390});
  await expect(page.locator('body')).not.toHaveClass(/forced-landscape/);
  await expect(page.getByRole('heading',{name:'调整握持后继续'})).toBeVisible();
  await page.getByRole('button',{name:'继续挑战'}).tap();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('body')).toHaveClass(/forced-landscape/);
  await expect(page.locator('#orientation')).toBeHidden();
  const paused=await page.evaluate(()=>(window as any).__game.snapshot());
  expect(paused.seed).toBe(123);expect(paused.paused).toBe(true);
  await page.getByRole('button',{name:'继续挑战'}).tap();
  await expect(page.locator('#overlay')).toBeHidden();
  expect(await page.evaluate(()=>(window as any).__game.screen())).toBe('play');
 });
});

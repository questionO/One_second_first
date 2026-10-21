import {test,expect,type Page} from '@playwright/test';
const pageErrors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{const errors:string[]=[];pageErrors.set(page,errors);page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(async({page})=>expect(pageErrors.get(page)).toEqual([]));
async function boot(page:Page) { await page.goto('/?test=1');await page.waitForFunction(()=>!!(window as any).__game); }
async function cleanRun(page:Page,seed=42) { await page.evaluate(seed=>{const g=(window as any).__game;g.start(seed);g.patch({wavesEnabled:false,bullets:[],lasers:[],coins:[]});},seed); }
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
 await page.waitForTimeout(1100);await page.keyboard.press('KeyE');
 await expect(page.locator('#mode-label')).toContainText('还债');
 await page.waitForTimeout(1100);await expect(page.locator('#debt-number')).toHaveText('0.0 秒');
 await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'先喘口气'})).toBeVisible();
 const tick=await page.evaluate(()=>(window as any).__game.snapshot().tick);
 await page.waitForTimeout(200);expect(await page.evaluate(()=>(window as any).__game.snapshot().tick)).toBe(tick);
 await page.getByRole('button',{name:'继续挑战'}).click();await page.waitForTimeout(1200);
 expect(await page.evaluate(()=>(window as any).__game.screen())).toBe('play');
});
test('死亡结算、同种子重试、纪录与重开不泄漏',async({page})=>{
 await boot(page);await cleanRun(page,98765);
 await page.evaluate(()=>{const g=(window as any).__game;g.patch({score:90,pending:30,bullets:[{id:7,x:g.snapshot().player.x,y:g.snapshot().player.y,vx:0,vy:0,radius:6}]});g.advance(1);});
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
 await page.evaluate(()=>{const g=(window as any).__game;g.patch({player:{x:405,y:238}});g.advance(1);});
 await expect(page.locator('#tutorial-banner')).toContainText('2 / 3');
 await page.evaluate(()=>{const g=(window as any).__game;g.patch({bullets:[],player:{x:440,y:238}});g.advance(60,{x:0,y:0,borrow:true});});
 await expect(page.locator('#tutorial-banner')).toContainText('3 / 3');
 await page.evaluate(()=>(window as any).__game.advance(60,{x:0,y:0,repay:true}));
 await expect(page.getByRole('heading',{name:'这笔时间，还清了。'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('one-second-first.save.v1')!).recent.length)).toBe(0);
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
});

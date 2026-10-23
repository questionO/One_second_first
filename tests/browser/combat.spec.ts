import { test, expect, type Page } from '@playwright/test';

async function boot(page:Page) {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=1');await page.waitForFunction(()=>!!(window as any).__game);
  await page.locator('canvas').waitFor();
  await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())))));
  return errors;
}
async function fixture(page:Page) {
  await page.evaluate(async()=>{
    const path='/src/game/director.ts';const {makeEnemy}=await import(path);
    const g=(window as any).__game;g.start(2026);const s=g.snapshot();s.wavesEnabled=false;s.paused=true;
    s.enemies=[makeEnemy(s,'chaser',{x:710,y:238}),makeEnemy(s,'charger',{x:290,y:300}),makeEnemy(s,'shooter',{x:760,y:135},true)];
    for(const e of s.enemies){e.phase='move';e.timer=10000;e.speed=0;e.hp=100;e.maxHp=100;}
    s.drops=[{id:s.nextId++,kind:'bow',x:520,y:238,life:3600}];g.patch(s);
  });
  await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())))));
  await page.evaluate(()=>(window as any).__game.patch({paused:false}));
  await page.waitForFunction(()=>(window as any).__game.snapshot().tick>2);
}
test('3.0 战斗、拾取、冻结布弹、提前齐射与受伤反馈',async({page})=>{
  const errors=await boot(page);await fixture(page);
  await expect(page.locator('#health')).toHaveAttribute('aria-label','生命 3 / 3');
  await page.keyboard.down('KeyD');await page.waitForFunction(()=>(window as any).__game.snapshot().weapons.length===2);await page.keyboard.up('KeyD');
  await expect(page.locator('#weapon-label')).toContainText('短弓');
  await page.keyboard.press('Space');await page.waitForFunction(()=>(window as any).__game.snapshot().mode==='borrow');
  await page.evaluate(()=>{const g=(window as any).__game;if(g.screen()==='play')g.advance(30);});
  await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:true});});
  const frozen=await page.evaluate(()=>(window as any).__game.snapshot());
  expect(frozen.shots.some((s:any)=>s.frozen&&!s.released)).toBe(true);
  await page.screenshot({path:'test-results/combat-frozen.png',animations:'disabled'});
  await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
  await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:false});});
  await page.locator('#repay-button').click();await expect(page.locator('#time-state-label')).toHaveText('危险加速');
  await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:true});});
  const repaid=await page.evaluate(()=>(window as any).__game.snapshot());expect(repaid.borrowLeft).toBe(0);expect(repaid.debt).toBeLessThan(frozen.debt+8);
  await page.screenshot({path:'test-results/combat-repay.png',animations:'disabled'});
  await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:false,bullets:[{id:9000,...g.snapshot().player,vx:0,vy:0,radius:6}]});g.advance(1);g.patch({paused:true});});
  await expect(page.locator('#health')).toHaveAttribute('aria-label','生命 2 / 3');expect(errors).toEqual([]);
});
test('升级只生成一次，设置和后台保持选项，选卡后恢复原来还债状态',async({page})=>{
  const errors=await boot(page);await fixture(page);
  await page.evaluate(()=>{const g=(window as any).__game;g.patch({xp:8,hp:2,debt:100,mode:'repay',dueAt:480});g.advance(1);});
  await expect(page.locator('.upgrade-card')).toHaveCount(3);
  const s=await page.evaluate(()=>(window as any).__game.snapshot()),cards=await page.locator('.upgrade-cards').innerText();
  await page.locator('#panel [data-action=settings]').click();await page.locator('#reducedMotion').check();await page.locator('#lowQuality').check();await page.getByRole('button',{name:'保存并返回'}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  expect(await page.locator('.upgrade-cards').innerText()).toBe(cards);expect(await page.evaluate(()=>(window as any).__game.snapshot().tick)).toBe(s.tick);
  await page.screenshot({path:'test-results/combat-upgrades.png',animations:'disabled'});
  await page.locator('.upgrade-card:not(.strategy-card)').first().click();await expect(page.locator('.resume-count')).toHaveText('1');
  expect(await page.evaluate(()=>(window as any).__game.snapshot().debt)).toBe(s.debt);
  await expect(page.locator('#overlay')).toBeHidden();expect(await page.evaluate(()=>(window as any).__game.snapshot().hp)).toBe(2);
  expect(await page.evaluate(()=>(window as any).__game.snapshot().mode)).toBe('repay');expect(errors).toEqual([]);
});
test('升级恢复倒计时切后台会暂停；同种子重开清空构筑',async({page})=>{
  await boot(page);await fixture(page);
  await page.evaluate(()=>{const g=(window as any).__game;g.patch({xp:8});g.advance(1);});
  await page.locator('.upgrade-card:not(.strategy-card)').first().click();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(()=>(window as any).__game.screen())).toBe('pause');
  await page.evaluate(()=>{const g=(window as any).__game;g.start(2026);g.patch({paused:true});});
  const s=await page.evaluate(()=>(window as any).__game.snapshot());expect(s.level).toBe(1);expect(s.hp).toBe(3);expect(Object.values(s.upgrades).every(v=>v===0)).toBe(true);
});
for(const [width,height] of [[320,568],[390,844]]) test.describe('3.0 旋转手机 '+width,()=>{
  test.use({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  test('双指移动借时、提前还债、选卡与 HUD 不遮挡操作',async({page})=>{
    const errors=await boot(page);await page.getByRole('button',{name:'直接横屏试玩'}).tap();await fixture(page);
    const cdp=await page.context().newCDPSession(page);
    const j=(await page.locator('#joystick').boundingBox())!,b=(await page.locator('#borrow-button').boundingBox())!;
    const origin={x:j.x+j.width/2,y:j.y+j.height/2,id:1};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...origin,y:origin.y+24}]});
    await page.waitForFunction(()=>(window as any).__game.snapshot().weapons.length===2);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...origin,y:origin.y+24},{x:b.x+b.width/2,y:b.y+b.height/2,id:2}]});
    await page.waitForFunction(()=>{const s=(window as any).__game.snapshot();return s.mode==='borrow'&&s.borrowLeft<=30;});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.locator('#repay-button').tap();await expect(page.locator('#time-rate')).toHaveText('×2');
    await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:true});});
    const hud=(await page.locator('#combat-hud').boundingBox())!;
    for(const id of ['borrow-button','repay-button','switch-button','joystick']) {
      const c=(await page.locator('#'+id).boundingBox())!;
      expect(hud.x+hud.width<=c.x||c.x+c.width<=hud.x||hud.y+hud.height<=c.y||c.y+c.height<=hud.y).toBe(true);
    }
    await page.evaluate(()=>{const g=(window as any).__game;g.patch({paused:false,xp:8});g.advance(1);});
    const choices=await page.locator('.upgrade-cards').innerText();
    await page.setViewportSize({width,height:height-20});expect(await page.locator('.upgrade-cards').innerText()).toBe(choices);
    const cards=await page.locator('.upgrade-card').all();expect(cards).toHaveLength(3);
    for(const card of cards){const c=(await card.boundingBox())!;expect(c.x).toBeGreaterThanOrEqual(0);expect(c.x+c.width).toBeLessThanOrEqual(width);expect(c.y).toBeGreaterThanOrEqual(0);expect(c.y+c.height).toBeLessThanOrEqual(height-20);}
    await page.screenshot({path:`test-results/combat-upgrade-mobile-${width}.png`,animations:'disabled'});
    await page.locator('.upgrade-card:not(.strategy-card)').first().tap();await expect(page.locator('#overlay')).toBeHidden();expect(errors).toEqual([]);
  });
});

for(const [width,height] of [[320,568],[390,844]])test.describe('七选三手机 '+width,()=>{
 test.use({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 test('翻倍、多选、设置往返、进化与替换界面',async({page})=>{
  const errors=await boot(page);await page.getByRole('button',{name:'直接横屏试玩'}).tap();await fixture(page);
  await page.evaluate(()=>{const g=(window as any).__game;const s=g.snapshot();s.xp=28;s.hp=1;s.level=6;s.bonuses={options:4,picks:2,doubles:1,rerolls:1,focus:[]};g.patch(s);g.advance(1);});
  await expect(page.locator('.upgrade-card')).toHaveCount(7);await expect(page.locator('#picks-left')).toHaveText('3');
  const before=await page.evaluate(()=>(window as any).__game.snapshot());
  await page.locator('#panel [data-action=settings]').tap();await page.getByRole('button',{name:'保存并返回'}).tap();
  expect(await page.evaluate(()=>(window as any).__game.snapshot().draft)).toEqual(before.draft);
  for(const card of await page.locator('.upgrade-card').all()){const r=(await card.boundingBox())!;expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(width);expect(r.y+r.height).toBeLessThanOrEqual(height);}
  await page.screenshot({path:`test-results/v3-seven-${width}.png`,animations:'disabled'});
  await page.locator('.upgrade-card:not(.strategy-card)').first().tap();await expect(page.locator('#picks-left')).toHaveText('2');
  await page.locator('[data-action=reroll]').tap();await expect(page.locator('#picks-left')).toHaveText('2');
  await page.locator('.upgrade-card:not(.strategy-card)').first().tap();await expect(page.locator('#picks-left')).toHaveText('1');
  await page.locator('.upgrade-card:not(.strategy-card)').first().tap();await expect(page.locator('.resume-count')).toBeVisible();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.evaluate(()=>{const g=(window as any).__game,s=g.snapshot();s.enemies=[];s.bullets=[];s.hp=3;s.growth.gun.rank=5;s.xp=0;s.draft={id:s.nextId++,options:[{id:'train_gun',uid:s.nextId++}],remaining:1,selected:[],doubled:true,rerolls:0};s.choices=['train_gun'];g.patch(s);g.advance(1);});
  await page.locator('[data-upgrade=train_gun]').tap();await expect(page.locator('[data-action=evolve]')).toHaveCount(2);await page.locator('[data-action=evolve]').last().tap();await expect(page.locator('#overlay')).toBeHidden();
  await page.evaluate(()=>{const g=(window as any).__game;g.patch({replacement:'hammer'});g.advance(1);});
  await expect(page.locator('[data-action=replace]')).toHaveCount(2);await page.locator('[data-slot="-1"]').tap();await expect(page.locator('#overlay')).toBeHidden();expect(errors).toEqual([]);
 });
});

test('3.0 后期怪群、首领、斩痕和危险区可绘制',async({page})=>{
 const errors=await boot(page);
 await page.evaluate(async()=>{
 const path='/src/game/director.ts';const {makeEnemy}=await import(path);const g=(window as any).__game;g.start(777);const s=g.snapshot();s.paused=true;s.wavesEnabled=false;s.worldTick=33000;
 s.enemies=['shield','medic','splitter','miner','breaker','artillery','weaver'].map((kind,i)=>{const e=makeEnemy(s,kind,{x:100+i*115,y:160+(i%2)*120});e.phase='warn';e.timer=60;e.dx=-1;e.dy=0;if(i>3){e.boss=true;e.radius=25;}return e;});
 s.zones=[{id:s.nextId++,x:400,y:260,radius:55,warn:30,life:20,friendly:false,damage:1,hitIds:[]}];s.marks=[{target:s.enemies[0].id,damage:2}];s.shieldReady=true;s.growth.gun={rank:6,branch:1};g.patch(s);
 });
 await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));await page.screenshot({path:'test-results/v3-boss.png',animations:'disabled'});expect(errors).toEqual([]);
});

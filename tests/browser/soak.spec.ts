import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
test('十分钟实际渲染、借还与三十次重开', async ({ page, browserName }) => {
  const errors: string[] = []; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=1'); await page.waitForFunction(()=>!!(window as any).__game);
  await page.getByRole('button',{name:'开始挑战'}).click();
  await page.getByRole('button',{name:'跳过教学'}).click();
  for(let i=0;i<30;i++) await page.evaluate(i=>(window as any).__game.start(i+1),i);
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const samples: unknown[] = [];
  const started=Date.now(); let pauses=0, restarts=30;
  for(let i=0;i<60;i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(10000);
    const data=await page.evaluate(()=>{const g=(window as any).__game,s=g.snapshot();return { ...g.diagnostics(), screen:g.screen(), tick:s.tick, wave:s.wave, debt:s.debt, borrowCount:s.borrowCount, settlements:s.settlements };});
    const metrics=await session.send('Performance.getMetrics');
    const values=Object.fromEntries(metrics.metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','JSEventListeners'].includes(m.name)).map(m=>[m.name,m.value]));
    samples.push({second:Math.round((Date.now()-started)/1000),...data,...values});
    expect(data.canvas).toBe(1);expect(data.scenes).toBe(1);expect(data.entities).toBeLessThanOrEqual(54);
    if(data.screen==='pause')pauses++;
    if(data.screen==='pause'||data.screen==='result') { await page.evaluate(i=>(window as any).__game.start(i+100),i);restarts++; }
  }
  mkdirSync('docs/verification',{recursive:true});
  writeFileSync('docs/verification/soak.json',JSON.stringify({browser:browserName,renderer:'Chrome headless / SwiftShader',durationSeconds:(Date.now()-started)/1000,restarts,pauses,errors,samples},null,2));
  expect(errors).toEqual([]);
  expect(pauses).toBe(0);
});

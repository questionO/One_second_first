import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  (page as Page & { auditErrors: string[] }).auditErrors = errors;
  await page.goto('/?test=1');
  await page.waitForFunction(() => !!(window as any).__game);
  await page.locator('canvas').waitFor();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))));
});
test.afterEach(async ({ page }) => expect((page as Page & { auditErrors: string[] }).auditErrors).toEqual([]));

async function cleanRun(page: Page) {
  await page.evaluate(() => { const g = (window as any).__game; g.start(98765); g.patch({ wavesEnabled: false, bullets: [], lasers: [], coins: [] }); });
}
async function tutorialSecondStep(page: Page) {
  await page.evaluate(() => { const g = (window as any).__game; g.tutorial(); g.advance(120); });
}

test('重复打开设置后仍返回原来的暂停局面', async ({ page }) => {
  await cleanRun(page);
  await page.locator('.below [data-action="settings"]').click();
  await page.locator('.below [data-action="settings"]').click();
  await page.getByRole('button', { name: '保存并返回' }).click();
  expect(await page.evaluate(() => (window as any).__game.screen())).toBe('pause');
  expect(await page.evaluate(() => (window as any).__game.snapshot().seed)).toBe(98765);
});
test('恢复倒计时中打开设置不会丢弃本局', async ({ page }) => {
  await cleanRun(page); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '继续挑战' }).click();
  await page.locator('.below [data-action="settings"]').click();
  await page.getByRole('button', { name: '保存并返回' }).click();
  expect(await page.evaluate(() => (window as any).__game.screen())).toBe('pause');
  expect(await page.evaluate(() => (window as any).__game.snapshot().seed)).toBe(98765);
});
test('教学武器可以普通拾取，再完成冻结布弹步骤', async ({ page }) => {
  await page.evaluate(() => {
    const g = (window as any).__game;g.tutorial();g.advance(120);g.patch({ player: { x:420,y:238 } });g.advance(1);
  });
  expect(await page.evaluate(() => (window as any).__game.snapshot().weapons[1].kind)).toBe('bow');
  await page.keyboard.press('KeyQ');
  await expect(page.locator('#tutorial-banner')).toContainText('3 / 5');
});
test('教学失败后从设置返回仍可重试当前步骤', async ({ page }) => {
  await page.evaluate(() => { const g = (window as any).__game;g.tutorial();g.advance(120);g.patch({ hp:1, bullets: [{ id: 999, ...g.snapshot().player, vx: 0, vy: 0, radius: 6 }] }); g.advance(1); });
  await expect(page.getByRole('button', { name: '重试当前步骤' })).toBeVisible();
  await page.locator('.below [data-action="settings"]').click();
  await page.getByRole('button', { name: '保存并返回' }).click();
  await expect(page.getByRole('button', { name: '重试当前步骤' })).toBeVisible();
  await page.getByRole('button', { name: '重试当前步骤' }).click();
  expect(await page.evaluate(() => (window as any).__game.snapshot().alive)).toBe(true);
});
test('教学完成页面从设置返回不会变回首页', async ({ page }) => {
  await tutorialSecondStep(page);
  await page.evaluate(() => { const g = (window as any).__game; g.patch({ player: { x: 420, y: 238 } });g.advance(1);g.advance(1,{x:0,y:0,switch:true});g.advance(15, { x: 0, y: 0, borrow: true }); g.advance(15, { x: 0, y: 0, repay: true }); });
  await page.locator('[data-upgrade=train_gun]').click();await page.locator('[data-upgrade=expand]').click();
  while(await page.locator('.upgrade-card:not(.strategy-card)').count())await page.locator('.upgrade-card:not(.strategy-card)').first().click();
  await page.locator('.below [data-action="settings"]').click();
  await page.getByRole('button', { name: '保存并返回' }).click();
  await expect(page.getByRole('button', { name: '进入正式挑战' })).toBeVisible();
});
test('追平旧成绩不会显示刷新纪录', async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => { const g = (window as any).__game; g.start(111); g.patch({ hp:1, score: 100, tick: 60, bullets: [{ id: 999, x: 480, y: 238, vx: 0, vy: 0, radius: 6 }], lasers: [] }); g.advance(1); });
  }
  await expect(page.locator('.section-marker')).toHaveText('这一秒，没躲过去');
});
test('结算页可用键盘聚焦再来一局', async ({ page }) => {
  await cleanRun(page); await page.locator('#pause-button').focus();
  await page.evaluate(() => { const g = (window as any).__game; g.patch({ hp:1, bullets: [{ id: 999, x: 480, y: 238, vx: 0, vy: 0, radius: 6 }] }); g.advance(1); });
  await expect(page.getByRole('button', { name: '再来一局' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '再来一局' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-action=starter]').first()).toBeFocused();await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).__game.screen())).toBe('play');
});
test('键盘聚焦还债按钮后空格执行还债', async ({ page }) => {
  await cleanRun(page);
  await page.evaluate(() => (window as any).__game.patch({ debt: 180, dueAt: 1000 }));
  await page.locator('#repay-button').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#mode-label')).toContainText('还债');
});
test('冻结期间外框颜色与状态一致', async ({ page }) => {
  await cleanRun(page); await page.keyboard.press('Space');
  await expect(page.locator('#cabinet')).toHaveCSS('border-top-color', 'rgb(102, 217, 255)');
});
test('暂停时教学跳过按钮不可被键盘穿透激活', async ({ page }) => {
  await tutorialSecondStep(page); await page.keyboard.press('Escape');
  expect(await page.locator('#tutorial-banner').evaluate(el => (el as HTMLElement).inert)).toBe(true);
  await page.locator('#panel [data-action="home"]').focus(); await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('#tutorial-banner'))).toBe(false);
});
test('缺少音频 API 仍可游玩和结算', async ({ page }) => {
  await page.addInitScript(() => { (window as any).AudioContext = undefined; });
  await page.reload(); await page.waitForFunction(() => !!(window as any).__game);
  await page.getByRole('button', { name: '开始挑战' }).click();
  await page.getByRole('button', { name: '跳过教学' }).click();
  await page.locator('[data-action=starter][data-kind=gun]').click();
  await page.evaluate(() => { const g = (window as any).__game; g.patch({ hp:1, bullets: [{ id: 999, ...g.snapshot().player, vx: 0, vy: 0, radius: 6 }] }); g.advance(1); });
  await expect(page.getByRole('heading', { name: '下次，早点还。' })).toBeVisible();
});
test('刷新保留画质设置，返回结算不重复记分', async ({ page }) => {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.locator('#lowQuality').check();
  await page.reload(); await page.waitForFunction(() => !!(window as any).__game);
  await expect.poll(() => page.locator('canvas').getAttribute('width')).toBe('720');
  await cleanRun(page);
  await page.evaluate(() => { const g = (window as any).__game; g.patch({ hp:1, bullets: [{ id: 999, x: 480, y: 238, vx: 0, vy: 0, radius: 6 }] }); g.advance(1); });
  for (let i = 0; i < 3; i++) {
    await page.locator('.below [data-action="settings"]').click();
    await page.getByRole('button', { name: '保存并返回' }).click();
  }
  expect(await page.evaluate(() => (window as any).__game.diagnostics().recent)).toBe(1);
});
test('保存成绩合并另一页的画质设置后同步画布尺寸', async ({ page }) => {
  await cleanRun(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('one-second-first.save.v3')!);
    saved.settings.lowQuality = true; localStorage.setItem('one-second-first.save.v3', JSON.stringify(saved));
    const g = (window as any).__game;
    g.patch({ hp:1, bullets: [{ id: 999, x: 480, y: 238, vx: 0, vy: 0, radius: 6 }] }); g.advance(1);
  });
  await expect(page.locator('canvas')).toHaveAttribute('width', '720');
});
test.describe('竖屏与触摸边界', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('竖屏提示覆盖时不能通过键盘开始隐藏的游戏', async ({ page }) => {
    await expect(page.locator('#orientation')).toBeVisible();
    await page.keyboard.press('Enter'); await page.keyboard.press('Space');
    expect(await page.evaluate(() => (window as any).__game.screen())).toBe('menu');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByRole('button', { name: '开始挑战' }).click();
    await expect(page.locator('#tutorial-banner')).toContainText('1 / 5');
  });
});

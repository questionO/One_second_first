import {test,expect} from '@playwright/test';
test('生产构建可启动并移除开发诊断接口',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?test=1&debug=1');
 await expect(page.getByRole('heading',{name:'先欠一秒',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>typeof (window as any).__game)).toBe('undefined');
 await expect(page.locator('#debug')).toBeHidden();
 await page.getByRole('button',{name:'开始挑战'}).click();
 await page.getByRole('button',{name:'跳过教学'}).click();
 await expect(page.locator('#borrow-button')).toBeEnabled();
 await page.keyboard.press('Space');await expect(page.locator('#mode-label')).toContainText('冻结');
 await page.screenshot({path:'release-results/release.png',fullPage:true});
 expect(errors).toEqual([]);
});

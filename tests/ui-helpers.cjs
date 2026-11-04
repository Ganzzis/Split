// Navigate through the same visible controls as a person; never unhide panels in tests.
const go=async(page,view)=>{await page.locator(`.mobile-dock [data-view="${view}"]`).click();await page.locator('body').getAttribute('data-view');};
const people=async page=>{await go(page,'calculation');if(await page.locator('#calc-tabs').isVisible())await page.locator('[data-calc-section="people"]').click();};
const expenses=async page=>{await go(page,'calculation');if(await page.locator('#calc-tabs').isVisible())await page.locator('[data-calc-section="expenses"]').click();};
module.exports={go,people,expenses};

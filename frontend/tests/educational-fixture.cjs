// Existing form/export tests use a stable two-field education fixture.
// The production preset, tested separately, now also includes an affiliation field.
module.exports=async page=>{
 if(await page.locator('[name=template]').inputValue()!=='1')return;
 await page.locator('.stepper [data-go="1"]').click();
 const extra=await page.locator('[data-item-preset]').evaluateAll(nodes=>nodes.filter(n=>!['성명','휴대전화번호'].includes(n.value)).map(n=>n.dataset.itemPreset));
 for(const id of extra)await page.locator(`[data-delete="${id}"]`).click();
};

// Synthetic API responses verify labels and transitions, not live AI accuracy.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3007';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let calls=[],mode='high',release;
  await page.route('**/api/privacy/classify',async route=>{
   const body=route.request().postDataJSON();calls.push(body);
   const current=mode;
   if(current==='deferred'){await new Promise(resolve=>release=resolve);}
   if(current==='error')return route.fulfill({status:502,json:{error:'테스트: API 확인 실패'}});
   return route.fulfill({json:{items:body.items.map(i=>({id:i.id,name:i.name,verdict:current==='general'?'general':'high',reason:'테스트: 사생활 노출 우려 검토 <img src=x onerror=alert(1)>',included:['건강','<img src=x onerror=alert(1)>']}))}});
  });
  const start=async()=>{
   await page.goto(base);await page.locator('[data-start]').first().click();
   await page.locator('[data-path=agency]').fill('시험 기관');
   await page.locator('[data-path="groups.collect.purpose"]').fill('참여 상담 관리');
   await page.locator('[data-path="groups.collect.period"]').fill('종료 시까지');
  };
  await start();await page.locator('[data-item-preset]').selectOption('건강정보');
  assert.equal(await page.locator('.item-hint').first().innerText(),'민감정보');
  await page.locator('[data-add=collect]').click();await page.locator('[data-item-preset]').last().selectOption('custom');
  await page.locator('[data-name]').fill('상담 내용');await page.locator('[data-path=agency]').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.item-hint')].some(e=>e.textContent.includes('민감정보 가능성 높음')));
  assert.equal(await page.locator('.side img,.item-hint img,.class-item img').count(),0);
  assert.equal(await page.locator('.item-hint').last().innerText(),'민감정보 가능성 높음(건강 사항 포함)');
  assert.equal(calls.length,1);assert.equal(calls[0].items.length,1);assert.equal(calls[0].items[0].name,'상담 내용');
  await page.locator('[data-next]').click();
  const sensitive=page.locator('.class-card').filter({has:page.locator('h3').filter({hasText:'민감정보'})});
  assert.equal(await sensitive.locator('.class-item').count(),2);
  assert.equal(await page.locator('.class-item img,.side img').count(),0);
  await page.screenshot({path:'.test-output/sensitivity-classification.png',fullPage:true});
  assert.equal(await page.locator('[aria-label="상담 내용 분류"]').inputValue(),'sensitive');
  await page.locator('[aria-label="상담 내용 분류"]').selectOption('optional');assert.equal(await page.locator('[aria-label="상담 내용 분류"]').inputValue(),'optional');
  await page.locator('[data-next]').click();await page.locator('[data-go="2"]').first().click();
  assert.equal(await page.locator('[aria-label="상담 내용 분류"]').inputValue(),'optional');
  console.log('PASS statutory sensitive label, API high likelihood, sensitive default and human override');
  mode='error';await start();await page.locator('[data-item-preset]').selectOption('custom');await page.locator('[data-name]').fill('활동 내역');
  await page.locator('[data-path=agency]').click();await page.waitForFunction(()=>document.querySelector('.item-hint').textContent.includes('가능성 미확인'));
  assert.doesNotMatch(await page.locator('.item-hint').innerText(),/가능성 높음/);
  mode='general';await page.locator('[data-retry-classification]').click();await page.waitForFunction(()=>document.querySelector('.item-hint').textContent.includes('가능성 낮음'));
  console.log('PASS failed classification does not claim likelihood, and retry recovers');
  mode='deferred';await start();await page.locator('[data-item-preset]').selectOption('custom');await page.locator('[data-name]').fill('상담 기록');await page.locator('[data-path=agency]').click();
  await page.waitForFunction(()=>document.querySelector('.item-hint').textContent.includes('확인 중'));
  while(!release)await new Promise(resolve=>setTimeout(resolve,20));
  await page.locator('[data-name]').fill('취미 기록');mode='general';release();
  await page.locator('[data-path=agency]').click();await page.waitForFunction(()=>document.querySelector('.item-hint').textContent.includes('가능성 낮음'));
  assert.doesNotMatch(await page.locator('.item-hint').innerText(),/가능성 높음/);
  await page.locator('[data-next]').click();assert.equal(await page.locator('[data-kind]').inputValue(),'optional');
  assert.deepEqual(errors,[]);console.log('PASS stale classifications do not override renamed fields');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

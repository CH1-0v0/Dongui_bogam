// Requires a running server.py with LAW_SEARCH_DEMO=true. Playwright is a test-only tool.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1100},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const stage3=async()=>{
  await page.goto(base);await page.locator('[data-sample]').click();
  await page.locator('[data-next]').click();await page.locator('[data-next]').click();
  await page.waitForSelector('[data-law-mode] option[value=demo]',{state:'attached'});
 };
 await stage3();await page.locator('[data-ai-law]').click();
 await page.getByRole('alert').waitFor();
 assert.match(await page.getByRole('alert').innerText(),/LAW_API_OC|OPENROUTER_API_KEY/);
 console.log('PASS missing API config stays an error, not empty results');
 await page.locator('[data-law-mode]').selectOption('demo');await page.locator('[data-ai-law]').click();
 await page.locator('[data-use-law]').waitFor();
 await fs.mkdir('.test-output',{recursive:true});
 await page.screenshot({path:'.test-output/step3-desktop.png',fullPage:true});
 await page.locator('[data-use-law]').click();await page.locator('[data-scope]').first().check();await page.locator('[data-adopt-ground]').click();
 await page.locator('[data-next]').click();assert.equal(await page.locator('.doc-notice').count(),0);
 console.log('PASS adopting consent clause preserves consent in step 4');
 await page.locator('[data-go="3"]').first().click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.test-output/step3-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('PASS mobile layout has no horizontal overflow');
 await page.setViewportSize({width:1440,height:1100});
 // A fake API response is isolated to this browser test, never mixed into the live server.
 const candidate={law:'시험법',article:'10',paragraph:'1',clause:'',cite:'시험법 제10조 제1항',excerpt:'테스트 원문',basisCode:'statutory',type:'required',verified:true,pipaVerified:true,reason:'테스트: 적용 요건 확인',pipa:{excerpt:'테스트 연결 조항'},sourceUrl:'https://www.law.go.kr/',effectiveDate:'20200101',verifiedAt:'2026-11-24T00:00:00Z'};
 await page.route('**/api/law/search',r=>r.fulfill({json:{candidates:[candidate],rejected:[],note:'테스트 가상 응답',mode:'live'}}));
 await stage3();await page.locator('[data-ai-law]').click();await page.locator('[data-use-law]').waitFor();
 await page.screenshot({path:'.test-output/step3-statutory-fixture.png',fullPage:true});
 await page.locator('[data-use-law]').click();await page.locator('[data-scope]').first().check();await page.locator('[data-adopt-ground]').click();
 assert.match(await page.locator('#ground-status').innerText(),/적용 요건/);
 await page.locator('[data-law-conditions]').check();await page.locator('[data-law-authority]').check();await page.locator('[data-adopt-ground]').click();
 await page.locator('[data-next]').click();assert.equal(await page.locator('.doc-notice').count(),1);
 assert.match(await page.locator('.doc-notice').innerText(),/성명/);
 assert.doesNotMatch(await page.locator('.doc-notice').innerText(),/휴대전화번호/);
 assert.match(await page.locator('.doc-notice').innerText(),/개인정보 보호법 제15조 제1항 제2호/);
 console.log('PASS only explicitly scoped and confirmed law basis becomes a notice');
 await page.locator('[data-go="3"]').first().click();await page.locator('details.basis summary').click();await page.locator('[data-edit-ground]').click();
 await page.route('**/api/law/catalog',r=>r.fulfill({json:{laws:[{law:'시험법',mst:'123',effectiveDate:'20200101',department:'테스트기관',kind:'법률'}],page:1,hasNext:false}}));
 await page.route('**/api/law/articles',r=>r.fulfill({json:{law:'시험법',mst:'123',effectiveDate:'20200101',articles:[{value:'11',title:'테스트 조문',text:'테스트 조문 전체',paragraphs:[{value:'1',text:'테스트 항',clauses:[{value:'2',text:'테스트 호'}]}],clauses:[]}]}}));
 await page.locator('[data-law-query]').fill('시험');await page.locator('[data-catalog-search]').click();
 await page.locator('[data-catalog-law]').click();await page.locator('[data-pick-article]').selectOption('11');
 await page.locator('[data-pick-paragraph]').selectOption('1');await page.locator('[data-pick-clause]').selectOption('2');
 assert.match(await page.locator('.picked-citation').innerText(),/시험법 제11조 제1항 제2호/);
 assert.equal(await page.locator('[data-path="groundDraft.law"]').count(),0);
 assert.match(await page.locator('.basis-selection').innerText(),/원문 미확인/);
 await page.locator('[data-adopt-ground]').click();assert.match(await page.locator('#ground-status').innerText(),/원문을 먼저 확인/);
 console.log('PASS editing a verified citation invalidates verification');
 console.log('PASS official search result → article/paragraph/clause selection without text entry');
 await page.screenshot({path:'.test-output/step3-law-picker.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'.test-output/picker-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:1440,height:1100});
 // Return to original adopted basis; edits are not saved on failure.
 await page.locator('[data-cancel-ground]').click();await page.locator('[data-next]').click();
 await page.locator('[data-title]').click();await page.locator('[data-intro]').click();await page.locator('[data-child][value="no"]').check();
 for(const el of await page.locator('[data-path^="refusals."]').all())await el.fill('테스트용 안내: 미제공 시 신청이 제한될 수 있습니다.');
 await page.locator('[data-finish]').click();
 for(const format of ['pdf','hwpx']){
  const pending=page.waitForEvent('download');await page.locator(`[data-${format}]`).click();const download=await pending;
  await download.saveAs(`.test-output/output.${format}`);assert.ok((await fs.stat(`.test-output/output.${format}`)).size>1000);
 }
 console.log('PASS PDF and HWPX export regression');
 await stage3();
 await page.route('**/api/status',r=>r.abort('connectionrefused'));
 await page.locator('[data-ai-law]').click();await page.getByRole('alert').waitFor();
 assert.match(await page.getByRole('alert').innerText(),/로컬 API 서버와 연결/);
 assert.doesNotMatch(await page.getByRole('alert').innerText(),/Failed to fetch/);
 console.log('PASS connection failure gives actionable local-server instructions');
 assert.deepEqual(errors,[]);console.log('8 browser checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

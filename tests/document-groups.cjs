// Synthetic legal proofs exercise document grouping and exported tables.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const rules=require('../law-basis.js').rules;
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3008';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const proof=code=>{const r=rules[code],pipa={law:'개인정보 보호법',article:r.article,paragraph:r.paragraph,clause:r.clause,cite:r.pipa,excerpt:'테스트 근거 원문'};return {...pipa,basisCode:code,pipa,pipaVerified:true,supportVerified:true,verified:true};};
  await page.route('**/api/law/basis',r=>r.fulfill({json:proof(r.request().postDataJSON().basisCode)}));
  await page.route('**/api/law/apply',r=>r.fulfill({json:proof(r.request().postDataJSON().basisCode)}));
  await page.goto(base);await page.locator('[data-quick-create]').click();await page.locator('[name=template]').selectOption('1');await page.locator('.quick-create-form [type=submit]').click();
  await page.locator('[data-path=agency]').fill('시험 기관');await page.locator('[data-bulk-required=collect][value=required]').click();
  for(const name of ['주소','이메일 주소','건강정보']){await page.locator('[data-add=collect]').click();await page.locator('[data-item-preset]').last().selectOption(name);}
  await page.locator('[data-required]').nth(2).check();await page.locator('[data-next]').click();await page.locator('[data-next]').click();
  const manual=async(code,indices)=>{
   await page.locator('[data-add-ground]').click();await page.locator('[data-basis-code]').selectOption(code);await page.waitForFunction(()=>!document.querySelector('[data-basis-code]').disabled);
   for(const n of indices)await page.locator('[data-scope]').nth(n).check();
   assert.equal(await page.locator('[data-law-conditions]').count(),0);await page.locator('[data-adopt-ground]').click();await page.locator('[data-adopt-ground]').waitFor({state:'detached'});
  };
  await manual('contract',[0,1]);await page.locator('[data-next]').click();
  const table=()=>page.locator('[data-document-category="collect.general.필수"]');
  assert.equal(await table().count(),1);assert.equal(await table().locator('table').count(),1);
  const notices=()=>page.locator('.doc-notice');
  assert.equal(await notices().locator('.doc-notice-row').count(),1);
  assert.match(await notices().innerText(),/성명, 휴대전화번호/);
  assert.doesNotMatch(await table().innerText(),/성명|휴대전화번호/);
  assert.equal(await page.locator('[contenteditable]').count(),0);
  assert.ok(await page.locator('.notice-section').evaluate(e=>Boolean(e.previousElementSibling?.matches('.sign'))));
  const clause=rules.contract.pipa;assert.equal((await notices().innerText()).split(clause).length-1,1);
  console.log('PASS consent stays separate and notices below it batch identical legal grounds');
  await page.locator('[data-go="3"]').first().click();await manual('legitimate',[1]);await page.locator('[data-next]').click();
  assert.equal(await notices().locator('.doc-notice-row').count(),2);assert.equal(await notices().locator('td[rowspan="2"]').count(),2);
  assert.equal(await page.locator('.doc-category').count(),3);
  await page.locator('[data-toggle-document-edit]').click();
  const shared=notices().locator('[data-merge-keys] [data-edit$=".purpose"]');await shared.fill('수정한 공통 처리 목적');await page.locator('[data-toggle-document-edit]').click();assert.equal(await page.locator('[contenteditable]').count(),0);
  await page.locator('[data-intro]').click();await page.locator('[data-child][value=no]').check();
  for(const field of await page.locator('[data-path^="refusals."]').all())await field.fill('시험용 거부 시 안내');
  await page.locator('[data-finish]').last().click();
  assert.equal(await table().count(),1);assert.equal(await table().locator('[data-edit]').count(),0);
  assert.match(await notices().innerText(),/수정한 공통 처리 목적/);assert.doesNotMatch(await table().innerText(),/수정한 공통 처리 목적/);assert.equal(await notices().locator('td[rowspan="2"]').count(),2);
  await fs.mkdir('.test-output',{recursive:true});await page.screenshot({path:'.test-output/grouped-document.png',fullPage:true});
  for(const format of ['pdf','hwpx']){const pending=page.waitForEvent('download');await page.locator(`[data-${format}]`).click();const file=await pending;await file.saveAs(`.test-output/grouped-output.${format}`);assert.ok((await fs.stat(`.test-output/grouped-output.${format}`)).size>1000);}
  await page.locator('[data-go="4"]').click();
  const longPurpose=Array.from({length:100},(_,n)=>'연속검증'+String(n).padStart(3,'0')).join(' ');
  await page.locator('[data-toggle-document-edit]').click();await notices().locator('[data-merge-keys] [data-edit$=".purpose"]').fill(longPurpose);await page.locator('[data-toggle-document-edit]').click();await page.locator('[data-finish]').last().click();
  const longDownload=page.waitForEvent('download');await page.locator('[data-pdf]').click();await (await longDownload).saveAs('.test-output/grouped-long.pdf');
  assert.deepEqual(errors,[]);console.log('PASS different grounds retain rows, notice cells span two rows separately from consent, edits survive and PDF/HWPX export');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

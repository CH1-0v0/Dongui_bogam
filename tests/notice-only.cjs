// Synthetic proofs verify notice-only and mixed documents in preview and exports.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const rules=require('../frontend/law-basis.js').rules,base=process.env.TEST_BASE_URL||'http://127.0.0.1:3051';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 await fs.mkdir('.test-output',{recursive:true});
 for(const mixed of [false,true]){
  const p=await b.newPage({acceptDownloads:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/status',r=>r.fulfill({json:{app:'dongui',apiVersion:8,aiConfigured:true,lawConfigured:true,csrfToken:'synthetic'}}));
  const rule=rules.contract,proof={law:'개인정보 보호법',article:rule.article,paragraph:rule.paragraph,clause:rule.clause,cite:rule.pipa,excerpt:'[합성] 시험 근거',basisCode:'contract',verified:true,pipaVerified:true,supportVerified:true};proof.pipa={...proof};
  for(const path of ['basis','apply'])await p.route('**/api/law/'+path,r=>r.fulfill({json:proof}));
  await p.goto(base);await p.locator('[data-quick-create]').click();await p.locator('[name=template]').selectOption('1');await p.locator('.quick-create-form [type=submit]').click();await require('./educational-fixture.cjs')(p);await p.evaluate(v=>{state.agency=v;},'합성 시험 기관');await p.locator('[data-bulk-required=collect][value=required]').click();
  if(mixed){await p.locator('[data-add=collect]').click();await p.locator('[data-item-preset]').last().selectOption('주소');}
  await p.locator('[data-next]').click();await p.locator('[data-next]').click();await p.locator('[data-add-ground]').click();await p.locator('[data-basis-code]').selectOption('contract');await p.waitForFunction(()=>!document.querySelector('[data-basis-code]').disabled);
  for(const n of [0,1])await p.locator('[data-scope]').nth(n).check();await p.locator('[data-adopt-ground]').click();await p.locator('[data-adopt-ground]').waitFor({state:'detached'});await p.locator('[data-next]').click();
  const check=async()=>{const legal=rule.pipa+'에 따라 동의없이 개인정보를 수집·이용합니다.';assert.deepEqual(await p.locator('.doc-notice-intro').allTextContents(),mixed?[legal]:[]);if(!mixed)assert.equal(await p.locator('.doc-intro').textContent(),legal+' 처리 목적 및 개인정보 항목 등 처리 내용을 확인해주시기 바랍니다.');assert.equal(await p.locator('.doc-notice-heading').count(),mixed?1:0);assert.equal(await p.locator('.notice-section').count(),mixed?1:0);assert.equal(await p.locator('.doc-category').count(),mixed?1:0);assert.equal(await p.locator('.doc-notice table').count(),1);assert.match(await p.locator('.doc-notice').innerText(),/성명.*휴대전화번호/s);};
  await check();await p.locator('[data-toggle-document-edit]').click();await check();await p.locator('[data-toggle-document-edit]').click();

  if(mixed){await p.locator('[data-child][value=no]').check();for(const field of await p.locator('[data-path^="refusals."]').all())await field.fill('합성 거부 안내');}
  await p.locator('[data-finish]').last().click();await check();
  const name=mixed?'notice-mixed':'notice-only';await p.screenshot({path:'.test-output/'+name+'.png',fullPage:true});
  for(const format of ['pdf','hwpx']){const pending=p.waitForEvent('download',{timeout:120000});await p.locator(`[data-${format}]`).click();const d=await pending.catch(async e=>{console.error({format,status:await p.locator('#output-status').innerText(),errors});throw e;});await d.saveAs(`.test-output/${name}.${format}`);assert.ok((await fs.stat(`.test-output/${name}.${format}`)).size>1000);}
  assert.deepEqual(errors,[]);console.log('PASS '+name+' preview, editing, final document, PDF and HWPX');await p.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});

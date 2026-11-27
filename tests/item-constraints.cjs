// Real UI interactions; all legal and classification responses are synthetic.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3042';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/status',r=>r.fulfill({json:{app:'dongui',apiVersion:8,aiConfigured:true,lawConfigured:true,csrfToken:'synthetic'}}));
 await page.route('**/api/privacy/classify',r=>r.fulfill({json:{items:r.request().postDataJSON().items.map(i=>({...i,verdict:'uncertain',reason:'합성 분류'}))}}));
 await page.goto(base);await page.locator('[data-quick-create]').click();await page.locator('[name=template]').selectOption('1');await page.locator('.quick-create-form [type=submit]').click();await require('./educational-fixture.cjs')(page);await page.evaluate(v=>{state.agency=v;},'합성 시험 기관');
 const add=async name=>{await page.locator('[data-add=collect]').click();await page.locator('[data-item-preset]').last().selectOption(name);};
 const row=name=>page.locator('.item-row').filter({has:page.locator('[data-item-menu]').filter({hasText:new RegExp('^'+name+' ')})});
 await add('주민등록번호');assert.equal(await row('주민등록번호').locator('[data-required]').isChecked(),true);assert.equal(await row('주민등록번호').locator('[data-required]').isDisabled(),true);
 await page.locator('[data-bulk-required=collect][value=optional]').click();assert.equal(await row('주민등록번호').locator('[data-required]').isChecked(),true);
 await row('주민등록번호').locator('[data-required]').evaluate(n=>{n.checked=false;n.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal(await row('주민등록번호').locator('[data-required]').isChecked(),true);
 for(const key of ['provide','extra','marketing']){await page.locator(`[data-enable=${key}]`).check();const scoped=page.locator(`.item-row[data-item-group=${key}]`).last();await scoped.locator('[data-item-preset]').selectOption(key==='marketing'?'custom':'주민등록번호');if(key==='marketing')await scoped.locator('[data-name]').fill('주민번호');assert.equal(await scoped.locator('[data-required]').isChecked(),true);assert.equal(await scoped.locator('[data-required]').isDisabled(),true);if(key!=='marketing'){await page.locator(`[data-bulk-required=${key}][value=optional]`).click();assert.equal(await scoped.locator('[data-required]').isChecked(),true);}await page.locator(`[data-enable=${key}]`).uncheck();}
 await add('건강정보');await add('주소');await add('생년월일');await add('이메일 주소');await add('전화번호');await add('계좌번호');await add('소속 기관명');
 assert.equal(await row('주민등록번호').locator('[data-item-risk]').isVisible(),true);
 assert.equal(await page.locator('.workspace aside').count(),0);
 await add('주소');await row('주소').last().locator('[data-delete]').click();
 await page.locator('[data-next]').click();await page.locator('[data-class-group=collect]').waitFor();
 const card=category=>page.locator(`[data-class-group=collect] [data-drop-category=${category}]`);
 const general=()=>page.locator('.class-item').filter({has:page.getByText('성명',{exact:true})});
 const sensitive=()=>page.locator('.class-item').filter({has:page.getByText('건강정보',{exact:true})});
 assert.equal(await general().locator('option[value=sensitive]').isDisabled(),true);await general().locator('[data-drag-item]').dragTo(card('sensitive'));assert.equal(await card('optional').locator('.class-item').filter({has:page.getByText('성명',{exact:true})}).count(),1);
 await general().locator('[data-drag-item]').focus();await page.keyboard.press('ArrowRight');assert.equal(await card('required').locator('.class-item').filter({has:page.getByText('성명',{exact:true})}).count(),1);
 await general().locator('[data-drag-item]').focus();await page.keyboard.press('ArrowRight');assert.equal(await card('optional').locator('.class-item').filter({has:page.getByText('성명',{exact:true})}).count(),1);
 await sensitive().locator('[data-drag-item]').dragTo(card('optional'));await sensitive().locator('[data-drag-item]').focus();await page.keyboard.press('ArrowRight');assert.equal(await card('sensitive').locator('.class-item').filter({has:page.getByText('건강정보',{exact:true})}).count(),1);
 assert.equal(await sensitive().locator('option[value=required]').isDisabled(),true);
 await general().locator('[data-kind]').evaluate(n=>{n.value='sensitive';n.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal(await card('optional').locator('.class-item').filter({has:page.getByText('성명',{exact:true})}).count(),1);
 await page.locator('[data-next]').click();let release;await page.route('**/api/law/search',async r=>{await new Promise(resolve=>release=resolve);await r.fulfill({json:{candidates:[],rejected:[],searchSources:[{url:'https://www.nts.go.kr/synthetic',title:'합성 출처'}]}});});
 await page.locator('[data-ai-law]').click();assert.equal(await page.locator('[data-ai-law]').innerText(),'AI가 법령 근거를 찾는 중...');while(!release)await page.waitForTimeout(10);release();await page.waitForFunction(()=>!document.querySelector('[data-ai-law]').disabled);assert.equal(await page.locator('.web-search-sources').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS RNN required invariant, preset movement boundaries, live collection findings, search label and hidden research citations');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

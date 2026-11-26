// Exercise first entry, unchanged events, actual edits and a new draft without paid APIs.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3042';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/status',r=>r.fulfill({json:{app:'dongui',apiVersion:8,aiConfigured:true,lawConfigured:true,csrfToken:'synthetic'}}));
 await page.route('**/api/privacy/classify',r=>r.fulfill({json:{items:r.request().postDataJSON().items.map(i=>({...i,verdict:'uncertain'}))}}));
 await page.route('**/api/law/search',r=>r.fulfill({json:{candidates:[{law:'합성 검증법',article:'10',cite:'합성 검증법 제10조',type:'collect',basisCode:'statutory',verified:true,excerpt:'[합성] 법령 본문입니다. '.repeat(40),sourceUrl:'https://www.law.go.kr/synthetic'}],rejected:[],summary:'합성 검색 완료'}}));
 const start=async()=>{await page.locator('[data-quick-create]').click();await page.locator('[name=template]').selectOption('1');await page.locator('.quick-create-form [type=submit]').click();await require('./educational-fixture.cjs')(page);await page.evaluate(v=>{state.agency=v;},'합성 시험 기관');await page.locator('[data-path="groups.collect.purpose"]').fill('합성 행사 운영');};
 const enterLaws=async()=>{await page.locator('[data-next]').click();await page.locator('[data-class-group=collect]').waitFor();await page.locator('[data-next]').click();await page.locator('[data-ai-law]').waitFor();};
 const notice=()=>page.locator('.search-summary');
 await page.goto(base);await start();await enterLaws();assert.equal(await notice().count(),0,'first entry must not claim inputs changed');
 await page.locator('[data-go="2"]').first().click();await page.locator('[data-next]').click();assert.equal(await notice().count(),0,'navigation alone must not invalidate');
 await page.locator('[data-ai-law]').click();await page.getByText('합성 검색 완료',{exact:true}).waitFor();
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const size=await page.locator('.candidate-block .source-disclosure .law-excerpt').evaluate(n=>parseFloat(getComputedStyle(n).fontSize));assert.ok(Math.abs(size-(16-4/3))<.02,`source text should be 1pt smaller at ${width}px`);}
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('[data-go="2"]').first().click();await page.locator('[data-kind]').first().evaluate(n=>n.dispatchEvent(new Event('change',{bubbles:true})));await page.locator('[data-next]').click();assert.equal(await notice().innerText(),'합성 검색 완료','unchanged classification must retain search');
 await page.locator('[data-go="1"]').first().click();await page.locator('[data-item-preset]').first().selectOption('주소');await enterLaws();assert.match(await notice().innerText(),/입력 내용이 바뀌었습니다/,'actual item changes must invalidate');
 await page.locator('[data-ai-law]').click();await page.getByText('합성 검색 완료',{exact:true}).waitFor();
 await page.locator('[data-go="1"]').first().click();await page.locator('[data-path="groups.collect.purpose"]').fill('변경한 합성 업무');await enterLaws();assert.match(await notice().innerText(),/입력 내용이 바뀌었습니다/,'purpose changes must still invalidate');
 await page.locator('#homeNav').click();page.once('dialog',d=>d.accept());await start();await enterLaws();assert.equal(await notice().count(),0,'fresh draft must reset the baseline');assert.deepEqual(errors,[]);
 console.log('PASS first-entry notice, unchanged navigation/classification, actual item/purpose changes fresh draft and 1pt source text reduction');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

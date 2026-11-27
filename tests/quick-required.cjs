// Quick creation fills the form and reviews required fee items and checks resident-number permission.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3055';

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  const errors=[];
  let outcome='not_found',calls=0;
  const feeItems=['성명','주민등록번호','은행명','계좌번호','예금주명'];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/status',route=>route.fulfill({json:{app:'dongui',apiVersion:8,aiConfigured:true,lawConfigured:true,csrfToken:'synthetic'}}));
  await page.route('**/api/work/plan',async route=>{
   calls++;
   const waiting=page.locator('.quick-create-form [type=submit][aria-busy=true]');
   assert.equal(await waiting.locator('.review-spinner').isVisible(),true);
   assert.equal(await waiting.isDisabled(),true);
   const data=route.request().postDataJSON();
   assert.ok(feeItems.every(name=>data.manual.items.split(', ').includes(name)));
   assert.equal(data.manual.period,'5년');
   assert.deepEqual(data.messages,[]);
   const grounds=['statutory','residentLaw'].map(basisCode=>({
    basisCode,type:'collect',law:'합성 검증법',article:'10',cite:'합성 검증법 제10조',
    itemNames:basisCode==='residentLaw'?['주민등록번호']:outcome==='partial'?['주민등록번호','성명']:feeItems,verified:true,pipaVerified:true,supportVerified:true
   }));
   return route.fulfill({json:{residentCheck:{status:outcome==='not_found'?outcome:'confirmed'},grounds:outcome==='not_found'?[]:grounds}});
  });
  async function use(title,step){
   await page.goto(base);
   const index=await page.evaluate(title=>quickTemplates.findIndex(template=>template.title===title),title);
   assert.ok(index>=0,title);
   await page.locator('[data-quick-create]').click();
   await page.locator('[name=template]').selectOption(String(index));
   const items=page.locator('[data-quick-items]');
   await items.fill(await items.inputValue()+', 소속');
   await page.locator('.quick-create-form [type=submit]').click();
   await page.locator(`.stepper [data-go="${step}"][aria-current="step"]`).waitFor();
   return page.evaluate(()=>state.groups.collect.items.map(item=>[item.name,item.required]));
  }
  const event=await use('교육·행사 참여 동의서',4);
  assert.ok(event.some(([,required])=>!required));
  assert.equal(calls,0);
  assert.equal(await page.evaluate(()=>state.groups.collect.period),'교육·행사 종료 후 1년');
  assert.equal(await page.locator('.preview-panel h2').textContent(),'문서 미리보기');
  assert.equal(await page.locator('[data-finish]').count(),1);

  const fee=await use('강사료·자문료 지급 동의서',3);
  assert.ok(fee.length>=6&&fee.every(([,required])=>required));
  assert.equal(calls,1);
  await page.getByText(/주민등록번호 처리 근거를 확인하지 못했습니다/).waitFor();
  assert.ok(await page.locator('[data-next]').isDisabled());

  outcome='partial';
  await use('강사료·자문료 지급 동의서',4);
  assert.equal(calls,2);
  await page.getByText(/근거가 확인된 항목만 고지사항에 반영/).waitFor();

  outcome='confirmed';
  await use('강사료·자문료 지급 동의서',4);
  assert.equal(calls,3);
  const applied=await page.evaluate(()=>state.grounds.map(ground=>ground.ids.map(id=>getItem(id).name)));
  assert.deepEqual(applied,[feeItems,['주민등록번호']]);
  const notice=await page.locator('.doc-notice').textContent();
  for(const name of feeItems)assert.ok(notice.includes(name),name);
  assert.deepEqual(errors,[]);
  console.log('PASS quick templates fill the period, apply verified grounds to all covered fee items and open the correct step');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

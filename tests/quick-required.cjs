// Quick creation fills the form and checks a resident-number ground once when needed.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3055';

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  const errors=[];
  let found=false,calls=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/status',route=>route.fulfill({json:{app:'dongui',apiVersion:8,aiConfigured:true,lawConfigured:true,csrfToken:'synthetic'}}));
  await page.route('**/api/work/plan',route=>{
   calls++;
   const data=route.request().postDataJSON();
   assert.ok(data.manual.items.includes('주민등록번호'));
   assert.equal(data.manual.period,'5년');
   assert.deepEqual(data.messages,[]);
   const grounds=['statutory','residentLaw'].map(basisCode=>({
    basisCode,type:'collect',law:'합성 검증법',article:'10',cite:'합성 검증법 제10조',
    itemNames:['주민등록번호','성명'],verified:true,pipaVerified:true,supportVerified:true
   }));
   return route.fulfill({json:{residentCheck:{status:found?'confirmed':'not_found'},grounds:found?grounds:[]}});
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
  assert.match(await page.locator('#message').textContent(),/주민등록번호 근거 확인이 필요합니다/);

  found=true;
  await use('강사료·자문료 지급 동의서',4);
  assert.equal(calls,2);
  assert.deepEqual(await page.evaluate(()=>state.grounds.flatMap(ground=>ground.ids.map(id=>getItem(id).name))),['주민등록번호','주민등록번호']);
  assert.match(await page.locator('.doc-notice').textContent(),/주민등록번호/);
  assert.deepEqual(errors,[]);
  console.log('PASS quick templates fill the period, apply confirmed resident grounds once and open the correct step');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

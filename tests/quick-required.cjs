// Quick templates marked required set every item required; others keep their defaults.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3055';
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
const use=async title=>{await p.goto(base);const n=await p.evaluate(t=>quickTemplates.findIndex(q=>q.title===t),title);assert.ok(n>=0,title);await p.locator('[data-quick-create]').click();await p.locator('[name=template]').selectOption(String(n));await p.locator('[data-quick-items]').fill(await p.locator('[data-quick-items]').inputValue()+', 소속');await p.locator('.quick-create-form [type=submit]').click();await p.locator('.stepper').waitFor();return p.evaluate(()=>state.groups.collect.items.map(i=>[i.name,i.required]));};
const fee=await use('강사료·자문료 지급 동의서');assert.ok(fee.length>=6&&fee.every(([,r])=>r===true),'lecture-fee template: all items required, including added ones');
const event=await use('교육·행사 참여 동의서');assert.ok(event.some(([,r])=>r===false),'other templates keep optional defaults');
assert.deepEqual(errors,[]);console.log('PASS lecture/advisory fee quick template sets every item required');}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});

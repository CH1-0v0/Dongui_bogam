// Optional items get their own purpose/period from the chat; the summary shows them only when they differ.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3055';
const plan={agency:'',purpose:'합성 행사 운영',shortPurpose:'행사',recipient:'',items:[],suggestedItems:[{name:'성명',required:true,classification:'general',origin:'draft'},{name:'이메일 주소',required:false,classification:'general',origin:'draft'}],period:'',suggestedPeriod:'행사 종료 후 3개월',periodOrigin:'',grounds:[],proposedGrounds:[],retainedItems:[],removedItems:[],verifiedSources:[],failures:[],reply:'합성 정리',residentCheck:{status:'not_found'},legalChecked:true,evidenceRefs:[],evidenceFacts:{items:[],period:null},optionalPurpose:'',optionalPeriod:'',optionalOrigin:{purpose:'',period:''},
 questions:["선택 항목에도 필수 항목과 같은 이용 목적을 적용할까요? O: 같은 목적 적용 / X: 다른 목적 입력","선택 항목에도 필수 항목과 같은 보유 및 이용기간을 적용할까요? O: 같은 기간 적용 / X: 다른 기간 입력"]};
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:1280,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
await p.route('**/api/status',r=>r.fulfill({json:{app:'dongui',apiVersion:8,aiConfigured:true,lawConfigured:true,csrfToken:'synthetic'}}));
let body,turn=0;await p.route('**/api/work/plan',r=>{body=r.request().postDataJSON();turn++;r.fulfill({json:turn===1?{...plan,checkedAt:Date.now()}:{...plan,questions:[],optionalPeriod:'동의 철회 시까지',optionalOrigin:{purpose:'user',period:'user'},checkedAt:Date.now()}});});
await p.goto(base);await p.locator('[data-work-home] textarea').fill('합성 행사를 운영합니다.');await p.locator('[data-work-home] [type=submit]').click();await p.locator('[data-work-continue]').waitFor();
const summary=()=>p.locator('.work-summary .work-fields').innerText();assert.doesNotMatch(await summary(),/선택 항목/,'same purpose/period is not shown');
await p.locator('[data-work-choice="O"][data-work-choice-kind="optionalPurpose"]').click();await p.locator('[data-work-choice="X"][data-work-choice-kind="optionalPeriod"]').click();
const box=p.locator('[data-work-detail="optionalPeriod"]');assert.ok(await box.evaluate(n=>n===document.activeElement));await box.fill('동의 철회 시까지');
await p.locator('[data-work-reply] [type=submit]').click();await p.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));await p.waitForTimeout(300);
const sent=body.messages.at(-1).content;assert.match(sent,/선택 항목 이용 목적: 필수 항목과 같은 목적을 적용합니다\./);assert.match(sent,/선택 항목 보유 및 이용기간: 동의 철회 시까지\. 이 기간으로 변경합니다\./);
const shown=await summary();assert.match(shown,/선택 항목 보유기간\s*동의 철회 시까지/);assert.doesNotMatch(shown,/선택 항목 이용 목적/);
await p.locator('[data-work-continue]').click();await p.locator('[data-work-finish]').click();await p.locator('[data-path=agency]').waitFor();
assert.equal(await p.evaluate(()=>state.groups.collect.optionalPeriod),'동의 철회 시까지');assert.equal(await p.evaluate(()=>state.groups.collect.optionalPurpose),'');const doc=await p.evaluate(()=>documentHTML(false));assert.match(doc,/동의 철회 시까지/,'optional consent shows its own period');assert.match(doc,/행사 종료 후 3개월/,'required consent keeps the main period');
assert.deepEqual(errors,[]);console.log('PASS optional-item purpose/period are asked separately, shown only when different and carried to the document');}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});

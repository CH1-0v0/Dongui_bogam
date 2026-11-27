// Answers that need more than O/X are typed under their own question and sent paired with it.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3055';
const plan={agency:'',purpose:'합성 강사료 지급',shortPurpose:'강사료',recipient:'',items:[],suggestedItems:[{name:'성명',required:true,classification:'general',origin:'draft'}],period:'',suggestedPeriod:'5년',periodOrigin:'',grounds:[],proposedGrounds:[],retainedItems:[],removedItems:[],verifiedSources:[],failures:[],reply:'합성 정리',residentCheck:{status:'not_found'},legalChecked:true,evidenceRefs:[],evidenceFacts:{items:[],period:null},
 questions:['보유·이용기간은 초안대로 적용할까요? O: 초안 기간 유지 / X: 변경할 기간 입력','합성 소득으로 처리하나요? O: 예 / X: 다른 소득으로 처리(직접 입력)','합성 강의 횟수를 알려주세요.']};
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:1280,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/api/status',r=>r.fulfill({json:{app:'dongui',apiVersion:8,aiConfigured:true,lawConfigured:true,csrfToken:'synthetic'}}));
let body;await p.route('**/api/work/plan',r=>{body=r.request().postDataJSON();r.fulfill({json:{...plan,checkedAt:Date.now()}});});
await p.goto(base);await p.locator('[data-work-home] textarea').fill('합성 기관에서 강사료를 지급합니다.');await p.locator('[data-work-home] [type=submit]').click();await p.locator('[data-work-continue]').waitFor();
assert.equal(await p.locator('[data-work-detail]').count(),1,'only the free-text question has a box before any choice');
await p.locator('[data-work-choice="X"][data-work-choice-kind="period"]').click();const period=p.locator('[data-work-detail="period"]');assert.ok(await period.evaluate(n=>n===document.activeElement),'changing the period focuses its own box');
await p.locator('[data-work-reply] [type=submit]').click();assert.match(await p.getByRole('alert').innerText(),/해당 질문 아래 칸/);
await period.fill('사업 종료 후 3년');await p.locator('[data-work-choice="X"][data-work-choice-kind="generic"]').click();await p.locator('[data-work-detail^="합성 소득"]').fill('합성 사업소득');await p.locator('[data-work-detail^="free:"]').fill('연 2회');
await p.locator('[data-work-reply] [type=submit]').click();await p.waitForFunction(()=>true);await p.waitForTimeout(500);const sent=body.messages.at(-1).content;
assert.match(sent,/보유 및 이용기간: 사업 종료 후 3년\. 이 기간으로 변경합니다\./);assert.match(sent,/질문: 합성 소득으로 처리하나요\?.*\n답변: 다른 소득으로 처리\(직접 입력\)\n추가 내용: 합성 사업소득/);assert.match(sent,/질문: 합성 강의 횟수를 알려주세요\.\n답변: 연 2회/);
await p.locator('[data-work-detail^="free:"]').fill('연 3회');await p.locator('[data-work-continue]').click();await p.locator('[data-work-finish]').waitFor();assert.match(body.messages.at(-1).content,/답변: 연 3회/);
assert.deepEqual(errors,[]);console.log('PASS O/X follow-up details are typed under each question and sent with it');}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});

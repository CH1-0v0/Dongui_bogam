const {chromium}=require('playwright'),assert=require('node:assert/strict');
// AI-written O/X options must render as text, never as HTML.
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/work/plan',r=>r.fulfill({json:{purpose:'행사 참가 신청',items:[{name:'성명',classification:'general',origin:'user'}],period:'행사 종료 후 1년',periodOrigin:'user',grounds:[],residentCheck:{status:'not_needed'},reply:'초안을 만들었습니다.',questions:['행사 참석 여부를 확인할까요? O: <img src=x id=pwn>참석 / X: 불참'],failures:[],checkedAt:Date.now()}}));
 await p.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3088');await p.locator('[data-work-home] textarea').fill('행사 참가 신청자의 성명을 받습니다.');await p.locator('[data-work-home] button[type=submit]').click();
 const button=p.locator('[data-work-choice-kind=generic][data-work-choice=O]');await button.waitFor();
 assert.equal(await p.locator('#pwn').count(),0,'option HTML must not become an element');assert.match(await button.innerText(),/<img src=x id=pwn>참석/);assert.deepEqual(errors,[]);
 console.log('PASS AI-written O/X option labels are escaped');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});

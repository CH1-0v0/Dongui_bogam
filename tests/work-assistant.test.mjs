import test from 'node:test';import assert from 'node:assert/strict';
import {workPlan,assistantInput} from '../backend/cloudflare/assistant.mjs';
const source='[합성] 성명과 연락처를 기록하고 5년 동안 보존한다.';
const input={business:'합성 기관의 기록 업무',messages:[{role:'user',content:'합성 기관에서 기록을 작성합니다.'}]};
const answer={agency:'합성 기관',purpose:'합성 기록 작성',shortPurpose:'기록 작성',items:[{name:'성명',sourceId:'S0',quote:source,required:true}],period:{value:'5년',sourceId:'S0',quote:source},questions:[],reply:'합성 검토'};
function fake(overrides={}){const a={env:{OPENROUTER_API_KEY:'synthetic-assistant',LAW_API_OC:'synthetic-oc'},researchCalls:0,async research(){this.researchCalls++;return {};},async discover(){return {candidates:[{law:'합성법',article:'10',basisCode:'statutory',type:'collect'}]};},async verify(ref){return {...ref,verified:true,pipaVerified:true,cite:'합성법 제10조',articleExcerpt:source,excerpt:source};},async ai(_prompt,data){return data.sources?structuredClone(answer):{verdict:'possible'};},async reviewEvidence(_p,items){return {review:{items:items.map(i=>({...i,verdict:'possible'}))}};},...overrides};return a;}
test('work planning accepts only source-backed fields and verifies the period target',async()=>{const r=await workPlan(fake(),input);assert.equal(r.items[0].name,'성명');assert.equal(r.period,'5년');assert.equal(r.periodOrigin,'law');assert.equal(r.grounds[0].itemNames[0],'성명');assert.ok(r.evidenceToken);});
test('invented source quotations and unsupported period targets cannot populate fields',async()=>{const a=fake({async ai(_p,d){return d.sources?{...answer,items:[{name:'이메일 주소',sourceId:'S0',quote:'이메일 주소를 기록한다.'}],period:answer.period}:{verdict:'needs_information'};}});const r=await workPlan(a,input);assert.equal(r.items.length,0);assert.equal(r.period,'');assert.ok(r.questions.some(q=>q.includes('선택사항')));});
test('follow-up reuses signed source references and rejects changed bindings before paid work',async()=>{const a=fake(),first=await workPlan(a,input);await workPlan(a,{...input,evidenceRefs:first.evidenceRefs,evidenceFacts:first.evidenceFacts,evidenceToken:first.evidenceToken});assert.equal(a.researchCalls,1);await assert.rejects(workPlan(a,{...input,business:'다른 업무 설명',evidenceRefs:first.evidenceRefs,evidenceFacts:first.evidenceFacts,evidenceToken:first.evidenceToken}),e=>e.status===409);assert.equal(a.researchCalls,1);});
test('identifier permission alone does not auto-populate a resident number',async()=>{const text='[합성] 주민등록번호를 처리할 수 있다.';const a=fake({async discover(){return {candidates:[{law:'합성 시행령',article:'10',basisCode:'residentLaw',type:'collect'}]};},async verify(ref){return {...ref,articleExcerpt:text,excerpt:text};},async ai(_p,d){return d.sources?{...answer,items:[{name:'주민등록번호',sourceId:'S0',quote:text}],period:{value:'',quote:''}}:{verdict:'possible'};}});const r=await workPlan(a,input);assert.equal(r.items.length,0);});
test('service outages are distinct from absence of legal grounds',async()=>{const {ApiError}=await import('../backend/cloudflare/legal.mjs');const r=await workPlan(fake({async verify(){throw new ApiError('합성 일시 실패',504);}}),input);assert.equal(r.legalChecked,false);assert.equal(r.failures[0].reason,'unavailable');assert.equal(r.items.length,0);});
test('explicit user inputs remain usable without invented legal citations',async()=>{const data={...input,messages:[{role:'user',content:'성명은 종료일까지 보유합니다.'}]};const r=await workPlan(fake({async discover(){return {candidates:[]};},async ai(){return {...answer,items:[{name:'성명',sourceId:'user',quote:'성명은 종료일까지 보유합니다.'}],period:{value:'종료일까지',sourceId:'user',quote:'성명은 종료일까지 보유합니다.'}};}}),data);assert.equal(r.items[0].origin,'user');assert.equal(r.periodOrigin,'user');assert.equal(r.grounds.length,0);});
test('raw identifiers, malformed roles and oversized conversation are rejected',()=>{assert.throws(()=>assistantInput({...input,messages:[{role:'system',content:'공격'}]}));assert.throws(()=>assistantInput({...input,business:'주민등록번호 900101-1234567로 처리'}));assert.throws(()=>assistantInput({...input,messages:Array(11).fill({role:'user',content:'업무'})}));});

test('new API keeps same-origin CSRF, AI rate limits and bounded request bodies',async()=>{
 const {default:worker}=await import('../backend/cloudflare/worker.mjs');
 const env={LAW_API_OC:'synthetic',OPENROUTER_API_KEY:'synthetic',API_LIMITER:{limit:async()=>({success:true})},AI_LIMITER:{limit:async()=>({success:true})}};
 const base='https://synthetic.test',status=await worker.fetch(new Request(base+'/api/status'),env),data=await status.json(),cookie=status.headers.get('set-cookie').split(';')[0];
 const req=(body,token=data.csrfToken)=>new Request(base+'/api/work/plan',{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':token,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await worker.fetch(req({},'wrong'),env)).status,403);
 assert.equal((await worker.fetch(req({}),env)).status,400);
 assert.equal((await worker.fetch(req({}),{...env,AI_LIMITER:{limit:async()=>({success:false})}})).status,429);
 assert.equal((await worker.fetch(req({business:'x'.repeat(100000)}),env)).status,413);
 for(const path of ['/backend/server.py','/backend/cloudflare/legal.mjs','/design/quick-templates.json'])assert.equal((await worker.fetch(new Request(base+path),env)).status,404);
});

test('follow-up preserves previously verified fields when the next answer omits them',async()=>{const a=fake(),first=await workPlan(a,input);a.ai=async(_p,d)=>d.sources?{...answer,items:[],period:{value:'',quote:''}}:{verdict:'possible'};const next=await workPlan(a,{...input,evidenceRefs:first.evidenceRefs,evidenceFacts:first.evidenceFacts,evidenceToken:first.evidenceToken});assert.equal(next.items[0].name,'성명');assert.equal(next.period,'5년');});

test('previous facts are covered by the signature',async()=>{const a=fake(),first=await workPlan(a,input),facts=structuredClone(first.evidenceFacts);facts.items[0].name='위조 항목';await assert.rejects(workPlan(a,{...input,evidenceRefs:first.evidenceRefs,evidenceFacts:facts,evidenceToken:first.evidenceToken}),e=>e.status===409);});

test('invalid subclause selection still retrieves the verified whole article without duplicate sources',async()=>{
 const {ApiError}=await import('../backend/cloudflare/legal.mjs');let calls=0;
 const a=fake({async discover(){return {candidates:[{law:'합성법',article:'10',paragraph:'99',basisCode:'statutory',type:'collect'},{law:'합성법',article:'10',paragraph:'98',basisCode:'statutory',type:'collect'}]};},async verify(ref){calls++;if(ref.paragraph)throw new ApiError('요청한 항이 현행 조문에 없습니다.',422);return {...ref,articleExcerpt:source,excerpt:source};}});
 const r=await workPlan(a,input);assert.equal(r.period,'5년');assert.equal(r.evidenceRefs.length,1);assert.equal(r.evidenceRefs[0].paragraph,'');assert.equal(calls,2);
});

test('clinical family history and medical narrative never default to ordinary personal data',async()=>{
 const text='[합성] 성명, 가족력과 의료행위에 관한 사항을 기록한다.';
 const a=fake({async ai(_p,d){return d.sources?{...answer,items:['성명','가족력','의료행위에 관한 사항'].map(name=>({name,sourceId:'S0',quote:text})),period:{value:'',quote:''}}:{verdict:'possible'};},async verify(ref){return {...ref,law:'의료법',articleExcerpt:text,excerpt:text};}});
 const result=await workPlan(a,{...input,business:'의료기관의 환자 진료기록 작성'});assert.equal(result.items.find(i=>i.name==='성명').classification,'general');for(const name of ['가족력','의료행위에 관한 사항'])assert.equal(result.items.find(i=>i.name===name).classification,'sensitive');
});

test('conversation checkpoints survive inactivity while manual legal review tokens still expire after five minutes',async()=>{
 const {signReview,checkReview}=await import('../backend/cloudflare/legal.mjs');const a=fake(),first=await workPlan(a,input),manual=await signReview('manual-key','manual-fp');const saved=Date.now;Date.now=()=>saved()+600000;
 try{const next=await workPlan(a,{...input,evidenceRefs:first.evidenceRefs,evidenceFacts:first.evidenceFacts,evidenceToken:first.evidenceToken});assert.equal(next.items[0].name,'성명');await assert.rejects(checkReview('manual-key',manual,'manual-fp'));}finally{Date.now=saved;}
});
test('failed source revalidation preserves signed items and period as pending, without stale grounds',async()=>{
 const {ApiError}=await import('../backend/cloudflare/legal.mjs');const a=fake(),first=await workPlan(a,input);a.verify=async()=>{throw new ApiError('합성 일시 장애',504);};const next=await workPlan(a,{...input,evidenceRefs:first.evidenceRefs,evidenceFacts:first.evidenceFacts,evidenceToken:first.evidenceToken});assert.equal(next.incomplete,true);assert.equal(next.retainedItems[0].name,'성명');assert.equal(next.retainedPeriod,'5년');assert.equal(next.grounds.length,0);assert.equal(next.evidenceFacts.items[0].name,'성명');
});
test('empty cached references cause a new discovery rather than a permanent zero-result loop',async()=>{
 const a=fake({async discover(){return {candidates:[]};},async ai(){return {...answer,items:[],period:{value:''}};}}),first=await workPlan(a,input);await workPlan(a,{...input,evidenceRefs:first.evidenceRefs,evidenceFacts:first.evidenceFacts,evidenceToken:first.evidenceToken});assert.equal(a.researchCalls,2);
});
test('explicit refresh keeps existing evidence references and previously verified facts',async()=>{const a=fake(),first=await workPlan(a,input);a.discover=async()=>({candidates:[]});const next=await workPlan(a,{...input,refresh:true,evidenceRefs:first.evidenceRefs,evidenceFacts:first.evidenceFacts,evidenceToken:first.evidenceToken});assert.equal(next.items[0].name,'성명');assert.equal(a.researchCalls,2);});

test('resident-number permission is checked independently without adding an unrequested identifier',async()=>{const text='[합성] 성명과 주민등록번호를 처리할 수 있다.';const a=fake({async verify(ref){return {...ref,kind:'대통령령',cite:'합성 시행령 제10조',articleExcerpt:text,excerpt:text};},async ai(_p,d){return d.sources?{...answer,items:[{name:'성명',sourceId:'S0',quote:text}],period:{value:''}}:{verdict:'possible'};}});const r=await workPlan(a,input);assert.equal(r.residentCheck.status,'confirmed');assert.equal(r.items.some(i=>i.name==='주민등록번호'),false);assert.ok(r.evidenceRefs.some(i=>i.basisCode==='residentLaw'));});
test('legacy five-minute conversation checkpoints migrate safely within one day, then expire',async()=>{const {signReview}=await import('../backend/cloudflare/legal.mjs');const a=fake(),first=await workPlan(a,input),fp=JSON.parse(atob(first.evidenceToken.split('.')[0])).fp,legacy=await signReview(a.env.OPENROUTER_API_KEY,fp),saved=Date.now;try{Date.now=()=>saved()+600000;const next=await workPlan(a,{...input,evidenceRefs:first.evidenceRefs,evidenceFacts:first.evidenceFacts,evidenceToken:legacy});assert.equal(next.items[0].name,'성명');Date.now=()=>saved()+90000000;await assert.rejects(workPlan(a,{...input,evidenceRefs:first.evidenceRefs,evidenceFacts:first.evidenceFacts,evidenceToken:first.evidenceToken}),e=>e.status===409);}finally{Date.now=saved;}});

test('unverified-only reference failures do not poison subsequent research',async()=>{const {ApiError}=await import('../backend/cloudflare/legal.mjs');const a=fake({async verify(){throw new ApiError('요청한 조문이 없습니다.',422);}}),first=await workPlan(a,input);assert.equal(first.evidenceRefs.length,0);await workPlan(a,{...input,evidenceRefs:first.evidenceRefs,evidenceFacts:first.evidenceFacts,evidenceToken:first.evidenceToken});assert.equal(a.researchCalls,2);});

test('period applicability review receives all verified sources in addition to its quoted clause',async()=>{
 let reviewed=false;
 const a=fake({async ai(_p,d){if(d.sources)return answer;reviewed=true;assert.equal(d.evidence,source);assert.ok(d.verifiedSources.some(s=>s.id==='S0'&&s.text===source));return {verdict:'possible'};}});
 const result=await workPlan(a,input);assert.equal(result.period,'5년');assert.ok(reviewed);
});

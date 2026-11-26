import {ApiError,validateContext,signReview,checkReview} from './legal.mjs';
import {hasPermissionText} from './evidence-discovery.mjs';
import policy from './assistant-policy.json' with {type:'json'};
const clean=(v,n=500)=>typeof v==='string'?v.trim().slice(0,n):'';
const norm=v=>String(v||'').normalize('NFKC').replace(/\s+/g,'');
const classification=value=>{const name=norm(value);return /주민등록번호|주민번호/.test(name)?'rnn':/여권|운전면허|외국인등록/.test(name)?'unique':/종교|사상|신념|성생활|정치|노동조합|정당|건강|진료|유전|범죄|병력|진단|질병|장애|상담|생체|인종|민족|복약|심리|지문|안면|증상|치료|처방|수술|투약|처치|입원|외래|의학|검사결과|맥박|혈압|체온|의료|신체|혈액|가족력/.test(name)?'sensitive':'general';};
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');
export function assistantInput(data){
 const business=clean(data.business,1500),type=data.type||'collect';
 if(business.length<4||!['collect','provide','outside'].includes(type))throw new ApiError('업무 설명과 처리 유형을 확인해 주세요.',400);
 if(!Array.isArray(data.messages)||data.messages.length>10)throw new ApiError('대화는 최근 10개까지 전달해 주세요.',400);
 const messages=data.messages.map(m=>{if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>1500)throw new ApiError('대화 형식을 확인해 주세요.',400);return {role:m.role,content:m.content};});
 const manual=data.manual&&typeof data.manual==='object'?Object.fromEntries(['agency','items','period','recipient'].map(k=>[k,clean(data.manual[k],500)])):{};
 const userText=[business,...messages.filter(m=>m.role==='user').map(m=>m.content),...Object.values(manual)].join('\n');
 for(let i=0;i<userText.length;i+=400)validateContext({items:[{name:'업무 설명',purpose:userText.slice(i,i+450),type,context:type,classification:'general'}]});
 const flow=['collect','extra','provide'].includes(data.flow)?data.flow:type==='provide'?'provide':type==='outside'?'extra':'collect';
 return {business,type,flow,messages,manual,userText};
}
export async function workPlan(api,data){
 const input=assistantInput(data),{business,type,flow,messages,manual,userText}=input;
 if(!api.env.OPENROUTER_API_KEY||!api.env.LAW_API_OC)throw new ApiError('AI 및 공식 법령 연결 설정을 확인해 주세요.',503);
 const reviewPurpose=[flow==='provide'?(type==='outside'?'처리: 목적 외 제공':'처리: 제3자 제공'):flow==='extra'?'처리: 목적 외 이용':'처리: 수집·이용',business.slice(0,500),...messages.filter(m=>m.role==='user').slice(-3).map(m=>m.content.slice(0,250)),manual.agency?'처리 기관: '+manual.agency:''].join('\n').slice(0,1500);
 const context={items:['성명','주민등록번호','건강정보'].map(name=>({name,purpose:business,recipient:manual.recipient||'',type,context:type,classification:classification(name)}))};
 let refs=[],discoveryFailures=[],previous={items:[],period:null};
 const quoteWindow=(quote,value,limit=250)=>{const text=norm(clean(quote,1500)),at=text.indexOf(norm(value));return text.slice(Math.max(0,at-40),Math.max(0,at-40)+limit);};
 const factItem=i=>({name:clean(i?.name,100),required:i?.required===true,sourceId:clean(i?.sourceId,20),quote:quoteWindow(i?.quote,i?.name)});
 const factPeriod=i=>i?{value:clean(i.value,300),sourceId:clean(i.sourceId,20),quote:quoteWindow(i.quote,i.value,400)}:null;
 if(data.evidenceToken){
  if(!Array.isArray(data.evidenceRefs)||data.evidenceRefs.length>8||data.evidenceRefs.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw new ApiError('원문 확인 정보를 확인해 주세요.',400);
  refs=data.evidenceRefs.map(r=>Object.fromEntries(['law','article','paragraph','clause','basisCode','type'].map(k=>[k,clean(r[k],100)])));
  if(data.evidenceFacts){if(!Array.isArray(data.evidenceFacts.items)||data.evidenceFacts.items.length>30)throw new ApiError('이전 입력 정보를 확인해 주세요.',400);previous={items:data.evidenceFacts.items.map(factItem),period:factPeriod(data.evidenceFacts.period)};}
  const fp=await digest({business,type,flow,refs,facts:previous});
  try{await checkReview(api.env.OPENROUTER_API_KEY+':work-state-v2',data.evidenceToken,fp);}catch(error){if(!(error instanceof ApiError))throw error;await checkReview(api.env.OPENROUTER_API_KEY,data.evidenceToken,fp,86100000);}
 }
 if(!refs.length||data.refresh===true){
  const research=await api.research(context),planned=await api.discover(context,research,{assistant:true});
  discoveryFailures=planned.rejected||[];const found=[...new Map(planned.candidates.filter(c=>!c.discoveryError).map(c=>[JSON.stringify([c.law,c.article,c.basisCode,c.type]),Object.fromEntries(['law','article','paragraph','clause','basisCode','type'].map(k=>[k,clean(c[k],100)]))])).values()].slice(0,8);
  const identity=r=>JSON.stringify([r.law,r.article,r.basisCode,r.type]),protectedIds=new Set([...previous.items.map(i=>i.sourceId),previous.period?.sourceId]);
  for(const ref of found)if(!refs.some(r=>identity(r)===identity(ref))){if(refs.length<8)refs.push(ref);else{const replace=refs.findIndex((r,i)=>!protectedIds.has('S'+i)&&!found.some(n=>identity(n)===identity(r)));if(replace>=0)refs[replace]=ref;}}
 }
 const sources=[],failures=discoveryFailures.map(r=>({law:r.law,reason:r.reason}));
 for(const [index,ref] of refs.entries()){if(api.calls+api.cacheOperations>=34){failures.push({law:ref.law,reason:'request_budget'});continue;}try{let proof;try{proof=await api.verify(ref);}catch(error){if(error instanceof ApiError&&(ref.paragraph||ref.clause)&&/요청한 항|요청한 호|조·항·호 번호/.test(error.message)){const articleRef={...ref,paragraph:'',clause:''};proof=await api.verify(articleRef);refs[index]=articleRef;}else throw error;}sources.push({id:'S'+index,proof,text:proof.articleExcerpt||proof.paragraphExcerpt||proof.excerpt});}catch(e){if(!(e instanceof ApiError))throw e;failures.push({law:ref.law,reason:e.status>=500?'unavailable':'not_verified'});}}
 for(const source of [...sources])if(!(api.calls+api.cacheOperations>=34)&&refs.length<8&&['법률','대통령령'].includes(source.proof.kind)&&source.text.includes('주민등록번호')&&!refs.some(r=>r.law===source.proof.law&&r.article===source.proof.article&&r.basisCode==='residentLaw')){
  const ref={law:source.proof.law,article:source.proof.article,paragraph:source.proof.paragraph||'',clause:source.proof.clause||'',basisCode:'residentLaw',type};
  const index=refs.length;refs.push(ref);try{const proof=await api.verify(ref);sources.push({id:'S'+index,proof,text:proof.articleExcerpt||proof.excerpt});}catch(error){if(!(error instanceof ApiError))throw error;failures.push({law:ref.law,reason:error.status>=500?'unavailable':'not_verified'});}
 }
 if(!sources.length&&!previous.items.length&&!previous.period)refs=[];
 const checkpoint=async facts=>({evidenceRefs:refs,evidenceFacts:facts,evidenceToken:await signReview(api.env.OPENROUTER_API_KEY+':work-state-v2',await digest({business,type,flow,refs,facts}),86400000),evidenceExpiresAt:Date.now()+86400000});
 if(!sources.length&&failures.length&&(previous.items.length||previous.period))return {agency:manual.agency||'',purpose:business,shortPurpose:'',recipient:manual.recipient||'',items:[],period:'',periodOrigin:'',grounds:[],verifiedSources:[],retainedItems:previous.items.map(i=>({...i,classification:classification(i.name),origin:i.sourceId==='user'?'user':'law'})),retainedPeriod:previous.period?.value||'',incomplete:true,reply:'공식 원문을 재확인하지 못했습니다. 이전에 확인한 항목과 기간은 지우지 않고 보관했습니다.',questions:['잠시 후 근거를 다시 확인해 주세요. 항목을 다시 입력하실 필요는 없습니다.'],failures,residentCheck:{status:'unavailable',checks:['공식 원문 재확인 필요']},...await checkpoint(previous),checkedAt:0,legalChecked:false};
 const material={business,type,flow,messages,manual,previousFacts:previous,sources:sources.map(s=>({id:s.id,cite:s.proof.cite,text:s.text.slice(0,11000)}))};
 const answer=await api.ai(policy.prompt,material,4500);
 if(!Array.isArray(answer.items)||answer.items.length>30||!answer.period||typeof answer.period!=='object'||Array.isArray(answer.period))throw new ApiError('업무 정리 응답을 읽지 못했습니다. 다시 시도하세요.',502);
 const supported=(value,claim)=>{const quote=clean(claim?.quote,1500),source=sources.find(s=>s.id===claim?.sourceId);return quote&&norm(quote).includes(norm(value))&&(claim.sourceId==='user'?norm(userText).includes(norm(quote)):source&&norm(source.text).includes(norm(quote)));};
 const removed=new Set((Array.isArray(answer.removeItems)?answer.removeItems:[]).filter(i=>i&&norm(userText).includes(norm(clean(i.quote,500)))&&norm(i.quote).includes(norm(i.name))&&/제외|삭제|않|안\s*(?:수집|처리|제공)|불필요/.test(i.quote)).map(i=>i.name));
 const proposed=[...previous.items.filter(i=>!removed.has(i.name)&&(i.sourceId==='user'||supported(i.name,i))),...answer.items.filter(i=>i&&clean(i.name,100)&&supported(clean(i.name,100),i))];
 const periodClaim=clean(answer.period.value,300)&&supported(clean(answer.period.value,300),answer.period)?answer.period:previous.period&&(previous.period.sourceId==='user'||supported(previous.period.value,previous.period))?previous.period:answer.period;
 const itemClass=i=>{const value=classification(i.name);if(value!=='general')return value;const name=norm(i.name),source=sources.find(s=>s.id===i.sourceId);const medical=source?.proof?.law?.startsWith('의료법')||/진료|의료기관|환자/.test(business);const identity=/^(?:환자(?:의)?)?(?:성명|이름|주소|연락처|전화번호|휴대전화번호|생년월일|성별|연령|나이|직업|국적|환자번호|등록번호)$/.test(name);return medical&&!identity?'sensitive':'general';};
 const items=[...new Map(proposed.map(i=>[clean(i.name,100),{name:clean(i.name,100),required:i.required===true,classification:itemClass(i),sourceId:i.sourceId,origin:i.sourceId==='user'?'user':'law'}])).values()];
 let periodStatus=clean(periodClaim.value,300)?'quote_not_verified':'not_found';
 let period=(periodClaim===previous.period&&periodClaim.sourceId==='user'||supported(clean(periodClaim.value,300),periodClaim))?clean(periodClaim.value,300):'';
 if(period)periodStatus='verified_quote';
 let periodOrigin=period?(periodClaim.sourceId==='user'?'user':'law'):'';
 if(period&&periodOrigin==='law'){const source=sources.find(s=>s.id===periodClaim.sourceId);const review=await api.ai(policy.periodReview,{business,messages,period,evidence:source?.text,verifiedSources:material.sources},1000);if(review.verdict!=='possible'){period='';periodOrigin='';periodStatus=['needs_information','not_supported'].includes(review.verdict)?review.verdict:'review_incomplete';}else periodStatus='verified';}
 const grounds=[];let residentCheck={status:failures.length?'unavailable':'not_found',checks:['주민등록번호는 일반 처리 근거와 별도 허용 근거를 함께 확인해야 합니다.']};
 for(const source of sources){const proof=source.proof;if(!hasPermissionText(proof))continue;const supplement={residentLaw:'rnn',sensitiveLaw:'sensitive',uniqueLaw:'unique'}[proof.basisCode];const reviewRows=proof.basisCode==='residentLaw'&&!items.some(i=>i.classification==='rnn')?[...items,{name:'주민등록번호',classification:'rnn'}]:items;const scope=reviewRows.filter(i=>!supplement||i.classification===supplement).map((i,n)=>({...i,id:'assistant-'+n,purpose:reviewPurpose,recipient:clean(answer.recipient)||manual.recipient||'',type,context:type}));if(!scope.length)continue;
  let review;try{({review}=await api.reviewEvidence(proof,scope,false));}catch(error){if(error instanceof ApiError&&error.requestBudget){failures.push({law:proof.law,reason:'request_budget'});continue;}throw error;}if(proof.basisCode==='residentLaw'){const row=review.items.find(i=>i.name==='주민등록번호');if(row&&(residentCheck.status!=='confirmed'||row.verdict==='possible'))residentCheck={status:row.verdict==='possible'?'confirmed':row.verdict,cite:proof.cite,excerpt:proof.excerpt,checks:row.checks||[],explanation:row.explanation||''};}const names=review.items.filter(i=>i.verdict==='possible').map(i=>i.name);if(names.length)grounds.push({...proof,itemNames:names});
 }
 const allowed=items.filter(i=>{if(i.classification!=='rnn')return true;return grounds.some(g=>!['residentLaw','sensitiveLaw','uniqueLaw'].includes(g.basisCode)&&g.itemNames.includes(i.name))&&grounds.some(g=>g.basisCode==='residentLaw'&&g.itemNames.includes(i.name));});
 const withheld=items.filter(i=>!allowed.includes(i)).map(i=>i.name);
 const questions=(Array.isArray(answer.questions)?answer.questions:[]).map(q=>clean(q,300)).filter(Boolean).slice(0,3);
 if(failures.some(f=>f.reason==='request_budget'))questions.unshift('확인된 원문은 유지했습니다. 일부 근거는 서버 조회 한도로 추가 확인이 필요합니다.');
 if(withheld.length)questions.push(withheld.join(', ')+'의 별도 처리 허용 요건을 확인하지 못해 자동 입력하지 않았습니다. 필요한 경우 3단계에서 근거를 확인해 주세요.');
 if(!allowed.length&&!previous.items.length)questions.push('수집하거나 제공할 개인정보 항목을 알려주세요. 직접 입력은 선택사항입니다.');
 if(!period&&!previous.period)questions.push('보유 및 이용기간을 알려주세요. 직접 입력은 선택사항입니다.');
 const retained=previous.items.filter(i=>!removed.has(i.name)&&!allowed.some(a=>a.name===i.name));
 const retainedPeriod=!period&&previous.period?previous.period.value:'';
 const facts={items:allowed.map(i=>factItem(proposed.findLast(p=>clean(p.name,100)===i.name))),period:period?factPeriod({...periodClaim,value:period}):previous.period};
 facts.items.push(...retained.filter(i=>!facts.items.some(a=>a.name===i.name)));
 if(retained.length||retainedPeriod)questions.unshift('이전에 확인한 내용은 보관하고 있습니다. 현재 원문·허용 요건을 다시 확인해 주세요.');
 const agency=clean(answer.agency,100);const recipient=clean(answer.recipient,100);
 if(!agency&&!manual.agency)questions.push('개인정보를 처리하는 기관명을 알려주세요.');
 if(flow==='provide'&&!recipient&&!manual.recipient)questions.push('제공받는 기관을 알려주세요.');
 return {agency:norm(userText).includes(norm(agency))?agency:'',purpose:clean(answer.purpose)||business,shortPurpose:clean(answer.shortPurpose,40),recipient:norm(userText).includes(norm(recipient))?recipient:'',items:allowed,removedItems:[...removed],verifiedSources:[...new Map(sources.map(s=>[s.proof.cite,{law:s.proof.law,article:s.proof.article,cite:s.proof.cite,excerpt:(s.proof.excerpt||'').slice(0,3000)}])).values()],retainedItems:retained.map(i=>({...i,classification:classification(i.name),origin:i.sourceId==='user'?'user':'law'})),retainedPeriod,incomplete:Boolean(retained.length||retainedPeriod),residentCheck,checkedAt:Date.now(),period,periodOrigin,periodStatus,grounds:grounds.map(g=>({...g,itemNames:g.itemNames.filter(n=>allowed.some(i=>i.name===n))})).filter(g=>g.itemNames.length),reply:sources.length?'공식 조문과 입력 내용을 대조해 항목 '+allowed.length+'개를 정리했습니다. 문서로 이동하기 전에 아래 내용을 확인해 주세요.':failures.length?'공식 원문 조회를 완료하지 못했습니다. 필요한 항목과 기간을 추가로 알려주시거나 나중에 확인할 수 있습니다.':'적용할 개별 법령 근거를 확인하지 못했습니다. 추가 항목과 보유기간의 직접 입력은 선택사항입니다.',questions:[...new Set(questions)].slice(0,5),failures,...await checkpoint(facts),legalChecked:sources.length>0};
}

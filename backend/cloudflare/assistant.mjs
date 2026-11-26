import defaults from './work-defaults.json' with {type:'json'};
import {consolidateWorkQuestions,workQuestionCategory,checkToChoiceQuestion,finishWorkQuestions,questionsDoneNote} from './work-questions.mjs';
import {ApiError,validateContext,signReview,checkReview} from './legal.mjs';
import {hasPermissionText,discoveryScope,discoveryMode} from './evidence-discovery.mjs';
import policy from './assistant-policy.json' with {type:'json'};
const clean=(v,n=500)=>typeof v==='string'?v.trim().slice(0,n):'';
const norm=v=>String(v||'').normalize('NFKC').replace(/\s+/g,'');
const classification=value=>{const name=norm(value);return /주민등록번호|주민번호/.test(name)?'rnn':/여권|운전면허|외국인등록/.test(name)?'unique':/종교|사상|신념|성생활|정치|노동조합|정당|건강|진료|유전|범죄|병력|진단|질병|장애|상담|생체|인종|민족|복약|심리|지문|안면|증상|치료|처방|수술|투약|처치|입원|외래|의학|검사결과|맥박|혈압|체온|의료|신체|혈액|가족력/.test(name)?'sensitive':'general';};
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');
export function workDraft(answer,business='',userText=''){
 const draft=answer?.draft||{},seen=new Set();
 const excluded=new Set((Array.isArray(answer?.removeItems)?answer.removeItems:[]).filter(r=>r?.name&&r.quote&&norm(userText).includes(norm(r.quote))&&/제외|삭제|않|안\s*(?:수집|처리|제공)|불필요/.test(r.quote)).map(r=>r.name));
 const payment=new RegExp(defaults.paymentSignals).test(business);
 const rows=[...(Array.isArray(draft.items)?draft.items:[]),...(payment?defaults.paymentItems.map(name=>({name,required:true})):[])];
 const items=rows.slice(0,60).flatMap(row=>{const name=clean(row?.name,100);if(!name||excluded.has(name)||classification(name)==='rnn'||seen.has(name)||/\d{6}[ -]?[1-8]\d{6}|@|01[016789][ -]?\d{3,4}[ -]?\d{4}/.test(name))return [];seen.add(name);return [{name,required:row.required===true,classification:classification(name),origin:'draft'}];});
 const publicPayment=payment&&new RegExp(defaults.publicSignals).test(business+' '+userText),value=clean(draft.period?.value,300),useDefault=publicPayment&&(!value||/^(?:확인\s*필요|미정|미확인|알\s*수\s*없음)$/.test(value));
 return {suggestedItems:items.slice(0,30),suggestedPeriod:useDefault?defaults.publicPaymentPeriod:value,suggestionReason:useDefault?defaults.periodReason:clean(draft.period?.reason,500)};
}
export function irrelevantIncomeSource(proof,userMessages){
 const types=['기타소득','사업소득','근로소득','퇴직소득','연금소득','이자소득','배당소득'];
 const latest=[...userMessages].reverse().find(t=>types.some(k=>t.includes(k)))||'';
 const declared=types.filter(k=>latest.includes(k));
 const title=proof.articleTitle||(proof.articleExcerpt||proof.excerpt||'').match(/제\d+조(?:의\d+)?[（(]([^）)]+)[）)]/)?.[1]||'';
 if(/가산세|과태료|벌칙/.test(title))return true;
 return proof.law==='소득세법'&&declared.length===1&&types.some(k=>k!==declared[0]&&title.includes(k))&&!title.includes(declared[0]);
}
// Write the law name once per law: "의료법 제14조, 제16조"; 의료법 and 의료법 시행령 stay separate.
export function compactCites(cites){const groups=new Map();for(const raw of cites){const text=String(raw||'').trim();if(!text)continue;const m=text.match(/^(.+?)\s+(제\d.*)$/),law=m?m[1]:text,rest=m?m[2]:'';if(!groups.has(law))groups.set(law,[]);if(!groups.get(law).includes(rest))groups.get(law).push(rest);}return [...groups].map(([law,parts])=>parts.filter(Boolean).length?law+' '+parts.filter(Boolean).join(', '):law).join(', ');}
export function applicableGroundSummary(grounds){
 const general=[...new Set(grounds.filter(g=>!['residentLaw','sensitiveLaw','uniqueLaw'].includes(g.basisCode)&&g.itemNames?.length).map(g=>g.cite))];
 return general.length?' 일반 수집·이용에 적용 예정인 근거: '+compactCites(general)+'.':' 일반 수집·이용에 적용할 근거는 현재 조회 결과에서 아직 확인하지 못했습니다.';
}
const supplementCodes=['residentLaw','sensitiveLaw','uniqueLaw'];
const lawFamily=law=>norm(law).replace(/(?:시행령|시행규칙)$/,'');
// The RNN item needs a general processing basis and a specific RNN permission. When the specific
// permission is confirmed for this work, a general basis already confirmed for the same work covers
// the RNN item too: prefer the same law family, otherwise any confirmed general basis.
export function linkResidentGrounds(grounds,proposedGrounds=[]){
 const resident=grounds.filter(g=>g.basisCode==='residentLaw'&&g.itemNames?.includes('주민등록번호'));
 if(!resident.length)return grounds;
 const general=grounds.filter(g=>!supplementCodes.includes(g.basisCode)&&g.itemNames?.length);
 if(general.some(g=>g.itemNames.includes('주민등록번호')))return grounds;
 const families=new Set(resident.map(g=>lawFamily(g.law)));
 const same=general.filter(g=>families.has(lawFamily(g.law)));
 for(const g of same.length?same:general)g.itemNames=[...g.itemNames,'주민등록번호'];
 const linked=new Set((same.length?same:general).map(g=>g.cite));
 for(const g of proposedGrounds)if(linked.has(g.cite)&&!supplementCodes.includes(g.basisCode))g.itemNames=g.itemNames.filter(n=>n!=='주민등록번호');
 for(let i=proposedGrounds.length-1;i>=0;i--)if(!proposedGrounds[i].itemNames.length)proposedGrounds.splice(i,1);
 return grounds;
}
// Unconfirmed resident permission: each fact still to check becomes its own O/X question.
// A period quoted from the law whose application to this work is not yet confirmed: offer it as an editable draft.
// Drop a document label before the period ("진료기록부 : 10년" -> "10년"); start points such as "…부터 10년" stay.
export function periodValue(value){const text=clean(value,300);const stripped=text.replace(/^[^:：\d]{1,30}[:：]\s*/,'');return /\d/.test(stripped)?stripped:text;}
// A period value the AI could not quote exactly, but which appears in a verified retention provision.
export function retentionSourceFor(value,sourceId,sources){const v=norm(value);if(!v||v.length>40)return null;const has=s=>norm(s.text).includes(v)&&/보존|보유|보관/.test(s.text);return sources.find(s=>s.id===sourceId&&has(s))||sources.find(has)||null;}
export function lawPeriodSuggestion(value,cite,reason){return {suggestedPeriod:periodValue(value),suggestionReason:clean((cite?cite+'에서 찾은 보유기간입니다. ':'법령 원문에서 찾은 보유기간입니다. ')+(clean(reason,300)?clean(reason,300)+' ':'')+'적용 대상 서류와 기산점을 확인해 수정해 주세요.',500)};}
// The user's explicit "keep this period" choice is a user-entered value and must survive later turns.
export function keptPeriodChoice(userText){const line=String(userText||'').split('\n').reverse().find(t=>/보유\s*및\s*이용기간[:：].+현재 기간을 그대로 사용합니다/.test(t));const value=clean(line?.match(/보유\s*및\s*이용기간[:：]\s*(.+?)\.?\s*현재 기간을 그대로 사용합니다/)?.[1],300);return /[0-9가-힣A-Za-z]/.test(value)?{value,sourceId:'user',quote:line.slice(0,1500)}:null;}
export function residentChoiceQuestions(check,relevant){return relevant&&check?.status==='needs_information'?[...new Set((check.checks||[]).map(checkToChoiceQuestion).filter(Boolean))].slice(0,3):[];}
export function residentSummary(check,grounds){
 const general=[...new Set(grounds.filter(g=>!supplementCodes.includes(g.basisCode)&&g.itemNames?.includes('주민등록번호')).map(g=>g.cite))];
 if(check.status==='confirmed')return '주민등록번호는 처리할 수 있습니다. 구체적 허용 근거를 확인했습니다: '+check.cite+(general.length?'. 일반 수집·이용 근거: '+compactCites(general)+'. 두 근거를 함께 입력했습니다.':'. 일반 수집·이용 근거는 3단계에서 함께 확인해 주세요.');
 if(check.status==='unavailable')return '주민등록번호 근거가 없다는 판단이 아니라, 원문 조회를 완료하지 못한 상태입니다.';
 return '주민등록번호의 구체적 허용 근거'+(check.cite?'('+check.cite+')':'')+'가 현재 업무에 적용되는지 확정하지 못했습니다.'+(check.checks?.length?' 아래 O/X 질문에 답해 주시면 다시 확인합니다.':'');
}
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
 let reviewPurpose=[flow==='provide'?(type==='outside'?'처리: 목적 외 제공':'처리: 제3자 제공'):flow==='extra'?'처리: 목적 외 이용':'처리: 수집·이용',business.slice(0,500),...messages.filter(m=>m.role==='user').slice(-3).map(m=>m.content.slice(0,250)),manual.agency?'처리 기관: '+manual.agency:''].join('\n').slice(0,1500);
 const recentUsers=messages.filter(m=>m.role==='user');
 const asksGround=/근거|법령|수집.*가능/.test(recentUsers.at(-1)?.content||'')&&/[?？]|나요|가요|까요|습니까|정말|궁금|확인해|알려/.test(recentUsers.at(-1)?.content||'');
 const searchPurpose=[business.slice(0,170),...recentUsers.slice(-2).map(m=>m.content.slice(0,150))].join('\n').slice(0,500);
 const context={additionalAnswers:recentUsers.slice(-4).map(m=>m.content),items:['성명','주민등록번호','건강정보'].map(name=>({name,purpose:searchPurpose,recipient:manual.recipient||'',type,context:type,classification:classification(name)}))};
 // Standard legal premises of a known work type (e.g. withholding duty for lecture fees), given to drafting and review.
 const businessFacts=discoveryScope(context).facts||[];
 if(businessFacts.length)reviewPurpose=['업무 전제: '+businessFacts.join(' '),reviewPurpose].join('\n').slice(0,1500);
 let researchMaterial=null;let refs=[],discoveryFailures=[],previous={items:[],period:null};
 const quoteWindow=(quote,value,limit=250)=>{const text=norm(clean(quote,1500)),at=text.indexOf(norm(value))>=0?text.indexOf(norm(value)):(classification(value)==='rnn'?text.indexOf('주민번호'):-1);return text.slice(Math.max(0,at-40),Math.max(0,at-40)+limit);};
 const factItem=i=>({name:clean(i?.name,100),required:i?.required===true,sourceId:clean(i?.sourceId,20),quote:quoteWindow(i?.quote,i?.name)});
 const factPeriod=i=>i?{value:clean(i.value,300),sourceId:clean(i.sourceId,20),quote:quoteWindow(i.quote,i.value,400)}:null;
 if(data.evidenceToken){
  if(!Array.isArray(data.evidenceRefs)||data.evidenceRefs.length>8||data.evidenceRefs.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw new ApiError('원문 확인 정보를 확인해 주세요.',400);
  refs=data.evidenceRefs.map(r=>Object.fromEntries(['law','article','paragraph','clause','basisCode','type'].map(k=>[k,clean(r[k],100)])));
  if(data.evidenceFacts){if(!Array.isArray(data.evidenceFacts.items)||data.evidenceFacts.items.length>30)throw new ApiError('이전 입력 정보를 확인해 주세요.',400);previous={items:data.evidenceFacts.items.map(factItem),period:factPeriod(data.evidenceFacts.period)};}
  const fp=await digest({business,type,flow,refs,facts:previous});
  try{await checkReview(api.env.OPENROUTER_API_KEY+':work-state-v2',data.evidenceToken,fp);}catch(error){if(!(error instanceof ApiError))throw error;await checkReview(api.env.OPENROUTER_API_KEY,data.evidenceToken,fp,86100000);}
  previous.items=previous.items.map(i=>classification(i.name)==='rnn'?{...i,name:'주민등록번호'}:i);
 }
 // consent: event-like work with no specific law, no law search. profile: known laws, no web search or AI law plan.
 const searchMode=discoveryMode(userText,context),started=Date.now(),timings={};let lap=started;const mark=name=>{const now=Date.now();timings[name]=now-lap;lap=now;};
 if(searchMode!=='consent'&&(!refs.length||data.refresh===true||messages.at(-1)?.role==='user')){
  const research=searchMode==='profile'?{report:'',sources:[]}:await api.research(context);mark('research');
  const planned=await api.discover(context,research,{assistant:true,fast:searchMode==='profile'});mark('discover');
  researchMaterial=searchMode==='profile'?null:{report:clean(research.report,6000),sources:(research.sources||[]).slice(0,8).map(s=>({url:s.url,title:clean(s.title,200),excerpt:clean(s.excerpt,500)}))};
  discoveryFailures=planned.rejected||[];const found=[...new Map(planned.candidates.filter(c=>!c.discoveryError).map(c=>[JSON.stringify([c.law,c.article,c.basisCode,c.type]),Object.fromEntries(['law','article','paragraph','clause','basisCode','type'].map(k=>[k,clean(c[k],100)]))])).values()].slice(0,8);
  const identity=r=>JSON.stringify([r.law,r.article,r.basisCode,r.type]),protectedIds=new Set([...previous.items.map(i=>i.sourceId),previous.period?.sourceId]);
  for(const ref of found)if(!refs.some(r=>identity(r)===identity(ref))){if(refs.length<8)refs.push(ref);else{const replace=refs.findIndex((r,i)=>!protectedIds.has('S'+i)&&!found.some(n=>identity(n)===identity(r)));if(replace>=0)refs[replace]=ref;}}
 }
 const sources=[],failures=discoveryFailures.map(r=>({law:r.law,reason:r.reason}));
 const focusResident=/주민(?:등록)?번호/.test(userText)||previous.items.some(i=>classification(i.name)==='rnn');
 const identifierLaws=discoveryScope(context).identifierLaws||[];
 const refPriority=r=>r.basisCode==='residentLaw'?(identifierLaws.includes(r.law)?0:1):['sensitiveLaw','uniqueLaw'].includes(r.basisCode)?3:2;
 const verificationOrder=[...refs.entries()].sort((a,b)=>focusResident?refPriority(a[1])-refPriority(b[1]):a[0]-b[0]);
 const critical=new Set(focusResident?[verificationOrder.find(([,r])=>r.basisCode==='residentLaw')?.[0],verificationOrder.find(([,r])=>!['residentLaw','sensitiveLaw','uniqueLaw'].includes(r.basisCode))?.[0]].filter(Number.isInteger):[]);
 for(const [index,ref] of verificationOrder){if(api.calls+api.cacheOperations>=(critical.has(index)?40:34)){failures.push({law:ref.law,reason:'request_budget'});continue;}try{let proof;try{proof=await api.verify(ref);}catch(error){if(error instanceof ApiError&&(ref.paragraph||ref.clause)&&/요청한 항|요청한 호|조·항·호 번호/.test(error.message)){const articleRef={...ref,paragraph:'',clause:''};proof=await api.verify(articleRef);refs[index]=articleRef;}else throw error;}sources.push({id:'S'+index,proof,text:proof.articleExcerpt||proof.paragraphExcerpt||proof.excerpt});}catch(e){if(!(e instanceof ApiError))throw e;failures.push({law:ref.law,reason:e.status>=500?'unavailable':'not_verified'});}}
 for(const source of [...sources])for(const [basisCode,pattern] of [['residentLaw',/주민등록번호/],['sensitiveLaw',/민감정보|건강에\s*관한\s*정보/]])if(!(api.calls+api.cacheOperations>=34)&&refs.length<8&&['법률','대통령령'].includes(source.proof.kind)&&pattern.test(source.text)&&!refs.some(r=>r.law===source.proof.law&&r.article===source.proof.article&&r.basisCode===basisCode)){
  const ref={law:source.proof.law,article:source.proof.article,paragraph:source.proof.paragraph||'',clause:source.proof.clause||'',basisCode,type};
  const index=refs.length;refs.push(ref);try{const proof=await api.verify(ref);sources.push({id:'S'+index,proof,text:proof.articleExcerpt||proof.excerpt});}catch(error){if(!(error instanceof ApiError))throw error;failures.push({law:ref.law,reason:error.status>=500?'unavailable':'not_verified'});}
 }
 mark('verify');
 if(!sources.length&&!previous.items.length&&!previous.period)refs=[];
 const checkpoint=async facts=>({evidenceRefs:refs,evidenceFacts:facts,evidenceToken:await signReview(api.env.OPENROUTER_API_KEY+':work-state-v2',await digest({business,type,flow,refs,facts}),86400000),evidenceExpiresAt:Date.now()+86400000});
 if(!sources.length&&failures.length&&(previous.items.length||previous.period))return {agency:manual.agency||'',purpose:business,shortPurpose:'',recipient:manual.recipient||'',items:[],period:'',periodOrigin:'',grounds:[],verifiedSources:[],retainedItems:previous.items.map(i=>({...i,classification:classification(i.name),origin:i.sourceId==='user'?'user':'law'})),retainedPeriod:previous.period?.value||'',incomplete:true,reply:'공식 원문을 재확인하지 못했습니다. 이전에 확인한 항목과 기간은 지우지 않고 보관했습니다.',questions:['잠시 후 근거를 다시 확인해 주세요. 항목을 다시 입력하실 필요는 없습니다.'],failures,residentCheck:{status:'unavailable',checks:['공식 원문 재확인 필요']},...await checkpoint(previous),checkedAt:0,legalChecked:false};
 const material={business,type,flow,messages,manual,businessFacts,research:researchMaterial,previousFacts:previous,sources:sources.map(s=>({id:s.id,cite:s.proof.cite,text:s.text.slice(0,11000)}))};
 const answer=await api.ai(policy.prompt,material,4500);mark('draft');
 if(!Array.isArray(answer.items)||answer.items.length>30||!answer.period||typeof answer.period!=='object'||Array.isArray(answer.period))throw new ApiError('업무 정리 응답을 읽지 못했습니다. 다시 시도하세요.',502);
 const supported=(value,claim)=>{const quote=clean(claim?.quote,1500),source=sources.find(s=>s.id===claim?.sourceId);return quote&&norm(quote).replaceAll('주민번호','주민등록번호').includes(norm(value).replaceAll('주민번호','주민등록번호'))&&(claim.sourceId==='user'?norm(userText).includes(norm(quote)):source&&norm(source.text).includes(norm(quote)));};
 const removed=new Set((Array.isArray(answer.removeItems)?answer.removeItems:[]).filter(i=>i&&norm(userText).includes(norm(clean(i.quote,500)))&&norm(i.quote).replaceAll('주민번호','주민등록번호').includes(norm(i.name).replaceAll('주민번호','주민등록번호'))&&/제외|삭제|않|안\s*(?:수집|처리|제공)|불필요/.test(i.quote)).map(i=>classification(i.name)==='rnn'?'주민등록번호':i.name));
 const residentLine=[...userText.split('\n')].reverse().find(t=>/주민(?:등록)?번호/.test(t));
 const requestedResident=residentLine&&(/주민(?:등록)?번호.{0,40}(?:수집(?:해야|하고|합니다|할|하려|이필요)|처리(?:해야|할예정|할계획|합니다|한다|하고|하려|할것|할거|할게)|사용(?:합니다|한다|하고|하려|할)|필수|필요|추가|포함|가능|되나|될까|되는지|할수있|받아도|받을수)/.test(norm(residentLine))||/주민(?:등록)?번호/.test(manual.items||''))&&!/제외|삭제|불필요|안\s*(?:수집|처리)|(?:수집|처리|사용)(?:하지|할필요가)\s*(?:않|없)/.test(norm(residentLine))?{name:'주민등록번호',required:true,sourceId:'user',quote:residentLine.slice(0,1500)}:null;
 const proposed=[...(requestedResident?[requestedResident]:[]),...previous.items.filter(i=>!removed.has(i.name)&&(i.sourceId==='user'||supported(i.name,i))),...answer.items.filter(i=>i&&clean(i.name,100)&&supported(clean(i.name,100),i))].map(i=>classification(i.name)==='rnn'?{...i,name:'주민등록번호'}:i);
 let periodClaim=clean(answer.period.value,300)&&supported(clean(answer.period.value,300),answer.period)?answer.period:previous.period&&(previous.period.sourceId==='user'||supported(previous.period.value,previous.period))?previous.period:answer.period;
 const itemClass=i=>{const value=classification(i.name);if(value!=='general')return value;const name=norm(i.name),source=sources.find(s=>s.id===i.sourceId);const medical=source?.proof?.law?.startsWith('의료법')||/진료|의료기관|환자/.test(business);const identity=/^(?:환자(?:의)?)?(?:성명|이름|주소|연락처|전화번호|휴대전화번호|생년월일|성별|연령|나이|직업|국적|환자번호|등록번호)$/.test(name);return medical&&!identity?'sensitive':'general';};
 const items=[...new Map(proposed.map(i=>[clean(i.name,100),{name:clean(i.name,100),required:i.required===true,classification:itemClass(i),sourceId:i.sourceId,origin:i.sourceId==='user'?'user':'law'}])).values()];
 let periodStatus=clean(periodClaim.value,300)?'quote_not_verified':'not_found';
 let period=(periodClaim===previous.period&&periodClaim.sourceId==='user'||supported(clean(periodClaim.value,300),periodClaim))?clean(periodClaim.value,300):'';
 if(period)periodStatus='verified_quote';
 let periodOrigin=period?(periodClaim.sourceId==='user'?'user':'law'):'';
 let lawPeriodDraft=null;
 if(!period&&periodStatus==='quote_not_verified'&&periodClaim.sourceId!=='user'){const value=clean(periodClaim.value,300),source=retentionSourceFor(value,periodClaim.sourceId,sources);if(source)lawPeriodDraft=lawPeriodSuggestion(value,source.proof.cite,'');}
 // The period review runs alongside the ground reviews instead of before them.
 const periodSource=period&&periodOrigin==='law'?sources.find(s=>s.id===periodClaim.sourceId):null;
 const periodReview=period&&periodOrigin==='law'?api.ai(policy.periodReview,{business,messages,period,evidence:periodSource?.text,verifiedSources:material.sources},1000):null;
 periodReview?.catch(()=>{});
 const necessaryDrafts=workDraft(answer,business,userText).suggestedItems.map(i=>({...i,classification:itemClass(i)})).filter(i=>i.classification!=='rnn'&&!removed.has(i.name)&&!items.some(a=>a.name===i.name));
 const reviewItems=[...items,...necessaryDrafts];
 const grounds=[],proposedGrounds=[];let residentCheck={status:failures.length?'unavailable':'not_found',checks:['주민등록번호는 일반 처리 근거와 별도 허용 근거를 함께 확인해야 합니다.']};
 const reviewSource=async(source,confirmedGrounds)=>{const proof=source.proof;if(!hasPermissionText(proof)||irrelevantIncomeSource(proof,[business,...recentUsers.map(m=>m.content)]))return null;const supplement={residentLaw:'rnn',sensitiveLaw:'sensitive',uniqueLaw:'unique'}[proof.basisCode];const reviewRows=proof.basisCode==='residentLaw'&&!reviewItems.some(i=>i.classification==='rnn')?[...reviewItems,{name:'주민등록번호',classification:'rnn'}]:reviewItems;const scope=reviewRows.filter(i=>!supplement||i.classification===supplement).map((i,n)=>({...i,id:'assistant-'+n,purpose:reviewPurpose,recipient:clean(answer.recipient)||manual.recipient||'',type,context:type}));if(!scope.length)return null;
  try{const {review}=await api.reviewEvidence({...proof,confirmedGrounds:supplement?confirmedGrounds:[],additionalGrounds:sources.filter(s=>s.proof!==proof&&['residentLaw','sensitiveLaw','uniqueLaw'].includes(s.proof.basisCode)&&hasPermissionText(s.proof)).slice(0,4).map(s=>s.proof)},scope,false);return {proof,review};}catch(error){if(error instanceof ApiError&&error.requestBudget)return {proof,budget:true};throw error;}};
 const applyReview=result=>{if(!result)return;const {proof,review}=result;if(result.budget){failures.push({law:proof.law,reason:'request_budget'});return;}if(proof.basisCode==='residentLaw'){const row=review.items.find(i=>i.name==='주민등록번호');if(row&&residentCheck.status!=='confirmed'&&(!residentCheck.cite||row.verdict==='possible'))residentCheck={status:row.verdict==='possible'?'confirmed':row.verdict,cite:proof.cite,excerpt:proof.excerpt,checks:row.checks||[],explanation:row.explanation||''};}const pending=review.items.filter(i=>i.verdict==='needs_information').map(i=>i.name);if(pending.length)proposedGrounds.push({...proof,itemNames:pending,applicationPending:true});const names=review.items.filter(i=>i.verdict==='possible').map(i=>i.name);if(names.length)grounds.push({...proof,itemNames:names});};
 // General grounds are reviewed together; specific permissions follow together with the confirmed general grounds.
 // Results are applied in source order, so the outcome does not depend on which review finishes first.
 const isSupplement=s=>supplementCodes.includes(s.proof.basisCode);
 for(const result of await Promise.all(sources.filter(s=>!isSupplement(s)).map(s=>reviewSource(s,[]))))applyReview(result);
 const confirmedGrounds=grounds.filter(g=>!supplementCodes.includes(g.basisCode)).map(g=>({cite:g.cite,excerpt:g.excerpt,itemNames:g.itemNames}));
 for(const result of await Promise.all(sources.filter(isSupplement).map(s=>reviewSource(s,confirmedGrounds))))applyReview(result);
 if(periodReview){const review=await periodReview;if(review.verdict!=='possible'){if(review.verdict!=='not_supported')lawPeriodDraft=lawPeriodSuggestion(period,periodSource?.proof?.cite,review.reason);period='';periodOrigin='';periodStatus=['needs_information','not_supported'].includes(review.verdict)?review.verdict:'review_incomplete';}else{periodStatus='verified';period=periodValue(period);}}
 mark('review');
 const kept=keptPeriodChoice(userText);
 if(!period&&kept){period=kept.value;periodOrigin='user';periodStatus='user_confirmed';periodClaim=kept;lawPeriodDraft=null;}
 const draftResult={...workDraft(answer,business,userText),...(lawPeriodDraft||{})};
 linkResidentGrounds(grounds,proposedGrounds);
 const allowed=items.filter(i=>{if(i.classification!=='rnn')return true;return grounds.some(g=>!['residentLaw','sensitiveLaw','uniqueLaw'].includes(g.basisCode)&&g.itemNames.includes(i.name))&&grounds.some(g=>g.basisCode==='residentLaw'&&g.itemNames.includes(i.name));});
 for(const g of grounds){const pending=g.itemNames.filter(n=>!allowed.some(i=>i.name===n)&&items.some(i=>i.name===n));if(pending.length)proposedGrounds.push({...g,itemNames:pending,applicationPending:true});}
 const withheld=items.filter(i=>!allowed.includes(i)).map(i=>i.name);
 const questions=(Array.isArray(answer.questions)?answer.questions:[]).map(q=>clean(q,300)).filter(Boolean).slice(0,3);
 if(failures.some(f=>f.reason==='request_budget'))questions.unshift('확인된 원문은 유지했습니다. 일부 근거는 서버 조회 한도로 추가 확인이 필요합니다.');
 if(withheld.length)questions.push(withheld.join(', ')+'항목을 초안에 남깁니다. 확인된 관련 조문은 함께 입력하며, 적용 요건은 3단계에서 수정할 수 있습니다.');
 if(!allowed.length&&!previous.items.length)questions.push('수집하거나 제공할 개인정보 항목을 알려주세요. 직접 입력은 선택사항입니다.');
 if(!period&&!previous.period)questions.push('보유 및 이용기간을 알려주세요. 직접 입력은 선택사항입니다.');
 const retained=[...new Map([...previous.items,...proposed.filter(i=>i.sourceId==='user'&&classification(i.name)==='rnn')].map(i=>[i.name,i])).values()].filter(i=>!removed.has(i.name)&&!allowed.some(a=>a.name===i.name));
 const retainedPeriod=!period&&previous.period?previous.period.value:'';
 const facts={items:allowed.map(i=>factItem(proposed.findLast(p=>clean(p.name,100)===i.name))),period:period?factPeriod({...periodClaim,value:period}):previous.period};
 facts.items.push(...retained.filter(i=>!facts.items.some(a=>a.name===i.name)).map(factItem));
 if(retained.length||retainedPeriod)questions.unshift('요청한 항목은 보관하고 있습니다. 미확인 항목의 원문·허용 요건을 다시 확인해 주세요.');
 const knownResidentUse=/주민(?:등록)?번호/.test(norm(userText))&&/강사료|강연료|자문료|원천징수|지급명세서|기타소득|진료/.test(norm(userText));
 const specialRequested=[...items,...necessaryDrafts,...retained].some(i=>['rnn','sensitive','unique'].includes(i.classification||classification(i.name)));
 const periodSettled=Boolean(period&&['law','user'].includes(periodOrigin));
 const itemsSettled=Boolean(manual.items||items.some(i=>i.sourceId==='user'&&i.classification!=='rnn'));
 const agency=clean(answer.agency,100);const recipient=clean(answer.recipient,100);

 if(flow==='provide'&&!recipient&&!manual.recipient)questions.push('제공받는 기관을 알려주세요.');
 const finalQuestions=finishWorkQuestions([...residentChoiceQuestions(residentCheck,requestedResident||specialRequested),...(asksGround?[]:consolidateWorkQuestions(questions.filter(q=>!(workQuestionCategory(q)==='permission'&&(!specialRequested||knownResidentUse))&&!(periodSettled&&workQuestionCategory(q)==='period')&&!(itemsSettled&&workQuestionCategory(q)==='items')&&!(/기타소득/.test(userText)&&/사업소득|소득.*구분|기타소득/.test(q))&&!((requestedResident||previous.items.some(i=>classification(i.name)==='rnn'))&&/주민등록번호|주민번호/.test(q)))))].slice(0,5),{messages,residentConfirmed:residentCheck.status==='confirmed',itemsMissing:!allowed.length&&!necessaryDrafts.length&&!retained.length,periodMissing:!period&&!retainedPeriod&&!draftResult.suggestedPeriod});
 return {...draftResult,suggestedItems:necessaryDrafts,proposedGrounds,agency:norm(userText).includes(norm(agency))?agency:'',purpose:clean(answer.purpose)||business,shortPurpose:clean(answer.shortPurpose,40),recipient:norm(userText).includes(norm(recipient))?recipient:'',items:allowed,removedItems:[...removed],verifiedSources:[...new Map(sources.map(s=>[s.proof.cite,{law:s.proof.law,article:s.proof.article,cite:s.proof.cite,excerpt:(s.proof.excerpt||'').slice(0,3000)}])).values()],retainedItems:retained.map(i=>({...i,classification:classification(i.name),origin:i.sourceId==='user'?'user':'law'})),retainedPeriod,incomplete:Boolean(retained.length||retainedPeriod),residentCheck,checkedAt:Date.now(),period,periodOrigin,periodStatus,grounds:grounds.map(g=>({...g,itemNames:g.itemNames.filter(n=>[...allowed,...necessaryDrafts].some(i=>i.name===n))})).filter(g=>g.itemNames.length),reply:(requestedResident||/근거.*없|정말.*근거/.test(recentUsers.at(-1)?.content||'')?residentSummary(residentCheck,grounds)+' ':'')+'개인정보 항목 '+new Set([...allowed,...necessaryDrafts,...retained].map(i=>i.name)).size+'개와 보유기간을 오른쪽에 정리했습니다.'+(requestedResident&&residentCheck.status==='confirmed'?'':searchMode==='consent'&&!grounds.length?' 이벤트·홍보처럼 동의를 받아 처리하는 업무로 보고 법령 검색은 생략했습니다. 법령 근거가 필요하면 3단계에서 추가할 수 있습니다.':applicableGroundSummary(grounds))+(finalQuestions.length?'':questionsDoneNote),questions:finalQuestions,failures,...await checkpoint(facts),legalChecked:sources.length>0,searchMode,timings:{...timings,total:Date.now()-started}};
}

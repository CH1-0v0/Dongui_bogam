const app = document.querySelector('#app');
const labels = ['기본 내용 작성','항목 분류 검토','법적 근거 탐색','문서 작성 및 미리보기'];
const descriptions = ['수집·이용 목적과 개인정보 항목을 입력합니다.','분류 제안을 확인하고 담당자가 확정합니다.','항목별로 법적 근거를 검토하고 채택합니다.','A4 초안을 검토한 뒤 완성하기를 누르세요.'];
const groupNames = { collect:'개인정보 수집·이용', extra:'목적 외 이용', provide:'제3자 제공', marketing:'마케팅' };
const categoryNames = { required:'일반 개인정보 (필수)', optional:'일반 개인정보 (선택)', general:'일반 개인정보', sensitive:'민감정보', unique:'고유식별정보' };
const group = enabled => ({enabled,purpose:'',period:'',optionalPurpose:'',optionalPeriod:'',recipient:'',outside:false,items:[]});
let state = {agency:'',groups:{collect:group(true),extra:group(false),provide:group(false),marketing:group(false)},refusals:{},title:'',child:null,edits:{},search:false,groundDraft:null,grounds:[],intro:''};
let step=0, reached=0, tab='collect', message='', chat='';
let basicsChecked=false;
let finalDocument=null;
const safe = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const id = () => crypto.randomUUID();
const itemGroup = (key,g,i) => key==='collect'&&!i.required?{...g,purpose:g.optionalPurpose?.trim()||g.purpose,period:g.optionalPeriod?.trim()||g.period}:g;
const entries = () => Object.entries(state.groups).flatMap(([key,g])=>g.enabled?g.items.filter(i=>i.name.trim()).map(i=>({key,g:itemGroup(key,g,i),i})):[]);
const getItem = key => Object.values(state.groups).flatMap(g=>g.items).find(i=>i.id===key);
const rnn = name => /주민\s*등록\s*번호|주민번호/.test(name);
function signal(name){
 if(rnn(name)||/여권\s*번호|운전면허\s*번호|외국인등록\s*번호/.test(name)) return 'unique';
 if(/종교|사상|신념|성생활|성 생활|정치적 견해|노동조합 가입|정당 가입|범죄경력|유전정보|건강정보/.test(name)) return 'sensitive';
 if(/병력|진단|질병|장애|상담|생체|인종|민족|복약|심리/.test(name)) return 'possible';
 return 'general';
}
function suggested(i){ const value=signal(i.name);return value==='possible'?'sensitive':value; }
const kind = i => i.kind || suggested(i);
const hint = i => ({unique:rnn(i.name)?'주민등록번호 · 별도 처리 근거 확인':'고유식별정보 검토',sensitive:'민감정보 후보',possible:'민감정보 가능성 높음',general:'일반 개인정보 후보'}[signal(i.name)]);
const requiredMark = '<span class="required-mark" aria-hidden="true">*</span>';
const field = (label,path,value,placeholder='',area=false,required=false) => {
 const attrs=`data-path="${path}" placeholder="${safe(placeholder)}" ${required?'required':''}`;
 const control=area?`<textarea ${attrs}>${safe(value)}</textarea>`:`<input ${attrs} value="${safe(value)}">`;
 return `<label class="field"><span>${safe(label)}${required?requiredMark:''}</span>${control}</label>`;
};
const checkbox = (label,attrs,checked,required=false) => `<label class="check"><input type="checkbox" ${attrs} ${checked?'checked':''} ${required?'required':''}>${label}${required?requiredMark:''}</label>`;
function home(){
 return `<section class="hero"><div><span class="eyebrow">개인정보 보호 업무 지원</span><h1>개인정보 동의서·고지서<br>작성하기</h1><p>항목별 분류와 처리 근거를 검토하고<br>기관 업무에 맞는 동의서와 고지서를 작성하세요.</p><div class="actions"><button class="primary" data-start>동의서 생성 <span aria-hidden="true">→</span></button><button data-sample>예시로 시작</button></div></div><div class="art" aria-hidden="true"><div class="orbit"></div><div class="orbit"></div><div class="paper"><span class="tileicon">▤</span><b>개인정보 수집·이용 동의서</b><i></i><i></i><i class="short"></i><strong>☑ 동의 항목</strong><i></i><i class="short"></i></div><span class="float one">✓ 항목 분류 검토</span><span class="float two">▤ A4 문서 출력</span></div></section><div class="section-heading"><h2>문서 작성 절차</h2><p>네 단계로 작성하고, 이전 단계로 돌아가 입력을 수정할 수 있습니다.</p></div><div class="cards">${labels.map((label,n)=>`<article class="card"><small>0${n+1}단계</small><span class="tileicon" aria-hidden="true">${['▤','☷','⌕','▧'][n]}</span><h3>${label}</h3><p>${descriptions[n]}</p></article>`).join('')}</div><div class="info"><span aria-hidden="true">ⓘ</span><div><strong>개인정보 원문은 입력하지 마세요</strong><p>‘성명’, ‘휴대전화번호’처럼 항목명과 처리 맥락만 입력하세요. 분류와 처리 근거는 담당자가 직접 확정합니다.</p></div></div>`;
}
const canSetRequired = key => ['collect','extra'].includes(key);
function basics(){
 return `<section class="panel"><h2>기관 정보</h2>${field('수집 기관명','agency',state.agency,'예: ○○시청',false,true)}</section>`+Object.entries(state.groups).map(([key,g])=>{
  const title=key==='provide'?'제공받는 자의 ':'';
  const hasRequiredControls=canSetRequired(key);
  return `<section class="panel"><div class="panelhead"><h2>${groupNames[key]}</h2>${checkbox(groupNames[key]+' 사용',`data-enable="${key}"`,g.enabled)}</div>${g.enabled?`<div class="pair">${key==='provide'?field('제공받는 자','groups.provide.recipient',g.recipient,'기관 또는 법인명',false,true)+checkbox('수집 목적 외 제공','data-outside',g.outside):''}${field(title+(key==='collect'?'기본 이용 목적':'이용 목적'),`groups.${key}.purpose`,g.purpose,'예: 프로그램 신청 관리',false,true)}${field(title+(key==='collect'?'기본 보유 및 이용기간':'보유 및 이용기간'),`groups.${key}.period`,g.period,'예: 사업 종료 후 1년',false,true)}</div>${key==='collect'?`<fieldset class="optional-details"><legend>선택 항목의 이용 조건</legend><div class="pair">${field('선택 항목 이용 목적','groups.collect.optionalPurpose',g.optionalPurpose,'기본 이용 목적과 같으면 비워 두세요')}${field('선택 항목 보유 및 이용기간','groups.collect.optionalPeriod',g.optionalPeriod,'기본 보유 및 이용기간과 같으면 비워 두세요')}</div></fieldset>`:''}${hasRequiredControls? `<div class="actions bulk-required" role="group" aria-label="${groupNames[key]} 전체 항목 필수 여부"><button data-bulk-required="${key}" value="required" ${g.items.length?'':'disabled'}>모두 필수</button><button data-bulk-required="${key}" value="optional" ${g.items.length?'':'disabled'}>모두 선택</button></div>`:''}<div class="item-list">${g.items.length?'':`<p class="muted">개인정보 항목${requiredMark}</p>`}${g.items.map((i,n)=>`<div class="item-row"><label class="field item-name"><span>개인정보 항목명 ${n+1}${requiredMark}</span><input type="text" data-name="${i.id}" value="${safe(i.name)}" placeholder="예: 성명" required></label><div class="item-controls">${hasRequiredControls?requiredSwitch(i,'항목 '+(n+1)):key==='marketing'?'<span class="pill">선택</span>':''}<div class="order"><button data-move="${i.id}:-1" aria-label="항목 ${n+1} 위로 이동" ${n?'':'disabled'}>↑</button><button data-move="${i.id}:1" aria-label="항목 ${n+1} 아래로 이동" ${n<g.items.length-1?'':'disabled'}>↓</button></div><button class="danger" data-delete="${i.id}" aria-label="항목 ${n+1} 삭제">삭제</button></div><small class="notice item-hint" id="hint-${i.id}">${i.name?hint(i):''}</small></div>`).join('')}</div><div class="actions"><button data-add="${key}">＋ 항목 추가</button>${key==='collect'?'<p class="muted">일반 개인정보, 민감정보, 고유식별정보 모두 작성해주세요.</p>':''}</div>`:'<p class="muted">필요한 처리 유형만 선택하세요.</p>'}</section>`;
 }).join('');
}
const requiredSwitch = (item,label) => `<label class="required-switch"><input type="checkbox" role="switch" aria-label="${safe(label)} 필수 여부" data-required="${item.id}" ${item.required?'checked':''}><span class="required-track" aria-hidden="true"></span><span aria-hidden="true">${item.required?'필수':'선택'}</span></label>`;
const classificationGroups=['required','optional','sensitive','unique'];
const entryClass = ({key,i}) => kind(i)!=='general'?kind(i):key==='provide'?'general':key!=='marketing'&&i.required?'required':'optional';
function classify(){
 const names={...groupNames,collect:'개인정보'};
 const relevant=entries().filter(entry=>entry.key===tab);
 const active=state.groups[tab].enabled;
 const columns=tab==='provide'?['general','sensitive','unique']:tab==='marketing'?classificationGroups.filter(k=>k!=='required'):classificationGroups;
 return `<section class="panel"><div class="tabs" aria-label="처리 구분">${Object.entries(names).map(([k,label])=>`<button data-tab="${k}" aria-pressed="${tab===k}">${label} <span class="pill">${entries().filter(e=>e.key===k).length}</span></button>`).join('')}</div>${!active?'<p class="muted">1단계에서 사용을 선택하면 이 유형의 항목을 검토할 수 있습니다.</p>':!relevant.length?'<p class="muted">검토할 항목이 없습니다.</p>':`<div class="class-grid">${columns.map(k=>{
  const items=relevant.filter(entry=>entryClass(entry)===k);
  if(!items.length)return '';
  return `<section class="class-card"><h2>${categoryNames[k]} <span class="pill">${items.length}</span></h2>${items.map(({i})=>`<div class="class-item"><b>${safe(i.name)}</b><small class="notice">${hint(i)}</small><div class="actions">${['general','possible'].includes(signal(i.name))?`<select aria-label="${safe(i.name)} 분류" data-kind="${i.id}"><option value="general" ${kind(i)==='general'?'selected':''}>일반 개인정보</option><option value="sensitive" ${kind(i)==='sensitive'?'selected':''}>민감정보</option></select>`:'<span class="pill">분류 고정</span>'}<button class="danger" data-delete="${i.id}" aria-label="${safe(i.name)} 삭제">삭제</button>${['required','optional'].includes(k)&&tab!=='marketing'?requiredSwitch(i,i.name):''}</div></div>`).join('')}</section>`;
 }).join('')}</div>`}</section>`;
}
const reference = 'https://www.law.go.kr/법령/개인정보보호법';
const groundTypes={required:'개인정보 (필수)',optional:'개인정보 (선택)',sensitive:'민감정보',unique:'고유식별정보',extra:'목적 외 이용',provide:'제3자 제공',marketing:'마케팅'};
const groundType = entry => entry.key==='collect'?entryClass(entry):entry.key;
const groundEntries = type => entries().filter(entry=>groundType(entry)===type);
const groundInitial = type => ({type,law:'',article:'',paragraph:'',clause:'',excerpt:'',reason:'',ids:[],specific:false,basisCode:type==='provide'?(state.groups.provide.outside?'extraConsent':'provisionConsent'):type==='extra'?'extraConsent':'consent',verified:false,pipaVerified:false,conditionsConfirmed:false,authorityConfirmed:false});
let lawSearch={busy:false,candidates:[],error:'',note:'',mode:'live',rejected:[],version:0};
let apiStatus=null;
let lawActionBusy=false;
const lawContext=entry=>LawBasis.context(entry.key,entry.g);
const lawClassification=i=>rnn(i.name)?'rnn':kind(i);
const draftOptions=draft=>{
 const rows=groundEntries(draft.type);
 const ctx=rows[0]?lawContext(rows[0]):draft.type==='provide'?'provide':draft.type==='extra'?'extra':'collect';
 const classifications=new Set(rows.map(({i})=>lawClassification(i)));
 return Object.entries(LawBasis.rules).filter(([,r])=>r.contexts.includes(ctx)&&(!r.supplement||classifications.has(r.supplement)));
};
const sourceLink=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='www.law.go.kr'?u.href:reference;}catch{return reference;}};
function lawSearchPanel(){
 return `<section class="panel law-search-panel" aria-labelledby="law-search-title"><div class="panelhead"><div><span class="eyebrow">법령 근거 검색</span><h2 id="law-search-title">처리 목적에 맞는 조문 찾기</h2></div><span class="pill">AI 후보 → 공식 원문 대조</span></div><p class="muted">입력한 항목명·처리 목적·제공받는 기관을 OpenRouter에 보내 후보를 찾습니다. 개인정보 원문은 입력하지 마세요. 원문 확인은 해당 업무에 적용된다는 판단과 다릅니다.</p><div class="law-search-controls"><label class="field"><span>검색 방식</span><select data-law-mode ${lawSearch.busy?'disabled':''}><option value="live" ${lawSearch.mode==='live'?'selected':''}>실제 API 검색</option>${apiStatus?.demoAvailable?`<option value="demo" ${lawSearch.mode==='demo'?'selected':''}>화면 시연 · API 호출 없음</option>`:''}</select></label><button class="primary" data-ai-law ${lawSearch.busy?'disabled':''}>${lawSearch.busy?'AI 검색·원문 확인 중…':'AI로 법령 근거 찾기'}</button></div><p class="notice" role="status" aria-live="polite">${lawSearch.busy?'공식 원문을 확인하고 있습니다. 최대 약 3분이 걸릴 수 있습니다.':apiStatus?`모델: ${safe(apiStatus.model)} · AI ${apiStatus.aiConfigured?'연결 설정됨':'미설정'} · 법령 API ${apiStatus.lawConfigured?'연결 설정됨':'미설정'}`:'검색하면 서버 연결 상태를 확인합니다.'}</p>${lawSearch.mode==='demo'?'<div class="info warn"><div><strong>화면 시연 모드</strong><p>실제 AI 검색이나 법령 원문 검증을 수행하지 않습니다. 시연 근거로는 고지사항으로 전환되지 않습니다.</p></div></div>':''}${lawSearch.error?`<div class="info warn" role="alert">${safe(lawSearch.error)}</div>`:''}${lawSearch.note?`<p class="notice">${safe(lawSearch.note)}</p>`:''}<div class="law-results">${lawSearch.candidates.map((c,n)=>{const rule=LawBasis.rules[c.basisCode];return `<article class="law-result"><div class="panelhead"><h3>${safe(c.cite)}</h3><span class="pill ${c.verified?'':'pending'}">${c.verified?'공식 API 원문 확인':'미검증 · 시연'}</span></div><p><strong>${safe(rule?.label||'처리 근거 확인 필요')}</strong><br><span class="muted">${safe(rule?.pipa||'')}</span></p><p>${safe(c.reason)}</p><details><summary>확인한 조문 내용과 출처</summary><blockquote class="law-excerpt">${safe(c.excerpt)}</blockquote>${c.articleExcerpt?`<details><summary>해당 조 전체 문맥</summary><blockquote class="law-excerpt">${safe(c.articleExcerpt)}</blockquote></details>`:''}${c.pipa?`<p><strong>개인정보 보호법의 연결 조항</strong></p><blockquote class="law-excerpt">${safe(c.pipa.excerpt)}</blockquote>`:''}<a href="${safe(sourceLink(c.sourceUrl))}" target="_blank" rel="noopener noreferrer">국가법령정보센터 원문 ↗</a>${c.verified?`<p class="muted">시행일 ${safe(c.effectiveDate)} · 확인 ${safe(c.verifiedAt?.slice(0,10))}</p>`:''}</details><div class="actions"><button data-use-law="${n}">적용 항목·처리 근거 검토</button>${rule?.effect==='consent'?'<span class="muted">동의 조항은 채택하지 않아도 동의서로 작성할 수 있습니다.</span>':''}</div></article>`;}).join('')}</div>${lawSearch.rejected.length?`<details class="rejected-laws"><summary>원문을 확인하지 못한 후보 ${lawSearch.rejected.length}건</summary>${lawSearch.rejected.map(r=>`<p>${safe(r.law)} · ${safe(r.message)}</p>`).join('')}</details>`:''}</section>`;
}
function apiErrorMessage(error){
 if(error.name==='TimeoutError'||error.name==='AbortError')return '서버 응답 시간이 초과되었습니다. 실행 터미널의 API 로그를 확인한 뒤 다시 시도하세요.';
 if(error instanceof TypeError)return '로컬 API 서버와 연결이 끊겼습니다. server.py 터미널이 실행 중인지 확인하고, 같은 주소의 /api/status가 열리는지 확인하세요. 서버를 재시작했다면 페이지도 새로고침하세요.';
 return error.message||'요청을 처리하지 못했습니다.';
}
async function readApiStatus(){
 if(!['http:','https:'].includes(location.protocol))throw new Error('HTML 파일을 직접 열면 API가 연결되지 않습니다. python server.py 실행 후 http://127.0.0.1:3000으로 접속하세요.');
 let response;
 try{response=await fetch('/api/status',{signal:AbortSignal.timeout(10000),cache:'no-store'});}catch(error){throw new Error(apiErrorMessage(error));}
 if(!response.ok)throw new Error('API 서버에 연결하지 못했습니다. Python 정적 서버 대신 server.py로 실행하세요.');
 let result;try{result=await response.json();}catch{throw new Error('서버가 API 응답을 반환하지 않습니다. server.py로 실행한 주소인지 확인하세요.');}
 if(result.app!=='dongui'||result.apiVersion!==2)throw new Error('실행 중인 서버가 이전 버전입니다. 최신 파일로 교체한 뒤 기존 서버를 Ctrl+C로 종료하고 python server.py를 다시 실행하세요.');
 apiStatus=result;return apiStatus;
}
async function lawRequest(path,data){
 await readApiStatus();
 let response;
 try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':apiStatus.csrfToken},body:JSON.stringify(data),signal:AbortSignal.timeout(180000)});}catch(error){throw new Error(apiErrorMessage(error));}
 let result;try{result=await response.json();}catch{throw new Error('서버 응답을 확인하지 못했습니다. server.py 터미널의 API 로그를 확인하세요.');}
 if(!response.ok)throw new Error(result.error||'검색 요청에 실패했습니다.');
 return result;
}
async function findLaws(){
 if(lawSearch.busy)return;
 const items=entries().map(e=>({name:e.i.name,purpose:e.g.purpose,recipient:e.g.recipient,type:groundType(e),context:lawContext(e),classification:lawClassification(e.i)}));
 const version=++lawSearch.version;
 lawSearch.busy=true;lawSearch.error='';lawSearch.candidates=[];lawSearch.rejected=[];lawSearch.note='';render();
 try{
  const result=await lawRequest('/api/law/search',{items,demo:lawSearch.mode==='demo'});
  if(version!==lawSearch.version)return;
  lawSearch.candidates=result.candidates;lawSearch.rejected=result.rejected||[];
  lawSearch.note=result.note||(!result.candidates.length?'확인된 후보가 없습니다. 처리 목적을 구체화하거나 법령 검색에서 조문을 선택해 원문을 확인하세요.':'');
 }catch(error){if(version===lawSearch.version)lawSearch.error=apiErrorMessage(error);}
 finally{if(version===lawSearch.version){lawSearch.busy=false;if(step===3)render();}}
}
function resetLawVerification(draft){
 Object.assign(draft,{verified:false,pipaVerified:false,pipa:null,articleExcerpt:'',conditionsConfirmed:false,authorityConfirmed:false,specific:false,sourceUrl:'',verifiedAt:'',effectiveDate:''});
}
async function verifyGround(){
 const draft=state.groundDraft;if(!draft||lawActionBusy)return;
 if(!draft.law||!draft.article){feedback('법령을 검색하고 조문을 선택해 주세요.');return;}
 const snapshot=JSON.stringify(draft);lawActionBusy=true;feedback('국가법령정보센터 원문을 확인하고 있습니다.');render();
 try{
  const result=await lawRequest('/api/law/verify',{law:draft.law,article:articleNumber(draft.article),paragraph:subNumber(draft.paragraph,'항'),clause:subNumber(draft.clause,'호'),mst:draft.mst,basisCode:draft.basisCode,type:draft.type});
  if(state.groundDraft!==draft||JSON.stringify(draft)!==snapshot){feedback('입력 내용이 바뀌었습니다. 현재 내용으로 다시 원문을 확인하세요.');return;}
  Object.assign(draft,result);feedback('법령과 연결 조항의 원문을 확인했습니다. 적용 요건을 검토해 주세요.');
 }catch(error){if(state.groundDraft===draft)feedback(error.message);}
 finally{lawActionBusy=false;if(step===3)render();}
}
let lawPicker={query:'',laws:[],document:null,article:'',paragraph:'',clause:'',loading:false,error:'',page:1,hasNext:false,version:0};
function freshLawPicker(){lawPicker={query:'',laws:[],document:null,article:'',paragraph:'',clause:'',loading:false,error:'',page:1,hasNext:false,version:lawPicker.version+1};}
function pickerArticle(){return lawPicker.document?.articles.find(a=>a.value===lawPicker.article);}
function pickerClauses(){const a=pickerArticle();return lawPicker.paragraph?a?.paragraphs.find(p=>p.value===lawPicker.paragraph)?.clauses||[]:a?.clauses||[];}
function lawPickerPanel(draft){
 const a=pickerArticle(), clauses=pickerClauses();
 const excerpt=lawPicker.clause?clauses.find(c=>c.value===lawPicker.clause)?.text:lawPicker.paragraph?a?.paragraphs.find(p=>p.value===lawPicker.paragraph)?.text:a?.text;
 return `<section class="law-picker" aria-labelledby="law-picker-title"><h3 id="law-picker-title">국가법령정보센터에서 법령 선택</h3><p class="muted">법령 이름을 검색한 뒤 공식 검색 결과에서 조·항·호를 선택하세요. AI 호출 없이 법령 API만 사용합니다.</p><div class="law-search-controls"><label class="field"><span>법령 검색어</span><input data-law-query value="${safe(lawPicker.query)}" placeholder="예: 개인정보 보호법" maxlength="100" ${lawPicker.loading?'disabled':''}></label><button data-catalog-search ${lawPicker.loading?'disabled':''}>법령 검색하기</button></div>${lawPicker.loading?'<p role="status">국가법령정보센터에서 조회 중입니다…</p>':''}${lawPicker.error?`<p class="notice" role="alert">${safe(lawPicker.error)}</p>`:''}<div class="catalog-results">${lawPicker.laws.map((law,n)=>`<button class="catalog-result" data-catalog-law="${n}" ${lawPicker.loading?'disabled':''}><strong>${safe(law.law)}</strong><small>${safe(law.kind)} · ${safe(law.department)} · 시행일 ${safe(law.effectiveDate)}</small></button>`).join('')}</div>${lawPicker.page>1||lawPicker.hasNext?`<div class="actions"><button data-catalog-page="${lawPicker.page-1}" ${lawPicker.page===1||lawPicker.loading?'disabled':''}>이전 결과</button><span>${lawPicker.page}쪽</span><button data-catalog-page="${lawPicker.page+1}" ${!lawPicker.hasNext||lawPicker.loading?'disabled':''}>다음 결과</button></div>`:''}${lawPicker.document?`<h4>${safe(lawPicker.document.law)}</h4><div class="law-picker-selects"><label class="field"><span>조</span><select data-pick-article><option value="">조문을 선택하세요</option>${lawPicker.document.articles.map(article=>`<option value="${safe(article.value)}" ${article.value===lawPicker.article?'selected':''}>제${safe(article.value.replace('의','조의'))}${article.value.includes('의')?'':'조'} ${safe(article.title)}</option>`).join('')}</select></label><label class="field"><span>항</span><select data-pick-paragraph ${!a?.paragraphs.length?'disabled':''}><option value="">${a?.paragraphs.length?'조 전체':'별도 항 번호 없음'}</option>${(a?.paragraphs||[]).map(p=>`<option value="${p.value}" ${p.value===lawPicker.paragraph?'selected':''}>제${p.value}항</option>`).join('')}</select></label><label class="field"><span>호</span><select data-pick-clause ${!clauses.length?'disabled':''}><option value="">전체</option>${clauses.map(c=>`<option value="${c.value}" ${c.value===lawPicker.clause?'selected':''}>제${c.value}호</option>`).join('')}</select></label></div>${a?`<p><strong>선택한 조문: ${safe(cite(draft))}</strong></p><blockquote class="law-excerpt">${safe(excerpt||a.text)}</blockquote><button class="primary" data-verify-law ${lawActionBusy?'disabled':''}>${lawActionBusy?'원문 확인 중…':'선택한 조문 가져오기'}</button>`:''}`:''}${draft.law?`<div class="picked-citation"><strong>현재 근거: ${safe(cite(draft))}</strong>${draft.excerpt?`<blockquote class="law-excerpt">${safe(draft.excerpt)}</blockquote>`:''}</div>`:''}</section>`;
}
async function searchCatalog(page=1){
 const draft=state.groundDraft;if(!draft||lawPicker.loading)return;
 const query=document.querySelector('[data-law-query]')?.value.trim()||lawPicker.query.trim();
 const version=++lawPicker.version;lawPicker.query=query;lawPicker.error='';lawPicker.loading=true;lawPicker.laws=[];lawPicker.document=null;lawPicker.hasNext=false;render();
 try{
  const result=await lawRequest('/api/law/catalog',{query,page});
  if(version!==lawPicker.version||state.groundDraft!==draft)return;
  lawPicker.laws=result.laws;lawPicker.page=result.page;lawPicker.hasNext=result.hasNext;
  if(!result.laws.length)lawPicker.error='이 페이지에 표시할 현행 법령이 없습니다. 검색어를 바꾸거나 다른 페이지를 확인하세요.';
 }catch(error){if(version===lawPicker.version)lawPicker.error=apiErrorMessage(error);}
 finally{if(version===lawPicker.version){lawPicker.loading=false;if(step===3)render();}}
}
async function selectCatalogLaw(index){
 const draft=state.groundDraft, law=lawPicker.laws[index];if(!draft||!law||lawPicker.loading)return;
 const version=++lawPicker.version;lawPicker.loading=true;lawPicker.error='';lawPicker.document=null;render();
 try{
  const result=await lawRequest('/api/law/articles',{law:law.law,mst:law.mst});
  if(version!==lawPicker.version||state.groundDraft!==draft)return;
  lawPicker.document=result;lawPicker.article='';lawPicker.paragraph='';lawPicker.clause='';
  resetLawVerification(draft);Object.assign(draft,{law:result.law,mst:result.mst,article:'',paragraph:'',clause:'',excerpt:''});
 }catch(error){if(version===lawPicker.version)lawPicker.error=apiErrorMessage(error);}
 finally{if(version===lawPicker.version){lawPicker.loading=false;if(step===3)render();}}
}
function setPickedCitation(){
 const draft=state.groundDraft;if(!draft||!lawPicker.document)return;
 resetLawVerification(draft);
 Object.assign(draft,{law:lawPicker.document.law,mst:lawPicker.document.mst,article:lawPicker.article,paragraph:lawPicker.paragraph,clause:lawPicker.clause,excerpt:''});
 render();
}

function basisEditor(draft){
 const rule=LawBasis.rules[draft.basisCode];
 return `<section class="basis-selection"><label class="field"><span>개인정보 보호법상 처리 근거${requiredMark}</span><select data-basis-code>${draftOptions(draft).map(([code,r])=>`<option value="${code}" ${draft.basisCode===code?'selected':''}>${safe(r.label)} (${safe(r.pipa)})</option>`).join('')}</select></label><p><strong>${safe(rule?.label||'처리 근거를 선택하세요.')}</strong><br>${safe(rule?.pipa||'')}</p><div class="info ${rule?.effect==='consent'?'':'warn'}"><div><strong>${rule?.effect==='consent'?'4단계: 동의서 유지':rule?.effect==='supplement'?'별도 처리 허용 근거 · 단독으로 고지 전환되지 않음':'4단계: 요건을 확인한 적용 항목만 고지사항으로 반영'}</strong><p>${rule?.effect==='consent'?'동의를 받도록 하는 조항은 필수 채택 대상이 아닙니다. 근거로 저장해도 고지사항으로 바뀌지 않습니다.':'조문의 존재만으로 적용을 확정할 수 없습니다. 처리 목적·범위·대상과 법에서 정한 요건을 검토하세요.'}</p></div></div><p class="notice">근거 조항: ${safe(cite(draft))||'법령명과 조문을 입력하세요.'} · ${draft.verified?'공식 원문 확인됨':'원문 미확인'}</p><button data-verify-law ${lawActionBusy?'disabled':''}>${lawActionBusy?'원문 확인 중…':'법령 API로 원문 확인'}</button>${draft.verified?`<a href="${safe(sourceLink(draft.sourceUrl))}" target="_blank" rel="noopener noreferrer"> 확인한 원문 ↗</a><p class="muted">시행일 ${safe(draft.effectiveDate)} · 확인 ${safe(draft.verifiedAt?.slice(0,10))}</p>`:''}${draft.articleExcerpt?`<details><summary>확인한 근거 조문 전체 문맥</summary><blockquote class="law-excerpt">${safe(draft.articleExcerpt)}</blockquote></details>`:''}${draft.pipa?`<details><summary>연결된 개인정보 보호법 원문</summary><blockquote class="law-excerpt">${safe(draft.pipa.excerpt)}</blockquote></details>`:''}${rule?.effect!=='consent'?`<div class="stack">${checkbox('연결 조항의 적용 요건과 이 업무의 처리 목적·범위를 확인했습니다.','data-law-conditions',draft.conditionsConfirmed)}${rule?.needsLaw?checkbox('선택한 개별 법령 조문이 해당 처리·제공을 요구 또는 허용하는 구체적 근거임을 확인했습니다.','data-law-authority',draft.authorityConfirmed):''}</div>`:''}</section>`;
}

const articleNumber = value => value.trim().replace(/\s/g,'').replace(/^제/,'').replace(/^([0-9]+)조(?:의([0-9]+))?$/,(_,n,sub)=>sub?n+'의'+sub:n);
const subNumber = (value,unit) => value.trim().replace(/\s/g,'').replace(/^제/,'').replace(new RegExp(unit+'$'),'');
const cite = draft => [draft.law.trim(), draft.article?'제'+draft.article.replace(/^(\d+)(?:의(\d+))?$/,(_,n,sub)=>n+'조'+(sub?'의'+sub:'')):'',draft.paragraph?'제'+draft.paragraph+'항':'',draft.clause?'제'+draft.clause+'호':''].filter(Boolean).join(' ');
const unresolvedRnn = () => entries().filter(e=>rnn(e.i.name)&&!LawBasis.notice(e.i.bases,lawContext(e),'rnn'));
// Group presentation only; keep each adoption's scope and confirmations intact.
const groundDisplayKey = b => JSON.stringify([
 b.basisCode, b.law.replace(/\s/g,''), b.article, b.paragraph, b.clause,
 b.excerpt||'', b.verified===true, b.pipaVerified===true, b.mst||'',
 b.effectiveDate||'', b.conditionsConfirmed===true, b.authorityConfirmed===true, b.specific===true
]);
function groupGroundRows(list){
 const groups=new Map();
 for(const entry of list){
  const key=JSON.stringify([...new Set((entry.i.bases||[]).map(groundDisplayKey))].sort());
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(entry);
 }
 return [...groups.values()];
}
function groundPurpose(list){
 const purposes=[...new Set(list.map(({g})=>g.purpose.trim()).filter(Boolean))];
 const recipients=[...new Set(list.map(({g})=>g.recipient?.trim()).filter(Boolean))];
 return `<p class="ground-purpose muted">${purposes.map(safe).join(' / ')}${recipients.length?' · 제공받는 자: '+recipients.map(safe).join(', '):''}</p>`;
}
function groupedGroundDetails(){
 const groups=new Map();
 for(const basis of state.grounds){
  const key=groundDisplayKey(basis);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(basis);
 }
 if(!groups.size)return '';
 return `<section class="panel adopted-grounds"><h2>채택한 처리 근거</h2>${[...groups.values()].map(records=>{
  const b=records[0];
  const ids=[...new Set(records.flatMap(record=>record.ids))];
  const scope=ids.map(id=>{const entry=entries().find(e=>e.i.id===id);return entry?groundTypes[groundType(entry)]+' · '+entry.i.name:'';}).filter(Boolean);
  return `<details class="basis"><summary>${safe(LawBasis.rules[b.basisCode]?.label||'처리 근거')} · ${safe(b.cite)} · 적용 ${ids.length}개</summary><p><strong>${safe(LawBasis.rules[b.basisCode]?.pipa||'')}</strong></p><p>근거 조항: ${safe(b.cite)}</p><p class="muted">${b.verified?'공식 원문 확인':'원문 미확인'} · ${LawBasis.rules[b.basisCode]?.effect==='consent'?'동의서 유지':'연결 근거와 항목별 요건에 따라 반영'}</p><p>${safe(b.excerpt)}</p><p><strong>적용 항목</strong> ${scope.map(safe).join(', ')}</p>${records.map(record=>`<div class="basis-scope"><p><strong>${safe(groundTypes[record.type])}</strong> · ${record.ids.map(id=>safe(getItem(id)?.name)).join(', ')}</p>${record.reason?`<p><strong>적용 이유</strong> ${safe(record.reason)}</p>`:''}<div class="actions"><button data-edit-ground="${record.id}" aria-label="${safe(groundTypes[record.type]+' '+record.ids.map(id=>getItem(id)?.name).join(', '))} 근거 수정">적용 범위 및 근거 수정</button><button data-remove-ground="${record.id}" aria-label="${safe(groundTypes[record.type]+' '+record.ids.map(id=>getItem(id)?.name).join(', '))} 근거 채택 취소">채택 취소</button></div></div>`).join('')}</details>`;
 }).join('')}</section>`;
}
function grounds(){
 const draft=state.groundDraft;
 const missing=entries().filter(e=>!LawBasis.notice(e.i.bases,lawContext(e),lawClassification(e.i)));
 return `${lawSearchPanel()}<div class="info"><div><strong>처리 근거와 적용 범위 지정</strong><p>동의를 받는 항목은 근거를 채택하지 않아도 됩니다. 동의 없이 처리하는 경우에는 연결 조항과 개별 법령의 적용 요건을 확인하세요.</p></div></div>
 <div class="actions"><button class="primary" data-add-ground>＋ 법령 검색·근거 추가</button><button data-search>${state.search?'참고 조문 숨기기':'참고 조문 보기'}</button><a href="https://www.law.go.kr/" target="_blank" rel="noopener">국가법령정보센터에서 검색 ↗</a></div>
 ${draft?`<section class="panel ground-editor"><h2>${draft.editId?'근거 및 적용 범위 수정':'법령 검색으로 근거 추가'}</h2><label class="field"><span>처리 유형${requiredMark}</span><select data-ground-type required>${Object.entries(groundTypes).map(([k,label])=>`<option value="${k}" ${draft.type===k?'selected':''}>${label}</option>`).join('')}</select></label>${lawPickerPanel(draft)}<div class="stack">${field('이 항목에 적용되는 이유 (선택)','groundDraft.reason',draft.reason,'처리 목적과 조문의 적용 요건을 확인한 내용을 입력하세요.',true)}</div>${basisEditor(draft)}<fieldset><legend>적용할 항목${requiredMark}</legend>${groundPurpose(groundEntries(draft.type))}${groundEntries(draft.type).length?groundEntries(draft.type).map(({key,g,i})=>`<label class="scope-option"><input type="checkbox" data-scope="${i.id}" ${draft.ids.includes(i.id)?'checked':''}><span><b>${safe(i.name)}</b><small>${groupNames[key]} · ${categoryNames[kind(i)]}${g.recipient?' · '+safe(g.recipient):''}</small></span></label>`).join(''):'<p class="muted">이 유형의 등록 항목이 없습니다.</p>'}</fieldset>
 ${draft.basisCode==='residentLaw'&&draft.ids.some(key=>rnn(getItem(key)?.name||''))?`<div class="info warn">${checkbox('주민등록번호의 구체적인 처리 근거와 적용 요건을 확인했습니다.','data-specific',draft.specific,true)}</div>`:''}
 <p class="notice" id="ground-status" role="status">${safe(message)}</p><div class="actions"><button class="primary" data-adopt-ground>근거 채택</button><button data-cancel-ground>취소</button></div></section>`:''}
 ${Object.entries(groundTypes).map(([type,label])=>{
  const list=groundEntries(type);
  if(!list.length)return '';
  return `<section class="panel ground-category" data-ground-category="${type}"><h2>${label}</h2>${groundPurpose(list)}${groupGroundRows(list).map(rows=>{
   const bases=[...new Map((rows[0].i.bases||[]).map(b=>[groundDisplayKey(b),b])).values()];
   const references=new Set();
   for(const {key,g,i} of rows){
    references.add('제'+(key==='provide'?(g.outside?18:17):key==='extra'?18:15)+'조');
    if(rnn(i.name))references.add('제24조의2');else if(kind(i)==='unique')references.add('제24조');else if(kind(i)==='sensitive')references.add('제23조');
   }
   return `<div class="row ground-items"><div class="grow"><b>${rows.map(({i})=>safe(i.name)).join(', ')}</b>${bases.length?`<small>${bases.map(b=>safe(b.cite)).join(' / ')}</small>`:''}${state.search?`<small>참고 조문 ${[...references].map(section=>`<a href="${reference}/${section}" target="_blank" rel="noopener">${section} ↗</a>`).join(' · ')}</small>`:''}</div><span class="pill ${bases.length?'':'pending'}">${bases.length?'채택 '+bases.length+'건':'동의 진행 가능'}</span></div>`;
  }).join('')}</section>`;
 }).join('')}
 ${groupedGroundDetails()}
 ${missing.length?`<section class="panel"><h2>동의 절차로 진행할 항목 <span class="pill pending">${missing.length}개</span></h2><ul class="unconfirmed">${Object.entries(groundTypes).map(([type,label])=>{
  const list=missing.filter(entry=>groundType(entry)===type);
  return list.length?`<li><strong>${label}</strong>${groundPurpose(list)}<span>${list.map(({i})=>safe(i.name)).join(', ')}</span></li>`:'';
 }).join('')}</ul></section>`:''}
 ${unresolvedRnn().length?`<div class="info warn"><div><strong id="rrn-block">주민등록번호 처리 근거 확인이 필요합니다</strong><p>${unresolvedRnn().map(e=>groupNames[e.key]+' · '+safe(e.i.name)).join(', ')}. 수집·제공 근거와 제24조의2의 별도 처리 허용 근거를 모두 확인해 채택하거나 2단계에서 항목을 삭제하세요.</p></div></div>`:''}`;
}
function syncGrounds(){
 const active=new Set(entries().map(({i})=>i.id));
 state.grounds=state.grounds.map(b=>({...b,ids:b.ids.filter(key=>active.has(key))})).filter(b=>b.ids.length);
 for(const {i} of entries())i.bases=state.grounds.filter(b=>b.ids.includes(i.id));
}
function saveGround(){
 const draft=state.groundDraft;
 const article=articleNumber(draft.article);
 const paragraph=subNumber(draft.paragraph,'항');
 const clause=subNumber(draft.clause,'호');
 const ids=groundEntries(draft.type).map(({i})=>i.id).filter(id=>draft.ids.includes(id));
 const checks=[
  [!draft.law.trim(),'법령 검색 결과에서 법령과 조문을 선택해 주세요.'],
  [!/^\d+(?:의\d+)?$/.test(article),'조 번호를 입력해 주세요. 예를 들어 제24조의2처럼 입력할 수 있습니다.'],
  [[paragraph,clause].some(v=>v&&!/^\d+$/.test(v)),'항과 호에는 제1항 또는 제1호처럼 번호를 입력해 주세요.'],
  [!ids.length,'근거를 적용할 항목을 하나 이상 선택해 주세요.']
 ];
 const invalid=checks.find(([failed])=>failed);
 if(invalid){feedback(invalid[1]);return;}
 const containsRnn=ids.some(key=>rnn(getItem(key).name));
 if(containsRnn&&draft.basisCode==='residentLaw'&&!draft.specific){feedback('주민등록번호의 구체적인 처리 근거와 적용 요건을 확인해 주세요.');return;}
 const normalized={...draft,ids,article,paragraph,clause};
 const rule=LawBasis.rules[draft.basisCode];
 if(!rule||!draftOptions(draft).some(([code])=>code===draft.basisCode)){feedback('처리 유형에 맞는 개인정보 보호법상 근거를 선택하세요.');return;}
 if(rule.effect!=='consent'){
  if(LawBasis.consentCitation(normalized)){feedback('동의를 요구하는 조항 또는 포괄 조항으로는 고지사항으로 전환할 수 없습니다. 동의 근거를 선택하거나 구체적인 별도 근거를 확인하세요.');return;}
  if(!draft.verified||!draft.pipaVerified){feedback('동의 없이 처리하려면 법령 API로 근거 조항과 연결 조항의 원문을 먼저 확인하세요.');return;}
  if(!draft.conditionsConfirmed||rule.needsLaw&&!draft.authorityConfirmed||rule.needsLaw&&LawBasis.isPipa(draft.law)){feedback('개별 법령의 구체적인 처리 허용 근거와 연결 조항의 적용 요건을 확인하세요.');return;}
 }

 const saved={...normalized,id:draft.editId||id(),cite:cite(normalized),specific:containsRnn&&draft.basisCode==='residentLaw'&&draft.specific};
 state.grounds=[...state.grounds.filter(b=>b.id!==saved.id),saved];
 state.groundDraft=null;state.edits={};syncGrounds();message='근거와 적용 범위를 저장했습니다.';render();
}


function sections(){
 const map=new Map();
 for(const {key,g,i} of entries()){
  const isRnn=rnn(i.name);
  if(isRnn&&!LawBasis.notice(i.bases,lawContext({key,g,i}),'rnn')) continue;
  const classification=isRnn?'rnn':kind(i);
  const required=['collect','extra'].includes(key)?i.required?'필수':'선택':key==='marketing'?'선택':'';
  const basis=LawBasis.notice(i.bases,lawContext({key,g,i}),classification)?'notice':'consent';
  const k=[basis,key,classification,required].join('.');
  if(!map.has(k)) map.set(k,{k,basis,key,g,classification,required,items:[]});
  map.get(k).items.push(i);
 }
 const groupOrder=s=>s.key==='collect'?({general:0,sensitive:2,unique:4,rnn:4}[s.classification]+(s.required==='선택'?1:0)):{extra:6,provide:7,marketing:8}[s.key];
 return [...map.values()].sort((a,b)=>groupOrder(a)-groupOrder(b)||Number(b.required==='필수')-Number(a.required==='필수'));
}
const consentSections = () => sections().filter(s=>s.basis==='consent');
const hasConsent = () => consentSections().length>0;
const consentDetails = () => {
 const rows=consentSections();
 const purposes=[...new Set(rows.map(s=>s.g.purpose.trim()).filter(Boolean))];
 const provides=rows.some(s=>s.key==='provide');
 const uses=rows.some(s=>s.key!=='provide');
 return {
  purpose:purposes.join(' 및 ')||'업무 처리',
  action:provides?(uses?'수집·이용·제공':'제공'):'수집·이용'
 };
};
const withParticle = (text,consonant,vowel) => {
 const last=text.charCodeAt(text.length-1);
 if(last>=0xac00&&last<=0xd7a3)return text+((last-0xac00)%28?consonant:vowel);
 return text+consonant+'('+vowel+')';
};
const suggestedTitle = () => {
 if(!hasConsent())return '개인정보 처리 고지서';
 const {purpose,action}=consentDetails();
 return withParticle(purpose,'을','를')+' 위한 개인정보 '+action+' 동의서';
};
const noticeIntro = '아래 항목의 처리 목적, 보유 및 이용기간과 적용한 처리 근거를 안내합니다.';
const defaultIntro = () => {
 if(!hasConsent())return noticeIntro;
 const {purpose,action}=consentDetails();
 const agency=withParticle(state.agency.trim(),'은','는');
 return `${agency} ${withParticle(purpose,'을','를')} 위하여 아래와 같이 개인정보를 ${action}하고자 합니다. 내용을 자세히 확인하신 후 동의 여부를 결정하여 주시기 바랍니다.`;
};
const sectionTitle = s => [groupNames[s.key],s.classification==='rnn'?'고유식별정보 (주민등록번호)':s.classification!=='general'?categoryNames[s.classification]:'',s.required].filter(Boolean).join(' · ');
const refusalSections = () => sections().filter(s=>s.basis==='consent'||s.classification==='rnn');
const refusalText = (s,preview) => {
 const text=state.refusals[s.k]?.trim();
 if(text)return `<span class="doc-refusal-text">${safe(text)}</span>`;
 return preview?'<em class="doc-refusal-missing">아직 입력하지 않았습니다</em>':'';
};
const note = text => `<p class="doc-note"><span class="doc-note-marker" aria-hidden="true">※</span> <span>${text}</span></p>`;
const refusalPrefix = s => `[${s.required||'선택'}] 동의를 거부할 수 있습니다. 그러나 동의를 거부할 경우, `;
const marketingContact = '<p class="doc-marketing"><strong>제공하신 연락처로 마케팅 안내나 홍보 연락을 받을 수 있습니다.</strong></p>';
const sectionHeading = s => s.key==='collect'&&s.classification==='sensitive'?categoryNames.sensitive:sectionTitle({...s,required:''});
const editableText = (label,key,value,editable) => `<span class="doc-text" ${editable?`contenteditable="plaintext-only" role="textbox" aria-label="${safe(label)}" data-edit="${key}"`:''}>${safe(state.edits[key]??value)}</span>`;
function consentTable(rows,editable){
 const first=rows[0];
 const provider=first.key==='provide';
 const hasRequired=rows.some(s=>s.required);
 const merge = key => rows.length===2&&first.key==='collect'&&
  rows.every(row=>(state.edits[row.k+'.'+key]??row.g[key]).trim()===(state.edits[first.k+'.'+key]??first.g[key]).trim());
 const conditionCell=(row,index,key,label,bold=false)=>{
  const merged=merge(key);
  const text=editableText(sectionTitle(row)+' '+label,row.k+'.'+key,row.g[key],editable);
  if(merged&&index)return '';
  return `<td${merged?' rowspan="2"':''}>${bold?'<strong>'+text+'</strong>':text}</td>`;
 };
 return `<article><h3>${sectionHeading(first)}${provider&&first.g.outside?' (수집 목적 외 제공)':''}</h3><table class="doc-table"><thead><tr>${hasRequired?'<th scope="col">구분</th>':''}${provider?'<th scope="col">제공받는 자</th>':''}<th scope="col">개인정보 항목</th><th scope="col">${provider?'제공받는 자의 이용 목적':'이용 목적'}</th><th scope="col">보유 및 이용기간</th></tr></thead><tbody>${rows.map((s,index)=>`<tr>${hasRequired?`<th scope="row">${s.required}</th>`:''}${provider?`<td><strong>${editableText('제공받는 자',s.k+'.recipient',s.g.recipient,editable)}</strong></td>`:''}<td><strong>${editableText(sectionTitle(s)+' 항목',s.k+'.items',s.items.map(i=>i.name).join(', '),editable)}</strong></td>${conditionCell(s,index,'purpose','목적')}${conditionCell(s,index,'period','보유 및 이용기간',true)}</tr>`).join('')}</tbody></table>${rows.map(s=>`<div class="doc-consent">${note(refusalPrefix(s)+refusalText(s,editable))}${s.key==='marketing'?marketingContact:''}<p class="doc-choice"><span>위 항목의 처리에 동의하십니까?</span><strong>□ 동의　 □ 미동의</strong></p></div>`).join('')}</article>`;
}
function noticeTable(rows,editable){
 const first=rows[0], provider=first.key==='provide';
 const heading=first.key==='provide'?'개인정보 제3자 제공':first.key==='extra'?'개인정보 목적 외 이용':first.key==='marketing'?'마케팅 목적 개인정보 이용':groupNames.collect;
 return `<article class="doc-notice"><h3>${heading} 관련 고지사항${provider&&first.g.outside?' (수집 목적 외 제공)':''}</h3><table class="doc-table"><thead><tr>${provider?'<th scope="col">제공받는 자</th>':''}<th scope="col">처리 목적</th><th scope="col">개인정보 항목</th><th scope="col">보유 및 이용기간</th><th scope="col">처리 근거</th></tr></thead><tbody>${rows.flatMap(s=>s.items.map(i=>`<tr>${provider?`<td>${editableText(i.name+' 제공받는 자',i.id+'.recipient',s.g.recipient,editable)}</td>`:''}<td>${editableText(i.name+' 처리 목적',i.id+'.purpose',s.g.purpose,editable)}</td><th scope="row">${editableText('개인정보 항목',i.id+'.item',i.name,editable)}</th><td><strong>${editableText(i.name+' 보유 및 이용기간',i.id+'.period',s.g.period,editable)}</strong></td><td><strong>${i.bases.filter(b=>LawBasis.rules[b.basisCode]?.effect!=='consent').map(b=>safe(LawBasis.rules[b.basisCode]?.pipa||'')+' · '+safe(b.cite)).join(' / ')}</strong></td></tr>`)).join('')}</tbody></table>${first.key==='marketing'?marketingContact:''}${rows.filter(s=>s.classification==='rnn'&&(editable||state.refusals[s.k]?.trim())).map(s=>note('번호 미제공 시 안내 '+refusalText(s,editable))).join('')}</article>`;
}
const signatureLine = '_'.repeat(24);
function signatureBlock(){
 return `<article class="sign"><p>　　　　년　　 월　　 일</p><p>정보주체 성명 <span class="signature-line">${signatureLine}</span> (서명)</p>${state.child?`<p><strong>만 14세 미만 아동의 법정대리인 동의</strong></p><p>법정대리인 성명 <span class="signature-line">${signatureLine}</span> (서명)</p><p class="guardian-relationship">아동과의 관계: <span class="signature-line">${signatureLine}</span></p>`:''}</article>`;
}
function documentHTML(editable=false){
 const rows=sections();
 if(!rows.length)return '';
 const consentGroups=new Map(),noticeGroups=new Map();
 for(const row of rows){
  const consent=row.basis==='consent';
  const groups=consent?consentGroups:noticeGroups;
  const key=consent?row.key+'.'+row.classification:row.key;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(row);
 }
 const title=state.title.trim()||suggestedTitle();
 const intro=state.intro.trim()||defaultIntro();
 return `<section class="doc"><h1>${safe(title)}</h1><p class="doc-intro">${safe(intro)}</p>${[...consentGroups.values()].map(group=>consentTable(group,editable)).join('')}${[...noticeGroups.values()].map(group=>noticeTable(group,editable)).join('')}${consentGroups.size?signatureBlock():''}<p class="doc-agency"><strong>${safe(state.agency||'기관명 미입력')} 귀중</strong></p></section>`;
}
function output(){
 const rows=refusalSections();
 const docs=documentHTML(true);
 return `<div class="output-layout"><div class="stack output-settings"><section class="panel stack"><h2>문서 기본 설정</h2>${field('문서 제목','title',state.title,suggestedTitle(),false,true)}<div><button data-title>제목 후보 적용</button></div>${field('제목 아래 안내사항','intro',state.intro,defaultIntro(),true,true)}<div><button data-intro>안내사항 후보 적용</button></div></section>
 ${hasConsent()?`<fieldset class="panel child-choice"><legend>만 14세 미만 아동 대상 여부${requiredMark}</legend><p class="muted">아동 대상이면 동의서에 법정대리인 동의·서명란을 추가합니다.</p><div class="actions"><label class="check"><input type="radio" name="child" required data-child value="yes" ${state.child?'checked':''}> 대상</label><label class="check"><input type="radio" name="child" required data-child value="no" ${state.child===false?'checked':''}> 대상 아님</label></div></fieldset>`:''}
 <section class="panel stack"><h2>동의 거부 시 불이익</h2><p class="muted">처리 구분별로 동의를 거부하거나 정보를 제공하지 않았을 때의 영향을 적어 주세요.</p>${rows.length?rows.map(s=>field(sectionTitle(s)+(s.classification==='rnn'?' · 번호 미제공 시 안내':''),'refusals.'+s.k.replaceAll('.',':'),state.refusals[s.k],'해당하는 불이익 또는 안내 내용을 입력하세요.',true,true)).join(''):'<p class="muted">작성할 동의 항목이 없습니다.</p>'}</section>
 <section class="panel stack"><h2>문서 수정 요청</h2><p class="muted">수정 요청 화면을 체험할 수 있습니다. AI 연결은 준비 중입니다.</p>${field('수정할 내용','!chat',chat,'예: 거부 시 불이익 설명을 간결하게 다듬어 주세요.',true)}<div><button data-chat>수정 요청</button></div></section></div>
 <section class="panel preview-panel"><div class="panelhead"><h2>A4 문서 미리보기</h2><span class="pill">표의 내용 직접 수정</span></div><div class="actions export"><button data-page-preview ${docs?'':'disabled'}>쪽 미리보기</button><button class="primary" data-finish ${docs?'':'disabled'}>완성하기</button></div><p class="notice" id="output-status" role="status"></p><div id="preview-docs">${docs||'<p>문서에 표시할 항목이 없습니다.</p>'}</div></section></div>`;
}
function validateDraft(){
 const missingRefusal=refusalSections().find(s=>!state.refusals[s.k]?.trim());
 const emptyEdit=Object.entries(state.edits).find(([,value])=>!value.trim());
 const checks=[
  [!state.title.trim(),'문서 제목을 입력하거나 제목 후보를 적용해 주세요.','[data-path="title"]'],
  [!state.intro.trim(),'제목 아래 안내사항을 입력하거나 안내사항 후보를 적용해 주세요.','[data-path="intro"]'],
  [hasConsent()&&state.child===null,'만 14세 미만 아동 대상 여부를 선택해 주세요.','[data-child]'],
  [missingRefusal,missingRefusal&&sectionTitle(missingRefusal)+'의 불이익 또는 안내 내용을 입력해 주세요.',missingRefusal&&`[data-path="refusals.${missingRefusal.k.replaceAll('.',':')}"]`],
  [emptyEdit,'미리보기 표에서 비워 둔 내용을 입력해 주세요.',emptyEdit&&`[data-edit="${emptyEdit[0]}"]`]
 ];
 const invalid=checks.find(([failed])=>failed);
 if(!invalid)return true;
 feedback(invalid[1]);
 document.querySelector(invalid[2])?.focus();
 return false;
}
function reviewDocument(){
 const rows=sections();
 const consent=rows.filter(row=>row.basis==='consent');
 const notices=rows.filter(row=>row.basis==='notice');
 const html=documentHTML();
 const body=document.createElement('div');
 body.innerHTML=html;
 const missingCell=[...body.querySelectorAll('.doc-table tbody td,.doc-table tbody th')].some(cell=>!cell.textContent.trim());
 const refusalCount=body.querySelectorAll('.doc-consent .doc-note').length;
 const choiceCount=body.querySelectorAll('.doc-choice').length;
 const items=[
  ['필수 고지 항목 기재',!missingCell&&refusalCount===consent.length?'확인':'보완 필요',
   '목적, 항목, 보유·이용 기간, 해당 시 제공받는 자, 거부권·불이익 기재 여부를 확인합니다.'],
  ['동의란 구분',!consent.length?'해당 없음':choiceCount===consent.length?'확인':'보완 필요',
   '동의가 필요한 각 구분에 동의·미동의 표시가 있는지 확인합니다.'],
  ['법정대리인 동의란',state.child?(body.querySelector('.guardian-relationship')?'확인':'보완 필요'):'해당 없음',
   '아동 대상인 경우 법정대리인 서명란과 관계 기입란을 확인합니다.'],
  ['법적 근거와 동의 범위의 적정성','담당자 확인 필요',
   notices.length?'채택한 근거가 고지 항목에 실제로 적용되는지 확인해 주세요.':'동의가 필요한 처리 범위와 동의 방법이 적절한지 확인해 주세요.'],
  ['기관 지침 대조','첨부 대기','관련 지침이 첨부되면 해당 기준에 따라 추가 검토할 수 있습니다.']
 ];
 if(rows.some(row=>row.classification!=='general'||row.key==='extra'||row.g.outside)){
  items.splice(4,0,['특수 처리 요건','담당자 확인 필요','민감정보, 고유식별정보 또는 목적 외 이용·제공에 해당하는 항목의 처리 요건과 근거를 확인해 주세요.']);
 }
 if(consent.some(row=>row.required==='선택')){
  items.splice(4,0,['선택 동의의 거부에 따른 영향','담당자 확인 필요','입력한 불이익 문구가 선택 동의 거부를 이유로 기본 서비스 제공을 제한하는지 확인해 주세요.']);
 }
 return {html,items};
}
function finalPage(){
 const {items,html}=finalDocument;
 return `<div class="title"><h1 tabindex="-1">최종본</h1><p>최종본을 확인하고 저장하거나 인쇄하세요.</p></div>
 <div class="final-layout"><section class="panel final-review" aria-labelledby="final-review-title"><h2 id="final-review-title">최종 점검 결과</h2>
 <p class="muted">자동 점검은 문서에 필요한 항목과 동의란의 기재 여부를 확인합니다. 실제 처리 근거의 적정성과 법령 준수 여부는 담당자 확인이 필요합니다.</p>
 <ul>${items.map(([title,status,description])=>`<li><div><strong>${title}</strong> <span class="pill ${status==='확인'||status==='해당 없음'?'':'pending'}">${status}</span></div><p>${description}</p></li>`).join('')}</ul>
 <a href="${reference}" target="_blank" rel="noopener">개인정보 보호법 원문</a></section>
 <section class="panel preview-panel final-preview"><div class="panelhead"><h2>A4 최종본</h2></div><div class="actions export">
 <button data-go="4">← 문서 수정</button><button data-page-preview>쪽 미리보기</button><button data-pdf>PDF 저장</button><button data-hwpx>한글(HWPX) 저장</button><button class="primary" data-print>즉시 인쇄</button>
 </div><p class="notice" id="output-status" role="status"></p><div id="preview-docs">${html}</div></section></div>`;
}

function refreshPreview(){
 const preview=document.querySelector('#preview-docs');
 if(preview)preview.innerHTML=documentHTML(true);
}

function render(){
 document.querySelector('#homeNav').toggleAttribute('aria-current',step===0);
 document.querySelector('#workNav').toggleAttribute('aria-current',step!==0);
 if(!step){app.innerHTML=home();return;}
 if(step===5){app.innerHTML=finalPage();return;}
 const body=[basics,classify,grounds,output][step-1]();
 const all=entries();
 const issues=all.filter(({i})=>signal(i.name)!=='general');
 const missing=all.filter(({g})=>!g.purpose.trim()||!g.period.trim()).length;
 app.innerHTML=`<div class="trail"><button data-go="0">홈</button> / 문서 작성</div><div class="title"><h1>${labels[step-1]}</h1><p>${descriptions[step-1]}</p></div><nav class="stepper" aria-label="작성 단계">${labels.map((name,n)=>`<button data-go="${n+1}" ${step===n+1?'aria-current="step"':''} ${n+1>reached||(n===3&&unresolvedRnn().length)?'disabled':''}><span class="stepnum">${String(n+1).padStart(2,'0')}</span>${name}</button>`).join('')}</nav><div class="workspace ${step===4?'wide-output':''}"><div class="stack">${body}<div class="notice" id="message" role="status">${safe(message)}</div><div class="bar"><button data-go="${step-1}">← ${step===1?'홈으로':'이전 단계'}</button>${step<4?`<button class="primary" data-next ${step===3&&unresolvedRnn().length?'disabled aria-describedby="rrn-block"':''}>${step===2?'분류 확정 후 다음':step===3?'문서 작성으로':'다음 단계'} →</button>`:''}</div></div>${step===4?'':`<aside class="side"><h2>${step===1?'입력 점검':'검토 현황'}</h2><span class="pill">등록 항목 <span id="count">${all.length}</span>개</span><hr><p id="risk">${riskHTML(issues,missing)}</p><p class="muted">예시 규칙에 따른 제안입니다. 분류와 근거는 담당자가 직접 확인합니다.</p><button data-guide>이용 안내 ↗</button></aside>`}</div>`;
 if(step===1&&basicsChecked)showBasicsIssues();
}

function contextualRisk({g,i}){
 const purpose=g.purpose.trim(), name=i.name;
 if(!purpose)return '';
 if(/추첨|응모|경품|이벤트|뉴스레터|홍보/.test(purpose)&&/질병|진단|병력|건강|장애|복약|상담/.test(name))return '현재 목적에서 건강 관련 항목이 필요한지 확인하세요. 참가자 선정에 쓰지 않는다면 제외를 검토하세요.';
 if(/추첨|응모|경품|이벤트|뉴스레터|홍보|출석|만족도/.test(purpose)&&rnn(name))return '현재 목적에 주민등록번호가 필요한지 확인하세요. 별도의 처리 근거도 확인해야 합니다.';
 if(/뉴스레터|홍보|만족도/.test(purpose)&&/계좌|상세주소|신분증/.test(name))return '현재 목적에 꼭 필요한 항목인지 확인하고 수집 범위를 줄일 수 있는지 검토하세요.';
 return '';
}
function riskHTML(issues,missing){
 const risks=entries().map(e=>({entry:e,reason:contextualRisk(e)})).filter(x=>x.reason);
 return `<strong>과다 수집 가능성 ${risks.length}건</strong>${risks.length?risks.map(({entry,reason})=>`<span class="risk-entry"><b>${safe(entry.i.name)}</b><small>${safe(entry.g.purpose)} · ${groupNames[entry.key]}</small>${reason}</span>`).join(''):'<br>예시 점검 규칙에 걸린 항목이 없습니다.'}<br><br><strong>분류 확인 항목 ${issues.length}개</strong>${issues.map(({i})=>`<br>${safe(i.name)} · ${hint(i)}`).join('')}<br><strong>목적·기간 확인 항목 ${missing}개</strong>`;
}
function refreshRisk(){
 const all=entries(), count=document.querySelector('#count');
 if(!count)return;
 count.textContent=all.length;
 document.querySelector('#risk').innerHTML=riskHTML(all.filter(({i})=>signal(i.name)!=='general'),all.filter(({g})=>!g.purpose.trim()||!g.period.trim()).length);
}
function go(n){
 if(n===5&&(step!==4||!finalDocument))return;
 if(n!==5)finalDocument=null;
 if(step===1&&n>1&&!validateBasics())return;
 if(n===4&&unresolvedRnn().length){feedback('주민등록번호의 수집·제공 근거와 제24조의2의 구체적 처리 허용 근거를 모두 확인해 주세요.');return;}
 if(n===2&&!state.groups[tab].enabled)tab=Object.keys(state.groups).find(k=>state.groups[k].enabled)||'collect';
 basicsChecked=false;
 step=n;reached=Math.max(reached,Math.min(n,4));message='';render();window.scrollTo(0,0);
 if(n===3&&!apiStatus)readApiStatus().then(()=>{if(step===3)render();}).catch(error=>{lawSearch.error=apiErrorMessage(error);if(step===3)render();});
 if(n){const h=app.querySelector('.title h1');h.tabIndex=-1;h.focus({preventScroll:true});}
}
function feedback(text){
 message=text;
 const status=document.querySelector('#ground-status, #output-status')||document.querySelector('#message');
 if(status)status.textContent=text;
}
function invalidateItems(items){
 const keys=new Set(items.map(i=>i.id));
 lawSearch.version++;lawSearch.busy=false;lawSearch.candidates=[];lawSearch.note='입력 내용이 바뀌었습니다. 법령 후보를 다시 검색하세요.';
 state.grounds=state.grounds.map(b=>({...b,ids:b.ids.filter(key=>!keys.has(key))})).filter(b=>b.ids.length);
 if(state.groundDraft)state.groundDraft=null;
 state.edits={};reached=Math.min(reached,step);
 syncGrounds();
}
function add(key,name='',required=false){
 const i={id:id(),name,required};state.groups[key].items.push(i);return i;
}
function sample(){
 state.agency='가온시 평생학습관';
 state.groups={collect:group(true),extra:group(false),provide:group(true),marketing:group(false)};
 Object.assign(state.groups.collect,{purpose:'시민 교육 프로그램 신청 관리',period:'프로그램 종료 후 1년'});
 add('collect','성명',true);add('collect','휴대전화번호',true);add('collect','이메일');add('collect','건강상담 기록');
 Object.assign(state.groups.provide,{recipient:'가온시 교육지원센터',purpose:'참가자 출석 관리',period:'교육 종료 후 30일'});
 add('provide','성명');
 Object.assign(state,{title:'',intro:'',child:null,edits:{},refusals:{},search:false,grounds:[],groundDraft:null});
 chat='';tab='collect';lawSearch={busy:false,candidates:[],error:'',note:'',mode:'live',rejected:[],version:lawSearch.version+1};reached=1;go(1);
}
function setPath(path,value){
 if(path==='!chat'){chat=value;return;}
 if(path.startsWith('refusals.')){
  const key=path.slice(9).replaceAll(':','.');
  state.refusals[key]=value;return;
 }
 const parts=path.split('.');
 const object=parts.slice(0,-1).reduce((o,k)=>o[k],state);
 if(object[parts.at(-1)]===value)return;
 object[parts.at(-1)]=value;
 if(parts[0]==='groups')invalidateItems(object.items);
 if(parts[0]==='groundDraft'&&['law','article','paragraph','clause','excerpt'].includes(parts.at(-1))){resetLawVerification(state.groundDraft);const editor=document.querySelector('.basis-selection');if(editor)editor.outerHTML=basisEditor(state.groundDraft);}
}
document.addEventListener('input',e=>{
 const el=e.target,d=el.dataset;
 if('lawQuery' in d)lawPicker.query=el.value;
 if(d.path&&el.type!=='checkbox')setPath(d.path,el.value);
 if(d.name){
  const i=getItem(d.name);
  i.name=el.value;delete i.kind;invalidateItems([i]);
  document.querySelector('#hint-'+i.id).textContent=i.name?hint(i):'';
 }
 if(d.edit){
  state.edits[d.edit]=el.innerText;
  const cell=el.closest('td[rowspan="2"]');
  if(cell){
   const [basis,key,classification,,part]=d.edit.split('.');
   state.edits[[basis,key,classification,'선택',part].join('.')]=el.innerText;
  }
 }
 if(step===1&&(d.path||d.name)){
  document.querySelectorAll('.stepper button').forEach((b,n)=>b.disabled=n+1>reached);
  refreshRisk();
 }
 if(step===1&&basicsChecked&&(d.path||d.name))showBasicsIssues();
 if(step===4&&d.path&&d.path!=='!chat')refreshPreview();
});
document.addEventListener('change',e=>{
 const {dataset:d,checked,value}=e.target;
 if('child' in d){state.child=value==='yes';refreshPreview();}
 if(d.enable){const g=state.groups[d.enable];g.enabled=checked;invalidateItems(g.items);reached=1;render();document.querySelector(`[data-enable="${d.enable}"]`).focus();}
 if('outside' in d){state.groups.provide.outside=checked;invalidateItems(state.groups.provide.items);render();}
 if(d.required){const i=getItem(d.required);i.required=checked;invalidateItems([i]);render();document.querySelector(`[data-required="${d.required}"]`).focus();}
 if(d.kind){const i=getItem(d.kind);i.kind=value;invalidateItems([i]);render();document.querySelector(`[data-kind="${d.kind}"]`)?.focus();}
 if('pickArticle' in d){lawPicker.article=value;lawPicker.paragraph='';lawPicker.clause='';setPickedCitation();}
 if('pickParagraph' in d){lawPicker.paragraph=value;lawPicker.clause='';setPickedCitation();}
 if('pickClause' in d){lawPicker.clause=value;setPickedCitation();}
 if('groundType' in d){state.groundDraft={...groundInitial(value),law:state.groundDraft.law,article:state.groundDraft.article,paragraph:state.groundDraft.paragraph,clause:state.groundDraft.clause};render();document.querySelector('[data-ground-type]').focus();}
 if('lawMode' in d){lawSearch.mode=value;lawSearch.candidates=[];lawSearch.error='';lawSearch.note='';lawSearch.rejected=[];render();}
 if('basisCode' in d){state.groundDraft.basisCode=value;resetLawVerification(state.groundDraft);render();document.querySelector('[data-basis-code]').focus();}
 if('lawConditions' in d)state.groundDraft.conditionsConfirmed=checked;
 if('lawAuthority' in d)state.groundDraft.authorityConfirmed=checked;

 if(d.scope){
  const draft=state.groundDraft;
  draft.ids=checked?[...draft.ids,d.scope]:draft.ids.filter(k=>k!==d.scope);
  draft.conditionsConfirmed=false;draft.authorityConfirmed=false;
  const editor=document.querySelector('.basis-selection');if(editor)editor.outerHTML=basisEditor(draft);
  if(rnn(getItem(d.scope).name)){draft.specific=false;render();document.querySelector(`[data-scope="${d.scope}"]`).focus();}
 }
 if('specific' in d)state.groundDraft.specific=checked;
});
function basicsIssues(){
 const issues=[];
 const add=(selector,text)=>issues.push({selector,text});
 if(!state.agency.trim())add('[data-path="agency"]','수집 기관명을 입력해 주세요.');
 const active=Object.entries(state.groups).filter(([,g])=>g.enabled);
 if(!active.length)add('[data-enable="collect"]','처리 유형을 하나 이상 사용으로 선택해 주세요.');
 for(const [key,g] of active){
  const name=groupNames[key];
  if(key==='provide'&&!g.recipient.trim())add('[data-path="groups.provide.recipient"]','제공받는 자를 입력해 주세요.');
  if(!g.purpose.trim())add(`[data-path="groups.${key}.purpose"]`,name+'의 이용 목적을 입력해 주세요.');
  if(!g.period.trim())add(`[data-path="groups.${key}.period"]`,name+'의 보유 및 이용기간을 입력해 주세요.');
  if(!g.items.length)add(`[data-add="${key}"]`,name+'의 개인정보 항목을 하나 이상 추가해 주세요.');
  g.items.forEach((item,index)=>{
   if(!item.name.trim())add(`[data-name="${item.id}"]`,name+'의 '+(index+1)+'번째 개인정보 항목명을 입력해 주세요.');
  });
 }
 return issues;
}
function showBasicsIssues(){
 const issues=basicsIssues();
 for(const control of app.querySelectorAll('[data-basic-invalid]')){
  document.getElementById(control.getAttribute('aria-describedby'))?.remove();
  control.removeAttribute('data-basic-invalid');
  control.removeAttribute('aria-invalid');
  control.removeAttribute('aria-describedby');
 }
 issues.forEach(({selector,text},index)=>{
  const control=app.querySelector(selector);
  const error=document.createElement('small');
  error.className='basic-error';
  error.id='basic-error-'+index;
  error.textContent=text;
  if(control.matches('[data-name]'))control.parentElement.append(error);
  else control.after(error);
  control.setAttribute('data-basic-invalid','');
  if(!control.matches('button'))control.setAttribute('aria-invalid','true');
  control.setAttribute('aria-describedby',error.id);
 });
 return issues;
}
function validateBasics(){
 basicsChecked=true;
 const [first]=showBasicsIssues();
 if(!first)return true;
 app.querySelector(first.selector).focus();
 return false;
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if('guide' in d)document.querySelector('#guide').showModal();
 if('start' in d)go(1);
 if('sample' in d&&(!entries().length||confirm('현재 입력을 예시로 바꾸시겠습니까?')))sample();
 if('go' in d)go(Number(d.go));
 if(d.add){
  const i=add(d.add);render();document.querySelector(`[data-name="${i.id}"]`).focus();
 }
 if(d.bulkRequired&&canSetRequired(d.bulkRequired)){
  const required=b.value==='required';
  const changed=state.groups[d.bulkRequired].items.filter(i=>i.required!==required);
  changed.forEach(i=>i.required=required);
  if(changed.length){
   invalidateItems(changed);
   render();
   app.querySelector(`[data-bulk-required="${d.bulkRequired}"][value="${b.value}"]`).focus({preventScroll:true});
  }
 }
 if(d.move){
  const [key,direction]=d.move.split(':');
  const g=Object.values(state.groups).find(g=>g.items.some(i=>i.id===key));
  const from=g.items.findIndex(i=>i.id===key), to=from+Number(direction);
  if(to>=0&&to<g.items.length){[g.items[from],g.items[to]]=[g.items[to],g.items[from]];state.edits={};render();document.querySelector(`[data-move="${d.move}"]:enabled, [data-name="${key}"]`).focus();}
 }
 if(d.delete){const item=getItem(d.delete);for(const g of Object.values(state.groups))g.items=g.items.filter(i=>i.id!==d.delete);invalidateItems([item]);render();}
 if(d.tab){tab=d.tab;render();document.querySelector(`[data-tab="${d.tab}"]`).focus();}
 if('next' in d){
  if(step===2&&!entries().length){feedback('검토할 항목을 하나 이상 입력해 주세요.');return;}
  go(step+1);
 }
 if('catalogSearch' in d)searchCatalog();
 if('catalogPage' in d)searchCatalog(Number(d.catalogPage));
 if('catalogLaw' in d)selectCatalogLaw(Number(d.catalogLaw));
 if('aiLaw' in d)findLaws();
 if('verifyLaw' in d)verifyGround();
 if('useLaw' in d){
  const candidate=lawSearch.candidates[Number(d.useLaw)];
  if(candidate){freshLawPicker();state.groundDraft={...groundInitial(candidate.type),...candidate,ids:[],specific:false,conditionsConfirmed:false,authorityConfirmed:false};message='적용할 항목을 선택하고 처리 근거를 검토하세요.';render();document.querySelector('.ground-editor')?.scrollIntoView({behavior:'smooth'});}
 }
 if('search' in d){state.search=!state.search;render();document.querySelector('[data-search]').focus();}
 if('addGround' in d){
  const first=Object.keys(groundTypes).find(k=>groundEntries(k).length)||'required';
  freshLawPicker();state.groundDraft=groundInitial(first);message='';render();document.querySelector('[data-ground-type]').focus();
 }
 if(d.editGround){freshLawPicker();const saved=state.grounds.find(b=>b.id===d.editGround);state.groundDraft={...saved,ids:[...saved.ids],editId:saved.id};message='';render();document.querySelector('[data-ground-type]').focus();}
 if('cancelGround' in d){state.groundDraft=null;message='';render();document.querySelector('[data-add-ground]').focus();}
 if('adoptGround' in d)saveGround();
 if(d.removeGround){state.grounds=state.grounds.filter(b=>b.id!==d.removeGround);if(state.groundDraft?.editId===d.removeGround)state.groundDraft=null;syncGrounds();state.edits={};message='채택을 취소했습니다.';render();}
 if('title' in d||'intro' in d){
  const key='title' in d?'title':'intro';
  state[key]=key==='title'?suggestedTitle():defaultIntro();
  document.querySelector(`[data-path="${key}"]`).value=state[key];refreshPreview();
 }
 if('chat' in d)feedback(chat.trim()?'AI 미연결 상태입니다. 미리보기 표의 내용을 직접 수정할 수 있습니다.':'수정할 내용을 입력해 주세요.');
 if('finish' in d&&step===4&&validateDraft()){
  finalDocument=reviewDocument();
  go(5);
 }
 if(('pdf' in d||'print' in d||'hwpx' in d)&&(step!==5||!finalDocument))return;
 if('pagePreview' in d)previewPages(b);
 if('print' in d){document.querySelector('#print').innerHTML=exportMarkup();window.print();}
 if('pdf' in d||'hwpx' in d)downloadDocument(b,'pdf' in d?'pdf':'hwpx');
});
render();

function zipStored(files){
 const enc=new TextEncoder(), chunks=[], directory=[];
 let offset=0, directorySize=0;
 for(const [name,content] of Object.entries(files)){
  const key=enc.encode(name), bytes=typeof content==='string'?enc.encode(content):Uint8Array.from(atob(content.base64),ch=>ch.charCodeAt(0));
  let crc=0xffffffff;
  for(const byte of bytes){
   crc^=byte;
   for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  crc^=0xffffffff;
  const local=new DataView(new ArrayBuffer(30)), central=new DataView(new ArrayBuffer(46));
  const u16=(view,pos,value)=>view.setUint16(pos,value,true);
  const u32=(view,pos,value)=>view.setUint32(pos,value,true);
  u32(local,0,0x04034b50);u16(local,4,20);u16(local,12,33);u32(local,14,crc);u32(local,18,bytes.length);u32(local,22,bytes.length);u16(local,26,key.length);
  u32(central,0,0x02014b50);u16(central,4,20);u16(central,6,20);u16(central,14,33);u32(central,16,crc);u32(central,20,bytes.length);u32(central,24,bytes.length);u16(central,28,key.length);u32(central,42,offset);
  chunks.push(local.buffer,key,bytes);
  directory.push(central.buffer,key);
  offset+=30+key.length+bytes.length;
  directorySize+=46+key.length;
 }
 const end=new DataView(new ArrayBuffer(22)), count=Object.keys(files).length;
 end.setUint32(0,0x06054b50,true);end.setUint16(8,count,true);end.setUint16(10,count,true);end.setUint32(12,directorySize,true);end.setUint32(16,offset,true);
 return new Blob([...chunks,...directory,end.buffer],{type:'application/hwp+zip'});
}
const exportMarkup = () => step===5?finalDocument.html:documentHTML();

function exportBody(){
 const body=document.createElement('div');
 body.innerHTML=exportMarkup();
 return body;
}

async function previewPages(button){
 const dialog=document.querySelector('#page-preview');
 const frame=dialog.querySelector('iframe');
 const status=dialog.querySelector('[role="status"]');
 button.disabled=true;
 status.textContent='쪽 미리보기를 만드는 중입니다.';
 frame.hidden=true;
 dialog.showModal();
 try{
  const blob=await (await import('./pdf-export.js')).createPdf(exportBody(),documentTableGrid);
  if(!dialog.open)return;
  const url=URL.createObjectURL(blob);
  frame.src=url;
  frame.hidden=false;
  status.textContent='';
  dialog.addEventListener('close',()=>{
   frame.removeAttribute('src');
   URL.revokeObjectURL(url);
  },{once:true});
 }catch(error){
  console.error('Page preview failed',error);
  status.textContent='쪽 미리보기를 열지 못했습니다. 다시 시도해 주세요.';
 }finally{
  button.disabled=false;
 }
}

async function downloadDocument(button,format){
 const body=exportBody();
 const label=format==='pdf'?'PDF':'한글';
 button.disabled=true;
 feedback(label+' 파일을 만드는 중입니다.');
 try{
  const blob=format==='pdf'?await (await import('./pdf-export.js')).createPdf(body,documentTableGrid):await createHwpx(body);
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download='개인정보-문서.'+format;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  feedback(label+' 파일을 저장했습니다.');
 }catch(error){
  console.error(label+' export failed',error);
  feedback(label+' 파일을 생성하지 못했습니다. 다시 시도해 주세요.');
 }finally{
  button.disabled=false;
 }
}

function documentTableGrid(table){
 const grid=[];
 for(const [rowIndex,row] of Array.from(table.rows).entries()){
  const current=grid[rowIndex]??=[];
  let column=0;
  for(const cell of row.cells){
   while(current[column])column++;
   const span=cell.rowSpan||1;
   const entry={cell,column,start:rowIndex,span};
   for(let offset=0;offset<span;offset++){
    const line=grid[rowIndex+offset]??=[];
    line[column]=entry;
   }
   column++;
  }
 }
 return grid;
}

// Values below use HWPUNIT (1/100 pt). The width matches the A4 template's text area.
function hwpxTable(table,paragraph,nextId,preview){
 const rows=[...table.rows],width=42520,rowHeight=1800;
 const weights=[...rows[0].cells].map(cell=>cell.textContent.trim()==='구분'?0.55:1);
 const total=weights.reduce((sum,weight)=>sum+weight,0);
 const widths=weights.map(weight=>Math.floor(width*weight/total));
 widths[widths.length-1]+=width-widths.reduce((sum,part)=>sum+part,0);
 const id=nextId();
 const cells=documentTableGrid(table).map((row,rowIndex)=>{
  const header=rowIndex===0;
  preview.push(row.map(({cell})=>cell.textContent.trim()).join(' | '));
  return `<hp:tr>${row.filter(entry=>entry.start===rowIndex).map(({cell,column,span})=>{
   const emphasis=!header&&(cell.tagName==='TH'||cell.querySelector('strong'));
   const content=cell.textContent.trim().split(/\r?\n/).map(line=>paragraph(line,20,header?9:emphasis?7:0)).join('');
   return `<hp:tc name="" header="${Number(header)}" hasMargin="0" protect="0" editable="0" dirty="1" borderFillIDRef="${header||cell.tagName==='TH'?4:3}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${content}</hp:subList><hp:cellAddr colAddr="${column}" rowAddr="${rowIndex}"/><hp:cellSpan colSpan="1" rowSpan="${span}"/><hp:cellSz width="${widths[column]}" height="${rowHeight*span}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
  }).join('')}</hp:tr>`;
 }).join('');
 return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${widths.length}" cellSpacing="0" borderFillIDRef="3" noAdjust="0"><hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${rowHeight*rows.length}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>${cells}</hp:tbl></hp:run></hp:p>`;
}

async function createHwpx(body){
 const response=await fetch('hwpx-template.json');
 if(!response.ok)throw new Error('HWPX template unavailable');
 const files=await response.json();
 const documents=[...body.querySelectorAll('.doc')];
 let id=0;
 const nextId=()=>++id;
 const preview=[];
 const xmlText=text=>safe(text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,''));
 const run=(text,style)=>`<hp:run charPrIDRef="${style}"><hp:t>${xmlText(text)}</hp:t></hp:run>`;
 const richParagraph=(runs,align)=>`<hp:p id="${nextId()}" paraPrIDRef="${align}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${runs}</hp:p>`;
 const paragraph=(text,align,style)=>richParagraph(run(text,style),align);
 const paragraphs=documents.flatMap(doc=>
  [...doc.querySelectorAll('h1,h3,table,p')].flatMap(node=>{
   if(node.matches('table'))return hwpxTable(node,paragraph,nextId,preview);
   if(node.matches('.doc-choice')){
    const [question,choices]=[...node.children].map(child=>child.textContent);
    preview.push(question+' '+choices);
    return richParagraph(`<hp:run charPrIDRef="0"><hp:t>${xmlText(question)}<hp:tab width="20000" leader="NONE" type="RIGHT"/></hp:t></hp:run>`+run(choices,9),22);
   }
   const line=node.querySelector('.signature-line');
   if(line){
    const [before,after]=node.textContent.split(line.textContent);
    preview.push(before+after);
    return richParagraph(run(before,0)+run('　'.repeat(9),8)+run(after,0),23);
   }
   const title=node.matches('h1');
   const note=node.matches('.doc-note');
   const text=node.matches('.doc-choice')?[...node.children].map(child=>child.textContent).join('   '):node.textContent;
   const align=title||node.matches('.doc-agency')?20:note?21:node.closest('.sign')?23:0;
   const style=title?5:node.matches('h3,.doc-marketing')?7:0;
   return text.split(/\r?\n/).map(line=>{
    preview.push(line);
    return paragraph(line,align,style);
   });
  })
 );
 if(!paragraphs.length)throw new Error('No document to export');
 // Keep the template's section and column settings, and append editable paragraphs.
 files['Contents/section0.xml']=files['Contents/section0.xml']
  .replace('</hp:ctrl>','</hp:ctrl><hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar=""/></hp:ctrl>')
  .replace('</hs:sec>',()=>paragraphs.join('')+'</hs:sec>');
 files['Contents/content.hpf']=files['Contents/content.hpf'].replace('CONSENTTITLE',()=>safe(documents[0].querySelector('h1').textContent));
 files['Preview/PrvText.txt']=preview.join('\r\n');
 return zipStored(files);
}

document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-law-query]')){e.preventDefault();searchCatalog();}});

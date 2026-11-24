const app = document.querySelector('#app');
const labels = ['기본 내용 작성','항목 분류 검토','법적 근거 탐색','문서 작성 및 미리보기'];
const descriptions = ['기관명, 이용 목적, 보유기간과 개인정보 항목을 입력합니다.','개인정보 항목의 분류와 필수 여부를 확인합니다.','업무에 적용할 처리 근거를 찾아 확인합니다.','동의서 초안을 검토하고 A4 문서로 출력합니다.'];
const groupNames = { collect:'개인정보 수집·이용', extra:'목적 외 이용', provide:'제3자 제공', marketing:'마케팅' };
const categoryNames = { required:'일반 개인정보 (필수)', optional:'일반 개인정보 (선택)', general:'일반 개인정보', sensitive:'민감정보', unique:'고유식별정보' };
const group = enabled => ({enabled,purpose:'',period:'',optionalPurpose:'',optionalPeriod:'',recipient:'',outside:false,items:[]});
const newDraft = () => ({agency:'',groups:{collect:group(true),extra:group(false),provide:group(false),marketing:group(false)},refusals:{},title:'',child:null,edits:{},search:false,groundDraft:null,grounds:[],intro:''});
let state = newDraft();
function hasDraftChanges(){
 const ignoreEmptyRows=(key,value)=>key==='items'?value.filter(item=>item.name.trim()||item.required||item.manualName):value;
 return JSON.stringify(state,ignoreEmptyRows)!==JSON.stringify(newDraft());
}
let step=0, reached=0, tab='collect', message='', chat='';
let basicsChecked=false;
let finalDocument=null;
const safe = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const id = () => crypto.randomUUID();
const itemGroup = (key,g,i) => key==='collect'&&!i.required?{...g,purpose:g.optionalPurpose?.trim()||g.purpose,period:g.optionalPeriod?.trim()||g.period}:g;
const entries = () => Object.entries(state.groups).flatMap(([key,g])=>g.enabled?g.items.filter(i=>i.name.trim()).map(i=>({key,g:itemGroup(key,g,i),i})):[]);
const getItem = key => Object.values(state.groups).flatMap(g=>g.items).find(i=>i.id===key);
const itemNameKey = name => name.normalize('NFKC').toLowerCase().replace(/[\s·._-]+/g,'');
const itemNames = new Map(
 [
  ['성명','이름','성함'],
  ['휴대전화번호','휴대폰번호','핸드폰번호','휴대전화 연락처','휴대폰 연락처','모바일 전화번호','셀폰 번호'],
  ['전화번호','전화 연락처'],
  ['연락처','연락 가능한 번호'],
  ['유선전화번호','유선번호','일반전화번호','고정전화번호'],
  ['자택 전화번호','집 전화번호'],
  ['직장 전화번호','회사 전화번호','직장 유선전화'],
  ['업무용 연락처','업무 연락처'],
  ['팩스번호','FAX 번호'],
  ['이메일 주소','이메일','메일주소','전자우편주소','e-mail 주소'],
  ['주소','우편 주소'],
  ['상세주소','주소 상세'],
  ['우편번호','우편 코드','ZIP 코드'],
  ['자택 주소','집 주소'],
  ['배송지 주소','배송 주소','배송지'],
  ['직장 주소','회사 주소'],
  ['생년월일','출생일'],
  ['성별'],
  ['연령','나이'],
  ['국적'],
  ['소속','소속명'],
  ['소속 업체명','소속 회사명','소속 기업명'],
  ['부서명','소속 부서','부서 이름'],
  ['직위'],
  ['직급'],
  ['사번','사원번호','직원번호','임직원 번호'],
  ['학번','학생번호'],
  ['학교명','학교 이름'],
  ['학년'],
  ['반 번호','학급 번호'],
  ['회원번호','회원 식별번호','회원 고유번호'],
  ['계정 아이디','로그인 아이디','로그인 ID','계정 ID'],
  ['닉네임','별명'],
  ['IP 주소','IP','아이피 주소'],
  ['접속 시간','접속 시각'],
  ['기기 식별자','단말기 식별자','기기 ID','단말기 ID'],
  ['설문 응답 내용','설문 응답','설문 답변','설문 답변 내용'],
  ['개인을 식별할 수 있는 사진·영상'],
  ['출입 기록','출입 이력','출입 내역'],
  ['출입증 번호','출입증 식별번호'],
  ['차량번호','차량 등록번호','자동차 등록번호','자동차 번호'],
  ['은행명','은행 이름'],
  ['계좌번호','은행 계좌번호'],
  ['예금주명','예금주 이름','예금주 성명'],
  ['주민등록번호','주민번호'],
  ['외국인등록번호','외국인 등록 번호'],
  ['여권번호','여권 번호','여권 식별번호'],
  ['운전면허번호','운전면허증 번호'],
  ['건강정보']
 ].flatMap(([canonical,...aliases])=>[canonical,...aliases].map(name=>[itemNameKey(name),canonical]))
);
const standardItemName = name => itemNames.get(itemNameKey(name)) || name.trim();
const knownItemName = name => itemNames.has(itemNameKey(name));
function itemNameDistance(left,right){
 let row=Array.from({length:right.length+1},(_,index)=>index);
 for(let i=1;i<=left.length;i++){
  const next=[i];
  for(let j=1;j<=right.length;j++){
   next[j]=Math.min(row[j]+1,next[j-1]+1,row[j-1]+Number(left[i-1]!==right[j-1]));
  }
  row=next;
 }
 return row[right.length];
}
function similarItemNames(name){
 const key=itemNameKey(name);
 if(key.length<2||key.length>40||itemNames.has(key))return [];
 const scores=new Map();
 for(const [alias,standard] of itemNames){
  const short=key.length<=3;
  const limit=key.length>=8?2:1;
  if(short?alias.length!==key.length:Math.abs(alias.length-key.length)>limit)continue;
  const left=short?key.normalize('NFD'):key;
  const right=short?alias.normalize('NFD'):alias;
  const distance=itemNameDistance(left,right);
  if(distance<=limit&&distance<(scores.get(standard)??Infinity))scores.set(standard,distance);
 }
 return [...scores].sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0],'ko')).slice(0,3).map(([standard])=>standard);
}
const rnn = name => /주민\s*등록\s*번호|주민번호/.test(name);
function signal(name){
 name=standardItemName(name);
 if(rnn(name)||/여권\s*번호|운전면허\s*번호|외국인등록\s*번호/.test(name)) return 'unique';
 if(/종교|사상|신념|성생활|성 생활|정치적 견해|노동조합 가입|정당 가입|범죄경력|유전정보|건강정보/.test(name)) return 'sensitive';
 if(/병력|진단|질병|장애|상담|생체|인종|민족|복약|심리/.test(name)) return 'possible';
 return 'general';
}
function suggested(i){ const value=signal(i.name);return value==='possible'?'sensitive':value; }
const kind = i => i.kind || suggested(i);
const needsItemReview = i => signal(i.name)!=='general'||!knownItemName(i.name);
function hint(i){
 const standard = standardItemName(i.name);
 if(standard!==i.name.trim())return '권장 표기 · '+standard;
 const type=signal(i.name);
 return ({
  unique:rnn(standard)?'주민등록번호 · 별도 처리 근거 확인':'고유식별정보',
  sensitive:'민감정보',
  possible:'민감정보 가능성 높음',
  general:knownItemName(i.name)?'일반 개인정보':'사전에 없는 항목명 · 의미와 분류 확인'
 })[type];
}
function itemNameHelp(item){
 if(!item.name.trim())return '';
 const standard=standardItemName(item.name);
 const exact=standard!==item.name.trim();
 const suggestions=exact?[standard]:similarItemNames(item.name);
 if(!suggestions.length)return safe(hint(item));
 const label=exact?'권장 표기':'비슷한 항목명 · 적용할 이름을 선택하세요';
 return `<span>${label}</span>${suggestions.map(name=>`<button type="button" data-item-suggestion="${safe(name)}" aria-label="${safe(name)} 적용">${safe(name)}</button>`).join('')}`;
}
const requiredMark = '<span class="required-mark" aria-hidden="true">*</span>';
const field = (label,path,value,placeholder='',area=false,required=false) => {
 const attrs=`data-path="${path}" placeholder="${safe(placeholder)}" ${required?'required':''}`;
 const control=area?`<textarea ${attrs}>${safe(value)}</textarea>`:`<input ${attrs} value="${safe(value)}">`;
 return `<label class="field"><span>${safe(label)}${required?requiredMark:''}</span>${control}</label>`;
};
const checkbox = (label,attrs,checked,required=false) => `<label class="check"><input type="checkbox" ${attrs} ${checked?'checked':''} ${required?'required':''}>${label}${required?requiredMark:''}</label>`;
function home(){
 return `
  <section class="hero">
   <div>
    <h1>동의보감 <span class="hero-ai">AI</span></h1>
    <p>AI가 관련 법령과 지침에 맞는 개인정보 수집·이용 동의서를 자동으로 작성해 주는 서비스</p>
    <div class="actions">
     <button class="primary" data-start>동의서 생성 <span aria-hidden="true">→</span></button>
     <button data-quick-create>빠른 생성 <span aria-hidden="true">→</span></button>
    </div>
   </div>
   <div class="art" aria-hidden="true">
    <div class="orbit"></div><div class="orbit"></div>
    <div class="paper">
     <b>개인정보 수집·이용 동의서</b>
     <i></i><i></i><i class="short"></i>
     <div class="paper-choices">
      <span><span class="paper-check is-checked"></span>동의</span>
      <span><span class="paper-check"></span>미동의</span>
     </div>
     <i></i><i class="short"></i>
    </div>
    <span class="float one"><span class="badge-check">✓</span>항목 분류 검토</span>
    <span class="float trust"><span class="badge-shield"></span>안전하고 신뢰 있게</span>
    <span class="float law"><span class="badge-scale">⚖︎</span>법령·지침에 맞게</span>
    <span class="float two"><span class="badge-printer"></span>A4 문서 출력</span>
   </div>
   <a class="hero-source" href="${reference}" target="_blank" rel="noopener">국가법령정보센터 <span aria-hidden="true">↗</span></a>
  </section>
  <div class="section-heading"><h2>동의서 작성 절차</h2></div>
  <div class="cards">${labels.map((label,n)=>`<article class="card"><small>0${n+1}단계</small><span class="tileicon" aria-hidden="true">${['▤','☷','<span class="step-symbol step-search"></span>','<span class="step-symbol step-preview"></span>'][n]}</span><h3>${label}</h3><p>${descriptions[n]}</p></article>`).join('')}</div>
  <div class="info home-input-note"><span aria-hidden="true">ⓘ</span><p><strong>빠른 생성으로 시작하세요.</strong> 교육·행사, 강사료·자문료, 진료 예약 등 ${quickTemplates.length}개 양식에서 기본 항목을 불러올 수 있습니다.</p></div>
 `;
}
const canSetRequired = key => ['collect','extra'].includes(key);
const itemPresetGroups = [
 ['일반 개인정보', ['부서명','생년월일','성명','성별','소속 업체명','업무용 연락처','이메일 주소','주소','휴대전화번호','은행명','계좌번호','예금주명']],
 ['민감정보', ['건강정보','범죄경력']],
 ['고유식별정보', ['여권번호','외국인등록번호','운전면허번호','주민등록번호']]
].map(([label,names])=>[label,names.sort((left,right)=>left.localeCompare(right,'ko'))]);
const itemPresetNames = new Set(itemPresetGroups.flatMap(([,names])=>names));
const isManualItemName = item => item.manualName || Boolean(item.name && !itemPresetNames.has(item.name));
function itemNameControl(item,index){
 const manual=isManualItemName(item);
 const selected=manual?'custom':item.name;
 return `<div class="field item-name">
  <label class="item-name-label" for="item-choice-${item.id}"><span class="item-number">${index+1}</span> 개인정보 항목명${requiredMark}</label>
  <select id="item-choice-${item.id}" data-item-preset="${item.id}" required>
   <option value="" disabled ${selected?'':'selected'}>항목을 선택하세요</option>
   ${itemPresetGroups.map(([label,names])=>`<optgroup label="${safe(label)}">
    ${names.map(name=>`<option value="${safe(name)}" ${selected===name?'selected':''}>${safe(name)}</option>`).join('')}
   </optgroup>`).join('')}
   <option value="custom" ${manual?'selected':''}>직접 입력</option>
  </select>
  ${manual?`<input type="text" aria-label="${index+1} 개인정보 항목명 직접 입력" autocomplete="off" data-name="${item.id}" value="${safe(item.name)}" required>`:''}
 </div>`;
}
function basics(){
 return `<section class="panel"><h2>기관 정보</h2>${field('수집 기관명','agency',state.agency,'예: ○○병원 또는 ○○시청',false,true)}</section>`+Object.entries(state.groups).map(([key,g])=>{
  const title=key==='provide'?'제공받는 자의 ':'';
  const hasRequiredControls=canSetRequired(key);
  return `<section class="panel"><div class="panelhead"><h2>${groupNames[key]}</h2>${checkbox(groupNames[key]+' 사용',`data-enable="${key}"`,g.enabled)}</div>${g.enabled?`<div class="pair">${key==='provide'?field('제공받는 자','groups.provide.recipient',g.recipient,'기관 또는 법인명',false,true)+checkbox('수집 목적 외 제공','data-outside',g.outside):''}${field(title+'이용 목적',`groups.${key}.purpose`,g.purpose,'예: 프로그램 신청 관리',false,true)}${field(title+'보유 및 이용 기간',`groups.${key}.period`,g.period,'예: 사업 종료 후 1년',false,true)}</div>${key==='collect'?`<fieldset class="optional-details"><legend>선택 항목의 이용 조건</legend><div class="pair">${field('선택 항목 이용 목적','groups.collect.optionalPurpose',g.optionalPurpose,'이용 목적과 같으면 공백')}${field('선택 항목 보유 및 이용 기간','groups.collect.optionalPeriod',g.optionalPeriod,'보유 및 이용 기간과 같으면 공백')}</div></fieldset>`:''}${hasRequiredControls? `<div class="actions bulk-required" role="group" aria-label="${groupNames[key]} 전체 항목 필수 여부"><button data-bulk-required="${key}" value="required" ${g.items.length?'':'disabled'}>모두 필수</button><button data-bulk-required="${key}" value="optional" ${g.items.length?'':'disabled'}>모두 선택</button></div>`:''}<div class="item-list">${g.items.length?'':`<p class="muted">개인정보 항목${requiredMark}</p>`}${g.items.map((i,n)=>`<div class="item-row">${itemNameControl(i,n)}<div class="item-controls">${hasRequiredControls?requiredSwitch(i,'항목 '+(n+1)):key==='marketing'?'<span class="pill">선택</span>':''}<div class="order"><button type="button" data-move="${i.id}:-1" aria-label="항목 ${n+1} 위로 이동" ${n?'':'disabled'}><span class="move-chevron" aria-hidden="true"></span></button><button type="button" data-move="${i.id}:1" aria-label="항목 ${n+1} 아래로 이동" ${n<g.items.length-1?'':'disabled'}><span class="move-chevron down" aria-hidden="true"></span></button></div><button class="danger" data-delete="${i.id}" aria-label="항목 ${n+1} 삭제">삭제</button></div><div class="notice item-hint" id="hint-${i.id}">${itemNameHelp(i)}</div></div>`).join('')}</div><div class="actions"><button data-add="${key}">＋ 항목 추가</button>${key==='collect'?'<p class="muted">필요한 항목명만 추가하세요. 실제 이름이나 전화번호는 입력하지 마세요.</p>':''}</div>`:'<p class="muted">필요한 처리 유형만 선택하세요.</p>'}</section>`;
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
const groundInitial = type => ({type,law:'',article:'',paragraph:'',clause:'',excerpt:'',reason:'',ids:[],specific:false});
const articleNumber = value => value.trim().replace(/\s/g,'').replace(/^제/,'').replace(/^([0-9]+)조(?:의([0-9]+))?$/,(_,n,sub)=>sub?n+'의'+sub:n);
const subNumber = (value,unit) => value.trim().replace(/\s/g,'').replace(/^제/,'').replace(new RegExp(unit+'$'),'');
const cite = draft => [draft.law.trim(), draft.article?'제'+draft.article.replace(/^(\d+)(?:의(\d+))?$/,(_,n,sub)=>n+'조'+(sub?'의'+sub:'')):'',draft.paragraph?'제'+draft.paragraph+'항':'',draft.clause?'제'+draft.clause+'호':''].filter(Boolean).join(' ');
const unresolvedRnn = () => entries().filter(({i})=>rnn(i.name)&&!i.bases?.some(b=>b.specific));
function grounds(){
 const draft=state.groundDraft;
 const missing=entries().filter(({i})=>!i.bases?.length);
 return `<div class="info"><div><strong>조문 확인과 적용 범위 지정</strong><p>국가법령정보센터에서 조문을 확인하고 적용할 항목을 선택하세요. 실시간 탐색은 연결 전입니다.</p></div></div>
 <div class="actions"><button class="primary" data-add-ground>＋ 근거 추가</button><button data-search>${state.search?'참고 조문 숨기기':'참고 조문 보기'}</button><a href="https://www.law.go.kr/" target="_blank" rel="noopener">국가법령정보센터에서 검색 ↗</a></div>
 ${draft?`<section class="panel ground-editor"><h2>${draft.editId?'근거 및 적용 범위 수정':'근거 직접 입력'}</h2><label class="field"><span>처리 유형${requiredMark}</span><select data-ground-type required>${Object.entries(groundTypes).map(([k,label])=>`<option value="${k}" ${draft.type===k?'selected':''}>${label}</option>`).join('')}</select></label><div class="law-fields">${field('법령명','groundDraft.law',draft.law,'법령명',false,true)}${field('조','groundDraft.article',draft.article,'예: 24의2',false,true)}${field('항 (해당 시)','groundDraft.paragraph',draft.paragraph,'예: 1')}${field('호 (해당 시)','groundDraft.clause',draft.clause,'예: 1')}</div><div class="stack">${field('조문 내용 (선택)','groundDraft.excerpt',draft.excerpt,'확인한 조문 내용을 입력하세요.',true)}${field('이 항목에 적용되는 이유 (선택)','groundDraft.reason',draft.reason,'처리 목적과 조문의 적용 요건을 확인한 내용을 입력하세요.',true)}</div><fieldset><legend>적용할 항목${requiredMark}</legend>${groundEntries(draft.type).length?groundEntries(draft.type).map(({key,g,i})=>`<label class="scope-option"><input type="checkbox" data-scope="${i.id}" ${draft.ids.includes(i.id)?'checked':''}><span><b>${safe(i.name)}</b><small>${groupNames[key]} · ${categoryNames[kind(i)]} · ${safe(g.purpose)}${g.recipient?' · '+safe(g.recipient):''}</small></span></label>`).join(''):'<p class="muted">이 유형의 등록 항목이 없습니다.</p>'}</fieldset>
 ${draft.ids.some(key=>rnn(getItem(key)?.name||''))?`<div class="info warn">${checkbox('주민등록번호의 구체적인 처리 근거와 적용 요건을 확인했습니다.','data-specific',draft.specific,true)}</div>`:''}
 <p class="notice" id="ground-status" role="status">${safe(message)}</p><div class="actions"><button class="primary" data-adopt-ground>근거 채택</button><button data-review-ground>AI 검토 요청 복사</button><a href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT 열기</a><button data-cancel-ground>취소</button></div></section>`:''}
 ${Object.entries(groundTypes).map(([type,label])=>{
  const list=groundEntries(type);
  if(!list.length)return '';
  const saved=state.grounds.filter(b=>b.type===type);
  return `<section class="panel"><h2>${label}</h2>${list.map(({key,g,i})=>{
   const section=key==='provide'?(g.outside?18:17):key==='extra'?18:15;
   const additional=rnn(i.name)?'24조의2':kind(i)==='unique'?'24조':kind(i)==='sensitive'?'23조':'';
   return `<div class="row"><div class="grow"><b>${safe(i.name)}</b><small>${safe(g.purpose)}${g.recipient?' · '+safe(g.recipient):''}</small>${state.search?`<small>참고 조문 <a href="${reference}/제${section}조" target="_blank" rel="noopener">제${section}조 ↗</a>${additional?` · <a href="${reference}/제${additional}" target="_blank" rel="noopener">제${additional} ↗</a>`:''}</small>`:''}</div><span class="pill ${i.bases?.length?'':'pending'}">${i.bases?.length?'채택 '+i.bases.length+'건':'근거 미확인'}</span></div>`;
  }).join('')}${saved.map(b=>`<details class="basis"><summary>${safe(b.cite)} · 적용 ${b.ids.length}개</summary><p>${safe(b.excerpt)}</p><p><strong>적용 이유</strong> ${safe(b.reason)}</p><p><strong>적용 항목</strong> ${b.ids.map(key=>safe(getItem(key)?.name)).join(', ')}</p><div class="actions"><button data-edit-ground="${b.id}">적용 범위 및 근거 수정</button><button data-remove-ground="${b.id}">채택 취소</button></div></details>`).join('')}</section>`;
 }).join('')}
 ${missing.length?`<section class="panel"><h2>근거 미확인 항목 <span class="pill pending">${missing.length}개</span></h2><ul class="unconfirmed">${missing.map(entry=>`<li><strong>${safe(entry.i.name)}</strong> · ${groundTypes[groundType(entry)]} · ${safe(entry.g.purpose)}${entry.g.recipient?' · '+safe(entry.g.recipient):''}</li>`).join('')}</ul></section>`:''}
 ${unresolvedRnn().length?`<div class="info warn"><div><strong id="rrn-block">주민등록번호 처리 근거 확인이 필요합니다</strong><p>${unresolvedRnn().map(e=>groupNames[e.key]+' · '+safe(e.i.name)).join(', ')}. 별도 처리 근거를 확인해 채택하거나 2단계에서 항목을 삭제하세요.</p></div></div>`:''}`;
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
  [!draft.law.trim(),'법령명을 입력해 주세요.'],
  [!/^\d+(?:의\d+)?$/.test(article),'조 번호를 입력해 주세요. 예를 들어 제24조의2처럼 입력할 수 있습니다.'],
  [[paragraph,clause].some(v=>v&&!/^\d+$/.test(v)),'항과 호에는 제1항 또는 제1호처럼 번호를 입력해 주세요.'],
  [!ids.length,'근거를 적용할 항목을 하나 이상 선택해 주세요.']
 ];
 const invalid=checks.find(([failed])=>failed);
 if(invalid){feedback(invalid[1]);return;}
 const containsRnn=ids.some(key=>rnn(getItem(key).name));
 if(containsRnn&&!draft.specific){feedback('주민등록번호의 구체적인 처리 근거와 적용 요건을 확인해 주세요.');return;}
 const normalized={...draft,ids,article,paragraph,clause};
 const saved={...normalized,id:draft.editId||id(),cite:cite(normalized),specific:containsRnn&&draft.specific};
 state.grounds=[...state.grounds.filter(b=>b.id!==saved.id),saved];
 state.groundDraft=null;state.edits={};syncGrounds();message='근거와 적용 범위를 저장했습니다.';render();
}

async function copyGroundReview(){
 const draft=state.groundDraft;
 const scope=groundEntries(draft.type).filter(({i})=>draft.ids.includes(i.id));
 if(!draft.law.trim()||!draft.article.trim()||!scope.length){
  feedback('검토할 법령명, 조 번호와 적용 항목을 먼저 지정해 주세요.');return;
 }
 const prompt=[
  '아래 개인정보 처리 근거 후보를 검토해 주세요. 국가법령정보센터의 현행 조문을 찾아 인용이 정확한지 확인하고, 해당 처리 목적과 항목에 적용하기 위한 요건, 확인이 필요한 사실, 동의가 별도로 필요한지 검토해 주세요. 확인할 수 없는 내용은 구분해 표시하고 출처를 제시해 주세요.',
  '처리 구분: '+groundTypes[draft.type],
  '입력한 근거: '+[draft.law,draft.article,draft.paragraph&&'항 '+draft.paragraph,draft.clause&&'호 '+draft.clause].filter(Boolean).join(' '),
  draft.excerpt.trim()&&'입력한 조문 내용: '+draft.excerpt,
  draft.reason.trim()&&'입력한 적용 이유: '+draft.reason,
  ...scope.map(({i,g,key})=>groupNames[key]+' / 항목: '+i.name+' / 목적: '+g.purpose+(g.recipient?' / 제공받는 자: '+g.recipient:''))
 ].filter(Boolean).join('\n');
 await navigator.clipboard.writeText(prompt);
 feedback('검토 요청을 복사했습니다. ChatGPT에 붙여넣고 실행해 주세요.');
}

function sections(){
 const map=new Map();
 for(const {key,g,i} of entries()){
  const isRnn=rnn(i.name);
  if(isRnn&&!i.bases?.some(b=>b.specific)) continue;
  const classification=isRnn?'rnn':kind(i);
  const required=['collect','extra'].includes(key)?i.required?'필수':'선택':key==='marketing'?'선택':'';
  const basis=i.bases?.length?'notice':'consent';
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
 return `<article class="doc-notice"><h3>${heading} 관련 고지사항${provider&&first.g.outside?' (수집 목적 외 제공)':''}</h3><table class="doc-table"><thead><tr>${provider?'<th scope="col">제공받는 자</th>':''}<th scope="col">처리 목적</th><th scope="col">개인정보 항목</th><th scope="col">보유 및 이용기간</th><th scope="col">처리 근거</th></tr></thead><tbody>${rows.flatMap(s=>s.items.map(i=>`<tr>${provider?`<td>${editableText(i.name+' 제공받는 자',i.id+'.recipient',s.g.recipient,editable)}</td>`:''}<td>${editableText(i.name+' 처리 목적',i.id+'.purpose',s.g.purpose,editable)}</td><th scope="row">${editableText('개인정보 항목',i.id+'.item',i.name,editable)}</th><td><strong>${editableText(i.name+' 보유 및 이용기간',i.id+'.period',s.g.period,editable)}</strong></td><td><strong>${i.bases.map(b=>safe(b.cite)).join(' / ')}</strong></td></tr>`)).join('')}</tbody></table>${first.key==='marketing'?marketingContact:''}${rows.filter(s=>s.classification==='rnn'&&(editable||state.refusals[s.k]?.trim())).map(s=>note('번호 미제공 시 안내 '+refusalText(s,editable))).join('')}</article>`;
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
 const issues=all.filter(({i})=>needsItemReview(i));
 const missing=all.filter(({g})=>!g.purpose.trim()||!g.period.trim()).length;
 app.innerHTML=`<div class="trail"><button data-go="0">홈</button> / 문서 작성</div><div class="title"><h1>${labels[step-1]}</h1><p>${descriptions[step-1]}</p></div><nav class="stepper" aria-label="작성 단계">${labels.map((name,n)=>`<button data-go="${n+1}" ${step===n+1?'aria-current="step"':''} ${n+1>reached||(n===3&&unresolvedRnn().length)?'disabled':''}><span class="stepnum">${String(n+1).padStart(2,'0')}</span>${name}</button>`).join('')}</nav><div class="workspace ${step===4?'wide-output':''}"><div class="stack">${body}<div class="notice" id="message" role="status">${safe(message)}</div><div class="bar"><button data-go="${step-1}">← ${step===1?'홈으로':'이전 단계'}</button>${step<4?`<button class="primary" data-next ${step===3&&unresolvedRnn().length?'disabled aria-describedby="rrn-block"':''}>${step===2?'분류 확정 후 다음':step===3?'문서 작성으로':'다음 단계'} →</button>`:''}</div></div>${step===4?'':`<aside class="side"><h2>${step===1?'입력 점검':'검토 현황'}</h2><span class="pill">등록 항목 <span id="count">${all.length}</span>개</span><hr><p id="risk">${riskHTML(issues,missing)}</p><p class="muted">예시 규칙에 따른 제안입니다. 분류와 근거는 담당자가 직접 확인합니다.</p><button data-guide>이용 안내</button></aside>`}</div>`;
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
 document.querySelector('#risk').innerHTML=riskHTML(all.filter(({i})=>needsItemReview(i)),all.filter(({g})=>!g.purpose.trim()||!g.period.trim()).length);
}
function go(n){
 if(n===5&&(step!==4||!finalDocument))return;
 if(n!==5)finalDocument=null;
 if(step===1&&n>1&&!validateBasics())return;
 if(n===4&&unresolvedRnn().length){feedback('주민등록번호의 처리 근거를 먼저 확인해 주세요.');return;}
 if(n===2&&!state.groups[tab].enabled)tab=Object.keys(state.groups).find(k=>state.groups[k].enabled)||'collect';
 if(n===1){
  for(const [key,g] of Object.entries(state.groups)){
   if(g.enabled&&!g.items.length)add(key);
  }
 }
 basicsChecked=false;
 step=n;reached=Math.max(reached,Math.min(n,4));message='';render();window.scrollTo(0,0);
 if(n){const h=app.querySelector('.title h1');h.tabIndex=-1;h.focus({preventScroll:true});}
}
function feedback(text){
 message=text;
 const status=document.querySelector('#ground-status, #output-status')||document.querySelector('#message');
 if(status)status.textContent=text;
}
function invalidateItems(items){
 const keys=new Set(items.map(i=>i.id));
 state.grounds=state.grounds.map(b=>({...b,ids:b.ids.filter(key=>!keys.has(key))})).filter(b=>b.ids.length);
 if(state.groundDraft)state.groundDraft=null;
 state.edits={};reached=Math.min(reached,step);
 syncGrounds();
}
function add(key,name='',required=false){
 const i={id:id(),name:standardItemName(name),required};state.groups[key].items.push(i);return i;
}
const quickTemplates = [
 {
  title:'용역·유지보수 인력 보안 및 출입 동의서',
  purpose:'용역·유지보수 인력의 출입 권한 발급·회수 및 출입 관리',
  period:'출입 권한 회수 완료 시까지',
  items:['성명','소속 업체명','업무용 연락처'],
  note:'자동 입력 기간은 출입 등록 정보 기준입니다. 출입기록을 함께 처리하면 기관의 기록 보존 기준과 연락처 수집 필요 여부를 확인하세요.'
 },
 {
  title:'교육·행사 참여 동의서',
  purpose:'교육·행사 참가 신청 접수, 운영 안내 및 출석 관리',
  period:'교육·행사 종료 및 출석 확인 완료 시까지',
  items:['성명','휴대전화번호'],
  note:'운영 안내에 필요한 연락 수단을 선택하세요. 수료증 발급이나 운영기록 보존이 필요하면 해당 보존 기준을 확인하세요.'
 },
 {
  title:'강사료·자문료 지급 동의서',
  purpose:'강사료·자문료 지급 및 입금 계좌 확인',
  items:['성명','은행명','계좌번호','예금주명'],
  note:'지급 증빙에 적용되는 기관의 회계·기록관리 기준에 맞춰 기간을 입력하세요. 원천징수나 지급명세서 제출에 주민등록번호가 필요한 경우 적용 법령과 처리 근거를 확인하세요.'
 },
 {
  title:'설문조사 참여 동의서',
  purpose:'서비스·사업 개선을 위한 설문 응답 분석',
  period:'설문 응답 분석 완료 시까지',
  items:['설문 응답 내용'],
  note:'응답자를 식별할 수 없는 설문이라면 이 양식이 필요한지 먼저 확인하세요.'
 },
 {
  title:'모바일 쿠폰 발송 동의서',
  purpose:'지급 대상자에게 모바일 쿠폰 발송',
  period:'모바일 쿠폰 발송 완료 시까지',
  items:['휴대전화번호'],
  note:'외부 발송사를 이용하면 실제 계약과 발송 방식에 따라 처리위탁인지 제3자 제공인지 확인하세요.'
 },
 {
  title:'사진·영상 촬영 및 활용 동의서',
  purpose:'교육·행사 사진과 영상 촬영 및 사전에 안내한 매체에서의 활용',
  items:['개인을 식별할 수 있는 사진·영상'],
  note:'게시 매체와 공개 범위, 게시 종료일 및 원본 보유기간을 정하세요. 환자나 진료 장면 촬영은 해당 절차를 별도로 확인하세요.'
 },
 {
  audience:'의료기관 업무',
  title:'진료 예약·상담 연락 동의서',
  purpose:'예약·상담 문의에 회신하고 진료 예약의 확인·변경을 안내',
  items:['성명','휴대전화번호'],
  note:'예약·문의 연락용 정보가 진료기록과 분리되는지 확인하세요. 적용되는 처리 근거, 별도 동의 필요 여부와 보유기간은 기관 기준에 맞춰 정하세요.'
 },
 {
  audience:'의료기관 업무',
  title:'퇴원 후 건강관리 프로그램 참여 동의서',
  purpose:'퇴원 후 건강관리 프로그램 참가 신청 접수 및 일정 안내',
  period:'건강관리 프로그램 종료 시까지',
  items:['성명','휴대전화번호'],
  note:'자동 입력 기간은 프로그램 신청·안내에 쓰는 연락처 기준입니다. 진료기록에 포함되거나 건강정보가 필요하면 별도의 보존 기준과 처리 근거를 확인하세요.'
 }
];
const quickDialog = document.querySelector('#quick-create');
const quickForm = quickDialog.querySelector('.quick-create-form');
const quickPreview = quickDialog.querySelector('#quick-preview');
const quickApply = quickForm.querySelector('[type="submit"]');
const quickOptions = ['공통 업무','의료기관 업무'].map(audience=>
 `<optgroup label="${audience}">${quickTemplates.map((template,index)=>
  (template.audience||'공통 업무')===audience?`<option value="${index}">${safe(template.title)}</option>`:''
 ).join('')}</optgroup>`
).join('');
quickForm.querySelector('select').insertAdjacentHTML('beforeend',quickOptions);
function updateQuickPreview(){
 const template = quickTemplates[quickForm.elements.template.value];
 quickPreview.hidden = !template;
 quickApply.disabled = !template;
 if(template){
  quickPreview.querySelector('[data-quick-purpose]').textContent = template.purpose;
  quickPreview.querySelector('[data-quick-items]').textContent = template.items.join(', ');
  quickPreview.querySelector('[data-quick-period]').textContent = template.period ?? '기관 기준 확인 후 직접 입력';
  quickPreview.querySelector('[data-quick-note]').textContent = template.note;
 }
}
quickForm.addEventListener('change',updateQuickPreview);
quickForm.addEventListener('submit',e=>{
 e.preventDefault();
 const template = quickTemplates[quickForm.elements.template.value];
 if(!template)return;
 if(hasDraftChanges()&&!confirm('현재 작성 중인 내용을 선택한 양식으로 바꾸시겠습니까?'))return;
 state = newDraft();
 state.title = template.title;
 state.groups.collect.purpose = template.purpose;
 state.groups.collect.period = template.period ?? '';
 template.items.forEach(name=>add('collect',name));
 chat='';tab='collect';reached=0;
 quickDialog.close();
 go(1);
});
function showItemNameNotice(previous,current){
 const notice=document.createElement('div');
 notice.textContent='항목명 변경 · '+previous+' → '+current;
 document.querySelector('#item-name-notice').append(notice);
 setTimeout(()=>notice.remove(),4500);
}
function updateItemNameHelp(item){
 document.getElementById('hint-'+item.id).innerHTML=itemNameHelp(item);
}
function commitItemName(input,name=standardItemName(input.value)){
 const item=getItem(input.dataset.name);
 const previous=input.value.trim();
 if(item.name!==name){
  item.name=name;delete item.kind;invalidateItems([item]);
 }
 if(previous!==name)showItemNameNotice(previous,name);
 updateItemNameHelp(item);
 if(itemPresetNames.has(name)){
  const picker=input.parentElement.querySelector('[data-item-preset]');
  delete item.manualName;
  picker.value=name;
  input.remove();
  return picker;
 }
 input.value=name;
 return input;
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
}
document.addEventListener('input',e=>{
 const el=e.target,d=el.dataset;
 if(d.path&&el.type!=='checkbox')setPath(d.path,el.value);
 if(d.name){
  const i=getItem(d.name);
  i.name=el.value;delete i.kind;invalidateItems([i]);
  updateItemNameHelp(i);
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
document.addEventListener('focusout',e=>{
 if(!e.target.dataset.name)return;
 if(e.relatedTarget?.matches('[data-item-suggestion]')&&e.target.closest('.item-row').contains(e.relatedTarget))return;
 commitItemName(e.target);
 refreshRisk();
 if(basicsChecked)showBasicsIssues();
});
document.addEventListener('change',e=>{
 const {dataset:d,checked,value}=e.target;
 if(d.itemPreset){
  const item=getItem(d.itemPreset);
  const manual=value==='custom';
  if(manual)item.manualName=true;
  else {
   delete item.manualName;
   if(item.name!==value){
    item.name=value;delete item.kind;invalidateItems([item]);
   }
  }
  render();
  app.querySelector(manual?`[data-name="${item.id}"]`:`[data-item-preset="${item.id}"]`).focus({preventScroll:true});
 }
 if('child' in d){state.child=value==='yes';refreshPreview();}
 if(d.enable){
  const g=state.groups[d.enable];
  g.enabled=checked;
  if(checked&&!g.items.length)add(d.enable);
  invalidateItems(g.items);
  reached=1;render();
  document.querySelector(`[data-enable="${d.enable}"]`).focus();
 }
 if('outside' in d){state.groups.provide.outside=checked;invalidateItems(state.groups.provide.items);render();}
 if(d.required){const i=getItem(d.required);i.required=checked;invalidateItems([i]);render();document.querySelector(`[data-required="${d.required}"]`).focus();}
 if(d.kind){const i=getItem(d.kind);i.kind=value;invalidateItems([i]);render();document.querySelector(`[data-kind="${d.kind}"]`)?.focus();}
 if('groundType' in d){state.groundDraft={...state.groundDraft,type:value,ids:[],specific:false};render();document.querySelector('[data-ground-type]').focus();}
 if(d.scope){
  const draft=state.groundDraft;
  draft.ids=checked?[...draft.ids,d.scope]:draft.ids.filter(k=>k!==d.scope);
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
  if(!g.purpose.trim())add(`[data-path="groups.${key}.purpose"]`,'이용 목적을 입력해 주세요.');
  if(!g.period.trim())add(`[data-path="groups.${key}.period"]`,'보유 및 이용 기간을 입력해 주세요.');
  if(!g.items.length)add(`[data-add="${key}"]`,name+'의 개인정보 항목을 하나 이상 추가해 주세요.');
  g.items.forEach((item,index)=>{
   if(!item.name.trim()){
    const field=isManualItemName(item)?'data-name':'data-item-preset';
    add(`[${field}="${item.id}"]`,name+'의 '+(index+1)+'번째 개인정보 항목명을 선택하거나 직접 입력해 주세요.');
   }
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
  if(control.matches('[data-name], [data-item-preset]'))control.parentElement.append(error);
  else control.after(error);
  control.setAttribute('data-basic-invalid','');
  if(!control.matches('button'))control.setAttribute('aria-invalid','true');
  control.setAttribute('aria-describedby',error.id);
 });
 return issues;
}
function validateBasics(){
 app.querySelectorAll('[data-name]').forEach(input=>commitItemName(input));
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
 if(d.itemSuggestion){
  const input=b.closest('.item-row').querySelector('[data-name]');
  commitItemName(input,d.itemSuggestion).focus({preventScroll:true});
  refreshRisk();
  if(basicsChecked)showBasicsIssues();
 }
 if('quickCreate' in d){
  quickForm.reset();quickPreview.hidden=true;quickApply.disabled=true;quickDialog.showModal();
 }
 if('go' in d)go(Number(d.go));
 if(d.add){
  const i=add(d.add);render();app.querySelector(`[data-item-preset="${i.id}"]`).focus();
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
  if(to>=0&&to<g.items.length){[g.items[from],g.items[to]]=[g.items[to],g.items[from]];state.edits={};render();(app.querySelector(`[data-move="${d.move}"]:enabled`)||app.querySelector(`[data-item-preset="${key}"]`)).focus();}
 }
 if(d.delete){const item=getItem(d.delete);for(const g of Object.values(state.groups))g.items=g.items.filter(i=>i.id!==d.delete);invalidateItems([item]);render();}
 if(d.tab){tab=d.tab;render();document.querySelector(`[data-tab="${d.tab}"]`).focus();}
 if('next' in d){
  if(step===2&&!entries().length){feedback('검토할 항목을 하나 이상 입력해 주세요.');return;}
  go(step+1);
 }
 if('search' in d){state.search=!state.search;render();document.querySelector('[data-search]').focus();}
 if('addGround' in d){
  const first=Object.keys(groundTypes).find(k=>groundEntries(k).length)||'required';
  state.groundDraft=groundInitial(first);message='';render();document.querySelector('[data-ground-type]').focus();
 }
 if(d.editGround){const saved=state.grounds.find(b=>b.id===d.editGround);state.groundDraft={...saved,ids:[...saved.ids],editId:saved.id};message='';render();document.querySelector('[data-ground-type]').focus();}
 if('cancelGround' in d){state.groundDraft=null;message='';render();document.querySelector('[data-add-ground]').focus();}
 if('adoptGround' in d)saveGround();
 if('reviewGround' in d)copyGroundReview().catch(()=>feedback('검토 요청을 복사하지 못했습니다. 클립보드 권한을 확인해 주세요.'));
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
function watchLocalPreview(){
 if(location.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(location.hostname))return;
 const selectionKey='consent-preview-template';
 const picker=quickForm.elements.template;
 try{
  const previousTitle=sessionStorage.getItem(selectionKey);
  sessionStorage.removeItem(selectionKey);
  if(previousTitle!==null){
   picker.value=Array.from(picker.options).find(option=>option.textContent===previousTitle)?.value||'';
   updateQuickPreview();
   quickDialog.showModal();
  }
 }catch{
  // The preview can still update when session storage is unavailable.
 }

 const version=doc=>{
  const script=doc.querySelector('script[src^="app.js"]')?.getAttribute('src');
  const style=doc.querySelector('link[href^="style.css"]')?.getAttribute('href');
  return script&&style?`${script}|${style}`:null;
 };
 const loadedVersion=version(document);
 const canReload=()=>!document.hidden&&step===0&&!chat&&!hasDraftChanges()&&(quickDialog.open||!document.querySelector('dialog[open]'));
 let checking=false;
 setInterval(async ()=>{
  if(checking||!canReload())return;
  checking=true;
  try{
   const response=await fetch(location.pathname,{cache:'no-store'});
   if(!response.ok)return;
   const latest=version(new DOMParser().parseFromString(await response.text(),'text/html'));
   if(!latest||latest===loadedVersion||!canReload())return;
   if(quickDialog.open){
    try{sessionStorage.setItem(selectionKey,picker.selectedOptions[0]?.textContent||'');}catch{}
   }
   location.reload();
  }catch{
   // The local server may be restarting. Check again on the next interval.
  }finally{
   checking=false;
  }
 },2000);
}
render();
watchLocalPreview();

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

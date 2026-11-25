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
let step=0, reached=0, tab='collect', message='';
let basicsChecked=false;
let finalDocument=null;
let documentEditing=false;
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
  ['소속 기관명','소속 업체명','소속 회사명','소속 기업명'],
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
const statutorySensitiveNames=new Set(['종교','사상','신념','사상·신념','성생활','정치적 견해','노동조합 가입','노동조합 가입·탈퇴','정당 가입','정당 가입·탈퇴','건강정보','건강 정보','진단명','병력','복약정보','유전정보','유전자검사 결과','범죄경력','범죄경력자료','생체인식정보','인종','민족','정당 가입 여부','노동조합 가입 여부','건강 상태','정치적 성향','인종 정보','민족 정보','범죄경력 여부','지문 인증정보','안면 인식정보'].map(itemNameKey));
function signal(name){
 name=standardItemName(name);
 if(rnn(name)||/여권\s*번호|운전면허\s*번호|외국인등록\s*번호/.test(name))return 'unique';
 if(statutorySensitiveNames.has(itemNameKey(name)))return 'sensitive';
 if(/종교|사상|신념|성생활|정치|노동조합|정당|건강|유전|범죄|병력|진단|질병|장애|상담|생체|인종|민족|복약|심리/.test(name))return 'possible';
 return 'general';
}
const sensitivityFingerprint=i=>JSON.stringify([i.name.trim(),entries().find(e=>e.i===i)?.g.purpose||'']);
const currentSensitivity=i=>i.sensitivity?.fingerprint===sensitivityFingerprint(i)?i.sensitivity:null;
function suggested(i){
 const value=signal(i.name);if(value==='sensitive'||value==='unique')return value;
 const result=currentSensitivity(i);
 if(result?.verdict==='high')return 'sensitive';
 if(result?.verdict==='general')return 'general';
 return value==='possible'?'sensitive':'general';
}
const kind=i=>i.kind||suggested(i);
const needsItemReview=i=>signal(i.name)!=='general'||!knownItemName(i.name)||currentSensitivity(i)?.verdict==='high';
function hint(i){
 const standard=standardItemName(i.name);
 if(standard!==i.name.trim())return '권장 표기 · '+standard;
 const type=signal(i.name),result=currentSensitivity(i);
 if(type==='sensitive')return '민감정보';
 if(type==='unique')return rnn(standard)?'주민등록번호 · 별도 처리 근거 확인':'고유식별정보';
 if(result?.status==='loading')return '민감정보 가능성 확인 중…';
 if(result?.verdict==='high')return '민감정보 가능성 높음'+(result.included?.length?'('+result.included.join('·')+' 사항 포함)':'');
 if(result?.verdict==='general')return '민감정보 가능성 낮음';
 if(result?.verdict==='uncertain')return '민감정보 가능성 확인 필요';
 if(result?.status==='error')return '민감정보 가능성 미확인';
 return type==='possible'?'민감정보 가능성 미확인':knownItemName(i.name)?'일반 개인정보':'민감정보 가능성 확인 필요';
}
let sensitivityTimer,sensitivityFlight=null;
function scheduleSensitivity(){
 clearTimeout(sensitivityTimer);sensitivityTimer=setTimeout(()=>{if(step===1)checkSensitivity();},1200);
}
function refreshSensitivityHints(){
 if(step===1){for(const {i} of entries()){const node=document.getElementById('hint-'+i.id);if(node){node.innerHTML=itemNameHelp(i);node.closest('.item-row').dataset.personalKind=kind(i);}}refreshRisk();}
 if(step===2)render();
 const status=document.querySelector('#sensitivity-status');if(status){const failed=entries().filter(({i})=>currentSensitivity(i)?.status==='error').length;status.innerHTML=sensitivityFlight?'민감정보 여부를 확인하고 있습니다…':failed?`민감정보 가능성 미확인 ${failed}개 <button data-retry-classification>다시 확인</button>`:'';}
}
async function checkSensitivity(force=false){
 clearTimeout(sensitivityTimer);
 if(sensitivityFlight){await sensitivityFlight;return checkSensitivity(force);}
 const pending=entries().filter(({i})=>i.manualName&&!['sensitive','unique'].includes(signal(i.name))&&!knownItemName(i.name)&&i.name.trim().length>=2&&(!currentSensitivity(i)||force&&currentSensitivity(i).status==='error')).slice(0,20);
 if(!pending.length)return;
 const draftState=state;
 const batch=pending.map(({i,g})=>({i,fingerprint:sensitivityFingerprint(i),id:i.id,name:i.name,purpose:g.purpose}));
 for(const item of batch)item.i.sensitivity={fingerprint:item.fingerprint,status:'loading'};
 sensitivityFlight=(async()=>{
  try{
   const result=await lawRequest('/api/privacy/classify',{items:batch.map(({id,name,purpose})=>({id,name,purpose}))});
   for(const item of batch){
    if(state!==draftState||getItem(item.id)!==item.i||sensitivityFingerprint(item.i)!==item.fingerprint)continue;
    const row=result.items.find(row=>row.id===item.id);
    item.i.sensitivity={fingerprint:item.fingerprint,status:'done',verdict:row?.verdict||'uncertain',included:(row?.included||[]).filter(value=>['건강','사상·신념','정치적 견해','가입·탈퇴','성생활','유전','범죄경력','생체인식','인종·민족','사생활'].includes(value)).slice(0,2)};
   }
  }catch{for(const item of batch)if(state===draftState&&getItem(item.id)===item.i&&sensitivityFingerprint(item.i)===item.fingerprint)item.i.sensitivity={fingerprint:item.fingerprint,status:'error'};}
 })();
 refreshSensitivityHints();await sensitivityFlight;sensitivityFlight=null;refreshSensitivityHints();
 if(state===draftState&&(step===1||step===2))await checkSensitivity();
}
function itemNameHelp(item){
 if(!item.name.trim())return '';
 const standard=standardItemName(item.name);
 const exact=standard!==item.name.trim();
 const suggestions=exact?[standard]:similarItemNames(item.name);
 if(!suggestions.length)return safe(hint(item));
 const label=exact?'권장 표기':'비슷한 항목명 · 적용할 이름을 선택하세요';
 return `<span class="item-classification">${safe(hint(item))}</span><span>${label}</span>${suggestions.map(name=>`<button type="button" data-item-suggestion="${safe(name)}" aria-label="${safe(name)} 적용">${safe(name)}</button>`).join('')}`;
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
const canSetRequired = key => Object.hasOwn(groupNames,key)&&key!=='marketing';
const itemPresetGroups = [
 ['일반 개인정보', ['성명','휴대전화번호','전화번호','생년월일','이메일 주소','성별','주소','부서명','소속 기관명','업무용 연락처','은행명','계좌번호','예금주명']],
 ['민감정보', ['건강정보','범죄경력']],
 ['고유식별정보', ['주민등록번호','외국인등록번호','운전면허번호','여권번호']]
];
const itemPresetNames = new Set(itemPresetGroups.flatMap(([,names])=>names));
const isManualItemName = item => item.manualName || Boolean(item.name && !itemPresetNames.has(item.name));
const dragHandle=(item,key)=>`<span class="drag-handle" role="button" tabindex="0" draggable="true" data-drag-item="${item.id}" data-drag-group="${key}" aria-label="${safe(item.name||'빈 항목')} 이동" aria-description="위아래 화살표로 순서 변경, 분류 화면에서는 좌우 화살표로 분류 변경">⠿</span>`;
function itemNameControl(item,index){
 const manual=isManualItemName(item),selected=manual?'custom':item.name;
 const options=itemPresetGroups.flatMap(([label,names])=>[{label},...names.map(name=>({name,value:name}))]).concat({label:'직접 입력'},{name:'직접 입력',value:'custom'});
 return `<div class="field item-name"><label class="item-name-label" for="item-trigger-${item.id}"><span class="item-number">${index+1}</span> 개인정보 항목명${requiredMark}</label><div class="item-input-line ${manual?'manual-input-line':''}"><div class="item-picker"><select class="native-item-choice" id="item-choice-${item.id}" data-item-preset="${item.id}" tabindex="-1" aria-hidden="true" required><option value="" ${selected?'':'selected'}>항목을 선택하세요</option>${options.filter(o=>o.value).map(o=>`<option value="${safe(o.value)}" ${selected===o.value?'selected':''}>${safe(o.name)}</option>`).join('')}</select><button id="item-trigger-${item.id}" type="button" data-item-menu="${item.id}" role="combobox" aria-label="${index+1} 개인정보 항목명" aria-expanded="false" aria-controls="item-options-${item.id}" aria-haspopup="listbox">${safe(manual?'직접 입력':item.name||'항목을 선택하세요')} <span aria-hidden="true">⌄</span></button><div id="item-options-${item.id}" class="item-options" role="listbox" aria-label="개인정보 항목" hidden>${options.map(o=>o.label?`<div class="item-option-group" data-group-name="${safe(o.label)}" role="presentation">${safe(o.label)}</div>`:`<button type="button" role="option" data-select-item="${item.id}" data-value="${safe(o.value)}" aria-selected="${selected===o.value}">${safe(o.name)}</button>`).join('')}</div></div>${manual?`<input type="text" aria-label="${index+1} 개인정보 항목명 직접 입력" autocomplete="off" data-name="${item.id}" value="${safe(item.name)}" required>`:''}</div></div>`;
}
function basics(){
 return `<section class="panel"><h2>기관 정보</h2>${field('수집 기관명','agency',state.agency,'예: ○○병원 또는 ○○시청',false,true)}</section>`+Object.entries(state.groups).map(([key,g])=>{
  const title=key==='provide'?'제공받는 자의 ':'';
  const hasRequiredControls=canSetRequired(key);
  return `<section class="panel"><div class="panelhead"><h2>${groupNames[key]}</h2>${checkbox(groupNames[key]+' 사용',`data-enable="${key}"`,g.enabled)}</div>${g.enabled?`<div class="pair">${key==='provide'?field('제공받는 자','groups.provide.recipient',g.recipient,'기관 또는 법인명',false,true)+checkbox('수집 목적 외 제공','data-outside',g.outside):''}${field(title+'이용 목적',`groups.${key}.purpose`,g.purpose,'예: 프로그램 신청 관리',false,true)}${field(title+'보유 및 이용 기간',`groups.${key}.period`,g.period,'예: 사업 종료 후 1년',false,true)}</div>${key==='collect'?`<fieldset class="optional-details"><legend>선택 항목의 이용 조건</legend><div class="pair">${field('선택 항목 이용 목적','groups.collect.optionalPurpose',g.optionalPurpose,'필수항목과 같으면 공백')}${field('선택 항목 보유 및 이용 기간','groups.collect.optionalPeriod',g.optionalPeriod,'필수항목과 같으면 공백')}</div></fieldset>`:''}${hasRequiredControls? `<div class="actions bulk-required" role="group" aria-label="${groupNames[key]} 전체 항목 필수 여부"><button data-bulk-required="${key}" value="required" ${g.items.length?'':'disabled'}>모두 필수</button><button data-bulk-required="${key}" value="optional" ${g.items.length?'':'disabled'}>모두 선택</button></div>`:''}<div class="item-list">${g.items.length?'':`<p class="muted">개인정보 항목${requiredMark}</p>`}${g.items.map((i,n)=>`<div class="item-row" data-personal-kind="${kind(i)}" data-item-row="${i.id}" data-item-group="${key}">${dragHandle(i,key)}${itemNameControl(i,n)}<div class="item-controls">${hasRequiredControls?requiredSwitch(i,'항목 '+(n+1)):key==='marketing'?'<span class="pill">선택</span>':''}<button class="danger" data-delete="${i.id}" aria-label="항목 ${n+1} 삭제">삭제</button></div><div class="notice item-hint" id="hint-${i.id}">${itemNameHelp(i)}</div></div>`).join('')}</div><div class="actions"><button data-add="${key}">＋ 항목 추가</button>${key==='collect'?'<p class="muted">필요한 항목명만 추가하세요. 실제 이름이나 전화번호는 입력하지 마세요.</p>':''}</div>`:'<p class="muted">필요한 처리 유형만 선택하세요.</p>'}</section>`;
 }).join('')+`<p class="muted">민감정보일 가능성이 높은 항목은 다음 단계에서 우선 민감정보로 분류합니다.</p><p id="sensitivity-status" class="notice" role="status"></p>`;
}
const requiredSwitch = (item,label) => `<label class="required-switch"><input type="checkbox" role="switch" aria-label="${safe(label)} 필수 여부" data-required="${item.id}" ${item.required?'checked':''}><span class="required-track" aria-hidden="true"></span><span aria-hidden="true">${item.required?'필수':'선택'}</span></label>`;
const classificationGroups=['required','optional','sensitive','unique'];
const entryClass=({i})=>kind(i)!=='general'?kind(i):i.required?'required':'optional';
function classify(){
 return '<p class="muted">왼쪽 손잡이를 끌어 같은 처리 유형 안에서 분류를 바꿀 수 있습니다.</p>'+Object.entries(state.groups).map(([key,g])=>`<section class="panel classification-section" data-class-group="${key}"><h2>${key==='collect'?'개인정보':groupNames[key]}</h2>${g.enabled?`<div class="class-grid">${classificationGroups.map(category=>{
 const items=entries().filter(e=>e.key===key&&entryClass(e)===category);
 return `<section class="class-card ${key==='marketing'&&category==='required'?'class-disabled':''}" data-drop-group="${key}" data-drop-category="${category}" ${key==='marketing'&&category==='required'?'aria-disabled="true"':''}><h3>${categoryNames[category]} <span class="pill">${items.length}</span></h3>${items.map(({i})=>`<div class="class-item" data-item-row="${i.id}" data-item-group="${key}">${dragHandle(i,key)}<b>${safe(i.name)}</b><select class="native-item-choice" tabindex="-1" aria-hidden="true" aria-label="${safe(i.name)} 분류" data-kind="${i.id}">${classificationGroups.map(c=>`<option value="${c}" ${c===entryClass({i})?'selected':''} ${canChangeClassification(i,c)?'':'disabled'}>${categoryNames[c]}</option>`).join('')}</select><button class="danger" data-delete="${i.id}" aria-label="${safe(i.name)} 삭제">삭제</button></div>`).join('')}${!items.length?`<p class="empty-class">${key==='marketing'&&category==='required'?'마케팅은 선택사항입니다.':category==='unique'?'고유식별정보는 다른 분류로 이동할 수 없습니다.':'항목을 여기로 이동'}</p>`:''}</section>`;
 }).join('')}</div>`:'<p class="muted">사용하지 않는 처리 유형입니다.</p>'}</section>`).join('');
}
function sortRequired(g){g.items=[...g.items.filter(i=>i.required),...g.items.filter(i=>!i.required)];}
function changeRequired(item,value){
 if(state.groups.marketing.items.includes(item)){item.required=false;return;}
 const g=Object.values(state.groups).find(g=>g.items.includes(item));g.items=g.items.filter(i=>i!==item);item.required=value;
 const required=g.items.filter(i=>i.required),optional=g.items.filter(i=>!i.required);
 if(value)required.push(item);else optional.unshift(item);g.items=[...required,...optional];
}
function canChangeClassification(item,category){
 const current=entryClass({i:item});
 if(current==='unique'||category==='unique')return current===category;
 return !(state.groups.marketing.items.includes(item)&&category==='required');
}
function changeClassification(item,category){
 if(!canChangeClassification(item,category))return false;
 item.kind=['sensitive','unique'].includes(category)?category:'general';
 if(['required','optional'].includes(category))changeRequired(item,category==='required');
 invalidateItems([item]);return true;
}
const reference = 'https://www.law.go.kr/법령/개인정보보호법';
const groundTypes={collect:'일반 수집',provide:'목적 내 제공',outside:'목적 외 이용·제공'};
const groundType=entry=>entry.key==='extra'||entry.key==='provide'&&entry.g.outside?'outside':entry.key==='provide'?'provide':'collect';
const groundEntries=type=>entries().filter(entry=>groundType(entry)===type);
const groundInitial=type=>({type,basisCode:'',law:'',article:'',paragraph:'',clause:'',excerpt:'',reason:'',ids:[],specific:false,conditionsConfirmed:false,authorityConfirmed:false,verified:false,pipaVerified:false,supportVerified:false});
let lawSearch={busy:false,candidates:[],error:'',note:'',mode:'live',rejected:[],version:0,dismissed:[]};
let apiStatus=null,lawActionBusy=false,editorOpen=false;
const lawContext=entry=>groundType(entry);
const lawClassification=i=>rnn(i.name)?'rnn':kind(i);
const draftOptions=draft=>{
 const rows=groundEntries(draft.type),ctx=rows[0]?lawContext(rows[0]):'collect';
 const classes=new Set(rows.map(({i})=>lawClassification(i)));
 return Object.entries(LawBasis.rules).filter(([,r])=>r.effect!=='consent'&&r.contexts.includes(ctx)&&(!r.supplement||classes.has(r.supplement)));
};
const additionalCodes=draft=>(draft.additionalBasisCodes||[]).filter(code=>draft.ids.some(id=>LawBasis.rules[code]?.supplement===lawClassification(getItem(id))));
const applicableEntries=draft=>groundEntries(draft.type).filter(({i})=>!LawBasis.rules[draft.basisCode]?.supplement||LawBasis.rules[draft.basisCode].supplement===lawClassification(i));
const sourceLink=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='www.law.go.kr'?u.href:reference;}catch{return reference;}};
const articleNumber=value=>value.trim().replace(/\s/g,'').replace(/^제/,'').replace(/^([0-9]+)조(?:의([0-9]+))?$/,(_,n,sub)=>sub?n+'의'+sub:n);
const subNumber=(value,unit)=>value.trim().replace(/\s/g,'').replace(/^제/,'').replace(new RegExp(unit+'$'),'');
const cite=draft=>[draft.law?.trim(),draft.article?'제'+draft.article.replace(/^(\d+)(?:의(\d+))?$/,(_,n,sub)=>n+'조'+(sub?'의'+sub:'')):'',draft.paragraph?'제'+draft.paragraph+'항':'',draft.clause?'제'+draft.clause+'호':''].filter(Boolean).join(' ');
const unresolvedRnn=()=>entries().filter(e=>rnn(e.i.name)&&!LawBasis.notice(e.i.bases,lawContext(e),'rnn'));
const groundDisplayKey=b=>JSON.stringify([b.basisCode,b.law?.replace(/\s/g,''),b.article,b.paragraph,b.clause,b.verified,b.pipaVerified,b.mst,b.conditionsConfirmed,b.authorityConfirmed,b.specific]);
function groundPurpose(list){
 const purposes=[...new Set(list.map(({g})=>g.purpose.trim()).filter(Boolean))],recipients=[...new Set(list.map(({g})=>g.recipient?.trim()).filter(Boolean))];
 return `<p class="ground-purpose muted">${purposes.map(safe).join(' / ')}${recipients.length?' · 제공받는 자: '+recipients.map(safe).join(', '):''}</p>`;
}
function apiErrorMessage(error){
 if(error.name==='TimeoutError'||error.name==='AbortError')return '응답이 늦어 요청을 중단했습니다. 항목을 줄여 다시 검색하거나 법령 검색·근거 추가를 사용하세요.';
 if(error instanceof TypeError)return '로컬 API 서버와 연결이 끊겼습니다. server.py 터미널과 같은 주소의 /api/status를 확인한 뒤 새로고침하세요.';
 return (error.message||'요청을 처리하지 못했습니다.').replaceAll('OpenRouter','AI 서비스').replaceAll('OPENROUTER_API_KEY','AI 연결 설정');
}
async function readApiStatus(){
 if(!['http:','https:'].includes(location.protocol))throw new Error('python server.py 실행 후 http://127.0.0.1:3000으로 접속하세요. HTML 파일을 직접 열면 검색할 수 없습니다.');
 let response;try{response=await fetch('/api/status',{signal:AbortSignal.timeout(10000),cache:'no-store'});}catch(error){throw new Error(apiErrorMessage(error));}
 if(!response.ok)throw new Error('server.py가 실행 중인지 확인하세요.');
 let result;try{result=await response.json();}catch{throw new Error('서버가 올바르게 응답하지 않습니다. server.py로 실행한 주소를 확인하세요.');}
 if(result.app!=='dongui'||result.apiVersion!==8)throw new Error('이전 버전 서버가 실행 중입니다. Ctrl+C로 종료하고 최신 폴더에서 python server.py를 다시 실행하세요.');
 apiStatus=result;return result;
}
async function lawRequest(path,data){
 await readApiStatus();let response;
 try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':apiStatus.csrfToken},body:JSON.stringify(data),signal:AbortSignal.timeout(path.endsWith('/search')?75000:path.endsWith('/review')?65000:path.endsWith('/classify')?40000:45000)});}catch(error){throw new Error(apiErrorMessage(error));}
 let result;try{result=await response.json();}catch{throw new Error('응답을 읽지 못했습니다. server.py 터미널의 API 로그를 확인하세요.');}
 if(!response.ok){const error=new Error(result.error||'요청에 실패했습니다.');error.status=response.status;throw error;}return result;
}
function lawSearchPanel(){
 return `<section class="panel law-search-panel"><div class="panelhead"><div><h2>개인정보별로 적용할 근거를 선택하세요</h2></div></div><p>AI가 제안한 근거는 아래 개인정보 유형별로 표시됩니다. <strong>법령을 선택하고 항목을 체크한 뒤, 담당자 확인 후 적용하세요. 직접 추가한 근거는 필요할 때 AI 검토를 진행할 수 있습니다.</strong> 별도 근거를 적용하지 않은 일반 항목은 동의서로 진행합니다. 주민등록번호 등 별도 허용 요건이 있는 정보는 추가 확인이 필요합니다.</p><p class="muted">실제 개인정보는 입력하지 마세요. 조문의 존재와 업무에 적용할 수 있는지는 별도로 검토해야 합니다.</p><div class="actions"><button class="primary" data-ai-law ${lawSearch.busy?'disabled':''}>${lawSearch.busy?'AI가 근거를 찾고 있습니다…':'AI로 적용 근거 찾기'}</button><button data-add-ground>＋ 법령·처리 근거 직접 추가</button>${apiStatus?.demoAvailable?`<label class="field law-mode"><span>검색 방식</span><select data-law-mode ${lawSearch.busy?'disabled':''}><option value="live" ${lawSearch.mode==='live'?'selected':''}>실제 검색</option><option value="demo" ${lawSearch.mode==='demo'?'selected':''}>화면 시연</option></select></label>`:''}</div><p class="notice" role="status">${lawSearch.busy?'AI 응답 뒤 공식 조문을 확인합니다.':'필요한 항목에만 법령 근거를 적용하세요.'}</p>${lawSearch.mode==='demo'?'<p class="notice">시연 법령은 실제 원문을 확인하지 않아 적용할 수 없습니다.</p>':''}${lawSearch.error?`<div class="info warn" role="alert">${safe(lawSearch.error)}</div>`:''}${lawSearch.note?`<p class="muted">${safe(lawSearch.note)}</p>`:''}${lawSearch.rejected.length?`<details><summary>적용 법령에서 제외된 근거 ${lawSearch.rejected.length}건</summary>${lawSearch.rejected.map(r=>`<p>${safe(r.law)} · ${safe(r.message)}</p>`).join('')}</details>`:''}</section>`;
}
const candidateKey=(candidate,index)=>candidate?._key||lawSearch.version+':'+index;
const candidateIdentity=c=>JSON.stringify([c.type,c.basisCode,c.law,c.article,c.paragraph,c.clause,c.mst,c.excerpt]);
async function findLaws(){
 if(lawSearch.busy)return;
 const items=entries().map(e=>({name:e.i.name,purpose:e.g.purpose,recipient:e.g.recipient,type:groundType(e),context:lawContext(e),classification:lawClassification(e.i)}));
 const version=++lawSearch.version;
 lawSearch.candidateOpen??={};lawSearch.drafts??={};
 lawSearch.candidates.forEach((candidate,index)=>{candidate._key??=(version-1)+':'+index;lawSearch.candidateOpen[index]=false;});
 if(state.groundDraft?.candidateKey){lawSearch.drafts[state.groundDraft.candidateKey]=structuredClone(state.groundDraft);state.groundDraft=null;}
 Object.assign(lawSearch,{busy:true,error:'',rejected:[],note:''});render();
 try{
  const result=await lawRequest('/api/law/search',{items,demo:lawSearch.mode==='demo'});
  if(version!==lawSearch.version)return;
  for(const resultCandidate of result.candidates){
   const existing=lawSearch.candidates.findIndex(c=>candidateIdentity(c)===candidateIdentity(resultCandidate));
   if(existing>=0){const key=lawSearch.candidates[existing]._key;lawSearch.candidates[existing]={...resultCandidate,_key:key};}
   else{const index=lawSearch.candidates.length;lawSearch.candidates.push({...resultCandidate,_key:version+':'+index});lawSearch.candidateOpen[index]=true;}
  }
  lawSearch.rejected=result.rejected||[];
  lawSearch.note=result.note||(!result.candidates.length?'확인된 법령가 없습니다. 직접 근거를 선택하거나 처리 목적을 구체화해 다시 검색하세요.':'');
 }catch(error){if(version===lawSearch.version)lawSearch.error=apiErrorMessage(error);}
 finally{if(version===lawSearch.version){lawSearch.busy=false;if(step===3)render();}}
}
function clearAiReview(draft){draft.reviewError='';draft.aiReview=null;draft.reviewContext=null;draft.reviewConfirmed=false;}
function resetLawVerification(draft){clearAiReview(draft);Object.assign(draft,{verified:false,pipaVerified:false,supportVerified:false,pipa:null,support:null,articleExcerpt:'',conditionsConfirmed:false,authorityConfirmed:false,specific:false,sourceUrl:'',verifiedAt:'',effectiveDate:''});}
let aiReviewBusy=false;
let lawPicker={query:'',laws:[],document:null,article:'',paragraph:'',clause:'',loading:false,error:'',hasNext:false,version:0,includeAdmin:false,cursor:null,searchActive:false,failed:false};
function freshLawPicker(){lawPicker={query:'',laws:[],document:null,article:'',paragraph:'',clause:'',loading:false,error:'',hasNext:false,version:lawPicker.version+1,includeAdmin:false,cursor:null,searchActive:false,failed:false};}
function pickerArticle(){return lawPicker.document?.articles.find(a=>a.value===lawPicker.article);}
function pickerClauses(){const a=pickerArticle();return lawPicker.paragraph?a?.paragraphs.find(p=>p.value===lawPicker.paragraph)?.clauses||[]:a?.clauses||[];}
function pickedText(){const a=pickerArticle();return lawPicker.clause?pickerClauses().find(c=>c.value===lawPicker.clause)?.text:lawPicker.paragraph?a?.paragraphs.find(p=>p.value===lawPicker.paragraph)?.text:a?.text;}
function catalogRows(){return lawPicker.laws.map((law,n)=>`<button class="catalog-result" data-catalog-law="${n}" title="${safe(law.law)}" ${lawPicker.loading?'disabled':''}><strong>${safe(law.law)}</strong><small>${safe(law.kind)} · ${safe(law.department)} · 시행일 ${safe(law.effectiveDate)}</small></button>`).join('');}
function catalogFeedback(){
 if(lawPicker.loading)return '법령을 불러오고 있습니다…';
 if(lawPicker.error)return `${safe(lawPicker.error)} <button data-catalog-retry>다시 시도</button>`;
 if(lawPicker.hasNext)return `${Number.isInteger(lawPicker.total)?'전체 '+lawPicker.total+'건':'현재 '+lawPicker.laws.length+'건 · '+(lawPicker.countFailed?'전체 건수 확인 불가':'전체 집계 중')} · 아래로 스크롤하면 더 불러옵니다.`;
 return lawPicker.laws.length?`전체 ${lawPicker.laws.length}건 · 검색 결과의 마지막입니다.`:'검색 결과 0건';
}
function catalogWindow(){return `<div class="catalog-window" style="--catalog-visible:${Math.max(1,Math.min(5,lawPicker.laws.length))}"><div class="catalog-results" tabindex="0" role="region" aria-label="법령 검색 결과" aria-busy="${lawPicker.loading}">${catalogRows()}<div class="catalog-sentinel" aria-hidden="true"></div></div><div class="catalog-feedback" role="status" aria-live="polite">${catalogFeedback()}</div></div>`;}
function updateCatalogWindow(){
 document.querySelectorAll('[data-law-query],[data-catalog-search],[data-include-admin]').forEach(control=>control.disabled=lawPicker.loading);
 const box=document.querySelector('.catalog-results');if(!box)return;
 const top=box.scrollTop,oldCount=box.querySelectorAll('[data-catalog-law]').length;
 box.setAttribute('aria-busy',String(lawPicker.loading));
 box.querySelectorAll('[data-catalog-law]').forEach(button=>button.disabled=lawPicker.loading);
 if(lawPicker.laws.length>oldCount){
  const holder=document.createElement('div');holder.innerHTML=catalogRows();
  const sentinel=box.querySelector('.catalog-sentinel');
  [...holder.children].slice(oldCount).forEach(node=>box.insertBefore(node,sentinel));
 }
 box.scrollTop=top;
 box.parentElement.style.setProperty('--catalog-visible',Math.max(1,Math.min(5,lawPicker.laws.length)));
 const feedback=document.querySelector('.catalog-feedback');if(feedback)feedback.innerHTML=catalogFeedback();
}
const shortArticle=value=>'제'+value.replace('의','조의')+(value.includes('의')?'':'조');
function lawPickerPanel(draft){
 const a=pickerArticle(),clauses=pickerClauses(),doc=lawPicker.document;
 return `<section class="law-picker"><h4>③ 업무의 구체적인 법령 선택</h4><p class="muted">해당 개인정보 처리를 정한 개별 법률·시행령을 선택하세요.</p><div class="catalog-search-box"><div class="law-search-controls"><label class="field"><input aria-label="법령 검색어" data-law-query value="${safe(lawPicker.query)}" placeholder="업무와 관련된 법령 이름" maxlength="100" ${lawPicker.loading?'disabled':''}></label><button data-catalog-search ${lawPicker.loading?'disabled':''}>법령 검색하기</button></div><label class="check"><input type="checkbox" data-include-admin ${lawPicker.includeAdmin?'checked':''} ${lawPicker.loading?'disabled':''}>행정규칙도 검색 (참고용)</label><p class="catalog-hint">법률·시행령을 먼저 검색합니다. 결과는 5건씩 표시하고, 목록 안에서 아래로 스크롤하면 이어서 불러옵니다.</p>${lawPicker.searchActive?catalogWindow():''}</div>${doc?.referenceOnly?`<div class="info warn">행정규칙은 참고자료입니다. 적용할 상위 법률·시행령을 따로 선택하세요.</div><h4>${safe(doc.law)}</h4><blockquote class="law-excerpt">${safe(doc.text)}</blockquote><a href="${safe(sourceLink(doc.sourceUrl))}" target="_blank" rel="noopener noreferrer">행정규칙 원문 보기 ↗</a>`:doc?`<div class="selected-law"><p class="field-caption">선택한 법령</p><h5>${safe(doc.law)}</h5><div class="law-picker-selects"><label class="field citation-field"><span>조</span><span class="article-select-wrap"><select data-pick-article aria-label="조"><option value="">선택</option>${doc.articles.map(article=>`<option value="${safe(article.value)}" ${article.value===lawPicker.article?'selected':''}>${safe(shortArticle(article.value))} ${safe(article.title)}</option>`).join('')}</select><span class="article-select-value" aria-hidden="true">${lawPicker.article?safe(shortArticle(lawPicker.article)):'선택'}</span></span></label><label class="field citation-field"><span>항</span><select data-pick-paragraph aria-label="항" ${!a?.paragraphs.length?'disabled':''}><option value="">${!a?'조 선택 후':a.paragraphs.length?'전체':'항 없음'}</option>${(a?.paragraphs||[]).map(p=>`<option value="${p.value}" ${p.value===lawPicker.paragraph?'selected':''}>제${p.value}항</option>`).join('')}</select></label><label class="field citation-field"><span>호</span><select data-pick-clause aria-label="호" ${!clauses.length?'disabled':''}><option value="">${!a?'조 선택 후':clauses.length?'전체':a.paragraphs.length&&!lawPicker.paragraph?'항 선택 후':'호 없음'}</option>${clauses.map(c=>`<option value="${c.value}" ${c.value===lawPicker.clause?'selected':''}>제${c.value}호</option>`).join('')}</select></label></div>${a?`<blockquote class="law-excerpt">${safe(pickedText()||a.text)}</blockquote><button data-verify-law ${lawActionBusy?'disabled':''}>선택한 조문 다시 가져오기</button>`:''}</div>`:draft.law?`<p><strong>${safe(cite(draft))}</strong></p><blockquote class="law-excerpt">${safe(draft.excerpt)}</blockquote><button data-verify-law ${lawActionBusy?'disabled':''}>선택한 조문 다시 가져오기</button>`:''}</section>`;
}
async function searchCatalog(_page=1,append=false){
 const draft=state.groundDraft;if(!draft||lawPicker.loading)return;
 const query=document.querySelector('[data-law-query]')?.value.trim()||lawPicker.query.trim();
 const version=++lawPicker.version;Object.assign(lawPicker,{query,error:'',loading:true,searchActive:true,failed:false});
 if(!append){lawPicker.laws=[];lawPicker.cursor=null;lawPicker.hasNext=false;lawPicker.total=null;lawPicker.countFailed=false;lawPicker.countVersion=(lawPicker.countVersion||0)+1;render();}else updateCatalogWindow();
 try{
  let rounds=0;const start=Date.now();
  do{
   const result=await lawRequest('/api/law/catalog',{query,includeAdmin:lawPicker.includeAdmin,cursor:lawPicker.cursor});
   if(version!==lawPicker.version||state.groundDraft!==draft)return;
   const known=new Set(lawPicker.laws.map(l=>`${l.target||'law'}:${l.mst}`));
   for(const law of result.laws)if(!known.has(`${law.target||'law'}:${law.mst}`)){lawPicker.laws.push(law);known.add(`${law.target||'law'}:${law.mst}`);}
   lawPicker.cursor=result.cursor;lawPicker.hasNext=Boolean(result.hasNext&&result.cursor);
   updateCatalogWindow();rounds++;
   if(lawPicker.laws.length>=5||!lawPicker.hasNext)break;
  }while(rounds<4&&Date.now()-start<30000);
  if(!lawPicker.laws.length)lawPicker.error=lawPicker.hasNext?'대상 법령을 찾고 있습니다. 목록에서 아래로 스크롤해 이어서 조회하세요.':'해당 검색어의 결과가 없습니다. 다른 검색어로 찾아보세요.';
 }catch(error){if(version===lawPicker.version){lawPicker.error=apiErrorMessage(error);lawPicker.failed=true;}}
 finally{if(version===lawPicker.version){lawPicker.loading=false;updateCatalogWindow();if(!append&&lawPicker.hasNext)countCatalog();}}
}
async function countCatalog(){
 const picker=lawPicker,query=lawPicker.query,includeAdmin=lawPicker.includeAdmin,countVersion=lawPicker.countVersion;
 const current=()=>lawPicker===picker&&lawPicker.countVersion===countVersion&&lawPicker.query===query&&lawPicker.includeAdmin===includeAdmin&&lawPicker.searchActive;
 let cursor=null,total=0;
 try{for(let round=0;round<20;round++){
  if(!current())return;
  const result=await lawRequest('/api/law/count',{query,includeAdmin,cursor});
  if(!current())return;
  total+=result.count;cursor=result.cursor;
  if(!cursor){lawPicker.total=total;updateCatalogWindow();return;}
 }throw new Error('count limit');}catch{if(current()){lawPicker.countFailed=true;updateCatalogWindow();}}
}
async function selectCatalogLaw(index){
 const draft=state.groundDraft,law=lawPicker.laws[index];if(!draft||!law||lawPicker.loading)return;
 const version=++lawPicker.version;Object.assign(lawPicker,{loading:true,error:'',document:null});render();
 try{
  const result=await lawRequest('/api/law/articles',{law:law.law,mst:law.mst,target:law.target||'law'});
  if(version!==lawPicker.version||state.groundDraft!==draft)return;
  Object.assign(lawPicker,{document:result,article:'',paragraph:'',clause:'',laws:[],hasNext:false,searchActive:false,cursor:null});
  clearAiReview(draft);draft.verified=false;draft.conditionsConfirmed=false;draft.authorityConfirmed=false;
  Object.assign(draft,{law:result.referenceOnly?'':result.law,mst:result.mst,article:'',paragraph:'',clause:'',excerpt:'',target:result.referenceOnly?'admrul':'law'});
 }catch(error){if(version===lawPicker.version){lawPicker.error=apiErrorMessage(error);lawPicker.failed=true;}}
 finally{if(version===lawPicker.version){lawPicker.loading=false;if(step===3)render();}}
}
function setPickedCitation(){
 const draft=state.groundDraft,doc=lawPicker.document;if(!draft||!doc||doc.referenceOnly)return;
 clearAiReview(draft);
 Object.assign(draft,{law:doc.law,mst:doc.mst,target:'law',article:lawPicker.article,paragraph:lawPicker.paragraph,clause:lawPicker.clause,excerpt:pickedText()||'',articleExcerpt:pickerArticle()?.text||'',verified:false,conditionsConfirmed:false,authorityConfirmed:false});
 message='선택한 조문을 표시했습니다. 아래에서 적용할 항목과 요건을 검토하세요.';
 render();
}
async function chooseBasis(code){
 const draft=state.groundDraft;if(!draft)return;
 freshLawPicker();resetLawVerification(draft);Object.assign(draft,{basisCode:code,law:'',article:'',paragraph:'',clause:'',excerpt:'',additionalBasisCodes:[],additionalGrounds:[]});
 if(!code){render();return;}
 draft.ids=draft.ids.filter(id=>applicableEntries(draft).some(({i})=>i.id===id));
 const rule=LawBasis.rules[code];lawActionBusy=true;message='선택한 개인정보 보호법 조항을 확인하고 있습니다.';render();
 try{
  const proof=await lawRequest('/api/law/basis',{basisCode:code,type:draft.type});
  if(state.groundDraft!==draft||draft.basisCode!==code)return;
  Object.assign(draft,{pipa:proof.pipa,pipaParagraph:proof.pipaParagraph,pipaParagraphSegments:proof.pipaParagraph?.paragraphSegments||proof.paragraphSegments,pipaVerified:proof.pipaVerified,support:proof.support,supportVerified:proof.supportVerified});
  if(!rule.needsLaw)Object.assign(draft,{law:proof.law,article:proof.article,paragraph:proof.paragraph,clause:proof.clause,excerpt:proof.excerpt,articleExcerpt:proof.articleExcerpt,sourceUrl:proof.sourceUrl,verified:true});
  message=rule.needsLaw?'다음으로 이 업무의 구체적인 법령 조문을 선택하세요.':'적용할 항목과 법령의 요건을 확인하세요.';
 }catch(error){if(state.groundDraft===draft)message=apiErrorMessage(error);}
 finally{lawActionBusy=false;if(step===3)render();}
}
function basisEditor(draft){
 const rule=LawBasis.rules[draft.basisCode];
 return `<section class="basis-selection"><h4>② 개인정보 보호법의 처리 근거 선택</h4><label class="field"><span>동의 외의 처리 근거</span><select data-basis-code ${lawActionBusy?'disabled':''}><option value="">먼저 근거를 선택하세요</option>${draftOptions(draft).map(([code,r])=>`<option value="${code}" ${draft.basisCode===code?'selected':''}>${safe(r.label)} (${safe(r.pipa)})</option>`).join('')}</select></label>${rule&&draft.pipa?`<details class="pipa-original"><summary>원문 보기</summary><blockquote class="law-excerpt">${candidateExcerpt({...draft.pipa,paragraphExcerpt:draft.pipaParagraph?.excerpt,paragraphSegments:draft.pipaParagraphSegments})}</blockquote></details>`:''}${['legitimate','provisionLegitimate'].includes(draft.basisCode)?'<p class="legitimate-warning" role="note">개인정보처리자의 정당한 이익이 정보주체의 권리보다 명백히 우선한다는 점은 개인정보처리자가 직접 입증해야 합니다. 필요성·관련성·합리적 범위를 검토하고 입증 자료를 보관하세요.</p>':''}</section>`;
}
function selectedReviewItems(draft){return applicableEntries(draft).filter(({i})=>draft.ids.includes(i.id)).map(e=>({id:e.i.id,name:e.i.name,purpose:e.g.purpose,recipient:e.g.recipient,type:groundType(e),context:lawContext(e),classification:lawClassification(e.i)}));}
function reviewSnapshot(draft){return JSON.stringify({basisCode:draft.basisCode,type:draft.type,law:draft.law,article:draft.article,paragraph:draft.paragraph,clause:draft.clause,mst:draft.mst,additionalBasisCodes:additionalCodes(draft),items:selectedReviewItems(draft).sort((a,b)=>a.id.localeCompare(b.id))});}
function citationRequest(draft){return {type:draft.type,basisCode:draft.basisCode,law:draft.law,article:draft.article,paragraph:draft.paragraph,clause:draft.clause,mst:draft.mst,target:draft.target||'law',additionalBasisCodes:additionalCodes(draft)};}
function hasCurrentReview(draft){return Boolean(draft.aiReview?.canApply&&draft.aiReview.token&&draft.reviewContext===reviewSnapshot(draft));}
function reviewPanel(draft){
 if(draft.candidateKey)return '';
 const review=draft.aiReview;
 const labels={possible:'검토상 적용 가능',needs_information:'추가 확인 필요',not_supported:'적용 권장하지 않음'};
 return `<section class="ai-review-panel"><h4>AI 검토(필요 시 진행)</h4><p>선택한 항목의 처리 목적과 공식 조문을 대조합니다. 적용 여부를 보증하는 법률 판단은 아니며, 담당자의 최종 확인이 필요합니다.</p><button class="optional-review" data-ai-review ${lawActionBusy?'disabled':''}>${aiReviewBusy?'<span class="review-spinner" aria-hidden="true"></span> AI 검토 중…':review?'선택 항목 다시 AI 검토':'선택 항목 AI 검토'}</button>${draft.reviewError?`<p class="notice" role="alert">${safe(draft.reviewError)}</p>`:''}${review?`<div class="ai-review-result"><h5>AI 검토 결과</h5><p>${safe(review.summary)}</p><ul>${review.items.map(item=>`<li><div><strong>${safe(item.name)}</strong><span class="pill ${item.verdict==='possible'?'':'pending'}">${labels[item.verdict]||'추가 확인 필요'}</span></div><p>${safe(item.explanation)}</p>${item.checks?.length?`<ul>${item.checks.map(check=>`<li>${safe(check)}</li>`).join('')}</ul>`:''}</li>`).join('')}</ul>${!review.canApply?'<p class="notice">AI 의견은 참고사항입니다. 적용을 권장하지 않는 의견이어도 담당자가 법령과 적용 요건을 확인한 후 등록할 수 있습니다.</p>':'<p class="muted">검토 후 항목이나 근거를 바꾸면 기존 AI 검토 결과는 초기화됩니다. 아래 요건 확인 후 적용하세요.</p>'}</div>`:''}</section>`;
}
function additionalGroundOptions(draft){
 const rule=LawBasis.rules[draft.basisCode];if(!rule?.needsLaw||rule.effect!=='notice'||!draft.ids.length)return '';
 const codes=['sensitiveLaw','uniqueLaw','residentLaw'].filter(code=>draft.ids.some(id=>LawBasis.rules[code].supplement===lawClassification(getItem(id))));
 return codes.length?`<fieldset class="additional-grounds"><legend>같은 법령으로 함께 확인할 별도 허용 근거</legend>${codes.map(code=>checkbox(LawBasis.rules[code].pipa+' · '+LawBasis.rules[code].label,`data-extra-basis="${code}"`,additionalCodes(draft).includes(code))).join('')}</fieldset>`:'';
}
function groundItemStatus(e){return LawBasis.notice(e.i.bases,lawContext(e),lawClassification(e.i))?'적용 완료 · 고지사항':rnn(e.i.name)?'법령상 허용 근거 필요 · 동의 불가':'동의서 유지';}
function draftScope(draft){
 const rule=LawBasis.rules[draft.basisCode];if(!rule)return '';
 return `<section class="application-scope"><h4>④ 적용할 개인정보 항목 선택</h4><p>적용할 항목만 체크하세요. 체크하지 않은 항목에는 적용하지 않습니다.</p><fieldset><legend>${safe(groundTypes[draft.type])}</legend>${`<label class="scope-select-all"><input type="checkbox" data-scope-all ${applicableEntries(draft).length&&applicableEntries(draft).every(({i})=>draft.ids.includes(i.id))?'checked':''}>전체선택</label>`}${applicableEntries(draft).map(({i})=>`<label class="scope-option"><input type="checkbox" data-scope="${i.id}" ${draft.ids.includes(i.id)?'checked':''}><span><b>${safe(i.name)}</b><small>${rnn(i.name)?'주민등록번호 · 동의 불가':kind(i)==='general'?(i.required?'일반 개인정보(필수)':'일반 개인정보(선택)'):categoryNames[kind(i)]}</small></span></label>`).join('')}</fieldset>${additionalGroundOptions(draft)}${reviewPanel(draft)}${draft.candidateKey||rule.needsLaw||(draft.basisCode==='residentLaw'||additionalCodes(draft).includes('residentLaw'))?`<div class="review-confirmations">${draft.candidateKey||rule.needsLaw||(draft.basisCode==='residentLaw'||additionalCodes(draft).includes('residentLaw'))?'<h4>⑤ 담당자 확인</h4>':''}${draft.candidateKey?checkbox(rule.conditionsText||'선택한 근거의 요건과 이 업무의 처리 목적·범위를 확인했습니다.','data-law-conditions',draft.conditionsConfirmed):''}${rule.needsLaw?checkbox('이 개별 법령 조문이 선택 항목의 수집·이용·제공을 구체적으로 요구하거나 허용하는지 확인했습니다.','data-law-authority',draft.authorityConfirmed):''}${(draft.basisCode==='residentLaw'||additionalCodes(draft).includes('residentLaw'))?checkbox('주민등록번호의 구체적인 처리 허용 요건을 확인했습니다.','data-specific',draft.specific):''}</div>`:''}<p class="notice" id="ground-status" role="status">${safe(message)}</p><div class="actions"><button class="primary" data-adopt-ground ${lawActionBusy?'disabled':''}>${lawActionBusy?'확인 중…':'검토한 항목에 이 근거 적용'}</button><button data-cancel-ground>적용하지 않고 닫기</button></div></section>`;
}
async function reviewGround(){
 const draft=state.groundDraft,rule=LawBasis.rules[draft?.basisCode];if(!draft||!rule||lawActionBusy||draft.candidateKey)return;
 if(!draft.ids.length){feedback('AI가 검토할 개인정보 항목을 먼저 체크하세요.');return;}
 if(rule.needsLaw&&(!draft.law||!draft.article||LawBasis.isPipa(draft.law)||draft.target==='admrul')){feedback('이 업무의 구체적인 법률·시행령 조문을 먼저 선택하세요.');return;}
 clearAiReview(draft);const snapshot=reviewSnapshot(draft);lawActionBusy=true;aiReviewBusy=true;message='공식 조문과 선택 항목을 AI가 검토하고 있습니다.';render();
 try{
  const result=await lawRequest('/api/law/review',{...citationRequest(draft),items:selectedReviewItems(draft)});
  if(state.groundDraft!==draft||reviewSnapshot(draft)!==snapshot){message='검토 중 항목이나 근거가 바뀌었습니다. 변경한 내용으로 다시 검토하세요.';return;}
  Object.assign(draft,result.candidate);draft.aiReview=result.review;draft.reviewContext=reviewSnapshot(draft);
  message='AI 의견을 참고하여 담당자가 최종 판단하세요. 검토 의견과 관계없이 요건 확인 후 적용할 수 있습니다.';
 }catch(error){if(state.groundDraft===draft){draft.reviewError=apiErrorMessage(error);message='';}}
 finally{aiReviewBusy=false;lawActionBusy=false;if(step===3)render();}
}
function candidateExcerpt(record){
 const segments=record.paragraphSegments;
 if(record.paragraph&&segments?.length)return segments.map(part=>{const text=(part.label&&!part.text.startsWith(part.label)?part.label+' ':'')+part.text;return part.clause&&part.clause===record.clause?`<strong class="selected-clause">${safe(text)}</strong>`:safe(text);}).join('\n');
 const text=record.paragraph?(record.paragraphExcerpt||record.pipaParagraph?.excerpt||record.articleExcerpt||record.excerpt):(record.articleExcerpt||record.excerpt);
 const selected=record.clause?record.excerpt:'';
 const offset=selected&&text.indexOf(selected)===text.lastIndexOf(selected)?text.indexOf(selected):-1;
 return offset<0?safe(text):safe(text.slice(0,offset))+`<strong class="selected-clause">${safe(selected)}</strong>`+safe(text.slice(offset+selected.length));
}
function candidateSource(record){
 const isPipa=LawBasis.isPipa(record.law);
 const rule=LawBasis.rules[record.basisCode];
 return `${!isPipa?`${rule?.pipa!==record.cite?`<p class="source-citation">${safe(rule?.pipa)}</p>`:''}<p><strong>${safe(record.cite||cite(record))}</strong></p><p>${safe(record.reason)}</p>`:''}<details class="source-disclosure"><summary>전문 보기</summary><blockquote class="law-excerpt">${candidateExcerpt(record)}</blockquote><a href="${safe(sourceLink(record.sourceUrl))}" target="_blank" rel="noopener noreferrer">법령 원문 보기 ↗</a></details>${['legitimate','provisionLegitimate'].includes(record.basisCode)?'<p class="legitimate-warning" role="note">정당한 이익이 정보주체의 권리보다 명백히 우선한다는 점은 개인정보처리자가 직접 입증해야 합니다.</p>':''}`;
}
function groundEditor(draft,inline=false){
 if(inline&&draft.candidateKey)return `<div class="candidate-editor ground-editor">${candidateSource(draft)}${draftScope(draft)}</div>`;
 const content=`<label class="field"><span class="privacy-type-label">① 처리 상황</span><select data-ground-type ${lawActionBusy?'disabled':''}>${Object.entries(groundTypes).map(([type,label])=>`<option value="${type}" ${!groundEntries(type).length?'disabled':''} ${draft.type===type?'selected':''}>${label}</option>`).join('')}</select></label>${basisEditor(draft)}${LawBasis.rules[draft.basisCode]?.needsLaw?lawPickerPanel(draft):''}${draftScope(draft)}${!draft.basisCode?`<p class="notice" role="status">${safe(message)}</p>`:''}`;
 if(inline)return `<div class="candidate-editor ground-editor">${content}</div>`;
 return `<details class="panel ground-editor manual-ground" ${editorOpen?'open':''}><summary>법령·처리 근거 추가</summary><div class="ground-form">${content}</div></details>`;
}
function categoryGrounds(type,label){
 const list=groundEntries(type);if(!list.length)return '';
 const saved=state.grounds.filter(b=>b.type===type&&!b.bundleSupplement&&!lawSearch.candidates.some((c,n)=>b.candidateKey===candidateKey(c,n)));
 const grouped=new Map();for(const b of saved){const key=groundDisplayKey(b);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(b);}
 const candidates=lawSearch.candidates.map((c,n)=>({c,n,key:candidateKey(c,n)})).filter(({c,n,key})=>c.type===type);
 const activeKeys=new Set(state.grounds.filter(b=>b.type===type&&b.candidateKey).map(b=>b.candidateKey));
 if(state.groundDraft?.type===type&&state.groundDraft.candidateKey)activeKeys.add(state.groundDraft.candidateKey);
 const available=candidates.filter(({n})=>!lawSearch.hidden?.includes(n));
 const visible=available.filter(({key})=>!activeKeys.size||activeKeys.has(key)||lawSearch.showAlternatives?.[type]);
 const alternativeCount=available.length-visible.length;
 return `<section class="panel ground-category" data-ground-category="${type}"><h2>${label}</h2>${groundPurpose(list)}<div class="actions applied-law-actions">${state.grounds.filter(b=>b.type===type&&!b.bundleSupplement).map(b=>`<button data-edit-ground="${b.id}">적용 법령 수정 · ${safe(b.cite)}</button>`).join('')}</div><div class="category-items">${list.map(e=>`<div class="row"><b>${safe(e.i.name)}</b><span class="pill ${LawBasis.notice(e.i.bases,lawContext(e),lawClassification(e.i))?'':'pending'}">${groundItemStatus(e)}</span></div>`).join('')}</div>${[...grouped.values()].map(records=>{const b=records[0],ids=[...new Set(records.flatMap(r=>r.ids))];return `<details class="basis applied-basis"><summary>적용한 근거 · ${safe(LawBasis.rules[b.basisCode]?.label||'처리 근거')} · ${ids.map(id=>safe(getItem(id)?.name)).join(', ')}</summary><p>${safe(LawBasis.rules[b.basisCode]?.pipa)}</p><p>${safe(b.cite)}</p><blockquote class="law-excerpt">${safe(b.excerpt)}</blockquote>${records.map(r=>`<p>적용 항목: ${r.ids.map(id=>safe(getItem(id)?.name)).join(', ')}</p><div class="actions"><button data-edit-ground="${r.id}">적용 항목·근거 수정</button><button class="danger cancel-law" data-remove-ground="${r.id}">이 근거 적용 취소</button></div>`).join('')}</details>`;}).join('')}${candidates.length?`<details class="law-options-group" data-law-group="${type}" ${lawSearch.groupOpen?.[type]===false?'':'open'}><summary>검토할 법령 ${visible.length}개</summary><div class="law-options-children">`:''}${visible.map(({c,n,key})=>{
 const selected=state.groundDraft?.candidateKey===key;
 const applied=state.grounds.find(b=>b.candidateKey===key);
 const folded=lawSearch.dismissed?.includes(n);
 const isOpen=lawSearch.candidateOpen?.[n]??(!applied&&!folded);
 return `<details class="law-result candidate-block" data-candidate="${n}" ${isOpen?'open':''}><summary><span class="candidate-title">${LawBasis.isPipa(c.law)?safe(c.cite||cite(c)):`${safe(c.law)} · ${safe(LawBasis.rules[c.basisCode]?.label||'처리 근거')}`}</span><span class="pill ${applied?'':folded?'pending':''}">${applied?'적용됨 · '+applied.ids.map(id=>safe(getItem(id)?.name)).join(', '):folded?'선택 안함 · 다시 선택 가능':c.verified?'조문 확인됨 · 적용 전':'미검증 시연'}</span></summary><div class="candidate-body">${selected?groundEditor(state.groundDraft,true):`${candidateSource(applied||c)}${applied?`<p>적용 항목: ${applied.ids.map(id=>safe(getItem(id)?.name)).join(', ')}</p>`:''}<div class="actions"><button data-use-law="${n}" ${lawActionBusy?'disabled':''}>${applied?'적용 항목·근거 다시 검토':'이 법령의 적용 항목 선택'}</button><button data-dismiss-law="${n}">이 법령 선택 안함</button>${applied?`<button class="danger cancel-law" data-remove-ground="${applied.id}">이 근거 적용 취소</button>`:''}</div>`}</div></details>`;
 }).join('')}${candidates.length?`</div>${alternativeCount?`<button class="other-laws" data-show-laws="${type}">다른 법령 보기 (${alternativeCount}개)</button>`:''}</details>`:''}</section>`;
}
function grounds(){
 const draft=state.groundDraft;
 return `${lawSearchPanel()}${draft&&!draft.candidateKey?groundEditor(draft):''}${Object.entries(groundTypes).map(([type,label])=>categoryGrounds(type,label)).join('')}${unresolvedRnn().length?'<div class="info warn"><div><strong id="rrn-block">주민등록번호 근거를 추가로 확인하세요.</strong><p>수집·제공의 일반 근거와 제24조의2의 구체적인 처리 허용 근거를 모두 적용해야 다음 단계로 진행할 수 있습니다.</p></div></div>':''}`;
}
function syncGrounds(){
 const active=new Set(entries().map(({i})=>i.id));state.grounds=state.grounds.map(b=>({...b,ids:b.ids.filter(key=>active.has(key))})).filter(b=>b.ids.length);
 for(const {i} of entries())i.bases=state.grounds.filter(b=>b.ids.includes(i.id));
}
function saveGround(){
 const draft=state.groundDraft,rule=LawBasis.rules[draft?.basisCode];if(!rule)return;
 const ids=applicableEntries(draft).map(({i})=>i.id).filter(id=>draft.ids.includes(id));
 if(!ids.length){feedback('적용할 항목을 하나 이상 체크하세요.');return;}
 if(!draftOptions(draft).some(([code])=>code===draft.basisCode)||!draft.verified||!draft.pipaVerified||rule.support&&!draft.supportVerified){feedback('근거의 조문 확인이 완료되지 않았습니다. 근거를 다시 선택해 주세요.');return;}
 if(rule.needsLaw&&(LawBasis.isPipa(draft.law)||draft.target==='admrul'||!draft.authorityConfirmed)){feedback('이 업무의 구체적인 법률·시행령 조문과 처리 허용 요건을 확인하세요.');return;}
 if(draft.candidateKey&&!draft.conditionsConfirmed){feedback('법령의 적용 요건을 확인하세요.');return;}
 if((draft.basisCode==='residentLaw'||additionalCodes(draft).includes('residentLaw'))&&!draft.specific){feedback('주민등록번호의 구체적 처리 허용 요건을 확인하세요.');return;}
 const bundleId=draft.bundleId||id();
 const saved={...draft,bundleId,conditionsConfirmed:draft.candidateKey?draft.conditionsConfirmed:true,ids,id:draft.editId||id(),cite:cite(draft),specific:(draft.basisCode==='residentLaw'||additionalCodes(draft).includes('residentLaw'))&&draft.specific};
 if(draft.candidateKey){lawSearch.showAlternatives??={};lawSearch.showAlternatives[draft.type]=false;const n=lawSearch.candidates.findIndex((c,index)=>candidateKey(c,index)===draft.candidateKey);lawSearch.candidateOpen??={};if(n>=0)lawSearch.candidateOpen[n]=false;if(lawSearch.drafts)delete lawSearch.drafts[draft.candidateKey];}
 const additions=(draft.additionalGrounds||[]).map(proof=>({...saved,...proof,id:id(),bundleId,bundleSupplement:true,ids:ids.filter(key=>lawClassification(getItem(key))===LawBasis.rules[proof.basisCode].supplement),conditionsConfirmed:true,specific:proof.basisCode==='residentLaw'&&draft.specific})).filter(b=>b.ids.length);
 state.grounds=[...state.grounds.filter(b=>draft.bundleId?b.bundleId!==draft.bundleId:b.id!==saved.id),saved,...additions];state.groundDraft=null;editorOpen=false;state.edits={};syncGrounds();message='선택한 항목에 근거를 적용했습니다.';render();
}
async function applyGround(){
 const draft=state.groundDraft,rule=LawBasis.rules[draft?.basisCode];if(!draft||!rule||lawActionBusy)return;
 if(!draft.ids.length){feedback('적용할 개인정보 항목을 먼저 체크하세요.');return;}
 if(draft.candidateKey&&!draft.conditionsConfirmed||rule.needsLaw&&!draft.authorityConfirmed){feedback('해당 근거의 적용 요건을 확인하세요.');return;}
 if(rule.needsLaw&&(!draft.law||!draft.article||LawBasis.isPipa(draft.law)||draft.target==='admrul')){feedback('포괄 조항이 아닌 이 업무의 구체적인 법률·시행령 조문을 선택하세요.');return;}
 if((draft.basisCode==='residentLaw'||additionalCodes(draft).includes('residentLaw'))&&!draft.specific){feedback('주민등록번호의 구체적 처리 허용 요건을 확인하세요.');return;}
 const snapshot=JSON.stringify(draft);lawActionBusy=true;message='선택한 근거를 확인하여 적용하고 있습니다.';render();
 try{
  const actual=await lawRequest('/api/law/apply',{...citationRequest(draft),items:selectedReviewItems(draft),reviewToken:hasCurrentReview(draft)?draft.aiReview.token:undefined});
  if(state.groundDraft!==draft||JSON.stringify(draft)!==snapshot){message='검토 내용이 바뀌었습니다. 변경된 내용으로 다시 적용하세요.';return;}
  Object.assign(draft,actual);saveGround();
 }catch(error){if(state.groundDraft===draft){if(error.status===409)clearAiReview(draft);message=apiErrorMessage(error);}}
 finally{lawActionBusy=false;if(step===3)render();}
}
async function verifyGround(){
 const draft=state.groundDraft;if(!draft?.article||lawActionBusy)return;
 clearAiReview(draft);const snapshot=JSON.stringify(draft);lawActionBusy=true;message='선택한 조문을 다시 불러오고 있습니다.';render();
 try{
  const actual=await lawRequest('/api/law/verify',citationRequest(draft));
  if(state.groundDraft!==draft||JSON.stringify(draft)!==snapshot)return;
  Object.assign(draft,actual);message='선택한 조문을 다시 가져왔습니다. 적용 항목과 요건을 검토하세요.';
 }catch(error){if(state.groundDraft===draft)message=apiErrorMessage(error);}
 finally{lawActionBusy=false;if(step===3)render();}
}

function sections(){
 const map=new Map();
 for(const {key,g,i} of entries()){
  const isRnn=rnn(i.name);
  if(isRnn&&!LawBasis.notice(i.bases,lawContext({key,g,i}),'rnn')) continue;
  const classification=key==='collect'?(isRnn?'rnn':kind(i)):'mixed';
  const required=key==='marketing'?'선택':key==='collect'?(i.required?'필수':'선택'):'공통';
  const basis=LawBasis.notice(i.bases,lawContext({key,g,i}),isRnn?'rnn':kind(i))?'notice':'consent';
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
const noticeIntro = '아래 개인정보는 안내된 법적 근거에 따라 처리하며 별도의 동의를 받지 않습니다. 처리 목적, 개인정보 항목, 보유 및 이용기간과 법적 근거를 확인해 주시기 바랍니다.';
const defaultIntro = () => {
 if(!hasConsent())return noticeIntro;
 const {purpose,action}=consentDetails();
 const agency=withParticle(state.agency.trim(),'은','는');
 return `${agency} ${withParticle(purpose,'을','를')} 위하여 아래와 같이 개인정보를 ${action}하고자 합니다. 내용을 자세히 확인하신 후 동의 여부를 결정하여 주시기 바랍니다.`;
};
const sectionTitle = s => documentCategory(s);
const refusalSections = () => sections().filter(s=>s.basis==='consent'||s.classification==='rnn');
const refusalText = (s,preview) => {
 const text=state.refusals[s.k]?.trim();
 if(text)return `<span class="doc-refusal-text">${safe(text)}</span>`;
 return preview?'<em class="doc-refusal-missing">아직 입력하지 않았습니다</em>':'';
};
const note = text => `<p class="doc-note"><span class="doc-note-marker" aria-hidden="true">※</span> <span>${text}</span></p>`;
const refusalPrefix = s => `${s.required==='공통'?'':'['+(s.required||'선택')+'] '}동의를 거부할 수 있습니다. 그러나 동의를 거부할 경우 `;
const marketingContact = '<p class="doc-marketing"><strong>제공하신 연락처로 마케팅 안내나 홍보 연락을 받을 수 있습니다.</strong></p>';
const editableText = (label,key,value,editable) => `<span class="doc-text" ${editable?`contenteditable="plaintext-only" role="textbox" aria-label="${safe(label)}" data-edit="${key}"`:''}>${safe(state.edits[key]??value)}</span>`;
const noticeBasisText=item=>[...new Set((item.bases||[]).filter(b=>LawBasis.rules[b.basisCode]?.effect!=='consent').map(b=>[...new Set([LawBasis.rules[b.basisCode]?.pipa,b.cite].filter(Boolean))].join(' · ')))].join(' / ');
const documentCategory=s=>s.key==='extra'?'목적 외 이용':s.key==='provide'?(s.g.outside?'목적 외 제공':'제3자 제공'):s.key==='marketing'?'홍보 또는 마케팅 관련':s.classification==='general'?(s.required==='필수'?'일반 개인정보(필수)':'일반 개인정보(선택)'):s.classification==='rnn'?'고유식별정보(주민등록번호)':categoryNames[s.classification];
const importantText=text=>`<strong class="doc-important">${text}</strong>`;
function categoryTable(rows,editable){
 const first=rows[0],provider=first.key==='provide';
 const conditionCell=(row,index,key,important=false)=>{
  const value=s=>String(state.edits[s.k+'.'+key]??s.g[key]??'').trim();
  if(index&&value(row)===value(rows[index-1]))return '';
  let end=index+1;while(end<rows.length&&value(row)===value(rows[end]))end++;
  const keys=rows.slice(index,end).map(s=>s.k+'.'+key);
  const text=editableText({purpose:'이용 목적',period:'보유 및 이용기간',recipient:'제공받는 자'}[key],keys[0],row.g[key],editable);
  return `<td data-merge-keys="${safe(JSON.stringify(keys))}"${end-index>1?` rowspan="${end-index}"`:''}>${important?importantText(text):text}</td>`;
 };
 return `<article class="doc-category" data-document-category="${safe([first.key,first.classification,first.classification==='general'?first.required:''].join('.'))}"><h3>${safe(first.key==='collect'&&first.classification==='general'?'일반 개인정보':documentCategory(first))}</h3><table class="doc-table"><thead><tr>${first.key==='collect'&&first.classification==='general'||rows.length>1?'<th scope="col">구분</th>':''}${provider?'<th scope="col">제공받는 자</th>':''}<th scope="col">개인정보 항목</th><th scope="col">${provider?'제공받는 자의 이용 목적':'이용 목적'}</th><th scope="col">보유 및 이용기간</th></tr></thead><tbody>${rows.map((row,index)=>{const items=row.classification==='mixed'?row.items.map(i=>{const name=editableText('개인정보 항목',i.id+'.item',i.name,editable);return kind(i)==='general'&&!rnn(i.name)?name:importantText(name);}).join(', '):editableText(documentCategory(row)+' 항목',row.k+'.items',row.items.map(i=>i.name).join(', '),editable);return `<tr class="doc-consent-row" data-consent-row="${row.k}">${first.key==='collect'&&first.classification==='general'||rows.length>1?`<th scope="row">${row.required}</th>`:''}${provider?conditionCell(row,index,'recipient',true):''}<td data-consent-items="${row.k}">${['general','mixed'].includes(row.classification)?items:importantText(items)}</td>${conditionCell(row,index,'purpose',provider)}${conditionCell(row,index,'period',true)}</tr>`;}).join('')}</tbody></table>${rows.map(s=>`<div class="doc-consent" data-consent-section="${s.k}">${note(refusalPrefix(s)+refusalText(s,editable))}${s.key==='marketing'?marketingContact:''}<p class="doc-choice"><span>&nbsp;☞ ${safe(documentCategory(s))}${s.key==='collect'?'의 수집·이용':s.key==='marketing'?' 연락을 받는 것':''}에 동의하십니까?</span><strong>□ 동의　 □ 미동의</strong></p></div>`).join('')}</article>`;
}
function noticeTable(sections,editable){
 const first=sections[0],provider=first.key==='provide',grouped=new Map();
 for(const s of sections)for(const i of s.items){
  const values=Object.fromEntries(['purpose','period','recipient'].map(k=>[k,state.edits[i.id+'.'+k]??s.g[k]??'']));
  const basis=[...new Set((i.bases||[]).filter(b=>LawBasis.rules[b.basisCode]?.effect!=='consent').map(b=>b.cite))].sort().join(' / ');
  const key=JSON.stringify([values,basis]);
  if(!grouped.has(key))grouped.set(key,{values,basis,items:[]});grouped.get(key).items.push(i);
 }
 const rows=[...grouped.values()];
 const cell=(row,index,key)=>{
  const value=r=>key==='basis'?r.basis:r.values[key];
  if(index&&value(row)===value(rows[index-1]))return '';
  let end=index+1;while(end<rows.length&&value(row)===value(rows[end]))end++;
  const keys=key==='basis'?[]:rows.slice(index,end).flatMap(r=>r.items.map(i=>i.id+'.'+key));
  const text=key==='basis'?safe(row.basis):editableText({purpose:'처리 목적',period:'보유 및 이용기간',recipient:'제공받는 자'}[key],keys[0],value(row),editable);
  return `<td${keys.length?` data-merge-keys="${safe(JSON.stringify(keys))}"`:''}${end-index>1?` rowspan="${end-index}"`:''}>${key==='period'?importantText(text):text}</td>`;
 };
 return `<article class="doc-notice" data-document-category="notice.${first.key}"><h3>${safe(first.key==='provide'&&first.g.outside?'목적 외 제공':first.key==='marketing'?'홍보 또는 마케팅 관련':groupNames[first.key])}</h3><table class="doc-table"><thead><tr>${provider?'<th>제공받는 자</th>':''}<th>개인정보 항목</th><th>처리 목적</th><th>보유 및 이용기간</th><th>법적 근거</th></tr></thead><tbody>${rows.map((row,index)=>`<tr class="doc-notice-row">${provider?cell(row,index,'recipient'):''}<td>${row.items.map(i=>{const text=editableText('개인정보 항목',i.id+'.item',i.name,editable);return kind(i)==='general'&&!rnn(i.name)?text:importantText(text);}).join(', ')}</td>${cell(row,index,'purpose')}${cell(row,index,'period')}${cell(row,index,'basis')}</tr>`).join('')}</tbody></table></article>`;
}
const signatureLine = '_'.repeat(24);
function signatureBlock(){
 return `<article class="sign"><p class="signature-date">　　　　년　　 월　　 일</p><p>정보주체: <span class="signature-line">${signatureLine}</span> (서명)</p>${state.child?`<p class="guardian-heading"><strong>만 14세 미만 아동의 법정대리인 동의</strong></p><p>법정대리인: <span class="signature-line">${signatureLine}</span> (서명)</p><p class="guardian-relationship">아동과의 관계: <span class="signature-line relationship-line">${'_'.repeat(16)}</span></p>`:''}</article>`;
}
function documentHTML(editable=false){
 const rows=sections();if(!rows.length)return '';
 const consentGroups=new Map(),noticeGroups=new Map();
 for(const row of rows){const consent=row.basis==='consent',groups=consent?consentGroups:noticeGroups;const key=consent?[row.key,row.classification].join('.'):[row.key,Boolean(row.g.outside)].join('.');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 const title=state.title.trim()||suggestedTitle(),intro=state.intro.trim()||defaultIntro();
 return `<section class="doc"><h1>${safe(title)}</h1><p class="doc-intro">${safe(intro)}</p>${[...consentGroups.values()].map(group=>categoryTable(group,editable)).join('')}${noticeGroups.size?`<section class="notice-section"><h3 class="doc-notice-heading">고지사항</h3>${[...noticeGroups.values()].map(group=>noticeTable(group,editable)).join('')}</section>`:''}${consentGroups.size?signatureBlock():''}<p class="doc-agency"><strong>${safe(state.agency||'기관명 미입력')} 귀중</strong></p></section>`;
}
function previewControls(editing,top=false){
 return `<nav class="a4-page-nav ${top?'a4-nav-top':''}" aria-label="미리보기 ${top?'상단':'하단'} 쪽 이동" ${editing?'hidden':''}><button data-preview-move="-1" disabled>← 이전 쪽</button><output class="a4-page-counter" aria-live="polite">1 / 1쪽</output><button data-preview-move="1" disabled>다음 쪽 →</button>${top?'<span class="preview-zoom"><button data-preview-zoom="-0.1" aria-label="미리보기 축소">−</button><output class="preview-zoom-value">100%</output><button data-preview-zoom="0.1" aria-label="미리보기 확대">＋</button><button data-preview-zoom="fit">가로 맞춤</button></span>':''}</nav>`;
}
function previewMarkup(html,editing=false){
 return `<p class="a4-preview-status muted" role="status">${editing?'표 수정 중입니다. 저장하면 A4 쪽 미리보기가 갱신됩니다.':'A4 미리보기를 준비하고 있습니다…'}</p>${previewControls(editing,true)}<div class="a4-document-frame" role="region" aria-label="A4 문서 쪽 미리보기" data-zoom="1" ${editing?'hidden':''}></div>${previewControls(editing)}<div id="preview-docs" class="document-source" ${editing?'':'hidden'}>${html}</div>`;
}

let a4PreviewVersion=0,a4PreviewTimer,pdfViewer;
function scheduleA4Preview(){
 clearTimeout(a4PreviewTimer);const version=++a4PreviewVersion;
 const frame=document.querySelector('.a4-document-frame'),status=document.querySelector('.a4-preview-status');
 if(!frame||step===4&&documentEditing)return;
 a4PreviewTimer=setTimeout(async()=>{
  let documentPdf,loadingTask;
  try{
   const blob=await (await import('./pdf-export.js')).createPdf(exportBody(),documentTableGrid);
   const viewer=await (pdfViewer??=import('./export-assets/pdfjs.min.js').catch(error=>{pdfViewer=null;throw error;}));
   if(version!==a4PreviewVersion||!frame.isConnected)return;
   viewer.GlobalWorkerOptions.workerSrc=new URL('/export-assets/pdfjs-worker.min.js',location.origin).href;
   loadingTask=viewer.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useWasm:false});documentPdf=await loadingTask.promise;
   const pages=document.createDocumentFragment();
   for(let n=1;n<=documentPdf.numPages;n++){
    if(version!==a4PreviewVersion||!frame.isConnected)return;
    const page=await documentPdf.getPage(n),viewport=page.getViewport({scale:1.5}),paper=document.createElement('section');
    paper.className='a4-paper';paper.hidden=n!==1;paper.setAttribute('aria-label','문서 '+n+'쪽');
    const label=document.createElement('p');label.className='a4-page-label';label.textContent=n+' / '+documentPdf.numPages+'쪽';paper.append(label);
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.setAttribute('aria-hidden','true');paper.append(canvas);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    const accessible=document.createElement('div');accessible.className='a4-page-text';accessible.textContent=(await page.getTextContent()).items.map(i=>i.str).join(' ');paper.append(accessible);pages.append(paper);
   }
   if(version!==a4PreviewVersion||!frame.isConnected)return;
   frame.replaceChildren(pages);frame.hidden=false;frame.dataset.pages=documentPdf.numPages;
   status.textContent='A4 · 총 '+documentPdf.numPages+'쪽';showA4Page(1);
  }catch{if(version===a4PreviewVersion&&frame.isConnected){status.textContent='A4 미리보기를 만들지 못했습니다. 문서 내용을 확인한 뒤 다시 시도해 주세요.';document.querySelector('#preview-docs').hidden=false;frame.hidden=true;}}
  finally{await loadingTask?.destroy().catch(()=>{});}
 },220);
}

function fitA4Page(){
 const frame=document.querySelector('.a4-document-frame'),paper=frame?.querySelector('.a4-paper:not([hidden])');if(!paper)return;
 const zoom=Number(frame.dataset.zoom)||1;frame.classList.toggle('preview-magnified',zoom>1);
 const width=Math.max(1,frame.clientWidth-24)*zoom;paper.style.width=width+'px';
 document.querySelectorAll('.preview-zoom-value').forEach(n=>n.textContent=Math.round(zoom*100)+'%');
}

function showA4Page(page){
 const frame=document.querySelector('.a4-document-frame');if(!frame)return;
 const pages=[...frame.querySelectorAll('.a4-paper')];page=Math.max(1,Math.min(pages.length,page));if(!pages.length)return;
 pages.forEach((paper,n)=>paper.hidden=n+1!==page);frame.dataset.currentPage=page;
 document.querySelectorAll('.a4-page-counter').forEach(n=>n.textContent=page+' / '+pages.length+'쪽');
 document.querySelectorAll('[data-preview-move="-1"]').forEach(n=>n.disabled=page===1);document.querySelectorAll('[data-preview-move="1"]').forEach(n=>n.disabled=page===pages.length);
 fitA4Page();
}
window.addEventListener('resize',fitA4Page);

function output(){
 const rows=hasConsent()?refusalSections():[];
 const docs=documentHTML(documentEditing);
 return `<div class="output-layout"><div class="stack output-settings"><section class="panel stack"><h2>문서 기본 설정</h2>${field('문서 제목','title',state.title,suggestedTitle(),false,true)}<div><button data-title>${hasConsent()?'제목 후보 적용':'고지서 제목 후보 적용'}</button></div>${field('제목 아래 안내사항','intro',state.intro,defaultIntro(),true,true)}<div><button data-intro>${hasConsent()?'안내사항 후보 적용':'고지사항 안내문 적용'}</button></div></section>
 ${hasConsent()?`<fieldset class="panel child-choice"><legend>만 14세 미만 아동 대상 여부${requiredMark}</legend><p class="muted">아동 대상이면 동의서에 법정대리인 동의·서명란을 추가합니다.</p><div class="actions"><label class="check"><input type="radio" name="child" required data-child value="yes" ${state.child?'checked':''}> 대상</label><label class="check"><input type="radio" name="child" required data-child value="no" ${state.child===false?'checked':''}> 대상 아님</label></div></fieldset>`:''}
 <section class="panel stack"><h2>동의 거부 시 불이익</h2>${rows.length?'<p class="muted">동의를 거부하거나 정보를 제공하지 않았을 때의 영향을 적어 주세요.</p>':''}${rows.length?rows.map(s=>field(sectionTitle(s)+(s.classification==='rnn'?' · 번호 미제공 시 안내':''),'refusals.'+s.k.replaceAll('.',':'),state.refusals[s.k],'해당하는 불이익 또는 안내 내용을 입력하세요.',true,true)).join(''):'<p class="not-applicable">동의를 받아 개인정보를 수집하지 않기 때문에 해당사항 없습니다.</p>'}</section>
</div>
 <section class="panel preview-panel"><div class="panelhead"><h2>A4 문서 미리보기</h2><div class="preview-edit-actions"><button data-toggle-document-edit aria-pressed="${documentEditing}">${documentEditing?'저장하기':'내용 직접 수정하기'}</button><button class="primary" data-finish ${docs?'':'disabled'}>완성하기</button></div></div><p class="notice" id="output-status" role="status"></p>${previewMarkup(docs||'<p>문서에 표시할 항목이 없습니다.</p>',documentEditing)}</section></div>`;
}
function validateDraft(){
 const missingRefusal=hasConsent()?refusalSections().find(s=>!state.refusals[s.k]?.trim()):null;
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
 const refusalCount=body.querySelectorAll('.doc-consent .doc-note').length,choiceCount=body.querySelectorAll('.doc-choice').length;
 const sharedValue=key=>[...body.querySelectorAll('[data-merge-keys]')].find(cell=>JSON.parse(cell.dataset.mergeKeys).includes(key))?.textContent.trim();
 const audit=consent.map(s=>{
  const scope=[...body.querySelectorAll('[data-consent-section]')].find(n=>n.dataset.consentSection===s.k);
  const items=[...body.querySelectorAll('[data-consent-items]')].find(n=>n.dataset.consentItems===s.k);
  const choice=scope?.querySelector('.doc-choice')?.textContent||'';
  const checks=[['수집·이용 목적',Boolean(sharedValue(s.k+'.purpose'))],['개인정보 항목',Boolean(items?.textContent.trim())],['보유·이용기간',Boolean(sharedValue(s.k+'.period'))],['동의 거부권',/동의.*거부할 수 있습니다/.test(scope?.querySelector('.doc-note')?.textContent||'')],['거부 시 불이익 또는 불이익 없음 안내',Boolean(scope?.querySelector('.doc-refusal-text')?.textContent.trim())]];
  if(s.key==='provide')checks.unshift(['제공받는 자',Boolean(sharedValue(s.k+'.recipient'))]);
  if(s.key==='provide')checks[checks.findIndex(c=>c[0]==='수집·이용 목적')][0]='제공받는 자의 이용 목적';
  checks.push(['독립된 동의·미동의 선택란',choice.includes('□ 동의')&&choice.includes('□ 미동의')]);
  if(s.key==='marketing')checks.push(['홍보·판매 권유 연락 사실',Boolean(scope?.querySelector('.doc-marketing')?.textContent.trim())]);
  checks.push(['동의란의 개인정보 구분명 표시',choice.includes(documentCategory(s))]);
  return {title:documentCategory(s),checks};
 });
 const items=[
  [consent.length?'필수 고지 항목 기재':'고지사항 기재',!missingCell&&refusalCount===consent.length&&audit.every(section=>section.checks.every(([,ok])=>ok))?'확인':'보완 필요',
   '목적, 항목, 보유·이용 기간, 해당 시 제공받는 자, 거부권·불이익 기재 여부를 확인합니다.'],
  ['동의란 구분',!consent.length?'해당 없음':choiceCount===consent.length?'확인':'보완 필요',
   '동의가 필요한 각 구분에 동의·미동의 표시가 있는지 확인합니다.'],
  ['법정대리인 동의란',state.child?(body.querySelector('.guardian-relationship')?'확인':'보완 필요'):'해당 없음',
   '아동 대상인 경우 법정대리인 서명란과 관계 기입란을 확인합니다.'],
  ['법적 근거와 동의 범위의 적정성','담당자 확인 필요',
   notices.length?'채택한 근거가 고지 항목에 실제로 적용되는지 확인해 주세요.':'동의가 필요한 처리 범위와 동의 방법이 적절한지 확인해 주세요.'],
  ['첨부 안내서 작성 기준','반영','동의·고지 분리, 수집 항목의 개인정보 유형 구분, 처리 목적별 동의와 중요 내용 강조를 반영했습니다. 개별 업무의 적법성 판단은 담당자 확인이 필요합니다.']
 ];
 if(rows.some(row=>row.classification!=='general'||row.key==='extra'||row.g.outside)){
  items.splice(4,0,['특수 처리 요건','담당자 확인 필요','민감정보, 고유식별정보 또는 목적 외 이용·제공에 해당하는 항목의 처리 요건과 근거를 확인해 주세요.']);
 }
 if(consent.some(row=>row.required==='선택')){
  items.splice(4,0,['선택 동의의 거부에 따른 영향','담당자 확인 필요','입력한 불이익 문구가 선택 동의 거부를 이유로 기본 서비스 제공을 제한하는지 확인해 주세요.']);
 }
 return {html,items,audit};
}
function finalPage(){
 const {items,html,audit=[]}=finalDocument;
 const pill=status=>`<span class="pill ${['확인','해당 없음','반영'].includes(status)?'':'pending'}">${status}</span>`;
 const row=([title,status,description])=>`<li><div><strong>${safe(title)}</strong> ${status==='담당자 확인 필요'?'':pill(status)}</div><p>${safe(description)}</p></li>`;
 const auditBody=choices=>audit.length?audit.map(section=>`<section><h3>${safe(section.title)}</h3><ul>${section.checks.filter(([label])=>/독립된 동의|동의란의/.test(label)===choices).map(([label,ok])=>`<li><label><input type="checkbox" disabled ${ok?'checked':''}>${safe(label)} <span>${ok?'확인':'보완 필요'}</span></label></li>`).join('')}</ul></section>`).join(''):'<p class="not-applicable">동의 항목이 없는 고지서입니다. 동의란 점검은 해당사항 없습니다.</p>';
 const collectionRisk=entries().some(contextualRisk);
 const pending=[...items.filter(([,status])=>!['확인','해당 없음','반영'].includes(status)),['과다 수집 가능성',collectionRisk?'담당자 확인 필요':'확인',collectionRisk?'수집 목적에 비해 과다 수집 가능성이 있습니다. 항목의 필요성은 담당자가 최종 판단해 주세요.':'간단한 점검에서 과다 수집 가능성이 적습니다. 목적에 필요한 항목인지 담당자가 최종 확인해 주세요.']];
 return `<div class="title"><h1 tabindex="-1">최종본</h1><p>최종본을 확인하고 저장하거나 인쇄하세요.</p></div>
 <div class="final-layout"><section class="panel final-review" aria-labelledby="final-review-title"><h2 id="final-review-title">최종 점검 결과</h2>
 <p class="muted">자동 점검은 기재 여부를 확인합니다. 법적 근거와 동의 범위의 적정성은 담당자가 확인해 주세요.</p>
 <section class="human-review"><h3>담당자가 확인할 사항</h3><ul>${pending.map(row).join('')}</ul></section>
 <details class="review-checks" data-audit-kind="fields"><summary><span class="review-check-title"><strong>${items[0][0]}</strong><span class="review-toggle" aria-hidden="true"></span>${pill(items[0][1])}</span><span class="review-check-description">${items[0][2]}</span></summary><div class="consent-audit">${auditBody(false)}</div></details>
 <details class="review-checks" data-audit-kind="choices"><summary><span class="review-check-title"><strong>동의란 구분</strong><span class="review-toggle" aria-hidden="true"></span>${pill(items[1][1])}</span><span class="review-check-description">${items[1][2]}</span></summary><div class="choice-audit">${auditBody(true)}</div></details>
 <ul>${items.slice(2).filter(([,status])=>['확인','반영'].includes(status)).map(row).join('')}</ul><a href="${reference}" target="_blank" rel="noopener">개인정보 보호법 원문</a><ul class="not-applicable-review">${items.slice(2).filter(([,status])=>status==='해당 없음').map(row).join('')}</ul></section>
 <section class="panel preview-panel final-preview"><div class="panelhead"><h2>A4 최종본</h2></div><div class="actions export"><button data-new-consent>새 동의서 만들기</button><button data-go="4">← 문서 수정</button><button data-pdf>PDF 저장</button><button data-hwpx>한글(HWPX) 저장</button><button class="primary" data-print>즉시 인쇄</button></div><p class="notice" id="output-status" role="status"></p>${previewMarkup(html)}</section></div>`;
}

function refreshPreview(){
 const preview=document.querySelector('#preview-docs');
 if(preview){preview.innerHTML=documentHTML(documentEditing);scheduleA4Preview();}
}

function render(){
 const before=new Map([...document.querySelectorAll('[data-item-row]')].map(n=>[n.dataset.itemRow,n.getBoundingClientRect()]));
 if(step<4){clearTimeout(a4PreviewTimer);a4PreviewVersion++;}
 document.querySelector('#homeNav').toggleAttribute('aria-current',step===0);
 document.querySelector('#workNav').toggleAttribute('aria-current',step!==0);
 if(!step){app.innerHTML=home();return;}
 if(step===5){app.innerHTML=finalPage();scheduleA4Preview();return;}
 const body=[basics,classify,grounds,output][step-1]();
 const all=entries();
 const issues=all.filter(({i})=>needsItemReview(i));
 const missing=all.filter(({g})=>!g.purpose.trim()||!g.period.trim()).length;
 app.innerHTML=`<div class="trail"><button data-go="0">홈</button> / 문서 작성</div><div class="title"><h1>${labels[step-1]}</h1><p>${descriptions[step-1]}</p></div><nav class="stepper" aria-label="작성 단계">${labels.map((name,n)=>`<button data-go="${n+1}" ${step===n+1?'aria-current="step"':''} ${n+1>reached||(n===3&&unresolvedRnn().length)?'disabled':''}><span class="stepnum">${String(n+1).padStart(2,'0')}</span>${name}</button>`).join('')}</nav><div class="workspace ${step===4?'wide-output':''}"><div class="stack">${body}<div class="notice" id="message" role="status">${safe(step===3&&state.groundDraft?'':message)}</div><div class="bar"><button data-go="${step-1}">← ${step===1?'홈으로':'이전 단계'}</button>${step<4?`<button class="primary" data-next ${step===3&&unresolvedRnn().length?'disabled aria-describedby="rrn-block"':''}>${step===2?'분류 확정 후 다음':step===3?'문서 작성으로':'다음 단계'} →</button>`:step===4?'<button class="primary" data-finish>완성하기 →</button>':''}</div></div>${step===4?'':`<aside class="side">${reviewStatus()}</aside>`}</div>`;
 const selectAll=document.querySelector('[data-scope-all]');if(selectAll){const checks=[...document.querySelectorAll('[data-scope]')];selectAll.indeterminate=checks.some(c=>c.checked)&&checks.some(c=>!c.checked);}
 if(step===1&&basicsChecked)showBasicsIssues();
 if(step===4)scheduleA4Preview();
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const node of document.querySelectorAll('[data-item-row]')){const old=before.get(node.dataset.itemRow);if(!old)continue;const now=node.getBoundingClientRect(),x=old.left-now.left,y=old.top-now.top;if(Math.abs(x)+Math.abs(y)>1)node.animate([{transform:`translate(${x}px,${y}px)`,backgroundColor:'#eaf1ff'},{transform:'translate(0,0)',backgroundColor:'transparent'}],{duration:320,easing:'cubic-bezier(.2,.7,.2,1)'});}
}

function contextualRisk({g,i}){
 const purpose=g.purpose.trim(), name=i.name;
 if(!purpose)return '';
 if(/추첨|응모|경품|이벤트|선물|증정|회원\s*가입|계정\s*(생성|등록)|뉴스레터|홍보/.test(purpose)&&(kind(i)==='sensitive'||/질병|진단|병력|건강|장애|복약|상담/.test(name)))return '현재 목적에서 건강 관련 항목이 필요한지 확인하세요. 참가자 선정에 쓰지 않는다면 제외를 검토하세요.';
 if(/추첨|응모|경품|이벤트|선물|증정|회원\s*가입|계정\s*(생성|등록)|뉴스레터|홍보|출석|만족도/.test(purpose)&&rnn(name))return '현재 목적에 주민등록번호가 필요한지 확인하세요. 별도의 처리 근거도 확인해야 합니다.';
 if(/회원\s*가입|계정\s*(생성|등록)|추첨|응모|경품|이벤트|선물|증정|뉴스레터|홍보/.test(purpose)&&kind(i)==='unique')return '현재 목적에 고유식별정보가 필요한지 담당자가 확인하세요.';
 if(/회원\s*가입|뉴스레터|홍보|만족도/.test(purpose)&&/계좌|상세주소|신분증/.test(name))return '현재 목적에 꼭 필요한 항목인지 확인하고 수집 범위를 줄일 수 있는지 검토하세요.';
 return '';
}
function riskHTML(issues,missing){
 const all=entries(),labels={collect:'개인정보 수집',extra:'목적 외 이용',provide:'제3자 제공',marketing:'홍보 또는 마케팅'};
 const checks=Object.entries(labels).filter(([key])=>all.some(e=>e.key===key)).map(([key,label])=>{const rows=all.filter(e=>e.key===key),hasPurpose=rows.every(e=>e.g.purpose.trim()),possible=rows.some(contextualRisk);return `<li class="${possible?'risk-possible':''}">${label}${hasPurpose?'에서 과다 수집 가능성이 '+(possible?'있습니다.':'적습니다.'):'의 목적을 입력하면 과다 수집 가능성을 점검합니다.'}</li>`;});
 return `<section class="risk-summary"><strong>과다 수집 가능성</strong><ul>${checks.join('')}</ul></section><section class="risk-classification"><strong>분류 확인 항목 ${issues.length}개</strong>${issues.map(({i})=>`<div>${safe(i.name)} · ${safe(hint(i))}</div>`).join('')}</section><section class="risk-purpose"><strong>목적·기간 확인 항목 ${missing}개</strong></section>`;
}
function reviewStatus(){
 const all=entries();return `<div class="review-status-header"><h3>검토 현황</h3><span class="pill">개인정보 항목 <span id="count">${all.length}</span>개</span></div><div id="risk">${riskHTML(all.filter(({i})=>needsItemReview(i)),all.filter(({g})=>!g.purpose.trim()||!g.period.trim()).length)}</div><p class="review-human-warning">최종 개인정보의 상세 분류와 법령 근거는 담당자가 직접 확인해야 합니다.</p><button class="review-guide" data-guide>이용 안내</button>`;
}

function refreshRisk(){
 const all=entries(), count=document.querySelector('#count');
 if(!count)return;
 count.textContent=all.length;
 document.querySelector('#risk').innerHTML=riskHTML(all.filter(({i})=>needsItemReview(i)),all.filter(({g})=>!g.purpose.trim()||!g.period.trim()).length);
}
async function go(n){
 if(n===5&&(step!==4||!finalDocument))return;
 if(n!==5)finalDocument=null;
 if(step===1&&n>1){if(!validateBasics())return;const previous=state;await checkSensitivity();if(state!==previous||step!==1)return;}
 if(n===4&&unresolvedRnn().length){feedback('주민등록번호의 수집·제공 근거와 제24조의2의 구체적 처리 허용 근거를 모두 확인해 주세요.');return;}
 if(n===2&&!state.groups[tab].enabled)tab=Object.keys(state.groups).find(k=>state.groups[k].enabled)||'collect';
 if(n===1){
  for(const [key,g] of Object.entries(state.groups)){
   if(g.enabled&&!g.items.length)add(key);
  }
 }
 basicsChecked=false;
 step=n;reached=Math.max(reached,Math.min(n,4));message='';render();window.scrollTo(0,0);
 if(n===1)scheduleSensitivity();
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
 lawSearch={busy:false,candidates:[],error:'',note:'입력 내용이 바뀌었습니다. 법령을 다시 검색하세요.',mode:lawSearch.mode,rejected:[],version:lawSearch.version+1};
 state.grounds=state.grounds.map(b=>({...b,ids:b.ids.filter(key=>!keys.has(key))})).filter(b=>b.ids.length);
 if(state.groundDraft)state.groundDraft=null;
 state.edits={};reached=Math.min(reached,step);
 syncGrounds();
}
function add(key,name='',required=false){
 const i={id:id(),name:standardItemName(name),required:key==='marketing'?false:required};state.groups[key].items.push(i);return i;
}
const quickTemplates = [
 {
  title:'용역·유지보수 인력 보안 및 출입 동의서',
  purpose:'용역·유지보수 인력의 출입 권한 발급·회수 및 출입 관리',
  period:'출입 권한 회수 완료 시까지',
  items:['성명','소속 기관명','업무용 연락처'],
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
  items:['성명','주민등록번호','은행명','계좌번호','예금주명'],
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
 lawSearch={busy:false,candidates:[],error:'',note:'',mode:'live',rejected:[],version:lawSearch.version+1};
 freshLawPicker();editorOpen=false;message='';
 state.title = template.title;
 state.groups.collect.purpose = template.purpose;
 state.groups.collect.period = template.period ?? '';
 template.items.forEach(name=>add('collect',name));
 tab='collect';reached=0;
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
 updateItemNameHelp(item);scheduleSensitivity();
 if(itemPresetNames.has(name)){
  const picker=input.parentElement.querySelector('[data-item-preset]');
  delete item.manualName;
  picker.value=name;const line=input.closest('.item-input-line');input.remove();line.classList.remove('manual-input-line');
  const trigger=line.querySelector('[data-item-menu]');trigger.innerHTML=safe(name)+' <span aria-hidden="true">⌄</span>';
  for(const option of line.querySelectorAll('[role=option]'))option.setAttribute('aria-selected',String(option.dataset.value===name));
  return trigger;
 }
 input.value=name;
 return input;
}
function setPath(path,value){
 if(path.startsWith('refusals.')){
  const key=path.slice(9).replaceAll(':','.');
  state.refusals[key]=value;return;
 }
 const parts=path.split('.');
 const object=parts.slice(0,-1).reduce((o,k)=>o[k],state);
 if(object[parts.at(-1)]===value)return;
 object[parts.at(-1)]=value;
 if(parts[0]==='groups'){invalidateItems(object.items);if(parts.at(-1).includes('Purpose')||parts.at(-1)==='purpose')scheduleSensitivity();}
 if(parts[0]==='groundDraft'&&['law','article','paragraph','clause','excerpt'].includes(parts.at(-1))){resetLawVerification(state.groundDraft);const editor=document.querySelector('.basis-selection');if(editor)editor.outerHTML=basisEditor(state.groundDraft);}
}
document.addEventListener('input',e=>{
 const el=e.target,d=el.dataset;
 if('lawQuery' in d)lawPicker.query=el.value;
 if(d.path&&el.type!=='checkbox')setPath(d.path,el.value);
 if(d.name){
  const i=getItem(d.name);
  i.name=el.value;delete i.kind;invalidateItems([i]);
  updateItemNameHelp(i);scheduleSensitivity();
 }
 if(d.edit){
  state.edits[d.edit]=el.innerText;
  const cell=el.closest('[data-merge-keys]');
  if(cell)for(const key of JSON.parse(cell.dataset.mergeKeys))state.edits[key]=el.innerText;
 }
 if(step===1&&(d.path||d.name)){
  document.querySelectorAll('.stepper button').forEach((b,n)=>b.disabled=n+1>reached);
  refreshRisk();
 }
 if(step===1&&basicsChecked&&(d.path||d.name))showBasicsIssues();
 if(step===4&&d.path)refreshPreview();
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
  app.querySelector(manual?`[data-name="${item.id}"]`:`[data-item-menu="${item.id}"]`).focus({preventScroll:true});
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
 if(d.required){const i=getItem(d.required);changeRequired(i,checked);invalidateItems([i]);render();document.querySelector(`[data-required="${d.required}"]`).focus();}
 if(d.kind){const i=getItem(d.kind);changeClassification(i,value);render();document.querySelector(`[data-kind="${d.kind}"]`)?.focus();}
 if('pickArticle' in d){lawPicker.article=value;lawPicker.paragraph='';lawPicker.clause='';setPickedCitation();}
 if('pickParagraph' in d){lawPicker.paragraph=value;lawPicker.clause='';setPickedCitation();}
 if('pickClause' in d){lawPicker.clause=value;setPickedCitation();}
 if('groundType' in d){freshLawPicker();state.groundDraft=groundInitial(value);editorOpen=true;render();}
 if('lawMode' in d){lawSearch.mode=value;lawSearch.candidates=[];lawSearch.error='';lawSearch.note='';lawSearch.rejected=[];render();}
 if('basisCode' in d)chooseBasis(value);
 if('includeAdmin' in d){lawPicker.includeAdmin=checked;lawPicker.version++;lawPicker.laws=[];lawPicker.hasNext=false;lawPicker.searchActive=false;lawPicker.cursor=null;lawPicker.total=null;render();}
 if('lawConditions' in d)state.groundDraft.conditionsConfirmed=checked;
 if('lawAuthority' in d)state.groundDraft.authorityConfirmed=checked;

 if('extraBasis' in d){const draft=state.groundDraft;draft.additionalBasisCodes=checked?[...new Set([...(draft.additionalBasisCodes||[]),d.extraBasis])]:additionalCodes(draft).filter(code=>code!==d.extraBasis);clearAiReview(draft);draft.specific=false;render();}
 if('scopeAll' in d){const draft=state.groundDraft;draft.specific=false;draft.ids=checked?applicableEntries(draft).map(({i})=>i.id):[];draft.additionalBasisCodes=additionalCodes(draft);clearAiReview(draft);draft.conditionsConfirmed=false;draft.authorityConfirmed=false;render();}
 if(d.scope){
  const draft=state.groundDraft;
  draft.ids=checked?[...draft.ids,d.scope]:draft.ids.filter(k=>k!==d.scope);draft.additionalBasisCodes=additionalCodes(draft);
  clearAiReview(draft);
  draft.conditionsConfirmed=false;draft.authorityConfirmed=false;
  if(rnn(getItem(d.scope).name))draft.specific=false;
  render();document.querySelector(`[data-scope="${d.scope}"]`)?.focus();
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
    const field=isManualItemName(item)?'data-name':'data-item-menu';
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
  if(control.matches('[data-name], [data-item-menu]'))control.parentElement.append(error);
  else control.after(error);
  control.setAttribute('data-basic-invalid','');
  if(!control.matches('button')||control.hasAttribute('data-item-menu'))control.setAttribute('aria-invalid','true');
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
function startBlankConsent(){
 clearTimeout(sensitivityTimer);state=newDraft();
 lawSearch={busy:false,candidates:[],error:'',note:'',mode:'live',rejected:[],version:lawSearch.version+1};
 freshLawPicker();editorOpen=false;documentEditing=false;finalDocument=null;basicsChecked=false;message='';tab='collect';reached=0;go(1);
}
function positionItemMenu(menu,trigger){const r=trigger.getBoundingClientRect(),height=window.visualViewport?.height||innerHeight,below=height-r.bottom-8,above=r.top-8,up=below<180&&above>below;menu.style.top=up?'auto':'calc(100% + 4px)';menu.style.bottom=up?'calc(100% + 4px)':'auto';menu.style.maxHeight=Math.min(180,Math.max(40,up?above:below))+'px';}
function closeItemMenus(){document.querySelectorAll('.item-options').forEach(menu=>menu.hidden=true);document.querySelectorAll('[data-item-menu]').forEach(button=>button.setAttribute('aria-expanded','false'));}
let itemDrag=null,touchDrag=null;
function dragTarget(target){return target?.closest('[data-drop-group],[data-item-row]');}
function validItemDrop(context,target){if(!target||context?.group!==(target.dataset.dropGroup||target.dataset.itemGroup))return false;const item=getItem(context.id),category=target.closest('[data-drop-category]')?.dataset.dropCategory;return step!==2||!category||Boolean(item&&canChangeClassification(item,category));}
function moveItemDrop(context,target,after=false){
 if(!validItemDrop(context,target))return false;
 const g=state.groups[context.group],item=g.items.find(i=>i.id===context.id);if(!item)return false;
 const category=target.closest('[data-drop-category]')?.dataset.dropCategory;
 if(step===2&&category&&entryClass({i:item})!==category&&!changeClassification(item,category))return false;
 const targetItem=g.items.find(i=>i.id===target.dataset.itemRow);
 if(targetItem&&targetItem!==item){
  if(step===1&&Boolean(item.required)!==Boolean(targetItem.required))return false;
  g.items=g.items.filter(i=>i!==item);g.items.splice(g.items.indexOf(targetItem)+(after?1:0),0,item);
 }
 sortRequired(g);state.edits={};render();document.querySelector(`[data-drag-item="${item.id}"]`)?.focus({preventScroll:true});return true;
}
document.addEventListener('dragstart',e=>{const handle=e.target.closest('[data-drag-item]');if(!handle)return;itemDrag={id:handle.dataset.dragItem,group:handle.dataset.dragGroup};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',itemDrag.id);});
document.addEventListener('dragover',e=>{const target=dragTarget(e.target);document.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));if(validItemDrop(itemDrag,target)){e.preventDefault();e.dataTransfer.dropEffect='move';target.classList.add('drag-over');}});
document.addEventListener('drop',e=>{const target=dragTarget(e.target);if(validItemDrop(itemDrag,target)){e.preventDefault();const r=target.getBoundingClientRect();moveItemDrop(itemDrag,target,e.clientY>r.top+r.height/2);}itemDrag=null;document.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));});
document.addEventListener('dragend',()=>{itemDrag=null;document.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));});
document.addEventListener('pointerdown',e=>{const handle=e.target.closest('[data-drag-item]');if(!handle||e.pointerType==='mouse')return;e.preventDefault();handle.setPointerCapture(e.pointerId);touchDrag={id:handle.dataset.dragItem,group:handle.dataset.dragGroup};});
document.addEventListener('pointermove',e=>{if(!touchDrag)return;const target=dragTarget(document.elementFromPoint(e.clientX,e.clientY));document.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));if(validItemDrop(touchDrag,target))target.classList.add('drag-over');});
document.addEventListener('pointerup',e=>{if(!touchDrag)return;const target=dragTarget(document.elementFromPoint(e.clientX,e.clientY));if(target){const r=target.getBoundingClientRect();moveItemDrop(touchDrag,target,e.clientY>r.top+r.height/2);}touchDrag=null;document.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));});
document.addEventListener('pointercancel',()=>{touchDrag=null;document.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));});
document.addEventListener('keydown',e=>{
 const grip=e.target.closest('[data-drag-item]');
 if(grip&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
  e.preventDefault();const group=grip.dataset.dragGroup,g=state.groups[group],item=getItem(grip.dataset.dragItem);
  if(step===2&&['ArrowLeft','ArrowRight'].includes(e.key)){const allowed=classificationGroups.filter(c=>canChangeClassification(item,c));const next=allowed[(allowed.indexOf(entryClass({i:item}))+(e.key==='ArrowRight'?1:allowed.length-1))%allowed.length];changeClassification(item,next);render();document.querySelector(`[data-drag-item="${item.id}"]`)?.focus();}
  else if(['ArrowUp','ArrowDown'].includes(e.key)){const peers=g.items.filter(i=>step===2?entryClass({i})===entryClass({i:item}):Boolean(i.required)===Boolean(item.required));const index=peers.indexOf(item)+(e.key==='ArrowDown'?1:-1),target=peers[index];if(target)moveItemDrop({id:item.id,group},document.querySelector(`[data-item-row="${target.id}"]`),e.key==='ArrowDown');}
 }
 const picker=e.target.closest('.item-picker');if(!picker)return;const menu=picker.querySelector('.item-options'),trigger=picker.querySelector('[data-item-menu]');
 if(e.key==='Escape'){closeItemMenus();trigger.focus();e.preventDefault();}
 if(e.key==='Tab')closeItemMenus();
 if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
  e.preventDefault();menu.hidden=false;trigger.setAttribute('aria-expanded','true');positionItemMenu(menu,trigger);const options=[...menu.querySelectorAll('[role=option]')];let n=options.indexOf(document.activeElement);n=e.key==='Home'?0:e.key==='End'?options.length-1:(n+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[n]?.focus();
 }
});

document.addEventListener('click',e=>{
 const summary=e.target.closest('.manual-ground>summary,.candidate-block>summary');
 if(summary){if(summary.parentElement.matches('.manual-ground'))editorOpen=!summary.parentElement.open;else{lawSearch.candidateOpen??={};lawSearch.candidateOpen[Number(summary.parentElement.dataset.candidate)]=!summary.parentElement.open;}}
 const group=e.target.closest('.law-options-group>summary');if(group){const type=group.parentElement.dataset.lawGroup;lawSearch.groupOpen??={};lawSearch.groupOpen[type]=!group.parentElement.open;if(!group.parentElement.open){e.preventDefault();lawSearch.showAlternatives??={};lawSearch.showAlternatives[type]=true;lawSearch.hidden=(lawSearch.hidden||[]).filter(n=>lawSearch.candidates[n]?.type!==type);render();} }
 if(!e.target.closest('.item-picker'))closeItemMenus();
 const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if(d.previewZoom){const frame=document.querySelector('.a4-document-frame');frame.dataset.zoom=d.previewZoom==='fit'?1:Math.max(.5,Math.min(2,Math.round(((Number(frame.dataset.zoom)||1)+Number(d.previewZoom))*10)/10));fitA4Page();return;}
 if('newConsent' in d){startBlankConsent();return;}
 if(d.previewMove){showA4Page(Number(document.querySelector('.a4-document-frame')?.dataset.currentPage||1)+Number(d.previewMove));return;}
 if(d.itemMenu){const menu=document.getElementById('item-options-'+d.itemMenu),open=menu.hidden;closeItemMenus();menu.hidden=!open;b.setAttribute('aria-expanded',String(open));if(open)positionItemMenu(menu,b);}
 if(d.selectItem){const select=document.querySelector(`[data-item-preset="${d.selectItem}"]`);select.value=d.value;select.dispatchEvent(new Event('change',{bubbles:true}));}

 if('retryClassification' in d)checkSensitivity(true);
 if('guide' in d)document.querySelector('#guide').showModal();
 if('start' in d){if(b.id==='workNav'){go(1);return;}if(hasDraftChanges()&&!confirm('현재 작성 중인 내용을 삭제하고 처음부터 새 동의서를 만드시겠습니까?'))return;startBlankConsent();return;}
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
  const i=add(d.add);render();app.querySelector(`[data-item-menu="${i.id}"]`).focus();
 }
 if(d.bulkRequired&&canSetRequired(d.bulkRequired)){
  const required=b.value==='required';
  const changed=state.groups[d.bulkRequired].items.filter(i=>i.required!==required);
  changed.forEach(i=>i.required=required);sortRequired(state.groups[d.bulkRequired]);
  if(changed.length){
   invalidateItems(changed);
   render();
   app.querySelector(`[data-bulk-required="${d.bulkRequired}"][value="${b.value}"]`).focus({preventScroll:true});
  }
 }
 if(d.delete){const item=getItem(d.delete);for(const g of Object.values(state.groups))g.items=g.items.filter(i=>i.id!==d.delete);invalidateItems([item]);render();}
 if('next' in d){
  if(step===2&&!entries().length){feedback('검토할 항목을 하나 이상 입력해 주세요.');return;}
  go(step+1);
 }
 if('catalogSearch' in d)searchCatalog();
 if('catalogRetry' in d)searchCatalog(1,Boolean(lawPicker.cursor));
 if('aiReview' in d)reviewGround();
 if('catalogLaw' in d)selectCatalogLaw(Number(d.catalogLaw));
 if('aiLaw' in d)findLaws();
 if('verifyLaw' in d)verifyGround();
 if('dismissLaw' in d){
  const n=Number(d.dismissLaw),key=candidateKey(lawSearch.candidates[n],n);
  state.grounds=state.grounds.filter(b=>b.candidateKey!==key);syncGrounds();state.edits={};
  lawSearch.dismissed??=[];if(!lawSearch.dismissed.includes(n))lawSearch.dismissed.push(n);lawSearch.hidden??=[];if(!lawSearch.hidden.includes(n))lawSearch.hidden.push(n);
  lawSearch.candidateOpen??={};lawSearch.candidateOpen[n]=false;
  if(state.groundDraft?.candidateKey===key){lawSearch.drafts??={};lawSearch.drafts[key]=structuredClone(state.groundDraft);state.groundDraft=null;}
  render();
 }
 if('showLaws' in d){lawSearch.showAlternatives??={};lawSearch.showAlternatives[d.showLaws]=true;render();}
 if('useLaw' in d){
  if(state.groundDraft?.candidateKey){lawSearch.drafts??={};lawSearch.drafts[state.groundDraft.candidateKey]=structuredClone(state.groundDraft);}
  const n=Number(d.useLaw),candidate=lawSearch.candidates[n],key=candidate?candidateKey(candidate,n):'';
  const applied=state.grounds.find(b=>b.candidateKey===key),pending=lawSearch.drafts?.[key];
  if(candidate){lawSearch.showAlternatives??={};lawSearch.showAlternatives[candidate.type]=false;freshLawPicker();lawSearch.candidateOpen??={};lawSearch.candidateOpen[n]=true;
   state.groundDraft=applied?{...applied,ids:[...applied.ids],editId:applied.id}:pending?structuredClone(pending):{...groundInitial(candidate.type),...candidate,ids:[],specific:false,conditionsConfirmed:false,authorityConfirmed:false,candidateKey:key};
   message='적용할 항목과 법령의 요건을 확인한 후 적용하세요.';render();document.querySelector('.candidate-editor')?.scrollIntoView({behavior:'smooth'});
  }
 }
 if('search' in d){state.search=!state.search;render();document.querySelector('[data-search]').focus();}
 if('addGround' in d){
  if(state.groundDraft?.candidateKey){lawSearch.drafts??={};lawSearch.drafts[state.groundDraft.candidateKey]=structuredClone(state.groundDraft);}
  const first=Object.keys(groundTypes).find(k=>k!=='optional'&&groundEntries(k).length);if(!first){feedback('선택 항목은 동의서로 작성합니다. 법령 근거를 추가할 개인정보 유형이 없습니다.');return;}
  freshLawPicker();editorOpen=true;state.groundDraft=groundInitial(first);message='';render();document.querySelector('[data-ground-type]').focus();
 }
 if(d.editGround){freshLawPicker();editorOpen=true;const saved=state.grounds.find(b=>b.id===d.editGround);state.groundDraft={...saved,ids:[...saved.ids],editId:saved.id,candidateKey:null};message='';render();document.querySelector('[data-ground-type]').focus();}
 if('cancelGround' in d){state.groundDraft=null;message='';render();document.querySelector('[data-add-ground]').focus();}
 if('adoptGround' in d)applyGround();
 if(d.removeGround){const removed=state.grounds.find(b=>b.id===d.removeGround);state.grounds=state.grounds.filter(b=>removed?.bundleId?b.bundleId!==removed.bundleId:b.id!==d.removeGround);if(state.groundDraft?.editId===d.removeGround)state.groundDraft=null;syncGrounds();state.edits={};message='채택을 취소했습니다.';render();}
 if('toggleDocumentEdit' in d){documentEditing=!documentEditing;render();}
 if('title' in d||'intro' in d){
  const key='title' in d?'title':'intro';
  state[key]=key==='title'?suggestedTitle():defaultIntro();
  document.querySelector(`[data-path="${key}"]`).value=state[key];refreshPreview();
 }
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
 const canReload=()=>!document.hidden&&step===0&&!hasDraftChanges()&&(quickDialog.open||!document.querySelector('dialog[open]'));
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
  link.href=url;link.download=(state.title.trim()||suggestedTitle()).replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').replace(/[. ]+$/,'').slice(0,120)+'.'+format;link.click();
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
function hwpxTable(table,paragraph,nextId,preview,cellRenderer){
 const rows=[...table.rows],width=42520,rowHeight=2500;
 const weights=[...rows[0].cells].map(cell=>['구분','처리 방식'].includes(cell.textContent.trim())?0.32:1);
 const total=weights.reduce((sum,weight)=>sum+weight,0);
 const widths=weights.map(weight=>Math.floor(width*weight/total));
 widths[widths.length-1]+=width-widths.reduce((sum,part)=>sum+part,0);
 const id=nextId();
 const cells=documentTableGrid(table).map((row,rowIndex)=>{
  const header=rowIndex===0;
  preview.push(row.map(({cell})=>cell.textContent.trim()).join(' | '));
  return `<hp:tr>${row.filter(entry=>entry.start===rowIndex).map(({cell,column,span})=>{
   const emphasis=!header&&(cell.tagName==='TH'||cell.querySelector('strong'));
   const content=cellRenderer?cellRenderer(cell,header):cell.textContent.trim().split(/\r?\n/).map(line=>paragraph(line,20,header?9:emphasis?7:0)).join('');
   return `<hp:tc name="" header="${Number(header)}" hasMargin="0" protect="0" editable="0" dirty="1" borderFillIDRef="${header||cell.tagName==='TH'?4:3}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${content}</hp:subList><hp:cellAddr colAddr="${column}" rowAddr="${rowIndex}"/><hp:cellSpan colSpan="1" rowSpan="${span}"/><hp:cellSz width="${widths[column]}" height="${rowHeight*span}"/><hp:cellMargin left="510" right="510" top="420" bottom="420"/></hp:tc>`;
  }).join('')}</hp:tr>`;
 }).join('');
 return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${widths.length}" cellSpacing="0" borderFillIDRef="3" noAdjust="0"><hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${rowHeight*rows.length}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="420" bottom="420"/>${cells}</hp:tbl></hp:run></hp:p>`;
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
 let header=files['Contents/header.xml'];
 header=header.replace(/breakNonLatinWord="BREAK_WORD"/g,'breakNonLatinWord="KEEP_WORD"');
 header=header.replace(/textColor="#(?:2E74B5|174DA1)"/g,'textColor="#2154C7"');
 header=header.replace(/<(hh:(?:left|right|top|bottom)Border) type="SOLID"[^>]*\/>/g,'<$1 type="SOLID" width="0.12 mm" color="#000000"/>');
 const paraIds=[...header.matchAll(/<hh:paraPr id="(\d+)"/g)].map(m=>Number(m[1]));
 const tableCenter=Math.max(...paraIds)+1,tableLeft=tableCenter+1,tableRight=tableCenter+2;
 const tableParagraphs=[[20,tableCenter],[21,tableLeft],[23,tableRight]].map(([base,id])=>header.match(new RegExp('<hh:paraPr id="'+base+'"[\\s\\S]*?<\\/hh:paraPr>'))[0].replace('id="'+base+'"','id="'+id+'"').replace(/<hh:lineSpacing[^>]*\/>/g,'<hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/>')).join('');
 header=header.replace(/(<hh:paraProperties itemCnt=")(\d+)(")/,(_,a,n,b)=>a+(Number(n)+3)+b).replace('</hh:paraProperties>',tableParagraphs+'</hh:paraProperties>');
 const charIds=[...header.matchAll(/<hh:charPr id="(\d+)"/g)].map(m=>Number(m[1]));
 const agencyStyle=Math.max(...charIds)+1,whiteUnderlineStyle=agencyStyle+1,marketingStyle=agencyStyle+2;
 const agencyBase=header.match(/<hh:charPr id="7"[\s\S]*?<\/hh:charPr>/)[0],underlineBase=header.match(/<hh:charPr id="8"[\s\S]*?<\/hh:charPr>/)[0];
 const agency=agencyBase.replace('id="7"',`id="${agencyStyle}"`).replace(/height="\d+"/,'height="1500"').replace(/textColor="[^"]+"/,'textColor="#000000"');
 const underline=underlineBase.replace('id="8"',`id="${whiteUnderlineStyle}"`).replace(/textColor="[^"]+"/,'textColor="#FFFFFF"');
 const marketing=agencyBase.replace('id="7"',`id="${marketingStyle}"`).replace(/height="\d+"/,'height="1000"');
 files['Contents/header.xml']=header.replace(/(<hh:charProperties itemCnt=")(\d+)(")/,(_,a,n,b)=>a+(Number(n)+3)+b).replace('</hh:charProperties>',agency+underline+marketing+'</hh:charProperties>');
 const cellRenderer=(cell,isHeader)=>{
  const lines=[[]];
  function visit(node){
   if(node.nodeType===3){const style=isHeader?9:node.parentElement.closest('.doc-important')?7:cell.tagName==='TH'?9:0;const parts=node.textContent.split(/\r?\n/);parts.forEach((text,n)=>{if(n)lines.push([]);if(text)lines[lines.length-1].push(run(text,style));});}
   else if(node.nodeType===1){if(node.tagName==='BR')lines.push([]);else for(const child of node.childNodes)visit(child);}
  }
  visit(cell);return lines.map(parts=>richParagraph(parts.join('')||run('',0),tableCenter)).join('');
 };
 const choiceTable=(question,choices)=>{
  const widths=[28520,14000],texts=[question,choices];
  const cells=texts.map((text,column)=>`<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="1" borderFillIDRef="1"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paragraph(text,column===0?tableLeft:tableRight,column===0?0:9)}</hp:subList><hp:cellAddr colAddr="${column}" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${widths[column]}" height="1800"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`).join('');
  return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="1" colCnt="2" cellSpacing="0" borderFillIDRef="1" noAdjust="0"><hp:sz width="42520" widthRelTo="ABSOLUTE" height="1800" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:tr>${cells}</hp:tr></hp:tbl></hp:run></hp:p>`;
 };
 const paragraphs=documents.flatMap(doc=>{let previous=null;return [...doc.querySelectorAll('h1,h3,table,p')].flatMap(node=>{
   const gap=(node.matches('h3,.guardian-heading,.sign > p:first-child,.doc-agency')&&previous&&!previous.matches('.doc-intro'))?[paragraph('',0,0),...(node.matches('.doc-agency')?[paragraph('',0,0)]:[])]:[];previous=node;
   const finish=content=>[...gap,...(Array.isArray(content)?content:[content]),...(node.matches('h1,.doc-intro,.signature-date')?[paragraph('',0,0)]:[])];
   if(node.matches('table'))return finish(hwpxTable(node,paragraph,nextId,preview,cellRenderer));
   if(node.matches('.doc-choice')){
    const [question,choices]=[...node.children].map(child=>child.textContent);
    preview.push(question+' '+choices);
    return finish(choiceTable(question,choices));
   }
   const line=node.querySelector('.signature-line');
   if(line){
    const [before,after]=node.textContent.split(line.textContent);
    preview.push(before+after);
    return finish(richParagraph(run(before,0)+run('　'.repeat(node.matches('.guardian-relationship')?6:9)+'.',whiteUnderlineStyle)+run(after,0),23));
   }
   const title=node.matches('h1');
   const note=node.matches('.doc-note');
   const text=node.matches('.doc-choice')?[...node.children].map(child=>child.textContent).join('   '):node.textContent;
   const align=title||node.matches('.doc-agency')?20:note?21:node.closest('.sign')?23:0;
   const style=title?5:node.matches('.doc-agency')?agencyStyle:node.matches('.doc-marketing')?marketingStyle:node.matches('h3')?7:0;
   return finish(text.split(/\r?\n/).map(line=>{preview.push(line);return paragraph(line,align,style);}));
  });});
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

document.addEventListener('toggle',e=>{if(e.target.matches('.manual-ground')){editorOpen=e.target.open;e.target.querySelector('summary').textContent='법령·처리 근거 추가';}if(e.target.matches('.candidate-block')){lawSearch.candidateOpen??={};lawSearch.candidateOpen[Number(e.target.dataset.candidate)]=e.target.open;}},true);
document.addEventListener('scroll',e=>{const box=e.target;if(box.matches?.('.catalog-results')&&box.scrollTop>0&&box.scrollTop+box.clientHeight>=box.scrollHeight-24&&lawPicker.hasNext&&!lawPicker.loading&&!lawPicker.failed)searchCatalog(1,true);},true);

document.addEventListener('wheel',e=>{const box=e.target.closest?.('.catalog-results');if(box&&e.deltaY>0&&box.scrollTop+box.clientHeight>=box.scrollHeight-24&&lawPicker.hasNext&&!lawPicker.loading&&!lawPicker.failed)searchCatalog(1,true);},{passive:true});

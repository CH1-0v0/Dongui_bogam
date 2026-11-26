"""Stateless work interview: official sources and explicit user answers only."""
import hashlib
import json
import re
from pathlib import Path

POLICY = json.loads((Path(__file__).parent / 'cloudflare/assistant-policy.json').read_text())
DEFAULTS = json.loads((Path(__file__).parent / 'cloudflare/work-defaults.json').read_text())
REF_KEYS = ('law', 'article', 'paragraph', 'clause', 'basisCode', 'type')
def clean(value, limit=500):
    return value.strip()[:limit] if isinstance(value, str) else ''
def norm(value):
    import unicodedata
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', str(value or '')))
def classification(value):
    name = norm(value)
    return 'rnn' if re.search('주민등록번호|주민번호', name) else 'unique' if re.search('여권|운전면허|외국인등록', name) else 'sensitive' if re.search('종교|사상|신념|성생활|정치|노동조합|정당|건강|진료|유전|범죄|병력|진단|질병|장애|상담|생체|인종|민족|복약|심리|지문|안면|증상|치료|처방|수술|투약|처치|입원|외래|의학|검사결과|맥박|혈압|체온|의료|신체|혈액|가족력', name) else 'general'
def work_draft(answer,business='',user_text=''):
    draft = answer.get('draft') if isinstance(answer.get('draft'),dict) else {}
    rows = draft.get('items') if isinstance(draft.get('items'),list) else []
    payment=bool(re.search(DEFAULTS['paymentSignals'],business))
    if payment:rows=rows+[{'name':n,'required':True} for n in DEFAULTS['paymentItems']]
    excluded={r.get('name') for r in answer.get('removeItems',[]) if isinstance(r,dict) and r.get('quote') and norm(r['quote']) in norm(user_text) and re.search(r'제외|삭제|않|안\s*(?:수집|처리|제공)|불필요',r['quote'])} if isinstance(answer.get('removeItems'),list) else set()
    items = {}
    for row in rows[:60]:
        if not isinstance(row,dict):continue
        name=clean(row.get('name'),100)
        if not name or name in items or name in excluded or classification(name)=='rnn' or re.search(r'\d{6}[ -]?[1-8]\d{6}|@|01[016789][ -]?\d{3,4}[ -]?\d{4}',name):continue
        items[name]={'name':name,'required':row.get('required') is True,'classification':classification(name),'origin':'draft'}
    period=draft.get('period') if isinstance(draft.get('period'),dict) else {}
    value=clean(period.get('value'),300)
    use_default=payment and re.search(DEFAULTS['publicSignals'],business+' '+user_text) and (not value or re.fullmatch(r'확인\s*필요|미정|미확인|알\s*수\s*없음',value))
    return {'suggestedItems':list(items.values())[:30],'suggestedPeriod':DEFAULTS['publicPaymentPeriod'] if use_default else value,'suggestionReason':DEFAULTS['periodReason'] if use_default else clean(period.get('reason'),500)}

def has_choice_meaning(q):
    return bool(re.search(r'O\s*[:：].+/\s*X\s*[:：]',q))
def check_to_choice_question(check):
    text=re.sub(r'[.。]+$','',str(check or '').strip())
    if not text:return ''
    if has_choice_meaning(text):return text
    body=re.sub(r'[?？]$','',re.sub(r'\s*(?:여부(?:를|도)?\s*)?(?:추가\s*)?(?:확인|검토)(?:\s*필요|이\s*필요합니다|해\s*주세요|하세요)?$','',text))
    if body.endswith('인지'):q=body[:-2]+'인가요?'
    elif body.endswith('한지'):q=body[:-2]+'한가요?'
    elif body.endswith('는지'):q=body[:-2]+'나요?'
    elif re.search(r'(?:나요|가요|까요|니까)$',body):q=body+'?'
    else:q='다음에 해당하나요? '+body
    return q+' O: 해당 / X: 해당하지 않음'
def resident_choice_questions(check,relevant):
    if not relevant or not check or check.get('status')!='needs_information':return []
    return list(dict.fromkeys(q for q in map(check_to_choice_question,check.get('checks') or []) if q))[:3]
def consolidate_questions(questions):
    groups={}
    for q in questions:
        if has_choice_meaning(q) and not re.match(r'(?:초안의 개인정보 항목|보유·이용기간은 초안)',q):
            groups['choice:'+q]=[q];continue
        if re.search(r'(?:법적근거|법령|조문|처리.*근거).*(?:있나요|알려|제시|제공)',q):continue
        if re.search(r'기관명|기관의?\s*(?:이름|명칭)|어느 기관',q):continue
        category='permission' if re.search(r'주민등록번호|민감정보|처리.*근거',q) else 'period' if re.search(r'보유|보존|기간|기산점',q) else 'agency' if re.search(r'기관|제공받',q) else 'items' if re.search(r'항목|개인정보|계좌|은행|예금주',q) else 'other'
        groups.setdefault(category,[])
        if q not in groups[category]:groups[category].append(q)
    return [DEFAULTS['questionPeriod'] if k=='period' else DEFAULTS['questionItems'] if k=='items' else DEFAULTS['questionPermission'] if k=='permission' else max(rows,key=len) if k=='agency' or k.startswith('choice:') else ' '.join(rows) for k,rows in groups.items()][:5]

def irrelevant_income_source(proof,user_messages):
    types=['기타소득','사업소득','근로소득','퇴직소득','연금소득','이자소득','배당소득']
    latest=next((t for t in reversed(user_messages) if any(k in t for k in types)), '')
    declared=[k for k in types if k in latest]
    match=re.search(r'제\d+조(?:의\d+)?[（(]([^）)]+)[）)]',proof.get('articleExcerpt') or proof.get('excerpt',''))
    title=proof.get('articleTitle') or (match[1] if match else '')
    if re.search('가산세|과태료|벌칙',title):return True
    return proof.get('law')=='소득세법' and len(declared)==1 and any(k!=declared[0] and k in title for k in types) and declared[0] not in title

def compact_cites(cites):
    """Write the law name once per law: "의료법 제14조, 제16조"; 의료법 and 의료법 시행령 stay separate."""
    groups={}
    for raw in cites:
        text=str(raw or '').strip()
        if not text:continue
        m=re.match(r'^(.+?)\s+(제\d.*)$',text)
        law,rest=(m.group(1),m.group(2)) if m else (text,'')
        parts=groups.setdefault(law,[])
        if rest not in parts:parts.append(rest)
    return ', '.join(law+' '+', '.join(p for p in parts if p) if any(parts) else law for law,parts in groups.items())
def applicable_ground_summary(grounds):
    general=list(dict.fromkeys(g['cite'] for g in grounds if g['basisCode'] not in ['residentLaw','sensitiveLaw','uniqueLaw'] and g.get('itemNames')))
    return ' 일반 수집·이용에 적용 예정인 근거: '+compact_cites(general)+'.' if general else ' 일반 수집·이용에 적용할 근거는 현재 조회 결과에서 아직 확인하지 못했습니다.'

SUPPLEMENT_CODES=['residentLaw','sensitiveLaw','uniqueLaw']
def law_family(law):
    return re.sub(r'(?:시행령|시행규칙)$','',norm(law))
def link_resident_grounds(grounds,proposed_grounds=None):
    """A confirmed RNN permission plus a confirmed general basis of the same work covers the RNN item."""
    proposed_grounds=proposed_grounds if proposed_grounds is not None else []
    resident=[g for g in grounds if g.get('basisCode')=='residentLaw' and '주민등록번호' in g.get('itemNames',[])]
    if not resident:return grounds
    general=[g for g in grounds if g.get('basisCode') not in SUPPLEMENT_CODES and g.get('itemNames')]
    if any('주민등록번호' in g['itemNames'] for g in general):return grounds
    families={law_family(g.get('law')) for g in resident}
    same=[g for g in general if law_family(g.get('law')) in families]
    targets=same or general
    for g in targets:g['itemNames']=g['itemNames']+['주민등록번호']
    linked={g.get('cite') for g in targets}
    for g in proposed_grounds:
        if g.get('cite') in linked and g.get('basisCode') not in SUPPLEMENT_CODES:g['itemNames']=[n for n in g['itemNames'] if n!='주민등록번호']
    proposed_grounds[:]=[g for g in proposed_grounds if g.get('itemNames')]
    return grounds
def resident_summary(check,grounds):
    general=list(dict.fromkeys(g.get('cite') for g in grounds if g.get('basisCode') not in SUPPLEMENT_CODES and '주민등록번호' in g.get('itemNames',[])))
    if check.get('status')=='confirmed':
        return '주민등록번호는 처리할 수 있습니다. 구체적 허용 근거를 확인했습니다: '+str(check.get('cite',''))+('. 일반 수집·이용 근거: '+compact_cites(general)+'. 두 근거를 함께 입력했습니다.' if general else '. 일반 수집·이용 근거는 3단계에서 함께 확인해 주세요.')
    if check.get('status')=='unavailable':return '주민등록번호 근거가 없다는 판단이 아니라, 원문 조회를 완료하지 못한 상태입니다.'
    checks=check.get('checks') or []
    return '주민등록번호의 구체적 허용 근거'+('('+check['cite']+')' if check.get('cite') else '')+'가 현재 업무에 적용되는지 확정하지 못했습니다.'+(' 아래 O/X 질문에 답해 주시면 다시 확인합니다.' if checks else '')
FOLLOW_UP_LIMIT=3
QUESTIONS_DONE_NOTE=" 추가로 확인할 질문은 없습니다. 아래 '이 내용으로 계속'을 누르면 문서 작성으로 이동합니다."
def question_key(q):
    return re.sub(r'[\s?？.]','',re.sub(r'\s*O\s*[:：].*$','',str(q or ''),flags=re.S))
def finish_questions(questions,messages,resident_confirmed=False,items_missing=False,period_missing=False):
    """An answered question is not asked again; after three answers only questions filling an empty field remain."""
    users=[str(m.get('content') or '') for m in messages if m.get('role')=='user']
    answered={question_key(m) for t in users for m in re.findall(r'질문:\s*([^\n]+)',t)}
    period_answered=any(re.search(r'보유 및 이용기간[:：].*(?:그대로 사용|변경)',t) for t in users)
    items_answered=any(re.search(r'개인정보 항목[:：].*(?:그대로 사용|변경)',t) for t in users)
    limit_reached=len(users)-1>=FOLLOW_UP_LIMIT
    result=[]
    for q in questions:
        k=question_category(q)
        if question_key(q) in answered:continue
        if resident_confirmed and re.search(r'원천징수의무자|주민(?:등록)?번호|불가피',q):continue
        if k=='period' and period_answered and not period_missing:continue
        if k=='items' and items_answered and not items_missing:continue
        if limit_reached and not (k=='items' and items_missing or k=='period' and period_missing or '제공받는 기관' in q):continue
        result.append(q)
    return result
def kept_period_choice(user_text):
    """The user's explicit "keep this period" choice is a user-entered value and must survive later turns."""
    line=next((t for t in reversed(str(user_text or '').split('\n')) if re.search(r'보유\s*및\s*이용기간[:：].+현재 기간을 그대로 사용합니다',t)),'')
    m=re.search(r'보유\s*및\s*이용기간[:：]\s*(.+?)\.?\s*현재 기간을 그대로 사용합니다',line)
    value=clean(m.group(1),300) if m else ''
    return {'value':value,'sourceId':'user','quote':line[:1500]} if re.search(r'[0-9가-힣A-Za-z]',value) else None
def period_value(value):
    """Drop a document label before the period ("진료기록부 : 10년" -> "10년"); start points such as "…부터 10년" stay."""
    text=clean(value,300)
    stripped=re.sub(r'^[^:：\d]{1,30}[:：]\s*','',text)
    return stripped if re.search(r'\d',stripped) else text
def retention_source_for(value, source_id, sources):
    """A period value the AI could not quote exactly, but which appears in a verified retention provision."""
    v=norm(value)
    if not v or len(v)>40:return None
    has=lambda s:v in norm(s['text']) and re.search(r'보존|보유|보관',s['text'])
    return next((s for s in sources if s['id']==source_id and has(s)),None) or next((s for s in sources if has(s)),None)
def law_period_suggestion(value, cite, reason):
    """A period quoted from the law whose application is not yet confirmed becomes an editable draft."""
    text=(cite+'에서 찾은 보유기간입니다. ' if cite else '법령 원문에서 찾은 보유기간입니다. ')+(clean(reason,300)+' ' if clean(reason,300) else '')+'적용 대상 서류와 기산점을 확인해 수정해 주세요.'
    return {'suggestedPeriod':period_value(value),'suggestionReason':clean(text,500)}
def question_category(q):
    return 'permission' if re.search(r'주민등록번호|주민번호|민감정보|처리.*근거',q) else 'period' if re.search(r'보유|보존|기간|기산점',q) else 'items' if re.search(r'항목|개인정보|계좌|은행|예금주',q) else 'other'

def ref_fingerprint(business, kind, refs, facts, flow):
    return hashlib.sha256(json.dumps([business, kind, refs, facts, flow], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
def work_plan(data, api):
    business, kind = clean(data.get('business'), 1500), data.get('type', 'collect')
    messages = data.get('messages')
    if len(business) < 4 or kind not in ('collect', 'provide', 'outside') or not isinstance(messages, list) or len(messages) > 10:
        raise api.ApiError('업무 설명과 대화 형식을 확인해 주세요.', 400)
    for message in messages:
        if not isinstance(message, dict) or message.get('role') not in ('user', 'assistant') or not isinstance(message.get('content'), str) or len(message['content']) > 1500:
            raise api.ApiError('대화 형식을 확인해 주세요.', 400)
    flow = data.get('flow') if data.get('flow') in ['collect','extra','provide'] else 'provide' if kind=='provide' else 'extra' if kind=='outside' else 'collect'
    manual = data.get('manual') if isinstance(data.get('manual'), dict) else {}
    manual = {k: clean(manual.get(k)) for k in ('agency','items','period','recipient')}
    user_text = '\n'.join([business] + [m['content'] for m in messages if m['role'] == 'user'] + list(manual.values()))
    for i in range(0, len(user_text), 400):
        api.validate_context({'items':[{'name':'업무 설명','purpose':user_text[i:i+450],'type':kind,'context':kind,'classification':'general'}]})
    if not api.os.environ.get('OPENROUTER_API_KEY') or not api.os.environ.get('LAW_API_OC'):
        raise api.ApiError('AI 및 공식 법령 연결 설정을 확인해 주세요.',503)
    review_purpose = '\n'.join([('처리: 목적 외 제공' if kind=='outside' else '처리: 제3자 제공') if flow=='provide' else '처리: 목적 외 이용' if flow=='extra' else '처리: 수집·이용',business[:500]] + [m['content'][:250] for m in messages if m['role']=='user'][-3:] + [manual['agency']])[:1500]
    recent_users=[m for m in messages if m['role']=='user']
    latest_user=recent_users[-1]['content'] if recent_users else ''
    asks_ground=bool(re.search(r'근거|법령|수집.*가능',latest_user) and re.search(r'[?？]|나요|가요|까요|습니까|정말|궁금|확인해|알려',latest_user))
    search_purpose='\n'.join([business[:170]]+[m['content'][:150] for m in recent_users[-2:]])[:500]
    context = {'additionalAnswers':[m['content'] for m in recent_users[-4:]],'items':[{'name':name,'purpose':search_purpose,'recipient':manual['recipient'],'type':kind,'context':kind,'classification':classification(name)} for name in ['성명','주민등록번호','건강정보']]}
    discovery_failures = []
    previous = {'items':[], 'period':None}
    def quote_window(quote,value,limit=250):
        text=norm(clean(quote,1500));at=text.find(norm(value));at=text.find('주민번호') if at<0 and classification(value)=='rnn' else at;start=max(0,at-40)
        return text[start:start+limit]
    def fact_item(i):return {'name':clean(i.get('name'),100),'required':i.get('required') is True,'sourceId':clean(i.get('sourceId'),20),'quote':quote_window(i.get('quote'),i.get('name'))}
    def fact_period(i):return {'value':clean(i.get('value'),300),'sourceId':clean(i.get('sourceId'),20),'quote':quote_window(i.get('quote'),i.get('value'),400)} if isinstance(i,dict) else None
    if data.get('evidenceToken'):
        if not isinstance(data.get('evidenceRefs'), list) or len(data['evidenceRefs']) > 8 or not all(isinstance(r,dict) for r in data['evidenceRefs']):
            raise api.ApiError('원문 확인 정보를 다시 확인해 주세요.', 400)
        refs = [{k:clean(r.get(k),100) for k in REF_KEYS} for r in data['evidenceRefs']]
        if data.get('evidenceFacts'):
            facts = data['evidenceFacts']
            if not isinstance(facts,dict) or not isinstance(facts.get('items'),list) or len(facts['items'])>30 or not all(isinstance(i,dict) for i in facts['items']):raise api.ApiError('이전 입력 정보를 확인해 주세요.',400)
            previous = {'items':[fact_item(i) for i in facts['items']],'period':fact_period(facts.get('period'))}
        fp = ref_fingerprint(business,kind,refs,previous,flow)
        try:api.verify_review_token((api.os.environ.get('OPENROUTER_API_KEY','')+':work-state-v2').encode(), data['evidenceToken'], fp)
        except api.ApiError:api.verify_review_token(api.os.environ.get('OPENROUTER_API_KEY','').encode(), data['evidenceToken'], fp, grace=86100)
        previous['items']=[dict(i,name='주민등록번호') if classification(i['name'])=='rnn' else i for i in previous['items']]
    else:
        refs = []
    research_material = None
    if not refs or data.get('refresh') is True or (messages and messages[-1]['role']=='user'):
        planned = api.ai_candidates(context, {'assistant':True})
        research = planned.get('research') or {}
        research_material = {'report':clean(research.get('report'),6000),'sources':[{'url':s.get('url'),'title':clean(s.get('title'),200),'excerpt':clean(s.get('excerpt'),500)} for s in research.get('sources',[])[:8]]}
        discovery_failures = planned.get('rejected',[])
        found = list({(c.get('law'),c.get('article'),c.get('basisCode'),c.get('type')):{k:clean(c.get(k),100) for k in REF_KEYS} for c in planned['candidates'] if not c.get('discoveryError')}.values())[:8]
        def identity(ref):return tuple(ref[k] for k in ['law','article','basisCode','type'])
        protected_ids={i['sourceId'] for i in previous['items']}|({previous['period']['sourceId']} if previous['period'] else set())
        for ref in found:
            if any(identity(r)==identity(ref) for r in refs):continue
            if len(refs)<8:refs.append(ref)
            else:
                replace=next((i for i,r in enumerate(refs) if 'S'+str(i) not in protected_ids and not any(identity(n)==identity(r) for n in found)),None)
                if replace is not None:refs[replace]=ref
    sources, failures = [], [{'law':r.get('law',''),'reason':r.get('reason','unavailable')} for r in discovery_failures]
    focus_resident=bool(re.search(r'주민(?:등록)?번호',user_text) or any(classification(i['name'])=='rnn' for i in previous['items']))
    discovery_config=json.loads((Path(__file__).parent/'cloudflare/evidence-discovery.json').read_text())
    identifier_laws=[law for profile in discovery_config['profiles'] if re.search(profile['signals'],search_purpose) for law in profile.get('identifierLaws',[])]
    def priority(entry):
        ref=entry[1]
        return (0 if ref['law'] in identifier_laws else 1) if ref['basisCode']=='residentLaw' else 3 if ref['basisCode'] in ['sensitiveLaw','uniqueLaw'] else 2
    verification_order=sorted(enumerate(refs),key=priority) if focus_resident else enumerate(refs)
    for index, ref in verification_order:
        try:
            try:
                proof = api.verify_with_basis(ref)
            except api.ApiError as error:
                if (ref['paragraph'] or ref['clause']) and re.search(r'요청한 항|요청한 호|조·항·호 번호',str(error)):
                    article_ref = dict(ref,paragraph='',clause='')
                    proof = api.verify_with_basis(article_ref)
                    refs[index] = article_ref
                else:raise
            sources.append({'id':'S'+str(index), 'proof':proof, 'text':proof.get('articleExcerpt') or proof.get('paragraphExcerpt') or proof['excerpt']})
        except api.ApiError as error:
            failures.append({'law':ref['law'],'reason':'unavailable' if error.status >= 500 else 'not_verified'})
    for source in list(sources):
        for basis_code, pattern in [('residentLaw',r'주민등록번호'),('sensitiveLaw',r'민감정보|건강에\s*관한\s*정보')]:
            proof=source['proof']
            if len(refs)>=8 or proof.get('kind') not in ['법률','대통령령'] or not re.search(pattern,source['text']) or any(r['law']==proof.get('law') and r['article']==proof.get('article') and r['basisCode']==basis_code for r in refs):continue
            ref={k:clean(proof.get(k),100) for k in REF_KEYS};ref.update(basisCode=basis_code,type=kind)
            index=len(refs);refs.append(ref)
            try:
                actual=api.verify_with_basis(ref)
                sources.append({'id':'S'+str(index),'proof':actual,'text':actual.get('articleExcerpt') or actual['excerpt']})
            except api.ApiError as error:failures.append({'law':ref['law'],'reason':'unavailable' if error.status>=500 else 'not_verified'})
    if not sources and not previous['items'] and not previous['period']:refs=[]
    def checkpoint(facts):
        import time
        return {'evidenceRefs':refs,'evidenceFacts':facts,'evidenceToken':api.create_review_token((api.os.environ.get('OPENROUTER_API_KEY','')+':work-state-v2').encode(),ref_fingerprint(business,kind,refs,facts,flow),ttl=86400),'evidenceExpiresAt':int(time.time()*1000)+86400000}
    if not sources and failures and (previous['items'] or previous['period']):
        return dict({'agency':manual['agency'],'purpose':business,'shortPurpose':'','recipient':manual['recipient'],'items':[],'period':'','periodOrigin':'','grounds':[],'verifiedSources':[],'retainedItems':[dict(i,classification=classification(i['name']),origin='user' if i['sourceId']=='user' else 'law') for i in previous['items']],'retainedPeriod':previous['period']['value'] if previous['period'] else '', 'incomplete':True,'reply':'공식 원문을 재확인하지 못했습니다. 이전에 확인한 항목과 기간은 지우지 않고 보관했습니다.','questions':['잠시 후 근거를 다시 확인해 주세요. 항목을 다시 입력하실 필요는 없습니다.'],'failures':failures,'residentCheck':{'status':'unavailable','checks':['공식 원문 재확인 필요']},'checkedAt':0,'legalChecked':False},**checkpoint(previous))
    answer = api.discovery_json(POLICY['prompt'], {'business':business,'type':kind,'flow':flow,'messages':messages,'manual':manual,'research':research_material,'previousFacts':previous,'sources':[{'id':s['id'],'cite':s['proof'].get('cite'),'text':s['text'][:11000]} for s in sources]}, field='plan', max_tokens=4500)
    if not isinstance(answer.get('items'), list) or len(answer['items']) > 30 or not isinstance(answer.get('period'),dict):
        raise api.ApiError('업무 정리 응답을 읽지 못했습니다. 다시 시도하세요.',502)
    def supported(value, claim):
        quote = clean(claim.get('quote'),1500)
        source = next((s for s in sources if s['id'] == claim.get('sourceId')),None)
        return bool(quote and norm(value).replace('주민번호','주민등록번호') in norm(quote).replace('주민번호','주민등록번호') and (norm(quote) in norm(user_text) if claim.get('sourceId') == 'user' else source and norm(quote) in norm(source['text'])))
    removed = {i.get('name') for i in answer.get('removeItems',[]) if isinstance(i,dict) and norm(clean(i.get('quote'),500)) in norm(user_text) and norm(i.get('name')).replace('주민번호','주민등록번호') in norm(i.get('quote')).replace('주민번호','주민등록번호') and re.search(r'제외|삭제|않|안\s*(?:수집|처리|제공)|불필요',i.get('quote',''))} if isinstance(answer.get('removeItems'),list) else set()
    removed={'주민등록번호' if classification(n)=='rnn' else n for n in removed}
    resident_line=next((t for t in reversed(user_text.split('\n')) if re.search(r'주민(?:등록)?번호',t)), '')
    requested_resident={'name':'주민등록번호','required':True,'sourceId':'user','quote':resident_line[:1500]} if (re.search(r'주민(?:등록)?번호.{0,40}(?:수집(?:해야|하고|합니다|할|하려|이필요)|처리(?:해야|할예정|할계획|합니다|한다|하고|하려|할것|할거|할게)|사용(?:합니다|한다|하고|하려|할)|필수|필요|추가|포함|가능|되나|될까|되는지|할수있|받아도|받을수)',norm(resident_line)) or re.search(r'주민(?:등록)?번호',manual['items'])) and not re.search(r'제외|삭제|불필요|안\s*(?:수집|처리)|(?:수집|처리|사용)(?:하지|할필요가)\s*(?:않|없)',norm(resident_line)) else None
    proposed = ([requested_resident] if requested_resident else []) + [i for i in previous['items'] if i['name'] not in removed and (i['sourceId']=='user' or supported(i['name'],i))] + [i for i in answer['items'] if isinstance(i,dict) and clean(i.get('name'),100) and supported(clean(i.get('name'),100),i)]
    proposed=[dict(i,name='주민등록번호') if classification(i['name'])=='rnn' else i for i in proposed]
    def item_class(i):
        value = classification(i['name'])
        if value != 'general':return value
        source = next((s for s in sources if s['id']==i.get('sourceId')),None)
        medical = bool(source and source['proof'].get('law','').startswith('의료법') or re.search('진료|의료기관|환자',business))
        identity = re.fullmatch(r'(?:환자(?:의)?)?(?:성명|이름|주소|연락처|전화번호|휴대전화번호|생년월일|성별|연령|나이|직업|국적|환자번호|등록번호)',norm(i['name']))
        return 'sensitive' if medical and not identity else 'general'
    items = list({clean(i.get('name'),100):{'name':clean(i.get('name'),100),'required':i.get('required') is True,'classification':item_class(i),'sourceId':i.get('sourceId'),'origin':'user' if i.get('sourceId')=='user' else 'law'} for i in proposed if isinstance(i,dict) and clean(i.get('name'),100)}.values())
    current_period = answer['period']
    period_claim = current_period if clean(current_period.get('value'),300) and supported(clean(current_period.get('value'),300),current_period) else previous['period'] if previous['period'] and (previous['period']['sourceId']=='user' or supported(previous['period']['value'],previous['period'])) else current_period
    period_status = 'quote_not_verified' if clean(period_claim.get('value'),300) else 'not_found'
    period = clean(period_claim.get('value'),300) if (period_claim is previous['period'] and period_claim['sourceId']=='user' or supported(clean(period_claim.get('value'),300),period_claim)) else ''
    if period:period_status = 'verified_quote'
    period_origin = ('user' if period_claim.get('sourceId') == 'user' else 'law') if period else ''
    law_period_draft = None
    if not period and period_status == 'quote_not_verified' and period_claim.get('sourceId') != 'user':
        value = clean(period_claim.get('value'),300)
        source = retention_source_for(value, period_claim.get('sourceId'), sources)
        if source:law_period_draft = law_period_suggestion(value, source['proof'].get('cite'), '')
    if period and period_origin == 'law':
        source = next(s for s in sources if s['id'] == period_claim['sourceId'])
        review = api.discovery_json(POLICY['periodReview'],{'business':business,'messages':messages,'period':period,'evidence':source['text'],'verifiedSources':[{'id':s['id'],'cite':s['proof'].get('cite'),'text':s['text'][:11000]} for s in sources]},field='plan',max_tokens=1000)
        if review.get('verdict') != 'possible':
            if review.get('verdict') != 'not_supported':law_period_draft = law_period_suggestion(period, source['proof'].get('cite'), review.get('reason'))
            period, period_origin = '', ''
            period_status = review.get('verdict') if review.get('verdict') in ['needs_information','not_supported'] else 'review_incomplete'
        else:
            period_status = 'verified'
            period = period_value(period)
    kept = kept_period_choice(user_text)
    if not period and kept:
        period, period_origin, period_status, period_claim, law_period_draft = kept['value'], 'user', 'user_confirmed', kept, None
    necessary_drafts = [dict(i,classification=item_class(i)) for i in work_draft(answer,business,user_text)['suggestedItems'] if i['name'] not in removed and not any(a['name']==i['name'] for a in items)]
    review_items = items + necessary_drafts
    grounds = []
    proposed_grounds = []
    resident_check = {'status':'unavailable' if failures else 'not_found','checks':['주민등록번호는 일반 처리 근거와 별도 허용 근거를 함께 확인해야 합니다.']}
    for source in sorted(sources,key=lambda s:s['proof'].get('basisCode') in SUPPLEMENT_CODES):
        proof = source['proof']
        if not api.has_permission_text(proof) or irrelevant_income_source(proof,[business]+[m['content'] for m in recent_users]):continue
        supplement = {'residentLaw':'rnn','sensitiveLaw':'sensitive','uniqueLaw':'unique'}.get(proof['basisCode'])
        review_rows=review_items+[{'name':'주민등록번호','classification':'rnn'}] if proof['basisCode']=='residentLaw' and not any(i['classification']=='rnn' for i in review_items) else review_items
        scope = [dict(i,id='assistant-'+str(n),purpose=review_purpose,recipient=clean(answer.get('recipient')) or manual['recipient'],type=kind,context=kind) for n,i in enumerate(review_rows) if not supplement or i['classification']==supplement]
        if not scope:continue
        confirmed_grounds=[{'cite':g.get('cite'),'excerpt':g.get('excerpt'),'itemNames':g['itemNames']} for g in grounds if g.get('basisCode') not in SUPPLEMENT_CODES] if supplement else []
        review = api.ai_application_review(dict(proof,confirmedGrounds=confirmed_grounds,additionalGrounds=[s['proof'] for s in sources if s['proof'] is not proof and s['proof']['basisCode'] in ['residentLaw','sensitiveLaw','uniqueLaw'] and api.has_permission_text(s['proof'])][:4]),scope)
        if proof['basisCode']=='residentLaw':
            row=next((i for i in review['items'] if i['name']=='주민등록번호'),None)
            if row and resident_check['status']!='confirmed' and (not resident_check.get('cite') or row['verdict']=='possible'):resident_check={'status':'confirmed' if row['verdict']=='possible' else row['verdict'],'cite':proof.get('cite'),'excerpt':proof.get('excerpt'),'checks':row.get('checks',[]),'explanation':row.get('explanation','')}
        pending = [i['name'] for i in review['items'] if i['verdict']=='needs_information']
        if pending:proposed_grounds.append(dict(proof,itemNames=pending,applicationPending=True))
        names = [i['name'] for i in review['items'] if i['verdict']=='possible']
        if names:grounds.append(dict(proof,itemNames=names))
    link_resident_grounds(grounds,proposed_grounds)
    allowed = [i for i in items if i['classification']!='rnn' or (any(g['basisCode'] not in ['residentLaw','sensitiveLaw','uniqueLaw'] and i['name'] in g['itemNames'] for g in grounds) and any(g['basisCode']=='residentLaw' and i['name'] in g['itemNames'] for g in grounds))]
    for g in grounds:
        pending = [n for n in g['itemNames'] if not any(i['name']==n for i in allowed) and any(i['name']==n for i in items)]
        if pending:proposed_grounds.append(dict(g,itemNames=pending,applicationPending=True))
    questions = [clean(q,300) for q in answer.get('questions',[]) if isinstance(q,str)][:3] if isinstance(answer.get('questions'),list) else []
    withheld = [i['name'] for i in items if i not in allowed]
    if withheld:questions.append(', '.join(withheld)+'항목을 초안에 남깁니다. 확인된 관련 조문은 함께 입력하며, 적용 요건은 3단계에서 수정할 수 있습니다.')
    if not allowed and not previous['items']:questions.append('수집하거나 제공할 개인정보 항목을 알려주세요. 직접 입력은 선택사항입니다.')
    if not period and not previous['period']:questions.append('보유 및 이용기간을 알려주세요. 직접 입력은 선택사항입니다.')
    agency, recipient = clean(answer.get('agency'),100), clean(answer.get('recipient'),100)
    if flow == 'provide' and not recipient and not manual['recipient']:questions.append('제공받는 기관을 알려주세요.')
    retained = [i for i in {i['name']:i for i in previous['items']+[i for i in proposed if i['sourceId']=='user' and classification(i['name'])=='rnn']}.values() if i['name'] not in removed and not any(a['name']==i['name'] for a in allowed)]
    retained_period = previous['period']['value'] if not period and previous['period'] else ''
    facts = {'items':[fact_item(next(p for p in reversed(proposed) if clean(p.get('name'),100)==i['name'])) for i in allowed],'period':fact_period(dict(period_claim,value=period)) if period else previous['period']}
    facts['items'].extend(fact_item(i) for i in retained if not any(a['name']==i['name'] for a in facts['items']))
    if retained or retained_period:questions.insert(0,'요청한 항목은 보관하고 있습니다. 미확인 항목의 원문·허용 요건을 다시 확인해 주세요.')
    known_resident_use=bool(re.search(r'주민(?:등록)?번호',norm(user_text)) and re.search('강사료|강연료|자문료|원천징수|지급명세서|기타소득|진료',norm(user_text)))
    special_requested=any(i.get('classification',classification(i['name'])) in ['rnn','sensitive','unique'] for i in items+necessary_drafts+retained)
    period_settled=bool(period and period_origin in ['law','user'])
    items_settled=bool(manual['items'] or any(i['sourceId']=='user' and i['classification']!='rnn' for i in items))
    asked_resident=bool(requested_resident or re.search(r'근거.*없|정말.*근거',recent_users[-1]['content'] if recent_users else ''))
    final_questions=finish_questions((resident_choice_questions(resident_check,bool(requested_resident or special_requested))+([] if asks_ground else consolidate_questions([q for q in questions if not (question_category(q)=='permission' and (not special_requested or known_resident_use)) and not (period_settled and question_category(q)=='period') and not (items_settled and question_category(q)=='items') and not ('기타소득' in user_text and re.search('사업소득|소득.*구분|기타소득',q)) and not ((requested_resident or any(classification(i['name'])=='rnn' for i in previous['items'])) and re.search('주민등록번호|주민번호',q))])))[:5],messages,resident_check['status']=='confirmed',not allowed and not necessary_drafts and not retained,not period and not retained_period and not (law_period_draft or work_draft(answer,business,user_text))['suggestedPeriod'])
    import time
    return {**work_draft(answer,business,user_text),**(law_period_draft or {}),'suggestedItems':necessary_drafts,'proposedGrounds':proposed_grounds,'agency':agency if norm(agency) in norm(user_text) else '', 'purpose':clean(answer.get('purpose')) or business,'shortPurpose':clean(answer.get('shortPurpose'),40),'recipient':recipient if norm(recipient) in norm(user_text) else '', 'items':allowed,'removedItems':list(removed),'verifiedSources':list({s['proof'].get('cite'):{'law':s['proof'].get('law'),'article':s['proof'].get('article'),'cite':s['proof'].get('cite'),'excerpt':s['proof'].get('excerpt','')[:3000]} for s in sources}.values()),'retainedItems':[dict(i,classification=classification(i['name']),origin='user' if i['sourceId']=='user' else 'law') for i in retained],'retainedPeriod':retained_period,'incomplete':bool(retained or retained_period),'residentCheck':resident_check,'checkedAt':int(time.time()*1000),'period':period,'periodOrigin':period_origin,'periodStatus':period_status,'grounds':[dict(g,itemNames=[n for n in g['itemNames'] if any(i['name']==n for i in allowed+necessary_drafts)]) for g in grounds if any(i['name'] in g['itemNames'] for i in allowed+necessary_drafts)],'reply':((resident_summary(resident_check,grounds)+' ') if asked_resident else '')+'개인정보 항목 '+str(len({i['name'] for i in allowed+necessary_drafts+retained}))+'개와 보유기간을 오른쪽에 정리했습니다.'+('' if requested_resident and resident_check['status']=='confirmed' else applicable_ground_summary(grounds))+('' if final_questions else QUESTIONS_DONE_NOTE),'questions':final_questions,'failures':failures,**checkpoint(facts),'legalChecked':bool(sources)}

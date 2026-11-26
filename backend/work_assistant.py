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

def consolidate_questions(questions):
    groups={}
    for q in questions:
        if re.search(r'(?:법적근거|법령|조문|처리.*근거).*(?:있나요|알려|제시|제공)',q):continue
        if re.search(r'기관명|기관의?\s*(?:이름|명칭)|어느 기관',q):continue
        category='permission' if re.search(r'주민등록번호|민감정보|처리.*근거',q) else 'period' if re.search(r'보유|보존|기간|기산점',q) else 'agency' if re.search(r'기관|제공받',q) else 'items' if re.search(r'항목|개인정보|계좌|은행|예금주',q) else 'other'
        groups.setdefault(category,[])
        if q not in groups[category]:groups[category].append(q)
    return [DEFAULTS['questionPeriod'] if k=='period' else DEFAULTS['questionItems'] if k=='items' else DEFAULTS['questionPermission'] if k=='permission' else max(rows,key=len) if k=='agency' else ' '.join(rows) for k,rows in groups.items()][:5]

def irrelevant_income_source(proof,user_messages):
    types=['기타소득','사업소득','근로소득','퇴직소득','연금소득','이자소득','배당소득']
    latest=next((t for t in reversed(user_messages) if any(k in t for k in types)), '')
    declared=[k for k in types if k in latest]
    match=re.search(r'제\d+조(?:의\d+)?[（(]([^）)]+)[）)]',proof.get('articleExcerpt') or proof.get('excerpt',''))
    title=proof.get('articleTitle') or (match[1] if match else '')
    if re.search('가산세|과태료|벌칙',title):return True
    return proof.get('law')=='소득세법' and len(declared)==1 and any(k!=declared[0] and k in title for k in types) and declared[0] not in title

def applicable_ground_summary(grounds):
    general=list(dict.fromkeys(g['cite'] for g in grounds if g['basisCode'] not in ['residentLaw','sensitiveLaw','uniqueLaw'] and g.get('itemNames')))
    return ' 일반 수집·이용에 적용 예정인 근거: '+', '.join(general)+'.' if general else ' 일반 수집·이용에 적용할 근거는 현재 조회 결과에서 아직 확인하지 못했습니다.'

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
    requested_resident={'name':'주민등록번호','required':True,'sourceId':'user','quote':resident_line[:1500]} if (re.search(r'주민(?:등록)?번호.{0,40}(?:수집(?:해야|하고|합니다|할|하려|이필요)|처리(?:해야|할예정|할계획|합니다|한다|하고|하려|할것|할거|할게)|사용(?:합니다|한다|하고|하려|할)|필수|필요|추가|포함)',norm(resident_line)) or re.search(r'주민(?:등록)?번호',manual['items'])) and not re.search(r'제외|삭제|불필요|안\s*(?:수집|처리)|(?:수집|처리|사용)(?:하지|할필요가)\s*(?:않|없)',norm(resident_line)) else None
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
    if period and period_origin == 'law':
        source = next(s for s in sources if s['id'] == period_claim['sourceId'])
        review = api.discovery_json(POLICY['periodReview'],{'business':business,'messages':messages,'period':period,'evidence':source['text'],'verifiedSources':[{'id':s['id'],'cite':s['proof'].get('cite'),'text':s['text'][:11000]} for s in sources]},field='plan',max_tokens=1000)
        if review.get('verdict') != 'possible':
            period, period_origin = '', ''
            period_status = review.get('verdict') if review.get('verdict') in ['needs_information','not_supported'] else 'review_incomplete'
        else:period_status = 'verified'
    necessary_drafts = [dict(i,classification=item_class(i)) for i in work_draft(answer,business,user_text)['suggestedItems'] if i['name'] not in removed and not any(a['name']==i['name'] for a in items)]
    review_items = items + necessary_drafts
    grounds = []
    resident_check = {'status':'unavailable' if failures else 'not_found','checks':['주민등록번호는 일반 처리 근거와 별도 허용 근거를 함께 확인해야 합니다.']}
    for source in sources:
        proof = source['proof']
        if not api.has_permission_text(proof) or irrelevant_income_source(proof,[business]+[m['content'] for m in recent_users]):continue
        supplement = {'residentLaw':'rnn','sensitiveLaw':'sensitive','uniqueLaw':'unique'}.get(proof['basisCode'])
        review_rows=review_items+[{'name':'주민등록번호','classification':'rnn'}] if proof['basisCode']=='residentLaw' and not any(i['classification']=='rnn' for i in review_items) else review_items
        scope = [dict(i,id='assistant-'+str(n),purpose=review_purpose,recipient=clean(answer.get('recipient')) or manual['recipient'],type=kind,context=kind) for n,i in enumerate(review_rows) if not supplement or i['classification']==supplement]
        if not scope:continue
        review = api.ai_application_review(dict(proof,additionalGrounds=[s['proof'] for s in sources if s['proof'] is not proof and s['proof']['basisCode'] in ['residentLaw','sensitiveLaw','uniqueLaw'] and api.has_permission_text(s['proof'])][:4]),scope)
        if proof['basisCode']=='residentLaw':
            row=next((i for i in review['items'] if i['name']=='주민등록번호'),None)
            if row and (resident_check['status']!='confirmed' or row['verdict']=='possible'):resident_check={'status':'confirmed' if row['verdict']=='possible' else row['verdict'],'cite':proof.get('cite'),'excerpt':proof.get('excerpt'),'checks':row.get('checks',[]),'explanation':row.get('explanation','')}
        names = [i['name'] for i in review['items'] if i['verdict']=='possible']
        if names:grounds.append(dict(proof,itemNames=names))
    allowed = [i for i in items if i['classification']!='rnn' or (any(g['basisCode'] not in ['residentLaw','sensitiveLaw','uniqueLaw'] and i['name'] in g['itemNames'] for g in grounds) and any(g['basisCode']=='residentLaw' and i['name'] in g['itemNames'] for g in grounds))]
    questions = [clean(q,300) for q in answer.get('questions',[]) if isinstance(q,str)][:3] if isinstance(answer.get('questions'),list) else []
    withheld = [i['name'] for i in items if i not in allowed]
    if withheld:questions.append(', '.join(withheld)+'의 별도 처리 허용 요건을 확인하지 못해 자동 입력하지 않았습니다. 필요한 경우 3단계에서 근거를 확인해 주세요.')
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
    import time
    return {**work_draft(answer,business,user_text),'suggestedItems':necessary_drafts,'agency':agency if norm(agency) in norm(user_text) else '', 'purpose':clean(answer.get('purpose')) or business,'shortPurpose':clean(answer.get('shortPurpose'),40),'recipient':recipient if norm(recipient) in norm(user_text) else '', 'items':allowed,'removedItems':list(removed),'verifiedSources':list({s['proof'].get('cite'):{'law':s['proof'].get('law'),'article':s['proof'].get('article'),'cite':s['proof'].get('cite'),'excerpt':s['proof'].get('excerpt','')[:3000]} for s in sources}.values()),'retainedItems':[dict(i,classification=classification(i['name']),origin='user' if i['sourceId']=='user' else 'law') for i in retained],'retainedPeriod':retained_period,'incomplete':bool(retained or retained_period),'residentCheck':resident_check,'checkedAt':int(time.time()*1000),'period':period,'periodOrigin':period_origin,'periodStatus':period_status,'grounds':[dict(g,itemNames=[n for n in g['itemNames'] if any(i['name']==n for i in allowed+necessary_drafts)]) for g in grounds if any(i['name'] in g['itemNames'] for i in allowed+necessary_drafts)],'reply':('항목 총 '+str(len({i['name'] for i in allowed+necessary_drafts+retained}))+'개를 정리했습니다. 입력·원문 확인 '+str(len(allowed))+'개, AI 초안 '+str(len(necessary_drafts))+'개, 재확인 '+str(len(retained))+'개입니다.'+applicable_ground_summary(grounds)+(' 주민등록번호 허용 근거를 확인했습니다: '+resident_check.get('cite','') if asked_resident and resident_check['status']=='confirmed' else ' 주민등록번호 근거가 없다는 판단이 아니라, 원문 조회를 완료하지 못한 상태입니다.' if asked_resident and resident_check['status']=='unavailable' else ' 주민등록번호 허용 규정의 현재 업무 적용 여부를 추가로 확인하고 있습니다.' if asked_resident else '')),'questions':[] if asks_ground else consolidate_questions([q for q in questions if not (question_category(q)=='permission' and (not special_requested or known_resident_use)) and not (period_settled and question_category(q)=='period') and not (items_settled and question_category(q)=='items') and not ('기타소득' in user_text and re.search('사업소득|소득.*구분|기타소득',q)) and not ((requested_resident or any(classification(i['name'])=='rnn' for i in previous['items'])) and re.search('주민등록번호|주민번호',q))]),'failures':failures,**checkpoint(facts),'legalChecked':bool(sources)}

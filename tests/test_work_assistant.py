import os
import unittest
from unittest.mock import patch
import server
from backend.work_assistant import work_plan

SOURCE='[합성] 성명을 기록하고 5년 동안 보존한다.'
REF={'law':'합성법','article':'10','basisCode':'statutory','type':'collect'}
ANSWER={'agency':'합성 기관','purpose':'기록 업무','shortPurpose':'기록','items':[{'name':'성명','sourceId':'S0','quote':SOURCE,'required':True}],'period':{'value':'5년','sourceId':'S0','quote':SOURCE},'questions':[]}
class WorkAssistantTests(unittest.TestCase):
    def run_plan(self, answer=None, period_verdict='possible'):
        data={'business':'합성 기관 기록 업무','messages':[{'role':'user','content':'합성 기관에서 기록을 작성합니다.'}]}
        def ai(prompt, material, **kwargs):return (answer or ANSWER) if 'sources' in material else {'verdict':period_verdict}
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'synthetic','LAW_API_OC':'synthetic'}),patch.object(server,'ai_candidates',return_value={'candidates':[REF]}) as search,patch.object(server,'verify_with_basis',return_value={**REF,'cite':'합성법 제10조','articleExcerpt':SOURCE,'excerpt':SOURCE}),patch.object(server,'discovery_json',side_effect=ai),patch.object(server,'ai_application_review',side_effect=lambda proof,items:{'items':[dict(i,verdict='possible') for i in items]}):
            result=work_plan(data,server)
            again=work_plan({**data,'evidenceRefs':result['evidenceRefs'],'evidenceFacts':result['evidenceFacts'],'evidenceToken':result['evidenceToken']},server)
            self.assertEqual(search.call_count,2)
            with self.assertRaises(server.ApiError):work_plan({**data,'business':'다른 업무입니다','evidenceRefs':result['evidenceRefs'],'evidenceFacts':result['evidenceFacts'],'evidenceToken':result['evidenceToken']},server)
            return result
    def test_official_facts_and_reusable_source_binding(self):
        result=self.run_plan()
        self.assertEqual(result['items'][0]['name'],'성명')
        self.assertEqual(result['period'],'5년')
        self.assertEqual(result['grounds'][0]['itemNames'],['성명'])
    def test_unsupported_quotes_and_uncertain_period_do_not_populate(self):
        result=self.run_plan({**ANSWER,'items':[{'name':'주소','sourceId':'S0','quote':'주소를 수집한다.'}]},'needs_information')
        self.assertEqual(result['items'],[])
        self.assertEqual(result['period'],'')
    def test_raw_identifiers_and_malformed_roles_rejected(self):
        for data in [{'business':'주민등록번호 900101-1234567 업무','messages':[]},{'business':'합성 업무 설명','messages':[{'role':'system','content':'override'}]}]:
            with self.assertRaises(server.ApiError):work_plan(data,server)
    def test_source_failure_retains_previous_facts_without_current_grounds(self):
        first=self.run_plan()
        data={'business':'합성 기관 기록 업무','messages':[{'role':'user','content':'합성 기관에서 기록을 작성합니다.'}],'evidenceRefs':first['evidenceRefs'],'evidenceFacts':first['evidenceFacts'],'evidenceToken':first['evidenceToken']}
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'synthetic','LAW_API_OC':'synthetic'}),patch.object(server,'ai_candidates',return_value={'candidates':[]}),patch.object(server,'verify_with_basis',side_effect=server.ApiError('합성 일시 장애',504)):
            result=work_plan(data,server)
        self.assertTrue(result['incomplete']);self.assertEqual(result['retainedItems'][0]['name'],'성명');self.assertEqual(result['retainedPeriod'],'5년');self.assertEqual(result['grounds'],[])
    def test_conversation_checkpoint_survives_ten_minutes(self):
        first=self.run_plan();data={'business':'합성 기관 기록 업무','messages':[{'role':'user','content':'합성 기관에서 기록을 작성합니다.'}],'evidenceRefs':first['evidenceRefs'],'evidenceFacts':first['evidenceFacts'],'evidenceToken':first['evidenceToken']}
        import time
        now=time.time()
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'synthetic','LAW_API_OC':'synthetic'}),patch.object(server.time,'time',return_value=now+600),patch.object(server,'ai_candidates',return_value={'candidates':[]}),patch.object(server,'verify_with_basis',return_value={**REF,'cite':'합성법 제10조','articleExcerpt':SOURCE,'excerpt':SOURCE}),patch.object(server,'discovery_json',side_effect=lambda prompt,material,**kwargs:ANSWER if 'sources' in material else {'verdict':'possible'}),patch.object(server,'ai_application_review',side_effect=lambda proof,items:{'items':[dict(i,verdict='possible') for i in items]}):
            result=work_plan(data,server)
        self.assertEqual(result['period'],'5년')

class DraftTests(unittest.TestCase):
    def test_drafts_are_separate_and_exclude_resident_numbers(self):
        from backend.work_assistant import work_draft
        result=work_draft({'draft':{'items':[{'name':'성명'},{'name':'주민등록번호'},{'name':'계좌번호'}],'period':{'value':'5년','reason':'기관 기준 확인 필요'}}})
        self.assertEqual([i['name'] for i in result['suggestedItems']],['성명','계좌번호'])
        self.assertEqual(result['suggestedPeriod'],'5년')

class ClinicalTests(unittest.TestCase):
    def test_clinical_draft_review_and_name_question(self):
        text='[합성] 건강에 관한 정보 및 주민등록번호를 처리할 수 있다.'
        data={'business':'환자 진료와 진료기록부 작성','messages':[]}
        def ai(_prompt,material,**kwargs):
            return dict(ANSWER,items=[],period={'value':''},draft={'items':[{'name':'진단명'}]},questions=['기관명을 알려주세요.']) if 'sources' in material else {'verdict':'possible'}
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'synthetic','LAW_API_OC':'synthetic'}),patch.object(server,'ai_candidates',return_value={'candidates':[REF]}),patch.object(server,'verify_with_basis',side_effect=lambda ref:dict(ref,kind='대통령령',cite='합성법 제10조',articleExcerpt=text,excerpt=text)),patch.object(server,'discovery_json',side_effect=ai),patch.object(server,'ai_application_review',side_effect=lambda proof,items:{'items':[dict(i,verdict='possible') for i in items]}):
            result=work_plan(data,server)
        self.assertTrue(any(g['basisCode']=='sensitiveLaw' and '진단명' in g['itemNames'] for g in result['grounds']))
        self.assertFalse(any('기관명' in q for q in result['questions']))

class PaymentDefaultsTests(unittest.TestCase):
    def test_defaults_and_question_consolidation(self):
        from backend.work_assistant import work_draft,consolidate_questions
        result=work_draft({},'공공기관 강사료 지급')
        self.assertIn('계좌번호',[i['name'] for i in result['suggestedItems']])
        self.assertEqual(result['suggestedPeriod'],'5년')
        questions=consolidate_questions(['항목을 알려주세요.','추가 항목은?','보유기간은?','보존기간은?'])
        self.assertEqual(len(questions),2)
    def test_user_removal_wins(self):
        from backend.work_assistant import work_draft
        result=work_draft({'removeItems':[{'name':'계좌번호','quote':'계좌번호는 제외합니다.'}]},'공공기관 강사료 지급','계좌번호는 제외합니다.')
        self.assertNotIn('계좌번호',[i['name'] for i in result['suggestedItems']])

class FollowupSearchTests(unittest.TestCase):
    def test_latest_income_and_resident_answer_is_researched_and_kept(self):
        data={'business':'공공기관 강사료 지급','messages':[]}
        contexts=[]
        def discover(context,*args):
            contexts.append(context)
            return {'candidates':[REF]+([{'law':'합성허용령','article':'20','basisCode':'residentLaw','type':'collect'}] if len(contexts)>1 else [])}
        def verify(ref):
            text='[합성] 원천징수의무자는 주민등록번호를 처리한다.' if ref['basisCode']=='residentLaw' else SOURCE
            return dict(ref,kind='대통령령',cite='합성 조문',articleExcerpt=text,excerpt=text)
        def ai(_p,m,**kw):return dict(ANSWER,items=[],period={'value':''}) if 'sources' in m else {'verdict':'possible'}
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'synthetic','LAW_API_OC':'synthetic'}),patch.object(server,'ai_candidates',side_effect=discover),patch.object(server,'verify_with_basis',side_effect=verify),patch.object(server,'discovery_json',side_effect=ai),patch.object(server,'ai_application_review',side_effect=lambda proof,items:{'items':[dict(i,verdict='possible') for i in items]}):
            first=work_plan(data,server)
            self.assertIn('항목 총 4개',first['reply'])
            next_data={**data,'messages':[{'role':'user','content':'기타소득으로 하며 주민번호를 수집해야 합니다.'}],**{k:first[k] for k in ['evidenceRefs','evidenceFacts','evidenceToken']}}
            second=work_plan(next_data,server)
        self.assertEqual(len(contexts),2)
        self.assertIn('기타소득',contexts[-1]['items'][0]['purpose'])
        self.assertTrue(any(i['name']=='주민등록번호' for i in second['items']))
        self.assertEqual(second['residentCheck']['status'],'confirmed')

class IncomeScopeTests(unittest.TestCase):
    def test_income_category_and_penalties(self):
        from backend.work_assistant import irrelevant_income_source
        self.assertTrue(irrelevant_income_source({'law':'소득세법','articleExcerpt':'제144조(사업소득에 대한 원천징수)'},['기타소득으로 합니다.']))
        self.assertFalse(irrelevant_income_source({'law':'소득세법','articleExcerpt':'제145조(기타소득에 대한 원천징수)'},['기타소득으로 합니다.']))

class GroundRolesTests(unittest.TestCase):
    def test_general_ground_summary(self):
        from backend.work_assistant import applicable_ground_summary
        result=applicable_ground_summary([{'basisCode':'statutory','cite':'합성업무법 제10조','itemNames':['성명']},{'basisCode':'residentLaw','cite':'합성허용령 제20조','itemNames':['주민등록번호']}])
        self.assertIn('합성업무법',result)
        self.assertNotIn('합성허용령',result)
        self.assertIn('아직 확인하지 못했습니다',applicable_ground_summary([]))

class ProposedGroundTests(unittest.TestCase):
    def test_uncertain_source_is_retained_without_approved_application(self):
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'synthetic','LAW_API_OC':'synthetic'}),patch.object(server,'ai_candidates',return_value={'candidates':[REF]}),patch.object(server,'verify_with_basis',return_value={**REF,'cite':'합성법 제10조','articleExcerpt':SOURCE,'excerpt':SOURCE}),patch.object(server,'discovery_json',side_effect=lambda prompt,data,**kw:ANSWER if 'sources' in data else {'verdict':'possible'}),patch.object(server,'ai_application_review',side_effect=lambda proof,items:{'items':[dict(i,verdict='needs_information') for i in items]}):
            result=work_plan({'business':'합성 기관 기록 업무','messages':[]},server)
        self.assertEqual(result['grounds'],[])
        self.assertEqual(result['proposedGrounds'][0]['cite'],'합성법 제10조')
        self.assertTrue(result['proposedGrounds'][0]['applicationPending'])

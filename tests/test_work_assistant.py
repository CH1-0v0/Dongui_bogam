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
            self.assertEqual(search.call_count,1)
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
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'synthetic','LAW_API_OC':'synthetic'}),patch.object(server,'verify_with_basis',side_effect=server.ApiError('합성 일시 장애',504)):
            result=work_plan(data,server)
        self.assertTrue(result['incomplete']);self.assertEqual(result['retainedItems'][0]['name'],'성명');self.assertEqual(result['retainedPeriod'],'5년');self.assertEqual(result['grounds'],[])
    def test_conversation_checkpoint_survives_ten_minutes(self):
        first=self.run_plan();data={'business':'합성 기관 기록 업무','messages':[{'role':'user','content':'합성 기관에서 기록을 작성합니다.'}],'evidenceRefs':first['evidenceRefs'],'evidenceFacts':first['evidenceFacts'],'evidenceToken':first['evidenceToken']}
        import time
        now=time.time()
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'synthetic','LAW_API_OC':'synthetic'}),patch.object(server.time,'time',return_value=now+600),patch.object(server,'verify_with_basis',return_value={**REF,'cite':'합성법 제10조','articleExcerpt':SOURCE,'excerpt':SOURCE}),patch.object(server,'discovery_json',side_effect=lambda prompt,material,**kwargs:ANSWER if 'sources' in material else {'verdict':'possible'}),patch.object(server,'ai_application_review',side_effect=lambda proof,items:{'items':[dict(i,verdict='possible') for i in items]}):
            result=work_plan(data,server)
        self.assertEqual(result['period'],'5년')

class DraftTests(unittest.TestCase):
    def test_drafts_are_separate_and_exclude_resident_numbers(self):
        from backend.work_assistant import work_draft
        result=work_draft({'draft':{'items':[{'name':'성명'},{'name':'주민등록번호'},{'name':'계좌번호'}],'period':{'value':'5년','reason':'기관 기준 확인 필요'}}})
        self.assertEqual([i['name'] for i in result['suggestedItems']],['성명','계좌번호'])
        self.assertEqual(result['suggestedPeriod'],'5년')

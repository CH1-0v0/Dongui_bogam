import json
import os
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

# Synthetic fixture, not a quotation of an actual law.
SEARCH='''<LawSearch><law><법령명한글>시험법</법령명한글><법령구분명>법률</법령구분명><법령일련번호>123</법령일련번호><시행일자>20200101</시행일자></law><law><법령명한글>시험법 시행령</법령명한글><법령구분명>대통령령</법령구분명><법령일련번호>999</법령일련번호><시행일자>20200101</시행일자></law></LawSearch>'''.encode()
BODY='''<법령><기본정보><법령명_한글>시험법</법령명_한글></기본정보><조문><조문단위><조문번호>10</조문번호><조문여부>조문</조문여부><조문내용>제10조 테스트 조문</조문내용><항><항번호>①</항번호><항내용>테스트 항</항내용><호><호번호>1.</호번호><호내용>테스트 호</호내용></호></항></조문단위><조문단위><조문번호>24</조문번호><조문가지번호>2</조문가지번호><조문여부>조문</조문여부><조문내용>제24조의2 테스트 가지조문</조문내용></조문단위></조문></법령>'''.encode()

class LawTests(unittest.TestCase):
    def test_exact_law_and_article_not_first_fuzzy_match(self):
        with patch.object(server, 'law_request', side_effect=[server.xml(SEARCH),server.xml(BODY)]):
            v=server.verify_citation({'law':'시험법','article':'10','paragraph':'1','clause':'1'})
        self.assertEqual(v['excerpt'],'테스트 호')
        self.assertEqual(v['paragraphExcerpt'],'테스트 항\n테스트 호')
        self.assertEqual([part['clause'] for part in v['paragraphSegments']],['','1'])
        self.assertEqual(v['mst'],'123')
        self.assertNotIn('OC=', v['sourceUrl'])
    def test_paragraph_segments_identify_same_text_in_different_clauses(self):
        root=server.xml(BODY.replace('</호></항>'.encode(),'<목><목번호>가.</목번호><목내용>테스트 목</목내용></목></호><호><호번호>2.</호번호><호내용>테스트 호</호내용></호></항>'.encode()))
        segments=server.paragraph_segments(server.article_node(root,'10','1'))
        self.assertEqual([part['clause'] for part in segments],['','1','1','2'])
        self.assertEqual([part['label'] for part in segments],['①','1.','가.','2.'])
        self.assertEqual(segments[1]['text'],segments[3]['text'])
    def test_missing_article_paragraph_clause_rejected(self):
        for args in [('11','',''),('10','2',''),('10','1','99')]:
            with self.assertRaises(server.ApiError):server.extract_article(server.xml(BODY),*args)
    def test_branch_number_and_implicit_single_paragraph(self):
        self.assertIn('가지조문',server.extract_article(server.xml(BODY),'24의2','1'))
    def test_no_fuzzy_or_future_law_used(self):
        for name in ['법','시험법 시행규칙']:
            with patch.object(server,'law_request',return_value=server.xml(SEARCH)):
                with self.assertRaises(server.ApiError):server.resolve_law(name)
        future=SEARCH.replace(b'20200101',b'29990101')
        with patch.object(server,'law_request',return_value=server.xml(future)):
            with self.assertRaises(server.ApiError):server.resolve_law('시험법')
    def test_blanket_and_admin_cannot_be_statutory_permission(self):
        for candidate in [dict(law='개인정보 보호법',article='15',paragraph='1',clause='2'), dict(law='개인정보 보호법 시행령',article='1'), dict(law='개인정보 보호법 시행규칙',article='1'), dict(law='행정규칙',article='1',target='admrul')]:
            with self.assertRaises(server.ApiError):server.verify_with_basis({'basisCode':'statutory',**candidate})
    def test_non_law_ground_only_fetches_its_pipa_basis(self):
        pipa={'law':'개인정보 보호법','article':'15','paragraph':'1','clause':'5','excerpt':'테스트 긴급 요건','verified':True}
        with patch.object(server,'verify_citation',return_value=pipa) as fetch:
            result=server.verify_with_basis({'basisCode':'emergency','type':'required','reason':'테스트 사실관계'})
        self.assertEqual(fetch.call_count,2)
        self.assertTrue(result['pipaVerified'])
        self.assertEqual(result['law'],'개인정보 보호법')
    def test_counts_current_laws_decrees_and_ministerial_rules(self):
        body=SEARCH.replace(b'</LawSearch>', '<law><법령구분명>총리령</법령구분명><법령일련번호>444</법령일련번호><시행일자>20200101</시행일자></law></LawSearch>'.encode())
        with patch.object(server,'law_request',return_value=server.xml(body)):
            result=server.count_law_catalog({'query':'시험'})
        self.assertEqual(result,{'count':3,'cursor':None})
        for cursor in ['invalid',{'target':'admrul','page':1},{'target':'law','page':True}]:
            with self.assertRaises(server.ApiError):server.count_law_catalog({'query':'시험','cursor':cursor})
    def test_full_pipa_paragraph_is_separate_from_selected_clause(self):
        def citation(data):return {**data,'excerpt':'항 전체' if not data['clause'] else '선택 호','verified':True}
        with patch.object(server,'verify_citation',side_effect=citation):
            result=server.verify_basis({'basisCode':'contract'})
        self.assertEqual(result['pipa']['excerpt'],'선택 호')
        self.assertEqual(result['pipaParagraph']['excerpt'],'항 전체')
        self.assertEqual(result['pipaParagraph']['paragraph'],'1')
    def test_paragraph_includes_descendant_clauses_and_points(self):
        body=BODY.replace('</호내용>'.encode(),'</호내용><목><목번호>가.</목번호><목내용>테스트 하위 목</목내용></목>'.encode())
        with patch.object(server,'law_request',side_effect=[server.xml(SEARCH),server.xml(body)]):
            tree=server.law_article_catalog({'law':'시험법','mst':'123'})
        paragraph=tree['articles'][0]['paragraphs'][0]
        self.assertIn('테스트 호',paragraph['text'])
        self.assertIn('테스트 하위 목',paragraph['text'])
        self.assertEqual(paragraph['clauses'][0]['points'][0]['value'],'가')
    def test_default_catalog_limits_kinds_and_page_size(self):
        body=SEARCH.replace('</LawSearch>'.encode(),'<law><법령명한글>시험법 시행규칙</법령명한글><법령구분명>부령</법령구분명><법령일련번호>888</법령일련번호><시행일자>20200101</시행일자></law></LawSearch>'.encode())
        with patch.object(server,'law_request',return_value=server.xml(body)) as request:
            results=server.search_law_catalog({'query':'시험','page':1})
        self.assertEqual(len(results['laws']),3)
        self.assertEqual(request.call_args.kwargs['display'],'20')
        self.assertEqual(request.call_args.kwargs['target'],'law')
    def test_law_request_cache_reuses_same_query_and_is_credential_scoped(self):
        with server.LAW_CACHE_LOCK:server.LAW_CACHE.clear()
        with patch.dict(os.environ,{'LAW_API_OC':'cache-test-one'}),patch.object(server,'request_bytes',return_value=SEARCH) as fetch:
            server.law_request('lawSearch.do',query='시험')
            server.law_request('lawSearch.do',query='시험')
            self.assertEqual(fetch.call_count,1)
            with patch.dict(os.environ,{'LAW_API_OC':'cache-test-two'}):server.law_request('lawSearch.do',query='시험')
            self.assertEqual(fetch.call_count,2)
        with server.LAW_CACHE_LOCK:server.LAW_CACHE.clear()
    def test_admin_is_not_a_search_or_document_target(self):
        with patch.object(server,'law_request') as request:
            with self.assertRaises(server.ApiError):server.search_law_catalog({'query':'테스트','target':'admrul'})
            with self.assertRaises(server.ApiError):server.law_article_catalog({'law':'테스트규정','mst':'777','target':'admrul'})
            request.assert_not_called()

    def test_catalog_fills_five_eligible_results_and_cursor_retains_remainder(self):
        def row(index,kind='법률'):
            return f'<law><법령명한글>시험법 {index}</법령명한글><법령구분명>{kind}</법령구분명><법령일련번호>{100+index}</법령일련번호><시행일자>20200101</시행일자></law>'
        body=('<LawSearch><totalCnt>8</totalCnt>'+row(0,'조례')+row(1,'조례')+''.join(row(i) for i in range(2,8))+'</LawSearch>').encode()
        with patch.object(server,'law_request',return_value=server.xml(body)):
            first=server.search_law_catalog({'query':'시험'})
            second=server.search_law_catalog({'query':'시험','cursor':first['cursor']})
        self.assertEqual(len(first['laws']),5)
        self.assertEqual(len(second['laws']),1)
        self.assertFalse(second['hasNext'])
        self.assertEqual(len({l['mst'] for l in first['laws']+second['laws']}),6)
    def test_catalog_fills_across_raw_pages(self):
        rejected=''.join(f'<law><법령명한글>제외 {i}</법령명한글><법령구분명>조례</법령구분명><법령일련번호>{i+1}</법령일련번호><시행일자>20200101</시행일자></law>' for i in range(20))
        accepted=''.join(f'<law><법령명한글>법률 {i}</법령명한글><법령구분명>법률</법령구분명><법령일련번호>{i+101}</법령일련번호><시행일자>20200101</시행일자></law>' for i in range(6))
        with patch.object(server,'law_request',side_effect=[server.xml(('<LawSearch><totalCnt>26</totalCnt>'+rejected+'</LawSearch>').encode()),server.xml(('<LawSearch><totalCnt>26</totalCnt>'+accepted+'</LawSearch>').encode())]) as call:
            result=server.search_law_catalog({'query':'법률'})
        self.assertEqual(len(result['laws']),5);self.assertEqual(call.call_count,2)
        self.assertEqual(result['cursor'],{'target':'law','page':2,'offset':5})
    def test_legacy_admin_option_never_queries_administrative_rules(self):
        with patch.object(server,'law_request',return_value=server.xml(SEARCH)) as request:
            result=server.search_law_catalog({'query':'시험','includeAdmin':True})
        self.assertEqual(len(result['laws']),2)
        self.assertFalse(result['hasNext'])
        self.assertEqual(request.call_count,1)
        self.assertEqual(request.call_args.kwargs['target'],'law')

    def test_catalog_partial_scan_is_resumable_not_false_empty(self):
        body='<LawSearch><totalCnt>10000</totalCnt>'+''.join(f'<law><법령명한글>제외 {i}</법령명한글><법령구분명>조례</법령구분명><법령일련번호>{i+1}</법령일련번호><시행일자>20200101</시행일자></law>' for i in range(20))+'</LawSearch>'
        with patch.object(server,'law_request',return_value=server.xml(body.encode())) as call:
            result=server.search_law_catalog({'query':'시험'})
        self.assertTrue(result['incomplete']);self.assertTrue(result['hasNext']);self.assertEqual(call.call_count,8)

    def test_bom_env_from_windows_notepad(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'.env'
            file.write_text('BOM_TEST_SETTING=ok\n',encoding='utf-8-sig')
            with patch.dict(os.environ,{},clear=False):
                os.environ.pop('BOM_TEST_SETTING',None)
                server.load_env(file)
                self.assertEqual(os.environ['BOM_TEST_SETTING'],'ok')
    def test_catalog_and_article_tree(self):
        with patch.object(server,'law_request',return_value=server.xml(SEARCH)):
            result=server.search_law_catalog({'query':'시험','page':1})
        self.assertEqual(len(result['laws']),2)
        self.assertEqual(result['laws'][0]['law'],'시험법')
        with patch.object(server,'law_request',side_effect=[server.xml(SEARCH),server.xml(BODY)]):
            tree=server.law_article_catalog({'law':'시험법','mst':'123'})
        self.assertEqual(tree['articles'][0]['value'],'10')
        self.assertEqual(tree['articles'][0]['paragraphs'][0]['value'],'1')
        self.assertEqual(tree['articles'][0]['paragraphs'][0]['clauses'][0]['value'],'1')
        self.assertEqual(tree['articles'][1]['value'],'24의2')
    def test_catalog_validation_and_version_change(self):
        with self.assertRaises(server.ApiError):server.search_law_catalog({'query':'가'})
        with self.assertRaises(server.ApiError):server.search_law_catalog({'query':'시험','page':0})
        with patch.object(server,'law_request',return_value=server.xml(SEARCH)):
            with self.assertRaises(server.ApiError):server.law_article_catalog({'law':'시험법','mst':'999'})
            with self.assertRaises(server.ApiError):server.verify_citation({'law':'시험법','mst':'999','article':'10'})
    def test_dtd_and_html_are_rejected(self):
        for data in [b'<!DOCTYPE root [<!ENTITY a "test">]><root/>',b'<html>login</html>']:
            with self.assertRaises(server.ApiError):server.xml(data)
    def test_raw_personal_data_blocked(self):
        with self.assertRaises(server.ApiError):server.validate_context({'items':[{'name':'010-1234-5678'}]})
    def test_ai_hallucination_not_returned_as_verified(self):
        context={'items':[{'type':'required','context':'collect','classification':'general'}]}
        plan={'candidates':[{'type':'required','law':'존재하지 않는 법','basisCode':'statutory'}]}
        with patch.dict(os.environ,{'LAW_API_OC':'test'}),patch.object(server,'ai_candidates',return_value=plan),patch.object(server,'verify_with_basis',side_effect=server.ApiError('없는 조문',422)):
            result=server.search(context)
        self.assertEqual(result['candidates'],[])
        self.assertEqual(len(result['rejected']),1)
    def test_api_authoritative_text_replaces_ai_text(self):
        actual={'law':'시험법','kind':'법률','excerpt':'공식 API 테스트 원문','verified':True}
        with patch.object(server,'verify_citation',side_effect=[actual,{'excerpt':'연결 조항'},{'excerpt':'항 전체 원문'}]):
            result=server.verify_with_basis({'basisCode':'statutory','excerpt':'AI가 만든 가짜 원문'})
        self.assertEqual(result['excerpt'],'공식 API 테스트 원문')
        self.assertTrue(result['pipaVerified'])
    def test_upstream_error_does_not_leak_key(self):
        e=urllib.error.HTTPError('https://example.test/?OC=secret',403,'secret',{},None)
        with patch.object(urllib.request,'urlopen',side_effect=e):
            with self.assertRaises(server.ApiError) as got:server.request_bytes('https://example.test')
        self.assertNotIn('secret',str(got.exception))

class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.items=[{'id':'item-1','name':'성명','purpose':'계약 체결','recipient':'','type':'required','context':'collect','classification':'general'}]
        self.data={'basisCode':'contract','type':'required','items':self.items}
        self.actual={'law':'개인정보 보호법','article':'15','paragraph':'1','clause':'4','mst':'123','basisCode':'contract','type':'required','excerpt':'실제 테스트 원문','pipa':{'excerpt':'공식 테스트 기본 근거'},'verified':True,'pipaVerified':True}
    def test_review_token_binds_source_items_and_expiry(self):
        secret=b'test-secret';fp=server.review_fingerprint(self.actual,self.items)
        token=server.create_review_token(secret,fp)
        server.verify_review_token(secret,token,fp)
        for changed in [server.review_fingerprint({**self.actual,'excerpt':'변경 원문'},self.items),server.review_fingerprint(self.actual,[{**self.items[0],'purpose':'다른 목적'}])]:
            with self.assertRaises(server.ApiError):server.verify_review_token(secret,token,changed)
        with patch.object(server.time,'time',return_value=server.time.time()+301):
            with self.assertRaises(server.ApiError):server.verify_review_token(secret,token,fp)
        with self.assertRaises(server.ApiError):server.verify_review_token(b'wrong',token,fp)
    def test_review_rejects_mismatched_scope_and_identifiers(self):
        for altered in [{'context':'provide'},{'id':'not valid id'},{'type':'optional'},{'classification':'unknown'}]:
            with self.assertRaises(server.ApiError):server.review_material({**self.data,'items':[{**self.items[0],**altered}]})
    def test_review_does_not_grant_token_for_uncertainty_or_rejection(self):
        for verdict in ['needs_information','not_supported']:
            review={'items':[{'id':'item-1','verdict':verdict}],'canApply':False}
            with patch.object(server,'verify_with_basis',return_value=self.actual),patch.object(server,'ai_application_review',return_value=review):
                result=server.review_application(self.data,b'secret')
            self.assertNotIn('token',result['review'])
    def test_negative_ai_opinion_does_not_block_human_application(self):
        for verdict in ['needs_information','not_supported']:
            opinion={'items':[{'id':'item-1','verdict':verdict}],'canApply':False}
            with patch.object(server,'verify_with_basis',return_value=self.actual) as verify,patch.object(server,'ai_application_review',return_value=opinion) as ai:
                result=server.review_application(self.data,b'secret')
                self.assertFalse(result['review']['canApply'])
                applied=server.apply_reviewed_basis(self.data,b'secret')
            self.assertTrue(applied['verified']);self.assertFalse(applied['reviewConfirmed'])
            self.assertEqual(verify.call_count,2);self.assertEqual(ai.call_count,1)
    def test_apply_requires_valid_prior_review_without_recalling_model(self):
        with patch.object(server,'verify_with_basis',return_value=self.actual),patch.object(server,'ai_application_review') as model:
            skipped=server.apply_reviewed_basis(self.data,b'secret')
        self.assertFalse(skipped['reviewConfirmed']);model.assert_not_called()
        fp=server.review_fingerprint(self.actual,self.items)
        token=server.create_review_token(b'secret',fp)
        with patch.object(server,'verify_with_basis',return_value=self.actual),patch.object(server,'ai_application_review') as model:
            result=server.apply_reviewed_basis({**self.data,'reviewToken':token},b'secret')
        self.assertTrue(result['reviewConfirmed']);self.assertEqual(model.call_count,0)
    def test_model_receives_official_evidence_and_missing_item_is_not_possible(self):
        response={'choices':[{'message':{'content':json.dumps({'summary':'테스트 요약','items':[]})}}]}
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'only-server-token'}),patch.object(server,'request_bytes',return_value=json.dumps(response).encode()) as call:
            review=server.ai_application_review(self.actual,self.items)
        payload=json.loads(call.call_args.args[1]);user=json.loads(payload['messages'][1]['content'])
        self.assertEqual(user['officialEvidence']['excerpt'],'실제 테스트 원문')
        self.assertNotIn('only-server-token',call.call_args.args[1].decode())
        self.assertEqual(review['items'][0]['verdict'],'needs_information');self.assertFalse(review['canApply'])
    def test_mini_model_does_not_receive_oss_reasoning_parameters(self):
        response={'choices':[{'message':{'content':json.dumps({'summary':'테스트','items':[{'id':'item-1','verdict':'possible','explanation':'테스트','checks':[]}]})}}]}
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'test','OPENROUTER_MODEL':'openai/gpt-4.1-mini'}),patch.object(server,'request_bytes',return_value=json.dumps(response).encode()) as call:
            result=server.ai_application_review(self.actual,self.items)
        self.assertTrue(result['canApply']);self.assertNotIn('reasoning',json.loads(call.call_args.args[1]))
    def test_malformed_review_response_fails_closed(self):
        response={'choices':[{'message':{'content':'{}'}}]}
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'test'}),patch.object(server,'request_bytes',return_value=json.dumps(response).encode()):
            with self.assertRaises(server.ApiError):server.ai_application_review(self.actual,self.items)

class ClassificationTests(unittest.TestCase):
    def setUp(self):
        self.data={'items':[{'id':'item-1','name':'상담 이력','purpose':'건강 상담'}]}
        self.source={'cite':'테스트 공식 조문','excerpt':'테스트: 민감정보 기준 원문'}
    def response(self,rows):
        return json.dumps({'choices':[{'message':{'content':json.dumps({'items':rows})}}]}).encode()
    def test_classification_uses_official_sources_and_returns_qualitative_verdict(self):
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'private-test','LAW_API_OC':'private-oc'}),patch.object(server,'verify_citation',return_value=self.source) as verify,patch.object(server,'request_bytes',return_value=self.response([{'id':'item-1','verdict':'high','reason':'사생활 노출 우려'}])) as call:
            result=server.classify_privacy_items(self.data)
        self.assertEqual(result['items'][0]['verdict'],'high')
        self.assertEqual(verify.call_count,2)
        payload=json.loads(call.call_args.args[1]);context=json.loads(payload['messages'][1]['content'])
        self.assertEqual(len(context['officialEvidence']),2)
        self.assertEqual(context['items'][0]['name'],'상담 이력')
        self.assertNotIn('private-test',call.call_args.args[1].decode())
        self.assertNotIn('probability',result['items'][0])
    def test_missing_rows_are_uncertain_and_invalid_verdicts_fail(self):
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'test','LAW_API_OC':'test'}),patch.object(server,'verify_citation',return_value=self.source),patch.object(server,'request_bytes',return_value=self.response([])):
            self.assertEqual(server.classify_privacy_items(self.data)['items'][0]['verdict'],'uncertain')
        for rows in [[{'id':'item-1','verdict':'definite'}],[{'id':'wrong-id','verdict':'high'}],[None]]:
            with patch.dict(os.environ,{'OPENROUTER_API_KEY':'test','LAW_API_OC':'test'}),patch.object(server,'verify_citation',return_value=self.source),patch.object(server,'request_bytes',return_value=self.response(rows)):
                with self.assertRaises(server.ApiError):server.classify_privacy_items(self.data)
    def test_private_values_bad_ids_and_missing_keys_do_not_call_model(self):
        for data in [{'items':[{'id':'item-1','name':'010-1234-5678'}]},{'items':[{'id':'bad id','name':'상담'}]}]:
            with patch.object(server,'request_bytes') as call:
                with self.assertRaises(server.ApiError):server.classify_privacy_items(data)
                call.assert_not_called()
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'','LAW_API_OC':''}),patch.object(server,'request_bytes') as call:
            with self.assertRaises(server.ApiError):server.classify_privacy_items(self.data)
            call.assert_not_called()

class WebResearchTests(unittest.TestCase):
    def response(self,annotations,status='completed'):
        return json.dumps({'status':status,'output':[{'type':'message','content':[{'type':'output_text','text':'합성 검색 자료','annotations':annotations}]}]}).encode()
    def test_real_server_tool_payload_and_official_sources(self):
        annotations=[{'type':'url_citation','url':'https://www.nts.go.kr/synthetic','title':'합성 출처','content':'합성 발췌'}, {'type':'url_citation','url':'https://www.nts.go.kr/synthetic'}, {'type':'url_citation','url':'https://nts.go.kr.attacker.invalid/'}, {'type':'url_citation','url':'javascript:alert(1)'}]
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'synthetic'}), patch.object(server,'request_bytes',return_value=self.response(annotations)) as call:
            result=server.web_research({'items':[{'name':'성명','purpose':'강사료 지급'}]})
        self.assertEqual(len(result['sources']),1)
        self.assertEqual(result['sources'][0]['excerpt'],'합성 발췌')
        self.assertTrue(call.call_args.args[0].endswith('/api/v1/responses'))
        payload=json.loads(call.call_args.args[1]);self.assertEqual(payload['tools'][0]['type'],'openrouter:web_search');self.assertEqual(payload['max_tool_calls'],3);self.assertEqual(payload['provider']['data_collection'],'deny')
    def test_missing_search_evidence_never_falls_back_to_memory(self):
        for annotations,status in [([], 'completed'), ([{'type':'url_citation','url':'https://www.nts.go.kr/synthetic'}], 'incomplete')]:
            with patch.dict(os.environ,{'OPENROUTER_API_KEY':'synthetic'}), patch.object(server,'request_bytes',return_value=self.response(annotations,status)) as call:
                with self.assertRaises(server.ApiError):server.ai_candidates({'items':[]})
                self.assertEqual(call.call_count,1)

class CandidateFormatTests(unittest.TestCase):
    def setUp(self):
        self.search_patch=patch.object(server,'web_research',return_value={'report':'합성 검색 자료','sources':[]})
        self.search_patch.start();self.addCleanup(self.search_patch.stop)

    def envelope(self,content,finish='stop'):
        return json.dumps({'choices':[{'finish_reason':finish,'message':{'content':content}}]}).encode()
    def test_malformed_then_valid_retries_without_inventing_candidates(self):
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'test'}), patch.object(server,'request_bytes',side_effect=[self.envelope('{broken'),self.envelope('{"candidates":[],"note":""}')]) as call:
            self.assertEqual(server.ai_candidates({'items':[]})['candidates'],[])
        self.assertEqual(call.call_count,2)
    def test_truncation_and_schema_failure_have_distinct_messages(self):
        for content,finish,expected in [('{','length','출력 한도'),('{}','stop','후보 목록')]:
            with self.subTest(finish=finish), patch.dict(os.environ,{'OPENROUTER_API_KEY':'test'}), patch.object(server,'request_bytes',return_value=self.envelope(content,finish)) as call:
                with self.assertRaisesRegex(server.ApiError,expected):server.ai_candidates({'items':[]})
                self.assertEqual(call.call_count,2)
    def test_text_blocks_and_uppercase_fence(self):
        blocks=[{'type':'text','text':'```JSON\n{"candidates":[]}\n```'}]
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'test'}),patch.object(server,'request_bytes',return_value=self.envelope(blocks)):
            self.assertEqual(server.ai_candidates({'items':[]})['candidates'],[])

class ContextBundleTests(unittest.TestCase):
    def setUp(self):
        self.items=[{'id':'item-'+str(n),'name':name,'purpose':'법정 신고','type':'collect','context':'collect','classification':kind} for n,(name,kind) in enumerate([('성명','general'),('건강정보','sensitive'),('여권번호','unique'),('주민등록번호','rnn')])]
        self.data={'type':'collect','basisCode':'statutory','law':'시험법','article':'10','items':self.items,'additionalBasisCodes':['sensitiveLaw','uniqueLaw','residentLaw']}
    def test_common_context_accepts_mixed_classes_and_verifies_all_permissions(self):
        def verify(data):return {'law':'시험법','basisCode':data['basisCode'],'excerpt':'공식 검증 원문','verified':True,'pipaVerified':True}
        with patch.object(server,'verify_with_basis',side_effect=verify) as call,patch.object(server,'ai_application_review') as ai:
            result=server.apply_reviewed_basis(self.data,b'secret')
        self.assertEqual(call.call_count,4);ai.assert_not_called()
        self.assertEqual([p['basisCode'] for p in result['additionalGrounds']],self.data['additionalBasisCodes'])
    def test_unrelated_permissions_and_cross_contexts_rejected(self):
        with patch.object(server,'verify_with_basis',return_value={'law':'시험법'}):
            with self.assertRaises(server.ApiError):server.apply_reviewed_basis({**self.data,'items':[self.items[0]],'additionalBasisCodes':['residentLaw']},b'secret')
            with self.assertRaises(server.ApiError):server.apply_reviewed_basis({**self.data,'items':[{**self.items[0],'context':'provide'}]},b'secret')
    def test_permission_failure_does_not_return_partial_bundle(self):
        def verify(data):
            if data['basisCode']=='uniqueLaw':raise server.ApiError('없는 허용 조문',422)
            return {'law':'시험법','basisCode':data['basisCode'],'verified':True}
        with patch.object(server,'verify_with_basis',side_effect=verify):
            with self.assertRaises(server.ApiError):server.apply_reviewed_basis(self.data,b'secret')
    @patch.object(server,'web_research',return_value={'report':'합성 검색 자료','sources':[]})
    def test_search_prompt_requires_actual_business_laws(self, research):
        response={'choices':[{'message':{'content':json.dumps({'candidates':[]})}}]}
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'test'}),patch.object(server,'request_bytes',return_value=json.dumps(response).encode()) as call:
            server.ai_candidates({'items':self.items})
        payload=json.loads(call.call_args.args[1]);prompt=payload['messages'][0]['content']
        self.assertIn('소득세법',prompt);self.assertIn('주민등록번호',prompt);self.assertIn('구체적 처리 허용',prompt)

class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv=server.make_server(port=0)
        cls.thread=threading.Thread(target=cls.srv.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.srv.server_port}'
    @classmethod
    def tearDownClass(cls):cls.srv.shutdown();cls.srv.server_close();cls.thread.join()
    def call(self,path,data=None,csrf=True,origin=None):
        headers={'Content-Type':'application/json'}
        if csrf:headers['X-CSRF-Token']=self.srv.csrf
        if origin:headers['Origin']=origin
        req=urllib.request.Request(self.base+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
        try:
            with urllib.request.urlopen(req) as r:return r.status,r.read()
        except urllib.error.HTTPError as e:return e.code,e.read()
    def test_private_files_not_served(self):
        for path in ['/.env','/.env.example','/.git/config','/server.py','/tests/test_server.py','/%2eenv','/export-assets/../.env']:
            self.assertEqual(self.call(path)[0],404,path)
    def test_static_and_status_do_not_return_credentials(self):
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':'private-test-key','LAW_API_OC':'private-oc'}):
            status,data=self.call('/api/status')
        self.assertEqual(status,200);self.assertNotIn(b'private',data)
        self.assertTrue(json.loads(data)['aiConfigured'])
        self.assertEqual(self.call('/app.js')[0],200)
    def test_csrf_and_cross_origin_rejected(self):
        self.assertEqual(self.call('/api/privacy/classify',{'items':[]},csrf=False)[0],403)
        self.assertEqual(self.call('/api/law/search',{'items':[]},csrf=False)[0],403)
        self.assertEqual(self.call('/api/law/search',{'items':[]},origin='https://other.example')[0],403)
    def test_missing_api_configuration_is_explicit(self):
        with patch.dict(os.environ,{'LAW_API_OC':'','OPENROUTER_API_KEY':''}):
            status,data=self.call('/api/law/search',{'items':[{'name':'성명','type':'required'}]})
        self.assertEqual(status,503);self.assertIn('LAW_API_OC',data.decode())
    def test_full_ai_to_official_api_chain(self):
        import urllib.parse
        seen=[]
        pipa_search=SEARCH.replace('시험법'.encode(),'개인정보 보호법'.encode()).replace(b'>123<',b'>456<')
        pipa_body=BODY.replace('시험법'.encode(),'개인정보 보호법'.encode()).replace(b'>10<',b'>15<').replace('<호번호>1.</호번호>'.encode(),'<호번호>2.</호번호>'.encode())
        def transport(url,payload=None,headers=None,timeout=15):
            seen.append(url.split('?')[0])
            if 'openrouter.ai' in url:
                request=json.loads(payload)
                if url.endswith('/responses'):
                    self.assertEqual(request['tools'][0]['type'],'openrouter:web_search')
                    return json.dumps({'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':'합성 자료: 시험법 제10조','annotations':[{'type':'url_citation','url':'https://www.law.go.kr/synthetic','title':'합성 출처'}]}]}]}).encode()
                self.assertEqual(request['model'],'openai/gpt-oss-120b')
                self.assertEqual(headers['Authorization'],'Bearer server-private-token')
                self.assertNotIn('server-private-token',payload.decode())
                plan={'candidates':[{'law':'시험법','article':'10','paragraph':'1','clause':'1','basisCode':'statutory','type':'required','excerpt':'가짜 AI 원문'}]}
                material=json.loads(request['messages'][1]['content'])
                if 'officialEvidence' not in material:
                    self.assertIn('research', material)
                    self.assertIn('합성 자료', material['research']['report'])
                if 'officialEvidence' in material:
                    self.assertIn('테스트 호', str(material['officialEvidence']))
                    plan={'items':[{'id':i['id'],'verdict':'possible','explanation':'합성 검토','checks':[]} for i in material['items']]}
                return json.dumps({'choices':[{'message':{'content':json.dumps(plan)}}]}).encode()
            query=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
            if 'lawSearch' in url:
                return pipa_search if query['query'][0]=='개인정보 보호법' else SEARCH
            # Both fixture versions use MST 123; use the call order after the second search.
            return pipa_body if query.get('MST')==['456'] else BODY
        data={'items':[{'name':'성명','type':'required','context':'collect','classification':'general'}]}
        with patch.dict(os.environ,{'LAW_API_OC':'server-private-oc','OPENROUTER_API_KEY':'server-private-token'}),patch.object(server,'request_bytes',side_effect=transport):
            status,body=self.call('/api/law/search',data)
        self.assertEqual(status,200,body)
        result=json.loads(body)['candidates'][0]
        self.assertEqual(result['excerpt'],'테스트 호')
        self.assertTrue(result['pipaVerified'])
        self.assertNotIn(b'server-private',body)
        self.assertEqual(len(seen),7)

    def test_catalog_http_needs_no_ai_key(self):
        with patch.dict(os.environ,{'OPENROUTER_API_KEY':''}),patch.object(server,'law_request',return_value=server.xml(SEARCH)):
            status,body=self.call('/api/law/catalog',{'query':'시험','page':1})
        self.assertEqual(status,200)
        self.assertEqual(len(json.loads(body)['laws']),2)
        self.assertEqual(self.call('/api/law/articles',{'law':'시험법','mst':'123'},csrf=False)[0],403)
    def test_review_and_apply_http_validate_signed_scope(self):
        data={'basisCode':'contract','type':'required','items':[{'id':'http-item','name':'성명','purpose':'계약 체결','recipient':'','type':'required','context':'collect','classification':'general'}]}
        actual={'law':'개인정보 보호법','article':'15','paragraph':'1','clause':'4','mst':'123','basisCode':'contract','type':'required','excerpt':'테스트 원문','pipa':{'excerpt':'테스트 연결 근거'},'verified':True,'pipaVerified':True}
        review={'summary':'검토 완료','items':[{'id':'http-item','name':'성명','verdict':'possible','explanation':'테스트 검토 의견','checks':[]}],'canApply':True,'model':'test-model'}
        with patch.object(server,'verify_with_basis',return_value=actual),patch.object(server,'ai_application_review',return_value=review):
            status,body=self.call('/api/law/review',data)
            self.assertEqual(status,200)
            token=json.loads(body)['review']['token']
            status,result=self.call('/api/law/apply',{**data,'reviewToken':token})
            self.assertEqual(status,200);self.assertTrue(json.loads(result)['reviewConfirmed'])
            changed={**data,'items':[{**data['items'][0],'purpose':'다른 처리 목적'}],'reviewToken':token}
            self.assertEqual(self.call('/api/law/apply',changed)[0],409)
            self.assertEqual(self.call('/api/law/apply',data,csrf=False)[0],403)

    def test_demo_must_be_explicitly_enabled(self):
        self.srv.demo=False
        data={'items':[{'name':'성명','context':'collect','type':'required'}],'demo':True}
        self.assertEqual(self.call('/api/law/search',data)[0],403)
        self.srv.demo=True
        status,body=self.call('/api/law/search',data)
        self.assertEqual(status,200);self.assertFalse(json.loads(body)['candidates'][0]['verified'])
        self.srv.demo=False

class SearchCacheTests(unittest.TestCase):
    def test_verified_summary_excludes_rejected_proposals_from_display_count(self):
        result=server.search_outcome([{}, {}, {}],[{'reason':'not_verified'},{'reason':'not_verified'}],5)
        self.assertEqual(result['summary'],'확인된 근거는 총 3개입니다. 0개는 조회를 완료하지 못했고, 2개는 검증을 통과하지 못했습니다.')
        self.assertEqual(result['counts']['checked'],5)
        self.assertEqual(result['counts']['verified'],3)

    def setUp(self):
        with server.LAW_CACHE_LOCK:
            server.LAW_CACHE.clear()

    def tearDown(self):
        with server.LAW_CACHE_LOCK:
            server.LAW_CACHE.clear()

    def test_search_verifies_all_proposals_without_a_five_candidate_cap(self):
        candidates = [{'law':'시험법','article':str(n+1),'basisCode':'statutory','type':'collect'} for n in range(7)]
        context = {'items':[{'name':'성명','purpose':'합성 업무','type':'collect','context':'collect','classification':'general'}]}
        with patch.dict(os.environ, {'LAW_API_OC':'synthetic-five'}), patch.object(server,'ai_candidates',return_value={'candidates':candidates}), patch.object(server,'verify_with_basis',side_effect=lambda c:{**c,'verified':True}) as verify, patch.object(server,'ai_application_review',side_effect=lambda c,items:{'summary':'합성 검토','items':[dict(i,verdict='possible',explanation='합성 검토',checks=[]) for i in items]}):
            result = server.search(context)
        self.assertEqual(verify.call_count,7)
        self.assertEqual([c['article'] for c in result['candidates']],['1','2','3','4','5','6','7'])
        self.assertEqual(result['outcome'],'verified')
        self.assertFalse(result['limited'])
        self.assertIsNone(result['limit'])

    def test_empty_and_failed_verification_are_not_the_same_as_no_legal_basis(self):
        for rejected, checked, expected in [([],0,'no_candidates'),([{'reason':'not_verified'}],1,'unverified'),([{'reason':'timeout'}],1,'unavailable')]:
            result = server.search_outcome([],rejected,checked)
            self.assertEqual(result['outcome'],expected)
            self.assertNotEqual(result['summary'],'법적 근거가 없습니다.')
        partial = server.search_outcome([{}],[{'reason':'service_unavailable'}],2)
        self.assertEqual(partial['outcome'],'partial')
        self.assertEqual(partial['counts']['unavailable'],1)

    def test_cache_ttl_and_fresh_application_scope(self):
        clock=[1000.0]
        def fetch(url, **kwargs):
            return BODY if 'lawService.do' in url else SEARCH
        with patch.dict(os.environ, {'LAW_API_OC':'synthetic-ttl'}), patch.object(server,'request_bytes',side_effect=fetch) as network, patch.object(server.time,'monotonic',side_effect=lambda:clock[0]):
            server.law_request('lawSearch.do',query='시험법')
            server.law_request('lawSearch.do',query='시험법')
            self.assertEqual(network.call_count,1)
            clock[0]+=301
            server.law_request('lawSearch.do',query='시험법')
            self.assertEqual(network.call_count,2)
            server.law_request('lawService.do',MST='123')
            clock[0]+=301
            server.law_request('lawService.do',MST='123')
            self.assertEqual(network.call_count,3)
            with server.fresh_law_requests():
                server.law_request('lawService.do',MST='123')
                server.law_request('lawService.do',MST='123')
            self.assertEqual(network.call_count,4)
            clock[0]+=3601
            server.law_request('lawService.do',MST='123')
            self.assertEqual(network.call_count,5)
        self.assertFalse(getattr(server.LAW_CONTEXT,'fresh',False))

    def test_failed_law_request_is_not_cached_and_timeout_stays_distinct(self):
        with patch.dict(os.environ, {'LAW_API_OC':'synthetic-failure'}), patch.object(server,'request_bytes',side_effect=server.ApiError('조회 시간 초과',504)) as network:
            for _ in range(2):
                with self.assertRaises(server.ApiError):server.law_request('lawSearch.do',query='시험법')
            self.assertEqual(network.call_count,2)
        with patch.object(server.urllib.request,'urlopen',side_effect=TimeoutError()):
            with self.assertRaises(server.ApiError) as error:server.request_bytes('https://www.law.go.kr/DRF/lawSearch.do')
            self.assertEqual(error.exception.status,504)


class StatutoryInstrumentTests(unittest.TestCase):
    def test_ministerial_rules_are_searchable_and_statute_reserved_permissions_remain_checked(self):
        with patch.object(server,'verify_citation',return_value={'law':'시험법 시행규칙','kind':'부령','verified':True}), patch.object(server,'verify_basis',return_value=dict.fromkeys(['pipa','pipaParagraph','pipaVerified','support','supportVerified'])):
            self.assertEqual(server.verify_with_basis({'law':'시험법 시행규칙','basisCode':'statutory'})['kind'],'부령')
            with self.assertRaises(server.ApiError):server.verify_with_basis({'law':'시험법 시행규칙','basisCode':'residentLaw'})
            with self.assertRaises(server.ApiError):server.verify_with_basis({'law':'시험법 시행규칙','basisCode':'extraLaw'})
        with patch.object(server,'verify_basis') as basis:
            with self.assertRaises(server.ApiError):server.verify_with_basis({'target':'admrul','basisCode':'contract'})
            basis.assert_not_called()


if __name__=='__main__':unittest.main()

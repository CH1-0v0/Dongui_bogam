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
        self.assertEqual(v['mst'],'123')
        self.assertNotIn('OC=', v['sourceUrl'])
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
        for candidate in [dict(law='개인정보 보호법',article='15',paragraph='1',clause='2'), dict(law='개인정보 보호법 시행령',article='1'), dict(law='행정규칙',article='1',target='admrul')]:
            with self.assertRaises(server.ApiError):server.verify_with_basis({'basisCode':'statutory',**candidate})
    def test_non_law_ground_only_fetches_its_pipa_basis(self):
        pipa={'law':'개인정보 보호법','article':'15','paragraph':'1','clause':'5','excerpt':'테스트 긴급 요건','verified':True}
        with patch.object(server,'verify_citation',return_value=pipa) as fetch:
            result=server.verify_with_basis({'basisCode':'emergency','type':'required','reason':'테스트 사실관계'})
        self.assertEqual(fetch.call_count,2)
        self.assertTrue(result['pipaVerified'])
        self.assertEqual(result['law'],'개인정보 보호법')
    def test_counts_only_current_laws_and_decrees(self):
        body=SEARCH.replace(b'</LawSearch>', '<law><법령구분명>총리령</법령구분명><법령일련번호>444</법령일련번호><시행일자>20200101</시행일자></law></LawSearch>'.encode())
        with patch.object(server,'law_request',return_value=server.xml(body)):
            result=server.count_law_catalog({'query':'시험'})
        self.assertEqual(result,{'count':2,'cursor':None})
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
        self.assertEqual(len(results['laws']),2)
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
    def test_admin_is_opt_in_and_plaintext_reference_only(self):
        catalog='<AdmRulSearch><totalCnt>1</totalCnt><admrul><행정규칙명>테스트규정</행정규칙명><행정규칙일련번호>777</행정규칙일련번호><시행일자>20200101</시행일자></admrul></AdmRulSearch>'.encode()
        detail='<행정규칙><행정규칙명>테스트규정</행정규칙명><본문><![CDATA[<p>참고 조항</p><script>bad()</script>]]></본문></행정규칙>'.encode()
        with patch.object(server,'law_request',return_value=server.xml(catalog)) as request:
            results=server.search_law_catalog({'query':'테스트','target':'admrul'})
        self.assertEqual(request.call_args.kwargs['target'],'admrul')
        self.assertEqual(results['laws'][0]['kind'],'행정규칙')
        with patch.object(server,'law_request',return_value=server.xml(detail)):
            result=server.law_article_catalog({'law':'테스트규정','mst':'777','target':'admrul'})
        self.assertTrue(result['referenceOnly']);self.assertNotIn('bad()',result['text'])

    def test_catalog_fills_five_eligible_results_and_cursor_retains_remainder(self):
        def row(index,kind='법률'):
            return f'<law><법령명한글>시험법 {index}</법령명한글><법령구분명>{kind}</법령구분명><법령일련번호>{100+index}</법령일련번호><시행일자>20200101</시행일자></law>'
        body=('<LawSearch><totalCnt>8</totalCnt>'+row(0,'부령')+row(1,'부령')+''.join(row(i) for i in range(2,8))+'</LawSearch>').encode()
        with patch.object(server,'law_request',return_value=server.xml(body)):
            first=server.search_law_catalog({'query':'시험'})
            second=server.search_law_catalog({'query':'시험','cursor':first['cursor']})
        self.assertEqual(len(first['laws']),5)
        self.assertEqual(len(second['laws']),1)
        self.assertFalse(second['hasNext'])
        self.assertEqual(len({l['mst'] for l in first['laws']+second['laws']}),6)
    def test_catalog_fills_across_raw_pages(self):
        rejected=''.join(f'<law><법령명한글>제외 {i}</법령명한글><법령구분명>부령</법령구분명><법령일련번호>{i+1}</법령일련번호><시행일자>20200101</시행일자></law>' for i in range(20))
        accepted=''.join(f'<law><법령명한글>법률 {i}</법령명한글><법령구분명>법률</법령구분명><법령일련번호>{i+101}</법령일련번호><시행일자>20200101</시행일자></law>' for i in range(6))
        with patch.object(server,'law_request',side_effect=[server.xml(('<LawSearch><totalCnt>26</totalCnt>'+rejected+'</LawSearch>').encode()),server.xml(('<LawSearch><totalCnt>26</totalCnt>'+accepted+'</LawSearch>').encode())]) as call:
            result=server.search_law_catalog({'query':'법률'})
        self.assertEqual(len(result['laws']),5);self.assertEqual(call.call_count,2)
        self.assertEqual(result['cursor'],{'target':'law','page':2,'offset':5})
    def test_catalog_can_fill_five_across_law_and_opt_in_admin(self):
        admin='<AdmRulSearch><totalCnt>4</totalCnt>'+''.join(f'<admrul><행정규칙명>행정 {i}</행정규칙명><행정규칙일련번호>{i+500}</행정규칙일련번호><시행일자>20200101</시행일자></admrul>' for i in range(4))+'</AdmRulSearch>'
        with patch.object(server,'law_request',side_effect=[server.xml(SEARCH),server.xml(admin.encode())]):
            result=server.search_law_catalog({'query':'시험','includeAdmin':True})
        self.assertEqual(len(result['laws']),5);self.assertEqual(result['cursor']['target'],'admrul')
        with self.assertRaises(server.ApiError):server.search_law_catalog({'query':'시험','cursor':result['cursor']})
    def test_catalog_partial_scan_is_resumable_not_false_empty(self):
        body='<LawSearch><totalCnt>10000</totalCnt>'+''.join(f'<law><법령명한글>제외 {i}</법령명한글><법령구분명>부령</법령구분명><법령일련번호>{i+1}</법령일련번호><시행일자>20200101</시행일자></law>' for i in range(20))+'</LawSearch>'
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
                self.assertEqual(request['model'],'openai/gpt-oss-120b')
                self.assertEqual(headers['Authorization'],'Bearer server-private-token')
                self.assertNotIn('server-private-token',payload.decode())
                plan={'candidates':[{'law':'시험법','article':'10','paragraph':'1','clause':'1','basisCode':'statutory','type':'required','excerpt':'가짜 AI 원문'}]}
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
        self.assertEqual(len(seen),5)

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

if __name__=='__main__':unittest.main()

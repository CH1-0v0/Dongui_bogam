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
SEARCH='''<LawSearch><law><법령명한글>시험법</법령명한글><법령일련번호>123</법령일련번호><시행일자>20200101</시행일자></law><law><법령명한글>시험법 시행령</법령명한글><법령일련번호>999</법령일련번호><시행일자>20200101</시행일자></law></LawSearch>'''.encode()
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
        actual={'law':'시험법','excerpt':'공식 API 테스트 원문','verified':True}
        with patch.object(server,'verify_citation',side_effect=[actual,{'excerpt':'연결 조항'}]):
            result=server.verify_with_basis({'basisCode':'statutory','excerpt':'AI가 만든 가짜 원문'})
        self.assertEqual(result['excerpt'],'공식 API 테스트 원문')
        self.assertTrue(result['pipaVerified'])
    def test_upstream_error_does_not_leak_key(self):
        e=urllib.error.HTTPError('https://example.test/?OC=secret',403,'secret',{},None)
        with patch.object(urllib.request,'urlopen',side_effect=e):
            with self.assertRaises(server.ApiError) as got:server.request_bytes('https://example.test')
        self.assertNotIn('secret',str(got.exception))

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
        pipa_search=SEARCH.replace('시험법'.encode(),'개인정보 보호법'.encode())
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
            return pipa_body if seen.count('https://www.law.go.kr/DRF/lawSearch.do')==2 else BODY
        data={'items':[{'name':'성명','type':'required','context':'collect','classification':'general'}]}
        with patch.dict(os.environ,{'LAW_API_OC':'server-private-oc','OPENROUTER_API_KEY':'server-private-token'}),patch.object(server,'request_bytes',side_effect=transport):
            status,body=self.call('/api/law/search',data)
        self.assertEqual(status,200,body)
        result=json.loads(body)['candidates'][0]
        self.assertEqual(result['excerpt'],'테스트 호')
        self.assertTrue(result['pipaVerified'])
        self.assertNotIn(b'server-private',body)
        self.assertEqual(len(seen),5)

    def test_demo_must_be_explicitly_enabled(self):
        self.srv.demo=False
        data={'items':[{'name':'성명','context':'collect','type':'required'}],'demo':True}
        self.assertEqual(self.call('/api/law/search',data)[0],403)
        self.srv.demo=True
        status,body=self.call('/api/law/search',data)
        self.assertEqual(status,200);self.assertFalse(json.loads(body)['candidates'][0]['verified'])
        self.srv.demo=False

if __name__=='__main__':unittest.main()

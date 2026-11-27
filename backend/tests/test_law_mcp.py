import unittest
from unittest.mock import patch
from backend.law_mcp import search_xml, law_xml, LawMcp
from backend import server
SEARCH='1. 합성법 [현행]\n   - 법령ID: 001\n   - MST: 123\n   - 공포일: 20260101 / 시행일: 20260101\n   - 구분: 법률\n'
BODY='법령명: 합성법\n시행일: 20260101\n\n제10조 기록\n제10조(기록)\n① 성명을 기록한다.\n1. 첫째 사항\n2의3. 둘째 사항\n② 5년간 보존한다.\n'
class McpTests(unittest.TestCase):
    def test_exact_current(self):
        self.assertEqual(search_xml(SEARCH,'합성법','20261126')[0].findtext('법령일련번호'),'123')
        for value in [SEARCH.replace('[현행]','[연혁]'),SEARCH+SEARCH,SEARCH.replace('법률','훈령')]:
            with self.assertRaises(ValueError):search_xml(value,'합성법','20261126')
    def test_structure(self):
        root=law_xml(BODY,'합성법','20260101','10')
        self.assertEqual(root.findtext('.//호[호번호="2의3"]/호내용'),'2의3. 둘째 사항')
        self.assertIn('5년',root.findtext('.//항[항번호="②"]/항내용'))
    def test_reject_incomplete(self):
        for raw in [BODY+'응답이 잘렸습니다.',BODY.replace('합성법','다른법'),BODY.replace('20260101','20250101')]:
            with self.assertRaises(ValueError):law_xml(raw,'합성법','20260101','10')
    def test_api_priority(self):
        client=LawMcp();token=server.MCP_CONTEXT.set(client)
        try:
            with patch.object(client,'law',side_effect=AssertionError('MCP should not run')),patch.dict(server.os.environ,{'LAW_API_OC':'synthetic'}),patch.object(server,'request_bytes',return_value=b'<LawSearch><totalCnt>0</totalCnt></LawSearch>') as api:
                server.law_request('lawSearch.do',query='API priority');api.assert_called_once()
        finally:server.MCP_CONTEXT.reset(token)
    def test_fallback(self):
        client=LawMcp();token=server.MCP_CONTEXT.set(client)
        try:
            with patch.object(server,'api_law_request',side_effect=server.ApiError('synthetic outage',503)),patch.object(client,'law',return_value=search_xml(SEARCH,'합성법','20261126')) as mcp:
                root=server.law_request('lawSearch.do',query='合成fallback');self.assertEqual(root.get('retrievalProvider'),'mcp');mcp.assert_called_once()
        finally:server.MCP_CONTEXT.reset(token)
    def test_toc(self):
        client=LawMcp();client.rows['123']=('합성법','20260101');client.terms={'기록':2}
        with patch.object(client,'tool',side_effect=['법령명: 합성법\n시행일: 20260101\n목차 (총 21개 조문)\n제10조 기록\n제11조 기타\n',BODY]) as tool:
            root=client.law('lawService.do',{'MST':'123'});self.assertIn('성명',root.findtext('.//항내용'));self.assertEqual(tool.call_count,2);self.assertEqual(tool.call_args.args[1]['efYd'],'20260101')

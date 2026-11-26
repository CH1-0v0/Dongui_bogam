"""Bounded remote MCP transport and conservative legal text conversion."""
import datetime as dt
import json
import os
import re
import threading
import urllib.request
import xml.etree.ElementTree as ET

URL = 'https://mcp.gomdori.app/law'
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def search_xml(raw, name, today):
    root = ET.Element('LawSearch')
    pattern = r'^\d+\. ([^\n]+)\n\s*- 법령ID: (\d+)\n\s*- MST: (\d+)\n\s*- 공포일: (\d{8}) / 시행일: (\d{8})\n\s*- 구분: ([^\n]+)'
    for m in re.finditer(pattern, raw, re.M):
        if m[1].strip() != name+' [현행]' or m[5] > today or not re.fullmatch(r'법률|대통령령|총리령|.*부령',m[6].strip()):continue
        row = ET.SubElement(root,'law')
        for k,v in [('법령명한글',name),('법령일련번호',m[3]),('시행일자',m[5]),('법령구분명',m[6].strip())]:ET.SubElement(row,k).text=v
    if len(root)!=1:raise ValueError('Uncertain current law')
    return root

def law_xml(raw,name,date,jo=''):
    raw=re.sub(r'\n부칙 \d+건: get_law_text\([^\n]*\)\s*$', '', raw)
    if not raw.startswith('법령명: '+name+'\n') or '시행일: '+date+'\n' not in raw or re.search(r'\[NOT_FOUND\]|\[EMPTY_BODY\]|\[응답 크기 제한\]|\[참고\]|중간 생략|이하 생략|잘렸|truncat|응답.*초과|최대.*글자',raw,re.I):raise ValueError('Incomplete law')
    matches=list(re.finditer(r'^제(\d+)조(?:의(\d+))?(?: ([^\n]*))?\n',raw,re.M))
    if not matches:raise ValueError('No articles')
    root=ET.Element('법령');ET.SubElement(ET.SubElement(root,'기본정보'),'법령명_한글').text=name
    articles=ET.SubElement(root,'조문')
    for i,m in enumerate(matches):
        number=str(int(m[1]))+('의'+str(int(m[2])) if m[2] else '')
        if jo and number!=jo:raise ValueError('Wrong article')
        body=raw[m.end():matches[i+1].start() if i+1<len(matches) else len(raw)].strip()
        if not body or re.match(r'^삭제(?:\s|$)',body):raise ValueError('Missing article body')
        unit=ET.SubElement(articles,'조문단위')
        for k,v in [('조문여부','조문'),('조문번호',m[1]),('조문가지번호',m[2] or '0'),('조문제목',m[3] or '')]:ET.SubElement(unit,k).text=v
        target=ET.SubElement(unit,'조문내용');para=None
        for line in body.split('\n'):
            p=re.match(r'^([①-⑳㉑-㉟])\s*',line);c=re.match(r'^(\d+(?:의\d+)?)\.\s',line)
            if p:
                para=ET.SubElement(unit,'항');ET.SubElement(para,'항번호').text=p[1];target=ET.SubElement(para,'항내용')
            elif c:
                clause=ET.SubElement(para if para is not None else unit,'호');ET.SubElement(clause,'호번호').text=c[1];target=ET.SubElement(clause,'호내용')
            target.text=(target.text+'\n' if target.text else '')+line
    return root

class LawMcp:
    def __init__(self):
        self.terms={};self.session='';self.ident=0;self.ready=False;self.rows={};self.memo={};self.lock=threading.RLock()
    def rpc(self,method,params,notification=False):
        if getattr(self,'unavailable',False):raise ValueError('MCP unavailable for this request')
        try:return self.request_rpc(method,params,notification)
        except Exception:
            self.unavailable=True
            raise
    def request_rpc(self,method,params,notification=False):
        if os.getenv('LAW_MCP_URL',URL)!=URL:raise ValueError('Unsupported MCP endpoint')
        self.ident+=1;ident=self.ident
        data={'jsonrpc':'2.0','method':method,'params':params}
        if not notification:data['id']=ident
        headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','apikey':os.getenv('LAW_API_OC',''),'MCP-Protocol-Version':'2025-03-26'}
        if self.session:headers['Mcp-Session-Id']=self.session
        request=urllib.request.Request(URL,data=json.dumps(data).encode(),headers=headers,method='POST')
        with urllib.request.build_opener(NoRedirect()).open(request,timeout=20) as response:
            self.session=response.headers.get('Mcp-Session-Id',self.session)
            if notification:return
            if 'text/event-stream' in response.headers.get('Content-Type',''):
                size=0;parts=[];result=None
                for line in response:
                    size+=len(line)
                    if size>2_000_000:raise ValueError('Response too large')
                    line=line.decode('utf-8').rstrip('\r\n')
                    if line.startswith('data:'):parts.append(line[5:].lstrip())
                    elif not line and parts:
                        candidate=json.loads('\n'.join(parts));parts=[]
                        if candidate.get('id')==ident:result=candidate;break
                if result is None:raise ValueError('Missing RPC response')
            else:
                raw=response.read(2_000_001)
                if len(raw)>2_000_000:raise ValueError('Response too large')
                result=json.loads(raw)
        if result.get('id')!=ident or result.get('error') or not isinstance(result.get('result'),dict):raise ValueError('MCP RPC failed')
        return result['result']
    def tool(self,name,args):
        if not self.ready:
            self.rpc('initialize',{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'dongui-bogam','version':'1'}})
            self.rpc('notifications/initialized',{},True);self.ready=True
        result=self.rpc('tools/call',{'name':name,'arguments':args})
        if result.get('isError') or not isinstance(result.get('content'),list) or any(c.get('type')!='text' for c in result['content']):raise ValueError('MCP tool failed')
        return '\n'.join(c['text'] for c in result['content'])
    def law(self,endpoint,params):
        with self.lock:
            key=json.dumps([endpoint,params],sort_keys=True)
            if key in self.memo:return self.memo[key]
            if endpoint=='lawSearch.do':
                name=params['query'];today=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).strftime('%Y%m%d')
                root=search_xml(self.tool('search_law',{'query':name,'display':20}),name,today)
                row=root[0];self.rows[row.findtext('법령일련번호')]=(name,row.findtext('시행일자'))
            elif endpoint=='lawService.do' and str(params.get('MST')) in self.rows:
                name,date=self.rows[str(params['MST'])];code=params.get('JO','');jo=str(int(code[:4]))+('의'+str(int(code[4:])) if int(code[4:]) else '') if code else ''
                args={'mst':str(params['MST']),'efYd':date}
                if jo:args['jo']='제'+jo.replace('의','조의')+('' if '의' in jo else '조')
                body=self.tool('get_law_text',args)
                if not jo and '목차 (총 ' in body:
                    titles=[(m[1]+('의'+m[2] if m[2] else ''),m[3] or '') for m in re.finditer(r'^제(\d+)조(?:의(\d+))?(?: ([^\n]*))?$',body,re.M)]
                    ranked=sorted([(sum(w for t,w in self.terms.items() if t in title),number,title) for number,title in titles],key=lambda t:-t[0])
                    ranked=[t for t in ranked if t[0]>0];chosen=[]
                    for axis in ['식별정보|주민등록번호|민감정보','보존|보유|보관','기재사항|기록사항']:
                        hit=next((t for t in ranked if re.search(axis,t[2])),None)
                        if hit and hit not in chosen:chosen.append(hit)
                    for t in ranked:
                        if len(chosen)<4 and t not in chosen:chosen.append(t)
                    if not chosen:raise ValueError('No relevant articles in TOC')
                    root=ET.Element('법령');ET.SubElement(ET.SubElement(root,'기본정보'),'법령명_한글').text=name;articles=ET.SubElement(root,'조문')
                    for _,number,_ in chosen:
                        code=number.split('의');document=self.law(endpoint,{'MST':params['MST'],'JO':code[0].zfill(4)+(code[1] if len(code)>1 else '0').zfill(2)})
                        articles.extend(document.findall('./조문/조문단위'))
                else:root=law_xml(body,name,date,jo)
            else:raise ValueError('Unsupported MCP lookup')
            self.memo[key]=root;return root

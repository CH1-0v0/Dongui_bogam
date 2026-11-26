// Narrow MCP client: only public law identifiers are sent, never work/chat data.
const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const tag=(k,v)=>`<${k}>${escape(v)}</${k}>`;
export function searchXml(raw,name,today){
 const rows=[];
 for(const m of raw.matchAll(/^\d+\. ([^\n]+)\n\s*- 법령ID: (\d+)\n\s*- MST: (\d+)\n\s*- 공포일: (\d{8}) \/ 시행일: (\d{8})\n\s*- 구분: ([^\n]+)/gm)){
  if(m[1].trim()!==name+' [현행]'||m[5]>today||!(/^(법률|대통령령|총리령|.*부령)$/.test(m[6].trim())))continue;
  rows.push('<law>'+tag('법령명한글',name)+tag('법령일련번호',m[3])+tag('시행일자',m[5])+tag('법령구분명',m[6].trim())+'</law>');
 }
 if(rows.length!==1)throw Error('Uncertain current law');
 return '<LawSearch>'+rows.join('')+'</LawSearch>';
}
export function lawXml(raw,name,date,jo=''){
 raw=raw.replace(/\n부칙 \d+건: get_law_text\([^\n]*\)\s*$/, '');
 if(!raw.startsWith('법령명: '+name+'\n')||!raw.includes('시행일: '+date+'\n')||/\[NOT_FOUND\]|\[EMPTY_BODY\]|\[응답 크기 제한\]|\[참고\]|중간 생략|이하 생략|잘렸|truncat|응답.*초과|최대.*글자/i.test(raw))throw Error('Incomplete law');
 const matches=[...raw.matchAll(/^제(\d+)조(?:의(\d+))?(?: ([^\n]*))?\n/gm)];
 if(!matches.length)throw Error('No articles');
 const units=matches.map((m,i)=>{const number=String(Number(m[1]))+(m[2]?'의'+Number(m[2]):'');if(jo&&number!==jo)throw Error('Wrong article');
  const body=raw.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:raw.length).trim();
  if(!body||/^삭제(?:\s|$)/.test(body))throw Error('Missing article body');
  // Keep source order and preserve exact paragraph/clause text for existing extraction.
  const lines=body.split('\n'),parts=[];let para=null,clause=null;
  const flushClause=()=>{if(clause){(para?para.parts:parts).push('<호>'+tag('호번호',clause.number)+tag('호내용',clause.lines.join('\n'))+'</호>');clause=null;}};
  const flushPara=()=>{flushClause();if(para){parts.push('<항>'+tag('항번호',para.number)+tag('항내용',para.lines.join('\n'))+para.parts.join('')+'</항>');para=null;}};
  let pre=[];
  for(const line of lines){const p=line.match(/^([①-⑳㉑-㉟])\s*/),c=line.match(/^(\d+(?:의\d+)?)\.\s/);
   if(p){flushPara();para={number:p[1],lines:[line],parts:[]};}
   else if(c){flushClause();clause={number:c[1],lines:[line]};}
   else if(clause)clause.lines.push(line);else if(para)para.lines.push(line);else pre.push(line);
  }flushPara();
  return '<조문단위>'+tag('조문여부','조문')+tag('조문번호',m[1])+tag('조문가지번호',m[2]||'0')+tag('조문제목',m[3]||'')+tag('조문내용',pre.join('\n'))+parts.join('')+'</조문단위>';
 });
 return '<법령><기본정보>'+tag('법령명_한글',name)+'</기본정보><조문>'+units.join('')+'</조문></법령>';
}
export class LawMcp {
 constructor(env,send){this.env=env;this.send=send;this.session='';this.id=0;this.rows=new Map();this.memo=new Map();}
 async rpc(method,params,notification=false){
  if(this.unavailable)throw Error('MCP unavailable for this request');
  try{return await this.requestRpc(method,params,notification);}catch(error){this.unavailable=true;throw error;}
 }
 async requestRpc(method,params,notification=false){
  const url=new URL(this.env.LAW_MCP_URL||'https://mcp.gomdori.app/law');
  // Credentials must only reach the reviewed provider, never redirects or user hosts.
  if(url.href!=='https://mcp.gomdori.app/law')throw Error('Unsupported MCP endpoint');
  const id=++this.id,headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream',apikey:this.env.LAW_API_OC,'MCP-Protocol-Version':'2025-03-26'};
  if(this.session)headers['Mcp-Session-Id']=this.session;
  const r=await this.send(url.href,{method:'POST',redirect:'manual',headers,body:JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id}),method,params}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('MCP transport failed');
  const session=r.headers.get('Mcp-Session-Id');if(session)this.session=session;
  if(notification){await r.body?.cancel();return;}
  const reader=r.body.getReader();let bytes=0,raw='';const decoder=new TextDecoder();let message;
  try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2_000_000)throw Error('MCP response too large');raw+=decoder.decode(value,{stream:true});
   if(r.headers.get('content-type')?.includes('text/event-stream')){for(const event of raw.split(/\r?\n\r?\n/).slice(0,-1)){const data=event.split(/\r?\n/).filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trimStart()).join('\n');if(data){const parsed=JSON.parse(data);if(parsed.id===id){message=parsed;break;}}}if(message)break;}
  }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  message??=JSON.parse(raw);if(message.id!==id||message.error||!message.result)throw Error('MCP RPC failed');return message.result;
 }
 async tool(name,args){if(!this.ready)this.ready=(async()=>{await this.rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'dongui-bogam',version:'1'}});await this.rpc('notifications/initialized',{},true);})();await this.ready;
  const result=await this.rpc('tools/call',{name,arguments:args});if(result.isError||!Array.isArray(result.content)||result.content.some(c=>c.type!=='text'))throw Error('MCP tool failed');return result.content.map(c=>c.text).join('\n');
 }
 async law(endpoint,params,today){const key=JSON.stringify([endpoint,Object.entries(params).sort(([a],[b])=>a.localeCompare(b))]);if(this.memo.has(key))return this.memo.get(key);
 const pending=this.lookup(endpoint,params,today);this.memo.set(key,pending);return pending;
 }
 async lookup(endpoint,params,today){
  let raw;if(endpoint==='lawSearch.do'){const name=params.query;raw=searchXml(await this.tool('search_law',{query:name,display:20}),name,today);const mst=raw.match(/<법령일련번호>(\d+)</)?.[1],date=raw.match(/<시행일자>(\d+)</)?.[1];this.rows.set(mst,{name,date});}
  else if(endpoint==='lawService.do'&&this.rows.has(String(params.MST))){const row=this.rows.get(String(params.MST)),code=params.JO,jo=code?String(Number(code.slice(0,4)))+(Number(code.slice(4))?'의'+Number(code.slice(4)):''):'';let body=await this.tool('get_law_text',{mst:String(params.MST),efYd:row.date,...(jo?{jo:'제'+jo.replace('의','조의')+(jo.includes('의')?'':'조')}:{})});
   if(!jo&&body.includes('목차 (총 ')){
    const titles=[...body.matchAll(/^제(\d+)조(?:의(\d+))?(?: ([^\n]*))?$/gm)].map(m=>({number:m[1]+(m[2]?'의'+m[2]:''),title:m[3]||''}));
    const ranked=titles.map(t=>({...t,score:(this.terms||[]).reduce((n,x)=>n+(t.title.includes(x.text)?x.weight:0),0)})).filter(t=>t.score>0).sort((a,b)=>b.score-a.score),chosen=[];
    for(const axis of [/식별정보|주민등록번호|민감정보/,/보존|보유|보관/,/기재사항|기록사항/]){const t=ranked.find(t=>axis.test(t.title));if(t&&!chosen.includes(t)&&chosen.length<(this.maxArticles||4))chosen.push(t);}
    for(const t of ranked)if(chosen.length<(this.maxArticles||4)&&!chosen.includes(t))chosen.push(t);
    if(!chosen.length)throw Error('No relevant articles in TOC');
    const documents=[];for(const t of chosen){const code=t.number.split('의');documents.push(await this.law(endpoint,{MST:params.MST,JO:code[0].padStart(4,'0')+(code[1]||'0').padStart(2,'0')},today));}
    raw='<법령><기본정보>'+tag('법령명_한글',row.name)+'</기본정보><조문>'+documents.map(d=>d.match(/<조문>([\s\S]*)<\/조문>/)[1]).join('')+'</조문></법령>';
   }else raw=lawXml(body,row.name,row.date,jo);}
  else throw Error('Unsupported MCP lookup');return raw;
 }
}

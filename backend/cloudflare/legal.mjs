import {LawMcp} from './law-mcp.mjs';
import {discoveryConfig,discoveryScope,candidateLawNames,normalizeLawName,rankEvidence,groundSelections,hasPermissionText} from './evidence-discovery.mjs';
import {searchPayload,parseSearchResponse,searchFailureCode,retrySearchTokens} from './web-search.mjs';
import {searchOutcome} from './search-outcome.mjs';
import {sealSupportText} from './ai-support.mjs';
import {inspectAiError} from './ai-diagnostics.mjs';
// Cloudflare-native asynchronous adapter. No local Python process or filesystem.
import {XMLParser, XMLValidator} from 'fast-xml-parser';
import rules from '../basis-rules.json' with {type:'json'};
import prompts from './prompts.json' with {type:'json'};
export class ApiError extends Error {constructor(message,status=502,upstreamStatus){super(message);this.status=status;this.upstreamStatus=upstreamStatus;}}
const fail=(message,status=422)=>{throw new ApiError(message,status);};
export const compact=value=>String(value??'').replace(/\s/g,'');
const LAW_KINDS=['법률','대통령령','총리령','부령'];
const isLawKind=kind=>LAW_KINDS.includes(kind)||/(?:부령|총리령)$/.test(kind);
const obj=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const today=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10).replaceAll('-','');
const digits=value=>String(value??'').replace(/\D/g,'');
const children=(n,tag)=>n.children.filter(c=>!tag||c.tag===tag);
const descendants=(n,tag)=>n.children.flatMap(c=>[...(!tag||c.tag===tag?[c]:[]),...descendants(c,tag)]);
const content=n=>n?(n.value||'')+n.children.map(content).join(''):'';
const text=(n,tag)=>content(children(n,tag)[0]).trim();
const find=(n,tag)=>descendants(n,tag)[0];
const parser=new XMLParser({preserveOrder:true,ignoreAttributes:true,trimValues:false,parseTagValue:false,processEntities:true});
function nodes(records){return records.flatMap(record=>Object.entries(record).map(([tag,value])=>tag==='#text'?{tag,value:String(value),children:[]}:{tag,value:'',children:Array.isArray(value)?nodes(value):[]}));}
export function parseXml(raw){
 if(/<!DOCTYPE|<!ENTITY/i.test(raw)||XMLValidator.validate(raw)!==true)fail('법령 API가 허용되지 않는 XML을 반환했습니다.',502);
 const root={tag:'root',children:nodes(parser.parse(raw))};
 if(root.children.some(n=>n.tag.toLowerCase()==='html')||content(root).includes('사용자 정보 검증'))fail('법령 API 인증을 확인할 수 없습니다. 승인된 OC를 확인하세요.',502);
 return root;
}
// DRF also supplies JSON. Native JSON parsing avoids spending the free Worker's
// CPU allowance parsing a whole statute's XML; XML is accepted as a fallback.
function parseLaw(raw){
 if(!raw.trimStart().startsWith('{'))return parseXml(raw);
 let value;try{value=JSON.parse(raw);}catch{fail('법령 API 응답 형식을 확인하지 못했습니다.',502);}
 function convert(tag,value){return {tag,value:value!==null&&typeof value!=='object'?String(value):'',children:value&&typeof value==='object'?Object.entries(value).flatMap(([key,v])=>(Array.isArray(v)?v:[v]).map(item=>convert(key,item))):[]};}
 const root=convert('root',value);if(content(root).includes('사용자 정보 검증'))fail('법령 API 인증을 확인할 수 없습니다. 승인된 OC를 확인하세요.',502);return root;
}
const bodyTags=new Set(['조문내용','항내용','호내용','목내용']);
const legalChildren=n=>[...n.children.filter(c=>bodyTags.has(c.tag)),...n.children.filter(c=>!bodyTags.has(c.tag))];
const excerpt=n=>{const parts=[];function visit(node){if(bodyTags.has(node.tag)){const value=content(node).trim();if(value)parts.push(value);return;}for(const child of legalChildren(node))visit(child);}visit(n);return parts.join('\n');};
const deletedNode=n=>{
 const body=children(n).filter(c=>['조문내용','항내용','호내용','목내용'].includes(c.tag)).map(content).join(' ').trim();
 return text(n,'조문제목')==='삭제'||/^(?:(?:제\d+조(?:의\d+)?(?:\([^)]*\))?|[①-⑳]|\d+(?:의\d+)?\.|[가-힣]\.)\s*)?(?:전문\s*)?삭제(?:\s*[<〈(][^>〉)]*[>〉)])?\s*[.。]?$/.test(body);
};
export function leadingNumber(value){const circles='①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';for(let i=0;i<circles.length;i++)if(value.includes(circles[i]))return String(i+1);const m=value.normalize('NFKC').match(/(\d+)(?:\s*의\s*(\d+))?/);return m?String(Number(m[1]))+(m[2]?'의'+String(Number(m[2])):''):'';}
const number=(value,unit='')=>{const s=compact(value).replace(/^제/,'').replace(new RegExp(unit+'$'),'');if(!/^\d{1,4}(?:의\d{1,3})?$/.test(s))fail('조·항·호 번호를 확인해 주세요.',400);return s;};
const articleLabel=n=>String(Number(text(n,'조문번호')))+(Number(text(n,'조문가지번호'))?'의'+Number(text(n,'조문가지번호')):'');
export function clauseNumber(node){
 const base=leadingNumber(text(node,'호번호'));if(base.includes('의'))return base;
 const branch=leadingNumber(text(node,'호가지번호'));if(base&&branch&&branch!=='0')return base+'의'+branch;
 const inline=text(node,'호내용').match(/^\s*(\d+)의(\d+)\./);return inline&&base===String(Number(inline[1]))?base+'의'+String(Number(inline[2])):base;
}
const clauses=n=>children(n,'호').filter(c=>!deletedNode(c)).map(c=>({value:clauseNumber(c),text:excerpt(c),points:children(c,'목').filter(m=>!deletedNode(m)).map(m=>({value:text(m,'목번호').replace(/\.$/,''),text:excerpt(m)}))})).filter(c=>c.value);
export function articleNode(root,article,paragraph='',clause=''){
 const [major,sub='0']=article.split('의');const matches=descendants(root,'조문단위').filter(n=>text(n,'조문여부')==='조문'&&Number(text(n,'조문번호'))===Number(major)&&Number(text(n,'조문가지번호'))===Number(sub));
 if(matches.length!==1||deletedNode(matches[0]))fail('요청한 조문이 현행 법령 원문에 없습니다.');let node=matches[0];
 if(paragraph){const ps=children(node,'항').filter(p=>leadingNumber(text(p,'항번호'))===paragraph);if(ps.length)node=ps[0];else if(paragraph!=='1'||children(node,'항').some(p=>leadingNumber(text(p,'항번호'))))fail('요청한 항이 현행 조문에 없습니다.');}
 if(deletedNode(node))fail('선택한 조문은 삭제되어 법령 근거로 사용할 수 없습니다.');
 if(clause){const hs=descendants(node,'호').filter(h=>clauseNumber(h)===clause);if(hs.length!==1)fail('요청한 호가 없거나 항 지정이 필요합니다.');node=hs[0];}if(deletedNode(node))fail('선택한 조문은 삭제되어 법령 근거로 사용할 수 없습니다.');return node;
}
const extract=(root,a,p='',c='')=>{const result=excerpt(articleNode(root,a,p,c));if(!result)fail('요청한 조문의 본문을 확인하지 못했습니다.');return result;};
function segments(node){const result=[];function visit(n,clause='',label=''){if(n.tag==='호')clause=clauseNumber(n);if(['항','호','목'].includes(n.tag))label=text(n,{항:'항번호',호:'호번호',목:'목번호'}[n.tag]);if(['조문내용','항내용','호내용','목내용'].includes(n.tag)&&content(n).trim())result.push({text:content(n).trim(),clause,label});for(const c of legalChildren(n))visit(c,clause,label);}visit(node);return result;}
export function validateContext(data){
 if(!Array.isArray(data.items)||data.items.length<1||data.items.length>60)fail('검색할 항목은 1~60개여야 합니다.',400);
 return {items:data.items.map(item=>{if(!obj(item))fail('검색 항목 형식이 올바르지 않습니다.',400);const row={};for(const k of ['name','purpose','recipient','type','context','classification']){const value=item[k]??'';if(typeof value!=='string'||value.length>500)fail('항목명·처리 목적을 500자 이내로 입력하세요.',400);row[k]=value;}
 if(/\d{6}[ -]?[1-8]\d{6}|01[016789][ -]?\d{3,4}[ -]?\d{4}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(Object.values(row).join(' ')))fail('개인정보 원문 대신 항목명과 처리 맥락만 입력하세요.',400);return row;})};
}
export function reviewMaterial(data){const {items}=validateContext(data),rule=rules[data.basisCode];if(!rule||rule.effect==='consent')fail('검토할 처리 근거를 선택하세요.',400);const seen=new Set();for(let n=0;n<items.length;n++){const i=items[n],id=data.items[n].id;if(typeof id!=='string'||!/^[-\w]{1,80}$/.test(id)||seen.has(id))fail('선택 항목을 다시 확인하세요.',400);if(!['general','sensitive','unique','rnn'].includes(i.classification)||!['required','optional','sensitive','unique','provide','extra','marketing','collect','outside'].includes(i.type)||i.type!==data.type||(['collect','provide','outside'].includes(data.type)&&i.context!==data.type)||!rule.contexts.includes(i.context)||(rule.supplement&&i.classification!==rule.supplement))fail('근거와 선택 항목의 개인정보 유형이 일치하지 않습니다.');i.id=id;seen.add(id);}return items;}
async function readLimited(response,max=8_000_000){const reader=response.body?.getReader();if(!reader)return '';let size=0,parts=[];try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();fail('외부 API 응답이 너무 큽니다. 검색 범위를 줄여 주세요.',502);}parts.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return new TextDecoder().decode(bytes);}
// Classify only known conditions. Never forward upstream text: it may echo keys or prompts.
async function serviceFailure(response,isAI,transportStatus=response.status,secrets=[]){
 const status=response.status,service=isAI?'AI 서비스':'국가법령정보센터';let message='',bodyFormat='unreadable',inspection=null;
 if(isAI){try{const body=await readLimited(response,16384);bodyFormat=!body.trim()?'empty':/^\s*</.test(body)?'html':'text';
 try{const parsed=JSON.parse(body);bodyFormat='json';
 inspection=inspectAiError(parsed);message=inspection.message;
 }catch{message=body;}
 }catch{}}
 const context=/context|too (?:many|long)|maximum.*token|length.*exceed/i.test(message);
 const blocked=/content.?policy|content.?filter|moderation|safety.?policy/i.test(message);
 const auth=/invalid.*(?:api.?key|token)|unauthorized/i.test(message),balance=/insufficient.*(?:credit|balance)|payment required/i.test(message);
 const parameter=/response_format|json_object|json.?schema|structured.?output/i.test(message)?'response_format':/reasoning|reasoning_effort/i.test(message)?'reasoning':/temperature/i.test(message)?'temperature':null;
 const diagnostic=isAI?'AI-'+transportStatus+'-'+status+'-'+crypto.randomUUID().slice(0,8):null;
 const kind=context?'context':blocked?'blocked':auth?'auth':balance?'balance':parameter?'parameters':'unknown';
 const reason=inspection?.reason||kind;
 // Compact, fixed vocabulary survives truncated dashboard trails; never log raw provider
 // text because it may contain submitted information or credentials.
 if(isAI)console.warn(`${diagnostic} format=${bodyFormat} reason=${reason} parameter=${parameter||'none'} shape=${inspection?.shape||'non_json'} codes=${inspection?.codes.join(',')||'none'} terms=${inspection?.keywords.join(',')||'none'}`);
 let advice;
 if([401,403].includes(status)||isAI&&status===400&&(auth||reason==='auth'))advice=service+' 인증 또는 접근이 거부되었습니다. 서버의 키·이용 권한을 확인하세요.';
 else if(status===402||isAI&&status===400&&balance)advice='AI 서비스 사용 잔액과 키 사용 한도를 확인하세요.';
 else if(status===429)advice=service+' 호출 한도에 도달했습니다. 잠시 후 다시 시도하세요.';
 else if(isAI&&status===404&&/data.?policy|privacy|data.?collection|zero.?data|zdr/i.test(message))advice='AI 서비스의 개인정보 보호 조건에 맞는 연결을 찾지 못했습니다. AI 연결 설정을 확인해 주세요.';
 else if(isAI&&status===404)advice='현재 사용할 수 있는 AI 연결을 찾지 못했습니다. AI 모델과 연결 설정을 확인해 주세요.';
 else if(isAI&&[400,413,422].includes(status)&&context)advice='AI가 처리할 수 있는 입력 범위를 넘었습니다. 항목이나 설명을 줄여 다시 시도해 주세요.';
 else if(isAI&&status===400&&blocked)advice='AI 서비스가 요청 처리를 제한했습니다. 입력 내용과 서비스 이용 조건을 확인해 주세요.';
 else if(isAI&&[400,422].includes(status)&&bodyFormat!=='json')advice='AI 연결 과정에서 정상 API 형식이 아닌 오류 응답을 받았습니다. 연결 경로를 확인해 주세요.';
 else if(isAI&&reason==='relay_path')advice='AI 요청을 전달하는 중 중계 경로에서 거부되었습니다. 잠시 후 다시 시도해 주세요.';
 else if(isAI&&[400,422].includes(status)&&reason==='privacy')advice='AI 서비스의 개인정보 보호 조건에 맞는 연결을 찾지 못했습니다. 보호 설정을 유지한 채 연결 설정을 확인해야 합니다.';
 else if(isAI&&[400,422].includes(status)&&reason==='request_validation')advice='AI 서비스가 요청 형식 검증을 거부했습니다. 서버의 요청 구성을 확인해야 합니다.';
 else if(isAI&&[400,422].includes(status)&&reason==='missing_error_message')advice='AI 서비스가 오류 응답에 거부 사유를 제공하지 않았습니다. 응답 구조를 확인해야 합니다.';
 else if(isAI&&[400,422].includes(status)&&reason==='unrecognized_error')advice='AI 서비스의 오류 설명을 자동 분류하지 못했습니다. 문의 코드의 응답 구조를 확인해야 합니다.';
 else if(isAI&&[400,422].includes(status))advice='AI 서비스가 요청 설정을 처리하지 못했습니다. AI 연결 설정을 확인해 주세요.';
 else if([408,504].includes(status))advice=service+' 처리 시간이 초과되었습니다. 잠시 후 다시 시도하세요.';
 else if(status>=500)advice=service+'가 일시적으로 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.';
 else advice=service+' 요청을 처리하지 못했습니다. 연결 설정을 확인해 주세요.';
 let support='';
 if(isAI&&reason==='unrecognized_error'){try{support=await sealSupportText(message,secrets);}catch{}}
 const error=new ApiError(advice+' (오류 '+status+')'+(diagnostic?' [문의 코드: '+diagnostic+'; '+bodyFormat+'/'+reason+(inspection?'; 구조: '+inspection.shape+'; 코드: '+(inspection.codes.join(',')||'없음')+(reason==='unrecognized_error'?'; 단서: '+(inspection.keywords.join(',')||'알려진 오류 용어 없음'):''):'')+']':'')+(support?' [지원 코드: '+support+']':''),status===429?429:[408,504].includes(status)?504:502,status);
 error.requestKind=['auth','balance','context','blocked','privacy','region','model','routing','messages','output_limit','invalid_json','request_validation','relay_path'].includes(reason)?reason:kind==='unknown'&&bodyFormat==='json'?'parameters':kind;error.parameter=parameter;throw error;
}
const officialLawPayload=root=>Boolean(find(root,'totalCnt')||find(root,'law')||find(root,'법령')||find(root,'기본정보')||find(root,'행정규칙')||find(root,'행정규칙명'));
const lawCache=new Map(); // Isolate-only official-law cache, never stores submitted items or AI results.
export function uniqueCandidates(candidates){const seen=new Set();return candidates.filter(c=>{const key=JSON.stringify(['law','article','paragraph','clause','basisCode','type','target','mst'].map(k=>compact(c[k]||(k==='target'?'law':''))));if(seen.has(key))return false;seen.add(key);return true;});}
// General grounds already confirmed for the same work; given to a specific-permission review as established facts.
export function confirmedGroundsFor(candidate){return (Array.isArray(candidate?.confirmedGrounds)?candidate.confirmedGrounds:[]).slice(0,4).filter(obj).map(g=>({cite:String(g.cite||'').slice(0,200),excerpt:String(g.excerpt||'').slice(0,1500),itemNames:(Array.isArray(g.itemNames)?g.itemNames:[]).slice(0,30).map(n=>String(n).slice(0,100))}));}
// Run at most `limit` tasks at once (bounded memory on the free tier); results keep input order.
export async function mapLimit(list,limit,task){const results=new Array(list.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,list.length)},async()=>{while(next<list.length){const index=next++;results[index]=await task(list[index],index);}}));return results;}
export function reviewEvidenceFor(actual){
 const cite=record=>{if(!obj(record))return null;const result=Object.fromEntries(['law','article','paragraph','clause','cite','excerpt','basisCode','articleTitle'].filter(k=>k in record).map(k=>[k,record[k]]));if(record.articleExcerpt&&record.articleExcerpt!==record.excerpt)result.articleExcerpt=record.articleExcerpt;return result;};
 return {...cite(actual),pipa:cite(actual.pipa),support:cite(actual.support),additionalGrounds:(actual.additionalGrounds||[]).map(reviewEvidenceFor)};
}
export class LegalApi {
 constructor(env,fetcher=fetch,ctx,cacheOrigin='https://dongui-bogam.dongui-bogam.workers.dev'){this.env=env;this.fetcher=fetcher;this.ctx=ctx;this.cacheOrigin=cacheOrigin;this.memo=new Map();this.calls=0;this.cacheOperations=0;this.forceFresh=false;}
 reserveRequest(){if(this.calls+this.cacheOperations>=(this.discoveryActive?24:48)){const error=new ApiError('이번 요청의 서버 조회 한도에 도달했습니다. 확인된 내용은 유지하고 나머지 근거를 다시 확인해 주세요.',429);error.requestBudget=true;throw error;}this.calls++;}
 async upstream(url,options={},timeout=30000){
  this.reserveRequest();
  const service=new URL(url).hostname==='openrouter.ai'?'AI 서비스':'국가법령정보센터';
  // Workers' native fetch requires an unbound call. It supports only manual/follow.
  // Never follow upstream redirects carrying OC or Authorization credentials.
  const send=this.fetcher;let response;
  try{response=await send(url,{...options,redirect:'manual',signal:AbortSignal.timeout(timeout)});}catch(error){
   if(['AbortError','TimeoutError'].includes(error?.name))fail(service+' 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.',504);
   fail(service+'에 연결하지 못했습니다. 잠시 후 다시 시도하세요.',502);
  }
  if(response.status>=300&&response.status<400)fail(service+'가 다른 주소로 연결을 요청하여 중단했습니다. 서버의 API 주소를 확인하세요.',502);
  if(!response.ok)return serviceFailure(response,service==='AI 서비스',response.status,[options.headers?.Authorization,options.headers?.Authorization?.replace(/^Bearer /,'')]);
  try{return await readLimited(response);}catch(error){if(error instanceof ApiError)throw error;const failure=new ApiError(service+' 응답을 받는 중 연결이 끊겼습니다. 잠시 후 다시 시도하세요.',502);if(service==='AI 서비스')failure.requestKind='stream';throw failure;}
 }
 async law(endpoint,params={}){
  try{const root=await this.apiLaw(endpoint,params);
   if(endpoint==='lawSearch.do'){this.apiLawRows??=new Map();for(const row of descendants(root,'law'))if(compact(text(row,'법령명한글'))===compact(params.query)&&this.eligible(row,'law'))this.apiLawRows.set(text(row,'법령일련번호'),{name:text(row,'법령명한글'),date:text(row,'시행일자')});}
   if(this.allowMcp&&endpoint==='lawService.do'&&!params.JO){this.fullLawBodies??=new Map();this.fullLawBodies.set(String(params.MST),root);}
   if(this.allowMcp&&endpoint==='lawService.do'&&params.JO){const code=String(params.JO),article=String(Number(code.slice(0,4)))+(Number(code.slice(4))?'의'+Number(code.slice(4)):'');extract(root,article);}
   return root;
  }catch(error){
   if(!(error instanceof ApiError)||error.requestBudget||!this.allowMcp||this.env.LAW_MCP_ENABLED!=='true')throw error;
   this.mcp??=new LawMcp(this.env,(url,options)=>{this.reserveRequest();const send=this.fetcher;return send(url,options);});
   this.mcp.terms=this.mcpTerms;this.mcp.maxArticles=this.mcpArticleLimit||4;
   for(const [mst,row] of this.apiLawRows||[])this.mcp.rows.set(mst,row);
   try{const root=parseXml(await this.mcp.law(endpoint,params,today()));root.retrievalProvider='mcp';if(!params.JO&&endpoint==='lawService.do'){this.fullLawBodies??=new Map();this.fullLawBodies.set(String(params.MST),root);}return root;}catch{throw error;}
  }
 }
 async apiLaw(endpoint,params={}){
  const oc=this.env.LAW_API_OC;if(!oc)fail('법령 검색을 위해 서버에 LAW_API_OC를 설정해 주세요.',503);
  const query=new URLSearchParams({OC:oc,target:'law',type:'JSON',...params});query.sort();
  // Hash credentials and parameters before using any persistent cache key. The day
  // partitions freshness at Korean midnight; versioned bodies retain their MST.
  const key=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('v3|'+today()+'|'+endpoint+'?'+query)));
  const ttl=endpoint==='lawService.do'&&params.MST?3600:300;
  if(this.memo.has(key))return this.memo.get(key);
  const hit=lawCache.get(key);if(!this.forceFresh&&hit&&hit.expires>Date.now())return hit.root;
  const cacheRequest=new Request(this.cacheOrigin+'/__law_cache/v3/'+key);
  const remember=(raw,root,expires)=>{while(lawCache.size>=16||([...lawCache.values()].reduce((sum,v)=>sum+v.bytes,0)+raw.length*2>16_000_000&&lawCache.size))lawCache.delete(lawCache.keys().next().value);if(raw.length*2<=16_000_000)lawCache.set(key,{root,bytes:raw.length*2,expires});};
  const pending=(async()=>{
   const edge=globalThis.caches?.default;
   const canUseEdge=()=>!this.allowMcp&&edge&&this.cacheOperations<24&&this.calls+this.cacheOperations<46;
   if(!this.forceFresh&&canUseEdge()){this.cacheOperations++;try{const cached=await edge.match(cacheRequest);if(cached&&Number(cached.headers.get('X-Law-Expires'))>Date.now()){const raw=await readLimited(cached);const root=parseLaw(raw);if(!officialLawPayload(root))throw Error('invalid cached law');remember(raw,root,Number(cached.headers.get('X-Law-Expires')));return root;}}catch{}}
   const raw=await this.upstream('https://www.law.go.kr/DRF/'+endpoint+'?'+query);const root=parseLaw(raw);
   // Cache only recognized successful public-law payloads, never errors, user
   // submissions, AI decisions, or credentials. Expired entries are never served.
   const cacheable=officialLawPayload(root);
   if(!cacheable)fail('국가법령정보센터 응답 형식을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',502);
   if(cacheable){const expires=Date.now()+ttl*1000;remember(raw,root,expires);
    if(canUseEdge()&&raw.length*2<=16_000_000){this.cacheOperations++;const write=(async()=>{try{await edge.put(cacheRequest,new Response(raw,{headers:{'Cache-Control':'public, max-age='+ttl,'X-Law-Expires':String(expires)}}));}catch{}})();if(this.ctx?.waitUntil)this.ctx.waitUntil(write);else await write;}
   }
   return root;
  })();
  // In-flight I/O belongs to this request. Only completed plain law data is shared.
  this.memo.set(key,pending);pending.catch(()=>{if(this.memo.get(key)===pending)this.memo.delete(key);});return await pending;
 }
 async resolve(name){const root=await this.law('lawSearch.do',{query:name,search:'1',display:'20',nw:'1'});const matches=descendants(root,'law').filter(r=>compact(text(r,'법령명한글'))===compact(name)&&isLawKind(text(r,'법령구분명'))&&digits(text(r,'시행일자')).length===8&&digits(text(r,'시행일자'))<=today()).sort((a,b)=>digits(text(b,'시행일자')).localeCompare(digits(text(a,'시행일자'))));if(!matches.length)fail('해당 이름의 현행 법령을 확인하지 못했습니다. 정식 법령명을 확인하세요.');const row=matches[0],mst=text(row,'법령일련번호');if(!/^\d+$/.test(mst))fail('법령 API 응답에 유효한 법령 식별자가 없습니다.',502);return {row,mst};}
 async citation(candidate){const name=String(candidate.law??'').trim().slice(0,100);if(!name)fail('법령명을 입력하세요.',400);const article=number(candidate.article),paragraph=candidate.paragraph?number(candidate.paragraph,'항'):'',clause=candidate.clause?number(candidate.clause,'호'):'';const {row,mst}=await this.resolve(name);if(candidate.mst&&String(candidate.mst)!==mst)fail('법령 버전이 변경되었습니다. 법령을 다시 검색해 선택하세요.');const [major,sub='0']=article.split('의');let root=this.fullLawBodies?.get(String(mst));if(root){try{extract(root,article);}catch{root=null;}}root??=await this.law('lawService.do',{MST:mst,JO:major.padStart(4,'0')+sub.padStart(2,'0')});const official=content(find(root,'법령명_한글')).trim();if(official&&compact(official)!==compact(name))fail('조회된 법령 본문과 검색 결과의 법령명이 다릅니다.',502);
 const title='제'+article.replace('의','조의')+(article.includes('의')?'':'조');return {law:text(row,'법령명한글'),article,paragraph,clause,cite:text(row,'법령명한글')+' '+title+(paragraph?' 제'+paragraph+'항':'')+(clause?' 제'+clause.replace('의','호의')+(clause.includes('의')?'':'호'):''),excerpt:extract(root,article,paragraph,clause),articleExcerpt:extract(root,article),paragraphExcerpt:paragraph?extract(root,article,paragraph):'',paragraphSegments:paragraph?segments(articleNode(root,article,paragraph)):[],verified:true,articleTitle:text(articleNode(root,article),'조문제목'),retrievalProvider:root.retrievalProvider||'api',mst,kind:text(row,'법령구분명'),effectiveDate:text(row,'시행일자'),verifiedAt:new Date().toISOString(),sourceUrl:'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq='+mst};
 }
 async basis(candidate){const code=candidate.basisCode,rule=rules[code];if(!rule||rule.effect==='consent')fail('동의 외의 개인정보 보호법 근거를 먼저 선택하세요.',400);const [pipa,support,paragraph]=await Promise.all([this.citation({law:'개인정보 보호법',article:rule.article,paragraph:rule.paragraph,clause:rule.clause}),rule.support?this.citation({law:'개인정보 보호법',...rule.support}):null,this.citation({law:'개인정보 보호법',article:rule.article,paragraph:rule.paragraph,clause:''})]);return {...pipa,pipa,pipaParagraph:paragraph,basisCode:code,type:candidate.type||'required',pipaVerified:true,support,supportVerified:!rule.support||Boolean(support)};}
 async verify(candidate){if((candidate.target||'law')!=='law')fail('행정규칙은 제외합니다. 법률·시행령·시행규칙만 검색하고 적용할 수 있습니다.',400);const code=candidate.basisCode,rule=rules[code];if(!rule||rule.effect==='consent')fail('동의 외의 처리 근거를 먼저 선택하세요.',400);let actual;if(!rule.needsLaw)actual=await this.basis(candidate);else{if((candidate.target||'law')!=='law')fail('행정규칙만으로는 법령상 처리 근거를 적용할 수 없습니다. 상위 법률·시행령의 구체적 조문을 선택하세요.');if(['개인정보보호법','개인정보보호법시행령','개인정보보호법시행규칙'].includes(compact(candidate.law)))fail('해당 업무의 수집·이용·제공을 구체적으로 정한 개별 법률·시행령·시행규칙을 선택하세요.');const [specific,basis]=await Promise.all([this.citation(candidate),this.basis(candidate)]);if(!isLawKind(specific.kind))fail('법률·시행령·시행규칙에서 근거를 선택하세요.');if(code==='residentLaw'&&!['법률','대통령령'].includes(specific.kind))fail('시행규칙만으로 주민등록번호 처리 근거를 적용할 수 없습니다. 구체적인 법률·대통령령의 허용 근거를 확인하세요.');if(code==='extraLaw'&&specific.kind!=='법률')fail('이 근거 유형은 다른 법률의 특별한 규정이 필요합니다. 시행령·시행규칙만으로 적용할 수 없습니다.');actual={...specific,...Object.fromEntries(['pipa','pipaParagraph','pipaVerified','support','supportVerified'].map(k=>[k,basis[k]]))};}return {...actual,basisCode:code,type:candidate.type||'required',reason:String(candidate.reason??'').slice(0,1400)};}
 async withAdditional(data,items){const codes=data.additionalBasisCodes??[];if(!Array.isArray(codes)||codes.length>3||codes.some(c=>typeof c!=='string')||new Set(codes).size!==codes.length)fail('함께 적용할 별도 처리 허용 근거를 확인하세요.',400);for(const code of codes){const r=rules[code];if(!r||r.effect!=='supplement'||code===data.basisCode||!items.some(i=>i.classification===r.supplement&&r.contexts.includes(i.context)))fail('선택한 항목에 맞는 별도 처리 허용 근거를 선택하세요.');}const actual=await this.verify(data);if(codes.length&&['개인정보보호법','개인정보보호법시행령','개인정보보호법시행규칙'].includes(compact(actual.law)))fail('별도 허용 근거에는 해당 개인정보 처리를 정한 개별 법률·시행령·시행규칙이 필요합니다.');return {...actual,additionalGrounds:await Promise.all(codes.map(basisCode=>this.verify({...data,basisCode})))};}
 eligible(row,target){const mst=text(row,'법령일련번호'),date=digits(text(row,'시행일자'));return target==='law'&&/^\d+$/.test(mst)&&date.length===8&&date<=today()&&isLawKind(text(row,'법령구분명'));}
 async catalog(data,countOnly=false){const query=String(data.query??'').trim();if(query.length<2||query.length>100)fail('법령 검색어를 2~100자로 입력하세요.',400);if(data.target&&data.target!=='law')fail('법률·시행령·시행규칙만 검색할 수 있습니다.',400);const cursor=data.cursor||{target:'law',page:data.page||1,offset:0};if(!obj(cursor))fail('검색 위치를 다시 확인하세요.',400);let {target,page}=cursor,offset=countOnly?0:cursor.offset??0;const size=countOnly?100:20;if(target!=='law'||!Number.isInteger(page)||page<1||page>1000||!Number.isInteger(offset)||offset<0||offset>=20)fail('검색 위치를 다시 확인하세요.',400);const laws=[];const started=Date.now();for(let batch=0;batch<(countOnly?1:8);batch++){
 const root=await this.law('lawSearch.do',{query,search:'1',display:String(size),page:String(page),target:'law',nw:'1'});const rows=descendants(root,'law'),total=content(find(root,'totalCnt'));const more=/^\d+$/.test(total)?Number(total)>page*size:rows.length===size;
 if(countOnly)return {count:rows.filter(r=>this.eligible(r,'law')).length,cursor:more?{target:'law',page:page+1}:null};
 for(let index=offset;index<rows.length;index++){const row=rows[index];if(!this.eligible(row,'law'))continue;laws.push({law:text(row,'법령명한글'),mst:text(row,'법령일련번호'),effectiveDate:text(row,'시행일자'),department:text(row,'소관부처명'),kind:text(row,'법령구분명'),target:'law'});if(laws.length===5){const next=index+1<rows.length?{target:'law',page,offset:index+1}:more?{target:'law',page:page+1,offset:0}:null;return {laws,cursor:next,hasNext:Boolean(next),incomplete:false};}}
 if(more){page++;offset=0;}else return {laws,cursor:null,hasNext:false,incomplete:false};
 if(Date.now()-started>8000||batch===7)return {laws,cursor:{target:'law',page,offset},hasNext:true,incomplete:true};
 }}
 async articles(data){const name=String(data.law??'').trim().slice(0,100),mst=String(data.mst??'');if((data.target||'law')!=='law')fail('법률·시행령·시행규칙만 조회할 수 있습니다.',400);
 const {row,mst:current}=await this.resolve(name);if(current!==mst)fail('법령 버전이 변경되었거나 검색 결과와 다릅니다. 법령을 다시 검색하세요.');const root=await this.law('lawService.do',{MST:mst});const official=content(find(root,'법령명_한글'));if(official&&compact(official)!==compact(name))fail('검색 결과와 본문의 법령명이 다릅니다.',502);
 const articles=descendants(root,'조문단위').filter(n=>text(n,'조문여부')==='조문'&&!deletedNode(n)&&excerpt(n)).map(n=>{const paragraphs=children(n,'항').filter(p=>!deletedNode(p)).map(p=>({value:leadingNumber(text(p,'항번호')),text:excerpt(p),clauses:clauses(p)})).filter(p=>p.value);return {value:articleLabel(n),title:text(n,'조문제목'),text:excerpt(n),paragraphs,clauses:[...clauses(n),...(!paragraphs.length?children(n,'항').flatMap(clauses):[])]};});if(!articles.length)fail('선택할 수 있는 조문 본문을 확인하지 못했습니다.');return {law:text(row,'법령명한글'),mst,effectiveDate:text(row,'시행일자'),articles,sourceUrl:'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq='+mst};
 }
 async ai(prompt,data,maxTokens=3000){
  if(!this.env.OPENROUTER_API_KEY)fail('AI 기능을 위해 서버에 OPENROUTER_API_KEY를 설정해 주세요.',503);
  const model=this.env.OPENROUTER_MODEL||'openai/gpt-6-luna';
  const order=model==='openai/gpt-oss-120b'?['deepinfra','groq','cerebras']:null;
  const payload={model,temperature:0.1,max_tokens:maxTokens,response_format:{type:'json_object'},provider:{data_collection:'deny',...(order?{order}:{sort:'latency'}),require_parameters:true,allow_fallbacks:true},...(model.includes('gpt-oss')?{reasoning:{effort:'low',exclude:true}}:{}),messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(data)}]};
  // These reasoning models do not accept temperature; strict provider routing must omit it.
  if(/^openai\/gpt-[56](?:[.-]|$)/.test(model)){delete payload.temperature;payload.reasoning={effort:'low',exclude:true};}
  const deadline=Date.now()+35000;
  for(let attempt=0;attempt<2;attempt++){
   try{
    const raw=await this.upstream('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+this.env.OPENROUTER_API_KEY,'Content-Type':'application/json','X-Title':'Dongui Bogam'},body:JSON.stringify(payload)},Math.min(25000,Math.max(1,deadline-Date.now())));
    let envelope;try{envelope=JSON.parse(raw);}catch{fail('AI 응답 형식을 확인하지 못했습니다. 다시 시도하세요.',502);}
    if(envelope?.error){const code=Number(envelope.error.code);if(Number.isInteger(code)&&code>=400&&code<=599)await serviceFailure(Response.json(envelope,{status:code}),true,200,[this.env.OPENROUTER_API_KEY]);fail('AI 서비스가 답변을 완료하지 못했습니다. 다시 시도하세요.',502);}
    const choice=envelope?.choices?.[0];
    if(choice?.finish_reason==='content_filter')fail('AI 서비스가 응답을 제한했습니다. 입력 내용과 서비스 이용 조건을 확인해 주세요.',502);
    if(choice?.finish_reason==='length')fail('AI 답변이 완료되기 전에 출력 한도에 도달했습니다. 항목이나 설명을 줄여 다시 시도하세요.',502);
    try{const result=JSON.parse(choice.message.content.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));if(!obj(result))throw Error();return result;}catch{const error=new ApiError('AI 답변이 비어 있거나 형식을 확인하지 못했습니다. 다시 시도하세요.',502);error.requestKind='format';throw error;}
   }catch(error){
    if(attempt===0&&deadline-Date.now()>1000){
     // A relay-path failure precedes model generation. Preserve the entire request.
     if(error.requestKind==='relay_path'){await new Promise(resolve=>setTimeout(resolve,250));continue;}
     if((error.upstreamStatus===400&&error.requestKind==='parameters')||[500,502,503,504,520,522,524].includes(error.upstreamStatus)||['format','stream'].includes(error.requestKind)){if(payload.provider.order)payload.provider.order=[...payload.provider.order.slice(1),payload.provider.order[0]];}
     if(error.upstreamStatus===400&&error.requestKind==='parameters'){
      // Preserve the model, privacy policy, prompt and output cap. Only optional
      // generation settings change; official-law and JSON validation still run.
      if(error.parameter)delete payload[error.parameter];
      else{delete payload.response_format;delete payload.reasoning;delete payload.temperature;}
      continue;
     }
     if([500,502,503,504,520,522,524].includes(error.upstreamStatus)||['format','stream'].includes(error.requestKind))continue;
    }
    throw error;
   }
  }
 }

 async research(context){
  if(!this.env.OPENROUTER_API_KEY)fail('AI 근거 검색을 위해 OPENROUTER_API_KEY를 설정해 주세요.',503);
  const payload=searchPayload(this.env.OPENROUTER_MODEL||'openai/gpt-6-luna',context);
  for(let attempt=0;attempt<2;attempt++){
   const raw=await this.upstream('https://openrouter.ai/api/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+this.env.OPENROUTER_API_KEY,'Content-Type':'application/json','X-Title':'Dongui Bogam'},body:JSON.stringify(payload)},90000);
   let envelope;try{envelope=JSON.parse(raw);}catch{fail('AI 근거 검색 API 응답 형식을 확인하지 못했습니다.',502);}
   if(searchFailureCode(envelope)==='output_limit'&&attempt===0){payload.max_output_tokens=retrySearchTokens;continue;}
   if(envelope?.error){const status=Number(envelope.error.code);if(status>=400&&status<=599)await serviceFailure(Response.json(envelope,{status}),true,200,[this.env.OPENROUTER_API_KEY]);}
   try{return parseSearchResponse(envelope);}catch(error){fail(error.message,502);}
  }
 }
 async discover(context,research,options={}){
  let scope=discoveryScope(context,options.assistant?['보존','보유','기재사항','기록']:[]),lawPlan={};
  if(!scope.laws.length||options.assistant&&!options.fast){for(let attempt=0;attempt<2;attempt++){lawPlan=await this.ai(discoveryConfig.lawPrompt+(options.assistant?' 해당 업무의 개인정보 기재사항과 법정 기록 보존기간을 규정한 법률·시행령·시행규칙도 포함하라.':''),{...context,research},1800);if((Array.isArray(lawPlan.laws)&&lawPlan.laws.every(n=>typeof n==='string'))||(Array.isArray(lawPlan.candidates)&&lawPlan.candidates.every(obj)))break;if(attempt)fail('AI 응답에 올바른 법령 후보 목록이 없습니다. 다시 검색하세요.',502);}const names=Array.isArray(lawPlan.laws)?lawPlan.laws:Array.isArray(lawPlan.candidates)?lawPlan.candidates.map(c=>c.law):[];scope={...discoveryScope(context,[...(Array.isArray(lawPlan.terms)?lawPlan.terms:[]),...(options.assistant?['보존','보유','기재사항','기록']:[])]),laws:options.assistant?[...scope.laws,...names]:names};}
  this.mcpTerms=scope.terms;this.mcpArticleLimit=options.assistant?2:4;
  const names=candidateLawNames(options.assistant?[...(/주민(?:등록)?번호/.test(context.items.map(i=>i.purpose).join(' '))?(scope.identifierLaws||[]):[]),...scope.laws.slice(0,2),...(Array.isArray(lawPlan.retentionLaws)?lawPlan.retentionLaws.filter(n=>typeof n==='string'):[]),...scope.laws.slice(2)]:scope.laws,options.assistant?discoveryConfig.assistantMaxLaws:discoveryConfig.maxLaws),pool=[],rejected=[];
  this.discoveryActive=options.assistant===true;
  let fetchable=names;
  if(options.assistant&&this.calls+this.cacheOperations+names.length*2>24){const room=Math.max(0,Math.floor((24-this.calls-this.cacheOperations)/2));fetchable=names.slice(0,room);rejected.push(...names.slice(room).map(law=>({law,message:'최종 검토에 필요한 조회 여유를 확보하기 위해 일부 원문은 추가 확인 대상으로 남겼습니다.',reason:'request_budget'})));}
  // Law texts are fetched concurrently and added to the pool in the original order.
  const fetched=await mapLimit(fetchable,3,async(name,index)=>{for(let attempt=0;attempt<2;attempt++){try{const {row,mst}=await this.resolve(name);const root=await this.law('lawService.do',{MST:mst});const official=content(find(root,'법령명_한글')).trim();if(official&&compact(official)!==compact(text(row,'법령명한글')))fail('검색한 법령명과 원문이 다릅니다.',502);const articles=descendants(root,'조문단위').filter(n=>text(n,'조문여부')==='조문'&&!deletedNode(n)).map(n=>({value:articleLabel(n),title:text(n,'조문제목'),text:excerpt(n)}));return {evidence:rankEvidence(articles,scope.terms,text(row,'법령명한글'),mst,index)};}catch(e){if(!(e instanceof ApiError))throw e;if(attempt===0&&(e.status===504||[500,502,503,504,520,522,524].includes(e.upstreamStatus)))continue;return {rejected:{law:normalizeLawName(name),message:e.message,reason:e.status===504?'timeout':e.status>=500||e.status===429?'service_unavailable':'not_verified'}};}}});
  for(const result of fetched){if(result?.evidence)pool.push(...result.evidence);else if(result?.rejected)rejected.push(result.rejected);}
  this.discoveryActive=false;
  let selected;
  for(let attempt=0;attempt<2;attempt++){selected=await this.ai(discoveryConfig.selectionPrompt+(options.assistant?' 추가로 해당 업무에서 기재할 개인정보 항목 및 문서 보존기간을 정한 조문을 general 유형으로 포함하라. 이런 조문을 단순 정의 조문으로 제외하지 마라.':''),{...context,research,evidencePool:pool,searchNote:String(lawPlan.note||'').slice(0,1000)},attempt?5000:3500);if(Array.isArray(selected.candidates)&&selected.candidates.every(obj))break;if(attempt)fail('AI 응답에 올바른 법령 후보 목록이 없습니다. 자동 재시도에도 완료하지 못했습니다. 다시 검색하세요.',502);}
  return {...selected,candidates:groundSelections(selected.candidates,pool,rules,rejected),rejected};
 }
 async search(data){const context=validateContext(data);if(!this.env.LAW_API_OC)fail('법령 원문 조회를 위해 서버에 LAW_API_OC를 설정해 주세요.',503);const research=await this.research(context);const planned=await this.discover(context,research);planned.candidates=uniqueCandidates(planned.candidates);const candidates=[],rejected=[...(planned.rejected||[])];const initialRejected=rejected.length;
 // Sequential candidates keep peak memory/subrequests bounded on the free tier.
 for(const candidate of planned.candidates){try{if(candidate.discoveryError)fail(candidate.discoveryError,422);if(typeof candidate.law!=='string'||!candidate.law.trim()||!candidate.article)fail('AI 제안에 법령명 또는 조문 번호가 없어 확인할 수 없습니다. 다시 검색해 주세요.',422);const scope=context.items.filter(i=>i.type===candidate.type),rule=rules[candidate.basisCode];if(!scope.length||!rule||!scope.some(i=>rule.contexts.includes(i.context)&&(!rule.supplement||rule.supplement===i.classification)))fail('법령의 개인정보 보호법 연결 조항이 처리 유형과 맞지 않습니다.');const actual=await this.verify(candidate);if(!hasPermissionText(actual))fail('선택한 조문 원문에서 해당 민감정보·식별번호의 구체적인 처리 허용을 확인하지 못했습니다.',422);const proposed=candidate.itemNames||[],reasons=candidate.itemReasons||{};actual.itemReviews=Array.isArray(proposed)&&obj(reasons)?scope.filter(i=>!rule.supplement||i.classification===rule.supplement).map(i=>({name:i.name,suggested:proposed.includes(i.name),reason:String(reasons[i.name]??candidate.reason??'적용 요건을 확인해 주세요.').slice(0,500)})):[];const reviewItems=scope.filter(i=>!rule.supplement||i.classification===rule.supplement).map((i,n)=>({...i,id:'search-'+n}));const {review}=await this.reviewEvidence(actual,reviewItems,false);actual.itemReviews=review.items.map(i=>({name:i.name,suggested:i.verdict==='possible',reason:i.explanation+(i.checks.length?' 확인 사항: '+i.checks.join('; '):''),verdict:i.verdict}));if(review.items.every(i=>i.verdict==='not_supported'))fail('공식 원문 대조 결과 업무 목적·항목을 뒷받침하지 않는 근거입니다. '+review.summary,422);actual.relevanceChecked=true;actual.proofToken=await signProof(this.env.OPENROUTER_API_KEY,actual);candidates.push(actual);}catch(e){if(!(e instanceof ApiError))throw e;rejected.push({law:String(candidate.law??'').slice(0,100),...Object.fromEntries(['article','paragraph','clause'].map(k=>[k,/^\d{1,4}(?:의\d{1,3})?$/.test(String(candidate[k]??''))?String(candidate[k]):''])),message:e.message,reason:e.status===504?'timeout':e.status>=500||e.status===429?'service_unavailable':'not_verified'});}}
 return {candidates,rejected,...searchOutcome(candidates,rejected,planned.candidates.length+initialRejected),limit:null,limited:false,note:String(planned.note??'').slice(0,1800),mode:'live'};
 }
 async classify(data){const {items}=validateContext(data);if(items.length>20||items.some(i=>i.name.trim().length<2||i.name.trim().length>100))fail('분류할 항목명은 2~100자, 한 번에 20개까지 입력하세요.',400);const ids=data.items.map(i=>i.id);if(ids.some(id=>typeof id!=='string'||!/^[-\w]{1,80}$/.test(id))||new Set(ids).size!==ids.length)fail('분류할 항목을 다시 확인하세요.',400);if(!this.env.OPENROUTER_API_KEY||!this.env.LAW_API_OC)fail('민감정보 API 분류를 위한 서버 연결 설정을 확인하세요.',503);const sources=await Promise.all([this.citation({law:'개인정보 보호법',article:'23'}),this.citation({law:'개인정보 보호법 시행령',article:'18'})]);const officialEvidence=sources.map(s=>({cite:s.cite,text:s.articleExcerpt||s.excerpt}));if(officialEvidence.reduce((s,e)=>s+e.text.length,0)>40000)fail('민감정보 분류의 기준 조문을 확인하지 못했습니다.',502);const planned=await this.ai(prompts.classify_privacy_items,{officialEvidence,items:items.map((i,n)=>({id:ids[n],name:i.name,purpose:i.purpose}))},1800);const indexed=new Map();if(!Array.isArray(planned.items))fail('민감정보 분류 응답을 확인하지 못했습니다.',502);for(const row of planned.items){if(!obj(row)||!ids.includes(row.id)||indexed.has(row.id)||!['high','general','uncertain'].includes(row.verdict))fail('민감정보 분류 응답을 확인하지 못했습니다.',502);indexed.set(row.id,row);}const allowed=['건강','사상·신념','정치적 견해','가입·탈퇴','성생활','유전','범죄경력','생체인식','인종·민족','사생활'];return {items:items.map((i,n)=>{const r=indexed.get(ids[n])||{};return {id:ids[n],name:i.name,verdict:r.verdict||'uncertain',reason:String(r.reason??'항목의 구체적인 의미를 담당자가 확인하세요.').slice(0,400),included:Array.isArray(r.included)?r.included.filter(v=>allowed.includes(v)).slice(0,2):[]};})};
 }
 async review(data){const items=reviewMaterial(data),candidate=await this.withAdditional(data,items);const result=await this.reviewEvidence(candidate,items);return {...result,candidate:{...result.candidate,proofToken:await signProof(this.env.OPENROUTER_API_KEY,result.candidate)}};}
 async reviewEvidence(candidate,items,issueToken=true){const officialEvidence=reviewEvidenceFor(candidate);if(JSON.stringify(officialEvidence).length>45000)fail('검토할 조문이 너무 깁니다. 적용할 항·호를 구체적으로 선택하세요.');const confirmedGrounds=confirmedGroundsFor(candidate),planned=await this.ai(prompts.ai_application_review,{officialEvidence,items,...(confirmedGrounds.length?{confirmedGrounds}:{})},4000);if(!Array.isArray(planned.items))fail('AI 검토 결과를 읽지 못했습니다.',502);const indexed=new Map();for(const r of planned.items){if(!obj(r)||typeof r.id!=='string'||indexed.has(r.id))fail('AI 검토 결과를 읽지 못했습니다.',502);indexed.set(r.id,r);}const normalized=items.map(i=>{const r=indexed.get(i.id)||{};return {id:i.id,name:i.name,verdict:['possible','needs_information','not_supported'].includes(r.verdict)?r.verdict:'needs_information',explanation:String(r.explanation??'해당 항목의 검토 결과가 부족합니다.').slice(0,800),checks:Array.isArray(r.checks)?r.checks.slice(0,3).map(c=>String(c).slice(0,300)):[]};});const review={items:normalized,summary:String(planned.summary??'선택 항목의 검토 결과를 확인하세요.').slice(0,1600),canApply:normalized.every(i=>i.verdict==='possible'),model:this.env.OPENROUTER_MODEL||'openai/gpt-6-luna',checkedAt:new Date().toISOString()};if(issueToken&&review.canApply){review.token=await signReview(this.env.OPENROUTER_API_KEY,await fingerprint(candidate,items));review.validForSeconds=300;}return {candidate,review};}
 async apply(data){const items=reviewMaterial(data);let actual=await signedProofFor(this.env.OPENROUTER_API_KEY,data);if(!actual){this.forceFresh=true;this.memo.clear();actual=await this.withAdditional(data,items);}const {proofToken:_t,signedProof:_s,...clean}=actual;actual=clean;if(data.reviewToken)await checkReview(this.env.OPENROUTER_API_KEY,data.reviewToken,await fingerprint(actual,items));return {...actual,reviewConfirmed:Boolean(data.reviewToken)};}
}
const enc=new TextEncoder();
const hex=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
// Official text verified by this server today, signed so that applying it needs no second fetch.
// The token binds the exact proof (minus client-side bookkeeping) to the Korean calendar day.
const canonical=v=>Array.isArray(v)?v.map(canonical):obj(v)?Object.fromEntries(Object.keys(v).filter(k=>!['proofToken','signedProof'].includes(k)&&v[k]!==undefined).sort().map(k=>[k,canonical(v[k])])):v;
async function proofDigest(proof){return hex(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(canonical(proof)))));}
export async function signProof(secret,proof){const body=btoa(JSON.stringify({d:await proofDigest(proof),day:today()}));return body+'.'+await hmac(secret+':proof-v1',body);}
export async function signedProofFor(secret,data){const proof=data?.proof,token=data?.proofToken;if(!obj(proof)||typeof token!=='string'||token.length>400)return null;const [body,mac]=token.split('.');if(!body||!mac||await hmac(secret+':proof-v1',body)!==mac)return null;let claim;try{claim=JSON.parse(atob(body));}catch{return null;}if(claim?.day!==today()||claim.d!==await proofDigest(proof))return null;
 const same=(a,b)=>String(a??'')===String(b??'');if(!['law','article','paragraph','clause','basisCode'].every(k=>same(proof[k],data[k]))||data.mst&&!same(proof.mst,data.mst)||!same(proof.type||'required',data.type||'required'))return null;
 const wanted=[...(Array.isArray(data.additionalBasisCodes)?data.additionalBasisCodes:[])].sort().join(','),have=(Array.isArray(proof.additionalGrounds)?proof.additionalGrounds:[]).map(g=>g?.basisCode).sort().join(',');return wanted===have?proof:null;}
export async function fingerprint(actual,items){const source=Object.fromEntries(['law','article','paragraph','clause','mst','basisCode','type','excerpt'].map(k=>[k,actual[k]??null]));source.pipa=actual.pipa?.excerpt||'';source.support=actual.support?.excerpt||'';source.additionalGrounds=(actual.additionalGrounds||[]).map(p=>({basisCode:p.basisCode,excerpt:p.excerpt,pipa:p.pipa?.excerpt||''}));source.items=[...items].sort((a,b)=>a.id.localeCompare(b.id));return hex(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(source))));}
async function hmac(secret,body){if(!secret)fail('AI 검토 연결 설정을 확인하세요.',503);const key=await crypto.subtle.importKey('raw',enc.encode('dongui-review-v1:'+secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,enc.encode(body)));}
export async function signReview(secret,fp,ttl=300000){const body=btoa(JSON.stringify({fp,exp:Date.now()+ttl}));return body+'.'+await hmac(secret,body);}
export async function checkReview(secret,token,fp,grace=0){if(typeof token!=='string'||token.length>1000)fail('AI 검토 내용을 다시 확인하세요.',409);try{const [body,sig,...extra]=token.split('.');if(extra.length||!secret||typeof sig!=='string'||!/^([0-9a-f]{2}){32}$/.test(sig))throw Error();const key=await crypto.subtle.importKey('raw',enc.encode('dongui-review-v1:'+secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);const signature=Uint8Array.from(sig.match(/../g),pair=>parseInt(pair,16));if(!await crypto.subtle.verify('HMAC',key,signature,enc.encode(body)))throw Error();const claims=JSON.parse(atob(body));if(claims.fp!==fp||!Number.isFinite(claims.exp)||claims.exp<Date.now()-grace)throw Error();}catch{fail('검토 후 항목·근거가 바뀌었거나 검토 유효 시간이 지났습니다. AI 검토를 다시 진행하세요.',409);}}

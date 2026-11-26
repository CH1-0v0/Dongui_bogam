import config from './web-search.json' with {type:'json'};
export function officialSearchUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&(!u.port||['80','443'].includes(u.port))&&config.domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))?u.href:'';}catch{return '';}}
export function searchPayload(model,context){return {model,instructions:config.instructions,input:JSON.stringify({...context,researchPlan:config.researchPlan}),tools:[{...config.tool,parameters:{...config.tool.parameters,allowed_domains:config.domains}}],max_tool_calls:3,max_output_tokens:config.max_output_tokens,...((model.includes('gpt-oss')||/^openai\/gpt-[56](?:[.-]|$)/.test(model))?{reasoning:{effort:'low'}}:{}),provider:{data_collection:'deny'}};}
export const retrySearchTokens=config.retry_output_tokens;
export function searchFailureCode(envelope){
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))return 'format';
 if(!envelope.error&&!['failed','incomplete','queued','in_progress'].includes(envelope.status))return '';
 const reason=envelope.incomplete_details?.reason||envelope.error?.code;
 if(['max_output_tokens','length'].includes(reason))return 'output_limit';
 if(['max_tool_calls','max_tool_calls_exceeded'].includes(reason))return 'tool_limit';
 if([402,'insufficient_quota','insufficient_credits'].includes(reason))return 'balance';
 if([429,'rate_limit_exceeded'].includes(reason))return 'rate_limit';
 if(['no_allowed_providers','model_not_found','unsupported_tool'].includes(reason))return 'provider';
 return envelope.status==='incomplete'?'incomplete':'service';
}
export function parseSearchResponse(envelope){
 const failure=searchFailureCode(envelope);if(failure)throw Error('AI 근거 검색이 완료되지 않았습니다. 검색 도구 설정과 AI 서비스 연결을 확인하세요. [문의 코드: ai-search/'+failure+']');
 const output=Array.isArray(envelope.output)?envelope.output:[],sources=[],seen=new Set();let report='';
 for(const item of output){if(item.type!=='message')continue;for(const part of item.content||[]){if(part.type!=='output_text')continue;report+=String(part.text||'')+'\n';for(const a of part.annotations||[]){if(a.type!=='url_citation')continue;const c=a.url_citation||a,url=officialSearchUrl(c.url);if(!url||seen.has(url)||sources.length>=15)continue;seen.add(url);sources.push({url,title:String(c.title||url).slice(0,200),excerpt:String(c.content||'').slice(0,4000)});}}}
 if(!report.trim()||!sources.length)throw Error('AI 근거 검색의 공식 출처를 확보하지 못했습니다. 검색 도구 설정을 확인하거나 다시 시도하세요.');
 return {report:report.slice(0,16000),sources};
}

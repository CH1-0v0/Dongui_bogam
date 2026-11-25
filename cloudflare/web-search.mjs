import config from './web-search.json' with {type:'json'};
export function officialSearchUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&(!u.port||['80','443'].includes(u.port))&&config.domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))?u.href:'';}catch{return '';}}
export function searchPayload(model,context){return {model,instructions:config.instructions,input:JSON.stringify(context),tools:[{...config.tool,parameters:{...config.tool.parameters,allowed_domains:config.domains}}],max_tool_calls:3,max_output_tokens:4000,provider:{data_collection:'deny'}};}
export function parseSearchResponse(envelope){
 if(!envelope||envelope.error||envelope.status==='failed'||envelope.status==='incomplete')throw Error('웹 검색이 완료되지 않았습니다.');
 const output=Array.isArray(envelope.output)?envelope.output:[],sources=[],seen=new Set();let report='';
 for(const item of output){if(item.type!=='message')continue;for(const part of item.content||[]){if(part.type!=='output_text')continue;report+=String(part.text||'')+'\n';for(const a of part.annotations||[]){if(a.type!=='url_citation')continue;const c=a.url_citation||a,url=officialSearchUrl(c.url);if(!url||seen.has(url)||sources.length>=15)continue;seen.add(url);sources.push({url,title:String(c.title||url).slice(0,200),excerpt:String(c.content||'').slice(0,4000)});}}}
 if(!report.trim()||!sources.length)throw Error('공식 웹 검색 출처를 확보하지 못했습니다. 검색 도구 설정을 확인하거나 다시 시도하세요.');
 return {report:report.slice(0,16000),sources};
}

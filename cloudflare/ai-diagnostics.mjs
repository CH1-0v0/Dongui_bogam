// Inspect only known error containers. Never return provider text, keys or input values.
export function inspectAiError(parsed){
 const texts=[],paths=new Set(),codes=new Set();let remaining=160;
 const fields=new Set(['error','errors','message','detail','reason','type','code','param','parameter','loc','metadata','raw','data','cause']);
 const numericCode=value=>Number.isInteger(value)&&value>=100&&value<=99999;
 function visit(value,path='root',depth=0){
  if(depth>8||remaining--<=0)return;
  if(typeof value==='string'){
   if(value.length>16384)value=value.slice(0,16384);
   if(/[\[{]/.test(value.trim()[0]||'')){try{visit(JSON.parse(value),path+'.json',depth+1);return;}catch{}}
   if(value.trim()){texts.push(value);paths.add(path);}
   return;
  }
  if(Array.isArray(value)){for(const child of value.slice(0,12))visit(child,path+'[]',depth+1);return;}
  if(!value||typeof value!=='object')return;
  for(const [key,child]of Object.entries(value)){
   if(!fields.has(key))continue;
   if(key==='code'&&numericCode(child))codes.add(child);
   if(child!==null&&child!==undefined)paths.add(path+'.'+key);
   visit(child,path+'.'+key,depth+1);
  }
 }
 visit(parsed);
 const message=texts.join(' '), reason=
 /invalid.?api.?key|invalid.*token|unauthori[sz]ed|authentication|no (?:auth|user)|user not found/i.test(message)?'auth':
 /insufficient.*(?:credit|balance)|payment required/i.test(message)?'balance':
 /context.{0,40}(?:length|limit|window)|too (?:many|long)|maximum.*token|length.*exceed/i.test(message)?'context':
 /content.?policy|content.?filter|moderation|safety.?policy/i.test(message)?'blocked':
 /data.?policy|privacy|data.?collection|zero.?data|\bzdr\b/i.test(message)?'privacy':
 /response_format|json_object|json.?schema|structured.?output/i.test(message)?'response_format':
 /reasoning|reasoning_effort/i.test(message)?'reasoning':
 /temperature/i.test(message)?'temperature':
 /max_tokens|max_completion_tokens/i.test(message)?'output_limit':
 /messages|message.*role/i.test(message)?'messages':
 /invalid.*(?:json|body)|json.*(?:invalid|parse|decode)|malformed.*(?:json|request)/i.test(message)?'invalid_json':
 /region|country|geograph/i.test(message)?'region':
 /no (?:available )?(?:provider|endpoint)|routing|endpoint.*(?:not found|unavailable)|provider.*(?:unavailable|not found)/i.test(message)?'routing':
 /model.*(?:invalid|not found|not available)|unknown.*model|model_not_found/i.test(message)?'model':
 /invalid_request|bad.?request|invalid.*request|validation|field required|missing.*required/i.test(message)?'request_validation':
 texts.length?'unrecognized_error':'missing_error_message';
 return {message,reason,shape:[...paths].slice(0,12).join(',')||'no_known_error_fields',codes:[...codes].slice(0,4)};
}

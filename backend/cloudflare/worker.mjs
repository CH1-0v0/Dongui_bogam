import {workPlan} from './assistant.mjs';
import {ApiError,LegalApi} from './legal.mjs';
const routes={
 '/api/work/plan':(api,d)=>workPlan(api,d),
 '/api/law/catalog':(api,d)=>api.catalog(d),'/api/law/count':(api,d)=>api.catalog(d,true),
 '/api/law/articles':(api,d)=>api.articles(d),'/api/law/basis':(api,d)=>api.basis(d),
 '/api/law/verify':(api,d)=>api.verify(d),'/api/law/search':(api,d)=>api.search(d),
 '/api/law/review':(api,d)=>api.review(d),'/api/law/apply':(api,d)=>api.apply(d),
 '/api/privacy/classify':(api,d)=>api.classify(d)
};
const policy={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"
};
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{...policy,'Cache-Control':'no-store',...headers}});
const cookieName='dongui-csrf';
const cookieToken=request=>request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
const validToken=t=>/^[a-f0-9]{64}$/.test(t);
const nonce=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
const aiPaths=new Set(['/api/work/plan','/api/law/search','/api/law/review','/api/privacy/classify']);
async function requestData(request,limit=24000){
 const length=Number(request.headers.get('Content-Length'));if(length>limit)throw new ApiError('요청 크기가 너무 큽니다.',413);
 let raw;const reader=request.body?.getReader();if(!reader)throw new ApiError('JSON 요청이 필요합니다.',400);let size=0,parts=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new ApiError('요청 크기가 너무 큽니다.',413);}parts.push(value);}}finally{reader.releaseLock();}const data=new Uint8Array(size);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}raw=new TextDecoder().decode(data);try{const parsed=JSON.parse(raw);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error();return parsed;}catch{throw new ApiError('JSON 객체가 필요합니다.',400);}
}
export function failureDiagnostics(error){
 const type=['TypeError','RangeError','SyntaxError','Error'].includes(error?.name)?error.name:'Error';
 const frames=String(error?.stack||'').split('\n').slice(1,4).map(line=>{const m=line.match(/at ([A-Za-z0-9_.$ ]+) .*?:(\d+):(\d+)\)?$/);return m?{fn:m[1].trim(),line:Number(m[2]),column:Number(m[3])}:{fn:'unknown'};});
 return {event:'unexpected_api_failure',type,frames};
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url),path=url.pathname;
 try{
  if(path==='/api/status'&&request.method==='GET'){
   const old=cookieToken(request),csrfToken=validToken(old)?old:nonce();
   return json({aiConfigured:Boolean(env.OPENROUTER_API_KEY),lawConfigured:Boolean(env.LAW_API_OC),demoAvailable:false,model:env.OPENROUTER_MODEL||'openai/gpt-6-luna',app:'dongui',apiVersion:8,csrfToken},200,{'Set-Cookie':`${cookieName}=${csrfToken}; Path=/; HttpOnly; SameSite=Strict${url.protocol==='https:'?'; Secure':''}`});
  }
  if(path.startsWith('/api/')){
   if(!routes[path])return json({error:'요청한 API가 없습니다.'},404);
   if(request.method!=='POST')return json({error:'POST 요청이 필요합니다.'},405,{'Allow':'POST'});
   const origin=request.headers.get('Origin'),token=cookieToken(request);
   if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(origin&&origin!==url.origin)||!validToken(token)||request.headers.get('X-CSRF-Token')!==token)return json({error:'페이지를 새로고침한 뒤 같은 사이트에서 다시 시도하세요.'},403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON 요청이 필요합니다.'},415);
   const ip=request.headers.get('CF-Connecting-IP')||'local';
   // Cloudflare's binding keeps limits outside per-request isolates; never key limits by user-supplied form data.
   if(!env.API_LIMITER||!env.AI_LIMITER)throw new ApiError('서버 요청 한도 설정을 확인하세요.',503);
   if(!(await env.API_LIMITER.limit({key:ip})).success)return json({error:'요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.'},429,{'Retry-After':'60'});
   if(aiPaths.has(path)&&!(await env.AI_LIMITER.limit({key:ip})).success)return json({error:'분당 AI 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.'},429,{'Retry-After':'60'});
   const data=await requestData(request,path==='/api/work/plan'?98304:24000);if(data.demo===true)return json({error:'운영 서버에서는 시연 모드를 사용할 수 없습니다.'},403);
   const api=new LegalApi(env,fetch,ctx,url.origin);api.preferMcp=['/api/work/plan','/api/law/search'].includes(path);
   return json(await routes[path](api,data));
  }
  // Defense in depth: even if dist/ is misbuilt, sensitive paths cannot reach the asset binding.
  const publicFile=path==='/'||['/index.html','/app.js','/style.css','/law-basis.js','/basis-rules.json','/pdf-export.js','/assistant.js','/quick-templates.js','/hwpx-template.json'].includes(path)||/^\/export-assets\/[A-Za-z0-9._-]+\.(?:js|ttf|txt)$/.test(path);
  if(!publicFile)return json({error:'요청한 파일이 없습니다.'},404);
  if(!['GET','HEAD'].includes(request.method))return json({error:'허용되지 않은 요청입니다.'},405);
  const response=await env.ASSETS.fetch(request);const headers=new Headers(response.headers);for(const [k,v]of Object.entries(policy))headers.set(k,v);if(['/', '/index.html','/app.js','/style.css','/law-basis.js','/basis-rules.json','/pdf-export.js','/assistant.js','/quick-templates.js','/hwpx-template.json'].includes(path))headers.set('Cache-Control','no-cache');return new Response(response.body,{status:response.status,headers});
 }catch(e){if(!(e instanceof ApiError))console.error(JSON.stringify(failureDiagnostics(e)));return json({error:e instanceof ApiError?e.message:'서버에서 요청을 처리하지 못했습니다. 설정과 API 연결을 확인하세요.'},e instanceof ApiError?e.status:500);}
}};

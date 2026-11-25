// Exercise native workerd fetch, not Node's fetch or an injected LegalApi mock.
const test=require('node:test'),assert=require('node:assert/strict');
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {buildSync}=require('esbuild');
const source=buildSync({entryPoints:['cloudflare/legal.mjs'],bundle:true,format:'esm',platform:'browser',write:false}).outputFiles[0].text;
test('native Workers fetch supports AI and canonical law verification without credentials leaving the origin',async()=>{
 const requests=[];
 const mf=new Miniflare(convertV4MiniflareOptions({compatibilityDate:'2026-11-01',modules:true,script:source+`
 export default {async fetch(request){const api=new LegalApi({OPENROUTER_API_KEY:'synthetic-runtime-key',LAW_API_OC:'synthetic-runtime-oc'});
 try{if(new URL(request.url).pathname==='/redirect'){await api.upstream('https://openrouter.ai/redirect',{headers:{Authorization:'Bearer synthetic-runtime-key'}});return Response.json({unexpected:true});}
 const ai=await api.ai('synthetic fixture',{});const law=await api.verify({basisCode:'contract',type:'collect'});return Response.json({ai,verified:law.verified,pipaVerified:law.pipaVerified,cite:law.cite});
 }catch(e){return Response.json({error:e.message},{status:e.status||500});}}};`,
 outboundService:async request=>{
  const u=new URL(request.url);requests.push(u.hostname+u.pathname);
  if(u.hostname==='openrouter.ai'){
   assert.equal(request.headers.get('Authorization'),'Bearer synthetic-runtime-key');
   if(u.pathname==='/redirect')return new Response(null,{status:302,headers:{Location:'https://credentials-must-not-arrive.invalid/'}});
   assert.equal(request.method,'POST');assert.equal(request.headers.get('Content-Type'),'application/json');const body=await request.json();assert.equal(body.model,'openai/gpt-6-luna');assert.ok(Number.isInteger(body.max_tokens)&&body.max_tokens>0);assert.ok(body.messages.every(m=>['system','user'].includes(m.role)&&typeof m.content==='string'));assert.equal(body.provider.data_collection,'deny');
   return Response.json({choices:[{message:{content:JSON.stringify({fixture:true})}}]});
  }
  assert.equal(u.hostname,'www.law.go.kr');assert.equal(u.searchParams.get('OC'),'synthetic-runtime-oc');assert.equal(request.headers.get('Authorization'),null);
  if(u.pathname.endsWith('lawSearch.do'))return Response.json({LawSearch:{law:{법령명한글:'개인정보 보호법',법령일련번호:'991',시행일자:'20200101',법령구분명:'법률'}}});
  assert.equal(u.searchParams.get('JO'),'001500');return Response.json({법령:{기본정보:{법령명_한글:'개인정보 보호법'},조문:{조문단위:{조문번호:'15',조문여부:'조문',조문제목:'합성',조문내용:'[합성] 조문',항:{항번호:'①',항내용:'[합성] 항',호:{호번호:'4.',호내용:'[합성] 계약'}}}}}});
 }}));
 try{
  const result=await mf.dispatchFetch('https://local.test/');assert.equal(result.status,200);assert.deepEqual(await result.json(),{ai:{fixture:true},verified:true,pipaVerified:true,cite:'개인정보 보호법 제15조 제1항 제4호'});
  const redirected=await mf.dispatchFetch('https://local.test/redirect');assert.equal(redirected.status,502);const {error}=await redirected.json();assert.match(error,/다른 주소/);assert.doesNotMatch(error,/synthetic-runtime|credentials-must-not/);assert.ok(requests.every(p=>/^(openrouter.ai|www.law.go.kr)\//.test(p)));
 }finally{await mf.dispose();}
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../frontend/app.js'),'utf8'),code=source.slice(source.indexOf('async function readApiStatus('),source.indexOf('function lawSearchDetails('));
const result=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
function context(fetch){let clock=100;const c={apiStatus:null,apiStatusExpires:0,apiStatusFlight:null,location:{protocol:'http:'},Date:{now:()=>clock},AbortSignal,fetch,apiErrorMessage:e=>e.message};vm.createContext(c);vm.runInContext(code,c);c.advance=()=>clock+=30001;return c;}
test('status reads coalesce and remain cached only for thirty seconds',async()=>{
 let calls=0;const c=context(async()=>{calls++;await Promise.resolve();return result(200,{app:'dongui',apiVersion:8,csrfToken:'token'});});
 await Promise.all([c.readApiStatus(),c.readApiStatus(),c.readApiStatus()]);assert.equal(calls,1);await c.readApiStatus();assert.equal(calls,1);c.advance();await c.readApiStatus();assert.equal(calls,2);
});
test('only an early CSRF rejection is replayed after refreshing server status',async()=>{
 let statuses=0,posts=0,completed=0;const tokens=[];
 const c=context(async(path,options)=>{if(path==='/api/status'){statuses++;return result(200,{app:'dongui',apiVersion:8,csrfToken:'token-'+statuses});}posts++;tokens.push(options.headers['X-CSRF-Token']);if(posts===1)return result(403,{error:'페이지를 새로고침한 뒤 다시 시도하세요.'});completed++;return result(200,{ok:true});});
 assert.equal((await c.lawRequest('/api/law/search',{items:[]})).ok,true);assert.equal(statuses,2);assert.equal(posts,2);assert.equal(completed,1);assert.deepEqual(tokens,['token-1','token-2']);
 let paidPosts=0;const failing=context(async path=>path==='/api/status'?result(200,{app:'dongui',apiVersion:8,csrfToken:'t'}):(paidPosts++,result(502,{error:'AI 실패'})));
 await assert.rejects(()=>failing.lawRequest('/api/law/search',{}));assert.equal(paidPosts,1);
});

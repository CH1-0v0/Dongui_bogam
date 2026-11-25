const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8'),code=source.slice(source.indexOf('function searchSummary('),source.indexOf('async function findLaws('));const ctx={};vm.createContext(ctx);vm.runInContext(code,ctx);
test('repeated search summary uses visible deduplicated count and labels the latest attempt',()=>{
 const result={summary:'확인된 근거는 총 3개입니다.',candidates:[{},{},{}],counts:{verified:3,unavailable:0,excluded:2}};
 assert.equal(ctx.searchSummary(result,3),result.summary);
 const repeated=ctx.searchSummary(result,4);assert.match(repeated,/총 4개/);assert.match(repeated,/이전 검색 결과/);assert.match(repeated,/이번 검색에서는 3개/);assert.match(repeated,/2개는 검증/);
});

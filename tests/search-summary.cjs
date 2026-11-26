const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../frontend/app.js'),'utf8'),code=source.slice(source.indexOf('function searchSummary('),source.indexOf('async function findLaws('));const ctx={};vm.createContext(ctx);vm.runInContext(code,ctx);
test('repeated search summary uses visible deduplicated count and labels the latest attempt',()=>{
 const result={summary:'검토한 근거 후보는 총 5개입니다. 이 중 적합한 근거 후보로 판단된 것은 3개입니다. 0개는 조회를 완료하지 못했고, 2개는 검증을 통과하지 못했습니다.',candidates:[{},{},{}],counts:{checked:5,verified:3,unavailable:0,excluded:2}};
 assert.equal(ctx.searchSummary(result,3),result.summary);
 const repeated=ctx.searchSummary(result,4);assert.match(repeated,/총 4개/);assert.match(repeated,/이전 검색 결과/);assert.match(repeated,/후보는 총 5개/);assert.match(repeated,/판단된 것은 3개/);assert.match(repeated,/2개는 검증/);
});

test('four reviewed candidates means two shown and two rejected',()=>{
 const result={candidates:[{},{}],counts:{checked:4,verified:2,unavailable:0,excluded:2},summary:'검토한 근거 후보는 총 4개입니다. 이 중 적합한 근거 후보로 판단된 것은 2개입니다. 0개는 조회를 완료하지 못했고, 2개는 검증을 통과하지 못했습니다.'};assert.equal(ctx.searchSummary(result,2),result.summary);
});

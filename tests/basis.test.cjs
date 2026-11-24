const test=require('node:test');const assert=require('node:assert/strict');
const p=require('../law-basis.js');const fs=require('node:fs');
const base=(basisCode='statutory',other={})=>({law:'시험법',article:'10',paragraph:'1',clause:'',basisCode,verified:true,pipaVerified:true,conditionsConfirmed:true,authorityConfirmed:true,specific:true,...other});
test('server/browser legal rules stay identical',()=>assert.deepEqual(p.rules,JSON.parse(fs.readFileSync('basis-rules.json','utf8'))));
test('no adopted authority and legacy citation alone preserve consent',()=>{assert.equal(p.notice([],'collect','general'),false);assert.equal(p.notice([{law:'시험법',article:'10'}],'collect','general'),false)});
for(const [article,paragraph,clause] of [['15','1','1'],['17','1','1'],['18','2','1'],['23','1','1'],['24','1','1'],['15','1',''],['15','','']]){
 test(`consent citation ${article}/${paragraph}/${clause} never switches to notice`,()=>assert.equal(p.notice([base('statutory',{law:'개인정보보호법',article,paragraph,clause})],'collect','general'),false));
}
test('contract purpose explicitly selected with verified PIPA reference becomes notice',()=>assert.equal(p.notice([base('contract',{law:'개인정보 보호법',article:'15',paragraph:'1',clause:'4'})],'collect','general'),true));
test('statutory collection requires verified specific law, PIPA and confirmations',()=>{
 assert.equal(p.notice([base()],'collect','general'),true);
 for(const prop of ['verified','pipaVerified','conditionsConfirmed','authorityConfirmed'])assert.equal(p.notice([base('statutory',{[prop]:false})],'collect','general'),false);
 assert.equal(p.notice([base('statutory',{law:'개인정보 보호법',article:'15',paragraph:'1',clause:'2'})],'collect','general'),false);
});
test('collection permission cannot authorize third party provision/outside use',()=>{
 assert.equal(p.notice([base()],'provide','general'),false);
 assert.equal(p.notice([base('provisionLaw')],'provide','general'),true);
 assert.equal(p.notice([base('provisionLaw')],'outside','general'),false);
 assert.equal(p.notice([base('extraLaw')],'outside','general'),true);
});
test('sensitive and identifier permissions must accompany general processing authority',()=>{
 for(const [classification,code] of [['sensitive','sensitiveLaw'],['unique','uniqueLaw'],['rnn','residentLaw']]){
  assert.equal(p.notice([base(code)],'collect',classification),false);
  assert.equal(p.notice([base()],'collect',classification),false);
  assert.equal(p.notice([base(),base(code)],'collect',classification),true);
 }
});
test('resident ID is not permitted by an unrelated checked legal basis',()=>{
 assert.equal(p.residentAllowed([base()],'collect'),false);
 assert.equal(p.residentAllowed([base('residentLaw',{specific:false})],'collect'),false);
 assert.equal(p.residentAllowed([base('residentLaw')],'collect'),true);
});

test('non-resident supplementary bases do not require resident confirmation',()=>assert.equal(p.notice([base(),base('sensitiveLaw',{specific:false})],'collect','sensitive'),true));

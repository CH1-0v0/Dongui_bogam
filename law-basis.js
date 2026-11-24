/* Shared rules: adopting a citation alone never removes consent. */
(function(root){
 const rules={
  consent:{label:'동의를 받는 경우',pipa:'개인정보 보호법 제15조 제1항 제1호',article:'15',paragraph:'1',clause:'1',contexts:['collect','marketing'],effect:'consent'},
  statutory:{label:'법령 근거 수집',pipa:'개인정보 보호법 제15조 제1항 제2호',article:'15',paragraph:'1',clause:'2',contexts:['collect'],effect:'notice',needsLaw:true},
  public:{label:'공공기관의 소관 업무 수행에 필요한 경우',pipa:'개인정보 보호법 제15조 제1항 제3호',article:'15',paragraph:'1',clause:'3',contexts:['collect'],effect:'notice',needsLaw:true},
  contract:{label:'계약 체결·이행 등을 위해 필요한 경우',pipa:'개인정보 보호법 제15조 제1항 제4호',article:'15',paragraph:'1',clause:'4',contexts:['collect'],effect:'notice'},
  provisionConsent:{label:'동의를 받아 제3자에게 제공',pipa:'개인정보 보호법 제17조 제1항 제1호',article:'17',paragraph:'1',clause:'1',contexts:['provide'],effect:'consent'},
  provisionLaw:{label:'법령에 따른 제3자 제공',pipa:'개인정보 보호법 제17조 제1항 제2호',article:'17',paragraph:'1',clause:'2',contexts:['provide'],effect:'notice',needsLaw:true},
  extraConsent:{label:'별도 동의를 받는 목적 외 이용·제공',pipa:'개인정보 보호법 제18조 제2항 제1호',article:'18',paragraph:'2',clause:'1',contexts:['extra','outside'],effect:'consent'},
  extraLaw:{label:'다른 법률의 특별한 규정에 따른 목적 외 이용·제공',pipa:'개인정보 보호법 제18조 제2항 제2호',article:'18',paragraph:'2',clause:'2',contexts:['extra','outside'],effect:'notice',needsLaw:true},
  sensitiveConsent:{label:'민감정보 별도 동의',pipa:'개인정보 보호법 제23조 제1항 제1호',article:'23',paragraph:'1',clause:'1',contexts:['collect','provide','extra','outside','marketing'],effect:'consent',supplement:'sensitive'},
  sensitiveLaw:{label:'법령에서 민감정보 처리를 요구·허용',pipa:'개인정보 보호법 제23조 제1항 제2호',article:'23',paragraph:'1',clause:'2',contexts:['collect','provide','extra','outside','marketing'],effect:'supplement',supplement:'sensitive',needsLaw:true},
  uniqueConsent:{label:'고유식별정보 별도 동의',pipa:'개인정보 보호법 제24조 제1항 제1호',article:'24',paragraph:'1',clause:'1',contexts:['collect','provide','extra','outside','marketing'],effect:'consent',supplement:'unique'},
  uniqueLaw:{label:'법령에서 고유식별정보 처리를 요구·허용',pipa:'개인정보 보호법 제24조 제1항 제2호',article:'24',paragraph:'1',clause:'2',contexts:['collect','provide','extra','outside','marketing'],effect:'supplement',supplement:'unique',needsLaw:true},
  residentLaw:{label:'주민등록번호 처리를 구체적으로 요구·허용',pipa:'개인정보 보호법 제24조의2 제1항 제1호',article:'24의2',paragraph:'1',clause:'1',contexts:['collect','provide','extra','outside'],effect:'supplement',supplement:'rnn',needsLaw:true}
 };
 const isPipa=law=>String(law).replace(/\s/g,'')==='개인정보보호법';
 const context=(key,g)=>key==='provide'&&g.outside?'outside':key;
 const consentCitation=b=>isPipa(b.law)&&(
  // An entire consent-containing article/paragraph is not an independent non-consent authority.
  (!b.clause&&['15','17','18','22','23','24'].includes(b.article))||
  (['15','17','23','24'].includes(b.article)&&b.paragraph==='1'&&b.clause==='1')||
  (b.article==='18'&&b.paragraph==='2'&&b.clause==='1')||b.article==='22'
 );
 function available(ctx,classification){return Object.entries(rules).filter(([,r])=>r.contexts.includes(ctx)&&(!r.supplement||r.supplement===classification));}
 function valid(b,ctx){
  const r=rules[b.basisCode];
  return Boolean(r&&r.contexts.includes(ctx)&&b.verified&&b.pipaVerified&&b.conditionsConfirmed&&
   !consentCitation(b)&&(!r.needsLaw||(!isPipa(b.law)&&b.authorityConfirmed)));
 }
 function notice(bases,ctx,classification){
  const usable=(bases||[]).filter(b=>valid(b,ctx));
  if(!usable.some(b=>rules[b.basisCode].effect==='notice'))return false;
  // Sensitive/identifier permissions supplement, rather than replace, the processing basis.
  if(['sensitive','unique','rnn'].includes(classification)&&!usable.some(b=>rules[b.basisCode].supplement===classification&&(classification!=='rnn'||b.specific)))return false;
  return true;
 }
 function residentAllowed(bases,ctx){return (bases||[]).some(b=>b.basisCode==='residentLaw'&&b.specific&&valid(b,ctx));}
 const api={rules,isPipa,context,consentCitation,available,notice,residentAllowed};
 if(typeof module!=='undefined')module.exports=api;
 else root.LawBasis=api;
})(globalThis);

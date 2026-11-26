/* Shared rules: adopting a citation alone never removes consent. */
(function(root){
 const rules={
  consent:{label:'동의를 받는 경우',pipa:'개인정보 보호법 제15조 제1항 제1호',article:'15',paragraph:'1',clause:'1',contexts:['collect','marketing'],effect:'consent'},
  statutory:{label:'법령 근거 수집',pipa:'개인정보 보호법 제15조 제1항 제2호',article:'15',paragraph:'1',clause:'2',contexts:['collect'],effect:'notice',needsLaw:true},
  public:{label:'공공기관의 소관 업무 수행에 필요한 경우',pipa:'개인정보 보호법 제15조 제1항 제3호',article:'15',paragraph:'1',clause:'3',contexts:['collect'],effect:'notice',needsLaw:true},
  contract:{label:'계약 체결·이행 등을 위해 필요한 경우',pipa:'개인정보 보호법 제15조 제1항 제4호',article:'15',paragraph:'1',clause:'4',contexts:['collect'],effect:'notice'},
  provisionConsent:{label:'동의를 받아 제3자에게 제공',pipa:'개인정보 보호법 제17조 제1항 제1호',article:'17',paragraph:'1',clause:'1',contexts:['provide'],effect:'consent'},
  provisionLaw:{support:{article:'15',paragraph:'1',clause:'2'},label:'법령에 따른 제3자 제공',pipa:'개인정보 보호법 제17조 제1항 제2호',article:'17',paragraph:'1',clause:'2',contexts:['provide'],effect:'notice',needsLaw:true},
  extraConsent:{label:'별도 동의를 받는 목적 외 이용·제공',pipa:'개인정보 보호법 제18조 제2항 제1호',article:'18',paragraph:'2',clause:'1',contexts:['extra','outside'],effect:'consent'},
  extraLaw:{label:'다른 법률의 특별한 규정에 따른 목적 외 이용·제공',pipa:'개인정보 보호법 제18조 제2항 제2호',article:'18',paragraph:'2',clause:'2',contexts:['extra','outside'],effect:'notice',needsLaw:true},
  sensitiveConsent:{label:'민감정보 별도 동의',pipa:'개인정보 보호법 제23조 제1항 제1호',article:'23',paragraph:'1',clause:'1',contexts:['collect','provide','extra','outside','marketing'],effect:'consent',supplement:'sensitive'},
  sensitiveLaw:{label:'법령에서 민감정보 처리를 요구·허용',pipa:'개인정보 보호법 제23조 제1항 제2호',article:'23',paragraph:'1',clause:'2',contexts:['collect','provide','extra','outside','marketing'],effect:'supplement',supplement:'sensitive',needsLaw:true},
  uniqueConsent:{label:'고유식별정보 별도 동의',pipa:'개인정보 보호법 제24조 제1항 제1호',article:'24',paragraph:'1',clause:'1',contexts:['collect','provide','extra','outside','marketing'],effect:'consent',supplement:'unique'},
  uniqueLaw:{label:'법령에서 고유식별정보 처리를 요구·허용',pipa:'개인정보 보호법 제24조 제1항 제2호',article:'24',paragraph:'1',clause:'2',contexts:['collect','provide','extra','outside','marketing'],effect:'supplement',supplement:'unique',needsLaw:true},
  residentLaw:{label:'주민등록번호 처리를 구체적으로 요구·허용',pipa:'개인정보 보호법 제24조의2 제1항 제1호',article:'24의2',paragraph:'1',clause:'1',contexts:['collect','provide','extra','outside'],effect:'supplement',supplement:'rnn',needsLaw:true}
 };
 Object.assign(rules,{
  "emergency": {
    "label": "급박한 생명·신체·재산의 이익 보호",
    "pipa": "개인정보 보호법 제15조 제1항 제5호",
    "article": "15",
    "paragraph": "1",
    "clause": "5",
    "contexts": [
      "collect"
    ],
    "effect": "notice",
    "conditionsText": "정보주체 또는 제3자의 생명·신체·재산에 급박한 위험이 있고 이 처리가 필요한지 확인했습니다."
  },
  "legitimate": {
    "label": "개인정보처리자의 정당한 이익",
    "pipa": "개인정보 보호법 제15조 제1항 제6호",
    "article": "15",
    "paragraph": "1",
    "clause": "6",
    "contexts": [
      "collect"
    ],
    "effect": "notice",
    "conditionsText": "정당한 이익이 정보주체의 권리보다 명백히 우선하고, 처리와 상당한 관련이 있으며 합리적인 범위를 넘지 않는지 확인했습니다."
  },
  "safety": {
    "label": "공중위생 등 공공의 안전·안녕을 위한 긴급 처리",
    "pipa": "개인정보 보호법 제15조 제1항 제7호",
    "article": "15",
    "paragraph": "1",
    "clause": "7",
    "contexts": [
      "collect"
    ],
    "effect": "notice",
    "conditionsText": "공중위생 등 공공의 안전·안녕을 위해 긴급히 필요한 처리인지 확인했습니다."
  },
  "provisionPublic": {
    "label": "공공기관 소관 업무에 필요한 범위의 제3자 제공",
    "pipa": "개인정보 보호법 제17조 제1항 제2호",
    "article": "17",
    "paragraph": "1",
    "clause": "2",
    "contexts": [
      "provide"
    ],
    "effect": "notice",
    "needsLaw": true,
    "support": {
      "article": "15",
      "paragraph": "1",
      "clause": "3"
    }
  },
  "provisionEmergency": {
    "label": "급박한 생명·신체·재산 보호에 필요한 제3자 제공",
    "pipa": "개인정보 보호법 제17조 제1항 제2호",
    "article": "17",
    "paragraph": "1",
    "clause": "2",
    "contexts": [
      "provide"
    ],
    "effect": "notice",
    "support": {
      "article": "15",
      "paragraph": "1",
      "clause": "5"
    },
    "conditionsText": "제15조 제1항 제5호에 따라 수집한 개인정보를 수집 목적의 범위에서 제공하며, 급박한 생명·신체·재산 보호에 필요한지 확인했습니다."
  },
  "provisionLegitimate": {
    "label": "정당한 이익에 따라 수집한 정보의 목적 내 제공",
    "pipa": "개인정보 보호법 제17조 제1항 제2호",
    "article": "17",
    "paragraph": "1",
    "clause": "2",
    "contexts": [
      "provide"
    ],
    "effect": "notice",
    "support": {
      "article": "15",
      "paragraph": "1",
      "clause": "6"
    },
    "conditionsText": "제15조 제1항 제6호의 정당한 이익 요건과 수집 목적 내 제공 요건을 모두 확인했습니다."
  },
  "provisionSafety": {
    "label": "공공의 안전·안녕을 위한 긴급 목적 내 제공",
    "pipa": "개인정보 보호법 제17조 제1항 제2호",
    "article": "17",
    "paragraph": "1",
    "clause": "2",
    "contexts": [
      "provide"
    ],
    "effect": "notice",
    "support": {
      "article": "15",
      "paragraph": "1",
      "clause": "7"
    },
    "conditionsText": "제15조 제1항 제7호에 따른 수집과 수집 목적 내 제공 요건을 모두 확인했습니다."
  },
  "compatibleUse": {
    "label": "당초 수집 목적과 합리적으로 관련된 이용",
    "pipa": "개인정보 보호법 제15조 제3항",
    "article": "15",
    "paragraph": "3",
    "clause": "",
    "contexts": [
      "collect"
    ],
    "effect": "notice",
    "conditionsText": "당초 수집 목적과의 관련성, 정보주체의 불이익 여부, 안전성 확보 조치 등 법령상 고려사항을 확인했습니다."
  },
  "compatibleProvide": {
    "label": "당초 수집 목적과 합리적으로 관련된 제공",
    "pipa": "개인정보 보호법 제17조 제4항",
    "article": "17",
    "paragraph": "4",
    "clause": "",
    "contexts": [
      "provide"
    ],
    "effect": "notice",
    "conditionsText": "당초 수집 목적과의 관련성, 정보주체의 불이익 여부, 안전성 확보 조치 등 법령상 고려사항을 확인했습니다."
  },
  "extraEmergency": {
    "label": "목적 외 이용·제공: 급박한 생명·신체·재산 보호",
    "pipa": "개인정보 보호법 제18조 제2항 제3호",
    "article": "18",
    "paragraph": "2",
    "clause": "3",
    "contexts": [
      "extra",
      "outside"
    ],
    "effect": "notice",
    "conditionsText": "목적 외 처리가 정보주체 또는 제3자의 급박한 생명·신체·재산 보호에 필요하고 부당하게 이익을 침해하지 않는지 확인했습니다."
  },
  "extraSafety": {
    "label": "목적 외 이용·제공: 긴급한 공공의 안전·안녕",
    "pipa": "개인정보 보호법 제18조 제2항 제10호",
    "article": "18",
    "paragraph": "2",
    "clause": "10",
    "contexts": [
      "extra",
      "outside"
    ],
    "effect": "notice",
    "conditionsText": "공중위생 등 공공의 안전·안녕을 위해 긴급히 필요하고 정보주체 또는 제3자의 이익을 부당하게 침해하지 않는지 확인했습니다."
  }
});
 const isPipa=law=>String(law).replace(/\s/g,'')==='개인정보보호법';
 const context=(key,g)=>key==='provide'&&g.outside?'outside':key;
 const consentCitation=b=>isPipa(b.law)&&(
  // An entire consent-containing article/paragraph is not an independent non-consent authority.
  (!b.clause&&(['15','17','23','24'].includes(b.article)&&(!b.paragraph||b.paragraph==='1')||b.article==='18'&&(!b.paragraph||b.paragraph==='2')))||
  (['15','17','23','24'].includes(b.article)&&b.paragraph==='1'&&b.clause==='1')||
  (b.article==='18'&&b.paragraph==='2'&&b.clause==='1')||b.article==='22'
 );
 function available(ctx,classification){return Object.entries(rules).filter(([,r])=>r.contexts.includes(ctx)&&(!r.supplement||r.supplement===classification));}
 function valid(b,ctx){
  const r=rules[b.basisCode];
  return Boolean(r&&r.contexts.includes(ctx)&&(!r.support||b.supportVerified)&&b.verified&&b.pipaVerified&&b.conditionsConfirmed&&
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
